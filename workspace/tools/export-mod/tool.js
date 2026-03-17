import { toast } from "../../shared/ui.js";
import { cmdToToken } from "../event-builder/commands.js";


const I18N_KEY = "exportMod.i18nExport.v1";
const COLLAPSE_KEY = "exportMod.collapsedSections.v1";

function el(id) {
    return document.getElementById(id);
}

function numOr(v, d) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
}

function parseManifestUniqueId(text) {
    try {
        const obj = JSON.parse(String(text || ""));
        return String(obj?.UniqueID ?? "").trim();
    } catch {
        return "";
    }
}

function getPreviewModId() {
    return "{{ModId}}";
}

function normalizeI18nPart(value, fallback = "Value") {
    const s = String(value || "").trim();
    if (!s) return fallback;
    const cleaned = s.replace(/[^A-Za-z0-9]+/g, "");
    return cleaned || fallback;
}

function normalizeI18nCommandName(type) {
    const raw = String(type || "").trim();
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Command";
}

function buildCommandI18nKey(eventId, cmd) {
    return [
        "Event",
        normalizeI18nPart(eventId, "Event"),
        normalizeI18nCommandName(cmd?.type),
        normalizeI18nPart(cmd?.id, "cmd00")
    ].join(".");
}

function getCommandTranslatableText(cmd) {
    const t = String(cmd?.type || "").trim().toLowerCase();
    if (t === "speak" || t === "splitspeak" || t === "textabovehead" || t === "message") {
        return String(cmd?.text || "");
    }
    if (t === "end") {
        const endType = String(cmd?.endType || "").trim().toLowerCase();
        if (endType === "dialogue" || endType === "dialoguewarpout") {
            return String(cmd?.text || "");
        }
    }
    return "";
}

function shouldTranslateCommand(cmd) {
    return getCommandTranslatableText(cmd) !== "";
}

function getCommandActorForI18n(cmd) {
    const type = String(cmd?.type || "").trim().toLowerCase();

    if (type === "message") return "System";

    if (type === "end") {
        const endType = String(cmd?.endType || "").trim().toLowerCase();
        if (endType === "dialogue" || endType === "dialoguewarpout") {
            return String(cmd?.npc || "").trim() || "System";
        }
    }

    return String(cmd?.actor || cmd?.npc || "").trim() || "System";
}

function formatI18nJsonWithComments(flatEventRows, entries) {
    const lines = ["{"];
    let first = true;

    for (const row of flatEventRows) {
        const cmd = row?.cmd;
        const eventId = String(row?.eventId || "").trim();
        if (!cmd || !eventId || !shouldTranslateCommand(cmd)) continue;

        const key = buildCommandI18nKey(eventId, cmd);
        const value = entries[key];
        if (value == null) continue;

        if (!first) lines.push("");
        lines.push(`  // ${getCommandActorForI18n(cmd)}`);
        lines.push(`  "${key}": ${JSON.stringify(value)},`);
        first = false;
    }

    if (lines.length > 1) {
        lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, "");
    }

    lines.push("}");
    return lines.join("\n");
}

function safeParseI18nText(i18nText) {
    const raw = String(i18nText || "").trim();
    if (!raw) return {};

    const withoutComments = raw
        .split("\n")
        .filter(line => !line.trim().startsWith("//"))
        .join("\n");

    try {
        return JSON.parse(withoutComments);
    } catch {
        return {};
    }
}

function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function flattenCmds(blocks) {
    const out = [];
    for (const b of (Array.isArray(blocks) ? blocks : [])) {
        if (!b || typeof b !== "object") continue;
        if (b.kind === "cmd" && b.cmd && typeof b.cmd === "object") {
            out.push(b.cmd);
        } else if (b.kind === "group" && Array.isArray(b.items)) {
            out.push(...b.items.filter(x => x && typeof x === "object"));
        } else if (b.type) {
            out.push(b);
        }
    }
    return out;
}

function condToToken(c) {
    const t = String(c?.type || "").trim();
    if (!t) return "";

    const negate = !!c?.negate;
    const bang = negate ? "!" : "";

    const a = (Array.isArray(c?.args) ? c.args : [])
        .map(s => String(s || "").trim())
        .filter(Boolean);

    if (!a.length) return `${bang}${t}`;
    if (t === "DayOfMonth" || t === "DayOfWeek" || t === "Season") return `${bang}${t} ${a[0]}`;
    if (t === "GameStateQuery") {
        const q = String(a[0] || "").trim();
        return q ? `${bang}${t} "${q.replace(/"/g, '\\"')}"` : `${bang}${t}`;
    }
    return `${bang}${t} ${a.join(" ")}`;
}

function buildQualifiedEventId(rawEventId, manifestText, options = {}) {
    const base = String(rawEventId || "").trim();
    const mode = String(options.mode || "manifest").trim().toLowerCase();

    const prefix =
        mode === "preview"
            ? getPreviewModId()
            : parseManifestUniqueId(manifestText);

    if (!base) return prefix || "";
    if (!prefix) return base;
    if (base.startsWith(prefix + ".")) return base;
    return `${prefix}.${base}`;
}

function buildEventScript(doc, options = {}) {
    const useI18n = !!options.useI18n;
    const manifestText = String(options.manifestText || "");

    const snap = doc?.state || {};
    const header = snap?.header || doc?.header || {};
    const state = snap?.state || {};

    const rawEventId = String(header?.eventId || "").trim();
    const location = String(header?.location || "").trim();
    if (!rawEventId || !location) return null;

    const idMode = String(options.idMode || "preview").trim().toLowerCase();
    const builtEventId = buildQualifiedEventId(rawEventId, manifestText, {
        mode: idMode === "manifest" ? "manifest" : "preview"
    });

    const music = String(header?.music || "none").trim() || "none";
    const vx = numOr(header?.viewX, 0);
    const vy = numOr(header?.viewY, 0);

    const actors = Array.isArray(state?.actors) ? state.actors : [];
    const actorParts = [];
    for (const a of actors) {
        const name = String(a?.name || "").trim();
        if (!name) continue;
        actorParts.push(`${name} ${numOr(a?.x, 0)} ${numOr(a?.y, 0)} ${numOr(a?.dir, 2)}`);
    }

    const condTokens = (Array.isArray(state?.conds) ? state.conds : [])
        .map(condToToken)
        .filter(Boolean);

    const precondStr = condTokens.join("/").trim();
    const flatCmds = flattenCmds(state?.cmds);
    const i18nEntries = {};
    const i18nOrderRows = [];

    const cmdTokens = flatCmds
        .map((cmd) => {
            const id = String(cmd?.id || "").trim();
            if (useI18n && id && shouldTranslateCommand(cmd)) {
                const key = buildCommandI18nKey(builtEventId, cmd);
                i18nEntries[key] = getCommandTranslatableText(cmd);
                i18nOrderRows.push({ eventId: builtEventId, cmd });
                return cmdToToken(cmd, { useI18n: true, i18nKey: key });
            }
            return cmdToToken(cmd);
        })
        .filter(s => String(s || "").trim())
        .map(s => s.trim());

    const lines = [];
    lines.push(music);
    lines.push(`${vx} ${vy}`);
    lines.push(actorParts.join(" ").trim() || "farmer 0 0 2");
    lines.push(...cmdTokens);

    const entryKey = precondStr
        ? `${builtEventId}/${precondStr}/`
        : `${builtEventId}/`;

    return {
        location,
        rawEventId,
        builtEventId,
        previewEventId: builtEventId,
        entryKey,
        script: lines.join("/"),
        i18nEntries,
        i18nOrderRows,
        header,
        commandCount: flatCmds.length
    };
}

function getCurrentProject(ctx) {
    try {
        return ctx?.getCurrentProject?.() || null;
    } catch {
        return null;
    }
}

function getProjectManifestText(project) {
    return String(project?.manifest?.text || "").trim();
}

function getProjectEventDocs(project) {
    return Array.isArray(project?.documents?.events) ? project.documents.events : [];
}

function setManifestStatus(text, tone = "") {
    const pill = el("xmManifestStatus");
    if (!pill) return;
    pill.textContent = text || "UniqueID: —";
    pill.className = `pill ${tone || ""}`.trim();
}

function syncManifestUi(project) {
    const manifestText = getProjectManifestText(project);
    const box = el("xmOutputManifest");
    if (box) box.value = manifestText || "";

    const uid = parseManifestUniqueId(manifestText);
    if (uid) setManifestStatus(`UniqueID: ${uid}`, "ok");
    else if (manifestText) setManifestStatus("UniqueID: (invalid JSON or missing UniqueID)", "warn");
    else setManifestStatus("UniqueID: —", "");
}

function setI18nUi() {
    const on = !!el("xmI18nToggle")?.checked;
    const label = el("xmI18nLabel");
    const box = el("xmOutputI18n");
    if (label) label.style.display = on ? "block" : "none";
    if (box) box.style.display = on ? "block" : "none";
    try {
        localStorage.setItem(I18N_KEY, on ? "1" : "0");
    } catch { }
}

function loadI18nPref() {
    try {
        return localStorage.getItem(I18N_KEY) === "1";
    } catch {
        return false;
    }
}

function renderEventSummary(project, builtEvents) {
    const host = el("xmEventSummary");
    if (!host) return;

    if (!project) {
        host.innerHTML = `<div class="muted small">No project loaded.</div>`;
        return;
    }

    const docs = getProjectEventDocs(project);
    if (!docs.length) {
        host.innerHTML = `<div class="muted small">This project does not have any Event Builder events yet.</div>`;
        return;
    }

    host.innerHTML = docs.map((doc) => {
        const built = builtEvents.find(x => String(x?.doc?.id || "") === String(doc?.id || ""));
        const header = doc?.header || doc?.state?.header || {};
        const eventId = String(header?.eventId || "").trim() || "(missing event id)";
        const location = String(header?.location || "").trim() || "(missing location)";
        const commandCount = Number(built?.result?.commandCount || 0);
        const skipped = !built?.result;

        return `
            <div class="card" style="margin:10px 0;">
                <div class="card-body">
                    <div style="font-weight:800;">${escapeHtml(eventId)}</div>
                    <div class="muted small">${escapeHtml(location)} • ${commandCount} command${commandCount === 1 ? "" : "s"}${skipped ? " • skipped from export" : ""}</div>
                </div>
            </div>
        `;
    }).join("");
}


export function buildOutputs(ctx) {
    const project = getCurrentProject(ctx);
    const patchMode = String(el("xmPatchMode")?.value || "edit").trim();
    const useI18n = !!el("xmI18nToggle")?.checked;

    if (!project) {
        return {
            ok: false,
            error: "No project is currently loaded."
        };
    }

    const manifestText = getProjectManifestText(project);
    const docs = getProjectEventDocs(project);
    const builtEvents = docs.map((doc) => ({
        doc,
        result: buildEventScript(doc, { useI18n, manifestText, idMode: "preview" })
    }));
    const builtEventsRunCp = docs.map((doc) => ({
        doc,
        result: buildEventScript(doc, { useI18n, manifestText, idMode: "manifest" })
    }));

    renderEventSummary(project, builtEvents);
    syncManifestUi(project);

    const validEvents = builtEvents.filter(x => x.result && x.result.location && x.result.entryKey && x.result.script);
    const validEventsRunCp = builtEventsRunCp.filter(x => x.result && x.result.location && x.result.entryKey && x.result.script);
    const groupedEntries = {};
    const allI18nEntries = {};
    const i18nRows = [];

    for (const row of validEvents) {
        const result = row.result;
        groupedEntries[result.location] ??= {};
        groupedEntries[result.location][result.entryKey] = result.script;
        Object.assign(allI18nEntries, result.i18nEntries || {});
        i18nRows.push(...(result.i18nOrderRows || []));
    }
    const groupedEntriesRunCp = {};
    const allI18nEntriesRunCp = {};
    const i18nRowsRunCp = [];

    for (const row of validEventsRunCp) {
        const result = row.result;
        groupedEntriesRunCp[result.location] ??= {};
        groupedEntriesRunCp[result.location][result.entryKey] = result.script;
        Object.assign(allI18nEntriesRunCp, result.i18nEntries || {});
        i18nRowsRunCp.push(...(result.i18nOrderRows || []));
    }

    const contentJson = {
        Format: "2.0.0",
        Changes: [
            {
                Action: "Include",
                FromFile: "assets/data/events/events.json"
            }
        ]
    };

    if (patchMode === "load") {
        contentJson.Changes = [
            {
                Action: "Load",
                Target: "Data/Events",
                FromFile: "assets/data/events/events.json"
            }
        ];
    }
    const eventsJson = patchMode === "load"
        ? groupedEntries
        : {
            Changes: Object.entries(groupedEntries).map(([location, entries]) => ({
                Action: "EditData",
                Target: `Data/Events/${location}`,
                Entries: entries
            }))
        };

    const i18nText = useI18n
        ? formatI18nJsonWithComments(i18nRows, allI18nEntries)
        : "";
    const eventsJsonRunCp = patchMode === "load"
        ? groupedEntriesRunCp
        : {
            Changes: Object.entries(groupedEntriesRunCp).map(([location, entries]) => ({
                Action: "EditData",
                Target: `Data/Events/${location}`,
                Entries: entries
            }))
        };

    const i18nTextRunCp = useI18n
        ? formatI18nJsonWithComments(i18nRowsRunCp, allI18nEntriesRunCp)
        : "";

    return {
        ok: true,
        project,
        manifestText,
        docs,
        builtEvents,
        validEvents,
        patchMode,
        useI18n,
        contentJson,
        eventsJson,
        i18nText,
        runCpOutputs: {
            mode: patchMode,
            contentJson,
            dataFileRel: "assets/data/events/events.json",
            dataFileJson: eventsJsonRunCp,
            i18nFileRel: "i18n/default.json",
            i18nJson: useI18n ? allI18nEntriesRunCp : null,
            contentFiles: {
                "content.json": contentJson
            },
            dataFiles: {
                "assets/data/events/events.json": eventsJsonRunCp
            },
            i18nFiles: useI18n
                ? { "i18n/default.json": allI18nEntriesRunCp }
                : {}
        }
    };
}



function applyOutputs(out) {
    el("xmOutputManifest").value = out.manifestText || "";
    el("xmOutputContent").value = JSON.stringify(out.contentJson, null, 2);
    el("xmOutputEvents").value = JSON.stringify(out.eventsJson, null, 2);
    el("xmOutputI18n").value = out.i18nText || "";
    setI18nUi();
}

function buildAndRender(ctx) {
    const out = buildOutputs(ctx);
    if (!out.ok) {
        renderEventSummary(null, []);
        setManifestStatus("UniqueID: —", "");
        if (el("xmOutputManifest")) el("xmOutputManifest").value = "";
        el("xmOutputContent").value = "";
        el("xmOutputEvents").value = "";
        el("xmOutputI18n").value = "";
        toast("Export Mod", out.error || "Could not build export.", "warn");
        return null;
    }

    applyOutputs(out);

    let msg = `Built preview for ${out.validEvents.length} event${out.validEvents.length === 1 ? "" : "s"}.`;
    if (!out.validEvents.length) msg = "No valid events were found to export yet.";
    toast("Export Mod", msg, out.validEvents.length ? "info" : "warn");
    return out;
}

async function copyOutputs(ctx) {
    const out = buildOutputs(ctx);
    if (!out.ok) {
        toast("Copy failed", out.error || "Could not build export.", "error");
        return;
    }

    applyOutputs(out);

    let text =
        `// manifest.json\n${out.manifestText || "{}"}` +
        `\n\n// content.json\n${JSON.stringify(out.contentJson, null, 2)}` +
        `\n\n// assets/data/events/events.json\n${JSON.stringify(out.eventsJson, null, 2)}`;

    if (out.useI18n) {
        text += `\n\n// i18n/default.json\n${out.i18nText || "{}"}`;
    }

    try {
        await navigator.clipboard.writeText(text);
        toast("Copied", "Export Mod preview copied to clipboard.", "info");
    } catch {
        toast("Copy failed", "Clipboard permission blocked.", "error");
    }
}

function downloadBlob(name, text, type = "application/json") {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}

function downloadOutputs(ctx) {
    const out = buildOutputs(ctx);
    if (!out.ok) {
        toast("Download failed", out.error || "Could not build export.", "error");
        return;
    }

    applyOutputs(out);

    downloadBlob("manifest.json", out.manifestText || "{}");
    downloadBlob("content.json", JSON.stringify(out.contentJson, null, 2));
    downloadBlob("events.json", JSON.stringify(out.eventsJson, null, 2));
    if (out.useI18n) {
        downloadBlob("default.json", out.i18nText || "{}", "application/json");
    }

    let msg = "manifest.json + content.json + events.json downloaded.";
    if (out.useI18n) msg = "manifest.json + content.json + events.json + i18n/default.json downloaded.";
    toast("Downloaded", msg, "info");
}

function loadCollapsedMap() {
    try {
        const raw = localStorage.getItem(COLLAPSE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveCollapsedMap(map) {
    try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(map || {}));
    } catch { }
}

function wireSectionToggles() {
    const root = el("exportMod");
    if (!root) return;

    const collapsed = loadCollapsedMap();

    root.querySelectorAll(".card").forEach((card, idx) => {
        const hdr = card.querySelector(":scope > .card-hdr");
        const body = card.querySelector(":scope > .card-body");
        if (!hdr || !body) return;

        const key = `${(hdr.textContent || "").trim()}#${idx}`;

        if (collapsed[key] === true) {
            card.dataset.collapsed = "true";
        }

        hdr.addEventListener("click", (e) => {
            const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "";
            if (tag === "button" || tag === "input" || tag === "select" || tag === "textarea" || tag === "label") return;

            const now = card.dataset.collapsed !== "true";
            card.dataset.collapsed = now ? "true" : "false";
            collapsed[key] = card.dataset.collapsed === "true";
            saveCollapsedMap(collapsed);
        });
    });
}




export async function mount(host, ctx) {
    const toggle = el("xmI18nToggle");
    if (toggle) toggle.checked = loadI18nPref();

    setI18nUi();
    wireSectionToggles();

    el("xmI18nToggle")?.addEventListener("change", () => {
        setI18nUi();
        try { buildAndRender(ctx); } catch { }
    });

    el("xmBtnBuild")?.addEventListener("click", () => buildAndRender(ctx));
    el("xmBtnCopy")?.addEventListener("click", () => copyOutputs(ctx));
    el("xmBtnDownload")?.addEventListener("click", () => downloadOutputs(ctx));

    const onProjectLoaded = () => {
        try { buildAndRender(ctx); } catch { }
    };

    const onProjectChanged = () => {
        try { buildAndRender(ctx); } catch { }
    };

    window.addEventListener("sla:project:loaded", onProjectLoaded);
    window.addEventListener("sla:project:changed", onProjectChanged);

    buildAndRender(ctx);

    return () => {
        window.removeEventListener("sla:project:loaded", onProjectLoaded);
        window.removeEventListener("sla:project:changed", onProjectChanged);
    };
}