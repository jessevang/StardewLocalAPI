using StardewModdingAPI;
using StardewModdingAPI.Utilities;

namespace StardewLocalAPI
{
    public sealed class ModConfig
    {
        public bool EnableServer { get; set; } = true;

        public int Port { get; set; } = 0;

        public bool EnableIpv6Loopback { get; set; } = true;

        public string Token { get; set; } = "";

        public bool LogRequests { get; set; } = false;

        public int MaxRequestsPerSecond { get; set; } = 30;

        public bool AutoOpenWorkspace { get; set; } = true;

        public string WorkspacePath { get; set; } = "workspace/index.html";

        public KeybindList OpenWorkspaceKeys { get; set; } = new(
            new Keybind(SButton.F11)
        );
    }
}