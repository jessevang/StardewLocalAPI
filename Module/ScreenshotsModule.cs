using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Threading;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Microsoft.Xna.Framework;


namespace StardewLocalAPI.Modules
{
    internal sealed class ScreenshotsModule : IApiModule
    {
        private readonly IModHelper _helper;
        private readonly IMonitor _monitor;
        private readonly GameActionQueue _actions;
        private readonly int _port;

        public ScreenshotsModule(IModHelper helper, IMonitor monitor, GameActionQueue actions, int port)
        {
            _helper = helper;
            _monitor = monitor;
            _actions = actions;
            _port = port;
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
            router.Map("POST", "/api/v1/screenshots/map", ctx =>
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

                float? scale = null;
                if (doc.RootElement.TryGetProperty("scale", out var scaleEl) && scaleEl.ValueKind == JsonValueKind.Number)
                {
                    if (scaleEl.TryGetSingle(out var s))
                        scale = s;
                }

                string? name = JsonUtil.GetString(doc.RootElement, "name");
                bool open = doc.RootElement.TryGetProperty("open", out var openEl) && openEl.ValueKind == JsonValueKind.True;

                string? location = JsonUtil.GetString(doc.RootElement, "location");

                using var done = new ManualResetEventSlim(false);

                string? file = null;
                string? absPath = null;
                string? error = null;

                string? stableFile = null;
                string? stableAbsPath = null;

                string? locName =
                    !string.IsNullOrWhiteSpace(location) ? location!.Trim() :
                    (Game1.currentLocation?.NameOrUniqueName ?? "Unknown");

                string folder = GetScreenshotFolderSafe();

                string desiredExt = ".png";
                if (!string.IsNullOrWhiteSpace(name))
                {
                    var extFromName = Path.GetExtension(name);
                    if (!string.IsNullOrWhiteSpace(extFromName))
                        desiredExt = extFromName;
                }

                stableFile = $"MAP_{SanitizeFilePart(locName)}{desiredExt}";
                stableAbsPath = Path.Combine(folder, stableFile);

                void QueueCaptureWhenReady(int attemptsLeft)
                {
                    _actions.Enqueue(() =>
                    {
                        try
                        {
                            if (!Context.IsWorldReady)
                            {
                                error = "world_not_ready";
                                done.Set();
                                return;
                            }

                            GameWindowFocus.FocusGameWindowSafe(_monitor, "map-picker-capture");

                            if (!string.IsNullOrWhiteSpace(location))
                            {
                                string currentLoc = Game1.currentLocation?.NameOrUniqueName ?? "";
                                if (!string.Equals(currentLoc, location, StringComparison.Ordinal))
                                {
                                    if (attemptsLeft <= 0)
                                    {
                                        error = "location_not_ready";
                                        done.Set();
                                        return;
                                    }

                                    QueueCaptureWhenReady(attemptsLeft - 1);
                                    return;
                                }
                            }

                            using (ScreenshotOverlayScope.Enable())
                            {
                                file = Game1.game1.takeMapScreenshot(scale, name, onDone: null);
                            }

                            if (string.IsNullOrWhiteSpace(file))
                            {
                                error = "screenshot_failed";
                                done.Set();
                                return;
                            }

                            absPath = Path.Combine(folder, file);

                            if (!WaitForFileReady(absPath, msTimeout: 5000))
                            {
                                error = "file_not_ready";
                                done.Set();
                                return;
                            }

                            if (!string.IsNullOrWhiteSpace(stableAbsPath))
                            {
                                TryCopyWithRetries(absPath, stableAbsPath, overwrite: true, msTimeout: 2500);
                                if (File.Exists(stableAbsPath))
                                {
                                    file = stableFile;
                                    absPath = stableAbsPath;
                                }
                            }

                            if (open)
                                TryOpenOnOS(absPath);

                            done.Set();
                        }
                        catch (Exception ex)
                        {
                            _monitor.Log($"Screenshot API capture step failed: {ex}", LogLevel.Error);
                            error = "exception";
                            done.Set();
                        }
                    });
                }

                _actions.Enqueue(() =>
                {
                    try
                    {
                        if (!Context.IsWorldReady)
                        {
                            error = "world_not_ready";
                            done.Set();
                            return;
                        }

                        GameWindowFocus.FocusGameWindowSafe(_monitor, "map-picker");


                        if (!string.IsNullOrWhiteSpace(stableAbsPath) && File.Exists(stableAbsPath))
                        {
                            file = stableFile;
                            absPath = stableAbsPath;

                            if (open)
                                TryOpenOnOS(absPath);

                            done.Set();
                            return;
                        }

                        if (!string.IsNullOrWhiteSpace(location))
                        {
                            var targetLoc =
                                Game1.getLocationFromName(location!)
                                ?? Game1.getLocationFromName(location!, isStructure: false);

                            if (targetLoc == null)
                            {
                                error = "location_not_found";
                                done.Set();
                                return;
                            }

                            if (!string.Equals(Game1.currentLocation?.NameOrUniqueName, location, StringComparison.Ordinal))
                            {
                                Point arrival = GetPreferredArrivalTile(targetLoc);
                                Game1.warpFarmer(location!, arrival.X, arrival.Y, false);
                                GameWindowFocus.FocusGameWindowSafe(_monitor, "map-picker-afterWarp");
                            }
                        }


                        QueueCaptureWhenReady(12);
                    }
                    catch (Exception ex)
                    {
                        _monitor.Log($"Screenshot API failed: {ex}", LogLevel.Error);
                        error = "exception";
                        done.Set();
                    }
                });

                done.Wait();

                if (!string.IsNullOrWhiteSpace(error) || string.IsNullOrWhiteSpace(file) || string.IsNullOrWhiteSpace(absPath))
                {
                    JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = error ?? "unknown" });
                    return;
                }


                var relUrl = $"/api/v1/screenshots/file?name={Uri.EscapeDataString(file)}";

                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    file,
                    path = absPath,
                    url = relUrl
                });
            });


            router.Map("GET", "/api/v1/screenshots/file", ctx =>
            {

                string? name = ctx.Http.Request.QueryString["name"];
                if (string.IsNullOrWhiteSpace(name))
                    name = ctx.Http.Request.QueryString["file"];

                if (string.IsNullOrWhiteSpace(name))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_name" });
                    return;
                }

                string folder = GetScreenshotFolderSafe();
                string full = Path.Combine(folder, name);


                string fullNorm = Path.GetFullPath(full);
                string folderNorm = Path.GetFullPath(folder);
                if (!fullNorm.StartsWith(folderNorm, StringComparison.OrdinalIgnoreCase))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "invalid_name" });
                    return;
                }

                if (!File.Exists(fullNorm))
                {
                    JsonUtil.WriteJson(ctx.Http, 404, new { ok = false, error = "not_found" });
                    return;
                }

                string ext = Path.GetExtension(fullNorm).ToLowerInvariant();
                string contentType =
                    ext == ".png" ? "image/png" :
                    (ext == ".jpg" || ext == ".jpeg") ? "image/jpeg" :
                    ext == ".gif" ? "image/gif" :
                    "application/octet-stream";

                try
                {

                    const int maxTries = 15;
                    for (int i = 0; i < maxTries; i++)
                    {
                        try
                        {
                            using var fs = new FileStream(fullNorm, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                            ctx.Http.Response.StatusCode = 200;
                            ctx.Http.Response.ContentType = contentType;
                            ctx.Http.Response.AddHeader("Cache-Control", "no-store");
                            fs.CopyTo(ctx.Http.Response.OutputStream);
                            return;
                        }
                        catch (IOException) when (i < maxTries - 1)
                        {
                            Thread.Sleep(40);
                        }
                    }

                    JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "read_failed" });
                }
                catch (Exception ex)
                {
                    _monitor.Log($"Screenshot file read failed for '{name}': {ex}", LogLevel.Error);
                    JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "read_failed" });
                }
            });

            router.Map("GET", "/api/v1/screenshots/file", ctx =>
            {

                string? name = ctx.Http.Request.QueryString["name"];
                if (string.IsNullOrWhiteSpace(name))
                    name = ctx.Http.Request.QueryString["file"];

                if (string.IsNullOrWhiteSpace(name))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_name" });
                    return;
                }

                string folder = GetScreenshotFolderSafe();
                string full = Path.Combine(folder, name);

                string fullNorm = Path.GetFullPath(full);
                string folderNorm = Path.GetFullPath(folder);
                if (!fullNorm.StartsWith(folderNorm, StringComparison.OrdinalIgnoreCase))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "invalid_name" });
                    return;
                }

                if (!File.Exists(fullNorm))
                {
                    JsonUtil.WriteJson(ctx.Http, 404, new { ok = false, error = "not_found" });
                    return;
                }

                string ext = Path.GetExtension(fullNorm).ToLowerInvariant();
                string contentType =
                    ext == ".png" ? "image/png" :
                    (ext == ".jpg" || ext == ".jpeg") ? "image/jpeg" :
                    ext == ".gif" ? "image/gif" :
                    "application/octet-stream";

                try
                {
                    const int maxTries = 15;

                    for (int i = 0; i < maxTries; i++)
                    {
                        try
                        {
                            var fi = new FileInfo(fullNorm);

                            ctx.Http.Response.StatusCode = 200;
                            ctx.Http.Response.ContentType = contentType;
                            ctx.Http.Response.AddHeader("Cache-Control", "no-store");


                            ctx.Http.Response.ContentLength64 = fi.Length;

                            using var fs = new FileStream(fullNorm, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                            fs.CopyTo(ctx.Http.Response.OutputStream);
                            ctx.Http.Response.OutputStream.Flush();


                            ctx.Http.Response.Close();
                            return;
                        }
                        catch (IOException) when (i < maxTries - 1)
                        {
                            Thread.Sleep(40);
                        }
                    }

                    JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "read_failed" });
                }
                catch (Exception ex)
                {
                    _monitor.Log($"Screenshot file read failed for '{name}': {ex}", LogLevel.Error);

                    try { ctx.Http.Response.Close(); } catch { }

                    JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "read_failed" });
                }
            });
        }



        private static bool WaitForFileReady(string path, int msTimeout)
        {
            var sw = Stopwatch.StartNew();
            while (sw.ElapsedMilliseconds < msTimeout)
            {
                try
                {
                    if (File.Exists(path))
                    {
                        var fi = new FileInfo(path);
                        if (fi.Length > 0)
                            return true;
                    }
                }
                catch { }
                Thread.Sleep(40);
            }
            return false;
        }

        private static string GetScreenshotFolderSafe()
        {
            try
            {
                var mi = typeof(Game1).GetMethod(
                    "GetScreenshotFolder",
                    System.Reflection.BindingFlags.Public |
                    System.Reflection.BindingFlags.NonPublic |
                    System.Reflection.BindingFlags.Static |
                    System.Reflection.BindingFlags.Instance);

                if (mi != null)
                {
                    object? target = mi.IsStatic ? null : Game1.game1;
                    var result = mi.Invoke(target, Array.Empty<object>());
                    if (result is string s && !string.IsNullOrWhiteSpace(s))
                        return s;
                }
            }
            catch { }

            return _FallbackScreenshotFolder();
        }

        private static string _FallbackScreenshotFolder()
        {
            try
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "StardewValley",
                    "Screenshots");
            }
            catch
            {
                return Environment.CurrentDirectory;
            }
        }

        private static void TryOpenOnOS(string path)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
                    return;

                Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
            }
            catch { }
        }

        
        private static string SanitizeFilePart(string s)
        {
            if (string.IsNullOrWhiteSpace(s))
                return "Unknown";

            s = s.Trim();

           
            char[] arr = s.ToCharArray();
            for (int i = 0; i < arr.Length; i++)
            {
                char c = arr[i];
                bool ok =
                    (c >= 'a' && c <= 'z') ||
                    (c >= 'A' && c <= 'Z') ||
                    (c >= '0' && c <= '9') ||
                    c == '_' || c == '-' || c == '.';

                if (!ok)
                    arr[i] = '_';
            }

            string cleaned = new string(arr);

           
            while (cleaned.Contains("__"))
                cleaned = cleaned.Replace("__", "_");

            cleaned = cleaned.Trim('_');

            return string.IsNullOrWhiteSpace(cleaned) ? "Unknown" : cleaned;
        }

      
        private static void TryCopyWithRetries(string src, string dst, bool overwrite, int msTimeout)
        {
            var sw = Stopwatch.StartNew();
            while (sw.ElapsedMilliseconds < msTimeout)
            {
                try
                {
                    if (!File.Exists(src))
                        return;


                    Directory.CreateDirectory(Path.GetDirectoryName(dst)!);

                    File.Copy(src, dst, overwrite);
                    return;
                }
                catch (IOException)
                {
                    Thread.Sleep(40);
                }
                catch
                {
                    return;
                }
            }
        }
    }
}