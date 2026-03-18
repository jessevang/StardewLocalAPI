using StardewModdingAPI;
using System;
using System.IO;
using System.Net;
using System.Threading;

namespace StardewLocalAPI.Core
{
    internal sealed class DevServer
    {
        private readonly IMonitor _monitor;
        private readonly IModHelper _helper;
        private readonly ApiRouter _router;
        private readonly HttpListener _listener = new();
        private readonly string _token;
        private readonly bool _enableIpv6;
        private readonly bool _logRequests;
        private readonly int _maxRps;
        private readonly RuntimePlatformKind _platform;

        private DateTime _rateWindow = DateTime.UtcNow;
        private int _rateCount = 0;
        private Thread? _thread;
        private volatile bool _running;
        private volatile bool _saveLoaded;

        public int Port { get; private set; }
        public string TokenForClient => _token;
        public bool IsSaveLoaded => _saveLoaded;
        public void SetSaveLoaded(bool loaded) => _saveLoaded = loaded;

        private string WorkspaceRoot => Path.Combine(_helper.DirectoryPath, "workspace");

        public DevServer(
            IMonitor monitor,
            IModHelper helper,
            ApiRouter router,
            int port,
            string token,
            bool enableIpv6,
            bool logRequests,
            int maxRps,
            RuntimePlatformKind platform)
        {
            _monitor = monitor;
            _helper = helper;
            _router = router;

            Port = port;
            _token = token;
            _enableIpv6 = enableIpv6;
            _logRequests = logRequests;
            _maxRps = Math.Max(1, maxRps);
            _platform = platform;
        }

        public void Start()
        {
            if (_running) return;

            if (Port == 0)
                Port = PortUtil.FindFreeLoopbackPort();

            if (Port < 1 || Port > 65535)
                throw new InvalidOperationException($"Invalid DevServer port: {Port}");

            _listener.Prefixes.Clear();

            string ipv4Prefix = $"http://127.0.0.1:{Port}/";
            _listener.Prefixes.Add(ipv4Prefix);

            bool allowIpv6 = _enableIpv6 && _platform == RuntimePlatformKind.Windows;
            if (allowIpv6)
                _listener.Prefixes.Add($"http://[::1]:{Port}/");

            _monitor.Log($"Detected platform: {_platform}", LogLevel.Info);
            _monitor.Log($"Attempting to start dev server on: {ipv4Prefix}", LogLevel.Info);

            foreach (string prefix in _listener.Prefixes)
                _monitor.Log($"HttpListener prefix: {prefix}", LogLevel.Trace);

            try
            {
                _listener.Start();
            }
            catch (Exception ex)
            {
                _monitor.Log($"Dev server failed to start on port {Port}: {ex}", LogLevel.Error);
                throw;
            }

            _running = true;

            _thread = new Thread(ListenLoop)
            {
                IsBackground = true,
                Name = "StardewLocalAPI.DevServer"
            };
            _thread.Start();

            _monitor.Log($"Dev server listening on {ipv4Prefix}", LogLevel.Info);
            _monitor.Log($"Workspace root: {WorkspaceRoot}", LogLevel.Trace);
        }

        private void ListenLoop()
        {
            while (_running)
            {
                try
                {
                    var http = _listener.GetContext();
                    HandleRequest(http);
                }
                catch (HttpListenerException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _monitor.Log($"DevServer exception: {ex}", LogLevel.Error);
                }
            }
        }

        private void ApplyCors(HttpListenerResponse res)
        {
            res.Headers["Access-Control-Allow-Origin"] = "*";
            res.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
            res.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-Devtools-Token";
            res.Headers["Access-Control-Max-Age"] = "86400";
        }

        private static string GetContentType(string path)
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            return ext switch
            {
                ".html" => "text/html; charset=utf-8",
                ".htm" => "text/html; charset=utf-8",
                ".css" => "text/css; charset=utf-8",
                ".js" => "application/javascript; charset=utf-8",
                ".mjs" => "application/javascript; charset=utf-8",
                ".json" => "application/json; charset=utf-8",
                ".map" => "application/json; charset=utf-8",
                ".png" => "image/png",
                ".jpg" => "image/jpeg",
                ".jpeg" => "image/jpeg",
                ".gif" => "image/gif",
                ".svg" => "image/svg+xml",
                ".ico" => "image/x-icon",
                ".woff" => "font/woff",
                ".woff2" => "font/woff2",
                ".ttf" => "font/ttf",
                ".txt" => "text/plain; charset=utf-8",
                _ => "application/octet-stream"
            };
        }

        private void HandleRequest(HttpListenerContext http)
        {
            try
            {
                ApplyCors(http.Response);

                if (http.Request.HttpMethod.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
                {
                    http.Response.StatusCode = 204;
                    http.Response.OutputStream.Close();
                    return;
                }

                var now = DateTime.UtcNow;
                if ((now - _rateWindow).TotalSeconds >= 1)
                {
                    _rateWindow = now;
                    _rateCount = 0;
                }

                _rateCount++;
                if (_rateCount > _maxRps)
                {
                    JsonUtil.WriteJson(http, 429, new { ok = false, error = "rate_limited" });
                    return;
                }

                var path = (http.Request.Url?.AbsolutePath ?? "/");

                if (_logRequests)
                    _monitor.Log($"{http.Request.HttpMethod} {path}", LogLevel.Trace);

                if (path.Equals("/", StringComparison.Ordinal))
                {
                    http.Response.StatusCode = 302;
                    http.Response.RedirectLocation = "/workspace/index.html" + (http.Request.Url?.Query ?? "");
                    http.Response.OutputStream.Close();
                    return;
                }

                if (path.StartsWith("/workspace", StringComparison.OrdinalIgnoreCase))
                {
                    ServeWorkspaceFile(http);
                    return;
                }

                if (path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
                {
                    string? headerToken = http.Request.Headers["X-Devtools-Token"]?.Trim();
                    string? queryToken = http.Request.QueryString["token"]?.Trim();
                    string? provided = !string.IsNullOrEmpty(headerToken) ? headerToken : queryToken;

                    if (!string.Equals(provided, _token, StringComparison.Ordinal))
                    {
                        JsonUtil.WriteJson(http, 401, new { ok = false, error = "unauthorized" });
                        return;
                    }
                }

                var ctx = new ApiContext(http, _monitor, _helper);
                if (_router.TryRoute(ctx, out var handler))
                {
                    handler(ctx);
                    return;
                }

                JsonUtil.WriteJson(http, 404, new { ok = false, error = "not_found" });
            }
            catch (Exception ex)
            {
                try { ApplyCors(http.Response); } catch { }
                JsonUtil.WriteJson(http, 500, new { ok = false, error = "server_error", details = ex.Message });
            }
        }

        private void ServeWorkspaceFile(HttpListenerContext http)
        {
            var urlPath = http.Request.Url?.AbsolutePath ?? "/workspace/";
            var rel = urlPath.Substring("/workspace".Length);

            if (string.IsNullOrEmpty(rel) || rel == "/")
                rel = "/index.html";

            rel = rel.Replace('\\', '/');
            if (rel.StartsWith("/")) rel = rel.Substring(1);

            var fullPath = Path.GetFullPath(Path.Combine(WorkspaceRoot, rel));
            var rootFull = Path.GetFullPath(WorkspaceRoot);

            if (!fullPath.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
            {
                http.Response.StatusCode = 403;
                WriteText(http, "Forbidden");
                return;
            }

            if (Directory.Exists(fullPath))
                fullPath = Path.Combine(fullPath, "index.html");

            if (!File.Exists(fullPath))
            {
                http.Response.StatusCode = 404;
                WriteText(http, "Not found");
                return;
            }

            try
            {
                var bytes = File.ReadAllBytes(fullPath);

                http.Response.StatusCode = 200;
                http.Response.ContentType = GetContentType(fullPath);
                http.Response.Headers["Cache-Control"] = "no-store, max-age=0";
                http.Response.Headers["Pragma"] = "no-cache";

                http.Response.OutputStream.Write(bytes, 0, bytes.Length);
                http.Response.OutputStream.Close();
            }
            catch (Exception ex)
            {
                _monitor.Log($"ServeWorkspaceFile error for '{fullPath}': {ex}", LogLevel.Error);
                http.Response.StatusCode = 500;
                WriteText(http, "Error serving file");
            }
        }

        private static void WriteText(HttpListenerContext http, string text)
        {
            var bytes = System.Text.Encoding.UTF8.GetBytes(text);
            http.Response.ContentType = "text/plain; charset=utf-8";
            http.Response.OutputStream.Write(bytes, 0, bytes.Length);
            http.Response.OutputStream.Close();
        }
    }
}