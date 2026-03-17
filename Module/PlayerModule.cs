using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;
using System.Text.Json;

namespace StardewLocalAPI.Modules
{
    internal sealed class PlayerModule : IApiModule
    {
        private readonly IModHelper _helper;
        private readonly GameActionQueue _actions;

        public PlayerModule(IModHelper helper, GameActionQueue actions)
        {
            _helper = helper;
            _actions = actions;
        }

        public void Register(ApiRouter router)
        {
            router.Map("POST", "/api/v1/player/warp", ctx =>
            {
                var doc = JsonUtil.ReadJsonBody(ctx.Http.Request, out var err);
                if (doc == null) { JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_body", details = err }); return; }

                JsonElement root = doc.RootElement;
                string? location = JsonUtil.GetString(root, "location");
                int x = JsonUtil.GetInt(root, "x");
                int y = JsonUtil.GetInt(root, "y");

                if (string.IsNullOrWhiteSpace(location))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_location" });
                    return;
                }

                _actions.Enqueue(() =>
                {
                    try { Game1.warpFarmer(location!, x, y, false); }
                    catch { }
                });

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true });
            });

            router.Map("POST", "/api/v1/world/setTime", ctx =>
            {
                var doc = JsonUtil.ReadJsonBody(ctx.Http.Request, out var err);
                if (doc == null) { JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_body", details = err }); return; }

                int time = JsonUtil.GetInt(doc.RootElement, "time", 1200);

                _actions.Enqueue(() =>
                {
                    if (!Context.IsWorldReady) return;
                    if (time < 600) time = 600;
                    if (time > 2600) time = 2600;
                    Game1.timeOfDay = time;
                });

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true });
            });
        }
    }
}