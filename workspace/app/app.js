import { toast } from "../shared/ui.js";
import { loadJson, saveJson } from "../shared/store.js";
import { ApiClient } from "../shared/apiClient.js";
const TOOLS = [
    { id: "home", name: "Home", emoji: "🏠", folder: "home", requiresProject: false },
    { id: "event-builder", name: "Event Builder", emoji: "🧩", folder: "event-builder", requiresProject: true },
    { id: "export-mod", name: "Export Mod", emoji: "📦", folder: "export-mod", requiresProject: true },
    { id: "event-player", name: "Event Player", emoji: "▶️", folder: "event-player", requiresProject: false },
    { id: "dialogue-player", name: "Dialogue Player", emoji: "🗣️", folder: "dialogue-player", requiresProject: false },
    { id: "music-player", name: "Music Player", emoji: "🎵", folder: "music-player", requiresProject: false },
    { id: "sound-player", name: "Sound Player", emoji: "🔊", folder: "sound-player", requiresProject: false },
];

const api = new ApiClient();
let currentTool = null; // { id, unmount? }

const PROJECT_STORAGE_KEY = "sla_current_project_meta";

const appState = {
    project: null, // full loaded project object
};

function $(id) { return document.getElementById(id); }

function parseUrlConfig() {
    const params = new URLSearchParams(location.search);
    const baseUrl = (params.get("baseUrl") || "").trim();
    const token = (params.get("token") || "").trim();
    const autoconnect = (params.get("autoconnect") || "1").trim();
    return { baseUrl, token, autoconnect };
}

function loadSavedConfig() {
    const cfg = loadJson("conn", {});
    return {
        baseUrl: (cfg.baseUrl || "").trim(),
        token: (cfg.token || "").trim(),
    };
}

function saveConnConfig(baseUrl, token) {
    saveJson("conn", { baseUrl, token });
}

function defaultBaseUrl() {
    return location.origin === "null" ? "http://127.0.0.1:5700" : location.origin;
}

function toolFromHash() {
    const raw = (location.hash || "").replace(/^#\/?/, "");
    const id = raw || "home";
    return TOOLS.find(t => t.id === id) ? id : "home";
}

function setFooter(left, right) {
    const leftEl = $("footerLeft");
    const rightEl = $("footerRight");
    if (leftEl) leftEl.textContent = "";
    if (rightEl) rightEl.textContent = "";
}

function formatTs(ts) {
    if (!ts) return "";
    try {
        return new Date(ts).toLocaleString();
    } catch {
        return String(ts);
    }
}

function saveCurrentProjectMeta() {
    const p = appState.project;
    if (!p?.id) {
        saveJson(PROJECT_STORAGE_KEY, null);
        return;
    }

    saveJson(PROJECT_STORAGE_KEY, {
        id: p.id,
        name: p.name || "",
        ts: p.ts || 0,
    });
}

function loadCurrentProjectMeta() {
    return loadJson(PROJECT_STORAGE_KEY, null);
}

function updateProjectSidebar() {
    const p = appState.project;
    const nameEl = $("projectName");
    const metaEl = $("projectMeta");
    const saveBtn = $("btnProjectSave");

    if (!nameEl || !metaEl || !saveBtn) return;

    if (!p) {
        nameEl.textContent = "No project loaded";
        metaEl.textContent = "Create a project or load an existing one.";
        saveBtn.disabled = true;
        return;
    }

    const eventCount = p?.documents?.events?.length || 0;
    nameEl.textContent = p.name || "Untitled Project";
    metaEl.textContent = `ID: ${p.id || "—"} • Events: ${eventCount} • Updated: ${formatTs(p.ts)}`;
    saveBtn.disabled = false;
}

async function connectSilently() {
    try {
        const res = await api.get("/api/v1/meta");
        if (!res.ok || !res.json || res.json.ok === false) {
            //setFooter(`base: ${api.baseUrl || "—"}`, `connect failed (${res.status})`);
            toast("Not connected", "Meta check failed. Check baseUrl/token in URL params or saved config.", "warn");
            return false;
        }

        const ver = res.json.version || res.json.gameVersion || "—";
        //setFooter(`base: ${api.baseUrl}`, `meta: ${ver}`);
        toast("Connected", "DevServer meta OK.", "info");

        window.dispatchEvent(new CustomEvent("sla:connected", { detail: { api, meta: res.json } }));
        return true;
    } catch (e) {
        //setFooter(`base: ${api.baseUrl || "—"}`, "connect error");
        toast("Connect error", String(e?.message || e), "error");
        return false;
    }
}

function renderNav() {
    const nav = $("nav");
    nav.innerHTML = "";

    const hasProject = !!appState.project;

    for (const t of TOOLS) {
        const requiresProject = !!t.requiresProject;
        const disabled = requiresProject && !hasProject;

        const a = document.createElement("a");
        a.href = disabled ? "#" : `#/${t.id}`;
        a.className = "nav-link" + (disabled ? " disabled" : "");
        a.setAttribute("data-tool-id", t.id);

        if (disabled) {
            a.setAttribute("aria-disabled", "true");
            a.setAttribute("title", "Create or load a project first");
        }

        a.innerHTML = `<span class="nav-emoji">${t.emoji}</span><span>${t.name}</span>`;

        if (disabled) {
            a.addEventListener("click", (e) => {
                e.preventDefault();
                toast("Project required", "Create or load a project first.", "warn");
            });
        }

        nav.appendChild(a);
    }
}

function updateNavActive(toolId) {
    document.querySelectorAll(".nav-link").forEach(a => {
        const href = a.getAttribute("href") || "";
        const id = href.replace(/^#\//, "");
        a.classList.toggle("active", id === toolId);
    });
}

function openModal({ title = "", bodyHtml = "", actionsHtml = "" } = {}) {
    const host = $("appModalHost");
    if (!host) {
        console.error("Missing #appModalHost in index.html");
        toast("UI Error", "Missing modal container in index.html", "error");
        return null;
    }

    host.innerHTML = `
<div class="eb-modal-backdrop">
  <div class="eb-modal">
    <div class="eb-modal-hdr">
      <div class="eb-modal-title">${escapeHtml(title)}</div>
      <button class="btn" type="button" data-close-modal
              aria-label="Close"
              style="display:inline-flex; align-items:center; justify-content:center; min-width:38px;">X</button>
    </div>
    <div class="eb-modal-body">${bodyHtml}</div>
    <div class="eb-modal-actions">${actionsHtml}</div>
  </div>
</div>`;

    const close = () => { host.innerHTML = ""; };

    host.querySelectorAll("[data-close-modal]").forEach(el => {
        el.addEventListener("click", close);
    });

    const backdrop = host.querySelector(".eb-modal-backdrop");
    backdrop?.addEventListener("click", e => {
        if (e.target === backdrop) close();
    });

    return { host, close };
}

function escapeHtml(value) {
    const s = String(value ?? "");
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

async function loadTool(toolId) {
    const tool = TOOLS.find(t => t.id === toolId) || TOOLS[0];
    const host = $("toolHost");
    if (currentTool?.id && appState.project) {
        try {
            const collected = await collectCurrentToolProjectData();
            const mergedProject = mergeProjectWithToolData(appState.project, collected);
            if (mergedProject) {
                appState.project = mergedProject;
                saveCurrentProjectMeta();
                updateProjectSidebar();
                renderNav();
            }
        } catch (e) {
            console.warn("[App] Failed to collect current tool project data before switch:", e);
        }
    }

    if (currentTool?.unmount) {
        try { await currentTool.unmount(); } catch { }
    }
    currentTool = null;

    updateNavActive(tool.id);

    const baseToolsPath = "/workspace/tools";

    const viewUrl = `${baseToolsPath}/${tool.folder}/view.html?v=${Date.now()}`;
    const viewRes = await fetch(viewUrl);
    if (!viewRes.ok) throw new Error(`Failed to load ${viewUrl} (${viewRes.status})`);
    const viewHtml = await viewRes.text();
    host.innerHTML = viewHtml;

    const modUrl = `${baseToolsPath}/${tool.folder}/tool.js?v=${Date.now()}`;
    const mod = await import(modUrl);

    const ctx = {
        api,
        toast,
        setFooter,
        getCurrentProject: () => appState.project,
        setCurrentProject: async (project) => {
            setProjectState(project);
            await notifyToolProjectLoaded(project);
        }
    };

    if (mod?.mount) {
        const unmount = await mod.mount(host, ctx);
        currentTool = { id: tool.id, unmount: (typeof unmount === "function" ? unmount : mod.unmount) };
    } else {
        currentTool = { id: tool.id };
    }

    if (appState.project) {
        await notifyToolProjectLoaded(appState.project);
    }
}

function setProjectState(project) {
    appState.project = project || null;
    saveCurrentProjectMeta();
    updateProjectSidebar();
    renderNav();

    window.dispatchEvent(new CustomEvent("sla:project:changed", {
        detail: { project: appState.project }
    }));
}

async function fetchProjectsList() {
    const res = await api.get("/api/v1/projects/list");
    if (!res.ok || !res.json?.ok) {
        throw new Error(res.json?.error || `HTTP ${res.status}`);
    }
    return res.json.projects || [];
}

async function fetchProjectById(id) {
    const res = await api.get(`/api/v1/projects/get?id=${encodeURIComponent(id)}`);
    if (!res.ok || !res.json?.ok) {
        throw new Error(res.json?.error || `HTTP ${res.status}`);
    }
    return res.json.project || null;
}

async function saveProjectToServer(project, override = {}) {
    const payload = {
        id: override.id ?? project?.id ?? null,
        name: override.name ?? project?.name ?? null,
        project
    };

    const res = await api.post("/api/v1/projects/save", payload);
    if (!res.ok || !res.json?.ok) {
        throw new Error(res.json?.error || `HTTP ${res.status}`);
    }

    const savedId = res.json.id;
    if (!savedId) return project;

    const reloaded = await fetchProjectById(savedId);
    return reloaded;
}

async function collectCurrentToolProjectData() {
    const fallback = {
        projectPatch: {},
        eventDocument: null
    };

    const detail = {
        currentToolId: currentTool?.id || null,
        currentProject: structuredCloneSafe(appState.project),
        handled: false,
        result: fallback
    };

    window.dispatchEvent(new CustomEvent("sla:project:collect", { detail }));

    return detail.result || fallback;
}

async function notifyToolProjectLoaded(project) {
    const detail = {
        currentToolId: currentTool?.id || null,
        project: structuredCloneSafe(project)
    };

    window.dispatchEvent(new CustomEvent("sla:project:loaded", { detail }));
}

function structuredCloneSafe(value) {
    if (value == null) return value;
    try {
        return structuredClone(value);
    } catch {
        return JSON.parse(JSON.stringify(value));
    }
}

function buildBlankProject(name = "New Project") {
    return {
        id: null,
        name,
        ts: 0,
        v: 1,
        manifest: {},
        settings: {},
        documents: {
            events: []
        }
    };
}

function mergeProjectWithToolData(baseProject, collected) {
    const project = structuredCloneSafe(baseProject) || buildBlankProject();

    if (collected?.projectPatch && typeof collected.projectPatch === "object") {
        Object.assign(project, collected.projectPatch);
    }

    project.documents ??= {};
    project.documents.events ??= [];

    const ev = collected?.eventDocument;
    if (ev && typeof ev === "object") {
        const eventId = String(ev.id || "").trim().toLowerCase();
        if (eventId) {
            project.documents.events = project.documents.events.filter(x => String(x?.id || "").trim().toLowerCase() !== eventId);
            project.documents.events.push(ev);
        }
    }

    return project;
}

async function handleNewProject() {
    const modal = openModal({
        title: "New Project",
        bodyHtml: `
<div class="field">
  <label>Project Name</label>
  <input id="newProjectName" class="text" type="text" maxlength="120" value="New Project" />
</div>
<div class="muted small">
  This creates a new project in memory and makes it the current project. Use Save Project or Save Project As to write it to disk.
</div>`,
        actionsHtml: `
<button class="btn" type="button" data-close-modal>Cancel</button>
<button class="btn primary" type="button" id="confirmNewProject">Create</button>`
    });

    if (!modal) return;

    const nameEl = modal.host.querySelector("#newProjectName");
    const btn = modal.host.querySelector("#confirmNewProject");

    btn?.addEventListener("click", async () => {
        const name = (nameEl?.value || "").trim() || "New Project";
        const project = buildBlankProject(name);
        setProjectState(project);
        await notifyToolProjectLoaded(project);
        modal.close();
        toast("Project ready", `Current project set to "${name}".`, "info");
    });

    setTimeout(() => nameEl?.focus(), 0);
}

async function handleLoadProject() {
    const modal = openModal({
        title: "Load Project",
        bodyHtml: `
<div class="muted small" style="margin-bottom:10px;">
  Load a saved project from your project storage.
</div>

<div class="row" style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
  <div class="field" style="flex:1 1 auto; min-width:260px;">
    <label>Search</label>
    <input class="text" type="text" id="projectSearch" placeholder="type to filter projects…" />
  </div>
</div>

<div class="project-list" data-role="list">
  <div class="muted small">Loading…</div>
</div>`,
        actionsHtml: `
<div class="spacer"></div>
<button class="btn" type="button" data-close-modal>Cancel</button>`
    });

    if (!modal) return;

    let rowsCache = [];

    function renderRows() {
        const list = modal.host.querySelector("[data-role='list']");
        if (!list) return;

        const q = String(modal.host.querySelector("#projectSearch")?.value || "").trim().toLowerCase();

        const filtered = rowsCache.filter((p) => {
            if (!q) return true;
            const id = String(p.id || "").toLowerCase();
            const name = String(p.name || "").toLowerCase();
            return id.includes(q) || name.includes(q);
        });

        if (!filtered.length) {
            list.innerHTML = `<div class="project-empty">No matches.</div>`;
            return;
        }

        list.innerHTML = filtered.map(p => `
            <div class="project-row" data-project-id="${escapeHtml(p.id)}">
                <div class="project-row-main">
                    <div class="project-row-name">${escapeHtml(p.name || p.id || "Untitled Project")}</div>
                    <div class="project-row-meta">
                        ID: ${escapeHtml(p.id || "—")}<br>
                        Events: ${escapeHtml(String(p.eventCount ?? 0))}<br>
                        Updated: ${escapeHtml(formatTs(p.ts))}
                    </div>
                </div>
                <div class="project-row-actions">
                    <button class="btn primary" type="button" data-load-project="${escapeHtml(p.id)}">Load</button>
                    <button class="btn" type="button" data-delete-project="${escapeHtml(p.id)}">Delete</button>
                </div>
            </div>
        `).join("");

        modal.host.querySelectorAll("[data-load-project]").forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.getAttribute("data-load-project") || "";
                if (!id) return;

                try {
                    const project = await fetchProjectById(id);
                    if (!project) throw new Error("Project not found.");

                    setProjectState(project);
                    await notifyToolProjectLoaded(project);
                    modal.close();
                    toast("Project loaded", `Loaded "${project.name || project.id}".`, "info");
                } catch (e) {
                    toast("Load failed", String(e?.message || e), "error");
                }
            });
        });

        modal.host.querySelectorAll("[data-delete-project]").forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.getAttribute("data-delete-project") || "";
                if (!id) return;

                const row = btn.closest(".project-row");
                const rowName = row?.querySelector(".project-row-name")?.textContent?.trim() || id;

                const confirmed = window.confirm(`Delete project "${rowName}"?\n\nThis cannot be undone.`);
                if (!confirmed) return;

                try {
                    const res = await api.post("/api/v1/projects/delete", { id });
                    if (!res.ok || !res.json?.ok) {
                        throw new Error(res.json?.error || `HTTP ${res.status}`);
                    }

                    if (appState.project?.id && String(appState.project.id).toLowerCase() === String(id).toLowerCase()) {
                        setProjectState(null);
                    }

                    rowsCache = rowsCache.filter(x => String(x.id) !== String(id));
                    renderRows();

                    toast("Project deleted", `"${rowName}" was deleted.`, "info");
                } catch (e) {
                    toast("Delete failed", String(e?.message || e), "error");
                }
            });
        });
    }

    modal.host.querySelector("#projectSearch")?.addEventListener("input", renderRows);

    try {
        rowsCache = await fetchProjectsList();
        renderRows();
    } catch (e) {
        const list = modal.host.querySelector("[data-role='list']");
        if (list) {
            list.innerHTML = `<div class="project-empty">Projects unavailable. Check connection or project API.</div>`;
        }
        toast("Load failed", String(e?.message || e), "error");
    }
}

async function handleSaveProject(saveAs = false) {
    let baseProject = appState.project;

    if (!baseProject) {
        baseProject = buildBlankProject("New Project");
    }

    const collected = await collectCurrentToolProjectData();
    const mergedProject = mergeProjectWithToolData(baseProject, collected);

    const currentName = (mergedProject.name || "").trim() || "New Project";
    const currentId = (mergedProject.id || "").trim();

    if (!saveAs && currentId) {
        try {
            const saved = await saveProjectToServer(mergedProject);
            setProjectState(saved);
            await notifyToolProjectLoaded(saved);
            toast("Project saved", `Saved "${saved.name || saved.id}".`, "info");
        } catch (e) {
            toast("Save failed", String(e?.message || e), "error");
        }
        return;
    }

    const modal = openModal({
        title: saveAs ? "Save Project As" : "Save Project",
        bodyHtml: `
<div class="field">
  <label>Project Name</label>
  <input id="saveProjectName" class="text" type="text" maxlength="120" value="${escapeHtml(currentName)}" />
</div>
<div class="muted small">
  ${saveAs
                ? "This saves a new project copy."
                : "No project has been saved yet. Enter a name to save this project."}
</div>`,
        actionsHtml: `
<button class="btn" type="button" data-close-modal>Cancel</button>
<button class="btn primary" type="button" id="confirmSaveProject">${saveAs ? "Save As" : "Save"}</button>`
    });

    if (!modal) return;

    const nameEl = modal.host.querySelector("#saveProjectName");
    const btn = modal.host.querySelector("#confirmSaveProject");

    btn?.addEventListener("click", async () => {
        const name = (nameEl?.value || "").trim() || "New Project";

        const payload = structuredCloneSafe(mergedProject);
        payload.id = saveAs ? null : payload.id;
        payload.name = name;

        try {
            const saved = await saveProjectToServer(payload, {
                id: saveAs ? null : payload.id,
                name
            });

            setProjectState(saved);
            await notifyToolProjectLoaded(saved);
            modal.close();
            toast("Project saved", `Saved "${saved.name || saved.id}".`, "info");
        } catch (e) {
            toast("Save failed", String(e?.message || e), "error");
        }
    });

    setTimeout(() => nameEl?.focus(), 0);
}

function wireProjectButtons() {
    $("btnProjectNew")?.addEventListener("click", () => {
        handleNewProject();
    });

    $("btnProjectLoad")?.addEventListener("click", () => {
        handleLoadProject();
    });

    $("btnProjectSave")?.addEventListener("click", () => {
        handleSaveProject(false);
    });

    $("btnProjectSaveAs")?.addEventListener("click", () => {
        handleSaveProject(true);
    });
}

async function tryRestoreLastProject() {
    const meta = loadCurrentProjectMeta();
    if (!meta?.id) {
        updateProjectSidebar();
        return;
    }

    try {
        const project = await fetchProjectById(meta.id);
        if (project) {
            setProjectState(project);
            return;
        }
    } catch {
    }

    setProjectState(null);
}

async function boot() {
    renderNav();
    wireProjectButtons();
    updateProjectSidebar();
    wireBackToTop();

    window.addEventListener("hashchange", async () => {
        try {
            await loadTool(toolFromHash());
        } catch (e) {
            toast("Tool load failed", String(e?.message || e), "error");
        }
    });

    const saved = loadSavedConfig();
    const urlCfg = parseUrlConfig();

    const baseUrl = urlCfg.baseUrl || saved.baseUrl || defaultBaseUrl();
    const token = urlCfg.token || saved.token || "";

    api.configure({ baseUrl, token });
    saveConnConfig(baseUrl, token);

    setFooter(`base: ${baseUrl}`, "not connected");

    const auto = urlCfg.autoconnect !== "0";
    if (auto) {
        await connectSilently();
    }

    await tryRestoreLastProject();

    try {
        await loadTool(toolFromHash());
    } catch (e) {
        toast("Tool load failed", String(e?.message || e), "error");
    }
}

boot();


/* ==========================================================
   Global back to top button
   ========================================================== */

function wireBackToTop() {
    const btn = $("backToTopBtn");
    if (!btn) return;

    let hideTimer = null;

    function getScrollRoot() {
        return document.scrollingElement || document.documentElement || document.body;
    }

    function getScrollPercent() {
        const root = getScrollRoot();
        const max = Math.max(1, root.scrollHeight - window.innerHeight);
        return root.scrollTop / max;
    }

    function showTemporarily() {
        if (getScrollPercent() < 0.1) {
            btn.classList.remove("is-visible");
            return;
        }

        btn.classList.add("is-visible");

        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            btn.classList.remove("is-visible");
        }, 1500);
    }

    function onScroll() {
        showTemporarily();
    }

    btn.addEventListener("click", () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
        btn.classList.remove("is-visible");
    });

    window.addEventListener("scroll", onScroll, { passive: true });

    window.addEventListener("resize", () => {
        if (getScrollPercent() < 0.1) {
            btn.classList.remove("is-visible");
        }
    });
}

/* ==========================================================
   Global Tooltip System
   ========================================================== */

document.addEventListener("mouseover", e => {
    const wrap = e.target.closest(".tooltip-wrap");
    if (!wrap || !document.body.contains(wrap)) return;

    const tooltip = wrap.querySelector(".tooltip");
    if (!tooltip) return;

    const rect = wrap.getBoundingClientRect();

    const x = rect.left + rect.width / 2;
    const y = rect.bottom + 8;

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.style.transform = "translateX(-50%)";

    tooltip.style.opacity = "1";
    tooltip.style.visibility = "visible";
});

document.addEventListener("mouseout", e => {
    const wrap = e.target.closest(".tooltip-wrap");
    if (!wrap) return;

    const tooltip = wrap.querySelector(".tooltip");
    if (!tooltip) return;

    tooltip.style.opacity = "0";
    tooltip.style.visibility = "hidden";
});