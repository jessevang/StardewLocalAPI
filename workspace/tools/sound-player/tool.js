import { $, toast, setPill } from "../../shared/ui.js";
import { buildSoundIndex } from "./soundIndex.js";

let ctxRef = null;

let state = {
    index: null,
    search: "",
    selected: null,
};

function setStatus(text, kind) {
    setPill($("spStatus"), text, kind || "warn");
}

function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function fetchAll() {
    const res = await ctxRef.api.get("/api/v1/audio/cues/sfx");
    if (!res.ok) throw new Error(`sfx fetch failed (${res.status})`);
    if (res.json?.ok === false) throw new Error(res.json?.error || "sfx error");
    return res.json;
}

async function postJson(path, body) {
    const res = await ctxRef.api.post(path, body);

    if (res.ok && res.json?.ok !== false) return { ok: true, res };

    const msg =
        res?.json?.error ||
        res?.json?.message ||
        (typeof res?.text === "string" ? res.text : "") ||
        "";

    return { ok: false, res, msg };
}

function filteredIds() {
    const idx = state.index;
    if (!idx) return [];

    const q = (state.search || "").trim().toLowerCase();
    if (!q) return idx.ids;

    return idx.ids.filter((id) => {
        const c = idx.byId[id] || {};
        const hay = [
            id,
            c.kind,
            c.categoryName,
            String(c.categoryIndex ?? ""),
            String(c.looped ?? ""),
            String(c.useReverb ?? ""),
            c.audioChangesCategory,
        ].join(" ").toLowerCase();

        return hay.includes(q);
    });
}

function autoSelectFirst() {
    if (state.selected) return;
    const ids = filteredIds();
    state.selected = ids[0] || null;
}

function renderGroups() {
    const groupsEl = $("spGroups");
    groupsEl.innerHTML = "";

    if (!state.index) {
        $("spGroupTitle").textContent = "SFX IDs";
        return;
    }

    const ids = filteredIds();
    $("spGroupTitle").textContent = `SFX IDs (${ids.length})`;

    for (const id of ids) {
        const cue = state.index.byId[id] || {};
        const looped = cue.looped === true || cue.audioChangesLooped === true;

        const row = document.createElement("button");
        row.type = "button";
        row.className = "list-row";
        row.classList.toggle("active", state.selected === id);

        row.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px;">
        <div style="min-width:0;">
          <div style="display:flex; gap:8px; align-items:center;">
            <div>${escapeHtml(id)}</div>
            ${looped ? `<span class="pill warn">Loop</span>` : ``}
          </div>
          <div class="muted small">
            ${escapeHtml(cue.categoryName || cue.kind || "Sfx")}
          </div>
        </div>
        <div class="muted small">▶</div>
      </div>
    `;

        row.addEventListener("click", async () => {
            state.selected = id;
            renderGroups();
            renderList();

            await playSfx(id);
        });

        groupsEl.appendChild(row);
    }
}

function renderList() {
    const listEl = $("spList");
    listEl.innerHTML = "";

    const id = state.selected;
    $("spListTitle").textContent = id || "—";
    $("spActionsTitle").textContent = id || "—";
    $("spPlaySelected").disabled = !id;

    if (!id || !state.index) return;

    const cue = state.index.byId[id] || {};
    const looped = cue.looped === true || cue.audioChangesLooped === true;

    const card = document.createElement("div");
    card.className = "list-card";
    card.innerHTML = `
    <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
      <div style="min-width:0;">
        <div style="font-weight:800; display:flex; gap:8px; align-items:center;">
          <div>${escapeHtml(id)}</div>
          ${looped ? `<span class="pill warn">Loop</span>` : ``}
        </div>

        <div class="muted small" style="margin-top:8px;">
          <div><b>Kind:</b> ${escapeHtml(cue.kind || "Sfx")}</div>
          <div><b>Category:</b> ${escapeHtml(cue.categoryName || "—")} ${cue.categoryIndex != null ? `(idx ${escapeHtml(cue.categoryIndex)})` : ""}</div>
          <div><b>AudioChanges:</b> ${cue.fromAudioChanges ? escapeHtml(cue.audioChangesCategory || "yes") : "—"}</div>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn primary" type="button" data-play="1">Play</button>
      </div>
    </div>
  `;
    card.querySelector('[data-play="1"]').addEventListener("click", async () => await playSfx(id));
    listEl.appendChild(card);

    $("spPlaySelected").onclick = async () => await playSfx(id);
}

async function playSfx(id) {
    toast("Sound", `Play: ${id}`, "info");
    const r = await postJson("/api/v1/sfx/play", { id });
    if (!r.ok) toast("Play failed", `status ${r.res.status}${r.msg ? ` • ${r.msg}` : ""}`, "error");
}

async function stopSfx() {
    toast("Sound", "Stop", "info");
    const r = await postJson("/api/v1/sfx/stop", {});
    if (!r.ok) toast("Stop failed", `status ${r.res.status}${r.msg ? ` • ${r.msg}` : ""}`, "error");
}

async function resumeSfx() {
    toast("Sound", "Resume", "info");
    const r = await postJson("/api/v1/sfx/resume", {});
    if (!r.ok) toast("Resume failed", `status ${r.res.status}${r.msg ? ` • ${r.msg}` : ""}`, "error");
}

function renderAll() {
    autoSelectFirst();
    renderGroups();
    renderList();
}

async function refresh() {
    try {
        setStatus("Loading…", "warn");

        const json = await fetchAll();
        state.index = buildSoundIndex(json);
        state.selected = null;

        renderAll();
        setStatus("Ready", "ok");
    } catch (e) {
        setStatus("Error", "bad");
        toast("Sound Player", String(e?.message || e), "error");
    }
}

export async function mount(root, ctx) {
    ctxRef = ctx;

    setStatus("Loading…", "warn");

    $("spRefresh").addEventListener("click", async () => await refresh());
    $("spStop").addEventListener("click", async () => await stopSfx());
    $("spResume").addEventListener("click", async () => await resumeSfx());

    $("spSearch").addEventListener("input", () => {
        state.search = $("spSearch").value || "";
        state.selected = null;
        renderAll();
    });

    $("spPlaySelected").addEventListener("click", async () => {
        if (state.selected) await playSfx(state.selected);
    });

    await refresh();

    const onConnected = async () => await refresh();
    window.addEventListener("sla:connected", onConnected);

    return () => {
        window.removeEventListener("sla:connected", onConnected);
        ctxRef = null;
    };
}