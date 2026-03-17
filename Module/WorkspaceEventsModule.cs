using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using Microsoft.Xna.Framework;

namespace StardewLocalAPI.Modules
{
    
    
    
    
    
    
    
    internal sealed class WorkspaceEventsModule : IApiModule
    {
        private readonly IModHelper _helper;
        private readonly IMonitor _monitor;
        private readonly GameActionQueue _actions;

        public WorkspaceEventsModule(IModHelper helper, IMonitor monitor, GameActionQueue actions, WorkspaceEventsStore workspaceEventsStore)
        {
            _helper = helper ?? throw new ArgumentNullException(nameof(helper));
            _monitor = monitor ?? throw new ArgumentNullException(nameof(monitor));
            _actions = actions ?? throw new ArgumentNullException(nameof(actions));
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
            
            
            
            
            
            
            router.Map("POST", "/api/v1/events/run", ctx =>
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

                var root = doc.RootElement;

                string? locationName = JsonUtil.GetString(root, "location");
                string? eventData = JsonUtil.GetString(root, "eventData");

                static bool ReadBool(JsonElement obj, string name, bool defaultValue = false)
                {
                    if (!obj.TryGetProperty(name, out var p))
                        return defaultValue;

                    return p.ValueKind switch
                    {
                        JsonValueKind.True => true,
                        JsonValueKind.False => false,
                        JsonValueKind.String when bool.TryParse(p.GetString(), out var b) => b,
                        JsonValueKind.Number when p.TryGetInt32(out var n) => n != 0,
                        _ => defaultValue
                    };
                }

                bool warpToEventLocation = ReadBool(root, "warpToEventLocation", false);
                bool forceLocation = ReadBool(root, "forceLocation", false);

                if (string.IsNullOrWhiteSpace(eventData))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_eventData" });
                    return;
                }

                _actions.Enqueue(() =>
                {
                    try
                    {
                        GameWindowFocus.FocusGameWindowSafe(_monitor, "runEvent");

                        GameLocation? loc;

                        if (forceLocation || string.IsNullOrWhiteSpace(locationName))
                        {
                            loc = Game1.currentLocation;
                            locationName = loc?.NameOrUniqueName;
                        }
                        else
                        {
                            var ln = locationName!.Trim();
                            loc = Game1.getLocationFromName(ln)
                               ?? Game1.getLocationFromName(ln, isStructure: false);
                        }

                        if (loc == null)
                        {
                            _monitor.Log($"RunEvent: location not found: '{locationName}'", LogLevel.Warn);
                            return;
                        }

                        if (warpToEventLocation && Game1.currentLocation != loc)
                        {
                            Point arrival = GetPreferredArrivalTile(loc);
                            Game1.warpFarmer(loc.NameOrUniqueName, arrival.X, arrival.Y, false);

                            loc = Game1.currentLocation ?? loc;

                            GameWindowFocus.FocusGameWindowSafe(_monitor, "runEvent-afterWarp");
                        }

                        try
                        {
                            if (loc.currentEvent != null)
                                loc.currentEvent.exitEvent();
                        }
                        catch { }

                        var ev = new Event(eventData, Game1.player);
                        loc.startEvent(ev);

                        _monitor.Log($"RunEvent: started event in '{loc.NameOrUniqueName}'.", LogLevel.Trace);
                    }
                    catch (Exception ex)
                    {
                        _monitor.Log($"RunEvent failed: {ex}", LogLevel.Error);
                    }
                });

                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    action = "run",
                    location = locationName ?? "",
                    eventData
                });
            });

            
            
            router.Map("POST", "/api/v1/events/end", ctx =>
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
                        GameWindowFocus.FocusGameWindowSafe(_monitor, "endEvent");

                        var loc = Game1.currentLocation;
                        if (loc?.currentEvent != null)
                        {
                            loc.currentEvent.exitEvent();
                            _monitor.Log("EndEvent: exited current event.", LogLevel.Trace);
                        }
                    }
                    catch (Exception ex)
                    {
                        _monitor.Log($"EndEvent failed: {ex}", LogLevel.Error);
                    }
                });

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, action = "end" });
            });
        }
    }
}