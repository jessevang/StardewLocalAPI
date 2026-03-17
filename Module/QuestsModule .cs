using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley.TokenizableStrings;
using System;
using System.Collections.Generic;
using System.Linq;

namespace StardewLocalAPI.Modules
{
    internal sealed class QuestsModule : IApiModule
    {
        private readonly IModHelper _helper;

        public QuestsModule(IModHelper helper)
        {
            _helper = helper;
        }

        public void Register(ApiRouter router)
        {
            router.Map("GET", "/api/v1/quests", ctx =>
            {
                var quests = LoadQuests()
                    .OrderBy(x => x.Title)
                    .ThenBy(x => x.Id)
                    .Select(x => new
                    {
                        id = x.Id,
                        type = x.Type,
                        title = x.Title,
                        description = x.Description,
                        objective = x.Objective,
                        trigger = x.Trigger,
                        nextQuestId = x.NextQuestId,
                        moneyReward = x.MoneyReward,
                        rewardDescription = x.RewardDescription,
                        canBeCancelled = x.CanBeCancelled,
                        titleRaw = x.TitleRaw,
                        descriptionRaw = x.DescriptionRaw,
                        objectiveRaw = x.ObjectiveRaw,
                        raw = x.Raw
                    })
                    .ToList();

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, quests });
            });
        }

        private sealed class QuestRow
        {
            public string Id;
            public string Type;
            public string Title;
            public string Description;
            public string Objective;
            public string Trigger;
            public int? NextQuestId;
            public int? MoneyReward;
            public string RewardDescription;
            public bool CanBeCancelled;

            public string TitleRaw;
            public string DescriptionRaw;
            public string ObjectiveRaw;
            public string Raw;
        }

        private IEnumerable<QuestRow> LoadQuests()
        {
            Dictionary<string, string> dict;
            try
            {
                dict = _helper.GameContent.Load<Dictionary<string, string>>("Data/Quests");
            }
            catch
            {
                yield break;
            }

            foreach (var kvp in dict)
            {
                string id = kvp.Key ?? "";
                string raw = kvp.Value ?? "";
                var parts = raw.Split('/');

                string type = parts.Length > 0 ? parts[0] : "";
                string titleRaw = parts.Length > 1 ? parts[1] : "";
                string descriptionRaw = parts.Length > 2 ? parts[2] : "";
                string objectiveRaw = parts.Length > 3 ? parts[3] : "";
                string trigger = parts.Length > 4 ? parts[4] : "";
                string nextQuestIdRaw = parts.Length > 5 ? parts[5] : "";
                string moneyRewardRaw = parts.Length > 6 ? parts[6] : "";
                string rewardDescription = parts.Length > 7 ? parts[7] : "";
                string canBeCancelledRaw = parts.Length > 8 ? parts[8] : "";

                int? nextQuestId = null;
                if (int.TryParse(nextQuestIdRaw, out int parsedNextQuestId) && parsedNextQuestId >= 0)
                    nextQuestId = parsedNextQuestId;

                int? moneyReward = null;
                if (int.TryParse(moneyRewardRaw, out int parsedMoneyReward) && parsedMoneyReward >= 0)
                    moneyReward = parsedMoneyReward;

                bool canBeCancelled = false;
                bool.TryParse(canBeCancelledRaw, out canBeCancelled);

                yield return new QuestRow
                {
                    Id = id,
                    Type = type,
                    Title = ResolveTextSafe(titleRaw, id),
                    Description = ResolveTextSafe(descriptionRaw, ""),
                    Objective = ResolveTextSafe(objectiveRaw, ""),
                    Trigger = trigger,
                    NextQuestId = nextQuestId,
                    MoneyReward = moneyReward,
                    RewardDescription = rewardDescription,
                    CanBeCancelled = canBeCancelled,
                    TitleRaw = titleRaw,
                    DescriptionRaw = descriptionRaw,
                    ObjectiveRaw = objectiveRaw,
                    Raw = raw
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