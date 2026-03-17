using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;

namespace StardewLocalAPI.Modules
{
    internal sealed class TextureSheetsModule : IApiModule
    {
        private readonly IModHelper _helper;
        private readonly IMonitor _monitor;
        private readonly GameActionQueue _actions;

        public TextureSheetsModule(IModHelper helper, IMonitor monitor, GameActionQueue actions)
        {
            _helper = helper;
            _monitor = monitor;
            _actions = actions;
        }

        private sealed class TextureSheetDef
        {
            public string Key { get; init; } = "";
            public string AssetName { get; init; } = "";
            public int TileWidth { get; init; }
            public int TileHeight { get; init; }
            public string FileBaseName { get; init; } = "";
        }


        //Modify to add more images with tilesizes
        private static readonly Dictionary<string, TextureSheetDef> SheetDefs =
            new(StringComparer.OrdinalIgnoreCase)
            {
                ["springobjects"] = new TextureSheetDef
                {
                    Key = "springobjects",
                    AssetName = "Maps/springobjects",
                    TileWidth = 16,
                    TileHeight = 16,
                    FileBaseName = "springobjects"
                },

                ["festivals"] = new TextureSheetDef
                {
                    Key = "festivals",
                    AssetName = "Maps/Festivals",
                    TileWidth = 16,
                    TileHeight = 16,
                    FileBaseName = "festivals"
                },

                ["craftables"] = new TextureSheetDef
                {
                    Key = "craftables",
                    AssetName = "TileSheets/Craftables",
                    TileWidth = 16,
                    TileHeight = 32,
                    FileBaseName = "craftables"
                },
            };

        public void Register(ApiRouter router)
        {
            router.Map("GET", "/api/v1/textures/list", ctx =>
            {
                var sheets = SheetDefs.Values
                    .OrderBy(p => p.Key)
                    .Select(def => new
                    {
                        key = def.Key,
                        assetName = def.AssetName,
                        tileWidth = def.TileWidth,
                        tileHeight = def.TileHeight
                    })
                    .ToList();

                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    sheets
                });
            });

            router.Map("GET", "/api/v1/textures/meta", ctx =>
            {
                string? key = ctx.Http.Request.QueryString["key"];
                if (string.IsNullOrWhiteSpace(key))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_key" });
                    return;
                }

                if (!TryGetSheetDef(key!, out var def))
                {
                    JsonUtil.WriteJson(ctx.Http, 404, new { ok = false, error = "unknown_texture_key" });
                    return;
                }

                if (!TryGetTextureSizeOnMainThread(def, out int width, out int height, out string? error))
                {
                    JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = error ?? "texture_load_failed" });
                    return;
                }

                int columns = def.TileWidth > 0 ? width / def.TileWidth : 0;
                int rows = def.TileHeight > 0 ? height / def.TileHeight : 0;

                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    key = def.Key,
                    assetName = def.AssetName,
                    width,
                    height,
                    tileWidth = def.TileWidth,
                    tileHeight = def.TileHeight,
                    columns,
                    rows,
                    count = columns * rows,
                    imageUrl = $"/api/v1/textures/image?key={Uri.EscapeDataString(def.Key)}",
                    gridImageUrl = $"/api/v1/textures/image?key={Uri.EscapeDataString(def.Key)}&grid=true"
                });
            });

            router.Map("GET", "/api/v1/textures/image", ctx =>
            {
                string? key = ctx.Http.Request.QueryString["key"];
                bool wantGrid = IsTrue(ctx.Http.Request.QueryString["grid"]);

                if (string.IsNullOrWhiteSpace(key))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_key" });
                    return;
                }

                if (!TryGetSheetDef(key!, out var def))
                {
                    JsonUtil.WriteJson(ctx.Http, 404, new { ok = false, error = "unknown_texture_key" });
                    return;
                }

                if (!TryEnsureTextureExport(def, wantGrid, out string? fullPath, out string? error))
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
                            $"Texture image missing or empty for key '{def.Key}' (grid={wantGrid}) at '{fullPath}'.",
                            LogLevel.Warn
                        );

                        JsonUtil.WriteJson(ctx.Http, 404, new { ok = false, error = "not_found" });
                        return;
                    }

                    byte[] bytes = File.ReadAllBytes(fullPath);

                    _monitor.Log(
                        $"Serving texture image: key={def.Key}, grid={wantGrid}, bytes={bytes.LongLength}, path='{fullPath}'",
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
                    _monitor.Log($"Texture image read/serve failed for key '{def.Key}': {ex}", LogLevel.Error);

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

        private static bool TryGetSheetDef(string key, out TextureSheetDef def)
        {
            return SheetDefs.TryGetValue((key ?? "").Trim(), out def!);
        }

        private string GetTextureCacheFolder()
        {
            string folder = Path.Combine(_helper.DirectoryPath, "workspace", "cache", "textures");
            Directory.CreateDirectory(folder);
            return folder;
        }

        private string GetTextureFilePath(TextureSheetDef def, bool grid)
        {
            string suffix = grid ? "_grid" : "";
            return Path.Combine(GetTextureCacheFolder(), $"{def.FileBaseName}{suffix}.png");
        }

        private bool TryGetTextureSizeOnMainThread(TextureSheetDef def, out int width, out int height, out string? error)
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
                    var tex = _helper.GameContent.Load<Texture2D>(def.AssetName);
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
                    _monitor.Log($"Failed to load texture '{def.AssetName}' for size lookup: {ex}", LogLevel.Error);
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

        private bool TryEnsureTextureExport(TextureSheetDef def, bool grid, out string? fullPath, out string? error)
        {
            string localFullPath = GetTextureFilePath(def, grid);
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
                        $"Deleting stale or empty cached texture export for key '{def.Key}' (grid={grid}) at '{localFullPath}'.",
                        LogLevel.Warn
                    );

                    try { File.Delete(localFullPath); } catch { }
                }
            }
            catch (Exception ex)
            {
                _monitor.Log(
                    $"Failed while checking cached texture export for key '{def.Key}' (grid={grid}): {ex}",
                    LogLevel.Warn
                );
            }

            using var done = new ManualResetEventSlim(false);

            _actions.Enqueue(() =>
            {
                try
                {
                    var tex = _helper.GameContent.Load<Texture2D>(def.AssetName);
                    if (tex == null)
                    {
                        localError = "texture_not_found";
                        done.Set();
                        return;
                    }

                    ExportTextureToPng(tex, localFullPath, def.TileWidth, def.TileHeight, grid);

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
                                $"Texture export ready: key={def.Key}, grid={grid}, bytes={fi.Length}, path='{localFullPath}'",
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
                    _monitor.Log($"Failed to export texture '{def.AssetName}' (grid={grid}): {ex}", LogLevel.Error);
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

        private static bool IsTrue(string? s)
        {
            if (string.IsNullOrWhiteSpace(s))
                return false;

            return
                string.Equals(s, "1", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(s, "true", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(s, "yes", StringComparison.OrdinalIgnoreCase);
        }
    }
}