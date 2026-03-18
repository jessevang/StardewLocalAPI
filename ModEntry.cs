using HarmonyLib;
using StardewLocalAPI.Core;
using StardewLocalAPI.Modules;
using StardewLocalAPI.Modules.Builders;
using StardewModdingAPI;
using StardewModdingAPI.Events;
using StardewValley;
using StardewValley.Monsters;
using System;
using System.Diagnostics;
using System.Threading;

namespace StardewLocalAPI
{
    public sealed class ModEntry : Mod
    {
        private RuntimePlatformKind _runtimePlatform = RuntimePlatformKind.Unknown;
        private ModConfig _config = null!;
        private DevServer? _server;
        private readonly GameActionQueue _actions = new();
        private Harmony? _harmony;
        private readonly DialoguePlaybackService _dialoguePlayer = new DialoguePlaybackService();
        private bool _saveLoaded = false;
        private WorkspaceEventsStore? _workspaceEventsStore;

        public override void Entry(IModHelper helper)
        {
            _config = helper.ReadConfig<ModConfig>();

            _runtimePlatform = DetectRuntimePlatform();
            Monitor.Log($"StardewLocalAPI detected runtime platform: {_runtimePlatform}", LogLevel.Info);

            _harmony = new Harmony(this.ModManifest.UniqueID);
            _harmony.PatchAll();

            helper.Events.GameLoop.GameLaunched += OnGameLaunched;
            helper.Events.GameLoop.UpdateTicked += OnUpdateTicked;
            helper.Events.GameLoop.SaveLoaded += OnSaveLoaded;
            helper.Events.GameLoop.ReturnedToTitle += OnReturnedToTitle;
            helper.Events.Input.ButtonPressed += OnButtonPressed;
        }

        private void OnGameLaunched(object? sender, GameLaunchedEventArgs e)
        {
            if (!_config.EnableServer)
            {
                Monitor.Log("StardewLocalAPI server disabled in config.", LogLevel.Info);
                return;
            }

            string token = string.IsNullOrWhiteSpace(_config.Token)
                ? TokenUtil.GenerateToken(32)
                : _config.Token.Trim();


   

            var router = new ApiRouter(Monitor);
            new MetaModule(Helper).Register(router);
            new WorldModule(Helper).Register(router);
            new PlayerModule(Helper, _actions).Register(router);
            new EventsModule(Helper, _actions, Monitor).Register(router);
            new ItemsModule(Helper).Register(router);
            new MusicModule(Helper, _actions, Monitor).Register(router);
            new DialogueModule(Helper, _actions, Monitor, _dialoguePlayer).Register(router);
            var workspaceEventsStore = new WorkspaceEventsStore(Helper, Monitor, _actions);
            var projectStore = new ProjectStore(Helper, Monitor);

            new CookingRecipesModule(Helper).Register(router);
            new CraftingRecipesModule(Helper).Register(router);

            new WorkspaceEventsModule(Helper, Monitor, _actions, workspaceEventsStore).Register(router);
            new ProjectStorageModule(Monitor, projectStore).Register(router);
            new EventBuilderStorageModule(Helper, Monitor, _actions, workspaceEventsStore, projectStore).Register(router);
            new TextureSheetsModule(Helper, Monitor, _actions).Register(router);
            new TempActorAssetsModule(Helper, Monitor, _actions).Register(router);
            new AssetCatalogModule(Helper, Monitor).Register(router);



            new QuestsModule(Helper).Register(router);
            new SpecialOrdersModule(Helper).Register(router);

            _workspaceEventsStore = workspaceEventsStore;
            new WorkspaceStaticModule(Helper).Register(router);
            new ScreenshotsModule(Helper, Monitor, _actions, _config.Port).Register(router);
            new WorldNpcsModule(Helper, _actions, Monitor).Register(router);

            _server = new DevServer(
                monitor: Monitor,
                helper: Helper,
                router: router,
                port: _config.Port,
                token: token,
                enableIpv6: _config.EnableIpv6Loopback,
                logRequests: _config.LogRequests,
                maxRps: _config.MaxRequestsPerSecond,
                platform: _runtimePlatform
            );

            _server.Start();

            Monitor.Log($"Local API token: {token}", LogLevel.Info);
            Monitor.Log($"Local API listening: http://127.0.0.1:{_server.Port}/api/v1/meta", LogLevel.Info);

            _saveLoaded = false;
            _server.SetSaveLoaded(false);


        }

        private void OnSaveLoaded(object? sender, SaveLoadedEventArgs e)
        {
            _saveLoaded = true;
            _server?.SetSaveLoaded(true);
        }

        private void OnButtonPressed(object? sender, ButtonPressedEventArgs e)
        {
            if (!Context.IsPlayerFree)
                return;

            if (e.Button != SButton.F11)
                return;

            if (_server == null)
            {
                Game1.showRedMessage("DevServer is not running (EnableServer=false).");
                return;
            }

            if (!Context.IsWorldReady || !_saveLoaded)
            {
                Game1.showRedMessage("Load a save first, then press F11.");
                return;
            }

            TryOpenWorkspace(_server.Port, _server.TokenForClient);
        }

        private void OnUpdateTicked(object? sender, UpdateTickedEventArgs e)
        {
            _actions.Drain(Monitor);
            _workspaceEventsStore?.Tick();

            if (!Context.IsWorldReady)
                return;

            _dialoguePlayer.Tick();
        }

        private void OnReturnedToTitle(object? sender, ReturnedToTitleEventArgs e)
        {
            _actions.Clear();
            _saveLoaded = false;
            _server?.SetSaveLoaded(false);
        }

        private void TryOpenWorkspace(int port, string token)
        {
            try
            {
                string path = string.IsNullOrWhiteSpace(_config.WorkspacePath)
                    ? "workspace/index.html"
                    : _config.WorkspacePath.Trim().TrimStart('/');

                var builder = new UriBuilder($"http://127.0.0.1:{port}/{path}");
                var existing = builder.Query;
                var q = new System.Collections.Specialized.NameValueCollection();

                if (!string.IsNullOrWhiteSpace(existing))
                {
                    var s = existing.TrimStart('?');
                    foreach (var part in s.Split('&', StringSplitOptions.RemoveEmptyEntries))
                    {
                        var kv = part.Split('=', 2);
                        var k = Uri.UnescapeDataString(kv[0]);
                        var v = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : "";
                        q[k] = v;
                    }
                }

                q["token"] = token;
                q["autoconnect"] = "1";

                var partsOut = new System.Collections.Generic.List<string>();
                foreach (string key in q.AllKeys)
                {
                    if (key == null) continue;
                    var val = q[key] ?? "";
                    partsOut.Add($"{Uri.EscapeDataString(key)}={Uri.EscapeDataString(val)}");
                }
                builder.Query = string.Join("&", partsOut);

                string url = builder.Uri.ToString();

                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                Monitor.Log($"Failed to open workspace: {ex}", LogLevel.Warn);
            }
        }

        private RuntimePlatformKind DetectRuntimePlatform()
        {
            return Constants.TargetPlatform switch
            {
                GamePlatform.Windows => RuntimePlatformKind.Windows,
                GamePlatform.Linux => RuntimePlatformKind.Linux,
                GamePlatform.Mac => RuntimePlatformKind.MacOS,
                _ => RuntimePlatformKind.Unknown
            };
        }
    }
}