import { $, toast, setPill } from "../../shared/ui.js";
import { buildMusicIndex } from "./musicIndex.js";

let ctxRef = null;

let state = {
    index: null,
    view: "music",
    search: "",
    selected: null,
};

function setStatus(text, kind) {
    setPill($("mpStatus"), text, kind || "warn");
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
    const res = await ctxRef.api.get("/api/v1/music/all");
    if (!res.ok) throw new Error(`music fetch failed (${res.status})`);
    if (res.json?.ok === false) throw new Error(res.json?.error || "music error");
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

function applyViewToggles() {
    $("mpPlaySelected").style.display = state.view === "music" ? "" : "none";
    $("mpPlaySelected").disabled = !(state.view === "music" && state.selected);
}

function groupTitle() {
    if (state.view === "music") return "Music IDs";
    if (state.view === "events") return "Event Locations";
    return "Locations";
}

function listTitle() {
    if (!state.selected) return "—";
    return state.selected;
}

function actionsTitle() {
    if (!state.selected) return "—";
    return state.selected;
}

function filteredMusicIds() {
    const q = (state.search || "").trim().toLowerCase();
    const ids = Object.keys(state.index?.byMusicId || {});
    if (!q) return ids.sort((a, b) => a.localeCompare(b));

    return ids
        .filter((id) => {
            const entry = (state.index.byMusicId[id] || [])[0] || {};
            const hay = [
                id,
                String(entry.usedInEventsCount || 0),
                String(entry.usedInLocationsCount || 0),
                ...(entry.usedInEvents || []).map((x) => `${x.location} ${x.eventKey}`),
                ...(entry.usedInLocations || []).map((x) => `${x.location} ${x.context}`),
            ]
                .join(" ")
                .toLowerCase();
            return hay.includes(q);
        })
        .sort((a, b) => a.localeCompare(b));
}

function filteredEventLocations() {
    const q = (state.search || "").trim().toLowerCase();
    const keys = Object.keys(state.index?.byEventLocation || {}).sort((a, b) =>
        a.localeCompare(b)
    );

    if (!q) return keys;

    return keys.filter((loc) => {
        const rows = state.index.byEventLocation[loc] || [];
        const hay = [
            loc,
            ...rows.map(
                (r) => `${r.eventKey} ${r.preconditionsRaw} ${(r.musicCues || []).join(" ")}`
            ),
        ]
            .join(" ")
            .toLowerCase();
        return hay.includes(q);
    });
}

function filteredLocations() {
    const q = (state.search || "").trim().toLowerCase();
    const keys = Object.keys(state.index?.byLocation || {}).sort((a, b) =>
        a.localeCompare(b)
    );
    if (!q) return keys;

    return keys.filter((loc) => {
        const rows = state.index.byLocation[loc] || [];
        const hay = [loc, ...rows.map((r) => `${r.context} ${r.musicId} ${r.note}`)]
            .join(" ")
            .toLowerCase();
        return hay.includes(q);
    });
}

function autoSelectFirst() {
    if (state.selected) return;

    if (state.view === "music") {
        const ids = filteredMusicIds();
        state.selected = ids[0] || null;
        return;
    }
    if (state.view === "events") {
        const locs = filteredEventLocations();
        state.selected = locs[0] || null;
        return;
    }

    const locs = filteredLocations();
    state.selected = locs[0] || null;
}

function renderGroups() {
    const groupsEl = $("mpGroups");
    groupsEl.innerHTML = "";

    $("mpGroupTitle").textContent = `${groupTitle()}`;

    if (!state.index) return;

    if (state.view === "music") {
        const ids = filteredMusicIds();
        $("mpGroupTitle").textContent = `Music IDs (${ids.length})`;

        for (const id of ids) {
            const entry = (state.index.byMusicId[id] || [])[0] || {};
            const evCount = entry.usedInEventsCount || 0;
            const locCount = entry.usedInLocationsCount || 0;
            const playing = !!entry.isPlayingNow;

            const row = document.createElement("button");
            row.type = "button";
            row.className = "list-row";
            row.classList.toggle("active", state.selected === id);
            row.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <div style="min-width:0;">
            <div style="display:flex; gap:8px; align-items:center;">
              <div>${escapeHtml(id)}</div>
              ${playing ? `<span class="pill ok">Now</span>` : ``}
            </div>
            <div class="muted small">Events: ${evCount} • Locations: ${locCount}</div>
          </div>
          <div class="muted small">▶</div>
        </div>
      `;

            row.addEventListener("click", async () => {
                state.selected = id;
                renderGroups();
                renderList();
                await playMusic(id);
            });

            groupsEl.appendChild(row);
        }

        return;
    }

    if (state.view === "events") {
        const locs = filteredEventLocations();
        $("mpGroupTitle").textContent = `Event Locations (${locs.length})`;

        for (const loc of locs) {
            const rows = state.index.byEventLocation[loc] || [];
            const row = document.createElement("button");
            row.type = "button";
            row.className = "list-row";
            row.classList.toggle("active", state.selected === loc);
            row.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <div>${escapeHtml(loc)}</div>
          <div class="muted small">${rows.length}</div>
        </div>
      `;
            row.addEventListener("click", () => {
                state.selected = loc;
                renderGroups();
                renderList();
            });
            groupsEl.appendChild(row);
        }
        return;
    }


    const locs = filteredLocations();
    $("mpGroupTitle").textContent = `Locations (${locs.length})`;

    for (const loc of locs) {
        const rows = state.index.byLocation[loc] || [];
        const row = document.createElement("button");
        row.type = "button";
        row.className = "list-row";
        row.classList.toggle("active", state.selected === loc);
        row.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px;">
        <div>${escapeHtml(loc)}</div>
        <div class="muted small">${rows.length}</div>
      </div>
    `;
        row.addEventListener("click", () => {
            state.selected = loc;
            renderGroups();
            renderList();
        });
        groupsEl.appendChild(row);
    }
}

function renderList() {
    const listEl = $("mpList");
    listEl.innerHTML = "";

    $("mpListTitle").textContent = listTitle();
    $("mpActionsTitle").textContent = actionsTitle();

    if (!state.selected || !state.index) {
        $("mpPlaySelected").disabled = true;
        return;
    }

    if (state.view === "music") {
        const id = state.selected;
        $("mpPlaySelected").disabled = false;
        $("mpPlaySelected").onclick = async () => await playMusic(id);

        const entry = (state.index.byMusicId[id] || [])[0] || {};
        const usedInEvents = Array.isArray(entry.usedInEvents) ? entry.usedInEvents : [];
        const usedInLocations = Array.isArray(entry.usedInLocations) ? entry.usedInLocations : [];

        const header = document.createElement("div");
        header.className = "list-card";
        header.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
        <div style="min-width:0;">
          <div style="font-weight:700;">${escapeHtml(id)}</div>
          <div class="muted small" style="margin-top:6px;">
            Events: ${usedInEvents.length} • Locations: ${usedInLocations.length}
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <button class="btn primary" type="button" data-play="1">Play</button>
        </div>
      </div>
    `;
        header
            .querySelector('[data-play="1"]')
            .addEventListener("click", async () => await playMusic(id));
        listEl.appendChild(header);

        if (usedInEvents.length) {
            const card = document.createElement("div");
            card.className = "list-card";
            card.innerHTML = `
        <div style="font-weight:700; margin-bottom:6px;">Used in events</div>
        <div class="muted small" style="display:flex; flex-direction:column; gap:6px;">
          ${usedInEvents
                    .map((r) => {
                        const heart = r.isHeartEvent ? ` • ❤️ ${r.heartLevel ?? "?"}` : "";
                        return `<div><b>${escapeHtml(r.location)}</b> — ${escapeHtml(
                            r.eventKey
                        )}${heart}</div>`;
                    })
                    .join("")}
        </div>
      `;
            listEl.appendChild(card);
        }

        if (usedInLocations.length) {
            const card = document.createElement("div");
            card.className = "list-card";
            card.innerHTML = `
        <div style="font-weight:700; margin-bottom:6px;">Used in locations (best-effort)</div>
        <div class="muted small" style="display:flex; flex-direction:column; gap:6px;">
          ${usedInLocations
                    .map((r) => {
                        return `<div><b>${escapeHtml(r.location)}</b> — ${escapeHtml(
                            r.context
                        )} ${r.note
                                ? ` <span class="muted">(${escapeHtml(r.note)})</span>`
                                : ""
                            }</div>`;
                    })
                    .join("")}
        </div>
      `;
            listEl.appendChild(card);
        }

        if (!usedInEvents.length && !usedInLocations.length) {
            const card = document.createElement("div");
            card.className = "list-card";
            card.innerHTML = `<div class="muted">No usage info found yet.</div>`;
            listEl.appendChild(card);
        }

        return;
    }

    if (state.view === "events") {
        $("mpPlaySelected").disabled = true;

        const loc = state.selected;
        const rows = state.index.byEventLocation[loc] || [];

        $("mpListTitle").textContent = `${loc} (${rows.length} events)`;

        for (const r of rows) {
            const cues = r.musicCues || [];
            const heart = r.isHeartEvent ? `❤️ ${r.heartLevel ?? "?"}` : "";
            const pre = (r.preconditionsRaw || "").trim();

            const card = document.createElement("div");
            card.className = "list-card";
            card.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
          <div style="min-width:0;">
            <div style="font-weight:700;">
              ${escapeHtml(r.eventKey || "—")}
              ${heart ? `<span class="pill warn" style="margin-left:8px;">${escapeHtml(heart)}</span>` : ""}
            </div>
            <div class="muted small" style="margin-top:6px; word-break:break-word;">
              <div><b>Conditions:</b> ${pre ? escapeHtml(pre) : "—"}</div>
              <div><b>Music:</b> ${escapeHtml(cues.join(", ") || "—")}</div>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${cues
                    .map((id) => `<button class="btn primary" type="button" data-play="${escapeHtml(id)}">Play</button>`)
                    .join("")}
          </div>
        </div>
      `;

            for (const btn of card.querySelectorAll("[data-play]")) {
                btn.addEventListener("click", async (e) => {
                    const id = e.currentTarget.getAttribute("data-play");
                    if (id) await playMusic(id);
                });
            }

            listEl.appendChild(card);
        }

        if (!rows.length) {
            const card = document.createElement("div");
            card.className = "list-card";
            card.innerHTML = `<div class="muted">No events found.</div>`;
            listEl.appendChild(card);
        }

        return;
    }

    $("mpPlaySelected").disabled = true;

    const loc = state.selected;
    const rows = state.index.byLocation[loc] || [];

    $("mpListTitle").textContent = `${loc} (${rows.length} rows)`;

    for (const r of rows) {
        const id = (r.musicId || "").trim();

        const card = document.createElement("div");
        card.className = "list-card";
        card.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
        <div style="min-width:0;">
          <div style="font-weight:700;">${escapeHtml(r.context || "—")}</div>
          <div class="muted small" style="margin-top:6px;">
            <div><b>Music:</b> ${escapeHtml(id || "—")}</div>
            ${r.note ? `<div><b>Note:</b> ${escapeHtml(r.note)}</div>` : ""}
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <button class="btn primary" type="button" ${id ? "" : "disabled"} data-play="1">Play</button>
        </div>
      </div>
    `;
        card.querySelector('[data-play="1"]').addEventListener("click", async () => {
            if (id) await playMusic(id);
        });

        listEl.appendChild(card);
    }

    if (!rows.length) {
        const card = document.createElement("div");
        card.className = "list-card";
        card.innerHTML = `<div class="muted">No location rows found.</div>`;
        listEl.appendChild(card);
    }
}

async function playMusic(id) {
    toast("Music", `Play: ${id}`, "info");
    const r = await postJson("/api/v1/music/play", { id });
    if (!r.ok) toast("Play failed", `status ${r.res.status}${r.msg ? ` • ${r.msg}` : ""}`, "error");
}

async function stopMusic() {
    toast("Music", "Stop", "info");
    const r = await postJson("/api/v1/music/stop", {});
    if (!r.ok) toast("Stop failed", `status ${r.res.status}${r.msg ? ` • ${r.msg}` : ""}`, "error");
}

async function resumeMusic() {
    toast("Music", "Resume", "info");
    const r = await postJson("/api/v1/music/resume", {});
    if (!r.ok) toast("Resume failed", `status ${r.res.status}${r.msg ? ` • ${r.msg}` : ""}`, "error");
}

function renderAll() {
    applyViewToggles();
    autoSelectFirst();
    renderGroups();
    renderList();
}

async function refresh() {
    try {
        setStatus("Loading…", "warn");

        const json = await fetchAll();
        state.index = buildMusicIndex(json);
        state.selected = null;

        renderAll();

        setStatus("Ready", "ok");
    } catch (e) {
        setStatus("Error", "bad");
        toast("Music Player", String(e?.message || e), "error");
    }
}

export async function mount(root, ctx) {
    ctxRef = ctx;

    setStatus("Loading…", "warn");

    $("mpRefresh").addEventListener("click", async () => await refresh());
    $("mpStop").addEventListener("click", async () => await stopMusic());
    $("mpResume").addEventListener("click", async () => await resumeMusic());

    $("mpSearch").addEventListener("input", () => {
        state.search = $("mpSearch").value || "";
        state.selected = null;
        renderAll();
    });

    $("mpView").addEventListener("change", () => {
        state.view = $("mpView").value || "music";
        state.selected = null;
        renderAll();
    });

    await refresh();

    const onConnected = async () => await refresh();
    window.addEventListener("sla:connected", onConnected);

    return () => {
        window.removeEventListener("sla:connected", onConnected);
        ctxRef = null;
    };
}