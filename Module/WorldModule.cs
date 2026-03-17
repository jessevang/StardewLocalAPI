using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;
using System.Linq;

namespace StardewLocalAPI.Modules
{
    internal sealed class WorldModule : IApiModule
    {
        private readonly IModHelper _helper;
        public WorldModule(IModHelper helper) => _helper = helper;

        public void Register(ApiRouter router)
        {
            router.Map("GET", "/api/v1/world/locations", ctx =>
            {
                var locs = Context.IsWorldReady
                    ? Game1.locations.Select(l => l.NameOrUniqueName).Distinct().OrderBy(s => s).ToList()
                    : new System.Collections.Generic.List<string>();

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, locations = locs });
            });
        }
    }
}