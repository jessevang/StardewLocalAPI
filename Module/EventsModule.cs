using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Xna.Framework;
using System.Reflection;

namespace StardewLocalAPI.Modules
{
    internal sealed class EventsModule : IApiModule
    {
        private readonly IModHelper _helper;
        private readonly GameActionQueue _actions;
        private readonly IMonitor _monitor;

        public EventsModule(IModHelper helper, GameActionQueue actions, IMonitor monitor)
        {
            _helper = helper ?? throw new ArgumentNullException(nameof(helper));
            _actions = actions ?? throw new ArgumentNullException(nameof(actions));
            _monitor = monitor ?? throw new ArgumentNullException(nameof(monitor));
        }

        private static bool TryGetMapSize(GameLocation loc, out int mapW, out int mapH)
        {
            mapW = 0;
            mapH = 0;

            try
            {
                var layer = loc.Map?.Layers?.FirstOrDefault();
                if (layer != null)
                {
                    mapW = layer.LayerWidth;
                    mapH = layer.LayerHeight;
                }
            }
            catch { }

            return mapW > 0 && mapH > 0;
        }

        private static bool TileHasResourceClump(GameLocation loc, int x, int y)
        {
            try
            {
                if (loc.resourceClumps == null || loc.resourceClumps.Count == 0)
                    return false;

                int px = x * 64;
                int py = y * 64;

                foreach (var clump in loc.resourceClumps)
                {
                    if (clump != null && clump.getBoundingBox().Contains(px, py))
                        return true;
                }
            }
            catch { }

            return false;
        }

        private static bool IsSafeStandTile(GameLocation loc, int x, int y)
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

        private static HashSet<Point> BuildExitTargets(GameLocation loc)
        {
            var exits = new HashSet<Point>();

            try
            {
                if (loc.warps != null && loc.warps.Count > 0)
                {
                    foreach (var w in loc.warps)
                    {
                        var xProp = w.GetType().GetProperty("X", BindingFlags.Public | BindingFlags.Instance);
                        var yProp = w.GetType().GetProperty("Y", BindingFlags.Public | BindingFlags.Instance);
                        if (xProp == null || yProp == null)
                            continue;

                        int wx = Convert.ToInt32(xProp.GetValue(w));
                        int wy = Convert.ToInt32(yProp.GetValue(w));

                        for (int dx = -2; dx <= 2; dx++)
                            for (int dy = -2; dy <= 2; dy++)
                                exits.Add(new Point(wx + dx, wy + dy));
                    }
                }
            }
            catch { }

            return exits;
        }

        private static bool HasGoodConnectivity(GameLocation loc, Point start, HashSet<Point> exitTargets, int mapW, int mapH)
        {
            const int MAX_NODES = 3000;
            const int MIN_REGION = 250;

            var q = new Queue<Point>();
            var seen = new HashSet<Point>();

            q.Enqueue(start);
            seen.Add(start);

            int visited = 0;

            while (q.Count > 0 && visited < MAX_NODES)
            {
                var p = q.Dequeue();
                visited++;

                if (exitTargets.Count > 0 && exitTargets.Contains(p))
                    return true;

                if (p.X <= 1 || p.Y <= 1 || p.X >= mapW - 2 || p.Y >= mapH - 2)
                {
                    if (IsSafeStandTile(loc, p.X, p.Y))
                        return true;
                }

                static IEnumerable<Point> Neigh(Point a)
                {
                    yield return new Point(a.X + 1, a.Y);
                    yield return new Point(a.X - 1, a.Y);
                    yield return new Point(a.X, a.Y + 1);
                    yield return new Point(a.X, a.Y - 1);
                }

                foreach (var n in Neigh(p))
                {
                    if (n.X < 0 || n.Y < 0 || n.X >= mapW || n.Y >= mapH)
                        continue;

                    if (seen.Contains(n))
                        continue;

                    if (!IsSafeStandTile(loc, n.X, n.Y))
                        continue;

                    seen.Add(n);
                    q.Enqueue(n);
                }
            }

            return visited >= MIN_REGION;
        }

        private static Point GetPreferredArrivalTile(GameLocation loc)
        {
            if (!TryGetMapSize(loc, out int mapW, out int mapH))
                return new Point(0, 0);

            int cx = Math.Clamp(mapW / 2, 0, mapW - 1);
            int cy = Math.Clamp(mapH / 2, 0, mapH - 1);

            var exitTargets = BuildExitTargets(loc);

            int NeighborScore(int x, int y)
            {
                int s = 0;
                if (IsSafeStandTile(loc, x + 1, y)) s++;
                if (IsSafeStandTile(loc, x - 1, y)) s++;
                if (IsSafeStandTile(loc, x, y + 1)) s++;
                if (IsSafeStandTile(loc, x, y - 1)) s++;
                return s;
            }

            bool Accept(int x, int y)
            {
                if (!IsSafeStandTile(loc, x, y))
                    return false;

                return HasGoodConnectivity(loc, new Point(x, y), exitTargets, mapW, mapH);
            }

            if (Accept(cx, cy))
                return new Point(cx, cy);

            const int MAX_R = 140;

            Point best = new Point(0, 0);
            int bestScore = -1;

            for (int r = 1; r <= MAX_R; r++)
            {
                int minX = cx - r;
                int maxX = cx + r;
                int minY = cy - r;
                int maxY = cy + r;

                void Consider(int x, int y)
                {
                    if (!Accept(x, y))
                        return;

                    int sc = NeighborScore(x, y);
                    if (sc > bestScore)
                    {
                        bestScore = sc;
                        best = new Point(x, y);
                    }
                }

                for (int x = minX; x <= maxX; x++)
                {
                    Consider(x, minY);
                    Consider(x, maxY);
                }
                for (int y = minY; y <= maxY; y++)
                {
                    Consider(minX, y);
                    Consider(maxX, y);
                }

                if (bestScore >= 3)
                    return best;

                if (bestScore >= 2 && r >= 16)
                    return best;
            }

            if (bestScore >= 0)
                return best;

            return new Point(0, 0);
        }

        public void Register(ApiRouter router)
        {
            router.Map("GET", "/api/v1/events/all", ctx =>
            {
                if (!Context.IsWorldReady)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "world_not_ready" });
                    return;
                }
                var result = RunOnGameThread(() =>
                {
                    var eventsByLocation = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
                    var locations = new List<string>();

                    foreach (var loc in Game1.locations)
                    {
                        if (loc == null)
                            continue;

                        string name = loc.NameOrUniqueName ?? loc.Name ?? "";
                        if (string.IsNullOrWhiteSpace(name))
                            continue;

                        if (eventsByLocation.ContainsKey(name))
                            continue;

                        locations.Add(name);

                        try
                        {
                            var asset = $"Data/Events/{name}";
                            var dict = _helper.GameContent.Load<Dictionary<string, string>>(asset);
                            eventsByLocation[name] = new Dictionary<string, string>(dict, StringComparer.OrdinalIgnoreCase);
                        }
                        catch
                        {
                            eventsByLocation[name] = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        }
                    }

                    locations.Sort(StringComparer.OrdinalIgnoreCase);
                    int totalEvents = eventsByLocation.Values.Sum(d => d?.Count ?? 0);

                    return new
                    {
                        ok = true,
                        locations,
                        totalEvents,
                        eventsByLocation
                    };
                }, timeoutMs: 8000);

                JsonUtil.WriteJson(ctx.Http, 200, result);
            });
            router.Map("GET", "/api/v1/events/list", ctx =>
            {
                string? location = ctx.Http.Request.QueryString["location"];
                if (!Context.IsWorldReady || string.IsNullOrWhiteSpace(location))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_location_or_world_not_ready" });
                    return;
                }

                var asset = $"Data/Events/{location}";
                Dictionary<string, string> dict;
                try { dict = _helper.GameContent.Load<Dictionary<string, string>>(asset); }
                catch
                {
                    JsonUtil.WriteJson(ctx.Http, 404, new { ok = false, error = "events_asset_not_found", asset });
                    return;
                }

                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    location,
                    eventIds = dict.Keys.OrderBy(k => k).ToList()
                });
            });
            router.Map("POST", "/api/v1/events/start", ctx =>
            {
                var doc = JsonUtil.ReadJsonBody(ctx.Http.Request, out var err);
                if (doc == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_body", details = err });
                    return;
                }

                string? location = JsonUtil.GetString(doc.RootElement, "location");
                string? eventId = JsonUtil.GetString(doc.RootElement, "eventId");

                if (string.IsNullOrWhiteSpace(location) || string.IsNullOrWhiteSpace(eventId))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_location_or_eventId" });
                    return;
                }

                string locName = location.Trim();
                string key = eventId.Trim();

                _actions.Enqueue(() =>
                {
                    try
                    {
                        if (!Context.IsWorldReady)
                            return;

                        try
                        {
                            var cur = Game1.CurrentEvent;
                            if (cur != null)
                            {
                                try { cur.exitEvent(); } catch { }
                            }

                            Game1.eventUp = false;
                            Game1.freezeControls = false;
                            Game1.player.CanMove = true;
                        }
                        catch { }

                        var locObj = Game1.getLocationFromName(locName);
                        if (locObj == null)
                            return;

                        if (Game1.currentLocation?.NameOrUniqueName != locName)
                        {
                            Point arrival = GetPreferredArrivalTile(locObj);
                            Game1.warpFarmer(locName, arrival.X, arrival.Y, false);
                            locObj = Game1.currentLocation ?? locObj;
                        }

                        var dict = _helper.GameContent.Load<Dictionary<string, string>>($"Data/Events/{locName}");
                        if (!dict.TryGetValue(key, out var eventData) || string.IsNullOrWhiteSpace(eventData))
                            return;
                        GameWindowFocus.FocusGameWindowSafe();

                        var ev = new Event(eventData, key, locName);
                        locObj.startEvent(ev);
                    }
                    catch
                    {
                    }
                });

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true });
            });
            router.Map("POST", "/api/v1/events/end", ctx =>
            {
                _actions.Enqueue(() =>
                {
                    try
                    {
                        if (!Context.IsWorldReady)
                            return;


                        GameWindowFocus.FocusGameWindowSafe(_monitor, "events:end");

                        var ev = Game1.CurrentEvent;
                        if (ev != null)
                        {
                            try { ev.exitEvent(); } catch { }
                        }

                        Game1.eventUp = false;
                        Game1.freezeControls = false;
                        Game1.player.CanMove = true;
                    }
                    catch
                    {
                    }
                });

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true });
            });
        }

        private T RunOnGameThread<T>(Func<T> func, int timeoutMs = 5000)
        {
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
                throw new TimeoutException("Timed out waiting for game-thread events query.");

            if (error != null)
                throw new Exception("Game-thread events query failed.", error);

            return result;
        }

        private static class WindowFocusHelper
        {
            private static readonly bool IsWindows =
                RuntimeInformation.IsOSPlatform(OSPlatform.Windows);

            [DllImport("user32.dll")]
            private static extern bool SetForegroundWindow(IntPtr hWnd);

            [DllImport("user32.dll")]
            private static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

            private const int SW_RESTORE = 9;

            public static void FocusStardew()
            {
                if (!IsWindows)
                    return;

                try
                {
                    var proc = Process.GetCurrentProcess();
                    var handle = proc.MainWindowHandle;
                    if (handle != IntPtr.Zero)
                    {
                        ShowWindowAsync(handle, SW_RESTORE);
                        SetForegroundWindow(handle);
                    }
                }
                catch
                {
                }
            }
        }
    }
}