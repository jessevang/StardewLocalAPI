using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;
using System;
using System.IO;
using System.Threading;

namespace StardewLocalAPI.Modules
{
    internal sealed class TempActorAssetsModule : IApiModule
    {
        private readonly IModHelper _helper;
        private readonly IMonitor _monitor;
        private readonly GameActionQueue _actions;

        public TempActorAssetsModule(IModHelper helper, IMonitor monitor, GameActionQueue actions)
        {
            _helper = helper;
            _monitor = monitor;
            _actions = actions;
        }

        public void Register(ApiRouter router)
        {
            router.Map("GET", "/api/v1/tempactors/meta", ctx =>
            {
                string? assetName = ctx.Http.Request.QueryString["assetName"];
                if (string.IsNullOrWhiteSpace(assetName))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_assetName" });
                    return;
                }

                assetName = NormalizeAssetName(assetName!);
                if (!IsValidTempActorAsset(assetName))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "invalid_tempactor_asset" });
                    return;
                }

                if (!TryGetTextureSizeOnMainThread(assetName, out int width, out int height, out string? error))
                {
                    JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = error ?? "texture_load_failed" });
                    return;
                }

                GetDefaultTileSize(assetName, out int tileWidth, out int tileHeight);

                int columns = tileWidth > 0 ? width / tileWidth : 0;
                int rows = tileHeight > 0 ? height / tileHeight : 0;

                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    assetName,
                    width,
                    height,
                    tileWidth,
                    tileHeight,
                    columns,
                    rows,
                    count = columns * rows,
                    imageUrl = $"/api/v1/tempactors/image?assetName={Uri.EscapeDataString(assetName)}",
                    gridImageUrl = $"/api/v1/tempactors/image?assetName={Uri.EscapeDataString(assetName)}&grid=true&tileWidth={tileWidth}&tileHeight={tileHeight}"
                });
            });

            router.Map("GET", "/api/v1/tempactors/image", ctx =>
            {
                string? assetName = ctx.Http.Request.QueryString["assetName"];
                bool wantGrid = IsTrue(ctx.Http.Request.QueryString["grid"]);
                int tileWidth = ParseInt(ctx.Http.Request.QueryString["tileWidth"], 0);
                int tileHeight = ParseInt(ctx.Http.Request.QueryString["tileHeight"], 0);

                if (string.IsNullOrWhiteSpace(assetName))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_assetName" });
                    return;
                }

                assetName = NormalizeAssetName(assetName!);
                if (!IsValidTempActorAsset(assetName))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "invalid_tempactor_asset" });
                    return;
                }

                if (tileWidth <= 0 || tileHeight <= 0)
                    GetDefaultTileSize(assetName, out tileWidth, out tileHeight);

                if (!TryEnsureTextureExport(assetName, wantGrid, tileWidth, tileHeight, out string? fullPath, out string? error))
                {
                    JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = error ?? "texture_export_failed" });
                    return;
                }

                if (string.IsNullOrWhiteSpace(fullPath) || !File.Exists(fullPath))
                {
                    JsonUtil.WriteJson(ctx.Http, 404, new { ok = false, error = "not_found" });
                    return;
                }

                try
                {
                    var fi = new FileInfo(fullPath);
                    if (!fi.Exists || fi.Length <= 0)
                    {
                        _monitor.Log(
                            $"Temp actor image missing or empty for asset '{assetName}' (grid={wantGrid}) at '{fullPath}'.",
                            LogLevel.Warn
                        );

                        JsonUtil.WriteJson(ctx.Http, 404, new { ok = false, error = "not_found" });
                        return;
                    }

                    byte[] bytes = File.ReadAllBytes(fullPath);

                    _monitor.Log(
                        $"Serving temp actor image: asset={assetName}, grid={wantGrid}, bytes={bytes.LongLength}, path='{fullPath}'",
                        LogLevel.Trace
                    );

                    var response = ctx.Http.Response;
                    response.StatusCode = 200;
                    response.ContentType = "image/png";
                    response.AddHeader("Cache-Control", "no-store, no-cache, must-revalidate");
                    response.AddHeader("Pragma", "no-cache");
                    response.AddHeader("Expires", "0");
                    response.ContentLength64 = bytes.LongLength;

                    response.OutputStream.Write(bytes, 0, bytes.Length);
                    response.OutputStream.Flush();

                    try
                    {
                        response.Close();
                    }
                    catch
                    {
                    }
                }
                catch (Exception ex)
                {
                    _monitor.Log($"Temp actor image read/serve failed for asset '{assetName}': {ex}", LogLevel.Error);

                    try
                    {
                        if (ctx.Http.Response.OutputStream.CanWrite)
                            JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "read_failed" });
                    }
                    catch
                    {
                    }
                }
            });
        }

        private string GetTextureCacheFolder()
        {
            string folder = Path.Combine(_helper.DirectoryPath, "workspace", "cache", "tempactors");
            Directory.CreateDirectory(folder);
            return folder;
        }

        private string GetTextureFilePath(string assetName, bool grid, int tileWidth, int tileHeight)
        {
            string safeName = SanitizeFileName(assetName.Replace('/', '_').Replace('\\', '_'));
            string suffix = grid ? $"_grid_{tileWidth}x{tileHeight}" : "";
            return Path.Combine(GetTextureCacheFolder(), $"{safeName}{suffix}.png");
        }

        private bool TryGetTextureSizeOnMainThread(string assetName, out int width, out int height, out string? error)
        {
            width = 0;
            height = 0;
            error = null;

            int localWidth = 0;
            int localHeight = 0;
            string? localError = null;

            using var done = new ManualResetEventSlim(false);

            _actions.Enqueue(() =>
            {
                try
                {
                    var tex = _helper.GameContent.Load<Texture2D>(assetName);
                    if (tex == null)
                    {
                        localError = "texture_not_found";
                        done.Set();
                        return;
                    }

                    localWidth = tex.Width;
                    localHeight = tex.Height;
                    done.Set();
                }
                catch (Exception ex)
                {
                    _monitor.Log($"Failed to load temp actor texture '{assetName}' for size lookup: {ex}", LogLevel.Error);
                    localError = "texture_load_failed";
                    done.Set();
                }
            });

            done.Wait();

            width = localWidth;
            height = localHeight;
            error = localError;

            return error == null && width > 0 && height > 0;
        }

        private bool TryEnsureTextureExport(string assetName, bool grid, int tileWidth, int tileHeight, out string? fullPath, out string? error)
        {
            string localFullPath = GetTextureFilePath(assetName, grid, tileWidth, tileHeight);
            string? localError = null;

            try
            {
                if (File.Exists(localFullPath))
                {
                    var fi = new FileInfo(localFullPath);
                    if (fi.Exists && fi.Length > 0)
                    {
                        fullPath = localFullPath;
                        error = null;
                        return true;
                    }

                    _monitor.Log(
                        $"Deleting stale or empty cached temp actor export for asset '{assetName}' (grid={grid}) at '{localFullPath}'.",
                        LogLevel.Warn
                    );

                    try { File.Delete(localFullPath); } catch { }
                }
            }
            catch (Exception ex)
            {
                _monitor.Log(
                    $"Failed while checking cached temp actor export for asset '{assetName}' (grid={grid}): {ex}",
                    LogLevel.Warn
                );
            }

            using var done = new ManualResetEventSlim(false);

            _actions.Enqueue(() =>
            {
                try
                {
                    var tex = _helper.GameContent.Load<Texture2D>(assetName);
                    if (tex == null)
                    {
                        localError = "texture_not_found";
                        done.Set();
                        return;
                    }

                    ExportTextureToPng(tex, localFullPath, tileWidth, tileHeight, grid);

                    try
                    {
                        var fi = new FileInfo(localFullPath);
                        if (!fi.Exists || fi.Length <= 0)
                        {
                            localError = "texture_export_failed";
                        }
                        else
                        {
                            _monitor.Log(
                                $"Temp actor export ready: asset={assetName}, grid={grid}, bytes={fi.Length}, path='{localFullPath}'",
                                LogLevel.Trace
                            );
                        }
                    }
                    catch
                    {
                        localError = "texture_export_failed";
                    }

                    done.Set();
                }
                catch (Exception ex)
                {
                    _monitor.Log($"Failed to export temp actor texture '{assetName}' (grid={grid}): {ex}", LogLevel.Error);
                    localError = "texture_export_failed";
                    done.Set();
                }
            });

            done.Wait();

            fullPath = localFullPath;
            error = localError;

            if (error != null)
                return false;

            try
            {
                var fi = new FileInfo(fullPath);
                if (!fi.Exists || fi.Length <= 0)
                {
                    error = "texture_export_failed";
                    return false;
                }

                return true;
            }
            catch
            {
                error = "texture_export_failed";
                return false;
            }
        }

        private static void ExportTextureToPng(Texture2D source, string outputPath, int tileW, int tileH, bool drawGrid)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);

            int width = source.Width;
            int height = source.Height;

            var pixels = new Color[width * height];
            source.GetData(pixels);

            if (drawGrid && tileW > 0 && tileH > 0)
            {
                DrawGridOverlay(pixels, width, height, tileW, tileH);
            }

            using var outTex = new Texture2D(Game1.graphics.GraphicsDevice, width, height);
            outTex.SetData(pixels);

            using var fs = new FileStream(outputPath, FileMode.Create, FileAccess.Write, FileShare.Read);
            outTex.SaveAsPng(fs, width, height);
            fs.Flush();
        }

        private static void DrawGridOverlay(Color[] pixels, int width, int height, int tileW, int tileH)
        {
            if (pixels == null || pixels.Length == 0 || width <= 0 || height <= 0 || tileW <= 0 || tileH <= 0)
                return;

            var gridColor = new Color((byte)255, (byte)255, (byte)255, (byte)180);
            var borderColor = new Color((byte)255, (byte)215, (byte)0, (byte)220);

            for (int x = 0; x < width; x++)
            {
                bool isMajor = (x % (tileW * 5)) == 0;
                var c = isMajor ? borderColor : gridColor;

                if (x % tileW != 0)
                    continue;

                for (int y = 0; y < height; y++)
                    BlendPixel(pixels, width, height, x, y, c);
            }

            for (int y = 0; y < height; y++)
            {
                bool isMajor = (y % (tileH * 5)) == 0;
                var c = isMajor ? borderColor : gridColor;

                if (y % tileH != 0)
                    continue;

                for (int x = 0; x < width; x++)
                    BlendPixel(pixels, width, height, x, y, c);
            }
        }

        private static void BlendPixel(Color[] pixels, int width, int height, int x, int y, Color overlay)
        {
            if (x < 0 || y < 0 || x >= width || y >= height)
                return;

            int idx = y * width + x;
            var baseColor = pixels[idx];

            float a = overlay.A / 255f;
            byte r = (byte)(baseColor.R * (1f - a) + overlay.R * a);
            byte g = (byte)(baseColor.G * (1f - a) + overlay.G * a);
            byte b = (byte)(baseColor.B * (1f - a) + overlay.B * a);

            pixels[idx] = new Color(r, g, b, (byte)255);
        }

        private static string NormalizeAssetName(string assetName)
        {
            return (assetName ?? "").Trim().Replace('\\', '/');
        }

        private static bool IsValidTempActorAsset(string assetName)
        {
            if (string.IsNullOrWhiteSpace(assetName))
                return false;

            assetName = assetName.Replace('\\', '/').Trim();

            if (assetName.StartsWith("Characters/Monsters/", StringComparison.OrdinalIgnoreCase))
            {
                string tail = assetName["Characters/Monsters/".Length..];
                return !string.IsNullOrWhiteSpace(tail) && !tail.Contains('/');
            }

            if (assetName.StartsWith("Characters/", StringComparison.OrdinalIgnoreCase))
            {
                string tail = assetName["Characters/".Length..];
                return !string.IsNullOrWhiteSpace(tail) && !tail.Contains('/');
            }

            if (assetName.StartsWith("Animals/", StringComparison.OrdinalIgnoreCase))
            {
                string tail = assetName["Animals/".Length..];
                return !string.IsNullOrWhiteSpace(tail) && !tail.Contains('/');
            }

            return false;
        }

        private static void GetDefaultTileSize(string assetName, out int tileWidth, out int tileHeight)
        {
            assetName = NormalizeAssetName(assetName);

            if (assetName.StartsWith("Characters/", StringComparison.OrdinalIgnoreCase)
                && !assetName.StartsWith("Characters/Monsters/", StringComparison.OrdinalIgnoreCase))
            {
                tileWidth = 16;
                tileHeight = 32;
                return;
            }

            tileWidth = 16;
            tileHeight = 16;
        }

        private static int ParseInt(string? s, int defaultValue)
        {
            return int.TryParse(s, out int value) ? value : defaultValue;
        }

        private static bool IsTrue(string? s)
        {
            if (string.IsNullOrWhiteSpace(s))
                return false;

            return
                string.Equals(s, "1", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(s, "true", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(s, "yes", StringComparison.OrdinalIgnoreCase);
        }

        private static string SanitizeFileName(string s)
        {
            if (string.IsNullOrWhiteSpace(s))
                return "unknown";

            foreach (char c in Path.GetInvalidFileNameChars())
                s = s.Replace(c, '_');

            return s;
        }
    }
}
