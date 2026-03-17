using StardewModdingAPI;
using System.Net;

namespace StardewLocalAPI.Core
{
    internal sealed class ApiContext
    {
        public ApiContext(HttpListenerContext http, IMonitor monitor, IModHelper helper)
        {
            Http = http;
            Monitor = monitor;
            Helper = helper;
        }

        public HttpListenerContext Http { get; }
        public IMonitor Monitor { get; }
        public IModHelper Helper { get; }

        public string Method => Http.Request.HttpMethod.ToUpperInvariant();
        public string Path => (Http.Request.Url?.AbsolutePath ?? "/").TrimEnd('/');
    }
}