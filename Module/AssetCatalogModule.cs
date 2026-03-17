using StardewLocalAPI.Core;
using StardewModdingAPI;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace StardewLocalAPI.Modules
{
    internal sealed class AssetCatalogModule : IApiModule
    {
        private readonly IModHelper _helper;
        private readonly IMonitor _monitor;

        public AssetCatalogModule(IModHelper helper, IMonitor monitor)
        {
            _helper = helper;
            _monitor = monitor;
        }

        private sealed class AssetEntry
        {
            public string Group { get; init; } = "";
            public string Kind { get; init; } = "";
            public string Name { get; init; } = "";
            public string AssetName { get; init; } = "";
            public string Source { get; init; } = "";
        }

        public void Register(ApiRouter router)
        {
            router.Map("GET", "/api/v1/assets/list", ctx =>
            {
                string group = (ctx.Http.Request.QueryString["group"] ?? "").Trim();
                string kind = (ctx.Http.Request.QueryString["kind"] ?? "").Trim();
                string search = (ctx.Http.Request.QueryString["search"] ?? "").Trim();

                var items = BuildList(group);

                if (!string.IsNullOrWhiteSpace(kind))
                {
                    items = items
                        .Where(p => string.Equals(p.Kind, kind, StringComparison.OrdinalIgnoreCase))
                        .ToList();
                }

                if (!string.IsNullOrWhiteSpace(search))
                {
                    items = items
                        .Where(p =>
                            p.Name.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                            p.AssetName.Contains(search, StringComparison.OrdinalIgnoreCase))
                        .ToList();
                }

                items = items
                    .OrderBy(p => p.Kind, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(p => p.AssetName, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    group,
                    count = items.Count,
                    items = items.Select(p => new
                    {
                        group = p.Group,
                        kind = p.Kind,
                        name = p.Name,
                        assetName = p.AssetName,
                        source = p.Source
                    }).ToList()
                });
            });

            router.Map("GET", "/api/v1/assets/groups", ctx =>
            {
                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    groups = new[]
                    {
                        new { key = "tempactors", label = "Temporary Actors" }
                    }
                });
            });
        }

        private List<AssetEntry> BuildList(string group)
        {
            if (string.Equals(group, "tempactors", StringComparison.OrdinalIgnoreCase))
                return BuildTempActorList();

            return new List<AssetEntry>();
        }

        private List<AssetEntry> BuildTempActorList()
        {
            var map = new Dictionary<string, AssetEntry>(StringComparer.OrdinalIgnoreCase);

            TryAddFolderScan(
                map,
                group: "tempactors",
                kind: "Character",
                folderPath: Path.Combine(Constants.GamePath, "Content (unpacked)", "Characters"),
                assetPrefix: "Characters",
                source: "vanilla_scan",
                topOnly: true,
                excludeNestedKinds: true
            );

            TryAddFolderScan(
                map,
                group: "tempactors",
                kind: "Animal",
                folderPath: Path.Combine(Constants.GamePath, "Content (unpacked)", "Animals"),
                assetPrefix: "Animals",
                source: "vanilla_scan",
                topOnly: true,
                excludeNestedKinds: false
            );

            TryAddFolderScan(
                map,
                group: "tempactors",
                kind: "Monster",
                folderPath: Path.Combine(Constants.GamePath, "Content (unpacked)", "Characters", "Monsters"),
                assetPrefix: "Characters/Monsters",
                source: "vanilla_scan",
                topOnly: true,
                excludeNestedKinds: false
            );

            return map.Values.ToList();
        }

        private void TryAddFolderScan(
            Dictionary<string, AssetEntry> map,
            string group,
            string kind,
            string folderPath,
            string assetPrefix,
            string source,
            bool topOnly,
            bool excludeNestedKinds)
        {
            try
            {
                if (!Directory.Exists(folderPath))
                    return;

                var option = topOnly ? SearchOption.TopDirectoryOnly : SearchOption.AllDirectories;

                foreach (string file in Directory.EnumerateFiles(folderPath, "*.png", option))
                {
                    string name = Path.GetFileNameWithoutExtension(file);

                    if (excludeNestedKinds && string.IsNullOrWhiteSpace(name))
                        continue;

                    string assetName = $"{assetPrefix}/{name}".Replace('\\', '/');

                    if (!map.ContainsKey(assetName))
                    {
                        map[assetName] = new AssetEntry
                        {
                            Group = group,
                            Kind = kind,
                            Name = name,
                            AssetName = assetName,
                            Source = source
                        };
                    }
                }
            }
            catch (Exception ex)
            {
                _monitor.Log($"Asset catalog scan failed for '{folderPath}': {ex}", LogLevel.Warn);
            }
        }
    }
}
