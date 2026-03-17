import { $, toast, setPill } from "../../shared/ui.js";
import {
    initCommands,
    COMMAND_NAMES,
    COMMAND_DESCS,
    getCommandChoices,
    TEMPLATE_CMDS,
    cmdToToken,
    renderCmdTemplateHtml,

    ITEM_OPTIONS


} from "./commands.js";

import { initEventBuilderUi } from "./tool.ui.js";

import { buildOutputs as buildExportModOutputs } from "../export-mod/tool.js";

const STORAGE_KEY = "eventBuilder.progress.v2";
const AUTOSAVE_KEY = "eventBuilder.autosave.v2";
const COLLAPSE_KEY = "eventBuilder.ui.collapsed.v1";
const GROUP_PRESETS_KEY = "eventBuilder.groupPresets.v1";
const I18N_TOGGLE_KEY = "eventBuilder.i18nExport.v1";
const MAP_PICKER_CAPTURE_CACHE = new Map();


let pendingLocation = "";






const CONDITION_DEFS = [
    { key: "GameStateQuery", args: ["query"], help: "Arbitrary GSQ, e.g. WEATHER Here Sun or !WEATHER Here Sun." },
    { key: "Raw", args: [], help: "Custom raw precondition. Outputs exactly what is typed." },
    { key: "ActiveDialogueEvent", args: ["ID"], help: "Special dialogue event with ID is in progress." },
    { key: "DayOfMonth", args: ["number(s)"], help: "One or more day numbers, e.g. 12 13 14." },
    { key: "DayOfWeek", args: ["day(s)"], help: "Mon/Monday (space-separated allowed)." },
    { key: "FestivalDay", args: [], help: "Today is a festival day." },
    { key: "GoldenWalnuts", args: ["number"], help: "Team has found at least this many walnuts." },
    { key: "InUpgradedHouse", args: ["level(optional)"], help: "Current location is upgraded farmhouse/cabin. Default is level 2 if blank." },
    { key: "NPCVisible", args: ["npc"], help: "NPC is present and visible anywhere." },
    { key: "NpcVisibleHere", args: ["npc"], help: "NPC is present and visible here." },
    { key: "Random", args: ["probability(0..1)"], help: "Chance gate, e.g. 0.2 = 20%." },
    { key: "Season", args: ["season(s)"], help: "spring/summer/fall/winter (space-separated allowed)." },
    { key: "Time", args: ["min", "max"], help: "26-hour clock inclusive, e.g. 1900 2300." },
    { key: "UpcomingFestival", args: ["days"], help: "A festival will occur within N days." },
    { key: "Weather", args: ["weather"], help: "rainy, sunny, or a weather ID." },
    { key: "WorldState", args: ["ID"], help: "World state is active." },
    { key: "Year", args: ["year"], help: "If 1, exactly year 1. Otherwise year must be at least this value." },


    { key: "HasReceivedMail", args: ["mailId"], help: "Convenience/custom mail flag check." },
    { key: "HasFlag", args: ["flagId"], help: "Convenience/custom generic flag check." },
    { key: "Friendship", args: ["npc", "heartsOrPoints"], help: "Friendship requirement." },
    { key: "Hearts", args: ["npc", "hearts"], help: "Convenience alias for friendship by hearts." },
    { key: "FarmCave", args: ["bats|mushrooms"], help: "Convenience cave choice check." },
    { key: "PlayerGender", args: ["Male|Female"], help: "Convenience gender check." },
    { key: "Spouse", args: ["npc"], help: "Convenience spouse check." },
    { key: "NotSeenEvent", args: ["eventId"], help: "Convenience event not seen check." },
    { key: "SeenEvent", args: ["eventId"], help: "Convenience event seen check." },
];
const DEFAULT_MANIFEST_TEXT =
    `{
  "Name": "MyEventMod",
  "Author": "ModAuthorName",
  "Version": "1.0.0",
  "Description": "AddADescriptionHere",
  "UniqueID": "ModAuthorName.MyEventMod",
  "MinimumApiVersion": "4.0.0",
  "UpdateKeys": [],
  "ContentPackFor": {
    "UniqueID": "Pathoschild.ContentPatcher"
  }
}`;

function elById(id) { return document.getElementById(id); }
function val(id) { return (elById(id)?.value ?? ""); }
function setVal(id, v) {
    const el = elById(id);
    if (!el) return;
    el.value = (v ?? "");
}

function setTextAreaValueByAnyId(ids, value) {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) { el.value = value; return true; }
    }
    return false;
}
function getTextAreaValueByAnyId(ids) {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) return el.value || "";
    }
    return "";
}

const MF_IDS = ["mfJson", "mfOutput", "ebManifestOutput", "manifestOutput", "mfManifestOutput"];
function getManifestText() { return getTextAreaValueByAnyId(MF_IDS) || ""; }
function setManifestText(txt) { return setTextAreaValueByAnyId(MF_IDS, txt); }
function ensureManifestDefault() {
    const cur = (getManifestText() || "").trim();
    if (!cur) setManifestText(DEFAULT_MANIFEST_TEXT);
}
function getI18nToggle() {
    const el = elById("ebI18nToggle");
    if (el) return !!el.checked;
    try { return localStorage.getItem(I18N_TOGGLE_KEY) === "1"; } catch { return false; }
}
function setI18nToggle(on) {
    const v = !!on;
    const el = elById("ebI18nToggle");
    if (el) el.checked = v;
    try { localStorage.setItem(I18N_TOGGLE_KEY, v ? "1" : "0"); } catch { }
    updateI18nUi();
}
function updateI18nUi() {
    const on = getI18nToggle();
    const pill = elById("ebI18nState");
    if (pill) setPill(pill, `i18n: ${on ? "On" : "Off"}`, on ? "ok" : "");
    const label = elById("ebI18nOutputLabel");
    const box = elById("ebI18nOutput");
    if (label) label.style.display = on ? "block" : "none";
    if (box) box.style.display = on ? "block" : "none";
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

function getCommandActorForI18n(cmd) {
    const type = String(cmd?.type || "").trim().toLowerCase();

    if (type === "message") {
        return "System";
    }

    if (type === "end") {
        const endType = String(cmd?.endType || "").trim().toLowerCase();
        if (endType === "dialogue" || endType === "dialoguewarpout") {
            return String(cmd?.npc || "").trim() || "System";
        }
    }

    return String(cmd?.actor || cmd?.npc || "").trim() || "System";
}

function buildCommandI18nKey(eventId, cmd) {
    return [
        "Event",
        normalizeI18nPart(eventId, "Event"),
        normalizeI18nCommandName(cmd?.type),
        normalizeI18nPart(cmd?.id, "cmd00")
    ].join(".");
}
function formatI18nJsonWithComments(eventId, flatCmds, entries) {
    const lines = ["{"];

    let first = true;

    for (const cmd of flatCmds) {
        if (!shouldTranslateCommand(cmd)) continue;

        const key = buildCommandI18nKey(eventId, cmd);
        const value = entries[key];
        if (value == null) continue;

        const type = String(cmd?.type || "").trim().toLowerCase();

        let actor = "System";

        if (type === "textabovehead" || type === "speak" || type === "splitspeak") {
            actor = String(cmd?.actor || "").trim() || "System";
        } else if (type === "end") {
            const endType = String(cmd?.endType || "").trim().toLowerCase();
            if (endType === "dialogue" || endType === "dialoguewarpout") {
                actor = String(cmd?.npc || "").trim() || "System";
            }
        } else if (type === "message") {
            actor = "System";
        }

        if (!first) lines.push("");

        lines.push(`  // ${actor}`);
        lines.push(`  "${key}": ${JSON.stringify(value)},`);

        first = false;
    }
    if (lines.length > 1) {
        lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, "");
    }

    lines.push("}");
    return lines.join("\n");
}

function getCommandTranslatableText(cmd) {
    const t = String(cmd?.type || "").trim().toLowerCase();
    if (t === "speak" || t === "splitspeak" || t === "textabovehead" || t === "message") return String(cmd?.text || "");
    if (t === "end") {
        const endType = String(cmd?.endType || "").trim().toLowerCase();
        if (endType === "dialogue" || endType === "dialoguewarpout") return String(cmd?.text || "");
    }
    return "";
}
function shouldTranslateCommand(cmd) {
    return getCommandTranslatableText(cmd) !== "";
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

function setManifestStatus(text, kind) {
    const el = elById("mfStatus");
    if (!el) return;
    setPill(el, text, kind || "");
}

function getCurrentProgressSnapshot() {
    return getEditorContentSnapshot();
}

function getEditorContentSnapshot() {
    return {
        header: {
            location: (val("ebLocation") || "").trim(),
            eventId: (val("ebEventId") || "").trim(),
            music: (val("ebMusic") || "none").trim(),
            viewX: numOr(val("ebViewX"), 0),
            viewY: numOr(val("ebViewY"), 0),
            patchMode: (val("ebPatchMode") || "edit").trim(),
            i18nExport: getI18nToggle()
        },
        manifest: {
            text: getManifestText() || "",
            uniqueId: parseManifestUniqueId(getManifestText())
        },
        state: {
            actors: structuredClone(Array.isArray(state.actors) ? state.actors : []),
            conds: structuredClone(Array.isArray(state.conds) ? state.conds : []),
            cmds: structuredClone(Array.isArray(state.cmds) ? state.cmds : [])
        }
    };
}


function stableStringify(obj) {
    return JSON.stringify(obj);
}

function hasBuilderContent() {
    const snap = getCurrentProgressSnapshot();
    return (
        snap.eventId !== "" ||
        snap.music !== "none" ||
        snap.viewX !== "0" ||
        snap.viewY !== "0" ||
        snap.patchMode !== "edit" ||
        snap.location !== "" ||
        snap.actors.length > 0 ||
        snap.conds.length > 0 ||
        snap.cmds.length > 0
    );
}

function getLastSavedSnapshot() {
    try {
        if (typeof getCurrentSave === "function") {
            const cur = getCurrentSave();
            if (cur?.data) return extractEditorContentSnapshot(cur.data);
        }
    } catch { }

    return null;
}

function extractEditorContentSnapshot(obj) {
    if (!obj || typeof obj !== "object") return null;

    return {
        header: {
            location: String(obj?.header?.location || "").trim(),
            eventId: String(obj?.header?.eventId || "").trim(),
            music: String(obj?.header?.music ?? "none").trim(),
            viewX: numOr(obj?.header?.viewX, 0),
            viewY: numOr(obj?.header?.viewY, 0),
            patchMode: String(obj?.header?.patchMode || "edit").trim(),
            i18nExport: !!obj?.header?.i18nExport
        },
        manifest: {
            text: String(obj?.manifest?.text || ""),
            uniqueId: String(obj?.manifest?.uniqueId || "")
        },
        state: {
            actors: structuredClone(Array.isArray(obj?.state?.actors) ? obj.state.actors : []),
            conds: structuredClone(Array.isArray(obj?.state?.conds) ? obj.state.conds : []),
            cmds: structuredClone(Array.isArray(obj?.state?.cmds) ? obj.state.cmds : [])
        }
    };
}

function hasUnsavedChanges() {
    if (!hasBuilderContent()) return false;

    const current = stableStringify(getCurrentProgressSnapshot());
    const saved = getLastSavedSnapshot();

    if (!saved) return true;

    return current !== stableStringify(saved);
}

function confirmDiscardChanges(actionLabel) {
    if (!hasUnsavedChanges()) return true;

    return confirm(
        `${actionLabel}?\n\n` +
        "You have unsaved changes in the current event builder.\n\n" +
        "Choose OK to discard the current changes and continue."
    );
}
function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function numOr(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function boolOr(v, d) {
    if (typeof v === "boolean") return v;
    const s = String(v).toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
    return d;
}
let ctxRef = null;
let metaRef = null;

function getAuthToken() {
    try {
        const t = ctxRef?.token || ctxRef?.api?.token || ctxRef?.api?.opts?.token || metaRef?.token;
        return (t || "").toString().trim();
    } catch {
        return "";
    }
}

try { window.getAuthToken = getAuthToken; } catch { }

async function apiGetJson(path) {
    if (!ctxRef?.api) return { ok: false };
    try {
        const res = await ctxRef.api.get(path);
        return (res && res.ok) ? (res.json || { ok: true }) : { ok: false, status: res?.status };
    } catch {
        return { ok: false };
    }
}
async function apiPostJson(path, payload) {
    if (!ctxRef?.api) return { ok: false };
    try {
        const res = await ctxRef.api.post(path, payload || {});
        return (res && res.ok) ? (res.json || { ok: true }) : { ok: false, status: res?.status };
    } catch {
        return { ok: false };
    }
}


async function fetchTempActorAssetList(kind) {
    const safeKind = String(kind || "").trim();
    if (!safeKind) return [];

    const j = await apiGetJson(`/api/v1/assets/list?group=tempactors&kind=${encodeURIComponent(safeKind)}`);
    if (!j?.ok || !Array.isArray(j.items)) return [];

    return j.items
        .map((it) => ({
            name: String(it?.name || "").trim(),
            assetName: String(it?.assetName || "").trim(),
            kind: String(it?.kind || safeKind).trim(),
            source: String(it?.source || "").trim()
        }))
        .filter((it) => it.name && it.assetName);
}

async function refreshTempActorAssetsFromApi() {
    tempActorAssets.Character = await fetchTempActorAssetList("Character");
    tempActorAssets.Animal = await fetchTempActorAssetList("Animal");
    tempActorAssets.Monster = await fetchTempActorAssetList("Monster");


}

function getTempActorAssetOptions(kind) {
    const k = String(kind || "Character").trim() || "Character";
    return Array.isArray(tempActorAssets[k]) ? tempActorAssets[k] : [];
}

async function getTempActorAssetMeta(assetName) {
    const name = String(assetName || "").trim();
    if (!name) return { ok: false, error: "missing_assetName" };

    return await apiGetJson(`/api/v1/tempactors/meta?assetName=${encodeURIComponent(name)}`);
}

function buildTempActorImageUrl(assetName, options = {}) {
    const name = String(assetName || "").trim();
    if (!name) return "";

    const wantGrid = !!options.grid;
    const tileWidth = Number(options.tileWidth || 0);
    const tileHeight = Number(options.tileHeight || 0);
    const token = getAuthToken();

    let url = `/api/v1/tempactors/image?assetName=${encodeURIComponent(name)}`;

    if (wantGrid) url += `&grid=true`;
    if (tileWidth > 0) url += `&tileWidth=${encodeURIComponent(tileWidth)}`;
    if (tileHeight > 0) url += `&tileHeight=${encodeURIComponent(tileHeight)}`;
    if (token) url += `&token=${encodeURIComponent(token)}`;

    return url;
}
let serverGroupPresetsCache = null;

function loadGroupPresets() {
    try {
        const raw = localStorage.getItem(GROUP_PRESETS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function saveGroupPresets(presets) {
    try { localStorage.setItem(GROUP_PRESETS_KEY, JSON.stringify(presets || [])); } catch { }
}

async function loadGroupPresetsFromServer() {
    const j = await apiGetJson("/api/v1/eventbuilder/presets/groups");
    if (j?.ok && Array.isArray(j.presets)) return j.presets;
    return null;
}
async function saveGroupPresetsToServer(presets) {
    const j = await apiPostJson("/api/v1/eventbuilder/presets/groups", { presets: presets || [] });
    return !!j?.ok;
}
async function saveGroupPresetImageToServer(presetId, dataUrl) {
    if (!presetId || !dataUrl) return false;
    const j = await apiPostJson("/api/v1/eventbuilder/presets/groupImage", { presetId, dataUrl });
    return !!j?.ok;
}

function builtInGroupPresets() {

    return [];
}

function getAllPresetsMerged() {
    const builtins = builtInGroupPresets();
    const user = Array.isArray(serverGroupPresetsCache) ? serverGroupPresetsCache : loadGroupPresets();

    const builtinIds = new Set(builtins.map(b => String(b.id)));

    const map = new Map();
    for (const p of builtins) map.set(p.id, p);

    for (const p of (user || [])) {
        const id = String(p?.id || "");
        if (!id) continue;

        if (p?.deleted === true) continue;

        if (builtinIds.has(id)) {
            const name = String(p?.name || "").trim();
            const desc = String(p?.description || "").trim();
            const count = Array.isArray(p?.items) ? p.items.length : 0;
            const img = String(p?.imageDataUrl || "").trim();

            const isBlankShell = !name && !desc && count === 0 && !img;
            if (isBlankShell) continue;
        }

        map.set(id, p);
    }

    return [...map.values()];
}
async function deleteGroupPresetSmart(preset) {
    if (!preset?.id) return false;

    const id = String(preset.id);

    const useServer = Array.isArray(serverGroupPresetsCache);
    const list = useServer ? structuredClone(serverGroupPresetsCache) : loadGroupPresets();

    if (preset.builtIn) {

        const idx = list.findIndex(x => String(x?.id) === id);
        const tomb = { id, deleted: true };
        if (idx >= 0) list[idx] = { ...(list[idx] || {}), ...tomb };
        else list.push(tomb);
    } else {

        const next = list.filter(x => String(x?.id) !== id);
        list.length = 0;
        list.push(...next);
    }


    if (useServer) {
        const ok = await saveGroupPresetsToServer(list);
        if (ok) serverGroupPresetsCache = list;
        return ok;
    } else {
        saveGroupPresets(list);
        return true;
    }
}
let locations = [];
let npcs = [];
let objectItems = [];
let cookingRecipes = [];
let craftingRecipes = [];
let quests = [];
let specialOrders = [];
let tempActorAssets = {
    Character: [],
    Animal: [],
    Monster: []
};

const state = {
    actors: [],
    conds: [],
    cmds: [],
    musicChoices: [],
    soundChoices: [],
    _currentSaveId: null,
    _currentSaveName: "",
    _currentSaveData: null
};

let autosaveTimer = null;
let _idCounter = 1;
function makeId(prefix = "id") {
    _idCounter++;
    return `${prefix}_${Date.now()}_${_idCounter}`;
}


function getNextCommandIdFromBlocks(blocks) {
    let maxId = 0;
    const scan = (cmd) => {
        const m = /^cmd_(\d+)$/i.exec(String(cmd?.id || ""));
        if (m) maxId = Math.max(maxId, parseInt(m[1], 10) || 0);
    };
    for (const b of (blocks || [])) {
        if (!b) continue;
        if (b.kind === "cmd") scan(b.cmd);
        else if (b.kind === "group") for (const cmd of (b.items || [])) scan(cmd);
    }
    return maxId + 1;
}
function makeCommandId(blocks = state.cmds) {
    return `cmd_${String(getNextCommandIdFromBlocks(blocks)).padStart(2, "0")}`;
}
function ensureCommandId(cmd, blocks = state.cmds) {
    if (!cmd || typeof cmd !== "object") return "";
    const cur = String(cmd.id || "").trim();
    if (/^cmd_\d+$/i.test(cur)) return cur;
    const id = makeCommandId(blocks);
    cmd.id = id;
    return id;
}
function cloneCommandWithNewId(cmd, blocks = state.cmds) {
    const copy = structuredClone(cmd || {});
    copy.id = makeCommandId(blocks);
    return copy;

}

function ensureUniqueCommandId(cmd, blocks = state.cmds, used = new Set()) {
    if (!cmd || typeof cmd !== "object") return "";

    const cur = String(cmd.id || "").trim();

    if (/^cmd_\d+$/i.test(cur) && !used.has(cur.toLowerCase())) {
        used.add(cur.toLowerCase());
        return cur;
    }

    let id = makeCommandId(blocks);

    while (used.has(String(id).toLowerCase())) {
        const tempBlocks = Array.isArray(blocks) ? blocks.slice() : [];
        tempBlocks.push({ kind: "cmd", cmd: { id } });
        blocks = tempBlocks;
        id = makeCommandId(blocks);
    }

    cmd.id = id;
    used.add(String(id).toLowerCase());
    return id;
}

function assignFreshIdsToCommands(list, blocks = state.cmds) {
    const src = Array.isArray(list) ? list : [];
    const workingBlocks = normalizeCmdBlocks(structuredClone(Array.isArray(blocks) ? blocks : []));
    const out = [];

    for (const cmd of src) {
        const copy = structuredClone(cmd || {});
        copy.id = makeCommandId(workingBlocks);
        out.push(copy);
        workingBlocks.push({ kind: "cmd", cmd: copy });
    }

    return out;
}

//Get Sound list

async function fetchSoundChoices() {
    try {
        if (!ctxRef?.api) return [];

        const res = await ctxRef.api.get("/api/v1/audio/cues/sfx");
        if (!res.ok) return [];

        const raw = Array.isArray(res.json?.cues) ? res.json.cues : [];

        return raw
            .map(r => {
                const id = String(r?.id ?? r?.Id ?? "").trim();
                if (!id) return null;

                const kind = String(r?.kind ?? r?.Kind ?? "").trim() || "Sfx";
                const categoryName = String(r?.categoryName ?? r?.CategoryName ?? "").trim();
                const looped = (r?.looped ?? r?.Looped) === true || (r?.audioChangesLooped ?? r?.AudioChangesLooped) === true;

                const pretty =
                    `${id}${categoryName ? ` — ${categoryName}` : ""}${looped ? " — Looped" : ""}`;

                return {
                    value: id,
                    label: pretty,
                    text: pretty
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.value.localeCompare(b.value));
    } catch {
        return [];
    }
}
function isCmdBlock(x) {
    return x && typeof x === "object"
        && x.kind === "cmd"
        && x.cmd && typeof x.cmd === "object";
}

function isGroupBlock(x) {
    return x && typeof x === "object"
        && x.kind === "group"
        && typeof x.name === "string"
        && Array.isArray(x.items);
}

function normalizeCmdBlocks(raw) {
    const out = [];
    const usedIds = new Set();

    if (Array.isArray(raw) && raw.some(b => b && typeof b === "object" && (b.kind === "cmd" || b.kind === "group"))) {
        for (const b of raw) {
            if (isCmdBlock(b)) {
                const cmd = structuredClone(b.cmd || { type: "pause", ms: 1000 });
                out.push({ kind: "cmd", cmd });
                ensureUniqueCommandId(cmd, out, usedIds);
            } else if (isGroupBlock(b)) {
                const group = {
                    kind: "group",
                    id: String(b.id || makeId("grp")),
                    name: String(b.name || "Group"),
                    description: String(b.description || ""),
                    imageDataUrl: (b.imageDataUrl ? String(b.imageDataUrl) : ""),
                    collapsed: !!b.collapsed,
                    items: (Array.isArray(b.items) ? b.items : [])
                        .map(c => structuredClone(c || { type: "pause", ms: 1000 })),
                };

                for (const cmd of group.items) {
                    ensureUniqueCommandId(cmd, out.concat([group]), usedIds);
                }

                out.push(group);
            } else if (b && typeof b === "object" && b.type) {
                const cmd = structuredClone(b);
                out.push({ kind: "cmd", cmd });
                ensureUniqueCommandId(cmd, out, usedIds);
            }
        }
        return out;
    }

    if (Array.isArray(raw)) {
        for (const c of raw.filter(x => x && typeof x === "object")) {
            const cmd = (c.kind === "cmd" && c.cmd)
                ? structuredClone(c.cmd)
                : structuredClone(c);

            out.push({ kind: "cmd", cmd });
            ensureUniqueCommandId(cmd, out, usedIds);
        }
        return out;
    }

    return [];
}

function flattenCmds(blocks) {
    const out = [];
    for (const b of (blocks || [])) {
        if (isCmdBlock(b)) out.push(b.cmd);
        else if (isGroupBlock(b)) out.push(...(b.items || []));
    }
    return out;
}

async function fetchMusicChoices() {
    try {
        if (!ctxRef?.api) return [];
        const res = await ctxRef.api.get("/api/v1/music/all");
        if (!res.ok) return [];

        const music = Array.isArray(res.json?.music) ? res.json.music : [];
        return music
            .map(m => {
                const id = String(m?.id ?? "").trim();
                const playId = String(m?.playId ?? m?.id ?? "").trim();
                if (!playId) return null;

                const ev = Number(m?.usedInEventsCount ?? 0);
                const loc = Number(m?.usedInLocationsCount ?? 0);
                const now = !!m?.isPlayingNow;
                const display = String(m?.displayName ?? id ?? playId).trim() || playId;

                const label =
                    `${display} — ${playId} — Events: ${ev} • Locations: ${loc}${now ? " • Now" : ""}`;

                return {
                    value: playId,
                    label,
                    text: label
                };
            })
            .filter(Boolean);
    } catch {
        return [];
    }
}

async function fetchNpcChoices() {
    try {
        if (!ctxRef?.api) return [];

        const res = await ctxRef.api.get("/api/v1/world/npcs");
        if (!res.ok || !res.json?.ok) return [];

        const rows = Array.isArray(res.json?.npcs) ? res.json.npcs : [];

        return rows
            .map((n) => {
                const name = String(n?.name || n?.Name || "").trim();
                if (!name) return null;

                const displayName = String(n?.displayName || n?.DisplayName || "").trim() || name;

                return {
                    value: name,
                    label: displayName !== name ? `${displayName} — ${name}` : name,
                    text: displayName !== name ? `${displayName} — ${name}` : name
                };
            })
            .filter(Boolean)
            .sort((a, b) => String(a.value).localeCompare(String(b.value)));
    } catch {
        return [];
    }
}

//Includes None and Continue + music list (fetchMusicChoices())
async function populateEventHeaderMusicSelect() {
    const sel = elById("ebMusic");
    if (!sel) return;

    const current = String(sel.value || "none").trim() || "none";

    const baseOptions = [
        { value: "none", label: "none - Stops current music" },
        { value: "continue", label: "continue - Continues current music into event" },
    ];

    let musicRows = [];
    try {
        musicRows = await fetchMusicChoices();
    } catch (err) {
        console.warn("[EventBuilder] Failed to load music choices:", err);
    }

    const seen = new Set(["none", "continue"]);
    const all = [...baseOptions];

    for (const row of (musicRows || [])) {
        const value = String(row?.value || "").trim();
        if (!value) continue;

        const lower = value.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);

        all.push({
            value,
            label: value
        });
    }

    sel.innerHTML = "";

    for (const optData of all) {
        const opt = document.createElement("option");
        opt.value = optData.value;
        opt.textContent = optData.label;
        sel.appendChild(opt);
    }

    const hasCurrent = all.some(x => String(x.value).toLowerCase() === current.toLowerCase());
    if (!hasCurrent && current) {
        const extra = document.createElement("option");
        extra.value = current;
        extra.textContent = current;
        sel.appendChild(extra);
    }

    sel.value = current;
}

function setStatus(text, kind) {
    const wrap = elById("ebStatus");
    const txt = elById("ebStatusText");
    if (!wrap || !txt) return;
    wrap.classList.remove("ok", "warn", "bad", "info");
    wrap.classList.add(kind || "warn");
    txt.textContent = text;
}
function setProgressPill(text, kind) {
    const el = elById("ebProgressPill");
    if (!el) return;

    /*it use to show status and file name commenting out might just stick with loaded event
    if (state._currentSaveName) text = `${text} • ${state._currentSaveName}`; 
    setPill(el, text, kind || ""); */

    const label = String(state._currentSaveName || "").trim();
    setPill(el, label || "No event selected", kind || "");
}

function updateStickyTop() {
    const hdr = document.querySelector(".app-header");
    const h = hdr ? hdr.getBoundingClientRect().height : 72;
    document.documentElement.style.setProperty("--appHeaderH", `${Math.ceil(h)}px`);
}

function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        autosaveTimer = null;
        saveAutosave();
    }, 250);
}

function snapshotProgress() {
    const manifestText = getManifestText();
    const manifestUniqueId = parseManifestUniqueId(manifestText);

    return {
        v: 7,
        header: {
            location: (val("ebLocation") || "").trim(),
            eventId: (val("ebEventId") || "").trim(),
            music: (val("ebMusic") || "none").trim(),
            viewX: numOr(val("ebViewX"), 0),
            viewY: numOr(val("ebViewY"), 0),
            patchMode: (val("ebPatchMode") || "edit").trim(),
            i18nExport: getI18nToggle()
        },
        manifest: {
            text: manifestText,
            uniqueId: manifestUniqueId
        },
        state: {
            actors: structuredClone(Array.isArray(state.actors) ? state.actors : []),
            conds: structuredClone(Array.isArray(state.conds) ? state.conds : []),
            cmds: structuredClone(Array.isArray(state.cmds) ? state.cmds : []),
            _currentSaveId: state._currentSaveId ?? null,
            _currentSaveName: state._currentSaveName ?? ""
        },
        ts: Date.now()
    };
}
async function serverAutosave(progressObj) { await apiPostJson("/api/v1/eventbuilder/saves/autosave", progressObj); }
async function serverListSaves() { return await apiGetJson("/api/v1/eventbuilder/saves/list"); }
async function serverGetSave(id) { return await apiGetJson(`/api/v1/eventbuilder/saves/get?id=${encodeURIComponent(id || "")}`); }
async function serverSaveAs(name, saveObj, idMaybe) {
    const payload = { name, save: saveObj };
    if (idMaybe) payload.id = idMaybe;
    return await apiPostJson("/api/v1/eventbuilder/saves/saveas", payload);
}
async function serverDeleteSave(id) {
    const saveId = (id || "").trim();
    if (!saveId || saveId === "autosave") return { ok: false, error: "bad_id" };


    let j = await apiPostJson("/api/v1/eventbuilder/saves/delete", { id: saveId });
    if (j?.ok) return j;


    j = await apiGetJson(`/api/v1/eventbuilder/saves/delete?id=${encodeURIComponent(saveId)}`);
    return j || { ok: false };
}

function setCurrentSave(id, name, data = null) {
    state._currentSaveId = id || null;
    state._currentSaveName = (name || "").trim();
    state._currentSaveData = data || null;
}

function getCurrentSave() {
    return {
        id: state._currentSaveId || null,
        name: (state._currentSaveName || "").trim(),
        data: state._currentSaveData || null
    };
}

function saveAutosave() {
    try {
        const snap = snapshotProgress();
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snap));
        setProgressPill("progress: autosaved", "ok");
        serverAutosave(snap).catch(() => { });
    } catch {
        setProgressPill("progress: autosave failed", "bad");
    }
}

function updateLoadModeUi() {
    const mode = (val("ebPatchMode") || "edit").trim();
    const splitPreview = getSplitCpPreviewToggle();

    const block = elById("ebLoadModeBlock");
    const label = elById("ebOutputDataFileLabel");

    const showSecondFile = (mode === "load") || splitPreview;
    if (block) block.style.display = showSecondFile ? "block" : "none";

    if (label) {
        if (splitPreview) {
            label.textContent = "assets/data/events/events.json";
        } else {
            label.textContent = "events/<Location>.json (dictionary file for Load mode)";
        }
    }
}

async function applyProgress(obj, opts = { toast: true }) {
    if (!obj || !obj.header || !obj.state) return;

    setVal("ebEventId", obj.header.eventId || "");
    setVal("ebMusic", obj.header.music ?? "none");
    setVal("ebViewX", String(obj.header.viewX ?? 0));
    setVal("ebViewY", String(obj.header.viewY ?? 0));
    setVal("ebPatchMode", obj.header.patchMode || "edit");
    setI18nToggle(!!obj.header.i18nExport);

    setVal("ebLocation", obj.header.location || "");
    pendingLocation = String(obj.header.location || "").trim();

    if (obj.manifest?.text != null) setManifestText(String(obj.manifest.text));
    else ensureManifestDefault();
    state.actors = structuredClone(Array.isArray(obj.state.actors) ? obj.state.actors : []);
    state.conds = structuredClone(Array.isArray(obj.state.conds) ? obj.state.conds : []);
    state.cmds = normalizeCmdBlocks(structuredClone(Array.isArray(obj.state.cmds) ? obj.state.cmds : []));
    state._currentSaveData = structuredClone(obj);

    await populateEventHeaderMusicSelect();
    updateLoadModeUi();
    UI.renderAll();

    const uid = parseManifestUniqueId(getManifestText());
    if (uid) setManifestStatus(`UniqueID: ${uid}`, "ok");
    else setManifestStatus("UniqueID: (invalid JSON or missing UniqueID)", "warn");

    if (opts.toast) toast("Progress loaded", "Event Builder state applied.", "info");
    scheduleAutosave();
}



function resetBuilderForProjectLoad(options = {}) {
    const keepManifest = !!options.keepManifest;

    setVal("ebEventId", "");
    setVal("ebMusic", "none");
    setVal("ebViewX", "0");
    setVal("ebViewY", "0");
    setVal("ebPatchMode", "edit");
    setVal("ebLocation", "");
    pendingLocation = "";

    if (!keepManifest) {
        setManifestText(DEFAULT_MANIFEST_TEXT);
    }

    state.actors = [];
    state.conds = [];
    state.cmds = [];
    setCurrentSave(null, "", null);

    setVal("ebOutput", "");
    setVal("ebOutputDataFile", "");
    setVal("ebI18nOutput", "");

    setI18nToggle(false);
    updateLoadModeUi();
    UI.renderAll();

    const uid = parseManifestUniqueId(getManifestText());
    if (uid) setManifestStatus(`UniqueID: ${uid}`, "ok");
    else setManifestStatus("UniqueID: (invalid JSON or missing UniqueID)", "warn");

    scheduleAutosave();
}

function makeProjectEventDocId() {
    const location = String(val("ebLocation") || "").trim();
    const rawEventId = String(val("ebEventId") || "").trim();
    const qualifiedEventId = buildQualifiedEventId(rawEventId);

    const seed = qualifiedEventId || rawEventId || location || "event";
    return String(seed)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_\-. ]+/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 120);
}

function makeProjectEventDocName() {
    const rawEventId = String(val("ebEventId") || "").trim();
    const location = String(val("ebLocation") || "").trim();

    if (rawEventId && location) return `${rawEventId} @ ${location}`;
    if (rawEventId) return rawEventId;
    if (location) return `Event @ ${location}`;
    return "Event";
}

function buildProjectManifestPatch() {
    const manifestText = getManifestText().trim() || DEFAULT_MANIFEST_TEXT;
    return {
        manifest: {
            text: manifestText,
            uniqueId: parseManifestUniqueId(manifestText)
        }
    };
}

function buildProjectEventDocument() {
    const snap = snapshotProgress();

    const existingId = String(state?._currentSaveId || "").trim();
    const docId = existingId || makeProjectEventDocId();

    return {
        id: docId,
        name: makeProjectEventDocName(),
        v: 1,
        header: {
            location: String(snap?.header?.location || "").trim(),
            eventId: String(snap?.header?.eventId || "").trim(),
            music: String(snap?.header?.music || "none").trim(),
            viewX: numOr(snap?.header?.viewX, 0),
            viewY: numOr(snap?.header?.viewY, 0),
            patchMode: String(snap?.header?.patchMode || "edit").trim()
        },
        state: snap,
        ts: Date.now()
    };
}

function pickProjectEventDocument(project) {
    const docs = Array.isArray(project?.documents?.events) ? project.documents.events : [];
    if (!docs.length) return null;

    const currentDocId = String(state?._currentSaveId || "").trim().toLowerCase();
    if (currentDocId) {
        const byId = docs.find((d) =>
            String(d?.id || "").trim().toLowerCase() === currentDocId
        );
        if (byId) return byId;
    }

    const currentLocation = String(val("ebLocation") || "").trim().toLowerCase();
    const currentEventId = String(val("ebEventId") || "").trim().toLowerCase();

    if (currentLocation || currentEventId) {
        const exactBoth = docs.find((d) => {
            const h = d?.header || {};
            const loc = String(h.location || "").trim().toLowerCase();
            const eid = String(h.eventId || "").trim().toLowerCase();
            return (!!currentLocation && !!currentEventId && loc === currentLocation && eid === currentEventId);
        });
        if (exactBoth) return exactBoth;

        const exactEventId = docs.find((d) => {
            const h = d?.header || {};
            const eid = String(h.eventId || "").trim().toLowerCase();
            return !!currentEventId && eid === currentEventId;
        });
        if (exactEventId) return exactEventId;

        const exactLocation = docs.find((d) => {
            const h = d?.header || {};
            const loc = String(h.location || "").trim().toLowerCase();
            return !!currentLocation && loc === currentLocation;
        });
        if (exactLocation) return exactLocation;
    }

    return docs[0] || null;
}


//=== Helper to save to project ===
async function applyProjectToEventBuilder(project) {
    const manifestText =
        String(project?.manifest?.text || "").trim() ||
        DEFAULT_MANIFEST_TEXT;

    setManifestText(manifestText);

    const doc = pickProjectEventDocument(project);

    if (doc?.state) {
        await applyProgress(doc.state, { toast: false });

        const docId = String(doc.id || "").trim();
        const docName = String(doc.name || "").trim() || makeProjectEventDocName();
        setCurrentSave(docId || null, docName, doc.state);

        setProgressPill(`progress: project loaded`, "ok");
        toast("Project loaded", `Loaded event "${docName}".`, "info");
        return;
    }

    resetBuilderForProjectLoad({ keepManifest: true });
    setProgressPill("progress: new", "info");
    toast("Project loaded", "Project has no event documents yet.", "info");
}


function cloneJsonSafe(v) {
    try {
        return structuredClone(v);
    } catch {
        return JSON.parse(JSON.stringify(v ?? null));
    }
}

function getCurrentProjectSafe() {
    try {
        return ctxRef?.getCurrentProject?.() || null;
    } catch {
        return null;
    }
}

function getCurrentProjectEventId() {
    const curId = state?._currentSaveId ?? null;
    return String(curId || "").trim();
}

function saveCurrentEventIntoProjectMemory() {
    const project = getCurrentProjectSafe();
    if (!project || typeof project !== "object") return null;

    const hasAnything =
        state.actors.length > 0 ||
        state.conds.length > 0 ||
        state.cmds.length > 0 ||
        (val("ebEventId") || "").trim() !== "";

    if (!hasAnything) return project;

    const doc = buildProjectEventDocument();
    if (!doc?.id) return project;

    project.documents ??= {};
    project.documents.events ??= [];

    const idx = project.documents.events.findIndex(
        (x) => String(x?.id || "").trim() === String(doc.id || "").trim()
    );

    if (idx >= 0) project.documents.events[idx] = doc;
    else project.documents.events.push(doc);

    setCurrentSave(doc.id || null, doc.name || "", doc.state || null);
    return project;
}

function findProjectEventById(project, eventId) {
    const rows = Array.isArray(project?.documents?.events) ? project.documents.events : [];
    return rows.find((x) => String(x?.id || "").trim() === String(eventId || "").trim()) || null;
}

async function openProjectEventById(eventId) {
    const project = saveCurrentEventIntoProjectMemory();
    if (!project) {
        toast("No project", "Create or load a project first.", "warn");
        return;
    }

    const doc = findProjectEventById(project, eventId);
    if (!doc?.state) {
        toast("Event not found", "Could not load the selected event.", "error");
        return;
    }

    await applyProgress(doc.state, { toast: false });
    setCurrentSave(doc.id || null, doc.name || "", doc.state || null);
    setProgressPill(`progress: loaded ${doc.name || doc.id || "event"}`, "ok");
    toast("Event loaded", `Loaded "${doc.name || doc.id}".`, "info");
}

function deleteProjectEventById(eventId) {
    const project = getCurrentProjectSafe();
    if (!project) {
        toast("No project", "Create or load a project first.", "warn");
        return;
    }

    project.documents ??= {};
    project.documents.events ??= [];

    const before = project.documents.events.length;
    project.documents.events = project.documents.events.filter(
        (x) => String(x?.id || "").trim() !== String(eventId || "").trim()
    );

    if (project.documents.events.length === before) {
        toast("Delete", "Event was not found in this project.", "warn");
        return;
    }

    const currentId = getCurrentProjectEventId();
    if (String(currentId) === String(eventId || "")) {
        const replacement = project.documents.events[0] || null;

        if (replacement?.state) {
            applyProgress(replacement.state, { toast: false });
            setCurrentSave(replacement.id || null, replacement.name || "", replacement.state || null);
            setProgressPill(`progress: loaded ${replacement.name || replacement.id || "event"}`, "ok");
        } else {
            resetBuilderForProjectLoad({ keepManifest: true });
            setCurrentSave(null, "", null);
            setProgressPill("progress: new", "info");
        }
    }

    toast("Deleted", "Event removed from current project.", "info");
}

function openProjectEventListModal() {
    const project = saveCurrentEventIntoProjectMemory();
    if (!project) {
        toast("No project", "Create or load a project first.", "warn");
        return;
    }

    const modal = UI.createProjectEventListModal({
        project,
        currentEventId: getCurrentProjectEventId(),
        onLoadEvent: (id) => { openProjectEventById(id); },
        onDeleteEvent: (id) => { deleteProjectEventById(id); },
        onCreateNew: () => { elById("ebBtnNew")?.click(); }
    });

    UI.openModal(modal);
}
function condToToken(c) {
    const t = String(c?.type || "").trim();
    if (!t) return "";

    const raw = String(c?.raw || "").trim();

    if (t === "Raw") {
        return raw;
    }

    const negate = !!c?.negate;
    const bang = negate ? "!" : "";

    const a = Array.isArray(c?.args)
        ? c.args.map(s => String(s || "").trim()).filter(Boolean)
        : [];
    if (!a.length) return `${bang}${t}`;
    if (t === "DayOfMonth" || t === "DayOfWeek" || t === "Season") {
        return `${bang}${t} ${a[0]}`.trim();
    }
    if (t === "GameStateQuery") {
        const q = String(a[0] || "").trim();
        if (!q) return `${bang}${t}`;
        return `${bang}${t} "${q.replace(/"/g, '\\"')}"`;
    }

    if (t === "Time") {
        const min = String(a[0] || "600").trim();
        const max = String(a[1] || "2600").trim();
        return `${bang}${t} ${min} ${max}`.trim();
    }

    return `${bang}${t} ${a.join(" ")}`.trim();
}

function buildScript(options = {}) {
    const useI18n = !!options.useI18n;
    const eventIdForI18n = String(options.eventId || "").trim();
    const music = (val("ebMusic") || "none").trim();
    const vx = numOr(val("ebViewX"), 0);
    const vy = numOr(val("ebViewY"), 0);

    const actorParts = [];
    for (const a of state.actors) {
        const name = (a.name || "").trim();
        if (!name) continue;
        actorParts.push(`${name} ${numOr(a.x, 0)} ${numOr(a.y, 0)} ${numOr(a.dir, 2)}`);
    }

    const condTokens = state.conds.map(condToToken).filter(Boolean);
    const precondStr = condTokens.join(" ").trim();

    const flatCmds = flattenCmds(state.cmds);
    const i18nEntries = {};
    const cmdTokens = flatCmds.map((cmd) => {
        ensureCommandId(cmd);
        if (useI18n && shouldTranslateCommand(cmd)) {
            const key = buildCommandI18nKey(eventIdForI18n, cmd);
            i18nEntries[key] = getCommandTranslatableText(cmd);
            return cmdToToken(cmd, { useI18n: true, i18nKey: key });
        }
        return cmdToToken(cmd);
    }).filter(s => (s || "").trim()).map(s => s.trim());

    const lines = [];
    lines.push(music);
    lines.push(`${vx} ${vy}`);
    lines.push(actorParts.join(" ").trim() || "farmer 0 0 2");
    lines.push(...cmdTokens);

    return { precondStr, script: lines.join("/"), i18nEntries };
}

const SPLIT_CP_PREVIEW_KEY = "eventBuilder.splitCpPreview.v1";

function getSplitCpPreviewToggle() {
    const el = elById("ebSplitCpPreview");
    if (el) return !!el.checked;
    try { return localStorage.getItem(SPLIT_CP_PREVIEW_KEY) === "1"; } catch { return false; }
}

function setSplitCpPreviewToggle(on) {
    const v = !!on;
    const el = elById("ebSplitCpPreview");
    if (el) el.checked = v;
    try { localStorage.setItem(SPLIT_CP_PREVIEW_KEY, v ? "1" : "0"); } catch { }
    updateLoadModeUi();
}

function buildQualifiedEventId(rawEventId, options = {}) {
    const base = String(rawEventId || "").trim();
    const mode = String(options.mode || "manifest").trim().toLowerCase();

    const prefix =
        mode === "preview"
            ? getPreviewModId()
            : parseManifestUniqueId(getManifestText());

    if (!prefix) return base;
    if (!base) return prefix;
    if (base.startsWith(prefix + ".") || base === prefix) return base;
    return `${prefix}.${base}`;
}

function buildCpOutputs() {
    const rawEventId = (val("ebEventId") || "").trim();
    const location = (val("ebLocation") || "").trim();
    const patchMode = (val("ebPatchMode") || "edit").trim();
    const useI18n = getI18nToggle();
    const splitPreview = getSplitCpPreviewToggle();
    const previewEventId = buildQualifiedEventId(rawEventId, { mode: "preview" });

    const { precondStr, script, i18nEntries } = buildScript({
        useI18n,
        eventId: previewEventId
    });

    const cpEventId = "{{ModId}}." + rawEventId.replace(/^\{\{ModId\}\}\./i, "").replace(/^[^.]+\./, "");

    const entryKey = precondStr
        ? `${cpEventId}/${precondStr}/`
        : `${cpEventId}/`;
    if (splitPreview) {
        const contentJson = {
            Format: "2.9.0",
            Changes: [
                {
                    LogName: "Events Include",
                    Action: "Include",
                    FromFile: "assets/data/events/events.json"
                }
            ]
        };

        const dataFileJson = {
            Changes: [
                {
                    LogName: rawEventId || "Event Builder Preview",
                    Action: "EditData",
                    Target: `Data/Events/${location}`,
                    Entries: { [entryKey]: script }
                }
            ]
        };

        return {
            mode: patchMode,
            splitPreview: true,
            useI18n,
            contentJson,
            dataFileRel: "assets/data/events/events.json",
            dataFileJson,
            i18nJson: useI18n ? i18nEntries : null
        };
    }
    if (patchMode === "load") {
        const dataFileRel = `events/${location}.json`;
        const contentJson = {
            Format: "2.0.0",
            Changes: [{
                Action: "Load",
                Target: `Data/Events/${location}`,
                FromFile: dataFileRel
            }]
        };

        const dataFileJson = { [entryKey]: script };

        return {
            mode: "load",
            splitPreview: false,
            useI18n,
            contentJson,
            dataFileRel,
            dataFileJson,
            i18nJson: useI18n ? i18nEntries : null
        };
    }
    const contentJson = {
        Format: "2.0.0",
        Changes: [{
            Action: "EditData",
            Target: `Data/Events/${location}`,
            Entries: { [entryKey]: script }
        }]
    };

    return {
        mode: "edit",
        splitPreview: false,
        useI18n,
        contentJson,
        dataFileRel: null,
        dataFileJson: null,
        i18nJson: useI18n ? i18nEntries : null
    };
}
function fillSelect(sel, items, placeholder = "(select)") {
    if (!sel) return;
    sel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = placeholder;
    sel.appendChild(opt0);
    for (const it of items) {
        const opt = document.createElement("option");
        opt.value = it;
        opt.textContent = it;
        sel.appendChild(opt);
    }
}

function makeDatalist(id, items) {
    let dl = document.getElementById(id);
    if (!dl) {
        dl = document.createElement("datalist");
        dl.id = id;
        document.body.appendChild(dl);
    }
    dl.innerHTML = "";
    for (const it of (items || [])) {
        const o = document.createElement("option");
        if (typeof it === "string") {
            o.value = it;
        } else if (it && typeof it === "object") {
            o.value = String(it.value ?? "");
            if (it.label != null) o.label = String(it.label);
            if (it.text != null) o.textContent = String(it.text);
        }
        dl.appendChild(o);
    }
    return dl;
}

function actorNameOptions() {
    const fromActors = state.actors.map(a => a.name).filter(Boolean);
    const npcNames = (npcs || []).map(n => typeof n === "string" ? n : String(n?.value || "").trim()).filter(Boolean);
    const set = new Set(["farmer", ...npcNames, ...fromActors]);
    return [...set].sort((a, b) => a.localeCompare(b));
}

function refreshDatalists() {
    makeDatalist("eb-dl-npcs", npcs);
    makeDatalist("eb-dl-actors", actorNameOptions());

    makeDatalist("eb-dl-cmds", (COMMAND_NAMES || []).map(v => {
        const desc = COMMAND_DESCS?.[v];
        const pretty = desc ? `${v} — ${desc}` : v;
        return { value: v, label: pretty, text: pretty };
    }));

    makeDatalist("eb-dl-items", (objectItems || []).map(it => {
        const name = it.displayName || it.name || it.id || "";
        const tok = it.token || `(O)${it.id}`;
        const type = it.type || "";
        return { value: tok, label: type ? `${name} — ${tok} — ${type}` : `${name} — ${tok}` };
    }));

    makeDatalist("eb-dl-quests", (quests || []).map(q => {
        const id = String(q?.id || "").trim();
        const title = String(q?.title || "").trim();
        const type = String(q?.type || "").trim();

        const pretty =
            `${title || id}${id ? ` — ${id}` : ""}${type ? ` — ${type}` : ""}`;

        return {
            value: id,
            label: pretty,
            text: pretty
        };
    }).filter(Boolean));


    makeDatalist("eb-dl-special-orders", (specialOrders || []).map(o => {
        const id = String(o?.id || "").trim();
        const name = String(o?.displayName || "").trim();
        const requester = String(o?.requester || "").trim();

        const pretty =
            `${name || id}${id ? ` — ${id}` : ""}${requester ? ` — ${requester}` : ""}`;

        return {
            value: id,
            label: pretty,
            text: pretty
        };
    }).filter(Boolean));

    makeDatalist("eb-dl-cooking-recipes", (cookingRecipes || []).map(r => {
        const name = r.displayName || r.name || "";
        const unlock =
            r.unlockType === "friendship" ? `friendship: ${r.unlockNpc || "?"} ${r.unlockHearts ?? "?"}` :
                r.unlockType === "skill" ? `skill: ${r.unlockSkill || "?"} ${r.unlockLevel ?? "?"}` :
                    r.unlockType === "default" ? "default" :
                        r.unlockType === "none" ? "none" :
                            (r.unlockRaw || "other");

        return {
            value: r.name || "",
            label: `${name} — ${r.name || ""} — ${unlock}`
        };
    }));

    makeDatalist("eb-dl-crafting-recipes", (craftingRecipes || []).map(r => {
        const name = r.displayName || r.name || "";
        const unlock =
            r.unlockType === "skill" ? `skill: ${r.unlockSkill || "?"} ${r.unlockLevel ?? "?"}` :
                r.unlockType === "default" ? "default" :
                    r.unlockType === "none" ? "none" :
                        (r.unlockRaw || "other");

        return {
            value: r.name || "",
            label: `${name} — ${r.name || ""} — ${unlock}`
        };
    }));

    makeDatalist("eb-dl-item-above-head", [
        { value: "pan", label: 'special type — pan' },
        { value: "hero", label: 'special type — hero' },
        { value: "sculpture", label: 'special type — sculpture' },
        { value: "joja", label: 'special type — joja' },
        { value: "slimeEgg", label: 'special type — slimeEgg' },
        { value: "rod", label: 'special type — rod' },
        { value: "sword", label: 'special type — sword' },
        { value: "ore", label: 'special type — ore' },

        ...(objectItems || []).map(it => {
            const name = it.displayName || it.name || it.id || "";
            const tok = it.token || `(O)${it.id}`;
            const type = it.type || "";
            return {
                value: tok,
                label: type ? `${name} — ${tok} — ${type}` : `${name} — ${tok}`
            };
        })
    ]);

    makeDatalist("eb-dl-objects", (objectItems || [])
        .filter(it => {
            const tok = String(it?.token || "").trim();
            const type = String(it?.type || "").trim().toLowerCase();
            return tok.startsWith("(O)") || type === "object";
        })
        .map(it => {
            const name = it.displayName || it.name || it.id || "";
            const tok = it.token || `(O)${it.id}`;
            const type = it.type || "";
            return {
                value: tok,
                label: type ? `${name} — ${tok} — ${type}` : `${name} — ${tok}`
            };
        })
    );

    makeDatalist("eb-dl-music", state.musicChoices || []);
    makeDatalist("eb-dl-sounds", state.soundChoices || []);



}
function renderCmdRawHtml(c) {
    return `
    <div class="field grow eb-cmd-text-field" style="min-width:520px;">
      <label>Raw</label>
      <textarea class="text eb-cmd-textarea"
                style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;"
                data-k="raw"
                rows="2"
                placeholder="Command Step has not been implimented yet, so this field takes in raw text">${escapeHtml(c.raw || "")}</textarea>
    </div>
  `;
}
async function refreshListsFromApi() {
    if (!ctxRef?.api) return;

    const res = await ctxRef.api.get("/api/v1/world/locations");
    if (res.ok && res.json?.ok) {
        locations = res.json.locations || [];
        fillSelect($("ebLocation"), locations, "(select location)");
        if (pendingLocation) $("ebLocation").value = pendingLocation;
    }

    const npcRows = await fetchNpcChoices();
    npcs = npcRows;

    const itemsRes = await ctxRef.api.get("/api/v1/items/all");
    if (itemsRes.ok && itemsRes.json?.ok) objectItems = itemsRes.json.items || [];
    else objectItems = [];

    const cookingRes = await ctxRef.api.get("/api/v1/recipes/cooking");
    if (cookingRes.ok && cookingRes.json?.ok) cookingRecipes = cookingRes.json.recipes || [];
    else cookingRecipes = [];

    const craftingRes = await ctxRef.api.get("/api/v1/recipes/crafting");
    if (craftingRes.ok && craftingRes.json?.ok) craftingRecipes = craftingRes.json.recipes || [];
    else craftingRecipes = [];

    const questsRes = await ctxRef.api.get("/api/v1/quests");
    if (questsRes.ok && questsRes.json?.ok) quests = questsRes.json.quests || [];
    else quests = [];

    const specialOrdersRes = await ctxRef.api.get("/api/v1/special-orders");
    if (specialOrdersRes.ok && specialOrdersRes.json?.ok) specialOrders = specialOrdersRes.json.orders || [];
    else specialOrders = [];

    refreshDatalists();
}

function applyConnected(meta) {
    metaRef = meta || null;
    setStatus("Connected", "ok");
    const ver = meta?.gameVersion || meta?.version || "—";
    const worldReady = meta?.worldReady ? "true" : "false";
    const player = meta?.player || "—";
    const el = elById("ebServerInfo");
    if (el) el.textContent = `Game ${ver} • WorldReady=${worldReady} • Player=${player}`;
}

async function tryAutoConnectFromTool() {
    if (!ctxRef?.api) return false;

    setStatus("Connecting…", "warn");
    try {
        const res = await ctxRef.api.get("/api/v1/meta");
        if (!res.ok || !res.json || res.json.ok === false) {
            setStatus("Not connected", "warn");
            return false;
        }
        applyConnected(res.json);
        await refreshListsFromApi();

        try {
            serverGroupPresetsCache = await loadGroupPresetsFromServer();
            if (!serverGroupPresetsCache) serverGroupPresetsCache = null;
        } catch {
            serverGroupPresetsCache = null;
        }

        setStatus("Ready", "ok");
        return true;
    } catch {
        setStatus("Not connected", "warn");
        return false;
    }
}
async function runEvent() {
    if (!ctxRef?.api) {
        toast("Not connected", "Connect first in the main header.", "error");
        return;
    }

    const location = (val("ebLocation") || "").trim();
    if (!location) {
        toast("Missing fields", "Location is required.", "error");
        return;
    }

    const rawEventId = (val("ebEventId") || "").trim();
    const eventId = buildQualifiedEventId(rawEventId);

    const { script } = buildScript();
    const hasEnd = !!script && /(?:^|\/)end(?:\s|\/|$)/i.test(script);

    if (!script || !hasEnd) {
        toast("Bad script", "Event script is empty or missing /end.", "error");
        return;
    }

    setStatus("Running event…", "warn");

    const st = await ctxRef.api.post("/api/v1/events/run", {
        location,
        eventData: script,
        warpToEventLocation: true,
        forceLocation: false
    });

    if (!st.ok || !st.json?.ok) {
        setStatus(`Run failed (${st.status})`, "bad");
        toast("Run failed", `Status ${st.status}`, "error");
        return;
    }

    setStatus("Event started", "ok");
    toast("Event started", `${eventId ? eventId + " @ " : ""}${location}`, "info");
}

async function runEventWithContentPatcher() {
    if (!ctxRef?.api) {
        toast("Not connected", "Connect first in the main header.", "error");
        return;
    }

    const location = (val("ebLocation") || "").trim();
    if (!location) {
        toast("Missing fields", "Location is required.", "error");
        return;
    }

    const rawEventId = (val("ebEventId") || "").trim();
    const eventId = buildQualifiedEventId(rawEventId);
    if (!eventId) {
        toast("Missing fields", "Event ID is required.", "error");
        return;
    }

    const manifestText = (getManifestText() || "").trim();
    if (!manifestText) {
        toast("Missing manifest", "manifest.json is required.", "error");
        return;
    }

    let manifestObj = null;
    try {
        manifestObj = JSON.parse(manifestText);
    } catch {
        toast("Bad manifest", "manifest.json is not valid JSON.", "error");
        return;
    }

    const manifestUniqueId = String(manifestObj?.UniqueID || "").trim();
    if (!manifestUniqueId) {
        toast("Bad manifest", "manifest.json is missing UniqueID.", "error");
        return;
    }

    const cpFor = String(manifestObj?.ContentPackFor?.UniqueID || "").trim();
    if (cpFor !== "Pathoschild.ContentPatcher") {
        toast("Bad manifest", "ContentPackFor.UniqueID must be Pathoschild.ContentPatcher.", "error");
        return;
    }

    const { script } = buildScript();
    const hasEnd = !!script && /(?:^|\/)end(?:\s|\/|$)/i.test(script);
    if (!script || !hasEnd) {
        toast("Bad script", "Event script is empty or missing /end.", "error");
        return;
    }

    const cpPreviewOut = buildCpOutputs();
    if (!cpPreviewOut) {
        setStatus("Run CP failed", "bad");
        toast("Run CP failed", "Could not build Content Patcher outputs.", "error");
        return;
    }

    const cpOut = {
        mode: cpPreviewOut.mode || "edit",
        splitPreview: !!cpPreviewOut.splitPreview,
        useI18n: !!cpPreviewOut.useI18n,
        contentJson: cpPreviewOut.contentJson || null,
        dataFileRel: cpPreviewOut.dataFileRel || null,
        dataFileJson: cpPreviewOut.dataFileJson || null,
        i18nJson: cpPreviewOut.i18nJson || null,
        contentText: cpPreviewOut.contentJson
            ? JSON.stringify(cpPreviewOut.contentJson, null, 2)
            : "",

        dataFileText: cpPreviewOut.dataFileJson
            ? JSON.stringify(cpPreviewOut.dataFileJson, null, 2)
            : "",

        i18nText: cpPreviewOut.i18nJson
            ? JSON.stringify(cpPreviewOut.i18nJson, null, 2)
            : "",
        files: {
            "content.json": cpPreviewOut.contentJson || {}
        },
        fileTexts: {
            "content.json": cpPreviewOut.contentJson
                ? JSON.stringify(cpPreviewOut.contentJson, null, 2)
                : "{}"
        }
    };

    if (cpPreviewOut.dataFileRel && cpPreviewOut.dataFileJson) {
        cpOut.files[cpPreviewOut.dataFileRel] = cpPreviewOut.dataFileJson;
        cpOut.fileTexts[cpPreviewOut.dataFileRel] = JSON.stringify(cpPreviewOut.dataFileJson, null, 2);
    }

    if (cpPreviewOut.useI18n && cpPreviewOut.i18nJson) {
        cpOut.files["i18n/default.json"] = cpPreviewOut.i18nJson;
        cpOut.fileTexts["i18n/default.json"] = JSON.stringify(cpPreviewOut.i18nJson, null, 2);
    }

    const progress = snapshotProgress();

    setStatus("Running with Content Patcher…", "warn");

    const st = await ctxRef.api.post("/api/v1/eventbuilder/runCp", {
        progress,
        manifestText,
        manifest: manifestObj,
        outputs: cpOut,
        options: {
            resetSeen: true,
            warpToSafeTile: true,
            reloadContentPatcher: true,
            letAutoTrigger: true
        }
    });

    if (!st.ok || !st.json?.ok) {
        const msg =
            st.json?.error ||
            st.json?.details ||
            `Status ${st.status}`;

        setStatus("Run CP failed", "bad");
        toast("Run CP failed", String(msg), "error");
        return;
    }

    const packFolder = String(st.json.packFolder || "").trim();
    const reloadUniqueId = String(st.json?.reloadUniqueId || manifestUniqueId || "").trim();
    const reloadCmd = `patch reload ${reloadUniqueId}`;

    let copyMsg = `copied: ${reloadCmd}`;
    try {
        await navigator.clipboard.writeText(reloadCmd);
    } catch {
        copyMsg = `copy failed — run manually: ${reloadCmd}`;
    }

    setStatus("Run CP prepared", "ok");
    toast(
        "Run CP ready",
        `${eventId} @ ${location}${packFolder ? ` • ${packFolder}` : ""} • ${copyMsg}`,
        "info"
    );
}


async function endEvent() {
    if (!ctxRef?.api) return;
    const res = await ctxRef.api.post("/api/v1/events/end", {});
    if (!res.ok || !res.json?.ok) {
        toast("End event failed", `Status ${res.status}`, "error");
        return;
    }
    toast("Event ended", "Ended current event.", "info");
}

async function captureXY() {
    if (!ctxRef?.api) {
        toast("Not connected", "Connect first in the main header.", "error");
        return;
    }
    const loc = (val("ebLocation") || "").trim();
    if (!loc) {
        toast("Pick a location", "Select a location first.", "info");
        return;
    }

    setStatus("Capturing map screenshot…", "warn");
    const safeName = `XY_${loc.replace(/[^a-z0-9_\-]+/gi, "_")}_${Date.now()}`;

    const res = await ctxRef.api.post("/api/v1/screenshots/map", {
        location: loc,
        scale: 1.0,
        name: safeName,
        open: true
    });

    if (!res.ok || !res.json?.ok) {
        setStatus(`Screenshot failed (${res.status})`, "bad");
        toast("Screenshot failed", `Status ${res.status}`, "error");
        return;
    }

    setStatus("Screenshot saved", "ok");
    toast("Screenshot saved", String(res.json.file || safeName), "info");
}
async function captureMapForPicker(location, opts = {}) {
    const forceRefresh = !!opts.forceRefresh;
    const key = String(location || "").trim().toLowerCase();

    if (!key) {
        return { ok: false, error: "missing_location" };
    }

    if (!forceRefresh) {
        const cached = MAP_PICKER_CAPTURE_CACHE.get(key);
        if (cached?.ok && (cached.url || cached.file)) {
            return { ...cached, cached: true };
        }
    }

    const payload = {
        location,
        scale: 1.0,
        name: `PICK_${location}`,
        open: false
    };
    try {
        if (ctxRef?.api?.post) {
            const res = await ctxRef.api.post("/api/v1/screenshots/map", payload);
            const json = res?.json;

            if (!res?.ok || !json?.ok) {
                console.warn("[MapPicker] /screenshots/map failed (apiClient)", {
                    status: res?.status,
                    json,
                    payload
                });
                return { ok: false, error: json?.error || `http_${res?.status || 0}` };
            }

            const file = (json.file || "").trim();
            const relUrl = (json.url || "").trim();

            if (!file && !relUrl) {
                console.warn("[MapPicker] /screenshots/map returned ok but no file/url", json);
                return { ok: false, error: "missing_file" };
            }

            const result = { ok: true, file, url: (file || relUrl), relUrl };
            MAP_PICKER_CAPTURE_CACHE.set(key, result);
            return result;
        }
    } catch (e) {
        console.warn("[MapPicker] exception calling /screenshots/map via apiClient", e);
    }

    const token = (getAuthToken?.() || "").trim();
    if (!token) {
        console.warn("[MapPicker] Missing token (getAuthToken returned blank).");
        return { ok: false, error: "missing_token" };
    }

    try {
        const url = `/api/v1/screenshots/map?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            cache: "no-store",
        });

        let json = null;
        try { json = await res.json(); } catch { }

        if (!res.ok || !json?.ok) {
            console.warn("[MapPicker] /screenshots/map failed (fetch)", {
                status: res.status,
                statusText: res.statusText,
                json,
                payload
            });
            return { ok: false, error: json?.error || `http_${res.status}` };
        }

        const file = (json.file || "").trim();
        const relUrl = (json.url || "").trim();

        if (!file && !relUrl) {
            console.warn("[MapPicker] /screenshots/map returned ok but no file/url", json);
            return { ok: false, error: "missing_file" };
        }

        const result = { ok: true, file, url: (file || relUrl), relUrl };
        MAP_PICKER_CAPTURE_CACHE.set(key, result);
        return result;
    }
    catch (e) {
        console.warn("[MapPicker] exception calling /screenshots/map", e);
        return { ok: false, error: "exception" };
    }
}
const UI = initEventBuilderUi({
    $,
    toast,
    setPill,
    elById,
    escapeHtml,
    numOr,
    boolOr,
    state,
    CONDITION_DEFS,
    COMMAND_NAMES,
    COMMAND_DESCS,
    TEMPLATE_CMDS,
    getNpcs: () => npcs,
    getObjectItems: () => objectItems,
    getLocations: () => locations,
    getTempActorAssetOptions,
    getTempActorAssetMeta,
    buildTempActorImageUrl,
    makeId,
    normalizeCmdBlocks,
    cloneCommandWithNewId,
    assignFreshIdsToCommands,
    refreshDatalists,
    actorNameOptions,
    renderCmdRawHtml,
    renderCmdTemplateHtml,
    getCommandChoices,
    fillSelect,
    getAllPresetsMerged,
    loadGroupPresets,
    saveGroupPresets,
    saveGroupPresetsToServer,
    saveGroupPresetImageToServer,
    deleteGroupPresetSmart,
    getServerGroupPresetsCache: () => serverGroupPresetsCache,
    setServerGroupPresetsCache: (v) => { serverGroupPresetsCache = v; },
    serverListSaves,
    serverGetSave,
    applyProgress,
    setCurrentSave,
    setProgressPill,
    scheduleAutosave,
    captureMapForPicker,
    getAuthToken: () => {
        try {
            const t = ctxRef?.token || ctxRef?.api?.token || ctxRef?.api?.opts?.token;
            return (t || "").toString();
        } catch {
            return "";
        }
    },
    serverDeleteSave,
});
function wireUi() {
    ["ebLocation", "ebEventId", "ebMusic", "ebViewX", "ebViewY", "ebPatchMode"].forEach(id => {
        const el = elById(id);
        if (!el) return;
        el.addEventListener("input", () => {
            if (id === "ebLocation") pendingLocation = (el.value || "").trim();
            scheduleAutosave();
        });
        el.addEventListener("change", () => {
            if (id === "ebLocation") pendingLocation = (el.value || "").trim();
            if (id === "ebPatchMode") updateLoadModeUi();
            scheduleAutosave();
        });
    });

    for (const id of MF_IDS) {
        const el = elById(id);
        if (!el) continue;

        ensureManifestDefault();

        const onMan = () => {
            const uid = parseManifestUniqueId(getManifestText());
            if (uid) setManifestStatus(`UniqueID: ${uid}`, "ok");
            else setManifestStatus("UniqueID: (invalid JSON or missing UniqueID)", "warn");
            scheduleAutosave();
        };

        el.addEventListener("input", onMan);
        el.addEventListener("change", onMan);
        break;
    }


    elById("ebBtnNew")?.addEventListener("click", () => {
        const hasWork =
            state.actors.length > 0 ||
            state.conds.length > 0 ||
            state.cmds.length > 0 ||
            (val("ebEventId") || "").trim() !== "";

        if (hasWork) {
            const ok = confirm(
                "Start a new event?\n\n" +
                "This will clear the current builder state including:\n" +
                "• Event header\n" +
                "• Actors\n" +
                "• Preconditions\n" +
                "• Commands\n\n" +
                "Current event changes will be kept in the project memory."
            );

            if (!ok) return;
        }
        saveCurrentEventIntoProjectMemory();
        setVal("ebEventId", "");
        setVal("ebMusic", "none");
        setVal("ebViewX", "0");
        setVal("ebViewY", "0");
        setVal("ebPatchMode", "edit");
        setVal("ebLocation", "");
        pendingLocation = "";
        state.actors = [];
        state.conds = [];
        state.cmds = [];
        setCurrentSave(null, "", null);
        UI.renderAll();
        setVal("ebOutput", "");
        setVal("ebOutputDataFile", "");
        setVal("ebI18nOutput", "");
        updateLoadModeUi();
        updateI18nUi();

        scheduleAutosave();
        setProgressPill("progress: new", "info");
        toast("New", "Started a new event (previous event kept in project memory).", "info");
    });

    elById("ebBtnEventList")?.addEventListener("click", () => {
        openProjectEventListModal();
    });

    elById("ebSplitCpPreview")?.addEventListener("change", (e) => {
        setSplitCpPreviewToggle(!!e.target.checked);
        scheduleAutosave();
    });


    elById("ebBtnRun")?.addEventListener("click", runEvent);
    elById("ebBtnRunCp")?.addEventListener("click", runEventWithContentPatcher);
    elById("ebBtnEnd")?.addEventListener("click", endEvent);


    elById("ebBtnPickViewportXY")?.addEventListener("click", async () => {
        const location = (val("ebLocation") || "").trim();

        if (!location) {
            toast("Missing location", "Select a location first.", "error");
            return;
        }

        await UI.openSimpleMapPicker({
            location,
            title: "Pick Viewport X/Y",
            initialX: numOr(val("ebViewX"), 0),
            initialY: numOr(val("ebViewY"), 0),
            onPick: ({ x, y }) => {
                setVal("ebViewX", String(x ?? 0));
                setVal("ebViewY", String(y ?? 0));
                scheduleAutosave();
                toast("Viewport Updated", `Viewport set to ${x}, ${y}`, "ok");
            }
        });
    });
    elById("ebBtnCaptureXY")?.addEventListener("click", captureXY);
    elById("ebAddActor")?.addEventListener("click", () => {
        state.actors.push({ name: "", x: 0, y: 0, dir: 2 });
        UI.renderActors();
        refreshDatalists();
        scheduleAutosave();
    });
    elById("ebAddFarmer")?.addEventListener("click", () => {
        state.actors.push({ name: "farmer", x: 0, y: 0, dir: 2 });
        UI.renderActors();
        refreshDatalists();
        scheduleAutosave();
    });
    fillSelect($("ebCondType"), CONDITION_DEFS.map(d => d.key), "(select precondition)");
    elById("ebAddCond")?.addEventListener("click", () => {
        const t = (val("ebCondType") || "").trim();
        if (!t) return;

        const def = CONDITION_DEFS.find(d => d.key === t);
        const nargs = def?.args?.length || 0;

        let defaultArgs = new Array(nargs).fill("");

        if (t === "Time") {
            defaultArgs = ["600", "2600"];
        }

        state.conds.push({
            type: t,
            negate: false,
            args: defaultArgs,
            raw: ""
        });

        UI.renderConds();
        scheduleAutosave();
    });

    elById("ebClearConds")?.addEventListener("click", () => {
        state.conds = [];
        UI.renderConds();
        scheduleAutosave();
    });
    const cmdInput = $("ebCmdType");
    if (cmdInput) {
        cmdInput.placeholder = "type to search…";
        UI.createCmdDropdown(cmdInput, () => getCommandChoices());
    }
    elById("ebAddCmd")?.addEventListener("click", () => {
        const t = (val("ebCmdType") || "").trim();
        if (!t) return;

        const base = { type: t, id: makeCommandId() };
        if (t === "addTemporaryActor") {
            base.actorKind = "Character";
            base.assetName = "";
            base.spriteAssetName = "";
            base.spriteWidth = 16;
            base.spriteHeight = 32;
            base.x = 0;
            base.y = 0;
            base.direction = 2;
            base.breather = "true";
            base.overrideName = "";
        }


        if (t === "advancedMove") {
            base.actor = "Abigail";
            base.loop = "true";
            base.steps = [];
        }

        if (!TEMPLATE_CMDS.has(t)) base.raw = "";

        state.cmds.push({ kind: "cmd", cmd: base });
        UI.renderCmds();
        scheduleAutosave();

        const input = elById("ebCmdType");
        if (input) {
            input.value = "";
            input.focus();
        }

        toast("Command added", `"${t}" has been added`, "ok");
    });
    elById("ebCmdType")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            elById("ebAddCmd")?.click();
        }
    });
    elById("ebAddGroup")?.addEventListener("click", () => {

        const modal = UI.createGroupPickerModal(
            () => {
                const name = `Group ${state.cmds.filter(x => x?.kind === "group").length + 1}`;
                state.cmds.push({ kind: "group", id: makeId("grp"), name, description: "", imageDataUrl: "", collapsed: false, items: [] });
                UI.renderCmds();
                scheduleAutosave();
            },
            (preset) => {
                const name = preset.name || `Group ${state.cmds.filter(x => x?.kind === "group").length + 1}`;
                state.cmds.push({
                    kind: "group",
                    id: makeId("grp"),
                    name,
                    description: preset.description || "",
                    imageDataUrl: preset.imageDataUrl || "",
                    collapsed: false,
                    items: assignFreshIdsToCommands(preset.items || [])
                });
                UI.renderCmds();
                scheduleAutosave();
            }

        );
        UI.openModal(modal);
    });
    elById("ebClearCmds")?.addEventListener("click", () => {
        state.cmds = [];
        UI.renderCmds();
        scheduleAutosave();
    });
    elById("ebBtnSave")?.addEventListener("click", async () => {
        const snap = snapshotProgress();
        try {
            const json = JSON.stringify(snap, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "event-builder-progress.json";
            a.click();
            URL.revokeObjectURL(a.href);
        } catch { }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
        } catch { }
        if (ctxRef?.api) {
            try {
                let id =
                    state._currentSaveId ??
                    snap?.state?._currentSaveId ??
                    null;

                let name =
                    String(
                        state._currentSaveName ||
                        snap?.state?._currentSaveName ||
                        ""
                    ).trim();
                if (!id || !name) {
                    const suggested = (val("ebEventId") || "My Event").trim();
                    name = (prompt("Save As name?", suggested) || "").trim();
                    if (!name) {
                        setProgressPill("progress: saved (local)", "ok");
                        toast("Saved", "Saved locally (no server name provided).", "info");
                        return;
                    }

                    id = null;
                }

                const j = await serverSaveAs(name, snap, id);

                if (j?.ok && j.id) {
                    markCurrentStateAsSaved(j.id, name);
                    setProgressPill("progress: saved", "ok");
                    toast("Saved", `Saved to mod folder: ${name}`, "info");
                    return;
                }
            } catch {
            }
        }

        setProgressPill("progress: saved", "ok");
        toast("Saved", "Saved locally (server save not available).", "info");
    });
    let fileInp = elById("ebProgressFileInput");
    if (!fileInp) {
        fileInp = document.createElement("input");
        fileInp.type = "file";
        fileInp.accept = "application/json";
        fileInp.id = "ebProgressFileInput";
        fileInp.style.display = "none";
        document.body.appendChild(fileInp);
    }
    elById("ebBtnLoad")?.addEventListener("click", async () => {
        if (!confirmDiscardChanges("Load saved progress")) return;

        if (ctxRef?.api) {
            const modal = UI.createServerLoadModal(() => {
                fileInp.value = "";
                fileInp.click();
            });
            UI.openModal(modal);
            return;
        }

        fileInp.value = "";
        fileInp.click();
    });

    fileInp.onchange = (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;

        const r = new FileReader();
        r.onload = () => {
            try {
                const obj = JSON.parse(String(r.result || "{}"));
                applyProgress(obj, { toast: true });

                const loadedId = obj?.state?._currentSaveId ?? null;
                const loadedName = String(obj?.state?._currentSaveName || "").trim();

                if (loadedId && loadedName) {
                    markCurrentStateAsSaved(loadedId, loadedName);
                    setProgressPill(`progress: loaded ${loadedName}`, "ok");
                } else {
                    markCurrentStateAsSaved(null, "");
                    setProgressPill("progress: loaded file", "ok");
                }
            } catch {
                toast("Load failed", "Invalid JSON file.", "error");
            } finally {
                e.target.value = "";
            }
        };

        r.readAsText(f);
    };
    elById("ebBtnLoadAutosave")?.addEventListener("click", async () => {
        if (!confirmDiscardChanges("Load auto-save")) return;

        if (ctxRef?.api) {
            try {
                const g = await serverGetSave("autosave");
                if (g?.ok && g.save) {
                    applyProgress(g.save, { toast: true });
                    markCurrentStateAsSaved("autosave", "autosave");
                    setProgressPill("progress: loaded autosave", "ok");
                    return;
                }
            } catch { }
        }

        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (!raw) {
            toast("Auto-save", "No autosave found yet.", "info");
            return;
        }

        try {
            const parsed = JSON.parse(raw);
            applyProgress(parsed, { toast: true });
            markCurrentStateAsSaved("autosave", "autosave");
            setProgressPill("progress: loaded autosave", "ok");
        } catch {
            toast("Auto-save", "Autosave data is corrupted.", "error");
        }
    });
    elById("ebBtnBuild")?.addEventListener("click", () => {
        const out = buildCpOutputs();

        setVal("ebOutput", JSON.stringify(out.contentJson, null, 2));
        setVal("ebOutputDataFile", out.dataFileJson ? JSON.stringify(out.dataFileJson, null, 2) : "");

        const eventId = buildQualifiedEventId((val("ebEventId") || "").trim(), { mode: "preview" });
        const flatCmds = flattenCmds(state.cmds);

        setVal(
            "ebI18nOutput",
            formatI18nJsonWithComments(eventId, flatCmds, out.i18nJson || {})
        );

        updateLoadModeUi();
        updateI18nUi();

        let msg = "Generated Content Patcher output.";
        if (out.splitPreview && out.useI18n) msg = "Generated content.json + events.json + i18n preview.";
        else if (out.splitPreview) msg = "Generated content.json + events.json preview.";
        else if (out.useI18n) msg = "Generated Content Patcher output + i18n.";

        toast("Preview built", msg, "info");
    });

    elById("ebBtnCopy")?.addEventListener("click", async () => {
        try {
            const out = buildCpOutputs();

            let text = JSON.stringify(out.contentJson, null, 2);

            if (out.dataFileJson) {
                const secondName = out.splitPreview
                    ? "assets/data/events/events.json"
                    : "events/<Location>.json";

                text =
                    `// content.json\n${JSON.stringify(out.contentJson, null, 2)}` +
                    `\n\n// ${secondName}\n${JSON.stringify(out.dataFileJson, null, 2)}`;
            }

            if (out.useI18n) {
                text += `\n\n// i18n/default.json\n${JSON.stringify(out.i18nJson || {}, null, 2)}`;
            }

            await navigator.clipboard.writeText(text || "");
            toast("Copied", "Preview copied to clipboard.", "info");
        } catch {
            toast("Copy failed", "Clipboard permission blocked.", "error");
        }
    });

    elById("ebBtnDownload")?.addEventListener("click", () => {
        const out = buildCpOutputs();

        {
            const blob = new Blob([JSON.stringify(out.contentJson, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "content.json";
            a.click();
            URL.revokeObjectURL(a.href);
        }

        if (out.dataFileJson) {
            const blob2 = new Blob([JSON.stringify(out.dataFileJson, null, 2)], { type: "application/json" });
            const a2 = document.createElement("a");
            a2.href = URL.createObjectURL(blob2);
            a2.download = out.splitPreview ? "events.json" : `${((val("ebLocation") || "Unknown").trim() || "Unknown")}.json`;
            a2.click();
            URL.revokeObjectURL(a2.href);
        }

        if (out.useI18n) {
            const blob3 = new Blob([JSON.stringify(out.i18nJson || {}, null, 2)], { type: "application/json" });
            const a3 = document.createElement("a");
            a3.href = URL.createObjectURL(blob3);
            a3.download = "default.json";
            a3.click();
            URL.revokeObjectURL(a3.href);
        }

        let msg = "content.json downloaded.";
        if (out.splitPreview && out.useI18n) msg = "content.json + events.json + i18n/default.json downloaded.";
        else if (out.splitPreview) msg = "content.json + events.json downloaded.";
        else if (out.mode === "load" && out.useI18n) msg = "content.json + <Location>.json + i18n/default.json downloaded.";
        else if (out.mode === "load") msg = "content.json + <Location>.json downloaded.";
        else if (out.useI18n) msg = "content.json + i18n/default.json downloaded.";

        toast("Downloaded", msg, "info");
    });

    function markCurrentStateAsSaved(id, name) {
        setCurrentSave(id || null, (name || "").trim(), structuredClone(getCurrentProgressSnapshot()));
    }
    elById("mfBtnCopy")?.addEventListener("click", async () => {
        try {
            const txt = getManifestText().trim() || DEFAULT_MANIFEST_TEXT;
            await navigator.clipboard.writeText(txt);
            toast("Copied", "manifest.json copied to clipboard.", "info");
        } catch {
            toast("Copy failed", "Clipboard permission blocked.", "error");
        }
    });

    elById("mfBtnDownload")?.addEventListener("click", () => {
        const txt = getManifestText().trim() || DEFAULT_MANIFEST_TEXT;
        const blob = new Blob([txt], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "manifest.json";
        a.click();
        URL.revokeObjectURL(a.href);
        toast("Downloaded", "manifest.json downloaded.", "info");
    });
}
export async function mount(_host, ctx) {
    ctxRef = ctx;

    if (ctxRef && ctxRef.api == null && ctx?.api) ctxRef.api = ctx.api;

    state.musicChoices = await fetchMusicChoices();
    state.soundChoices = await fetchSoundChoices();
    refreshDatalists();
    await populateEventHeaderMusicSelect();
    await refreshTempActorAssetsFromApi();


    updateStickyTop();
    const onResize = () => updateStickyTop();
    window.addEventListener("resize", onResize);

    setStatus("Not connected", "warn");
    setProgressPill("progress: —", "");

    initCommands({
        TEMPLATE_CMDS,
        COMMAND_NAMES,
        escapeHtml,
        numOr,
        boolOr,
        renderCmdRawHtml,
        actorNameOptions,
        getQuests: () => quests,
        getSpecialOrders: () => specialOrders,
        getLocations: () => locations,
        getTempActorAssetOptions
    });

    refreshDatalists();
    fillSelect($("ebLocation"), locations, "(select location)");
    updateLoadModeUi();
    UI.renderAll();

    ensureManifestDefault();
    {
        const uid = parseManifestUniqueId(getManifestText());
        if (uid) setManifestStatus(`UniqueID: ${uid}`, "ok");
        else setManifestStatus("UniqueID: (invalid JSON or missing UniqueID)", "warn");
    }

    wireUi();
    setSplitCpPreviewToggle(getSplitCpPreviewToggle());
    UI.markAddBars();
    UI.wireSectionToggles(COLLAPSE_KEY);

    try {
        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (raw) {
            applyProgress(JSON.parse(raw), { toast: false });
            setProgressPill("progress: autosave loaded", "ok");
        }
    } catch { }

    const onConnected = async (e) => {
        try {
            const api = e?.detail?.api;
            const meta = e?.detail?.meta;
            if (api) ctxRef.api = api;

            applyConnected(meta);
            await refreshListsFromApi();

            try {
                serverGroupPresetsCache = await loadGroupPresetsFromServer();
                if (!serverGroupPresetsCache) serverGroupPresetsCache = null;
            } catch {
                serverGroupPresetsCache = null;
            }

            state.musicChoices = await fetchMusicChoices();
            refreshDatalists();

            if (pendingLocation) $("ebLocation").value = pendingLocation;
            setStatus("Ready", "ok");
        } catch (err) {
            setStatus("Connected (lists failed)", "warn");
            toast("Lists failed", String(err?.message || err), "error");
        }
    };

    const onProjectCollect = (e) => {
        try {
            const detail = e?.detail;
            if (!detail) return;

            const doc = buildProjectEventDocument();
            setCurrentSave(doc.id || null, doc.name || "", doc.state || null);

            detail.handled = true;
            detail.result = {
                projectPatch: buildProjectManifestPatch(),
                eventDocument: doc
            };
        } catch (err) {
            console.warn("[EventBuilder] project collect failed", err);
        }
    };

    const onProjectLoaded = async (e) => {
        try {
            const project = e?.detail?.project || null;

            if (!project) {
                resetBuilderForProjectLoad({ keepManifest: false });
                return;
            }

            await applyProjectToEventBuilder(project);
        } catch (err) {
            console.warn("[EventBuilder] project load failed", err);
            toast("Project load failed", String(err?.message || err), "error");
        }
    };

    window.addEventListener("sla:connected", onConnected);
    window.addEventListener("sla:project:collect", onProjectCollect);
    window.addEventListener("sla:project:loaded", onProjectLoaded);

    await tryAutoConnectFromTool();

    return () => {
        try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshotProgress())); } catch { }

        window.removeEventListener("sla:connected", onConnected);
        window.removeEventListener("sla:project:collect", onProjectCollect);
        window.removeEventListener("sla:project:loaded", onProjectLoaded);
        window.removeEventListener("resize", onResize);

        ctxRef = null;
        metaRef = null;
    };
}