using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;
using Microsoft.Xna.Framework.Content;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace StardewLocalAPI.Modules
{
    internal sealed class DialogueModule : IApiModule
    {
        private readonly IModHelper _helper;
        private readonly GameActionQueue _actions;
        private readonly IMonitor _monitor;
        private readonly DialoguePlaybackService _player;

        public DialogueModule(IModHelper helper, GameActionQueue actions, IMonitor monitor, DialoguePlaybackService player)
        {
            _helper = helper ?? throw new ArgumentNullException(nameof(helper));
            _actions = actions ?? throw new ArgumentNullException(nameof(actions));
            _monitor = monitor ?? throw new ArgumentNullException(nameof(monitor));
            _player = player ?? throw new ArgumentNullException(nameof(player));
        }

        public void Register(ApiRouter router)
        {
            if (router is null) throw new ArgumentNullException(nameof(router));

            router.Map("GET", "/api/v1/dialogue/all", GetAllDialogues);
            router.Map("POST", "/api/v1/dialogue/play", PlayDialogue);
            router.Map("POST", "/api/v1/dialogue/playAll", PlayAllDialogues);
            router.Map("POST", "/api/v1/dialogue/stop", StopDialogues);
        }
        private void GetAllDialogues(ApiContext ctx)
        {
            if (!Context.IsWorldReady)
            {
                JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                return;
            }

            var result = RunOnGameThread(() =>
            {
                var names = Utility.getAllCharacters()
                    .Where(n => n is not null)
                    .Select(n => n.Name)
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                var allLines = new List<DialogueLine>(capacity: 50_000);
                foreach (var name in names)
                    allLines.AddRange(CollectFromCharacterDialogue(name));
                allLines.AddRange(CollectFromRainy(names));
                allLines.AddRange(CollectFromMovieReactions(names));
                allLines.AddRange(CollectFromStringsLocations(names));
                allLines.AddRange(CollectFromOneSixStrings(names));
                var byChar = new Dictionary<string, List<object>>(StringComparer.OrdinalIgnoreCase);

                foreach (var line in allLines)
                {
                    if (string.IsNullOrWhiteSpace(line.Character) || string.IsNullOrWhiteSpace(line.Text))
                        continue;

                    if (!byChar.TryGetValue(line.Character, out var list))
                    {
                        list = new List<object>();
                        byChar[line.Character] = list;
                    }

                    list.Add(new
                    {
                        Character = line.Character,
                        Source = line.Source,
                        Key = line.Key,
                        Text = line.Text
                    });
                }

                return new { ok = true, dialoguesByCharacter = byChar };
            });

            JsonUtil.WriteJson(ctx.Http, 200, result);
        }

        private IEnumerable<DialogueLine> CollectFromCharacterDialogue(string name)
        {
            var asset = $"Characters/Dialogue/{name}";
            Dictionary<string, string>? dict;
            try
            {
                dict = _helper.GameContent.Load<Dictionary<string, string>>(asset);
            }
            catch
            {
                yield break;
            }

            if (dict == null || dict.Count == 0)
                yield break;

            foreach (var kvp in dict)
            {
                var key = kvp.Key ?? "";
                var raw = kvp.Value ?? "";
                if (string.IsNullOrWhiteSpace(raw)) continue;

                yield return new DialogueLine
                {
                    Character = name,
                    Source = asset,
                    Key = key,
                    Text = raw
                };
            }
        }

        private IEnumerable<DialogueLine> CollectFromRainy(List<string> names)
        {

            foreach (var asset in EnumerateLanguageAssets("Characters/Dialogue/rainy"))
            {
                Dictionary<string, string>? sheet = null;
                try { sheet = _helper.GameContent.Load<Dictionary<string, string>>(asset); }
                catch { /* ignore */ }

                if (sheet == null || sheet.Count == 0) continue;

                foreach (var name in names)
                {
                    if (!sheet.TryGetValue(name, out var raw)) continue;
                    if (string.IsNullOrWhiteSpace(raw)) continue;

                    yield return new DialogueLine
                    {
                        Character = name,
                        Source = asset,
                        Key = name,
                        Text = raw
                    };
                }


                yield break;
            }
        }

        private IEnumerable<DialogueLine> CollectFromMovieReactions(List<string> names)
        {

            Dictionary<string, string>? dict = null;
            string loadedAsset = "";
            foreach (var asset in EnumerateLanguageAssets("Strings/MovieReactions"))
            {
                try
                {
                    dict = _helper.GameContent.Load<Dictionary<string, string>>(asset);
                    loadedAsset = asset;
                    break;
                }
                catch {  }
            }

            if (dict == null || dict.Count == 0)
                yield break;

            var nameSet = new HashSet<string>(names, StringComparer.OrdinalIgnoreCase);

            foreach (var kvp in dict)
            {
                var key = kvp.Key ?? "";
                var raw = kvp.Value ?? "";
                if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(raw)) continue;

                var underscore = key.IndexOf('_');
                if (underscore <= 0) continue;

                var speaker = key.Substring(0, underscore);
                if (!nameSet.Contains(speaker)) continue;

                yield return new DialogueLine
                {
                    Character = speaker,
                    Source = loadedAsset,
                    Key = key,
                    Text = raw
                };
            }
        }

        private IEnumerable<DialogueLine> CollectFromStringsLocations(List<string> names)
        {
            Dictionary<string, string>? dict = null;
            string loadedAsset = "";

            foreach (var asset in EnumerateLanguageAssets("Strings/Locations"))
            {
                try
                {
                    dict = _helper.GameContent.Load<Dictionary<string, string>>(asset);
                    loadedAsset = asset;
                    break;
                }
                catch
                {
                    
                }
            }

            if (dict == null || dict.Count == 0)
                yield break;

            var nameSet = new HashSet<string>(names ?? new List<string>(), StringComparer.OrdinalIgnoreCase);


            var speakCmd = new Regex(
                @"^\s*speak\s+(\w+)\s+""((?:[^""\\]|\\.)*)""",
                RegexOptions.IgnoreCase | RegexOptions.Compiled);

            var namedQuote = new Regex(
                @"\b(?:textAboveHead|showTextAboveHead|drawDialogue|message|showText)\s*(\w*)\s*""((?:[^""\\]|\\.)*)""",
                RegexOptions.IgnoreCase | RegexOptions.Compiled);

            var genericQuote = new Regex(
                @"""((?:[^""\\]|\\.){4,})""",
                RegexOptions.Compiled);

            var quickQuestionPrefix = new Regex(
                @"^\s*quickQuestion\b",
                RegexOptions.IgnoreCase | RegexOptions.Compiled);

            bool LooksLikeScript(string k, string v)
            {
                if (string.IsNullOrWhiteSpace(v)) return false;
                if (!string.IsNullOrWhiteSpace(k) && k.IndexOf("_Event_", StringComparison.OrdinalIgnoreCase) >= 0) return true;
                if (v.IndexOf("/speak ", StringComparison.OrdinalIgnoreCase) >= 0) return true;
                if (v.IndexOf("/addTemporaryActor", StringComparison.OrdinalIgnoreCase) >= 0) return true;
                if (v.IndexOf("/quickQuestion", StringComparison.OrdinalIgnoreCase) >= 0) return true;
                if (v.IndexOf("/message ", StringComparison.OrdinalIgnoreCase) >= 0) return true;
                if (v.IndexOf("/end", StringComparison.OrdinalIgnoreCase) >= 0 && v.Contains("/")) return true;
                return false;
            }

            string? TryKeyPrefixSpeaker(string k)
            {
                if (string.IsNullOrWhiteSpace(k)) return null;
                int us = k.IndexOf('_');
                if (us <= 0) return null;
                return k.Substring(0, us);
            }

            foreach (var kvp in dict)
            {
                var key = kvp.Key ?? "";
                var value = kvp.Value ?? "";
                if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(value))
                    continue;
                if (!LooksLikeScript(key, value))
                {
                    var speaker = TryKeyPrefixSpeaker(key);
                    if (string.IsNullOrWhiteSpace(speaker) || !nameSet.Contains(speaker))
                        continue;

                    yield return new DialogueLine
                    {
                        Character = speaker,
                        Source = loadedAsset,
                        Key = key,
                        Text = value
                    };

                    continue;
                }
                string[] commands = value.Split('/');
                string? lastSpeaker = null;
                int speakSerial = -1;

                var buffer = new List<DialogueLine>();

                void BufferEmit(string speaker, string captured)
                {
                    if (string.IsNullOrWhiteSpace(speaker)) return;
                    if (!nameSet.Contains(speaker)) return;
                    if (string.IsNullOrWhiteSpace(captured)) return;

                    speakSerial++;

                    buffer.Add(new DialogueLine
                    {
                        Character = speaker,
                        Source = loadedAsset,
                        Key = $"{key}:s{speakSerial}",
                        Text = Regex.Unescape(captured)
                    });
                }

                void ProcessCommand(string cmdRaw)
                {
                    string command = (cmdRaw ?? "").Trim();
                    if (command.Length == 0)
                        return;
                    if (quickQuestionPrefix.IsMatch(command) &&
                        command.IndexOf("(break)", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        var pieces = command.Split(new[] { "(break)" }, StringSplitOptions.None);
                        for (int i = 1; i < pieces.Length; i++)
                        {
                            string normalized = (pieces[i] ?? "").Replace('\\', '/');
                            foreach (var sub in normalized.Split('/'))
                                ProcessCommand(sub);
                        }
                        return;
                    }
                    var mSpeak = speakCmd.Match(command);
                    if (mSpeak.Success)
                    {
                        string speaker = mSpeak.Groups[1].Value;
                        string captured = mSpeak.Groups[2].Value;
                        lastSpeaker = speaker;

                        BufferEmit(speaker, captured);
                        return;
                    }
                    var mNamed = namedQuote.Match(command);
                    if (mNamed.Success)
                    {
                        string maybeSpeaker = mNamed.Groups[1].Value;
                        string captured = mNamed.Groups[2].Value;

                        if (!string.IsNullOrWhiteSpace(maybeSpeaker))
                            lastSpeaker = maybeSpeaker;

                        if (!string.IsNullOrWhiteSpace(lastSpeaker))
                            BufferEmit(lastSpeaker, captured);

                        return;
                    }
                    if (!string.IsNullOrWhiteSpace(lastSpeaker) && nameSet.Contains(lastSpeaker))
                    {
                        foreach (Match gm in genericQuote.Matches(command))
                        {
                            string captured = gm.Groups[1].Value;
                            string chunk = captured.Trim();
                            if (chunk.Length > 3 && !chunk.StartsWith("..."))
                                BufferEmit(lastSpeaker, captured);
                        }
                    }
                }

                foreach (var c in commands)
                    ProcessCommand(c);

                foreach (var line in buffer)
                    yield return line;
            }
        }
        private IEnumerable<DialogueLine> CollectFromOneSixStrings(List<string> names)
        {
            Dictionary<string, string>? dict = null;
            string loadedAsset = "";
            foreach (var asset in EnumerateLanguageAssets("Strings/1_6_Strings"))
            {
                try
                {
                    dict = _helper.GameContent.Load<Dictionary<string, string>>(asset);
                    loadedAsset = asset;
                    break;
                }
                catch {}
            }

            if (dict == null || dict.Count == 0)
                yield break;
            var aliases = names.ToDictionary(
                n => n,
                n => GetCharacterAliases(n),
                StringComparer.OrdinalIgnoreCase
            );

            bool TargetsCharacter(string key, List<string> aliasList)
            {
                if (string.IsNullOrWhiteSpace(key)) return false;

                var parts = key.Split(new[] { '_' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var rawPart in parts)
                {
                    var part = Regex.Replace(rawPart, @"\d+$", ""); // Emily2 -> Emily
                    if (aliasList.Any(a => part.Equals(a, StringComparison.OrdinalIgnoreCase)))
                        return true;
                }
                return false;
            }

            foreach (var kvp in dict)
            {
                var key = kvp.Key ?? "";
                var raw = kvp.Value ?? "";
                if (string.IsNullOrWhiteSpace(raw)) continue;

                foreach (var name in names)
                {
                    if (!TargetsCharacter(key, aliases[name])) continue;

                    yield return new DialogueLine
                    {
                        Character = name,
                        Source = loadedAsset,
                        Key = key,
                        Text = raw
                    };


                    break;
                }
            }
        }

        private static List<string> GetCharacterAliases(string characterName)
        {
            var list = new List<string> { characterName };
            if (characterName.Equals("Abigail", StringComparison.OrdinalIgnoreCase))
                list.Add("Abby");
            return list.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }

        private IEnumerable<string> EnumerateLanguageAssets(string baseAsset)
        {
            
            var lang = StardewValley.LocalizedContentManager.CurrentLanguageCode.ToString();
            if (!string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase))
                yield return $"{baseAsset}.{lang}";

            yield return baseAsset;
        }

        private sealed class DialogueLine
        {
            public string Character { get; set; } = "";
            public string Source { get; set; } = "";
            public string Key { get; set; } = "";
            public string Text { get; set; } = "";
        }



        private IEnumerable<DialogueLine> CollectFromFestivals(List<string> names)
        {
            var festivalIds = new[]
            {
        "spring13", "spring24",
        "summer11", "summer28",
        "fall16", "fall27",
        "winter8", "winter25"
    };

            var nameSet = new HashSet<string>(names, StringComparer.OrdinalIgnoreCase);
            var speakCmd = new Regex(@"^\s*speak\s+(\w+)\s+""((?:[^""\\]|\\.)*)""", RegexOptions.IgnoreCase | RegexOptions.Compiled);
            var namedQuote = new Regex(@"\b(?:textAboveHead|showTextAboveHead|drawDialogue|message|showText)\s*(\w*)\s*""((?:[^""\\]|\\.)*)""",
                RegexOptions.IgnoreCase | RegexOptions.Compiled);
            var genericQuote = new Regex(@"""((?:[^""\\]|\\.){4,})""", RegexOptions.Compiled);

            foreach (var festId in festivalIds)
            {
                Dictionary<string, string>? dict = null;
                string loadedAsset = $"Data/Festivals/{festId}";

                foreach (var asset in EnumerateLanguageAssets(loadedAsset))
                {
                    try
                    {
                        dict = _helper.GameContent.Load<Dictionary<string, string>>(asset);
                        loadedAsset = asset;
                        break;
                    }
                    catch { /* ignore */ }
                }

                if (dict == null || dict.Count == 0)
                    continue;

                foreach (var kvp in dict)
                {
                    var key = kvp.Key ?? "";
                    var value = kvp.Value ?? "";
                    if (string.IsNullOrWhiteSpace(value))
                        continue;

                    string? speakerFromKey = null;
                    {
                        var k = key;
                        int us = k.IndexOf('_');
                        var prefix = us > 0 ? k.Substring(0, us) : k;
                        if (nameSet.Contains(prefix))
                            speakerFromKey = prefix;
                    }
                    bool looksScriptLike =
                        value.IndexOf("/speak ", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        value.IndexOf("/message ", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        value.IndexOf("/textAboveHead", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        value.Contains("/");

                    if (!looksScriptLike)
                    {
                        if (!string.IsNullOrWhiteSpace(speakerFromKey))
                        {
                            yield return new DialogueLine
                            {
                                Character = speakerFromKey!,
                                Source = loadedAsset,
                                Key = key,
                                Text = value
                            };
                        }
                        continue;
                    }
                    var buffer = new List<DialogueLine>();
                    string? lastSpeaker = speakerFromKey;
                    int serial = -1;

                    void Emit(string speaker, string captured)
                    {
                        if (!nameSet.Contains(speaker)) return;
                        if (string.IsNullOrWhiteSpace(captured)) return;

                        serial++;
                        buffer.Add(new DialogueLine
                        {
                            Character = speaker,
                            Source = loadedAsset,
                            Key = $"{key}:s{serial}",
                            Text = Regex.Unescape(captured)
                        });
                    }

                    void ProcessCommand(string cmdRaw)
                    {
                        var cmd = (cmdRaw ?? "").Trim();
                        if (cmd.Length == 0) return;

                        var mSpeak = speakCmd.Match(cmd);
                        if (mSpeak.Success)
                        {
                            var speaker = mSpeak.Groups[1].Value;
                            var captured = mSpeak.Groups[2].Value;
                            lastSpeaker = speaker;
                            Emit(speaker, captured);
                            return;
                        }

                        var mNamed = namedQuote.Match(cmd);
                        if (mNamed.Success)
                        {
                            var maybeSpeaker = mNamed.Groups[1].Value;
                            var captured = mNamed.Groups[2].Value;

                            if (!string.IsNullOrWhiteSpace(maybeSpeaker))
                                lastSpeaker = maybeSpeaker;

                            if (!string.IsNullOrWhiteSpace(lastSpeaker))
                                Emit(lastSpeaker!, captured);

                            return;
                        }


                        if (!string.IsNullOrWhiteSpace(lastSpeaker) && nameSet.Contains(lastSpeaker!))
                        {
                            foreach (Match gm in genericQuote.Matches(cmd))
                            {
                                var captured = gm.Groups[1].Value;
                                var chunk = captured.Trim();
                                if (chunk.Length > 3 && !chunk.StartsWith("..."))
                                    Emit(lastSpeaker!, captured);
                            }
                        }
                    }

                    foreach (var part in value.Split('/'))
                        ProcessCommand(part);

                    foreach (var line in buffer)
                        yield return line;
                }
            }
        }

        private IEnumerable<DialogueLine> CollectFromExtraDialogue(List<string> names)
        {
            Dictionary<string, string>? dict = null;
            string loadedAsset = "Data/ExtraDialogue";

            foreach (var asset in EnumerateLanguageAssets(loadedAsset))
            {
                try
                {
                    dict = _helper.GameContent.Load<Dictionary<string, string>>(asset);
                    loadedAsset = asset;
                    break;
                }
                catch { /* ignore */ }
            }

            if (dict == null || dict.Count == 0)
                yield break;

            var nameSet = new HashSet<string>(names, StringComparer.OrdinalIgnoreCase);

            foreach (var kvp in dict)
            {
                var key = kvp.Key ?? "";
                var raw = kvp.Value ?? "";
                if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(raw))
                    continue;
                var us = key.IndexOf('_');
                var speaker = us > 0 ? key.Substring(0, us) : key;

                if (!nameSet.Contains(speaker))
                    continue;

                yield return new DialogueLine
                {
                    Character = speaker,
                    Source = loadedAsset,
                    Key = key,
                    Text = raw
                };
            }
        }

        private IEnumerable<DialogueLine> CollectFromNpcGiftTastes(List<string> names)
        {
            Dictionary<string, string>? dict = null;
            string loadedAsset = "Data/NPCGiftTastes";

            try
            {
                dict = _helper.GameContent.Load<Dictionary<string, string>>(loadedAsset);
            }
            catch
            {
                yield break;
            }

            if (dict == null || dict.Count == 0)
                yield break;

            var nameSet = new HashSet<string>(names, StringComparer.OrdinalIgnoreCase);

            foreach (var kvp in dict)
            {
                var npc = kvp.Key ?? "";
                var raw = kvp.Value ?? "";
                if (string.IsNullOrWhiteSpace(npc) || string.IsNullOrWhiteSpace(raw))
                    continue;

                if (!nameSet.Contains(npc))
                    continue;


                yield return new DialogueLine
                {
                    Character = npc,
                    Source = loadedAsset,
                    Key = npc,
                    Text = raw
                };
            }
        }

        private IEnumerable<DialogueLine> CollectFromMarriageDialogue(List<string> names)
        {

            foreach (var name in names)
            {
                var baseAsset = $"Characters/Dialogue/MarriageDialogue{name}";

                Dictionary<string, string>? dict = null;
                string loadedAsset = baseAsset;

                foreach (var asset in EnumerateLanguageAssets(baseAsset))
                {
                    try
                    {
                        dict = _helper.GameContent.Load<Dictionary<string, string>>(asset);
                        loadedAsset = asset;
                        break;
                    }
                    catch { /* ignore */ }
                }

                if (dict == null || dict.Count == 0)
                    continue;

                foreach (var kvp in dict)
                {
                    var key = kvp.Key ?? "";
                    var raw = kvp.Value ?? "";
                    if (string.IsNullOrWhiteSpace(raw))
                        continue;

                    yield return new DialogueLine
                    {
                        Character = name,
                        Source = loadedAsset,
                        Key = key,
                        Text = raw
                    };
                }
            }
        }

        private IEnumerable<DialogueLine> CollectFromEngagementDialogue(List<string> names)
        {
            Dictionary<string, string>? dict = null;
            string loadedAsset = "Data/EngagementDialogue";

            foreach (var asset in EnumerateLanguageAssets(loadedAsset))
            {
                try
                {
                    dict = _helper.GameContent.Load<Dictionary<string, string>>(asset);
                    loadedAsset = asset;
                    break;
                }
                catch { /* ignore */ }
            }

            if (dict == null || dict.Count == 0)
                yield break;

            var nameSet = new HashSet<string>(names, StringComparer.OrdinalIgnoreCase);

            foreach (var kvp in dict)
            {
                var key = kvp.Key ?? "";
                var raw = kvp.Value ?? "";
                if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(raw))
                    continue;
                var us = key.IndexOf('_');
                var speaker = us > 0 ? key.Substring(0, us) : key;

                if (!nameSet.Contains(speaker))
                    continue;

                yield return new DialogueLine
                {
                    Character = speaker,
                    Source = loadedAsset,
                    Key = key,
                    Text = raw
                };
            }
        }

        private void PlayDialogue(ApiContext ctx)
        {
            if (!Context.IsWorldReady)
            {
                JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                return;
            }

            PlayDialogueBody? body;
            try { body = ReadJsonBody<PlayDialogueBody>(ctx); }
            catch (Exception ex)
            {
                _monitor.Log($"DialogueModule: bad JSON body: {ex}", LogLevel.Warn);
                JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "bad_json" });
                return;
            }

            if (body is null || string.IsNullOrWhiteSpace(body.Character) || body.Text is null)
            {
                JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "bad_request" });
                return;
            }

            _actions.Enqueue(() =>
            {
                _player.Stop();
                _player.Enqueue(body.Character!, body.Text!);
                GameWindowFocus.FocusGameWindowSafe(_monitor, "dialogue:play");
                _player.Tick();
            });

            JsonUtil.WriteJson(ctx.Http, 200, new { ok = true });
        }

        private void PlayAllDialogues(ApiContext ctx)
        {
            if (!Context.IsWorldReady)
            {
                JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                return;
            }

            PlayAllDialogueBody? body;
            try { body = ReadJsonBody<PlayAllDialogueBody>(ctx); }
            catch (Exception ex)
            {
                _monitor.Log($"DialogueModule: bad JSON body: {ex}", LogLevel.Warn);
                JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "bad_json" });
                return;
            }

            if (body is null || string.IsNullOrWhiteSpace(body.Character) || body.Items is null)
            {
                JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "bad_request" });
                return;
            }

            var items = body.Items
                .Where(x => x != null && x.Text != null)
                .Select(x => (body.Character!, x!.Text!))
                .ToList();

            _actions.Enqueue(() =>
            {
                _player.Stop();
                _player.EnqueueMany(items);
                GameWindowFocus.FocusGameWindowSafe(_monitor, "dialogue:playAll");
            });

            JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, queued = items.Count });
        }

        private void StopDialogues(ApiContext ctx)
        {
            if (!Context.IsWorldReady)
            {
                JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                return;
            }

            _actions.Enqueue(() => _player.Stop());
            JsonUtil.WriteJson(ctx.Http, 200, new { ok = true });
        }

        private T RunOnGameThread<T>(Func<T> func, int timeoutMs = 5000)
        {
            if (func is null) throw new ArgumentNullException(nameof(func));

            var done = new System.Threading.ManualResetEventSlim(false);
            T result = default!;
            Exception? error = null;

            _actions.Enqueue(() =>
            {
                try { result = func(); }
                catch (Exception ex) { error = ex; }
                finally { done.Set(); }
            });

            if (!done.Wait(timeoutMs))
                throw new TimeoutException("Timed out waiting for game-thread dialogue query.");

            if (error != null)
                throw new Exception("Game-thread dialogue query failed.", error);

            return result;
        }

        private static T? ReadJsonBody<T>(ApiContext ctx)
        {
            using var reader = new StreamReader(ctx.Http.Request.InputStream, Encoding.UTF8, leaveOpen: true);
            var json = reader.ReadToEnd();
            if (string.IsNullOrWhiteSpace(json))
                return default;

            return JsonSerializer.Deserialize<T>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
        }

        private sealed class PlayDialogueBody
        {
            public string? Character { get; set; }
            public string? Source { get; set; }
            public string? Key { get; set; }
            public string? Text { get; set; }
        }

        private sealed class PlayAllDialogueBody
        {
            public string? Character { get; set; }
            public List<DialogueItem>? Items { get; set; }
        }

        private sealed class DialogueItem
        {
            public string? Source { get; set; }
            public string? Key { get; set; }
            public string? Text { get; set; }
        }
    }
}