using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;
using StardewValley.TokenizableStrings;
using System;
using System.Collections.Generic;
using System.Linq;

namespace StardewLocalAPI.Modules
{
    internal sealed class CookingRecipesModule : IApiModule
    {
        private readonly IModHelper _helper;

        public CookingRecipesModule(IModHelper helper)
        {
            _helper = helper;
        }

        public void Register(ApiRouter router)
        {
            router.Map("GET", "/api/v1/recipes/cooking", ctx =>
            {
                var recipes = LoadCookingRecipes()
                    .OrderBy(x => x.DisplayName)
                    .ThenBy(x => x.Name)
                    .Select(x => new
                    {
                        name = x.Name,
                        displayName = x.DisplayName,
                        ingredients = x.Ingredients.Select(i => new
                        {
                            itemId = i.ItemId,
                            quantity = i.Quantity
                        }).ToList(),
                        yieldItemId = x.YieldItemId,
                        unlockType = x.UnlockType,
                        unlockNpc = x.UnlockNpc,
                        unlockHearts = x.UnlockHearts,
                        unlockSkill = x.UnlockSkill,
                        unlockLevel = x.UnlockLevel,
                        unlockRaw = x.UnlockRaw,
                        displayNameRaw = x.DisplayNameRaw,
                        raw = x.Raw
                    })
                    .ToList();

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, recipes });
            });
        }

        private sealed class CookingRecipeRow
        {
            public string Name;
            public string DisplayName;
            public string DisplayNameRaw;
            public string YieldItemId;
            public string UnlockType;
            public string UnlockNpc;
            public int? UnlockHearts;
            public string UnlockSkill;
            public int? UnlockLevel;
            public string UnlockRaw;
            public string Raw;
            public List<IngredientRow> Ingredients = new();
        }

        private sealed class IngredientRow
        {
            public string ItemId;
            public int Quantity;
        }

        private IEnumerable<CookingRecipeRow> LoadCookingRecipes()
        {
            Dictionary<string, string> dict;
            try
            {
                dict = _helper.GameContent.Load<Dictionary<string, string>>("Data/CookingRecipes");

            }
            catch
            {
                yield break;
            }

            foreach (var kvp in dict)
            {
                string recipeName = kvp.Key ?? "";
                string raw = kvp.Value ?? "";
                var parts = raw.Split('/');

                string ingredientsRaw = parts.Length > 0 ? parts[0] : "";
                string yieldItemId = parts.Length > 2 ? parts[2] : "";
                string unlockRaw = parts.Length > 3 ? parts[3] : "";
                string displayNameRaw = parts.Length > 4 ? parts[4] : "";

                string displayName = ResolveTextSafe(
                    string.IsNullOrWhiteSpace(displayNameRaw) ? recipeName : displayNameRaw,
                    recipeName
                );

                var row = new CookingRecipeRow
                {
                    Name = recipeName,
                    DisplayName = string.IsNullOrWhiteSpace(displayName) ? recipeName : displayName,
                    DisplayNameRaw = displayNameRaw,
                    YieldItemId = yieldItemId,
                    UnlockRaw = unlockRaw,
                    Raw = raw
                };

                ParseIngredientsInto(ingredientsRaw, row.Ingredients);
                ParseUnlockInto(unlockRaw, row);

                yield return row;
            }
        }

        private static void ParseIngredientsInto(string raw, List<IngredientRow> into)
        {
            if (string.IsNullOrWhiteSpace(raw) || into == null)
                return;

            var parts = raw.Split(' ', StringSplitOptions.RemoveEmptyEntries);

            for (int i = 0; i + 1 < parts.Length; i += 2)
            {
                string itemId = parts[i];
                int qty = 1;

                int.TryParse(parts[i + 1], out qty);
                if (qty <= 0)
                    qty = 1;

                into.Add(new IngredientRow
                {
                    ItemId = itemId,
                    Quantity = qty
                });
            }
        }

        private static void ParseUnlockInto(string raw, CookingRecipeRow row)
        {
            if (row == null)
                return;

            row.UnlockType = "other";

            if (string.IsNullOrWhiteSpace(raw))
            {
                row.UnlockType = "other";
                return;
            }

            var parts = raw.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0)
            {
                row.UnlockType = "other";
                return;
            }

            string kind = parts[0];

            if (string.Equals(kind, "default", StringComparison.OrdinalIgnoreCase))
            {
                row.UnlockType = "default";
                return;
            }

            if (string.Equals(kind, "f", StringComparison.OrdinalIgnoreCase))
            {
                row.UnlockType = "friendship";

                if (parts.Length >= 2)
                    row.UnlockNpc = parts[1];

                if (parts.Length >= 3 && int.TryParse(parts[2], out int hearts))
                    row.UnlockHearts = hearts;

                return;
            }

            if (string.Equals(kind, "s", StringComparison.OrdinalIgnoreCase))
            {
                row.UnlockType = "skill";

                if (parts.Length >= 2)
                    row.UnlockSkill = parts[1];

                if (parts.Length >= 3 && int.TryParse(parts[2], out int level))
                    row.UnlockLevel = level;

                return;
            }

            if (string.Equals(kind, "none", StringComparison.OrdinalIgnoreCase))
            {
                row.UnlockType = "none";
                return;
            }

            row.UnlockType = "other";
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
    }
}