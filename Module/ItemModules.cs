using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;
using StardewValley.GameData.Objects;
using StardewValley.GameData.BigCraftables;
using StardewValley.GameData.Weapons;
using StardewValley.GameData.Shirts;
using StardewValley.TokenizableStrings;
using System;
using System.Collections.Generic;
using System.Linq;

namespace StardewLocalAPI.Modules
{
    internal sealed class ItemsModule : IApiModule
    {
        private readonly IModHelper _helper;
        public ItemsModule(IModHelper helper) => _helper = helper;

        public void Register(ApiRouter router)
        {

            router.Map("GET", "/api/v1/items/objects", ctx =>
            {
                var items = LoadObjects()
                    .Select(x => new
                    {
                        type = x.type,
                        token = x.token,
                        id = x.id,
                        name = x.name,
                        displayName = x.displayName,
                        displayNameRaw = x.displayNameRaw
                    })
                    .OrderBy(x => x.displayName)
                    .ToList();

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, items });
            });


            router.Map("GET", "/api/v1/items/big-craftables", ctx =>
            {
                var items = LoadBigCraftables()
                    .Select(x => new
                    {
                        type = x.type,
                        token = x.token,
                        id = x.id,
                        name = x.name,
                        displayName = x.displayName,
                        displayNameRaw = x.displayNameRaw
                    })
                    .OrderBy(x => x.displayName)
                    .ToList();

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, items });
            });


            router.Map("GET", "/api/v1/items/weapons", ctx =>
            {
                var items = LoadWeapons()
                    .Select(x => new
                    {
                        type = x.type,
                        token = x.token,
                        id = x.id,
                        name = x.name,
                        displayName = x.displayName,
                        displayNameRaw = x.displayNameRaw
                    })
                    .OrderBy(x => x.displayName)
                    .ToList();

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, items });
            });


            router.Map("GET", "/api/v1/items/shirts", ctx =>
            {
                var items = LoadShirts()
                    .Select(x => new
                    {
                        type = x.type,
                        token = x.token,
                        id = x.id,
                        name = x.name,
                        displayName = x.displayName,
                        displayNameRaw = x.displayNameRaw
                    })
                    .OrderBy(x => x.displayName)
                    .ToList();

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, items });
            });


            router.Map("GET", "/api/v1/items/boots", ctx =>
            {
                var items = LoadBoots()
                    .Select(x => new
                    {
                        type = x.type,
                        token = x.token,
                        id = x.id,
                        name = x.name,
                        displayName = x.displayName,
                        displayNameRaw = x.displayNameRaw
                    })
                    .OrderBy(x => x.displayName)
                    .ToList();

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, items });
            });


            router.Map("GET", "/api/v1/items/hats", ctx =>
            {
                var items = LoadHats()
                    .Select(x => new
                    {
                        type = x.type,
                        token = x.token,
                        id = x.id,
                        name = x.name,
                        displayName = x.displayName,
                        displayNameRaw = x.displayNameRaw
                    })
                    .OrderBy(x => x.displayName)
                    .ToList();

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, items });
            });


            router.Map("GET", "/api/v1/items/all", ctx =>
            {
                var all = new List<ItemRow>(4096);

                all.AddRange(LoadObjects());
                all.AddRange(LoadBigCraftables());
                all.AddRange(LoadWeapons());
                all.AddRange(LoadShirts());
                all.AddRange(LoadBoots());
                all.AddRange(LoadHats());
                var items = all
                    .GroupBy(x => x.token ?? $"{x.type}:{x.id}")
                    .Select(g => g.First())
                    .OrderBy(x => x.displayName)
                    .Select(x => new
                    {
                        type = x.type,
                        token = x.token,
                        id = x.id,
                        name = x.name,
                        displayName = x.displayName,
                        displayNameRaw = x.displayNameRaw
                    })
                    .ToList();

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, items });
            });
        }
        private sealed class ItemRow
        {
            public string type;
            public string token;
            public string id;
            public string name;
            public string displayName;
            public string displayNameRaw;
        }
        private static string ResolveTextSafe(string raw, string fallback)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return fallback;

            try
            {
                return TokenParser.ParseText(raw);
            }
            catch
            {
                return raw ?? fallback;
            }
        }

        private static string MakeToken(string kind, string id)
        {
            return kind switch
            {
                "object" => $"(O){id}",
                "bigCraftable" => $"(BC){id}",
                "weapon" => $"(W){id}",
                "boots" => $"(B){id}",
                "hat" => $"(H){id}",
                "shirt" => $"(S){id}",
                _ => id
            };
        }
        private IEnumerable<ItemRow> LoadObjects()
        {
            Dictionary<string, ObjectData> dict;
            try { dict = _helper.GameContent.Load<Dictionary<string, ObjectData>>("Data/Objects"); }
            catch { yield break; }

            foreach (var kvp in dict)
            {
                var id = kvp.Key;
                var data = kvp.Value;

                var rawName = data?.Name;
                var rawDisplay = data?.DisplayName;

                var display = ResolveTextSafe(rawDisplay, rawName ?? id);

                yield return new ItemRow
                {
                    type = "object",
                    token = MakeToken("object", id),
                    id = id,
                    name = rawName ?? id,
                    displayName = display,
                    displayNameRaw = rawDisplay
                };
            }
        }

        private IEnumerable<ItemRow> LoadBigCraftables()
        {
            Dictionary<string, BigCraftableData> dict;
            try { dict = _helper.GameContent.Load<Dictionary<string, BigCraftableData>>("Data/BigCraftables"); }
            catch { yield break; }

            foreach (var kvp in dict)
            {
                var id = kvp.Key;
                var data = kvp.Value;

                var rawName = data?.Name;
                var rawDisplay = data?.DisplayName;

                var display = ResolveTextSafe(rawDisplay, rawName ?? id);

                yield return new ItemRow
                {
                    type = "bigCraftable",
                    token = MakeToken("bigCraftable", id),
                    id = id,
                    name = rawName ?? id,
                    displayName = display,
                    displayNameRaw = rawDisplay
                };
            }
        }

        private IEnumerable<ItemRow> LoadWeapons()
        {
            Dictionary<string, WeaponData> dict;
            try { dict = _helper.GameContent.Load<Dictionary<string, WeaponData>>("Data/Weapons"); }
            catch { yield break; }

            foreach (var kvp in dict)
            {
                var id = kvp.Key;
                var data = kvp.Value;

                var rawName = data?.Name;
                var rawDisplay = data?.DisplayName;

                var display = ResolveTextSafe(rawDisplay, rawName ?? id);

                yield return new ItemRow
                {
                    type = "weapon",
                    token = MakeToken("weapon", id),
                    id = id,
                    name = rawName ?? id,
                    displayName = display,
                    displayNameRaw = rawDisplay
                };
            }
        }

        private IEnumerable<ItemRow> LoadShirts()
        {
            Dictionary<string, ShirtData> dict;
            try { dict = _helper.GameContent.Load<Dictionary<string, ShirtData>>("Data/Shirts"); }
            catch { yield break; }

            foreach (var kvp in dict)
            {
                var id = kvp.Key;
                var data = kvp.Value;

                var rawName = data?.Name;
                var rawDisplay = data?.DisplayName;

                var display = ResolveTextSafe(rawDisplay, rawName ?? id);

                yield return new ItemRow
                {
                    type = "shirt",
                    token = MakeToken("shirt", id),
                    id = id,
                    name = rawName ?? id,
                    displayName = display,
                    displayNameRaw = rawDisplay
                };
            }
        }
        private IEnumerable<ItemRow> LoadBoots()
        {
            Dictionary<string, string> dict;
            try { dict = _helper.GameContent.Load<Dictionary<string, string>>("Data/Boots"); }
            catch { yield break; }

            foreach (var kvp in dict)
            {
                var id = kvp.Key;
                var raw = kvp.Value ?? "";

                var parts = raw.Split('/');
                var rawName = parts.Length > 0 ? parts[0] : id;
                var rawDisplay = parts.Length > 0 ? parts[0] : id;
                if (parts.Length > 0 && !string.IsNullOrWhiteSpace(parts[^1]))
                    rawDisplay = parts[^1];

                var display = ResolveTextSafe(rawDisplay, rawName ?? id);

                yield return new ItemRow
                {
                    type = "boots",
                    token = MakeToken("boots", id),
                    id = id,
                    name = rawName ?? id,
                    displayName = display,
                    displayNameRaw = raw
                };
            }
        }
        private IEnumerable<ItemRow> LoadHats()
        {
            Dictionary<string, string> dict;
            try { dict = _helper.GameContent.Load<Dictionary<string, string>>("Data/Hats"); }
            catch { yield break; }

            foreach (var kvp in dict)
            {
                var id = kvp.Key;
                var raw = kvp.Value ?? "";

                var parts = raw.Split('/');
                var rawName = parts.Length > 0 ? parts[0] : id;

                string rawDisplay = rawName;
                if (parts.Length > 0)
                {
                    var last = parts[^1];
                    if (!string.IsNullOrWhiteSpace(last) && !IsAllDigits(last))
                        rawDisplay = last;
                    if (parts.Length >= 2 && IsAllDigits(parts[^1]) && !string.IsNullOrWhiteSpace(parts[^2]))
                        rawDisplay = parts[^2];
                }

                var display = ResolveTextSafe(rawDisplay, rawName ?? id);

                yield return new ItemRow
                {
                    type = "hat",
                    token = MakeToken("hat", id),
                    id = id,
                    name = rawName ?? id,
                    displayName = display,
                    displayNameRaw = raw
                };
            }
        }

        private static bool IsAllDigits(string s)
        {
            if (string.IsNullOrEmpty(s)) return false;
            for (int i = 0; i < s.Length; i++)
                if (s[i] < '0' || s[i] > '9')
                    return false;
            return true;
        }
    }
}