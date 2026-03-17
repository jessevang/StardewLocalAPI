using HarmonyLib;
using SkiaSharp;
using StardewLocalAPI.Core;
using StardewValley;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Reflection.Emit;

namespace StardewLocalAPI.Patches
{
    [HarmonyPatch]
    internal static class MapScreenshotOverlayPatch
    {
        private static MethodInfo TargetMethod()
        {
            var mi = AccessTools.Method(typeof(Game1), "takeMapScreenshot",
                new[] { typeof(GameLocation), typeof(float), typeof(string), typeof(Action) });

            if (mi == null)
                throw new InvalidOperationException("Could not find Game1.takeMapScreenshot(GameLocation,float,string,Action).");

            return mi;
        }

        private static IEnumerable<CodeInstruction> Transpiler(IEnumerable<CodeInstruction> instructions)
        {
            var codes = instructions.ToList();

            var miSnapshot = AccessTools.Method(typeof(SKSurface), nameof(SKSurface.Snapshot));
            var miInjected = AccessTools.Method(typeof(MapScreenshotOverlayPatch), nameof(DrawOverlayIfEnabled));
            if (miSnapshot == null || miInjected == null)
                return codes;

            for (int i = 0; i < codes.Count; i++)
            {
                if (!codes[i].Calls(miSnapshot))
                    continue;

                if (i - 1 < 0)
                    break;

                var prev = codes[i - 1];
                if (!prev.opcode.Name.StartsWith("ldloc"))
                    break;

                var injected = new List<CodeInstruction>
                {
                    new CodeInstruction(prev.opcode, prev.operand),
                    new CodeInstruction(OpCodes.Ldarg_1),
                    new CodeInstruction(OpCodes.Ldarg_2),
                    new CodeInstruction(OpCodes.Call, miInjected),
                };

                codes.InsertRange(i, injected);
                break;
            }

            return codes;
        }

        private static void DrawOverlayIfEnabled(SKSurface surface, GameLocation location, float scale)
        {
            if (!ScreenshotOverlayScope.Enabled)
                return;

            if (surface == null || location?.Map == null)
                return;

            GetScreenshotRegionCompat(location, out int startXpx, out int startYpx, out int widthPx, out int heightPx);

            int tileStartX = startXpx / 64;
            int tileStartY = startYpx / 64;
            int tilesWide = widthPx / 64;
            int tilesHigh = heightPx / 64;

            var canvas = surface.Canvas;

            float s = scale;
            const float BaseTextSize = 14f; // was  10f
            float textSize = Math.Max(6f, BaseTextSize * s);

            using var gridPaint = new SKPaint
            {
                IsAntialias = false,
                Color = new SKColor(255, 255, 255, 45),
                StrokeWidth = Math.Max(1f, 1f * s),
                Style = SKPaintStyle.Stroke
            };

            using var outlinePaint = new SKPaint
            {
                IsAntialias = true,
                Color = SKColors.Black,
                TextSize = textSize,
                StrokeWidth = Math.Max(1f, 2f * s),
                Style = SKPaintStyle.Stroke
            };

            using var fillPaint = new SKPaint
            {
                IsAntialias = true,
                Color = SKColors.White,
                TextSize = textSize,
                Style = SKPaintStyle.Fill
            };

            float totalW = widthPx * s;
            float totalH = heightPx * s;

            for (int tx = 0; tx <= tilesWide; tx++)
            {
                float x = tx * 64f * s;
                canvas.DrawLine(x, 0, x, totalH, gridPaint);
            }

            for (int ty = 0; ty <= tilesHigh; ty++)
            {
                float y = ty * 64f * s;
                canvas.DrawLine(0, y, totalW, y, gridPaint);
            }

            for (int ty = 0; ty < tilesHigh; ty++)
            {
                int globalY = tileStartY + ty;
                float y = ty * 64f * s;

                for (int tx = 0; tx < tilesWide; tx++)
                {
                    int globalX = tileStartX + tx;
                    float x = tx * 64f * s;

                    string label = $"{globalX},{globalY}";

                    float px = x + (2f * s);
                    float py = y + textSize + (2f * s);

                    canvas.DrawText(label, px, py, outlinePaint);
                    canvas.DrawText(label, px, py, fillPaint);
                }
            }
        }

        private static void GetScreenshotRegionCompat(GameLocation screenshotLocation, out int startX, out int startY, out int width, out int height)
        {
            startX = 0;
            startY = 0;
            width = screenshotLocation.map.DisplayWidth;
            height = screenshotLocation.map.DisplayHeight;

            try
            {
                string prop = screenshotLocation.getMapProperty("ScreenshotRegion");
                if (string.IsNullOrWhiteSpace(prop))
                    return;

                string[] parts = prop.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 4)
                    return;

                if (!int.TryParse(parts[0], out int value)) return;
                if (!int.TryParse(parts[1], out int value2)) return;
                if (!int.TryParse(parts[2], out int value3)) return;
                if (!int.TryParse(parts[3], out int value4)) return;

                startX = value * 64;
                startY = value2 * 64;
                width = (value3 + 1) * 64 - startX;
                height = (value4 + 1) * 64 - startY;
            }
            catch
            {
            }
        }
    }
}