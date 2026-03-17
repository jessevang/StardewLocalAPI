using Microsoft.Xna.Framework;
using StardewModdingAPI;
using StardewValley;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Encodings.Web;
using System.Text.Json;
using xTile.Dimensions;
using Rectangle = Microsoft.Xna.Framework.Rectangle;

namespace StardewLocalAPI.Core
{
    internal sealed class WorkspaceEventsStore
    {
        private readonly IModHelper _helper;
        private readonly IMonitor _monitor;
        private readonly GameActionQueue _actions;
        private readonly Dictionary<string, Dictionary<string, string>> _cache =
            new(StringComparer.OrdinalIgnoreCase);

        private readonly string _workspaceDir;

        private string? _pendingHudMessage;
        private bool _wasWatchingEventEnd;
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            WriteIndented = true,
            PropertyNameCaseInsensitive = true,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        };

        public WorkspaceEventsStore(IModHelper helper, IMonitor monitor, GameActionQueue actions)
        {
            _helper = helper ?? throw new ArgumentNullException(nameof(helper));
            _monitor = monitor ?? throw new ArgumentNullException(nameof(monitor));
            _actions = actions ?? throw new ArgumentNullException(nameof(actions));

            _workspaceDir = Path.Combine(_helper.DirectoryPath, "workspace", "events");
            Directory.CreateDirectory(_workspaceDir);

            LoadAll();
        }

        /* ==============================
         * Public API - Storage
         * ==============================*/

        public Dictionary<string, string> GetAllForLocation(string location)
        {
            location = NormalizeLocation(location);
            EnsureLoaded(location);
            return new Dictionary<string, string>(_cache[location], StringComparer.OrdinalIgnoreCase);
        }

        public void Upsert(string location, string eventId, string eventData)
        {
            location = NormalizeLocation(location);
            eventId = NormalizeEventId(eventId);

            EnsureLoaded(location);
            _cache[location][eventId] = eventData ?? "";
            Save(location);
        }

        public bool Delete(string location, string eventId)
        {
            location = NormalizeLocation(location);
            eventId = NormalizeEventId(eventId);

            EnsureLoaded(location);

            bool removed = _cache[location].Remove(eventId);
            if (removed)
                Save(location);

            return removed;
        }

        public int DeleteByPrefix(string location, string eventIdPrefix)
        {
            location = NormalizeLocation(location);
            eventIdPrefix = NormalizeEventId(eventIdPrefix);

            EnsureLoaded(location);

            if (string.IsNullOrWhiteSpace(eventIdPrefix))
                return 0;

            var toRemove = new List<string>();
            foreach (var key in _cache[location].Keys)
            {
                if (key.StartsWith(eventIdPrefix, StringComparison.OrdinalIgnoreCase))
                    toRemove.Add(key);
            }

            foreach (var key in toRemove)
                _cache[location].Remove(key);

            if (toRemove.Count > 0)
                Save(location);

            return toRemove.Count;
        }

        public void UpsertReplacingPrefix(string location, string eventIdPrefix, string finalEventId, string eventData)
        {
            location = NormalizeLocation(location);
            eventIdPrefix = NormalizeEventId(eventIdPrefix);
            finalEventId = NormalizeEventId(finalEventId);

            EnsureLoaded(location);

            if (!string.IsNullOrWhiteSpace(eventIdPrefix))
            {
                var toRemove = new List<string>();
                foreach (var key in _cache[location].Keys)
                {
                    if (key.StartsWith(eventIdPrefix, StringComparison.OrdinalIgnoreCase))
                        toRemove.Add(key);
                }

                foreach (var key in toRemove)
                    _cache[location].Remove(key);
            }

            _cache[location][finalEventId] = eventData ?? "";
            Save(location);
        }

        public void ClearLocation(string location)
        {
            location = NormalizeLocation(location);
            EnsureLoaded(location);

            _cache[location].Clear();
            Save(location);
        }

        /// <summary>
        /// Applies workspace overlay into a live asset dictionary.
        /// Called from AssetRequested.
        /// </summary>
        public void ApplyOverlay(string location, IDictionary<string, string> target)
        {
            location = NormalizeLocation(location);
            EnsureLoaded(location);

            foreach (var pair in _cache[location])
                target[pair.Key] = pair.Value;
        }

        public bool TryGetEvent(string location, string eventId, out string eventData)
        {
            location = NormalizeLocation(location);
            eventId = NormalizeEventId(eventId);

            EnsureLoaded(location);

            if (_cache[location].TryGetValue(eventId, out var data))
            {
                eventData = data ?? "";
                return true;
            }

            eventData = "";
            return false;
        }

        public bool ContainsEvent(string location, string eventId)
        {
            location = NormalizeLocation(location);
            eventId = NormalizeEventId(eventId);

            EnsureLoaded(location);
            return _cache[location].ContainsKey(eventId);
        }

        public List<string> GetLocations()
        {
            var list = new List<string>(_cache.Keys);
            list.Sort(StringComparer.OrdinalIgnoreCase);
            return list;
        }

        public Dictionary<string, Dictionary<string, string>> GetAllLocations()
        {
            var result = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
            foreach (var pair in _cache)
                result[pair.Key] = new Dictionary<string, string>(pair.Value, StringComparer.OrdinalIgnoreCase);
            return result;
        }

        /* ==============================
         * Public API - Runtime/Test Actions
         * ==============================*/

        public void Tick()
        {
            try
            {
                if (!Context.IsWorldReady)
                {
                    _wasWatchingEventEnd = false;
                    return;
                }

                if (Game1.CurrentEvent != null)
                {
                    _wasWatchingEventEnd = true;
                    return;
                }

                if (_wasWatchingEventEnd && !string.IsNullOrWhiteSpace(_pendingHudMessage))
                {
                    Game1.addHUDMessage(new HUDMessage(_pendingHudMessage, 2));
                    _pendingHudMessage = null;
                    _wasWatchingEventEnd = false;
                }
            }
            catch
            {
            }
        }

        public void UpsertAndQueueRetest(
            string location,
            string eventIdPrefix,
            string finalEventId,
            string eventData,
            bool resetSeen = true,
            bool warpToSafeTile = true,
            bool letAutoTrigger = true,
            string? hudMessage = null,
            params string[] additionalSeenIdsToClear)
        {
            location = NormalizeLocation(location);
            eventIdPrefix = NormalizeEventId(eventIdPrefix);
            finalEventId = NormalizeEventId(finalEventId);

            UpsertReplacingPrefix(location, eventIdPrefix, finalEventId, eventData);
            InvalidateLocationEvents(location);

            QueueRetest(location, finalEventId, resetSeen, warpToSafeTile, letAutoTrigger, hudMessage, additionalSeenIdsToClear);
        }

        public void QueueRetest(
            string location,
            string eventId,
            bool resetSeen = true,
            bool warpToSafeTile = true,
            bool letAutoTrigger = true,
            string? hudMessage = null,
            params string[] additionalSeenIdsToClear)
        {
            location = NormalizeLocation(location);
            eventId = NormalizeEventId(eventId);

            InvalidateLocationEvents(location);

            _actions.Enqueue(() =>
            {
                try
                {
                    if (!Context.IsWorldReady)
                        return;

                    ExitCurrentEventIfAny();

                    if (resetSeen)
                    {
                        ClearSeenId(eventId);

                        if (additionalSeenIdsToClear != null)
                        {
                            foreach (var seenId in additionalSeenIdsToClear)
                                ClearSeenId(seenId);
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(hudMessage))
                    {
                        _pendingHudMessage = hudMessage;
                        _wasWatchingEventEnd = false;
                    }

                    var loc = Game1.getLocationFromName(location);
                    if (loc == null)
                    {
                        _monitor.Log($"Workspace event retest skipped: location '{location}' was not found.", LogLevel.Warn);
                        return;
                    }

                    bool alreadyInTargetLocation = string.Equals(Game1.currentLocation?.NameOrUniqueName, location, StringComparison.OrdinalIgnoreCase);

                    if (alreadyInTargetLocation)
                    {
                        string tempLocation = GetRetestStagingLocation(location);
                        var tempLoc = Game1.getLocationFromName(tempLocation);
                        if (tempLoc != null)
                        {
                            var tempTile = FindSafeTile(tempLoc);
                            Game1.warpFarmer(tempLocation, tempTile.X, tempTile.Y, false);
                        }
                    }

                    loc = Game1.getLocationFromName(location);
                    if (loc == null)
                    {
                        _monitor.Log($"Workspace event retest skipped: location '{location}' was not found after staging warp.", LogLevel.Warn);
                        return;
                    }

                    if (warpToSafeTile)
                    {
                        var safe = FindSafeTile(loc);
                        Game1.warpFarmer(location, safe.X, safe.Y, false);
                    }
                    else if (!string.Equals(Game1.currentLocation?.NameOrUniqueName, location, StringComparison.OrdinalIgnoreCase))
                    {
                        var fallback = FindSafeTile(loc);
                        Game1.warpFarmer(location, fallback.X, fallback.Y, false);
                    }


                    GameWindowFocus.FocusGameWindowSafe(_monitor, "eventbuilder:after-final-warp");

                    if (letAutoTrigger)
                    {

                        _actions.Enqueue(() =>
                        {
                            try
                            {
                                if (!Context.IsWorldReady)
                                    return;

                                GameWindowFocus.FocusGameWindowSafe(_monitor, "eventbuilder:before-check");

                                _monitor.Log(
                                    $"QueueRetest delayed checkForEvents at location={Game1.currentLocation?.NameOrUniqueName}",
                                    LogLevel.Trace
                                );

                                TryCheckForEvents();
                            }
                            catch (Exception ex)
                            {
                                _monitor.Log($"Delayed event check failed: {ex}", LogLevel.Warn);
                            }
                        });
                    }
                }
                catch (Exception ex)
                {
                    _monitor.Log($"Workspace event retest failed for {location}/{eventId}: {ex}", LogLevel.Warn);
                }
            });
        }

        public void QueueResetSeen(params string[] eventIds)
        {
            if (eventIds == null || eventIds.Length == 0)
                return;

            _actions.Enqueue(() =>
            {
                try
                {
                    if (!Context.IsWorldReady)
                        return;

                    foreach (var raw in eventIds)
                        ClearSeenId(raw);
                }
                catch (Exception ex)
                {
                    _monitor.Log($"Workspace event seen reset failed: {ex}", LogLevel.Warn);
                }
            });
        }

        public void InvalidateLocationEvents(string location)
        {
            location = NormalizeLocation(location);

            try
            {
                _helper.GameContent.InvalidateCache($"Data/Events/{location}");
            }
            catch (Exception ex)
            {
                _monitor.Log($"Failed invalidating Data/Events/{location}: {ex}", LogLevel.Warn);
            }
        }

        /* ==============================
         * Internal Helpers - Storage
         * ==============================*/

        private static string GetRetestStagingLocation(string targetLocation)
        {
            if (!string.Equals(targetLocation, "BusStop", StringComparison.OrdinalIgnoreCase))
                return "BusStop";

            if (!string.Equals(targetLocation, "Farm", StringComparison.OrdinalIgnoreCase))
                return "Farm";

            return "Town";
        }

        private void LoadAll()
        {
            foreach (var file in Directory.GetFiles(_workspaceDir, "*.json"))
            {
                string location = Path.GetFileNameWithoutExtension(file).Trim();

                try
                {
                    string json = File.ReadAllText(file);

                    var data = JsonSerializer.Deserialize<Dictionary<string, string>>(json, JsonOptions)
                               ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

                    _cache[NormalizeLocation(location)] =
                        new Dictionary<string, string>(data, StringComparer.OrdinalIgnoreCase);
                }
                catch (Exception ex)
                {
                    _monitor.Log($"Failed loading workspace events for {location}: {ex}", LogLevel.Warn);
                }
            }
        }

        private void EnsureLoaded(string location)
        {
            location = NormalizeLocation(location);

            if (_cache.ContainsKey(location))
                return;

            _cache[location] = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        private void Save(string location)
        {
            location = NormalizeLocation(location);

            try
            {
                string filePath = GetFilePath(location);
                string json = JsonSerializer.Serialize(_cache[location], JsonOptions);
                File.WriteAllText(filePath, json);
            }
            catch (Exception ex)
            {
                _monitor.Log($"Failed saving workspace events for {location}: {ex}", LogLevel.Warn);
            }
        }

        private string GetFilePath(string location)
        {
            location = NormalizeLocation(location);
            return Path.Combine(_workspaceDir, $"{location}.json");
        }

        private static string NormalizeLocation(string location)
        {
            location = (location ?? "").Trim();
            return string.IsNullOrWhiteSpace(location) ? "Unknown" : location;
        }

        private static string NormalizeEventId(string eventId)
        {
            return (eventId ?? "").Trim();
        }

        /* ==============================
         * Internal Helpers - Runtime
         * ==============================*/

        private static void ExitCurrentEventIfAny()
        {
            try
            {
                var cur = Game1.CurrentEvent;
                if (cur != null)
                {
                    try { cur.exitEvent(); } catch { }
                }
            }
            catch { }

            try { Game1.eventUp = false; } catch { }
            try { Game1.freezeControls = false; } catch { }
            try
            {
                if (Game1.player != null)
                    Game1.player.CanMove = true;
            }
            catch { }
        }

        private static void ClearSeenId(string? eventId)
        {
            eventId = (eventId ?? "").Trim();
            if (string.IsNullOrWhiteSpace(eventId))
                return;

            try
            {
                Game1.player?.eventsSeen?.Remove(eventId);
            }
            catch { }
        }

        private static void TryCheckForEvents()
        {
            try
            {
                var loc = Game1.currentLocation;
                if (loc == null)
                    return;

                loc.checkForEvents();
            }
            catch
            {
            }
        }

        private Point FindSafeTile(GameLocation loc)
        {
            if (loc == null)
                return new Point(0, 0);

            try
            {
                if (Game1.currentLocation == loc)
                {
                    int px = Math.Max(0, (int)Game1.player.Tile.X);
                    int py = Math.Max(0, (int)Game1.player.Tile.Y);
                    if (IsSafeTile(loc, px, py))
                        return new Point(px, py);
                }
            }
            catch { }

            int startX = 10;
            int startY = 10;

            try
            {
                startX = Math.Max(0, (int)Game1.player.Tile.X);
                startY = Math.Max(0, (int)Game1.player.Tile.Y);
            }
            catch { }

            for (int radius = 0; radius <= 30; radius++)
            {
                for (int dx = -radius; dx <= radius; dx++)
                {
                    for (int dy = -radius; dy <= radius; dy++)
                    {
                        int x = Math.Max(0, startX + dx);
                        int y = Math.Max(0, startY + dy);

                        if (IsSafeTile(loc, x, y))
                            return new Point(x, y);
                    }
                }
            }

            return new Point(0, 0);
        }

        private static bool IsSafeTile(GameLocation loc, int x, int y)
        {
            var tile = new Vector2(x, y);

            if (!loc.isTileOnMap(tile))
                return false;

            try
            {
                if (!loc.isTilePassable(tile))
                    return false;
            }
            catch
            {
                return false;
            }

            try
            {
                if (loc.Objects != null && loc.Objects.ContainsKey(tile))
                    return false;
            }
            catch { }

            try
            {
                if (loc.terrainFeatures != null && loc.terrainFeatures.ContainsKey(tile))
                    return false;
            }
            catch { }

            if (TileHasResourceClump(loc, x, y))
                return false;

            try
            {
                if (loc.characters != null && loc.characters.Count > 0)
                {
                    var rect = new Rectangle(x * 64, y * 64, 64, 64);
                    foreach (var ch in loc.characters)
                    {
                        if (ch != null && ch.GetBoundingBox().Intersects(rect))
                            return false;
                    }
                }
            }
            catch { }

            try
            {
                if (loc.isTileOccupiedByFarmer(tile) != null)
                    return false;
            }
            catch { }

            return true;
        }

        private static bool TileHasResourceClump(GameLocation loc, int x, int y)
        {
            try
            {
                if (loc.resourceClumps == null || loc.resourceClumps.Count == 0)
                    return false;

                var tileRect = new Rectangle(x * 64, y * 64, 64, 64);

                foreach (var clump in loc.resourceClumps)
                {
                    if (clump == null)
                        continue;

                    try
                    {
                        if (clump.getBoundingBox().Intersects(tileRect))
                            return true;
                    }
                    catch { }
                }
            }
            catch { }

            return false;
        }
    }
}