using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;
using StardewValley.GameData.Characters;
using System;
using System.Collections.Generic;
using System.Threading;

namespace StardewLocalAPI.Modules
{
    internal sealed class WorldNpcsModule : IApiModule
    {
        private readonly IModHelper _helper;
        private readonly GameActionQueue _actions;
        private readonly IMonitor _monitor;

        public WorldNpcsModule(IModHelper helper, GameActionQueue actions, IMonitor monitor)
        {
            _helper = helper ?? throw new ArgumentNullException(nameof(helper));
            _actions = actions ?? throw new ArgumentNullException(nameof(actions));
            _monitor = monitor ?? throw new ArgumentNullException(nameof(monitor));
        }

        public void Register(ApiRouter router)
        {
            if (router is null)
                throw new ArgumentNullException(nameof(router));

            router.Map("GET", "/api/v1/world/npcs", GetNpcs);
        }

        private void GetNpcs(ApiContext ctx)
        {
            var results = RunOnGameThread(() =>
            {
                var list = new List<NpcInfo>();

                if (Game1.characterData != null)
                {
                    foreach (KeyValuePair<string, CharacterData> pair in Game1.characterData)
                    {
                        string name = (pair.Key ?? "").Trim();
                        if (string.IsNullOrWhiteSpace(name))
                            continue;

                        if (ShouldSkipName(name))
                            continue;

                        list.Add(BuildNpcInfo(name, pair.Value));
                    }
                }

                list.Sort((a, b) =>
                    string.Compare(
                        a.DisplayName ?? a.Name,
                        b.DisplayName ?? b.Name,
                        StringComparison.OrdinalIgnoreCase));

                return list;
            });

            JsonUtil.WriteJson(ctx.Http, 200, new
            {
                ok = true,
                count = results.Count,
                npcs = results
            });
        }

        private NpcInfo BuildNpcInfo(string name, CharacterData? data)
        {
            string displayName = name;

            try
            {
                string parsedDisplayName = NPC.GetDisplayName(name);
                if (!string.IsNullOrWhiteSpace(parsedDisplayName))
                    displayName = parsedDisplayName;
                else if (data != null && !string.IsNullOrWhiteSpace(data.DisplayName))
                    displayName = data.DisplayName;
            }
            catch
            {
                if (data != null && !string.IsNullOrWhiteSpace(data.DisplayName))
                    displayName = data.DisplayName;
            }

            bool hasDialogue = HasDialogueAsset(name);

            bool canSocialize = false;
            try
            {
                canSocialize = NPC.CanSocializePerData(name, Game1.currentLocation);
            }
            catch
            {
                canSocialize = false;
            }

            return new NpcInfo
            {
                Name = name,
                DisplayName = displayName,
                HasDialogue = hasDialogue,
                CanSocialize = canSocialize,
                IsLoaded = false,
                IsVillager = true,
                IsSimpleNonVillagerNpc = false
            };
        }

        private bool HasDialogueAsset(string name)
        {
            try
            {
                string assetKey = $"Characters/Dialogue/{name}";
                var parsed = _helper.GameContent.ParseAssetName(assetKey);
                return _helper.GameContent.DoesAssetExist<Dictionary<string, string>>(parsed);
            }
            catch
            {
                return false;
            }
        }

        private static bool ShouldSkipName(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return true;

            if (name.Equals("???", StringComparison.OrdinalIgnoreCase))
                return true;

            if (name.Contains("?"))
                return true;

            if (name.Equals("MarriageDialogue", StringComparison.OrdinalIgnoreCase))
                return true;

            if (name.Equals("Endless", StringComparison.OrdinalIgnoreCase))
                return true;

            return false;
        }

        private T RunOnGameThread<T>(Func<T> func, int timeoutMs = 5000)
        {
            if (func is null)
                throw new ArgumentNullException(nameof(func));

            var done = new ManualResetEventSlim(false);
            T result = default!;
            Exception? error = null;

            _actions.Enqueue(() =>
            {
                try
                {
                    result = func();
                }
                catch (Exception ex)
                {
                    error = ex;
                }
                finally
                {
                    done.Set();
                }
            });

            if (!done.Wait(timeoutMs))
                throw new TimeoutException("Timed out waiting for game-thread NPC query.");

            if (error != null)
                throw new Exception("Game-thread NPC query failed.", error);

            return result;
        }

        private sealed class NpcInfo
        {
            public string Name { get; set; } = "";
            public string DisplayName { get; set; } = "";
            public bool HasDialogue { get; set; }
            public bool CanSocialize { get; set; }
            public bool IsLoaded { get; set; }
            public bool IsVillager { get; set; }
            public bool IsSimpleNonVillagerNpc { get; set; }
        }
    }
}