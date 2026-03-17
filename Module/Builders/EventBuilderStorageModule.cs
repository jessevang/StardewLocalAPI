using Microsoft.Xna.Framework;
using StardewLocalAPI.Core;
using StardewModdingAPI;
using StardewValley;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace StardewLocalAPI.Modules.Builders
{
    internal sealed class EventBuilderStorageModule : IApiModule
    {
        private readonly IModHelper _helper;
        private readonly IMonitor _monitor;
        private readonly GameActionQueue _actions;
        private readonly WorkspaceEventsStore _workspaceEventsStore;
        private readonly ProjectStore _projectStore;

        private static readonly JsonSerializerOptions JsonOpts = new()
        {
            PropertyNameCaseInsensitive = true,
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        };


        public EventBuilderStorageModule(
            IModHelper helper,
            IMonitor monitor,
            GameActionQueue actions,
            WorkspaceEventsStore workspaceEventsStore,
            ProjectStore projectStore)
        {
            _helper = helper ?? throw new ArgumentNullException(nameof(helper));
            _monitor = monitor ?? throw new ArgumentNullException(nameof(monitor));
            _actions = actions ?? throw new ArgumentNullException(nameof(actions));
            _workspaceEventsStore = workspaceEventsStore ?? throw new ArgumentNullException(nameof(workspaceEventsStore));
            _projectStore = projectStore ?? throw new ArgumentNullException(nameof(projectStore));
        }

        public void Register(ApiRouter router)
        {
            router.Map("GET", "/api/v1/eventbuilder/loadPresets", ctx =>
            {
                HandleLoadGroupPresets(ctx);
            });

            router.Map("POST", "/api/v1/eventbuilder/savePreset", ctx =>
            {
                HandleSaveGroupPresets(ctx);
            });
            router.Map("POST", "/api/v1/eventbuilder/projects/events/upsert", ctx =>
            {
                HandleProjectUpsertEvent(ctx);
            });

            router.Map("POST", "/api/v1/eventbuilder/projects/events/delete", ctx =>
            {
                HandleProjectDeleteEvent(ctx);
            });
            router.Map("GET", "/api/v1/eventbuilder/presets/groups", ctx =>
            {
                HandleLoadGroupPresets(ctx);
            });

            router.Map("POST", "/api/v1/eventbuilder/presets/groups", ctx =>
            {
                HandleSaveGroupPresets(ctx);
            });

            router.Map("POST", "/api/v1/eventbuilder/presets/groups/delete", ctx =>
            {
                HandleDeleteGroupPreset(ctx);
            });

            router.Map("POST", "/api/v1/eventbuilder/presets/groupImage", ctx =>
            {
                try
                {
                    var body = ReadBody(ctx.Http.Request.InputStream);
                    var req = JsonSerializer.Deserialize<ImageSaveRequest>(body, JsonOpts);
                    if (req == null)
                    {
                        JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "bad_request" });
                        return;
                    }

                    var presetId = SafeId(req.presetId);
                    if (string.IsNullOrWhiteSpace(presetId))
                    {
                        JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "invalid_preset_id" });
                        return;
                    }

                    var dataUrl = (req.dataUrl ?? "").Trim();
                    if (dataUrl.Length > 2_000_000)
                    {
                        JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "image_too_large" });
                        return;
                    }

                    var comma = dataUrl.IndexOf(',');
                    if (comma < 0 || !dataUrl.StartsWith("data:image", StringComparison.OrdinalIgnoreCase))
                    {
                        JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "invalid_data_url" });
                        return;
                    }

                    var header = dataUrl[..comma].ToLowerInvariant();

                    string ext;
                    if (header.Contains("png"))
                        ext = "png";
                    else if (header.Contains("jpeg") || header.Contains("jpg"))
                        ext = "jpg";
                    else if (header.Contains("gif"))
                        ext = "gif";
                    else
                    {
                        JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "only_png_jpeg_gif_supported" });
                        return;
                    }

                    var b64 = dataUrl[(comma + 1)..];
                    byte[] bytes;
                    try { bytes = Convert.FromBase64String(b64); }
                    catch
                    {
                        JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "invalid_base64" });
                        return;
                    }

                    var imgDir = GetGroupPresetImagesDir();
                    EnsureDir(imgDir);

                    var filePath = Path.Combine(imgDir, $"{presetId}.{ext}");
                    File.WriteAllBytes(filePath, bytes);

                    JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, file = $"presets/images/{presetId}.{ext}" });
                }
                catch (Exception ex)
                {
                    _monitor.Log(ex.ToString(), LogLevel.Error);
                    JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "image_write_failed" });
                }
            });

            router.Map("GET", "/api/v1/eventbuilder/presets/image", ctx =>
            {
                try
                {
                    string? file = ctx.Http.Request.QueryString["file"];
                    file = (file ?? "").Trim();

                    if (string.IsNullOrWhiteSpace(file))
                    {
                        JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_file" });
                        return;
                    }

                    file = file.Replace('\\', '/');
                    if (!file.StartsWith("presets/images/", StringComparison.OrdinalIgnoreCase))
                    {
                        JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "invalid_path" });
                        return;
                    }

                    string fileName = Path.GetFileName(file);
                    if (string.IsNullOrWhiteSpace(fileName))
                    {
                        JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "invalid_file" });
                        return;
                    }

                    var imgDir = GetGroupPresetImagesDir();
                    var fullPath = Path.Combine(imgDir, fileName);

                    if (!File.Exists(fullPath))
                    {
                        ctx.Http.Response.StatusCode = 404;
                        ctx.Http.Response.OutputStream.Close();
                        return;
                    }

                    string ext = Path.GetExtension(fullPath).ToLowerInvariant();
                    string contentType =
                        ext == ".png" ? "image/png" :
                        (ext == ".jpg" || ext == ".jpeg") ? "image/jpeg" :
                        ext == ".gif" ? "image/gif" :
                        "application/octet-stream";

                    byte[] bytes = File.ReadAllBytes(fullPath);

                    ctx.Http.Response.StatusCode = 200;
                    ctx.Http.Response.ContentType = contentType;
                    ctx.Http.Response.AddHeader("Cache-Control", "no-store");
                    ctx.Http.Response.OutputStream.Write(bytes, 0, bytes.Length);
                    ctx.Http.Response.OutputStream.Close();
                }
                catch (Exception ex)
                {
                    _monitor.Log(ex.ToString(), LogLevel.Error);
                    ctx.Http.Response.StatusCode = 500;
                    try { ctx.Http.Response.OutputStream.Close(); } catch { }
                }
            });
            router.Map("POST", "/api/v1/eventbuilder/runCp", ctx =>
            {
                HandleRunContentPatcher(ctx);
            });
            router.Map("GET", "/api/v1/eventbuilder/saves/list", ctx =>
            {
                HandleListSaves(ctx);
            });

            router.Map("GET", "/api/v1/eventbuilder/saves/get", ctx =>
            {
                HandleGetSave(ctx);
            });

            router.Map("POST", "/api/v1/eventbuilder/saves/autosave", ctx =>
            {
                HandleAutosave(ctx);
            });

            router.Map("POST", "/api/v1/eventbuilder/saves/saveas", ctx =>
            {
                HandleSaveAs(ctx);
            });

            router.Map("POST", "/api/v1/eventbuilder/saves/delete", ctx =>
            {
                HandleDeleteSave(ctx);
            });
        }

        private void HandleProjectUpsertEvent(ApiContext ctx)
        {
            try
            {
                var body = ReadBody(ctx.Http.Request.InputStream);
                var req = JsonSerializer.Deserialize<ProjectUpsertEventRequest>(body, JsonOpts);

                if (req == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "bad_request" });
                    return;
                }

                string projectId = (req.projectId ?? "").Trim();
                if (string.IsNullOrWhiteSpace(projectId))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_project_id" });
                    return;
                }

                if (req.@event == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_event" });
                    return;
                }

                var savedProject = _projectStore.UpsertEvent(projectId, req.@event);
                if (savedProject == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 404, new { ok = false, error = "project_not_found" });
                    return;
                }

                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    projectId = savedProject.id,
                    eventId = req.@event.id,
                    eventCount = savedProject.documents?.events?.Count ?? 0
                });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "project_event_upsert_failed" });
            }
        }

        private void HandleProjectDeleteEvent(ApiContext ctx)
        {
            try
            {
                var body = ReadBody(ctx.Http.Request.InputStream);
                var req = JsonSerializer.Deserialize<ProjectDeleteEventRequest>(body, JsonOpts);

                if (req == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "bad_request" });
                    return;
                }

                string projectId = (req.projectId ?? "").Trim();
                string eventId = (req.eventId ?? "").Trim();

                if (string.IsNullOrWhiteSpace(projectId))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_project_id" });
                    return;
                }

                if (string.IsNullOrWhiteSpace(eventId))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_event_id" });
                    return;
                }

                bool ok = _projectStore.DeleteEvent(projectId, eventId, out int deletedCount);
                if (!ok)
                {
                    JsonUtil.WriteJson(ctx.Http, 404, new { ok = false, error = "project_not_found" });
                    return;
                }

                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    projectId,
                    eventId,
                    deleted = deletedCount
                });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "project_event_delete_failed" });
            }
        }

        private void HandleLoadGroupPresets(ApiContext ctx)
        {
            try
            {
                var path = GetGroupPresetsPath();
                EnsureDir(Path.GetDirectoryName(path)!);

                var json = File.Exists(path) ? File.ReadAllText(path, Encoding.UTF8) : "[]";
                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    presets = JsonSerializer.Deserialize<object>(json, JsonOpts) ?? new object[0]
                });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "presets_read_failed" });
            }
        }

        private void HandleSaveGroupPresets(ApiContext ctx)
        {
            try
            {
                var body = ReadBody(ctx.Http.Request.InputStream);
                var req = JsonSerializer.Deserialize<GroupPresetsSaveRequest>(body, JsonOpts) ?? new GroupPresetsSaveRequest();

                var imgDir = GetGroupPresetImagesDir();
                EnsureDir(imgDir);

                var presets = (req.presets ?? new List<GroupPreset>())
                    .Select(p => NormalizePresetAndPersistImage(p, imgDir))
                    .Where(p => !string.IsNullOrWhiteSpace(p.id))
                    .ToList();

                if (presets.Count > 5000)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "too_many_presets" });
                    return;
                }

                var path = GetGroupPresetsPath();
                EnsureDir(Path.GetDirectoryName(path)!);

                File.WriteAllText(path, JsonSerializer.Serialize(presets, JsonOpts), Encoding.UTF8);
                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, count = presets.Count });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "presets_write_failed" });
            }
        }

        private void HandleDeleteGroupPreset(ApiContext ctx)
        {
            try
            {
                var body = ReadBody(ctx.Http.Request.InputStream);
                var req = JsonSerializer.Deserialize<DeleteByIdRequest>(body, JsonOpts);
                var id = SafeId(req?.id ?? "");
                if (string.IsNullOrWhiteSpace(id))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_id" });
                    return;
                }

                var presetsPath = GetGroupPresetsPath();
                EnsureDir(Path.GetDirectoryName(presetsPath)!);

                var presets = new List<GroupPreset>();
                if (File.Exists(presetsPath))
                {
                    var raw = File.ReadAllText(presetsPath, Encoding.UTF8);
                    presets = JsonSerializer.Deserialize<List<GroupPreset>>(raw, JsonOpts) ?? new List<GroupPreset>();
                }

                int before = presets.Count;
                presets.RemoveAll(p => string.Equals(SafeId(p.id), id, StringComparison.OrdinalIgnoreCase));

                File.WriteAllText(presetsPath, JsonSerializer.Serialize(presets, JsonOpts), Encoding.UTF8);

                var imgDir = GetGroupPresetImagesDir();
                if (Directory.Exists(imgDir))
                {
                    foreach (var f in Directory.GetFiles(imgDir, id + ".*"))
                    {
                        try { File.Delete(f); } catch { }
                    }
                }

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, deleted = (before - presets.Count) });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "preset_delete_failed" });
            }
        }

        private void HandleRunContentPatcher(ApiContext ctx)
        {
            try
            {
                var body = ReadBody(ctx.Http.Request.InputStream);
                var req = JsonSerializer.Deserialize<RunCpRequest>(body, JsonOpts);

                if (req == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "bad_request" });
                    return;
                }

                var progress = req.progress;
                if (progress == null || progress.header == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_progress" });
                    return;
                }

                string location = (progress.header.location ?? "").Trim();
                string rawEventId = (progress.header.eventId ?? "").Trim();
                string patchMode = (progress.header.patchMode ?? "edit").Trim().ToLowerInvariant();
                string manifestText = (req.manifestText ?? "").Trim();

                if (string.IsNullOrWhiteSpace(location))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_location" });
                    return;
                }

                if (string.IsNullOrWhiteSpace(rawEventId))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_event_id" });
                    return;
                }

                if (string.IsNullOrWhiteSpace(manifestText))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_manifest" });
                    return;
                }

                using var manifestDoc = JsonDocument.Parse(manifestText);
                var manifestRoot = manifestDoc.RootElement;

                string uniqueId = "";
                if (manifestRoot.TryGetProperty("UniqueID", out var uidEl))
                    uniqueId = (uidEl.GetString() ?? "").Trim();

                if (string.IsNullOrWhiteSpace(uniqueId))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "manifest_missing_uniqueid" });
                    return;
                }

                string cpFor = "";
                if (manifestRoot.TryGetProperty("ContentPackFor", out var cpfEl)
                    && cpfEl.ValueKind == JsonValueKind.Object
                    && cpfEl.TryGetProperty("UniqueID", out var cpUidEl))
                {
                    cpFor = (cpUidEl.GetString() ?? "").Trim();
                }

                if (!string.Equals(cpFor, "Pathoschild.ContentPatcher", StringComparison.OrdinalIgnoreCase))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "manifest_not_content_patcher_pack" });
                    return;
                }

                if (req.outputs == null || req.outputs.contentJson == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_outputs" });
                    return;
                }

                if (!TryExtractGeneratedEventEntryForRunCp(
                    outputs: req.outputs,
                    location: location,
                    rawEventId: rawEventId,
                    manifestUniqueId: uniqueId,
                    out var finalEventId,
                    out var finalScript))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "failed_to_extract_generated_event" });
                    return;
                }

                string eventPrefix = uniqueId + "." + rawEventId;

                string packRoot = GetRunCpContentPackDir();
                EnsureDir(packRoot);

                var writtenFiles = WriteRunCpPackFiles(packRoot, manifestText, req.outputs);

                string reloadUniqueId = GetPackUniqueIdFromManifest(packRoot, uniqueId);

                bool reloadAttempted = false;
                bool reloadOk = false;
                string reloadMessage = "";

                if (req.options?.reloadContentPatcher == true)
                {
                    reloadAttempted = true;
                    reloadOk = TryReloadContentPatcherPack(reloadUniqueId, out reloadMessage);
                }

                _actions.Enqueue(() =>
                {
                    try
                    {
                        _helper.GameContent.InvalidateCache($"Data/Events/{location}");
                    }
                    catch (Exception ex)
                    {
                        _monitor.Log($"Failed to invalidate event asset cache for {location}: {ex}", LogLevel.Warn);
                    }
                });

                bool resetSeenQueued = false;
                bool warpQueued = false;
                bool autoTriggerQueued = false;

                if (req.options?.resetSeen == true || req.options?.warpToSafeTile == true || req.options?.letAutoTrigger == true)
                {
                    _actions.Enqueue(() =>
                    {
                        try
                        {
                            if (Game1.player == null)
                                return;

                            const string TestPackUniqueId = "Darkmushu1.StardewLocalAPI.DevContent";

                            string hardCodedSeenId = $"{TestPackUniqueId}.{rawEventId}";

                            bool removedRaw = Game1.player.eventsSeen.Remove(rawEventId);
                            bool removedHardcoded = Game1.player.eventsSeen.Remove(hardCodedSeenId);
                            bool removedFinal = !string.IsNullOrWhiteSpace(finalEventId) && Game1.player.eventsSeen.Remove(finalEventId);

                            _monitor.Log($"EventBuilder: removed seen event '{rawEventId}' => {removedRaw}", LogLevel.Debug);
                            _monitor.Log($"EventBuilder: removed seen event '{hardCodedSeenId}' => {removedHardcoded}", LogLevel.Debug);

                            if (!string.IsNullOrWhiteSpace(finalEventId))
                                _monitor.Log($"EventBuilder: removed seen event '{finalEventId}' => {removedFinal}", LogLevel.Debug);

                            foreach (string seen in Game1.player.eventsSeen)
                            {
                                if (seen.Contains(rawEventId, StringComparison.OrdinalIgnoreCase))
                                    _monitor.Log($"EventBuilder: still matching seen entry '{seen}'", LogLevel.Debug);
                            }

                            if (Game1.eventUp)
                            {
                                Game1.eventUp = false;
                                _monitor.Log("EventBuilder: cleared Game1.eventUp before retest.", LogLevel.Debug);
                            }
                        }
                        catch (Exception ex)
                        {
                            _monitor.Log($"Failed clearing event seen state before retest: {ex}", LogLevel.Warn);
                        }
                    });

                    _workspaceEventsStore.UpsertAndQueueRetest(
                        location: location,
                        eventIdPrefix: "Darkmushu1.StardewLocalAPI.DevContent." + rawEventId,
                        finalEventId: finalEventId,
                        eventData: finalScript,
                        resetSeen: req.options?.resetSeen == true,
                        warpToSafeTile: req.options?.warpToSafeTile == true,
                        letAutoTrigger: req.options?.letAutoTrigger == true,
                        hudMessage: "This Event has been set to unseen so that it can be played again.",
                        additionalSeenIdsToClear: new[]
                        {
                    rawEventId,
                    "Darkmushu1.StardewLocalAPI.DevContent." + rawEventId,
                    finalEventId
                        }
                    );

                    resetSeenQueued = req.options?.resetSeen == true;
                    warpQueued = req.options?.warpToSafeTile == true;
                    autoTriggerQueued = req.options?.letAutoTrigger == true;
                }

                JsonUtil.WriteJson(ctx.Http, 200, new
                {
                    ok = true,
                    uniqueId,
                    reloadUniqueId,
                    location,
                    rawEventId,
                    qualifiedEventId = uniqueId + "." + rawEventId,
                    patchMode,
                    packFolder = packRoot,
                    wroteContentJson = writtenFiles.wroteContentJson,
                    wroteDataFile = writtenFiles.wroteDataFile,
                    dataFilePath = writtenFiles.firstDataFilePath,
                    wroteI18nFile = writtenFiles.wroteI18nFile,
                    i18nFilePath = writtenFiles.firstI18nFilePath,
                    extraFilesWritten = writtenFiles.extraFilesWritten,
                    reloadAttempted,
                    reloadOk,
                    reloadMessage,
                    resetSeenQueued,
                    warpQueued,
                    autoTriggerQueued
                });
            }
            catch (JsonException ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "invalid_json" });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "run_cp_failed", details = ex.Message });
            }
        }


        private bool TryExtractGeneratedEventEntryForRunCp(
    CpOutputsEnvelope outputs,
    string location,
    string rawEventId,
    string manifestUniqueId,
    out string finalEventId,
    out string finalScript)
        {
            finalEventId = "";
            finalScript = "";
            if (TryExtractGeneratedEventEntryFromEventData(
                outputs.dataFileJson,
                location,
                rawEventId,
                manifestUniqueId,
                out finalEventId,
                out finalScript))
            {
                return true;
            }

            if (outputs.dataFiles != null)
            {
                foreach (var pair in outputs.dataFiles)
                {
                    if (TryExtractGeneratedEventEntryFromEventData(
                        pair.Value,
                        location,
                        rawEventId,
                        manifestUniqueId,
                        out finalEventId,
                        out finalScript))
                    {
                        return true;
                    }
                }
            }
            if (outputs.files != null)
            {
                foreach (var pair in outputs.files)
                {
                    if (TryExtractGeneratedEventEntryFromEventData(
                        pair.Value,
                        location,
                        rawEventId,
                        manifestUniqueId,
                        out finalEventId,
                        out finalScript))
                    {
                        return true;
                    }
                }
            }
            if (outputs.contentJson != null &&
                TryExtractGeneratedEventEntry(
                    outputs.contentJson,
                    location,
                    rawEventId,
                    manifestUniqueId,
                    out finalEventId,
                    out finalScript))
            {
                return true;
            }

            return false;
        }


        private bool TryExtractGeneratedEventEntryFromEventData(
    object? eventDataObj,
    string location,
    string rawEventId,
    string manifestUniqueId,
    out string finalEventId,
    out string finalScript)
        {
            finalEventId = "";
            finalScript = "";

            if (eventDataObj == null)
                return false;

            try
            {
                string json = JsonSerializer.Serialize(eventDataObj, JsonOpts);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.ValueKind == JsonValueKind.Object &&
                    root.TryGetProperty(location, out var locationEl) &&
                    locationEl.ValueKind == JsonValueKind.Object)
                {
                    foreach (var prop in locationEl.EnumerateObject())
                    {
                        if (IsMatchingGeneratedEventId(prop.Name, rawEventId, manifestUniqueId))
                        {
                            finalEventId = NormalizeGeneratedEventId(prop.Name, rawEventId, manifestUniqueId);
                            finalScript = prop.Value.GetString() ?? "";
                            return !string.IsNullOrWhiteSpace(finalEventId) && !string.IsNullOrWhiteSpace(finalScript);
                        }
                    }
                }
                if (root.ValueKind == JsonValueKind.Object &&
                    root.TryGetProperty("Changes", out var changesEl) &&
                    changesEl.ValueKind == JsonValueKind.Array)
                {
                    string targetAsset = $"Data/Events/{location}";

                    foreach (var change in changesEl.EnumerateArray())
                    {
                        if (!change.TryGetProperty("Action", out var actionEl))
                            continue;

                        string action = actionEl.GetString() ?? "";
                        if (!string.Equals(action, "EditData", StringComparison.OrdinalIgnoreCase))
                            continue;

                        if (!change.TryGetProperty("Target", out var targetEl))
                            continue;

                        string target = targetEl.GetString() ?? "";
                        if (!string.Equals(target, targetAsset, StringComparison.OrdinalIgnoreCase))
                            continue;

                        if (!change.TryGetProperty("Entries", out var entriesEl) || entriesEl.ValueKind != JsonValueKind.Object)
                            continue;

                        foreach (var prop in entriesEl.EnumerateObject())
                        {
                            if (IsMatchingGeneratedEventId(prop.Name, rawEventId, manifestUniqueId))
                            {
                                finalEventId = NormalizeGeneratedEventId(prop.Name, rawEventId, manifestUniqueId);
                                finalScript = prop.Value.GetString() ?? "";
                                return !string.IsNullOrWhiteSpace(finalEventId) && !string.IsNullOrWhiteSpace(finalScript);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _monitor.Log($"Failed extracting generated event entry from event data: {ex}", LogLevel.Warn);
            }

            return false;
        }

        private void HandleListSaves(ApiContext ctx)
        {
            try
            {
                EnsureDir(GetSavesDir());
                var autosavePath = GetAutosavePath();
                var savesPath = GetSavesIndexPath();

                object? autosaveMeta = null;
                if (File.Exists(autosavePath))
                {
                    var raw = File.ReadAllText(autosavePath, Encoding.UTF8);
                    var a = JsonSerializer.Deserialize<EventSaveEnvelope>(raw, JsonOpts);
                    if (a != null)
                        autosaveMeta = new { id = "autosave", name = "Autosave", ts = a.ts, header = a.header };
                }

                var saves = new List<EventSaveListItem>();
                if (File.Exists(savesPath))
                {
                    var raw = File.ReadAllText(savesPath, Encoding.UTF8);
                    var idx = JsonSerializer.Deserialize<EventSavesIndex>(raw, JsonOpts);
                    if (idx?.saves != null)
                        saves = idx.saves;
                }

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, autosave = autosaveMeta, saves });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "saves_list_failed" });
            }
        }
        private string GetRunCpContentPackDir()
        {
            var modsRoot = Directory.GetParent(_helper.DirectoryPath)?.FullName ?? _helper.DirectoryPath;
            return Path.Combine(modsRoot, "[CP] StardewLocalAPI Dev");
        }

        private (bool wroteContentJson, bool wroteDataFile, bool wroteI18nFile, string? firstDataFilePath, string? firstI18nFilePath, int extraFilesWritten)
            WriteRunCpPackFiles(string packRoot, string manifestText, CpOutputsEnvelope outputs)
        {
            bool wroteContentJson = false;
            bool wroteDataFile = false;
            bool wroteI18nFile = false;
            string? firstDataFilePath = null;
            string? firstI18nFilePath = null;
            int extraFilesWritten = 0;

            EnsureDir(packRoot);
            string manifestPath = Path.Combine(packRoot, "manifest.json");
            if (!File.Exists(manifestPath))
            {
                File.WriteAllText(manifestPath, manifestText, Encoding.UTF8);
            }
            string contentPath = Path.Combine(packRoot, "content.json");
            File.WriteAllText(
                contentPath,
                JsonSerializer.Serialize(outputs.contentJson, JsonOpts),
                Encoding.UTF8
            );
            wroteContentJson = true;


            if (outputs.dataFileJson != null)
            {
                string rel = NormalizeRelativeJsonPath(
                    string.IsNullOrWhiteSpace(outputs.dataFileRel)
                        ? "events/default.json"
                        : outputs.dataFileRel!
                );

                string full = Path.Combine(packRoot, rel);
                EnsureDir(Path.GetDirectoryName(full)!);

                File.WriteAllText(
                    full,
                    JsonSerializer.Serialize(outputs.dataFileJson, JsonOpts),
                    Encoding.UTF8
                );

                wroteDataFile = true;
                firstDataFilePath ??= full;
            }


            if (outputs.i18nJson != null)
            {
                string rel = NormalizeRelativeJsonPath(
                    string.IsNullOrWhiteSpace(outputs.i18nFileRel)
                        ? "i18n/default.json"
                        : outputs.i18nFileRel!
                );

                string full = Path.Combine(packRoot, rel);
                EnsureDir(Path.GetDirectoryName(full)!);

                File.WriteAllText(
                    full,
                    JsonSerializer.Serialize(outputs.i18nJson, JsonOpts),
                    Encoding.UTF8
                );

                wroteI18nFile = true;
                firstI18nFilePath ??= full;
            }

 
            if (outputs.contentFiles != null)
            {
                foreach (var pair in outputs.contentFiles)
                {
                    string rel = NormalizeRelativeJsonPath(pair.Key);
                    string full = Path.Combine(packRoot, rel);
                    EnsureDir(Path.GetDirectoryName(full)!);

                    File.WriteAllText(
                        full,
                        JsonSerializer.Serialize(pair.Value, JsonOpts),
                        Encoding.UTF8
                    );

                    extraFilesWritten++;
                }
            }


            if (outputs.dataFiles != null)
            {
                foreach (var pair in outputs.dataFiles)
                {
                    string rel = NormalizeRelativeJsonPath(pair.Key);
                    string full = Path.Combine(packRoot, rel);
                    EnsureDir(Path.GetDirectoryName(full)!);

                    File.WriteAllText(
                        full,
                        JsonSerializer.Serialize(pair.Value, JsonOpts),
                        Encoding.UTF8
                    );

                    wroteDataFile = true;
                    firstDataFilePath ??= full;
                    extraFilesWritten++;
                }
            }


            if (outputs.i18nFiles != null)
            {
                foreach (var pair in outputs.i18nFiles)
                {
                    string rel = NormalizeRelativeJsonPath(pair.Key);
                    string full = Path.Combine(packRoot, rel);
                    EnsureDir(Path.GetDirectoryName(full)!);

                    File.WriteAllText(
                        full,
                        JsonSerializer.Serialize(pair.Value, JsonOpts),
                        Encoding.UTF8
                    );

                    wroteI18nFile = true;
                    firstI18nFilePath ??= full;
                    extraFilesWritten++;
                }
            }

            return (wroteContentJson, wroteDataFile, wroteI18nFile, firstDataFilePath, firstI18nFilePath, extraFilesWritten);
        }

        private static string NormalizeRelativeJsonPath(string raw)
        {
            string rel = (raw ?? "").Trim().Replace('\\', '/');

            if (string.IsNullOrWhiteSpace(rel))
                rel = "content.json";

            while (rel.StartsWith("/"))
                rel = rel[1..];

            rel = rel.Replace("../", "").Replace("..\\", "");

            return rel;
        }

        private void HandleGetSave(ApiContext ctx)
        {
            try
            {
                EnsureDir(GetSavesDir());
                var id = SafeId(ctx.Http?.Request?.QueryString?["id"] ?? "");
                if (string.IsNullOrWhiteSpace(id))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_id" });
                    return;
                }

                string path = id == "autosave"
                    ? GetAutosavePath()
                    : Path.Combine(GetSavesDir(), $"event-builder-save_{id}.json");

                if (!File.Exists(path))
                {
                    JsonUtil.WriteJson(ctx.Http, 404, new { ok = false, error = "not_found" });
                    return;
                }

                var raw = File.ReadAllText(path, Encoding.UTF8);
                var obj = JsonSerializer.Deserialize<object>(raw, JsonOpts);
                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, save = obj });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "save_get_failed" });
            }
        }

        private void HandleAutosave(ApiContext ctx)
        {
            try
            {
                EnsureDir(GetSavesDir());
                var body = ReadBody(ctx.Http.Request.InputStream);
                var env = JsonSerializer.Deserialize<EventSaveEnvelope>(body, JsonOpts);
                if (env == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "bad_request" });
                    return;
                }

                env.id = "autosave";
                env.name = "Autosave";
                env.ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                var path = GetAutosavePath();
                File.WriteAllText(path, JsonSerializer.Serialize(env, JsonOpts), Encoding.UTF8);

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "autosave_failed" });
            }
        }

        private void HandleSaveAs(ApiContext ctx)
        {
            try
            {
                EnsureDir(GetSavesDir());
                var body = ReadBody(ctx.Http.Request.InputStream);
                var req = JsonSerializer.Deserialize<SaveAsRequest>(body, JsonOpts);
                if (req == null || string.IsNullOrWhiteSpace(req.name) || req.save == null)
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "bad_request" });
                    return;
                }

                var name = req.name.Trim();
                if (name.Length > 80)
                    name = name[..80];

                var id = SafeId(req.id ?? MakeIdFromName(name));
                if (string.IsNullOrWhiteSpace(id))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "invalid_id" });
                    return;
                }

                var env = req.save;
                env.id = id;
                env.name = name;
                env.ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                var savePath = Path.Combine(GetSavesDir(), $"event-builder-save_{id}.json");
                File.WriteAllText(savePath, JsonSerializer.Serialize(env, JsonOpts), Encoding.UTF8);

                var indexPath = GetSavesIndexPath();
                var idx = File.Exists(indexPath)
                    ? JsonSerializer.Deserialize<EventSavesIndex>(File.ReadAllText(indexPath, Encoding.UTF8), JsonOpts) ?? new EventSavesIndex()
                    : new EventSavesIndex();

                idx.saves ??= new List<EventSaveListItem>();
                idx.saves.RemoveAll(s => string.Equals(s.id, id, StringComparison.OrdinalIgnoreCase));
                idx.saves.Add(new EventSaveListItem
                {
                    id = id,
                    name = name,
                    ts = env.ts,
                    header = env.header
                });

                idx.saves = idx.saves.OrderByDescending(s => s.ts).ToList();

                File.WriteAllText(indexPath, JsonSerializer.Serialize(idx, JsonOpts), Encoding.UTF8);

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, id });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "saveas_failed" });
            }
        }

        private void HandleDeleteSave(ApiContext ctx)
        {
            try
            {
                EnsureDir(GetSavesDir());
                var body = ReadBody(ctx.Http.Request.InputStream);
                var req = JsonSerializer.Deserialize<DeleteByIdRequest>(body, JsonOpts);
                var id = SafeId(req?.id ?? "");
                if (string.IsNullOrWhiteSpace(id))
                {
                    JsonUtil.WriteJson(ctx.Http, 400, new { ok = false, error = "missing_id" });
                    return;
                }

                if (id == "autosave")
                {
                    var ap = GetAutosavePath();
                    if (File.Exists(ap))
                        File.Delete(ap);

                    JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, id = "autosave" });
                    return;
                }

                var savePath = Path.Combine(GetSavesDir(), $"event-builder-save_{id}.json");
                if (File.Exists(savePath))
                    File.Delete(savePath);

                var indexPath = GetSavesIndexPath();
                if (File.Exists(indexPath))
                {
                    var raw = File.ReadAllText(indexPath, Encoding.UTF8);
                    var idx = JsonSerializer.Deserialize<EventSavesIndex>(raw, JsonOpts) ?? new EventSavesIndex();
                    idx.saves ??= new List<EventSaveListItem>();
                    idx.saves.RemoveAll(s => string.Equals(s.id, id, StringComparison.OrdinalIgnoreCase));
                    File.WriteAllText(indexPath, JsonSerializer.Serialize(idx, JsonOpts), Encoding.UTF8);
                }

                JsonUtil.WriteJson(ctx.Http, 200, new { ok = true, id });
            }
            catch (Exception ex)
            {
                _monitor.Log(ex.ToString(), LogLevel.Error);
                JsonUtil.WriteJson(ctx.Http, 500, new { ok = false, error = "save_delete_failed" });
            }
        }

        private static string SafeFolderName(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return "GeneratedContentPack";

            foreach (char c in Path.GetInvalidFileNameChars())
                name = name.Replace(c, '_');

            return name.Trim();
        }

        private bool TryExtractGeneratedEventEntry(
     object contentJsonObj,
     string location,
     string rawEventId,
     string manifestUniqueId,
     out string finalEventId,
     out string finalScript)
        {
            finalEventId = "";
            finalScript = "";

            try
            {
                string json = JsonSerializer.Serialize(contentJsonObj, JsonOpts);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                if (!root.TryGetProperty("Changes", out var changesEl) || changesEl.ValueKind != JsonValueKind.Array)
                    return false;

                string targetAsset = $"Data/Events/{location}";

                foreach (var change in changesEl.EnumerateArray())
                {
                    if (!change.TryGetProperty("Action", out var actionEl))
                        continue;

                    string action = actionEl.GetString() ?? "";
                    if (!string.Equals(action, "EditData", StringComparison.OrdinalIgnoreCase))
                        continue;

                    if (!change.TryGetProperty("Target", out var targetEl))
                        continue;

                    string target = targetEl.GetString() ?? "";
                    if (!string.Equals(target, targetAsset, StringComparison.OrdinalIgnoreCase))
                        continue;

                    if (!change.TryGetProperty("Entries", out var entriesEl) || entriesEl.ValueKind != JsonValueKind.Object)
                        continue;

                    foreach (var prop in entriesEl.EnumerateObject())
                    {
                        if (IsMatchingGeneratedEventId(prop.Name, rawEventId, manifestUniqueId))
                        {
                            finalEventId = NormalizeGeneratedEventId(prop.Name, rawEventId, manifestUniqueId);
                            finalScript = prop.Value.GetString() ?? "";
                            return !string.IsNullOrWhiteSpace(finalEventId) && !string.IsNullOrWhiteSpace(finalScript);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _monitor.Log($"Failed extracting generated event entry: {ex}", LogLevel.Warn);
            }

            return false;
        }


        private static bool IsMatchingGeneratedEventId(string fullEventKey, string rawEventId, string manifestUniqueId)
        {
            if (string.IsNullOrWhiteSpace(fullEventKey) || string.IsNullOrWhiteSpace(rawEventId))
                return false;

            string key = fullEventKey.Trim();

            string actualPrefix = $"{manifestUniqueId}.{rawEventId}";
            string placeholderPrefix1 = $"{{{{ModId}}}}.{rawEventId}";
            string placeholderPrefix2 = $"{{{{modid}}}}.{rawEventId}";

            return key.StartsWith(actualPrefix, StringComparison.OrdinalIgnoreCase)
                || key.StartsWith(placeholderPrefix1, StringComparison.OrdinalIgnoreCase)
                || key.StartsWith(placeholderPrefix2, StringComparison.OrdinalIgnoreCase);
        }

        private static string NormalizeGeneratedEventId(string fullEventKey, string rawEventId, string manifestUniqueId)
        {
            if (string.IsNullOrWhiteSpace(fullEventKey))
                return "";

            string key = fullEventKey.Trim();
            string placeholderPrefix1 = $"{{{{ModId}}}}.{rawEventId}";
            string placeholderPrefix2 = $"{{{{modid}}}}.{rawEventId}";
            string actualPrefix = $"{manifestUniqueId}.{rawEventId}";

            if (key.StartsWith(placeholderPrefix1, StringComparison.OrdinalIgnoreCase))
                return actualPrefix + key.Substring(placeholderPrefix1.Length);

            if (key.StartsWith(placeholderPrefix2, StringComparison.OrdinalIgnoreCase))
                return actualPrefix + key.Substring(placeholderPrefix2.Length);

            return key;
        }

        private string GetGeneratedContentPackDir(string manifestName)
        {
            var modsRoot = Directory.GetParent(_helper.DirectoryPath)?.FullName ?? _helper.DirectoryPath;
            var safeName = SafeFolderName(manifestName);
            return Path.Combine(modsRoot, safeName);
        }



        private string GetManifestName(string manifestText)
        {
            try
            {
                using var doc = JsonDocument.Parse(manifestText);
                if (doc.RootElement.TryGetProperty("Name", out var nameEl))
                {
                    var name = (nameEl.GetString() ?? "").Trim();
                    if (!string.IsNullOrWhiteSpace(name))
                        return name;
                }
            }
            catch { }

            return "GeneratedContentPack";
        }

        private string GetPackUniqueIdFromManifest(string packRoot, string fallbackUniqueId)
        {
            try
            {
                string manifestPath = Path.Combine(packRoot, "manifest.json");
                if (!File.Exists(manifestPath))
                    return fallbackUniqueId;

                using var doc = JsonDocument.Parse(File.ReadAllText(manifestPath, Encoding.UTF8));
                if (doc.RootElement.TryGetProperty("UniqueID", out var uidEl))
                {
                    string uid = (uidEl.GetString() ?? "").Trim();
                    if (!string.IsNullOrWhiteSpace(uid))
                        return uid;
                }
            }
            catch
            {
            }

            return fallbackUniqueId;
        }

        private bool TryReloadContentPatcherPack(string uniqueId, out string message)
        {
            try
            {
                bool cpLoaded = _helper.ModRegistry.IsLoaded("Pathoschild.ContentPatcher");
                if (!cpLoaded)
                {
                    message = "Content Patcher is not loaded.";
                    return false;
                }

                message = $"Run this in the SMAPI console: patch reload {uniqueId}";
                return false;
            }
            catch (Exception ex)
            {
                message = ex.Message;
                return false;
            }
        }

        private GroupPreset NormalizePresetAndPersistImage(GroupPreset p, string imgDir)
        {
            p.id = SafeId(p.id);
            p.name = (p.name ?? "").Trim();
            p.description = (p.description ?? "").Trim();
            p.imageDataUrl = (p.imageDataUrl ?? "").Trim();
            p.items ??= new List<object>();

            if (IsDataImageUrl(p.imageDataUrl))
            {
                if (p.imageDataUrl.Length > 2_000_000)
                {
                    p.imageDataUrl = "";
                    return p;
                }

                if (TryWriteDataUrlToFile(p.imageDataUrl, imgDir, p.id, out var relPath))
                    p.imageDataUrl = relPath;
                else
                    p.imageDataUrl = "";
            }

            return p;
        }

        private static bool IsDataImageUrl(string s)
        {
            if (string.IsNullOrWhiteSpace(s))
                return false;

            s = s.TrimStart();
            return s.StartsWith("data:image", StringComparison.OrdinalIgnoreCase);
        }

        private bool TryWriteDataUrlToFile(string dataUrl, string imgDir, string presetId, out string relPath)
        {
            relPath = "";

            try
            {
                int comma = dataUrl.IndexOf(',');
                if (comma < 0)
                    return false;

                string header = dataUrl.Substring(0, comma).ToLowerInvariant();
                string ext =
                    header.Contains("png") ? "png" :
                    (header.Contains("jpeg") || header.Contains("jpg")) ? "jpg" :
                    header.Contains("gif") ? "gif" :
                    "";

                if (string.IsNullOrWhiteSpace(ext))
                    return false;

                string b64 = dataUrl.Substring(comma + 1);
                byte[] bytes = Convert.FromBase64String(b64);

                string fileName = $"{presetId}.{ext}";
                string filePath = Path.Combine(imgDir, fileName);
                File.WriteAllBytes(filePath, bytes);

                relPath = $"presets/images/{fileName}";
                return true;
            }
            catch (Exception ex)
            {
                _monitor.Log($"Failed to persist preset image for '{presetId}': {ex}", LogLevel.Warn);
                return false;
            }
        }

        private string GetPresetsDir() => Path.Combine(_helper.DirectoryPath, "presets");
        private string GetGroupPresetsPath() => Path.Combine(GetPresetsDir(), "groupPresets.json");
        private string GetGroupPresetImagesDir() => Path.Combine(GetPresetsDir(), "images");

        private string GetSavesDir() => Path.Combine(_helper.DirectoryPath, "saves");
        private string GetSavesIndexPath() => Path.Combine(GetSavesDir(), "event-builder-saves.json");
        private string GetAutosavePath() => Path.Combine(GetSavesDir(), "event-builder-autosave.json");

        private static void EnsureDir(string dir)
        {
            if (!Directory.Exists(dir))
                Directory.CreateDirectory(dir);
        }


        private static string ReadBody(Stream input)
        {
            using var sr = new StreamReader(input, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 64 * 1024, leaveOpen: true);
            return sr.ReadToEnd();
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

        private sealed class GroupPresetsSaveRequest
        {
            public List<GroupPreset>? presets { get; set; }
        }

        private sealed class GroupPreset
        {
            public string id { get; set; } = "";
            public string name { get; set; } = "";
            public string description { get; set; } = "";
            public string imageDataUrl { get; set; } = "";
            public List<object>? items { get; set; }
        }

        private sealed class ImageSaveRequest
        {
            public string presetId { get; set; } = "";
            public string dataUrl { get; set; } = "";
        }

        private sealed class DeleteByIdRequest
        {
            public string? id { get; set; }
        }

        private sealed class EventSavesIndex
        {
            public List<EventSaveListItem>? saves { get; set; }
        }

        private sealed class EventSaveListItem
        {
            public string id { get; set; } = "";
            public string name { get; set; } = "";
            public long ts { get; set; }
            public object? header { get; set; }
        }

        private sealed class EventSaveEnvelope
        {
            public string? id { get; set; }
            public string? name { get; set; }
            public long ts { get; set; }

            public int v { get; set; }
            public EventHeaderEnvelope? header { get; set; }
            public object? manifest { get; set; }
            public object? state { get; set; }
        }

        private sealed class SaveAsRequest
        {
            public string? id { get; set; }
            public string? name { get; set; }
            public EventSaveEnvelope? save { get; set; }
        }

        private sealed class RunCpRequest
        {
            public EventSaveEnvelope? progress { get; set; }
            public string? manifestText { get; set; }
            public object? manifest { get; set; }
            public CpOutputsEnvelope? outputs { get; set; }
            public RunCpOptions? options { get; set; }
        }

        private sealed class RunCpOptions
        {
            public bool reloadContentPatcher { get; set; }
            public bool resetSeen { get; set; }
            public bool warpToSafeTile { get; set; }
            public bool letAutoTrigger { get; set; }
        }

        private sealed class CpOutputsEnvelope
        {
            public string? mode { get; set; }
            public bool splitPreview { get; set; }
            public bool useI18n { get; set; }
            public object? contentJson { get; set; }
            public string? dataFileRel { get; set; }
            public object? dataFileJson { get; set; }
            public object? i18nJson { get; set; }
            public string? i18nFileRel { get; set; }
            public Dictionary<string, object>? files { get; set; }
            public Dictionary<string, object>? contentFiles { get; set; }
            public Dictionary<string, object>? dataFiles { get; set; }
            public Dictionary<string, object>? i18nFiles { get; set; }
        }

        private sealed class EventHeaderEnvelope
        {
            public string? location { get; set; }
            public string? eventId { get; set; }
            public string? music { get; set; }
            public int viewX { get; set; }
            public int viewY { get; set; }
            public string? patchMode { get; set; }
        }

        private sealed class ProjectUpsertEventRequest
        {
            public string? projectId { get; set; }
            public ProjectEventDocument? @event { get; set; }
        }

        private sealed class ProjectDeleteEventRequest
        {
            public string? projectId { get; set; }
            public string? eventId { get; set; }
        }
    }
}