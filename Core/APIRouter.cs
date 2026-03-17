using StardewModdingAPI;
using System;
using System.Collections.Generic;

namespace StardewLocalAPI.Core
{
    internal delegate void ApiHandler(ApiContext ctx);

    internal sealed class ApiRouter
    {
        private readonly IMonitor _monitor;
        private readonly Dictionary<(string method, string path), ApiHandler> _routes = new();

        public ApiRouter(IMonitor monitor) => _monitor = monitor;

        public void Map(string method, string path, ApiHandler handler)
        {
            method = method.ToUpperInvariant();
            path = path.TrimEnd('/');
            _routes[(method, path)] = handler;
        }

        public bool TryRoute(ApiContext ctx, out ApiHandler handler)
        {
            return _routes.TryGetValue((ctx.Method, ctx.Path), out handler!);
        }

        public IEnumerable<(string method, string path)> GetRoutes() => _routes.Keys;
    }
}