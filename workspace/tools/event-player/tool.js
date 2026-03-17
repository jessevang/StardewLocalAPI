import { $, toast, setPill } from "../../shared/ui.js";

let buildIndex = null;

let state = {
    mode: "character", // "location" | "character"
    index: null,
    selectedGroup: null,
    search: "",
};

function setMode(mode) {
    state.mode = mode;
    $("epModeLoc").classList.toggle("primary", mode === "location");
    $("epModeChar").classList.toggle("primary", mode === "character");
    renderGroups();
    autoSelectFirstGroup();
    renderList();
}

function setStatus(text, kind) {
    setPill($("epStatus"), text, kind || "warn");
}

function groupMap() {
    return state.mode === "character"
        ? (state.index?.byCharacter || {})
        : (state.index?.byLocation || {});
}

function groupKeys() {
    return Object.keys(groupMap()).sort((a, b) => a.localeCompare(b));
}

function filteredEvents(list) {
    const q = (state.search || "").trim().toLowerCase();
    if (!q) return list;

    return list.filter((e) => {
        const hay = [
            e.location,
            e.eventId,
            e.eventKey,
            e.conditionsRaw,
            e.heartLabel,
            ...(e.participants || []),
            ...(e.speakers || []),
        ]
            .join(" ")
            .toLowerCase();

        return hay.includes(q);
    });
}

function renderGroups() {
    const groupsEl = $("epGroups");
    groupsEl.innerHTML = "";

    const keys = groupKeys();
    $("epGroupTitle").textContent =
        state.mode === "character"
            ? `Characters (${keys.length})`
            : `Locations (${keys.length})`;

    for (const k of keys) {
        const list = groupMap()[k] || [];
        const count = filteredEvents(list).length;

        if ((state.search || "").trim() && count === 0) continue;

        const row = document.createElement("button");
        row.type = "button";
        row.className = "list-row";
        row.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px;">
        <div>${k}</div>
        <div class="muted small">${count}</div>
      </div>
    `;
        row.classList.toggle("active", state.selectedGroup === k);
        row.addEventListener("click", () => {
            state.selectedGroup = k;
            renderGroups();
            renderList();
        });
        groupsEl.appendChild(row);
    }
}

function heartSummary(e) {
    const hs = (e.conditions?.hearts || []).slice(0, 2);
    if (!hs.length) return "";
    return hs.map((x) => `${x.name} ${x.points}`).join(", ");
}

function sortListForUi(list) {
    return [...list].sort((a, b) => {
        const ah = a.heartMax > 0 ? a.heartMax : 999999;
        const bh = b.heartMax > 0 ? b.heartMax : 999999;

        return (
            ah - bh ||
            (a.eventId || "").localeCompare(b.eventId || "")
        );
    });
}

function renderList() {
    const listEl = $("epList");
    listEl.innerHTML = "";

    if (!state.selectedGroup) {
        $("epListTitle").textContent = "—";
        return;
    }

    const all = groupMap()[state.selectedGroup] || [];
    const list = sortListForUi(filteredEvents(all));

    $("epListTitle").textContent = `${state.selectedGroup} (${list.length} events)`;

    for (const e of list) {
        const row = document.createElement("div");
        row.className = "list-card";

        const condPretty = (e.conditionsPretty || "").trim();
        const condHtml = condPretty
            ? condPretty.replaceAll("\n", "<br>")
            : (e.conditionsRaw || "—");

        const topRight = e.heartLabel
            ? `<div class="small" style="font-weight:800;">${e.heartLabel}</div>`
            : `<div class="small muted">&nbsp;</div>`;

        row.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
        <div style="min-width:0; flex:1;">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:baseline;">
            <div style="font-weight:600; min-width:0;">
              ${e.eventId} <span class="muted small">(${e.location})</span>
            </div>
            <div style="white-space:nowrap; text-align:right;">
              ${topRight}
            </div>
          </div>

          <div class="muted small" style="margin-top:6px; word-break:break-word;">
            <div><b>Conditions:</b> ${condHtml}</div>
            ${e.conditionsRaw ? `<div><b>Hint:</b> ${heartSummary(e) || "—"}</div>` : ""}
            <div><b>Characters:</b> ${(e.participants || []).join(", ") || "—"}</div>
            ${state.mode === "character" ? `<div><b>Speakers:</b> ${(e.speakers || []).join(", ") || "—"}</div>` : ""}
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:8px;">
          <button class="btn primary" type="button" data-run="1">Run</button>
        </div>
      </div>
    `;

        row.querySelector('[data-run="1"]').addEventListener("click", async () => {
            await runEvent(e);
        });

        listEl.appendChild(row);
    }
}

function autoSelectFirstGroup() {
    if (state.selectedGroup) return;

    const keys = groupKeys();
    if (!keys.length) return;

    const q = (state.search || "").trim();
    if (q) {
        for (const k of keys) {
            const count = filteredEvents(groupMap()[k] || []).length;
            if (count > 0) {
                state.selectedGroup = k;
                return;
            }
        }
    }

    state.selectedGroup = keys[0];
}

async function fetchEvents(ctx) {
    const evRes = await ctx.api.get("/api/v1/events/all");
    if (!evRes.ok) throw new Error(`events fetch failed (${evRes.status})`);
    if (evRes.json?.ok === false) throw new Error(evRes.json?.error || "events error");

    const eventsByLocation = evRes.json?.eventsByLocation || {};

    const chRes = await ctx.api.get("/api/v1/world/npcs");
    if (!chRes.ok) throw new Error(`npc fetch failed (${chRes.status})`);
    if (chRes.json?.ok === false) throw new Error(chRes.json?.error || "npc fetch error");

    const characterNames = (chRes.json?.npcs || [])
        .map((n) => n?.Name)
        .filter(Boolean);

    return { eventsByLocation, characterNames };
}

async function runEvent(e) {
    try {
        const res = await window.__ep_ctx.api.post("/api/v1/events/start", {
            location: e.location,
            eventId: e.eventKey,
        });

        if (!res.ok || res.json?.ok === false) {
            toast("Run failed", `status ${res.status}`, "error");
            return;
        }

        toast("Event started", `${e.location}: ${e.eventId}`, "info");
    } catch (err) {
        toast("Run error", String(err?.message || err), "error");
    }
}

async function endEvent() {
    try {
        const res = await window.__ep_ctx.api.post("/api/v1/events/end", {});
        if (!res.ok || res.json?.ok === false) {
            toast("End failed", `status ${res.status}`, "error");
            return;
        }
        toast("Event ended", "Current event was ended.", "info");
    } catch (err) {
        toast("End error", String(err?.message || err), "error");
    }
}

export async function mount(root, ctx) {
    window.__ep_ctx = ctx;

    const idxUrl = new URL("./eventIndex.js", import.meta.url);
    idxUrl.searchParams.set("v", String(Date.now()));
    const idxMod = await import(idxUrl.toString());
    buildIndex = idxMod.buildIndex;

    setStatus("Loading…", "warn");

    $("epEnd").addEventListener("click", async () => await endEvent());
    $("epModeLoc").addEventListener("click", () => setMode("location"));
    $("epModeChar").addEventListener("click", () => setMode("character"));
    $("epRefresh").addEventListener("click", async () => await refresh(ctx));

    $("epSearch").addEventListener("input", () => {
        state.search = $("epSearch").value || "";
        state.selectedGroup = null;
        renderGroups();
        autoSelectFirstGroup();
        renderList();
    });

    await refresh(ctx);
    setMode("character");

    const onConnected = async () => {
        await refresh(ctx);
    };
    window.addEventListener("sla:connected", onConnected);

    return () => {
        window.removeEventListener("sla:connected", onConnected);
        delete window.__ep_ctx;
    };
}

async function refresh(ctx) {
    try {
        setStatus("Loading…", "warn");
        const { eventsByLocation, characterNames } = await fetchEvents(ctx);

        if (!buildIndex) throw new Error("eventIndex module not loaded");

        state.index = buildIndex(eventsByLocation, characterNames);
        state.selectedGroup = null;

        renderGroups();
        autoSelectFirstGroup();
        renderList();

        setStatus("Ready", "ok");
    } catch (e) {
        setStatus("Error", "bad");
        toast("Event Player", String(e?.message || e), "error");
    }
}