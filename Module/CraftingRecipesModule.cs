using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley.TokenizableStrings;
using System;
using System.Collections.Generic;
using System.Linq;

namespace StardewLocalAPI.Modules
{
    internal sealed class CraftingRecipesModule : IApiModule
    {
        private readonly IModHelper _helper;

        public CraftingRecipesModule(IModHelper helper)
        {
            _helper = helper;
        }

        public void Register(ApiRouter router)
        {
            router.Map("GET", "/api/v1/recipes/crafting", ctx =>
            {
                var recipes = LoadCraftingRecipes()
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
                        yieldQuantity = x.YieldQuantity,
                        isBigCraftable = x.IsBigCraftable,
                        unlockType = x.UnlockType,
                        unlockSkill = x.UnlockSkill,
                        unlockLevel = x.UnlockLevel,
                        unlockRaw = x.UnlockRaw,
                        category = x.Category,
                        displayNameRaw = x.DisplayNameRaw,
                        raw = x.Raw
                    })
                    .ToList();

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, recipes });
            });
        }

        private sealed class CraftingRecipeRow
        {
            public string Name;
            public string DisplayName;
            public string DisplayNameRaw;
            public string Category;
            public string YieldItemId;
            public int YieldQuantity;
            public bool IsBigCraftable;
            public string UnlockType;
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

        private IEnumerable<CraftingRecipeRow> LoadCraftingRecipes()
        {
            Dictionary<string, string> dict;
            try
            {
                dict = _helper.GameContent.Load<Dictionary<string, string>>("Data/CraftingRecipes");
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
                string category = parts.Length > 1 ? parts[1] : "";
                string yieldRaw = parts.Length > 2 ? parts[2] : "";
                string bigCraftableRaw = parts.Length > 3 ? parts[3] : "";
                string unlockRaw = parts.Length > 4 ? parts[4] : "";
                string displayNameRaw = parts.Length > 5 ? parts[5] : "";

                string displayName = ResolveTextSafe(
                    string.IsNullOrWhiteSpace(displayNameRaw) ? recipeName : displayNameRaw,
                    recipeName
                );

                var row = new CraftingRecipeRow
                {
                    Name = recipeName,
                    DisplayName = string.IsNullOrWhiteSpace(displayName) ? recipeName : displayName,
                    DisplayNameRaw = displayNameRaw,
                    Category = category,
                    IsBigCraftable = string.Equals(bigCraftableRaw, "true", StringComparison.OrdinalIgnoreCase),
                    UnlockRaw = unlockRaw,
                    Raw = raw,
                    YieldQuantity = 1
                };

                ParseIngredientsInto(ingredientsRaw, row.Ingredients);
                ParseYieldInto(yieldRaw, row);
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

        private static void ParseYieldInto(string raw, CraftingRecipeRow row)
        {
            if (row == null || string.IsNullOrWhiteSpace(raw))
                return;

            var parts = raw.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 1)
                row.YieldItemId = parts[0];

            if (parts.Length >= 2 && int.TryParse(parts[1], out int qty) && qty > 0)
                row.YieldQuantity = qty;
        }

        private static void ParseUnlockInto(string raw, CraftingRecipeRow row)
        {
            if (row == null)
                return;

            row.UnlockType = "other";

            if (string.IsNullOrWhiteSpace(raw))
                return;

            var parts = raw.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0)
                return;

            string kind = parts[0];

            if (string.Equals(kind, "default", StringComparison.OrdinalIgnoreCase))
            {
                row.UnlockType = "default";
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

            if (string.Equals(kind, "none", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(kind, "null", StringComparison.OrdinalIgnoreCase))
            {
                row.UnlockType = "none";
                return;
            }
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