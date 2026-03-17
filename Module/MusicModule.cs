using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;
using StardewValley.GameData;
using StardewValley.GameData.Locations;
using StardewValley.GameData.LocationContexts;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using Microsoft.Xna.Framework.Audio;

namespace StardewLocalAPI.Modules
{
    internal sealed class MusicModule : IApiModule
    {
        private ICue? _lastSfxCue;
        private string? _lastSfxId;

        private readonly IModHelper _helper;
        private readonly GameActionQueue _actions;
        private readonly IMonitor _monitor;

        public MusicModule(IModHelper helper, GameActionQueue actions, IMonitor monitor)
        {
            _helper = helper ?? throw new ArgumentNullException(nameof(helper));
            _actions = actions ?? throw new ArgumentNullException(nameof(actions));
            _monitor = monitor ?? throw new ArgumentNullException(nameof(monitor));
        }

        private sealed class CueListItem
        {
            public string Id { get; set; } = "";
            public string Kind { get; set; } = "Unknown";

            public string CategoryName { get; set; } = "";
            public int? CategoryIndex { get; set; }

            public bool? Looped { get; set; }
            public bool? UseReverb { get; set; }

            public bool FromAudioChanges { get; set; }
            public string AudioChangesCategory { get; set; } = "";
            public bool? AudioChangesLooped { get; set; }

            public int UsedInEventsCount { get; set; }
            public int UsedInLocationsCount { get; set; }
            public bool IsPlayingNow { get; set; }
        }

        private sealed class JukeboxTrackInfo
        {
            public string Id { get; set; } = "";
            public string DisplayName { get; set; } = "";
            public bool Available { get; set; }
            public List<string> AlternativeTrackIds { get; set; } = new();
            public bool IsDisabledBucket { get; set; }
        }

        public void Register(ApiRouter router)
        {
            if (router is null) throw new ArgumentNullException(nameof(router));
            router.Map("GET", "/api/v1/music/all", ctx =>
            {
                if (!Context.IsWorldReady)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                    return;
                }

                var result = RunOnGameThread(() =>
                {
                    var allCueNames = GetAllCueNamesBestEffort(_monitor);
                    var eventRows = BuildEventMusicRows();
                    var locationRows = BuildLocationMusicRows();

                    var usageIdx = new Dictionary<string, MusicUsage>(StringComparer.OrdinalIgnoreCase);

                    void Ensure(string id)
                    {
                        if (string.IsNullOrWhiteSpace(id))
                            return;

                        id = id.Trim();
                        if (id.Length == 0)
                            return;

                        if (!usageIdx.ContainsKey(id))
                            usageIdx[id] = new MusicUsage(id);
                    }

                    foreach (var ev in eventRows)
                    {
                        foreach (var id in ev.MusicCues)
                        {
                            Ensure(id);
                            if (usageIdx.TryGetValue(id, out var u))
                            {
                                u.UsedInEvents.Add(new MusicEventRef
                                {
                                    Location = ev.Location,
                                    EventKey = ev.EventKey,
                                    IsHeartEvent = ev.IsHeartEvent,
                                    HeartLevel = ev.HeartLevel,
                                    PreconditionsRaw = ev.PreconditionsRaw
                                });
                            }
                        }
                    }

                    foreach (var lr in locationRows)
                    {
                        if (string.IsNullOrWhiteSpace(lr.MusicId))
                            continue;

                        Ensure(lr.MusicId);
                        if (usageIdx.TryGetValue(lr.MusicId, out var u))
                        {
                            u.UsedInLocations.Add(new MusicLocationRef
                            {
                                Location = lr.Location,
                                Context = lr.Context,
                                Note = lr.Note
                            });
                        }
                    }

                    var jukeboxTracksById = LoadJukeboxTracksById();
                    string? nowPlaying = TryGetNowPlayingCueName();
                    var music = jukeboxTracksById.Values
                        .Where(track => !track.IsDisabledBucket)
                        .OrderBy(track => track.Id, StringComparer.OrdinalIgnoreCase)
                        .Select(track =>
                        {
                            Ensure(track.Id);
                            var u = usageIdx[track.Id];

                            string? playId = allCueNames.FirstOrDefault(x =>
                                string.Equals(x, track.Id, StringComparison.OrdinalIgnoreCase));

                            if (string.IsNullOrWhiteSpace(playId))
                            {
                                playId = track.AlternativeTrackIds.FirstOrDefault(alt =>
                                    allCueNames.Any(x => string.Equals(x, alt, StringComparison.OrdinalIgnoreCase)));
                            }

                            playId ??= track.Id;

                            bool isPlayingNow =
                                !string.IsNullOrWhiteSpace(nowPlaying) &&
                                (
                                    string.Equals(nowPlaying, track.Id, StringComparison.OrdinalIgnoreCase) ||
                                    string.Equals(nowPlaying, playId, StringComparison.OrdinalIgnoreCase) ||
                                    track.AlternativeTrackIds.Any(x => string.Equals(nowPlaying, x, StringComparison.OrdinalIgnoreCase))
                                );

                            return new
                            {
                                id = track.Id,                 // jukebox/catalog id
                                playId = playId,               // exact cue id for events/music play
                                displayName = track.DisplayName,
                                available = track.Available,
                                alternativeTrackIds = track.AlternativeTrackIds
                                    .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
                                    .ToList(),
                                isPlayingNow,
                                usedInEventsCount = u.UsedInEvents.Count,
                                usedInLocationsCount = u.UsedInLocations.Count,
                                usedInEvents = u.UsedInEvents,
                                usedInLocations = u.UsedInLocations
                            };
                        })
                        .ToList();

                    int locationsWithMusicId = locationRows.Count(r => !string.IsNullOrWhiteSpace(r.MusicId));

                    return new
                    {
                        ok = true,
                        nowPlaying,
                        totalMusic = music.Count,
                        music,
                        events = eventRows,
                        locations = locationRows,
                        discovery = new
                        {
                            allCuesCount = allCueNames.Count,
                            jukeboxTrackEntriesCount = jukeboxTracksById.Count,
                            musicRowsReturned = music.Count,
                            eventRowsCount = eventRows.Count,
                            locationRowsCount = locationRows.Count,
                            locationsWithMusicId
                        }
                    };
                }, timeoutMs: 25000);

                JsonUtil.WriteJson(ctx.Http, 200, result);
            });
            router.Map("GET", "/api/v1/music/by-events", ctx =>
            {
                if (!Context.IsWorldReady)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                    return;
                }

                var result = RunOnGameThread(() =>
                {
                    var rows = BuildEventMusicRows();
                    return new { ok = true, total = rows.Count, events = rows };
                }, timeoutMs: 20000);

                JsonUtil.WriteJson(ctx.Http, 200, result);
            });
            router.Map("GET", "/api/v1/music/by-locations", ctx =>
            {
                if (!Context.IsWorldReady)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                    return;
                }

                var result = RunOnGameThread(() =>
                {
                    var rows = BuildLocationMusicRows();
                    return new { ok = true, total = rows.Count, locations = rows };
                }, timeoutMs: 20000);

                JsonUtil.WriteJson(ctx.Http, 200, result);
            });
            router.Map("POST", "/api/v1/music/play", ctx =>
            {
                if (!Context.IsWorldReady)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                    return;
                }

                var doc = JsonUtil.ReadJsonBody(ctx.Http.Request, out var err);
                if (doc == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_body", details = err });
                    return;
                }

                string? id = JsonUtil.GetString(doc.RootElement, "id");
                if (string.IsNullOrWhiteSpace(id))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_id" });
                    return;
                }

                string requestedId = id.Trim();

                var playPlan = RunOnGameThread(() =>
                {
                    var allCueNames = GetAllCueNamesBestEffort(_monitor);
                    var jukeboxTracksById = LoadJukeboxTracksById();
                    var altToMainJukeboxMap = BuildAlternativeToMainTrackMap(jukeboxTracksById);

                    var candidateIds = new List<string>();
                    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                    void AddCandidate(string? value)
                    {
                        if (string.IsNullOrWhiteSpace(value))
                            return;

                        value = value.Trim();
                        if (value.Length == 0)
                            return;

                        if (seen.Add(value))
                            candidateIds.Add(value);
                    }
                    string? canonicalJukeboxId = null;
                    if (jukeboxTracksById.ContainsKey(requestedId))
                        canonicalJukeboxId = requestedId;
                    else if (altToMainJukeboxMap.TryGetValue(requestedId, out var mapped))
                        canonicalJukeboxId = mapped;

                    if (!string.IsNullOrWhiteSpace(canonicalJukeboxId) &&
                        IsValidJukeboxTrackNameLikeVanilla(canonicalJukeboxId))
                    {
                        AddCandidate(canonicalJukeboxId);
                    }
                    string? exactCaseCue = ResolveCaseInsensitive(requestedId, allCueNames);
                    AddCandidate(exactCaseCue);
                    AddCandidate(requestedId);

                    return new
                    {
                        requestedId,
                        canonicalJukeboxId,
                        candidateIds
                    };
                }, timeoutMs: 10000);

                if (playPlan.candidateIds.Count == 0)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new
                    {
                        ok = false,
                        error = "missing_id"
                    });
                    return;
                }

                _actions.Enqueue(() =>
                {
                    try
                    {
                        if (!Context.IsWorldReady)
                            return;

                        GameWindowFocus.FocusGameWindowSafe(_monitor, "music-play");

                        foreach (var candidate in playPlan.candidateIds)
                        {
                            try
                            {
                                Game1.changeMusicTrack(candidate, track_interruptable: false, MusicContext.Event);
                                Game1.updateMusic();

                                var nowPlaying = TryGetNowPlayingCueName();
                                if (!string.IsNullOrWhiteSpace(nowPlaying) &&
                                    string.Equals(nowPlaying, candidate, StringComparison.OrdinalIgnoreCase))
                                {
                                    return;
                                }
                            }
                            catch (Exception ex)
                            {
                                _monitor.Log($"MusicModule: event-style play attempt '{candidate}' failed: {ex}", LogLevel.Trace);
                            }
                            try
                            {
                                Game1.changeMusicTrack(candidate);
                                Game1.updateMusic();

                                var nowPlaying = TryGetNowPlayingCueName();
                                if (!string.IsNullOrWhiteSpace(nowPlaying) &&
                                    string.Equals(nowPlaying, candidate, StringComparison.OrdinalIgnoreCase))
                                {
                                    return;
                                }
                            }
                            catch (Exception ex)
                            {
                                _monitor.Log($"MusicModule: simple play attempt '{candidate}' failed: {ex}", LogLevel.Trace);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _monitor.Log($"MusicModule: play '{requestedId}' failed: {ex}", LogLevel.Warn);
                    }
                });

                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    id = requestedId,
                    candidateIds = playPlan.candidateIds,
                    canonicalJukeboxId = playPlan.canonicalJukeboxId
                });
            });
            router.Map("POST", "/api/v1/music/stop", ctx =>
            {
                if (!Context.IsWorldReady)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                    return;
                }

                _actions.Enqueue(() =>
                {
                    try
                    {
                        if (!Context.IsWorldReady)
                            return;

                        GameWindowFocus.FocusGameWindowSafe(_monitor, "music-stop");
                        try
                        {
                            Game1.changeMusicTrack("none", track_interruptable: false, MusicContext.Event);
                        }
                        catch
                        {
                            try
                            {
                                Game1.changeMusicTrack("none");
                            }
                            catch
                            {
                            }
                        }
                        try
                        {
                            Game1.currentSong?.Stop(AudioStopOptions.Immediate);
                        }
                        catch
                        {
                        }
                        try
                        {
                            Game1.currentSong = null;
                        }
                        catch
                        {
                        }

                        try
                        {
                            Game1.updateMusic();
                        }
                        catch
                        {
                        }
                    }
                    catch (Exception ex)
                    {
                        _monitor.Log($"MusicModule: stop failed: {ex}", LogLevel.Warn);
                    }
                });

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true });
            });
            router.Map("POST", "/api/v1/music/resume", ctx =>
            {
                if (!Context.IsWorldReady)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                    return;
                }

                _actions.Enqueue(() =>
                {
                    try
                    {
                        if (!Context.IsWorldReady)
                            return;

                        GameWindowFocus.FocusGameWindowSafe(_monitor, "music-resume");
                        Game1.updateMusic();
                    }
                    catch (Exception ex)
                    {
                        _monitor.Log($"MusicModule: resume failed: {ex}", LogLevel.Warn);
                    }
                });

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true });
            });
            router.Map("POST", "/api/v1/sfx/play", ctx =>
            {
                if (!Context.IsWorldReady)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                    return;
                }

                var doc = JsonUtil.ReadJsonBody(ctx.Http.Request, out var err);
                if (doc == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_body", details = err });
                    return;
                }

                string? id = JsonUtil.GetString(doc.RootElement, "id");
                if (string.IsNullOrWhiteSpace(id))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_id" });
                    return;
                }

                string cueId = id.Trim();

                _actions.Enqueue(() =>
                {
                    try
                    {
                        if (!Context.IsWorldReady)
                            return;

                        GameWindowFocus.FocusGameWindowSafe(_monitor, "sfx-play");

                        try
                        {
                            _lastSfxCue?.Stop(AudioStopOptions.Immediate);
                        }
                        catch { }

                        _lastSfxCue = null;
                        _lastSfxId = cueId;

                        if (Game1.soundBank != null && Game1.soundBank.Exists(cueId))
                        {
                            var cue = Game1.soundBank.GetCue(cueId);
                            _lastSfxCue = cue;
                            cue.Play();
                        }
                        else
                        {
                            Game1.playSound(cueId);
                        }
                    }
                    catch (Exception ex)
                    {
                        _monitor.Log($"MusicModule: sfx play '{cueId}' failed: {ex}", LogLevel.Warn);
                    }
                });

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, id = cueId });
            });
            router.Map("POST", "/api/v1/sfx/stop", ctx =>
            {
                if (!Context.IsWorldReady)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                    return;
                }

                _actions.Enqueue(() =>
                {
                    try
                    {
                        if (!Context.IsWorldReady)
                            return;

                        GameWindowFocus.FocusGameWindowSafe(_monitor, "sfx-stop");

                        try
                        {
                            _lastSfxCue?.Stop(AudioStopOptions.Immediate);
                        }
                        catch { }
                    }
                    catch (Exception ex)
                    {
                        _monitor.Log($"MusicModule: sfx stop failed: {ex}", LogLevel.Warn);
                    }
                });

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true });
            });
            router.Map("POST", "/api/v1/sfx/resume", ctx =>
            {
                if (!Context.IsWorldReady)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                    return;
                }

                _actions.Enqueue(() =>
                {
                    try
                    {
                        if (!Context.IsWorldReady)
                            return;

                        GameWindowFocus.FocusGameWindowSafe(_monitor, "sfx-resume");

                        if (_lastSfxCue != null)
                        {
                            try
                            {
                                _lastSfxCue.Play();
                                return;
                            }
                            catch
                            {
                            }
                        }

                        if (!string.IsNullOrWhiteSpace(_lastSfxId) && Game1.soundBank != null && Game1.soundBank.Exists(_lastSfxId))
                        {
                            var cue = Game1.soundBank.GetCue(_lastSfxId);
                            _lastSfxCue = cue;
                            cue.Play();
                            return;
                        }
                    }
                    catch (Exception ex)
                    {
                        _monitor.Log($"MusicModule: sfx resume failed: {ex}", LogLevel.Warn);
                    }
                });

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true });
            });
            router.Map("GET", "/api/v1/audio/cues/all", ctx =>
            {
                if (!Context.IsWorldReady)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                    return;
                }

                var result = RunOnGameThread(() =>
                {
                    var allCueNames = GetAllCueNamesBestEffort(_monitor);
                    var eventRows = BuildEventMusicRows();
                    var locationRows = BuildLocationMusicRows();

                    var usedAsMusic = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    foreach (var ev in eventRows)
                        foreach (var id in ev.MusicCues)
                            usedAsMusic.Add(id);

                    foreach (var lr in locationRows)
                        if (!string.IsNullOrWhiteSpace(lr.MusicId))
                            usedAsMusic.Add(lr.MusicId);

                    var audioChangesById = LoadAudioChangesByCueId();
                    var knownCategoryIndexByName = BuildKnownCategoryIndexMap(new[]
                    {
                        "Music",
                        "Ambient", "Ambience", "Ambiance",
                        "Sound", "SFX", "Effects", "Effect",
                        "UI", "Default"
                    });
                    var eventCountByCue = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                    foreach (var ev in eventRows)
                        foreach (var id in ev.MusicCues)
                            eventCountByCue[id] = eventCountByCue.TryGetValue(id, out var n) ? (n + 1) : 1;

                    var locCountByCue = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                    foreach (var lr in locationRows)
                    {
                        if (string.IsNullOrWhiteSpace(lr.MusicId)) continue;
                        var id = lr.MusicId.Trim();
                        locCountByCue[id] = locCountByCue.TryGetValue(id, out var n) ? (n + 1) : 1;
                    }

                    var nowPlaying = TryGetNowPlayingCueName();

                    var cues = new List<CueListItem>(allCueNames.Count);

                    foreach (var cue in allCueNames)
                    {
                        if (string.IsNullOrWhiteSpace(cue)) continue;
                        string id = cue.Trim();
                        if (id.Length == 0) continue;

                        var meta = GetCueMetaBestEffort(id, audioChangesById, knownCategoryIndexByName, usedAsMusic);

                        cues.Add(new CueListItem
                        {
                            Id = id,
                            Kind = meta.Kind.ToString(),
                            CategoryName = meta.CategoryName,
                            CategoryIndex = meta.CategoryIndex,
                            Looped = meta.Looped,
                            UseReverb = meta.UseReverb,
                            FromAudioChanges = meta.FromAudioChanges,
                            AudioChangesCategory = meta.AudioChangesCategory,
                            AudioChangesLooped = meta.AudioChangesLooped,
                            UsedInEventsCount = eventCountByCue.TryGetValue(id, out var ec) ? ec : 0,
                            UsedInLocationsCount = locCountByCue.TryGetValue(id, out var lc) ? lc : 0,
                            IsPlayingNow = (!string.IsNullOrWhiteSpace(nowPlaying) && string.Equals(nowPlaying, id, StringComparison.OrdinalIgnoreCase))
                        });
                    }

                    cues = cues
                        .OrderBy(x => x.Kind, StringComparer.OrdinalIgnoreCase)
                        .ThenBy(x => x.Id, StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    var counts = cues
                        .GroupBy(x => x.Kind, StringComparer.OrdinalIgnoreCase)
                        .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
                        .Select(g => new { kind = g.Key, count = g.Count() })
                        .ToList();

                    return new
                    {
                        ok = true,
                        nowPlaying,
                        total = cues.Count,
                        cues,
                        counts,
                        knownCategoryIndexByName
                    };
                }, timeoutMs: 30000);

                JsonUtil.WriteJson(ctx.Http, 200, result);
            });
            router.Map("GET", "/api/v1/audio/cues/categories", ctx =>
            {
                if (!Context.IsWorldReady)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                    return;
                }

                var result = RunOnGameThread(() =>
                {
                    var allCueNames = GetAllCueNamesBestEffort(_monitor);
                    var eventRows = BuildEventMusicRows();
                    var locationRows = BuildLocationMusicRows();

                    var usedAsMusic = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    foreach (var ev in eventRows)
                        foreach (var id in ev.MusicCues)
                            usedAsMusic.Add(id);
                    foreach (var lr in locationRows)
                        if (!string.IsNullOrWhiteSpace(lr.MusicId))
                            usedAsMusic.Add(lr.MusicId);

                    var audioChangesById = LoadAudioChangesByCueId();
                    var knownCategoryIndexByName = BuildKnownCategoryIndexMap(new[]
                    {
                        "Music",
                        "Ambient", "Ambience", "Ambiance",
                        "Sound", "SFX", "Effects", "Effect",
                        "UI", "Default"
                    });

                    var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                    foreach (var cue in allCueNames)
                    {
                        if (string.IsNullOrWhiteSpace(cue)) continue;
                        string id = cue.Trim();
                        if (id.Length == 0) continue;

                        var meta = GetCueMetaBestEffort(id, audioChangesById, knownCategoryIndexByName, usedAsMusic);
                        string key = meta.Kind.ToString();
                        counts[key] = counts.TryGetValue(key, out var n) ? (n + 1) : 1;
                    }

                    var list = counts
                        .OrderBy(kvp => kvp.Key, StringComparer.OrdinalIgnoreCase)
                        .Select(kvp => new { kind = kvp.Key, count = kvp.Value })
                        .ToList();

                    return new { ok = true, categories = list, total = allCueNames.Count, knownCategoryIndexByName };
                }, timeoutMs: 25000);

                JsonUtil.WriteJson(ctx.Http, 200, result);
            });
            router.Map("GET", "/api/v1/audio/cues/music", ctx => WriteFilteredCueList(ctx, CueKind.Music));
            router.Map("GET", "/api/v1/audio/cues/ambient", ctx => WriteFilteredCueList(ctx, CueKind.Ambience));
            router.Map("GET", "/api/v1/audio/cues/sfx", ctx => WriteFilteredCueList(ctx, CueKind.Sfx));
        }

        private void WriteFilteredCueList(ApiContext ctx, CueKind desired)
        {
            if (!Context.IsWorldReady)
            {
                JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                return;
            }

            var result = RunOnGameThread(() =>
            {
                var allCueNames = GetAllCueNamesBestEffort(_monitor);
                var eventRows = BuildEventMusicRows();
                var locationRows = BuildLocationMusicRows();

                var usedAsMusic = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var ev in eventRows)
                    foreach (var id in ev.MusicCues)
                        usedAsMusic.Add(id);
                foreach (var lr in locationRows)
                    if (!string.IsNullOrWhiteSpace(lr.MusicId))
                        usedAsMusic.Add(lr.MusicId);
                var jukeboxTracks = LoadJukeboxTracksById();
                foreach (var track in jukeboxTracks.Values)
                {
                    usedAsMusic.Add(track.Id);

                    foreach (var alt in track.AlternativeTrackIds)
                        usedAsMusic.Add(alt);
                }
                var audioChangesById = LoadAudioChangesByCueId();
                var knownCategoryIndexByName = BuildKnownCategoryIndexMap(new[]
                {
                    "Music",
                    "Ambient", "Ambience", "Ambiance",
                    "Sound", "SFX", "Effects", "Effect",
                    "UI", "Default"
                });

                var list = new List<CueListItem>();

                foreach (var cue in allCueNames)
                {
                    if (string.IsNullOrWhiteSpace(cue)) continue;
                    string id = cue.Trim();
                    if (id.Length == 0) continue;

                    var meta = GetCueMetaBestEffort(id, audioChangesById, knownCategoryIndexByName, usedAsMusic);
                    if (meta.Kind != desired)
                        continue;

                    list.Add(new CueListItem
                    {
                        Id = id,
                        Kind = meta.Kind.ToString(),
                        CategoryName = meta.CategoryName,
                        CategoryIndex = meta.CategoryIndex,
                        Looped = meta.Looped,
                        UseReverb = meta.UseReverb,
                        FromAudioChanges = meta.FromAudioChanges,
                        AudioChangesCategory = meta.AudioChangesCategory,
                        AudioChangesLooped = meta.AudioChangesLooped
                    });
                }

                list = list
                    .OrderBy(x => x.Id, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                return new { ok = true, kind = desired.ToString(), total = list.Count, cues = list, knownCategoryIndexByName };
            }, timeoutMs: 30000);

            JsonUtil.WriteJson(ctx.Http, 200, result);
        }

        private sealed class MusicUsage
        {
            public string Id { get; }
            public bool IsPlayingNow { get; set; }
            public List<MusicEventRef> UsedInEvents { get; } = new();
            public List<MusicLocationRef> UsedInLocations { get; } = new();

            public MusicUsage(string id) => Id = id;
        }

        private sealed class MusicEventRef
        {
            public string Location { get; set; } = "";
            public string EventKey { get; set; } = "";
            public bool IsHeartEvent { get; set; }
            public int? HeartLevel { get; set; }
            public string PreconditionsRaw { get; set; } = "";
        }

        private sealed class MusicLocationRef
        {
            public string Location { get; set; } = "";
            public string Context { get; set; } = "";
            public string Note { get; set; } = "";
        }

        private sealed class EventMusicRow
        {
            public string Location { get; set; } = "";
            public string EventKey { get; set; } = "";
            public string PreconditionsRaw { get; set; } = "";
            public bool IsHeartEvent { get; set; }
            public int? HeartLevel { get; set; }
            public List<string> MusicCues { get; set; } = new();
        }

        private sealed class LocationMusicRow
        {
            public string Location { get; set; } = "";
            public string Context { get; set; } = "";
            public string MusicId { get; set; } = "";
            public string Note { get; set; } = "";
        }

        private enum CueKind
        {
            Unknown = 0,
            Music = 1,
            Ambience = 2,
            Sfx = 3
        }

        private sealed class CueMeta
        {
            public CueKind Kind { get; set; } = CueKind.Unknown;

            public int? CategoryIndex { get; set; }
            public string CategoryName { get; set; } = "";

            public bool? Looped { get; set; }
            public bool? UseReverb { get; set; }

            public bool FromAudioChanges { get; set; }
            public string AudioChangesCategory { get; set; } = "";
            public bool? AudioChangesLooped { get; set; }
        }

        private Dictionary<string, JukeboxTrackInfo> LoadJukeboxTracksById()
        {
            var result = new Dictionary<string, JukeboxTrackInfo>(StringComparer.OrdinalIgnoreCase);

            try
            {
                var raw = _helper.GameContent.Load<Dictionary<string, JukeboxTrackData>>("Data/JukeboxTracks");
                if (raw == null || raw.Count == 0)
                    return result;

                foreach (var kvp in raw)
                {
                    string id = (kvp.Key ?? "").Trim();
                    if (id.Length == 0)
                        continue;

                    var data = kvp.Value;

                    result[id] = new JukeboxTrackInfo
                    {
                        Id = id,
                        DisplayName = string.IsNullOrWhiteSpace(data?.Name) ? id : data.Name.Trim(),
                        Available = data?.Available ?? !id.StartsWith("_", StringComparison.OrdinalIgnoreCase),
                        AlternativeTrackIds = data?.AlternativeTrackIds?
                            .Where(s => !string.IsNullOrWhiteSpace(s))
                            .Select(s => s.Trim())
                            .Where(s => s.Length > 0)
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .ToList()
                            ?? new List<string>(),
                        IsDisabledBucket = id.StartsWith("_", StringComparison.OrdinalIgnoreCase)
                    };
                }
            }
            catch (Exception ex)
            {
                _monitor.Log($"MusicModule: failed to load Data/JukeboxTracks: {ex}", LogLevel.Warn);
            }

            return result;
        }

        private static Dictionary<string, string> BuildAlternativeToMainTrackMap(Dictionary<string, JukeboxTrackInfo> tracksById)
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            foreach (var pair in tracksById)
            {
                var mainId = pair.Key;
                var track = pair.Value;

                if (track.AlternativeTrackIds == null)
                    continue;

                foreach (var alt in track.AlternativeTrackIds)
                {
                    if (!string.IsNullOrWhiteSpace(alt))
                        map[alt.Trim()] = mainId;
                }
            }

            return map;
        }

        private static bool IsValidJukeboxTrackNameLikeVanilla(string? name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return false;

            string lowerName = name.Trim().ToLowerInvariant();
            if (lowerName.Contains("ambience") ||
                lowerName.Contains("ambient") ||
                lowerName.Contains("bigdrums") ||
                lowerName.Contains("clubloop"))
            {
                return false;
            }

            return Game1.soundBank != null && Game1.soundBank.Exists(name.Trim());
        }


        private static string? ResolveCaseInsensitive(string requestedId, IEnumerable<string> values)
        {
            foreach (var value in values)
            {
                if (string.Equals(value, requestedId, StringComparison.OrdinalIgnoreCase))
                    return value;
            }

            return null;
        }

        private List<EventMusicRow> BuildEventMusicRows()
        {
            var rows = new List<EventMusicRow>();

            foreach (var loc in Game1.locations)
            {
                if (loc == null) continue;
                string locName = loc.NameOrUniqueName ?? loc.Name ?? "";
                if (string.IsNullOrWhiteSpace(locName)) continue;

                Dictionary<string, string> dict;
                try
                {
                    dict = _helper.GameContent.Load<Dictionary<string, string>>($"Data/Events/{locName}");
                }
                catch
                {
                    continue;
                }

                foreach (var kvp in dict)
                {
                    string eventKey = kvp.Key ?? "";
                    string script = kvp.Value ?? "";
                    if (string.IsNullOrWhiteSpace(eventKey) || string.IsNullOrWhiteSpace(script))
                        continue;

                    var cues = ExtractMusicCuesFromEventScript(script);
                    if (cues.Count == 0)
                        continue;

                    ParseHeartInfoFromEventKey(eventKey, out bool isHeart, out int? heartLevel, out string preRaw);

                    rows.Add(new EventMusicRow
                    {
                        Location = locName,
                        EventKey = eventKey,
                        PreconditionsRaw = preRaw,
                        IsHeartEvent = isHeart,
                        HeartLevel = heartLevel,
                        MusicCues = cues.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList()
                    });
                }
            }

            rows.Sort((a, b) =>
            {
                int c = string.Compare(a.Location, b.Location, StringComparison.OrdinalIgnoreCase);
                if (c != 0) return c;
                return string.Compare(a.EventKey, b.EventKey, StringComparison.OrdinalIgnoreCase);
            });

            return rows;
        }

        private List<LocationMusicRow> BuildLocationMusicRows()
        {
            var rows = new List<LocationMusicRow>();
            try
            {
                var locations = _helper.GameContent.Load<Dictionary<string, LocationData>>("Data/Locations");

                foreach (var (locName, data) in locations)
                {
                    if (string.IsNullOrWhiteSpace(locName) || data == null)
                        continue;

                    var ctxName = data.MusicContext.ToString();
                    var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                    var cues = new List<(string cue, string note)>();
                    cues.AddRange(ExtractLocationMusic(data));

                    foreach (var (cue, note) in cues)
                    {
                        if (string.IsNullOrWhiteSpace(cue)) continue;
                        string id = cue.Trim();
                        if (id.Length == 0) continue;

                        if (found.Add(id))
                        {
                            rows.Add(new LocationMusicRow
                            {
                                Location = locName,
                                Context = $"Data/Locations (MusicContext={ctxName})",
                                MusicId = id,
                                Note = note
                            });
                        }
                    }

                    if (found.Count == 0)
                    {
                        rows.Add(new LocationMusicRow
                        {
                            Location = locName,
                            Context = $"Data/Locations (MusicContext={ctxName})",
                            MusicId = "",
                            Note = "no_music_found"
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                _monitor.Log($"MusicModule: failed to load Data/Locations: {ex}", LogLevel.Warn);
            }
            try
            {
                var contexts = _helper.GameContent.Load<Dictionary<string, LocationContextData>>("Data/LocationContexts");

                foreach (var (ctxId, data) in contexts)
                {
                    if (string.IsNullOrWhiteSpace(ctxId) || data == null)
                        continue;

                    var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                    var cues = new List<(string cue, string note)>();
                    cues.AddRange(ExtractContextMusic(data));

                    foreach (var (cue, note) in cues)
                    {
                        if (string.IsNullOrWhiteSpace(cue)) continue;
                        string id = cue.Trim();
                        if (id.Length == 0) continue;

                        if (found.Add(id))
                        {
                            rows.Add(new LocationMusicRow
                            {
                                Location = "(context)",
                                Context = $"Data/LocationContexts:{ctxId}",
                                MusicId = id,
                                Note = note
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _monitor.Log($"MusicModule: failed to load Data/LocationContexts: {ex}", LogLevel.Warn);
            }

            rows.Sort((a, b) =>
            {
                int c = string.Compare(a.Location, b.Location, StringComparison.OrdinalIgnoreCase);
                if (c != 0) return c;
                c = string.Compare(a.Context, b.Context, StringComparison.OrdinalIgnoreCase);
                if (c != 0) return c;
                return string.Compare(a.MusicId, b.MusicId, StringComparison.OrdinalIgnoreCase);
            });

            return rows;
        }

        private static IEnumerable<(string cue, string note)> ExtractLocationMusic(LocationData data)
        {
            var list = new List<(string cue, string note)>();

            if (!string.IsNullOrWhiteSpace(data.MusicDefault) && !data.MusicDefault.Equals("none", StringComparison.OrdinalIgnoreCase))
                list.Add((data.MusicDefault.Trim(), "MusicDefault"));

            if (data.Music != null)
            {
                foreach (var entry in data.Music)
                {
                    if (entry == null) continue;
                    foreach (var cue in ExtractCueStringsFromEntry(entry))
                        list.Add((cue, "Music[]"));
                }
            }

            return list;
        }

        private static IEnumerable<(string cue, string note)> ExtractContextMusic(LocationContextData data)
        {
            var list = new List<(string cue, string note)>();
            foreach (var cue in ExtractCueStringsFromEntry(data))
                list.Add((cue, "LocationContext"));
            return list;
        }

        private static IEnumerable<string> ExtractCueStringsFromEntry(object entry)
        {
            var results = new List<string>();
            var t = entry.GetType();

            foreach (var p in t.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                if (!p.CanRead) continue;
                if (p.GetIndexParameters().Length != 0) continue;
                if (!LooksMusicNamed(p.Name)) continue;

                object? v = null;
                try { v = p.GetValue(entry); } catch { }

                foreach (var s in ExtractStrings(v))
                    if (IsTokenishCue(s))
                        results.Add(s);
            }

            foreach (var f in t.GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                if (!LooksMusicNamed(f.Name)) continue;

                object? v = null;
                try { v = f.GetValue(entry); } catch { }

                foreach (var s in ExtractStrings(v))
                    if (IsTokenishCue(s))
                        results.Add(s);
            }

            return results;
        }

        private static bool LooksMusicNamed(string name)
        {
            var n = name.ToLowerInvariant();
            return n.Contains("music") || n.Contains("track") || n.Contains("cue") || n.Contains("ambience") || n.Contains("ambient");
        }

        private static IEnumerable<string> ExtractStrings(object? value)
        {
            if (value == null) yield break;

            if (value is string s)
            {
                if (!string.IsNullOrWhiteSpace(s))
                    yield return s.Trim();
                yield break;
            }

            if (value is IEnumerable en && value is not string)
            {
                foreach (var item in en)
                {
                    foreach (var s2 in ExtractStrings(item))
                        yield return s2;
                }
            }
        }

        private static bool IsTokenishCue(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return false;
            if (s.Length > 80) return false;
            if (s.Any(char.IsWhiteSpace)) return false;
            if (s.Equals("none", StringComparison.OrdinalIgnoreCase)) return false;
            return true;
        }

        private static List<string> ExtractMusicCuesFromEventScript(string script)
        {
            var cues = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            if (string.IsNullOrWhiteSpace(script))
                return cues.ToList();

            var parts = script.Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0)
                return cues.ToList();


            string first = parts[0].Trim();
            if (IsTokenishCue(first) && !first.Equals("none", StringComparison.OrdinalIgnoreCase))
                cues.Add(first);


            foreach (var raw in parts)
            {
                var seg = raw.Trim();
                if (seg.Length == 0)
                    continue;

                int sp = seg.IndexOf(' ');
                string cmd = sp < 0 ? seg : seg.Substring(0, sp);

                bool isMusicCmd =
                    cmd.Equals("music", StringComparison.OrdinalIgnoreCase) ||
                    cmd.Equals("playMusic", StringComparison.OrdinalIgnoreCase) ||
                    cmd.Equals("playmusic", StringComparison.OrdinalIgnoreCase);

                if (!isMusicCmd)
                    continue;

                string arg = sp < 0 ? "" : seg.Substring(sp + 1).Trim();
                if (arg.Length == 0)
                    continue;

                if (arg.Length >= 2 && arg[0] == '"' && arg[^1] == '"')
                    arg = arg.Substring(1, arg.Length - 2);

                string cue = arg.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "";
                cue = cue.Trim();
                if (cue.Length == 0)
                    continue;

                if (!cue.Equals("none", StringComparison.OrdinalIgnoreCase))
                    cues.Add(cue);
            }

            return cues
                .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private static void ParseHeartInfoFromEventKey(string eventKey, out bool isHeartEvent, out int? heartLevel, out string preconditionsRaw)
        {
            isHeartEvent = false;
            heartLevel = null;
            preconditionsRaw = "";

            int slash = eventKey.IndexOf('/');
            if (slash < 0 || slash == eventKey.Length - 1)
                return;

            preconditionsRaw = eventKey.Substring(slash + 1).Trim();
            if (preconditionsRaw.Length == 0)
                return;

            var tokens = preconditionsRaw.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i + 2 < tokens.Length; i++)
            {
                if (!tokens[i].Equals("f", StringComparison.OrdinalIgnoreCase))
                    continue;

                if (int.TryParse(tokens[i + 2], out int hearts))
                {
                    isHeartEvent = true;
                    heartLevel = hearts;
                    return;
                }
            }
        }

        private static string? TryGetNowPlayingCueName()
        {
            try
            {
                string name = Game1.getMusicTrackName();
                if (!string.IsNullOrWhiteSpace(name) && !name.Equals("none", StringComparison.OrdinalIgnoreCase))
                    return name;

                var song = Game1.currentSong;
                return song?.Name;
            }
            catch
            {
                return null;
            }
        }

        private Dictionary<string, AudioCueData> LoadAudioChangesByCueId()
        {
            try
            {
                var raw = _helper.GameContent.Load<Dictionary<string, AudioCueData>>("Data/AudioChanges");
                var byId = new Dictionary<string, AudioCueData>(StringComparer.OrdinalIgnoreCase);

                if (raw != null)
                {
                    foreach (var kvp in raw)
                    {
                        var data = kvp.Value;
                        if (data == null) continue;
                        if (string.IsNullOrWhiteSpace(data.Id)) continue;

                        byId[data.Id.Trim()] = data;
                    }
                }

                return byId;
            }
            catch
            {
                return new Dictionary<string, AudioCueData>(StringComparer.OrdinalIgnoreCase);
            }
        }

        private static Dictionary<string, int> BuildKnownCategoryIndexMap(IEnumerable<string> categoryNames)
        {
            var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            try
            {
                if (Game1.audioEngine == null)
                    return map;

                foreach (var name in categoryNames)
                {
                    try
                    {
                        int idx = Game1.audioEngine.GetCategoryIndex(name);
                        if (idx >= 0)
                            map[name] = idx;
                    }
                    catch { }
                }
            }
            catch { }

            return map;
        }

        private static string? TryGetCategoryNameFromIndex(int categoryIndex)
        {
            try
            {
                var ae = Game1.audioEngine;
                if (ae == null) return null;

                var t = ae.GetType();
                var m = t.GetMethod("GetCategoryName", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance, null, new[] { typeof(int) }, null);
                if (m != null && m.ReturnType == typeof(string))
                {
                    var s = m.Invoke(ae, new object[] { categoryIndex }) as string;
                    if (!string.IsNullOrWhiteSpace(s))
                        return s;
                }

                object? engine = null;
                var pEngine = t.GetProperty("Engine", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                if (pEngine != null)
                    engine = pEngine.GetValue(ae);
                if (engine == null)
                {
                    var fEngine = t.GetField("Engine", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                    if (fEngine != null)
                        engine = fEngine.GetValue(ae);
                }

                if (engine != null)
                {
                    var te = engine.GetType();
                    var m2 = te.GetMethod("GetCategoryName", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance, null, new[] { typeof(int) }, null);
                    if (m2 != null && m2.ReturnType == typeof(string))
                    {
                        var s2 = m2.Invoke(engine, new object[] { categoryIndex }) as string;
                        if (!string.IsNullOrWhiteSpace(s2))
                            return s2;
                    }
                }
            }
            catch { }

            return null;
        }

        private static bool CategoryIndexMatches(Dictionary<string, int> known, string categoryName, int categoryIndex)
        {
            if (known.TryGetValue(categoryName, out int idx))
                return idx == categoryIndex;
            return false;
        }

        private CueMeta GetCueMetaBestEffort(
            string cueId,
            Dictionary<string, AudioCueData> audioChangesById,
            Dictionary<string, int> knownCategoryIndexByName,
            HashSet<string>? usedAsMusic = null)
        {
            var meta = new CueMeta();
            if (audioChangesById.TryGetValue(cueId, out var ac) && ac != null)
            {
                meta.FromAudioChanges = true;
                meta.AudioChangesCategory = ac.Category ?? "";
                meta.AudioChangesLooped = ac.Looped;

                if (!string.IsNullOrWhiteSpace(ac.Category) && ac.Category.IndexOf("music", StringComparison.OrdinalIgnoreCase) >= 0)
                    meta.Kind = CueKind.Music;
                else if (!string.IsNullOrWhiteSpace(ac.Category) &&
                         (ac.Category.IndexOf("ambient", StringComparison.OrdinalIgnoreCase) >= 0 ||
                          ac.Category.IndexOf("ambienc", StringComparison.OrdinalIgnoreCase) >= 0))
                    meta.Kind = CueKind.Ambience;
            }
            try
            {
                if (Game1.soundBank != null && Game1.soundBank.Exists(cueId))
                {
                    var def = Game1.soundBank.GetCueDefinition(cueId);
                    if (def != null)
                    {

                        meta.CategoryIndex =
                            GetIntMember(def, "categoryIndex") ??
                            GetIntMember(def, "CategoryIndex") ??
                            GetIntMember(def, "category_index") ??
                            GetIntMember(def, "category") ??
                            GetIntMember(def, "Category");

                        meta.Looped =
                            GetBoolMember(def, "looped") ??
                            GetBoolMember(def, "Looped") ??
                            GetBoolMember(def, "isLooped") ??
                            GetBoolMember(def, "IsLooped");

                        meta.UseReverb =
                            GetBoolMember(def, "useReverb") ??
                            GetBoolMember(def, "UseReverb");
                    }
                }
            }
            catch { }
            if (meta.CategoryIndex.HasValue)
            {
                var real = TryGetCategoryNameFromIndex(meta.CategoryIndex.Value);
                if (!string.IsNullOrWhiteSpace(real))
                {
                    meta.CategoryName = real!;
                }
                else
                {

                    foreach (var kvp in knownCategoryIndexByName)
                    {
                        if (kvp.Value == meta.CategoryIndex.Value)
                        {
                            meta.CategoryName = kvp.Key;
                            break;
                        }
                    }
                }
            }
            if (meta.Kind == CueKind.Unknown && meta.CategoryIndex.HasValue)
            {
                int idx = meta.CategoryIndex.Value;
                if (CategoryIndexMatches(knownCategoryIndexByName, "Music", idx))
                {
                    meta.Kind = CueKind.Music;
                }
                else if (CategoryIndexMatches(knownCategoryIndexByName, "Ambient", idx) ||
                         CategoryIndexMatches(knownCategoryIndexByName, "Ambience", idx) ||
                         CategoryIndexMatches(knownCategoryIndexByName, "Ambiance", idx))
                {
                    meta.Kind = CueKind.Ambience;
                }
            }
            if (meta.Kind == CueKind.Unknown)
            {
                if (usedAsMusic != null && usedAsMusic.Contains(cueId))
                {
                    meta.Kind = CueKind.Music;
                }
            }
            if (meta.Kind == CueKind.Unknown)
            {
                if (!string.IsNullOrWhiteSpace(meta.CategoryName) &&
                    meta.CategoryName.IndexOf("music", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    meta.Kind = CueKind.Music;
                }
                else if (!string.IsNullOrWhiteSpace(meta.CategoryName) &&
                         (meta.CategoryName.IndexOf("ambient", StringComparison.OrdinalIgnoreCase) >= 0 ||
                          meta.CategoryName.IndexOf("ambienc", StringComparison.OrdinalIgnoreCase) >= 0))
                {
                    meta.Kind = CueKind.Ambience;
                }
            }
            if (meta.Kind == CueKind.Unknown)
            {
                bool nameLooksAmbient =
                    cueId.IndexOf("ambient", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    cueId.IndexOf("ambience", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    cueId.IndexOf("ambiance", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    cueId.IndexOf("wind", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    cueId.IndexOf("rain", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    cueId.IndexOf("storm", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    cueId.IndexOf("cricket", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    cueId.IndexOf("ocean", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    cueId.IndexOf("waves", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    cueId.IndexOf("bird", StringComparison.OrdinalIgnoreCase) >= 0;

                bool looped = (meta.Looped == true) || (meta.AudioChangesLooped == true);

                if (nameLooksAmbient && looped)
                    meta.Kind = CueKind.Ambience;
                else
                    meta.Kind = CueKind.Sfx;
            }

            return meta;
        }

        private static int? GetIntMember(object target, string memberName)
        {
            try
            {
                var t = target.GetType();

                var p = t.GetProperty(memberName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                if (p != null)
                {
                    var v = p.GetValue(target);
                    if (v == null) return null;

                    if (v is int i) return i;
                    if (v is IConvertible) return Convert.ToInt32(v);
                }

                var f = t.GetField(memberName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                if (f != null)
                {
                    var v = f.GetValue(target);
                    if (v == null) return null;

                    if (v is int i) return i;
                    if (v is IConvertible) return Convert.ToInt32(v);
                }
            }
            catch { }

            return null;
        }

        private static bool? GetBoolMember(object target, string memberName)
        {
            try
            {
                var t = target.GetType();

                var p = t.GetProperty(memberName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                if (p != null)
                {
                    var v = p.GetValue(target);
                    if (v == null) return null;

                    if (v is bool b) return b;
                    if (v is IConvertible) return Convert.ToBoolean(v);
                }

                var f = t.GetField(memberName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                if (f != null)
                {
                    var v = f.GetValue(target);
                    if (v == null) return null;

                    if (v is bool b) return b;
                    if (v is IConvertible) return Convert.ToBoolean(v);
                }
            }
            catch { }

            return null;
        }
        private T RunOnGameThread<T>(Func<T> func, int timeoutMs = 5000)
        {
            if (func is null) throw new ArgumentNullException(nameof(func));

            var done = new ManualResetEventSlim(false);
            T result = default!;
            Exception? error = null;

            _actions.Enqueue(() =>
            {
                try { result = func(); }
                catch (Exception ex) { error = ex; }
                finally { done.Set(); }
            });

            if (!done.Wait(timeoutMs))
                throw new TimeoutException("Timed out waiting for game-thread music query.");

            if (error != null)
                throw new Exception("Game-thread music query failed.", error);

            return result;
        }

        private static object? UnwrapSoundBank(object sb)
        {
            try
            {
                var t = sb.GetType();

                var f = t.GetField("soundBank", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
                if (f != null)
                {
                    var inner = f.GetValue(sb);
                    if (inner != null) return inner;
                }

                var p = t.GetProperty("SoundBank", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
                if (p != null)
                {
                    var inner = p.GetValue(sb);
                    if (inner != null) return inner;
                }

                foreach (var name in new[] { "Inner", "Wrapped", "Underlying", "EngineSoundBank" })
                {
                    var p2 = t.GetProperty(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
                    if (p2 != null)
                    {
                        var inner2 = p2.GetValue(sb);
                        if (inner2 != null) return inner2;
                    }

                    var f2 = t.GetField(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
                    if (f2 != null)
                    {
                        var inner2 = f2.GetValue(sb);
                        if (inner2 != null) return inner2;
                    }
                }
            }
            catch { }

            return null;
        }

        private static void CollectStringsRecursive(object? value, HashSet<string> set)
        {
            if (value == null) return;

            if (value is string s)
            {
                if (!string.IsNullOrWhiteSpace(s))
                    set.Add(s.Trim());
                return;
            }

            if (value is IEnumerable en && value is not string)
            {
                foreach (var item in en)
                    CollectStringsRecursive(item, set);
            }
        }

        private static void CollectDictKeysRecursive(object? value, HashSet<string> set)
        {
            if (value == null) return;

            if (value is IDictionary dict)
            {
                foreach (var k in dict.Keys)
                {
                    if (k is string ks && !string.IsNullOrWhiteSpace(ks))
                        set.Add(ks.Trim());
                }

                foreach (var v in dict.Values)
                    CollectDictKeysRecursive(v, set);

                return;
            }

            if (value is IEnumerable en && value is not string)
            {
                foreach (var item in en)
                    CollectDictKeysRecursive(item, set);
            }
        }

        private static void CollectCueNamesFromObject(object? obj, HashSet<string> set)
        {
            if (obj == null) return;

            try
            {
                var t = obj.GetType();
                var m = t.GetMethod("GetCueNames", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                if (m != null && m.GetParameters().Length == 0)
                {
                    var r = m.Invoke(obj, null);
                    if (r is string[] arr)
                    {
                        foreach (var s in arr)
                            if (!string.IsNullOrWhiteSpace(s))
                                set.Add(s.Trim());
                    }
                    else if (r is IEnumerable en)
                    {
                        foreach (var it in en)
                            if (it is string s && !string.IsNullOrWhiteSpace(s))
                                set.Add(s.Trim());
                    }
                }
            }
            catch { }

            try
            {
                var t = obj.GetType();
                var p = t.GetProperty("CueNames", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                if (p != null)
                {
                    var r = p.GetValue(obj);
                    if (r is IEnumerable en)
                    {
                        foreach (var it in en)
                            if (it is string s && !string.IsNullOrWhiteSpace(s))
                                set.Add(s.Trim());
                    }
                }
            }
            catch { }

            try
            {
                var t = obj.GetType();
                foreach (var f in t.GetFields(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public))
                {
                    object? v = null;
                    try { v = f.GetValue(obj); } catch { }
                    if (v == null) continue;

                    var fn = (f.Name ?? "").ToLowerInvariant();
                    if (fn.Contains("cue") || fn.Contains("cues") || fn.Contains("definitions") || fn.Contains("sound"))
                    {
                        CollectDictKeysRecursive(v, set);
                        CollectStringsRecursive(v, set);
                    }
                    else
                    {
                        CollectDictKeysRecursive(v, set);
                    }
                }

                foreach (var p in t.GetProperties(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public))
                {
                    if (!p.CanRead) continue;
                    if (p.GetIndexParameters().Length != 0) continue;

                    object? v = null;
                    try { v = p.GetValue(obj); } catch { }
                    if (v == null) continue;

                    var pn = (p.Name ?? "").ToLowerInvariant();
                    if (pn.Contains("cue") || pn.Contains("cues") || pn.Contains("definitions") || pn.Contains("sound"))
                    {
                        CollectDictKeysRecursive(v, set);
                        CollectStringsRecursive(v, set);
                    }
                }
            }
            catch { }
        }

        private static List<string> GetAllCueNamesBestEffort(IMonitor monitor)
        {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            try
            {
                var sb = Game1.soundBank;
                if (sb != null)
                {
                    CollectCueNamesFromObject(sb, set);

                    var inner = UnwrapSoundBank(sb);
                    if (inner != null && !ReferenceEquals(inner, sb))
                        CollectCueNamesFromObject(inner, set);
                }
            }
            catch (Exception ex)
            {
                monitor.Log($"MusicModule: GetAllCueNamesBestEffort failed: {ex}", LogLevel.Trace);
            }

            try
            {
                var now = TryGetNowPlayingCueName();
                if (!string.IsNullOrWhiteSpace(now))
                    set.Add(now!.Trim());
            }
            catch { }

            var list = set
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s.Trim())
                .Where(s => s.Length > 0 && s.Length <= 120)
                .OrderBy(s => s, StringComparer.OrdinalIgnoreCase)
                .ToList();

            return list;
        }
    }
}