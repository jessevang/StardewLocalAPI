using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;

namespace StardewLocalAPI.Modules
{
    internal sealed class MetaModule : IApiModule
    {
        private readonly IModHelper _helper;
        public MetaModule(IModHelper helper) => _helper = helper;

        public void Register(ApiRouter router)
        {
            router.Map("GET", "/api/v1/meta", ctx =>
            {
                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    gameVersion = Game1.version,
                    smapiVersion = _helper.ModRegistry.Get("SMAPI")?.Manifest.Version.ToString() ?? "",
                    worldReady = Context.IsWorldReady,
                    player = Context.IsWorldReady ? Game1.player?.Name : null,
                    location = Context.IsWorldReady ? Game1.currentLocation?.NameOrUniqueName : null
                });
            });

            router.Map("GET", "/api/v1/routes", ctx =>
            {
                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, routes = router.GetRoutes() });
            });
        }
    }
}