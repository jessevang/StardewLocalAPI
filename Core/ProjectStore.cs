using StardewModdingAPI;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace StardewLocalAPI.Core
{
    internal sealed class ProjectStore
    {
        private readonly IModHelper _helper;
        private readonly IMonitor _monitor;

        private static readonly JsonSerializerOptions JsonOpts = new()
        {
            PropertyNameCaseInsensitive = true,
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        };

        public ProjectStore(IModHelper helper, IMonitor monitor)
        {
            _helper = helper ?? throw new ArgumentNullException(nameof(helper));
            _monitor = monitor ?? throw new ArgumentNullException(nameof(monitor));
        }

        public List<ProjectListItem> ListProjects()
        {
            EnsureDir(GetProjectsRootDir());

            var index = LoadProjectsIndexInternal();
            index.projects ??= new List<ProjectListItem>();

            return index.projects
                .OrderByDescending(p => p.ts)
                .ToList();
        }

        public ProjectEnvelope? GetProject(string id)
        {
            id = SafeId(id);
            if (string.IsNullOrWhiteSpace(id))
                return null;

            var path = GetProjectFilePath(id);
            if (!File.Exists(path))
                return null;

            try
            {
                var raw = File.ReadAllText(path, Encoding.UTF8);
                var project = JsonSerializer.Deserialize<ProjectEnvelope>(raw, JsonOpts);
                if (project == null)
                    return null;

                project.documents ??= new ProjectDocumentsEnvelope();
                project.documents.events ??= new List<ProjectEventDocument>();
                return project;
            }
            catch (Exception ex)
            {
                _monitor.Log($"Failed loading project '{id}': {ex}", LogLevel.Warn);
                return null;
            }
        }

        public ProjectEnvelope SaveProject(ProjectEnvelope project, string? explicitId = null, string? explicitName = null)
        {
            if (project == null)
                throw new ArgumentNullException(nameof(project));

            string name = (explicitName ?? project.name ?? "").Trim();
            if (string.IsNullOrWhiteSpace(name))
                name = "New Project";

            if (name.Length > 120)
                name = name[..120];

            string id = SafeId(explicitId ?? project.id ?? MakeIdFromName(name));
            if (string.IsNullOrWhiteSpace(id))
                throw new InvalidOperationException("Project id is invalid.");

            var normalized = NormalizeProjectEnvelope(project, id, name);

            EnsureDir(GetProjectDir(id));
            File.WriteAllText(GetProjectFilePath(id), JsonSerializer.Serialize(normalized, JsonOpts), Encoding.UTF8);

            var index = LoadProjectsIndexInternal();
            index.projects ??= new List<ProjectListItem>();
            index.projects.RemoveAll(p => string.Equals(p.id, id, StringComparison.OrdinalIgnoreCase));
            index.projects.Add(new ProjectListItem
            {
                id = normalized.id ?? id,
                name = normalized.name ?? name,
                ts = normalized.ts,
                eventCount = normalized.documents?.events?.Count ?? 0
            });
            index.projects = index.projects.OrderByDescending(p => p.ts).ToList();
            SaveProjectsIndexInternal(index);

            return normalized;
        }

        public bool DeleteProject(string id)
        {
            id = SafeId(id);
            if (string.IsNullOrWhiteSpace(id))
                return false;

            bool deletedAnything = false;

            var projectDir = GetProjectDir(id);
            if (Directory.Exists(projectDir))
            {
                try
                {
                    Directory.Delete(projectDir, recursive: true);
                    deletedAnything = true;
                }
                catch (Exception ex)
                {
                    _monitor.Log($"Failed deleting project dir '{projectDir}': {ex}", LogLevel.Warn);
                }
            }

            var index = LoadProjectsIndexInternal();
            index.projects ??= new List<ProjectListItem>();
            int before = index.projects.Count;
            index.projects.RemoveAll(p => string.Equals(p.id, id, StringComparison.OrdinalIgnoreCase));
            SaveProjectsIndexInternal(index);

            return deletedAnything || index.projects.Count != before;
        }

        public ProjectEnvelope? UpsertEvent(string projectId, ProjectEventDocument eventDoc)
        {
            projectId = SafeId(projectId);
            if (string.IsNullOrWhiteSpace(projectId) || eventDoc == null)
                return null;

            var project = GetProject(projectId);
            if (project == null)
                return null;

            project.documents ??= new ProjectDocumentsEnvelope();
            project.documents.events ??= new List<ProjectEventDocument>();

            var normalized = NormalizeProjectEvent(eventDoc);
            if (string.IsNullOrWhiteSpace(normalized.id))
                normalized.id = MakeProjectEventId(normalized.name, normalized.header?.eventId, normalized.header?.location);

            if (string.IsNullOrWhiteSpace(normalized.id))
                return null;

            project.documents.events.RemoveAll(x => string.Equals(x.id, normalized.id, StringComparison.OrdinalIgnoreCase));
            project.documents.events.Add(normalized);

            project.documents.events = project.documents.events
                .OrderByDescending(x => x.ts)
                .ThenBy(x => x.name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            return SaveProject(project, project.id, project.name);
        }

        public bool DeleteEvent(string projectId, string eventId, out int deletedCount)
        {
            deletedCount = 0;

            projectId = SafeId(projectId);
            eventId = SafeId(eventId);

            if (string.IsNullOrWhiteSpace(projectId) || string.IsNullOrWhiteSpace(eventId))
                return false;

            var project = GetProject(projectId);
            if (project == null)
                return false;

            project.documents ??= new ProjectDocumentsEnvelope();
            project.documents.events ??= new List<ProjectEventDocument>();

            deletedCount = project.documents.events.RemoveAll(x => string.Equals(x.id, eventId, StringComparison.OrdinalIgnoreCase));

            SaveProject(project, project.id, project.name);
            return true;
        }

        private ProjectsIndex LoadProjectsIndexInternal()
        {
            try
            {
                var path = GetProjectsIndexPath();
                if (!File.Exists(path))
                    return new ProjectsIndex { projects = new List<ProjectListItem>() };

                var raw = File.ReadAllText(path, Encoding.UTF8);
                return JsonSerializer.Deserialize<ProjectsIndex>(raw, JsonOpts)
                    ?? new ProjectsIndex { projects = new List<ProjectListItem>() };
            }
            catch (Exception ex)
            {
                _monitor.Log($"Failed loading projects index: {ex}", LogLevel.Warn);
                return new ProjectsIndex { projects = new List<ProjectListItem>() };
            }
        }

        private void SaveProjectsIndexInternal(ProjectsIndex index)
        {
            EnsureDir(GetProjectsRootDir());
            index.projects ??= new List<ProjectListItem>();
            var path = GetProjectsIndexPath();
            File.WriteAllText(path, JsonSerializer.Serialize(index, JsonOpts), Encoding.UTF8);
        }

        private ProjectEnvelope NormalizeProjectEnvelope(ProjectEnvelope project, string id, string name)
        {
            project.id = id;
            project.name = (name ?? "").Trim();
            if (string.IsNullOrWhiteSpace(project.name))
                project.name = "New Project";

            project.ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (project.v <= 0)
                project.v = 1;

            project.manifest ??= new object();
            project.settings ??= new object();
            project.documents ??= new ProjectDocumentsEnvelope();
            project.documents.events ??= new List<ProjectEventDocument>();

            var normalizedEvents = new List<ProjectEventDocument>();
            foreach (var ev in project.documents.events)
            {
                if (ev == null)
                    continue;

                var normalized = NormalizeProjectEvent(ev);
                if (string.IsNullOrWhiteSpace(normalized.id))
                    normalized.id = MakeProjectEventId(normalized.name, normalized.header?.eventId, normalized.header?.location);

                if (string.IsNullOrWhiteSpace(normalized.id))
                    continue;

                if (normalizedEvents.Any(x => string.Equals(x.id, normalized.id, StringComparison.OrdinalIgnoreCase)))
                    continue;

                normalizedEvents.Add(normalized);
            }

            project.documents.events = normalizedEvents
                .OrderByDescending(e => e.ts)
                .ThenBy(e => e.name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            return project;
        }

        private ProjectEventDocument NormalizeProjectEvent(ProjectEventDocument ev)
        {
            ev.id = SafeId(ev.id ?? "");
            ev.name = (ev.name ?? "").Trim();

            ev.header ??= new ProjectEventHeader();
            ev.state ??= new object();

            if (string.IsNullOrWhiteSpace(ev.name))
            {
                var headerEventId = (ev.header.eventId ?? "").Trim();
                if (!string.IsNullOrWhiteSpace(headerEventId))
                    ev.name = headerEventId;
                else
                    ev.name = "Event";
            }

            ev.ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (ev.v <= 0)
                ev.v = 1;

            return ev;
        }

        private static string MakeProjectEventId(string? name, string? headerEventId, string? location)
        {
            var seed = !string.IsNullOrWhiteSpace(headerEventId)
                ? headerEventId!
                : !string.IsNullOrWhiteSpace(name)
                    ? name!
                    : !string.IsNullOrWhiteSpace(location)
                        ? $"event_{location}"
                        : "event";

            return SafeId(seed);
        }

        private string GetProjectsRootDir() => Path.Combine(_helper.DirectoryPath, "projects");
        private string GetProjectsIndexPath() => Path.Combine(GetProjectsRootDir(), "event-builder-projects.json");
        private string GetProjectDir(string id) => Path.Combine(GetProjectsRootDir(), SafeId(id));
        private string GetProjectFilePath(string id) => Path.Combine(GetProjectDir(id), "project.json");

        private static void EnsureDir(string dir)
        {
            if (!Directory.Exists(dir))
                Directory.CreateDirectory(dir);
        }

        private static string SafeId(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return "";

            raw = raw.Trim().ToLowerInvariant();
            var sb = new StringBuilder(raw.Length);

            foreach (var ch in raw)
            {
                if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '-' || ch == ' ')
                    sb.Append(ch);
            }

            var s = sb.ToString().Trim().Replace(' ', '_');
            if (s.Length > 64)
                s = s[..64];

            return s;
        }

        private static string MakeIdFromName(string name)
            => SafeId(name) + "_" + DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    }
}