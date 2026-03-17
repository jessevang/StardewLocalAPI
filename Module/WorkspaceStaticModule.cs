using StardewLocalAPI.Core;
using StardewModdingAPI;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace StardewLocalAPI.Modules
{
    internal sealed class WorkspaceStaticModule : IApiModule
    {
        private readonly IModHelper _helper;

        public WorkspaceStaticModule(IModHelper helper)
        {
            _helper = helper;
        }

        public void Register(ApiRouter router)
        {
            router.Map("GET", "/workspace/index.html", ctx => Serve(ctx, "workspace/index.html"));
            router.Map("GET", "/workspace/app.js", ctx => Serve(ctx, "workspace/app.js"));
            router.Map("GET", "/workspace/style.css", ctx => Serve(ctx, "workspace/style.css"));
        }

        private void Serve(ApiContext ctx, string relativePath)
        {
            string fullPath = Path.Combine(_helper.DirectoryPath, relativePath.Replace('/', Path.DirectorySeparatorChar));
            if (!File.Exists(fullPath))
            {
                JsonUtil.WriteJson(ctx.Http, 404, new { ok = false, error = "file_not_found", file = relativePath });
                return;
            }

            byte[] bytes = File.ReadAllBytes(fullPath);

            ctx.Http.Response.StatusCode = 200;
            ctx.Http.Response.ContentType = GetContentType(relativePath);
            ctx.Http.Response.OutputStream.Write(bytes, 0, bytes.Length);
        }

        private static string GetContentType(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            return ext switch
            {
                ".html" => "text/html; charset=utf-8",
                ".js" => "application/javascript; charset=utf-8",
                ".css" => "text/css; charset=utf-8",
                ".png" => "image/png",
                ".jpg" => "image/jpeg",
                ".jpeg" => "image/jpeg",
                ".gif" => "image/gif",
                ".svg" => "image/svg+xml",
                ".json" => "application/json; charset=utf-8",
                _ => "application/octet-stream"
            };
        }
    }
}