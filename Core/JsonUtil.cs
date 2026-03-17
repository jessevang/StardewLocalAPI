using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;

namespace StardewLocalAPI.Core
{
    internal static class JsonUtil
    {
        public static void WriteJson(HttpListenerContext ctx, int status, object obj)
        {
            string json = JsonSerializer.Serialize(obj, new JsonSerializerOptions { WriteIndented = false });
            byte[] bytes = Encoding.UTF8.GetBytes(json);

            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = "application/json; charset=utf-8";
            ctx.Response.Headers["Cache-Control"] = "no-store";
            ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
            ctx.Response.OutputStream.Close();
        }

        public static JsonDocument? ReadJsonBody(HttpListenerRequest req, out string? error)
        {
            error = null;
            try
            {
                using var reader = new StreamReader(req.InputStream, req.ContentEncoding ?? Encoding.UTF8);
                string body = reader.ReadToEnd();
                if (string.IsNullOrWhiteSpace(body))
                    return null;

                return JsonDocument.Parse(body);
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return null;
            }
        }

        public static string? GetString(JsonElement root, string prop)
        {
            if (root.ValueKind != JsonValueKind.Object) return null;
            return root.TryGetProperty(prop, out var el) && el.ValueKind == JsonValueKind.String ? el.GetString() : null;
        }

        public static int GetInt(JsonElement root, string prop, int fallback = 0)
        {
            if (root.ValueKind != JsonValueKind.Object) return fallback;
            if (!root.TryGetProperty(prop, out var el)) return fallback;

            if (el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out int v)) return v;
            if (el.ValueKind == JsonValueKind.String && int.TryParse(el.GetString(), out v)) return v;
            return fallback;
        }
    }
}