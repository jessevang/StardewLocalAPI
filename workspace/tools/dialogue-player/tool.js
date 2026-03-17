import { $, toast, setPill } from "../../shared/ui.js";
import { buildDialogueIndex } from "./dialogueIndex.js";

let ctxRef = null;

let state = {
    index: null,
    selectedCharacter: null,
    search: "",
};

function setStatus(text, kind) {
    setPill($("dpStatus"), text, kind || "warn");
}

function groupMap() {
    return state.index?.byCharacter || {};
}

function groupKeys() {
    return Object.keys(groupMap()).sort((a, b) => a.localeCompare(b));
}

function filteredDialogues(list) {
    const q = (state.search || "").trim().toLowerCase();
    if (!q) return list;

    return list.filter((d) => {
        const hay = [d.character, d.source, d.key, d.text].join(" ").toLowerCase();
        return hay.includes(q);
    });
}

function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function fetchDialogues() {
    const res = await ctxRef.api.get("/api/v1/dialogue/all");
    if (!res.ok) throw new Error(`dialogue fetch failed (${res.status})`);
    if (res.json?.ok === false) throw new Error(res.json?.error || "dialogue error");
    return res.json?.dialoguesByCharacter || {};
}

function renderGroups() {
    const groupsEl = $("dpGroups");
    groupsEl.innerHTML = "";

    const keys = groupKeys();
    $("dpGroupTitle").textContent = `Characters (${keys.length})`;

    for (const k of keys) {
        const list = groupMap()[k] || [];
        const count = filteredDialogues(list).length;

        if ((state.search || "").trim() && count === 0) continue;

        const row = document.createElement("button");
        row.type = "button";
        row.className = "list-row";
        row.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px;">
        <div>${escapeHtml(k)}</div>
        <div class="muted small">${count}</div>
      </div>
    `;
        row.classList.toggle("active", state.selectedCharacter === k);
        row.addEventListener("click", () => {
            state.selectedCharacter = k;
            renderGroups();
            renderList();
        });
        groupsEl.appendChild(row);
    }
}

function autoSelectFirstGroup() {
    if (state.selectedCharacter) return;

    const keys = groupKeys();
    if (!keys.length) return;

    const q = (state.search || "").trim();
    if (q) {
        for (const k of keys) {
            const count = filteredDialogues(groupMap()[k] || []).length;
            if (count > 0) {
                state.selectedCharacter = k;
                return;
            }
        }
    }

    state.selectedCharacter = keys[0];
}

function renderList() {
    const listEl = $("dpList");
    listEl.innerHTML = "";

    if (!state.selectedCharacter) {
        $("dpListTitle").textContent = "—";
        $("dpActionsTitle").textContent = "—";
        $("dpPlayAll").disabled = true;
        return;
    }

    const all = groupMap()[state.selectedCharacter] || [];
    const list = filteredDialogues(all);

    $("dpListTitle").textContent = `${state.selectedCharacter} (${list.length} dialogue lines)`;
    $("dpActionsTitle").textContent = state.selectedCharacter;

    $("dpPlayAll").disabled = list.length === 0;


    $("dpPlayAll").onclick = async () => {
        await playAll(state.selectedCharacter, list);
    };

    for (const d of list) {
        const row = document.createElement("div");
        row.className = "list-card";

        const raw = (d.text || "").trim() || "—";
        const rawPreview = raw.length > 260 ? raw.slice(0, 260) + "…" : raw;

        row.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
        <div style="min-width:0;">
          <div style="font-weight:600;">
            ${escapeHtml(d.key || "—")}
            <span class="muted small">(${escapeHtml(d.source || "—")})</span>
          </div>
          <div class="muted small" style="margin-top:6px; word-break:break-word;">
            <div><b>Character:</b> ${escapeHtml(d.character || "—")}</div>
            <div><b>Source:</b> ${escapeHtml(d.source || "—")}</div>
            <div><b>Raw:</b> ${escapeHtml(rawPreview)}</div>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <button class="btn primary" type="button" data-play="1">Play</button>
        </div>
      </div>
    `;

        row.querySelector('[data-play="1"]').addEventListener("click", async () => {
            await playOne(d);
        });

        listEl.appendChild(row);
    }
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

async function playOne(d) {

    toast("Dialogue", `Clicked Play: ${d.character} (${d.key})`, "info");

    try {
        const r = await postJson("/api/v1/dialogue/play", {
            character: d.character,
            source: d.source,
            key: d.key,
            text: d.text,
        });

        if (!r.ok) {
            toast(
                "Play failed",
                `status ${r.res.status}${r.msg ? ` • ${r.msg}` : ""}`,
                "error"
            );
            return;
        }

        toast("Dialogue", `Playing: ${d.character} (${d.key})`, "info");
    } catch (err) {
        toast("Play error", String(err?.message || err), "error");
    }
}

async function playAll(character, list) {
    toast("Dialogue", `Clicked Play All: ${character} (${list.length} lines)`, "info");

    try {
        const r = await postJson("/api/v1/dialogue/playAll", {
            character,
            items: list.map((d) => ({
                source: d.source,
                key: d.key,
                text: d.text,
            })),
        });

        if (!r.ok) {
            toast(
                "Play All failed",
                `status ${r.res.status}${r.msg ? ` • ${r.msg}` : ""}`,
                "error"
            );
            return;
        }

        toast("Dialogue", `Queued ${list.length} lines for ${character}`, "info");
    } catch (err) {
        toast("Play All error", String(err?.message || err), "error");
    }
}

async function stopAll() {
    toast("Dialogue", "Clicked Stop", "info");

    try {
        const r = await postJson("/api/v1/dialogue/stop", {});
        if (!r.ok) {
            toast("Stop failed", `status ${r.res.status}${r.msg ? ` • ${r.msg}` : ""}`, "error");
            return;
        }
        toast("Dialogue", "Stopped playback", "info");
    } catch (err) {
        toast("Stop error", String(err?.message || err), "error");
    }
}

export async function mount(root, ctx) {
    ctxRef = ctx;

    setStatus("Loading…", "warn");

    $("dpRefresh").addEventListener("click", async () => await refresh());
    $("dpStop").addEventListener("click", async () => await stopAll());

    $("dpSearch").addEventListener("input", () => {
        state.search = $("dpSearch").value || "";
        state.selectedCharacter = null;
        renderGroups();
        autoSelectFirstGroup();
        renderList();
    });

    await refresh();

    const onConnected = async () => {
        await refresh();
    };
    window.addEventListener("sla:connected", onConnected);

    return () => {
        window.removeEventListener("sla:connected", onConnected);
        ctxRef = null;
    };
}

async function refresh() {
    try {
        setStatus("Loading…", "warn");

        const dialoguesByCharacter = await fetchDialogues();

        state.index = buildDialogueIndex(dialoguesByCharacter);
        state.selectedCharacter = null;

        renderGroups();
        autoSelectFirstGroup();
        renderList();

        setStatus("Ready", "ok");
    } catch (e) {
        setStatus("Error", "bad");
        toast("Dialogue Player", String(e?.message || e), "error");
    }
}