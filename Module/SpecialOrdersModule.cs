using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley.GameData.SpecialOrders;
using StardewValley.TokenizableStrings;
using System;
using System.Collections.Generic;
using System.Linq;

namespace StardewLocalAPI.Modules
{
    internal sealed class SpecialOrdersModule : IApiModule
    {
        private readonly IModHelper _helper;

        public SpecialOrdersModule(IModHelper helper)
        {
            _helper = helper;
        }

        public void Register(ApiRouter router)
        {
            router.Map("GET", "/api/v1/special-orders", ctx =>
            {
                var orders = LoadSpecialOrders()
                    .OrderBy(x => x.DisplayName)
                    .ThenBy(x => x.Id)
                    .Select(x => new
                    {
                        id = x.Id,
                        displayName = x.DisplayName,
                        requester = x.Requester,
                        duration = x.Duration,
                        repeatable = x.Repeatable,
                        requiredTags = x.RequiredTags,
                        condition = x.Condition,
                        orderType = x.OrderType,
                        specialRule = x.SpecialRule,
                        text = x.Text,
                        objectiveCount = x.ObjectiveCount,
                        rewardCount = x.RewardCount,
                        nameRaw = x.NameRaw,
                        textRaw = x.TextRaw
                    })
                    .ToList();

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, orders });
            });
        }

        private sealed class SpecialOrderRow
        {
            public string Id;
            public string DisplayName;
            public string Requester;
            public string Duration;
            public bool Repeatable;
            public string RequiredTags;
            public string Condition;
            public string OrderType;
            public string SpecialRule;
            public string Text;
            public int ObjectiveCount;
            public int RewardCount;

            public string NameRaw;
            public string TextRaw;
        }

        private IEnumerable<SpecialOrderRow> LoadSpecialOrders()
        {
            Dictionary<string, SpecialOrderData> dict;
            try
            {
                dict = _helper.GameContent.Load<Dictionary<string, SpecialOrderData>>("Data/SpecialOrders");
            }
            catch
            {
                yield break;
            }

            foreach (var kvp in dict)
            {
                string id = kvp.Key ?? "";
                SpecialOrderData data = kvp.Value;

                if (data == null)
                    continue;

                string resolvedName = ResolveTextSafe(data.Name, id);
                string resolvedText = ResolveTextSafe(data.Text, "");

                yield return new SpecialOrderRow
                {
                    Id = id,
                    DisplayName = string.IsNullOrWhiteSpace(resolvedName) ? id : resolvedName,
                    Requester = data.Requester ?? "",
                    Duration = data.Duration.ToString(),
                    Repeatable = data.Repeatable,
                    RequiredTags = data.RequiredTags ?? "",
                    Condition = data.Condition ?? "",
                    OrderType = data.OrderType ?? "",
                    SpecialRule = data.SpecialRule ?? "",
                    Text = resolvedText,
                    ObjectiveCount = data.Objectives?.Count ?? 0,
                    RewardCount = data.Rewards?.Count ?? 0,
                    NameRaw = data.Name ?? "",
                    TextRaw = data.Text ?? ""
                };
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