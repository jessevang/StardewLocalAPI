using StardewLocalAPI.Core;
using StardewModdingAPI;
using System;
using System.IO;
using System.Text;
using System.Text.Json;

namespace StardewLocalAPI.Modules
{
    internal sealed class ProjectStorageModule : IApiModule
    {
        private readonly IMonitor _monitor;
        private readonly ProjectStore _projectStore;

        private static readonly JsonSerializerOptions JsonOpts = new()
        {
            PropertyNameCaseInsensitive = true,
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        };

        public ProjectStorageModule(IMonitor monitor, ProjectStore projectStore)
        {
            _monitor = monitor ?? throw new ArgumentNullException(nameof(monitor));
            _projectStore = projectStore ?? throw new ArgumentNullException(nameof(projectStore));
        }

        public void Register(ApiRouter router)
        {
            router.Map("GET", "/api/v1/eventbuilder/loadProjects", ctx =>
            {
                HandleListProjects(ctx);
            });

            router.Map("POST", "/api/v1/eventbuilder/saveProject", ctx =>
            {
                HandleSaveProject(ctx);
            });
            router.Map("GET", "/api/v1/projects/list", ctx =>
            {
                HandleListProjects(ctx);
            });

            router.Map("GET", "/api/v1/projects/get", ctx =>
            {
                HandleGetProject(ctx);
            });

            router.Map("POST", "/api/v1/projects/save", ctx =>
            {
                HandleSaveProject(ctx);
            });

            router.Map("POST", "/api/v1/projects/delete", ctx =>
            {
                HandleDeleteProject(ctx);
            });
        }

        private void HandleListProjects(ApiContext ctx)
        {
            try
            {
                var projects = _projectStore.ListProjects();
                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, projects });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "projects_list_failed" });
            }
        }

        private void HandleGetProject(ApiContext ctx)
        {
            try
            {
                var id = ctx.Http?.Request?.QueryString?["id"]?.Trim() ?? "";
                if (string.IsNullOrWhiteSpace(id))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_id" });
                    return;
                }

                var project = _projectStore.GetProject(id);
                if (project == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 404, new { ok = false, error = "not_found" });
                    return;
                }

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, project });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "project_get_failed" });
            }
        }

        private void HandleSaveProject(ApiContext ctx)
        {
            try
            {
                var body = ReadBody(ctx.Http.Request.InputStream);
                var req = JsonSerializer.Deserialize<SaveProjectRequest>(body, JsonOpts);

                if (req == null || req.project == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "bad_request" });
                    return;
                }

                var saved = _projectStore.SaveProject(req.project, req.id, req.name);

                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    id = saved.id,
                    name = saved.name,
                    ts = saved.ts,
                    eventCount = saved.documents?.events?.Count ?? 0
                });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "project_save_failed", details = ex.Message });
            }
        }

        private void HandleDeleteProject(ApiContext ctx)
        {
            try
            {
                var body = ReadBody(ctx.Http.Request.InputStream);
                var req = JsonSerializer.Deserialize<DeleteByIdRequest>(body, JsonOpts);

                var id = req?.id?.Trim() ?? "";
                if (string.IsNullOrWhiteSpace(id))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_id" });
                    return;
                }

                bool ok = _projectStore.DeleteProject(id);
                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, id, deleted = ok });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "project_delete_failed" });
            }
        }

        private static string ReadBody(Stream input)
        {
            using var sr = new StreamReader(input, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 64 * 1024, leaveOpen: true);
            return sr.ReadToEnd();
        }

        private sealed class SaveProjectRequest
        {
            public string? id { get; set; }
            public string? name { get; set; }
            public ProjectEnvelope? project { get; set; }
        }

        private sealed class DeleteByIdRequest
        {
            public string? id { get; set; }
        }
    }
}