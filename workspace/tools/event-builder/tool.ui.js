
export function initEventBuilderUi(deps) {
    const {
        $,
        toast,
        elById,
        escapeHtml,
        numOr,

        getAuthToken,
        captureMapForPicker,


        state,
        CONDITION_DEFS,
        TEMPLATE_CMDS,

        makeId,
        normalizeCmdBlocks,
        cloneCommandWithNewId,
        assignFreshIdsToCommands,
        refreshDatalists,
        actorNameOptions,
        renderCmdRawHtml,
        renderCmdTemplateHtml,
        getCommandChoices,
        getTempActorAssetOptions,
        getTempActorAssetMeta,
        buildTempActorImageUrl,
        getAllPresetsMerged,
        loadGroupPresets,
        saveGroupPresets,
        saveGroupPresetsToServer,
        saveGroupPresetImageToServer,
        getServerGroupPresetsCache,
        setServerGroupPresetsCache,
        deleteGroupPresetSmart,
        serverListSaves,
        serverGetSave,
        serverDeleteSave,
        applyProgress,
        setCurrentSave,
        markCurrentStateAsSaved,
        setProgressPill,
        scheduleAutosave,

    } = deps;
    let __ebModalPrevOverflow = null;
    let __ebModalEscHandler = null;


    function ensureModalHost() {
        let host = document.getElementById("ebModalHost");
        if (!host) {
            host = document.createElement("div");
            host.id = "ebModalHost";
            document.body.appendChild(host);
        }
        return host;
    }

    function lockPageScrollForModal() {
        if (__ebModalPrevOverflow === null) {
            __ebModalPrevOverflow = {
                html: document.documentElement.style.overflow || "",
                body: document.body.style.overflow || "",
            };
            document.documentElement.style.overflow = "hidden";
            document.body.style.overflow = "hidden";
        }
    }

    function unlockPageScrollForModal() {
        if (__ebModalPrevOverflow !== null) {
            document.documentElement.style.overflow = __ebModalPrevOverflow.html;
            document.body.style.overflow = __ebModalPrevOverflow.body;
            __ebModalPrevOverflow = null;
        }
    }

    function openModal(contentEl) {
        const host = ensureModalHost();
        host.innerHTML = "";
        host.appendChild(contentEl);

        lockPageScrollForModal();

        if (!__ebModalEscHandler) {
            __ebModalEscHandler = (e) => {
                if (e.key === "Escape") closeModal();
            };
            window.addEventListener("keydown", __ebModalEscHandler);
        }
    }

    function closeModal() {
        const host = document.getElementById("ebModalHost");
        if (host) host.innerHTML = "";

        unlockPageScrollForModal();

        if (__ebModalEscHandler) {
            window.removeEventListener("keydown", __ebModalEscHandler);
            __ebModalEscHandler = null;
        }
    }
    function getAuthTokenBestEffort() {

        try {
            const t = typeof getAuthToken === "function" ? getAuthToken() : "";
            if (t) return String(t);
        } catch { }

        try {
            const q = new URLSearchParams(window.location.search || "");
            const t = q.get("token");
            if (t) return t;
        } catch { }

        const keys = [
            "token",
            "svapi.token",
            "stardewLocalAPI.token",
            "stardewlocalapi.token",
            "stardew_local_api_token",
            "slapi.token",
            "api.token",
            "workspace.token",
        ];

        for (const k of keys) {
            try {
                const v1 = localStorage.getItem(k);
                if (v1) return v1;
            } catch { }
            try {
                const v2 = sessionStorage.getItem(k);
                if (v2) return v2;
            } catch { }
        }

        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k) continue;
                const v = localStorage.getItem(k) || "";
                if (v && v.length >= 16 && /[A-Za-z0-9]/.test(v) && /token/i.test(k)) return v;
            }
        } catch { }

        return "";
    }
    const GROUP_PRESET_TOMBSTONES_KEY = "eventBuilder.groupPresets.deleted.v1";

    function loadGroupPresetTombstones() {
        try {
            const raw = localStorage.getItem(GROUP_PRESET_TOMBSTONES_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(arr) ? arr.map((x) => String(x || "")).filter(Boolean) : []);
        } catch {
            return new Set();
        }
    }

    function saveGroupPresetTombstones(set) {
        try {
            localStorage.setItem(GROUP_PRESET_TOMBSTONES_KEY, JSON.stringify(Array.from(set || [])));
        } catch { }
    }
    function resolvePresetImageSrc(preset) {
        const v = String(preset?.imageDataUrl || "").trim();
        if (!v) return "";
        if (v.startsWith("data:")) return v;
        if (v.startsWith("http://") || v.startsWith("https://")) return v;

        let file = v.replace(/^\/+/, "");
        file = file.replace(/^presets\/images\//i, "");
        file = file.replace(/^images\//i, "");

        try {
            file = file.split(/[\\/]/).pop();
        } catch { }

        if (!file) return "";

        const token = getAuthTokenBestEffort();
        const fileParam = `presets/images/${file}`;
        const base = `/api/v1/eventbuilder/presets/image?file=${encodeURIComponent(fileParam)}`;

        return token ? `${base}&token=${encodeURIComponent(token)}` : base;
    }
    function createGroupPickerModal(onAddNew, onAddSelected) {
        let presetsAll = Array.isArray(getAllPresetsMerged?.()) ? getAllPresetsMerged() : [];
        let selectedId = presetsAll[0]?.id || "";

        const wrap = document.createElement("div");
        wrap.className = "eb-modal-backdrop";
        wrap.innerHTML = `
  <div class="eb-modal">
    <div class="eb-modal-hdr">
      <div class="eb-modal-title">Add Group</div>
      <button class="btn eb-modal-close" data-act="close" type="button"
              aria-label="Close"
              style="display:inline-flex; align-items:center; justify-content:center; min-width:38px;">X</button>
    </div>

    <div class="eb-modal-body">
      <div class="muted small" style="margin-bottom:10px;">
        Choose a preset (includes predefined commands), or add a blank group.
      </div>

      <div class="row" style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
        <div class="field" style="flex:1 1 auto; min-width:260px;">
          <label>Search</label>
          <input class="text" type="text" id="ebPresetSearch" placeholder="type to filter presets…" />
        </div>
      </div>

      <div class="eb-preset-list" data-role="list"
           style="display:flex; flex-direction:column; gap:8px; max-height:420px; overflow:auto;">
      </div>
    </div>

    <div class="eb-modal-actions">
      <button class="btn" data-act="cancel" type="button">Cancel</button>
      <div class="spacer"></div>
      <button class="btn" data-act="addNew" type="button">Add New</button>
      <button class="btn" data-act="addSelected" type="button">Add Selected</button>
    </div>
  </div>
`;

        function repaintSelection(listHost) {
            listHost.querySelectorAll(".eb-preset-row").forEach((r) => {
                const isSel = r.dataset.id === selectedId;
                r.style.outline = isSel ? "2px solid rgba(47,126,69,.55)" : "none";
                r.style.background = isSel ? "rgba(47,126,69,.08)" : "rgba(0,0,0,.03)";
            });
        }

        function renderList() {
            const listHost = wrap.querySelector("[data-role='list']");
            if (!listHost) return;

            const q = String(wrap.querySelector("#ebPresetSearch")?.value || "")
                .trim()
                .toLowerCase();

            const tomb = loadGroupPresetTombstones();
            presetsAll = Array.isArray(getAllPresetsMerged?.()) ? getAllPresetsMerged() : [];

            const filtered = presetsAll.filter((p) => {
                const id = String(p?.id || "");
                if (id && tomb.has(id)) return false;

                if (!q) return true;
                const n = String(p?.name || "").toLowerCase();
                const d = String(p?.description || "").toLowerCase();
                const lid = id.toLowerCase();
                return n.includes(q) || d.includes(q) || lid.includes(q);
            });

            if (!filtered.length) {
                listHost.innerHTML = `<div class="muted small">No matches.</div>`;
                return;
            }

            listHost.innerHTML = filtered
                .map((p) => {
                    const id = String(p?.id || "");
                    const name = String(p?.name || id || "Untitled Preset");
                    const desc = String(p?.description || "").trim();
                    const imgSrc = resolvePresetImageSrc(p);
                    const deletable = true;
                    const count = Array.isArray(p?.items) ? p.items.length : 0;
                    const isSel = id === selectedId;

                    return `
          <div class="eb-preset-row" data-id="${escapeHtml(id)}"
               style="display:flex; gap:10px; align-items:center; padding:10px; border:1px solid rgba(0,0,0,.15); border-radius:12px; background:${isSel ? "rgba(47,126,69,.08)" : "rgba(0,0,0,.03)"}; cursor:pointer;">

            <div style="flex:0 0 auto; width:72px; height:72px; border-radius:10px; overflow:hidden; background:rgba(0,0,0,.06); display:flex; align-items:center; justify-content:center;">
              ${imgSrc
                            ? `<img src="${escapeHtml(imgSrc)}" alt="" style="width:100%; height:100%; object-fit:cover;" />`
                            : `<div class="muted small" style="text-align:center; padding:6px;">No image</div>`}
            </div>

            <div style="flex:1 1 auto; min-width:0;">
              <div style="font-weight:700;">${escapeHtml(name)}</div>
              <div class="muted small">${escapeHtml(desc || "No description")}</div>
              <div class="muted small" style="margin-top:4px;">
                ${escapeHtml(id)}${count ? ` • ${count} command${count === 1 ? "" : "s"}` : ""}
              </div>
            </div>

            <div style="display:flex; gap:8px; align-items:center; flex:0 0 auto;">
              ${deletable
                            ? `<button class="btn danger" data-act="delPreset" data-id="${escapeHtml(id)}" type="button"
                           style="min-width:38px; display:inline-flex; align-items:center; justify-content:center;"
                           title="Delete preset">X</button>`
                            : ``}
            </div>
          </div>
        `;
                })
                .join("");
            listHost.querySelectorAll(".eb-preset-row").forEach((r) => {
                r.addEventListener("click", () => {
                    selectedId = r.dataset.id || "";
                    repaintSelection(listHost);
                });
            });
            listHost.querySelectorAll("[data-act='delPreset']").forEach((btn) => {
                btn.addEventListener("click", async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const id = btn.dataset.id || "";
                    if (!id) return;

                    const confirmed = window.confirm(`Are you sure you want to delete preset "${id}"?`);
                    if (!confirmed) return;

                    const preset =
                        (Array.isArray(getAllPresetsMerged?.()) ? getAllPresetsMerged() : []).find((p) => p.id === id) || { id };
                    const tomb = loadGroupPresetTombstones();
                    tomb.add(id);
                    saveGroupPresetTombstones(tomb);
                    if (typeof deleteGroupPresetSmart === "function") {
                        try {
                            await deleteGroupPresetSmart(preset);
                        } catch { }
                    } else {
                        try {
                            const local = Array.isArray(loadGroupPresets?.()) ? loadGroupPresets() : [];
                            const nextLocal = local.filter((p) => String(p?.id || "") !== id);
                            saveGroupPresets?.(nextLocal);

                            const curServer = Array.isArray(getServerGroupPresetsCache?.()) ? getServerGroupPresetsCache() : null;
                            if (Array.isArray(curServer)) {
                                const nextServer = curServer.filter((p) => String(p?.id || "") !== id);
                                const ok = await saveGroupPresetsToServer?.(nextServer);
                                if (ok) setServerGroupPresetsCache?.(nextServer);
                            }
                        } catch { }
                    }

                    const mergedNowRaw = Array.isArray(getAllPresetsMerged?.()) ? getAllPresetsMerged() : [];
                    const mergedNow = mergedNowRaw.filter((p) => !tomb.has(String(p?.id || "")));
                    if (selectedId === id) selectedId = mergedNow[0]?.id || "";

                    toast("Deleted", `Preset deleted: ${id}`, "info");
                    renderList();
                });
            });

            repaintSelection(listHost);
        }
        wrap.querySelector("[data-act='close']")?.addEventListener("click", () => closeModal());
        wrap.querySelector("[data-act='cancel']")?.addEventListener("click", () => closeModal());
        wrap.querySelector("[data-act='addNew']")?.addEventListener("click", () => {
            closeModal();
            onAddNew?.();
        });

        wrap.querySelector("[data-act='addSelected']")?.addEventListener("click", () => {
            const tomb = loadGroupPresetTombstones();
            const preset = (Array.isArray(getAllPresetsMerged?.()) ? getAllPresetsMerged() : [])
                .filter((p) => !tomb.has(String(p?.id || "")))
                .find((p) => p.id === selectedId);

            closeModal();
            if (preset) onAddSelected?.(preset);
        });

        wrap.addEventListener("mousedown", (e) => {
            if (e.target === wrap) closeModal();
        });

        wrap.querySelector("#ebPresetSearch")?.addEventListener("input", () => renderList());
        renderList();

        return wrap;
    }
    function fileToDataUrl(file) {
        return new Promise((resolve) => {
            if (!file) return resolve("");
            const r = new FileReader();
            r.onload = () => resolve(String(r.result || ""));
            r.onerror = () => resolve("");
            r.readAsDataURL(file);
        });
    }

    function createSavePresetModal(group, onSave) {
        const wrap = document.createElement("div");
        wrap.className = "eb-modal-backdrop";

        const previewSrc = resolvePresetImageSrc({ imageDataUrl: group.imageDataUrl || "" });

        wrap.innerHTML = `
      <div class="eb-modal">
        <div class="eb-modal-hdr">
          <div class="eb-modal-title">Save Group as Preset</div>
          <button class="btn eb-modal-close" data-act="close" type="button"
                  aria-label="Close"
                  style="display:inline-flex; align-items:center; justify-content:center; min-width:38px;">X</button>
        </div>

        <div class="eb-modal-body">
          <div class="row" style="display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap;">
            <div style="flex:1 1 420px;">
              <div class="field" style="min-width:320px;">
                <label>Group Name (required)</label>
                <input class="text" id="ebPresetName" type="text" value="${escapeHtml(group.name || "")}" />
              </div>

              <div class="field" style="min-width:520px; margin-top:10px;">
                <label>Group Description (required)</label>
                <input class="text" id="ebPresetDesc" type="text" value="${escapeHtml(group.description || "")}" />
              </div>

              <div class="field" style="min-width:520px; margin-top:10px;">
                <label>Image (optional)</label>
                <input class="text" id="ebPresetImgFile" type="file" accept="image/*,.gif" />
                <div class="muted small" style="margin-top:6px;">
                  Tip: if you pick an image, it will be stored in the preset.
                </div>
              </div>
            </div>

            <div style="flex:0 0 220px;">
              <div class="muted small" style="margin-bottom:6px;">Preview</div>
              <div style="width:220px; height:220px; border-radius:16px; border:1px solid rgba(0,0,0,.18); background:rgba(0,0,0,.05); overflow:hidden;">
                ${previewSrc
                ? `<img id="ebPresetImgPreview" src="${escapeHtml(previewSrc)}" style="width:100%; height:100%; object-fit:cover;" />`
                : `<div id="ebPresetImgPreview" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;" class="muted small">No image</div>`
            }
              </div>
            </div>
          </div>
        </div>

        <div class="eb-modal-actions">
          <button class="btn" data-act="cancel" type="button">Cancel</button>
          <div class="spacer"></div>
          <button class="btn" data-act="save" type="button">Save</button>
        </div>
      </div>
    `;

        const close = () => closeModal();
        wrap.querySelector("[data-act='close']")?.addEventListener("click", close);
        wrap.querySelector("[data-act='cancel']")?.addEventListener("click", close);

        const fileInp = wrap.querySelector("#ebPresetImgFile");
        fileInp?.addEventListener("change", async (e) => {
            const f = e.target.files?.[0];
            const dataUrl = await fileToDataUrl(f);
            const prev = wrap.querySelector("#ebPresetImgPreview");
            if (!prev) return;

            if (dataUrl) {
                prev.outerHTML = `<img id="ebPresetImgPreview" src="${escapeHtml(
                    dataUrl
                )}" style="width:100%; height:100%; object-fit:cover;" />`;
                wrap.dataset.img = dataUrl;
            } else {
                wrap.dataset.img = "";
            }
        });

        wrap.querySelector("[data-act='save']")?.addEventListener("click", () => {
            const name = String(wrap.querySelector("#ebPresetName")?.value || "").trim();
            const desc = String(wrap.querySelector("#ebPresetDesc")?.value || "").trim();
            const img = String(wrap.dataset.img || group.imageDataUrl || "");

            if (!name) {
                toast("Missing field", "Group Name is required.", "error");
                return;
            }
            if (!desc) {
                toast("Missing field", "Group Description is required.", "error");
                return;
            }

            onSave?.({ name, description: desc, imageDataUrl: img });
            close();
        });

        wrap.addEventListener("mousedown", (e) => {
            if (e.target === wrap) closeModal();
        });

        return wrap;
    }
    function createServerLoadModal(onLoadFileClick) {
        const wrap = document.createElement("div");
        wrap.className = "eb-modal-backdrop";

        wrap.innerHTML = `
  <div class="eb-modal" style="max-width:860px;">
    <div class="eb-modal-hdr">
      <div class="eb-modal-title">Load</div>
      <button class="btn eb-modal-close" data-act="close" type="button"
              aria-label="Close"
              style="display:inline-flex; align-items:center; justify-content:center; min-width:38px;">X</button>
    </div>

    <div class="eb-modal-body">
      <div class="muted small" style="margin-bottom:10px;">
        Loads from your mod folder saves (server). You can also load from a JSON file.
      </div>

      <div class="row" style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
        <div class="field" style="flex:1 1 auto; min-width:260px;">
          <label>Search</label>
          <input class="text" type="text" id="ebSaveSearch" placeholder="type to filter saves…" />
        </div>
      </div>

      <div class="eb-preset-list" data-role="list"
           style="display:flex; flex-direction:column; gap:8px; max-height:420px; overflow:auto;">
        <div class="muted small">Loading…</div>
      </div>
    </div>

    <div class="eb-modal-actions">
      <button class="btn" data-act="loadFile" type="button">Load from File…</button>
      <div class="spacer"></div>
      <button class="btn" data-act="cancel" type="button">Cancel</button>
    </div>
  </div>
`;

        const close = () => closeModal();
        wrap.querySelector("[data-act='close']")?.addEventListener("click", close);
        wrap.querySelector("[data-act='cancel']")?.addEventListener("click", close);

        wrap.querySelector("[data-act='loadFile']")?.addEventListener("click", () => {
            close();
            onLoadFileClick?.();
        });

        wrap.addEventListener("mousedown", (e) => {
            if (e.target === wrap) closeModal();
        });

        let rowsCache = [];

        const fmt = (ts) => {
            try {
                const d = new Date(Number(ts) || 0);
                if (!Number.isFinite(d.getTime())) return "";
                return d.toLocaleString();
            } catch {
                return "";
            }
        };

        function renderRows() {
            const list = wrap.querySelector("[data-role='list']");
            if (!list) return;

            const q = String(wrap.querySelector("#ebSaveSearch")?.value || "")
                .trim()
                .toLowerCase();

            const filtered = rowsCache.filter((r) => {
                if (!q) return true;
                const id = String(r.id || "").toLowerCase();
                const name = String(r.name || "").toLowerCase();
                const h = r.header || {};
                const loc = String(h.location || "").toLowerCase();
                const eid = String(h.eventId || "").toLowerCase();
                return id.includes(q) || name.includes(q) || loc.includes(q) || eid.includes(q);
            });

            if (!filtered.length) {
                list.innerHTML = `<div class="muted small">No matches.</div>`;
                return;
            }

            list.innerHTML = filtered
                .map((r) => {
                    const h = r.header || {};
                    const loc = String(h.location || "").trim();
                    const eid = String(h.eventId || "").trim();
                    const when = fmt(r.ts);
                    const sub = [loc ? `@ ${loc}` : "", eid ? `• ${eid}` : "", when ? `• ${when}` : ""]
                        .filter(Boolean)
                        .join(" ");

                    const canDelete = String(r.id || "") !== "autosave";

                    return `
          <div class="eb-preset-row" data-id="${escapeHtml(r.id)}"
               style="display:flex; gap:10px; align-items:center; padding:10px; border:1px solid rgba(0,0,0,.15); border-radius:12px; background:rgba(0,0,0,.03);">
            <div data-act="load" style="flex:1 1 auto; cursor:pointer;">
              <div style="font-weight:700;">${escapeHtml(r.name)}</div>
              <div class="muted small">${escapeHtml(sub)}</div>
            </div>
            <div class="muted small" style="flex:0 0 auto;">Load</div>

            ${canDelete
                            ? `<button class="btn danger" data-act="del" type="button"
                               title="Delete save"
                               style="min-width:38px; display:inline-flex; align-items:center; justify-content:center;">X</button>`
                            : `<div style="width:42px; flex:0 0 auto;"></div>`
                        }
          </div>
        `;
                })
                .join("");
            list.querySelectorAll(".eb-preset-row [data-act='load']").forEach((el) => {
                el.addEventListener("click", async () => {
                    const row = el.closest(".eb-preset-row");
                    const id = row?.dataset?.id || "";
                    if (!id) return;

                    const g = await serverGetSave?.(id);
                    if (!g?.ok || !g.save) {
                        toast("Load failed", "Could not read save from server.", "error");
                        return;
                    }

                    applyProgress?.(g.save, { toast: true });

                    const picked = rowsCache.find((x) => x.id === id);
                    const saveName = picked?.name || id;

                    setCurrentSave?.(id, saveName, g.save);

                    setProgressPill?.(`progress: loaded ${id === "autosave" ? "autosave" : "save"}`, "ok");
                    close();
                });
            });
            list.querySelectorAll(".eb-preset-row [data-act='del']").forEach((btn) => {
                btn.addEventListener("click", async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const row = btn.closest(".eb-preset-row");
                    const id = row?.dataset?.id || "";
                    if (!id || id === "autosave") return;

                    if (typeof serverDeleteSave !== "function") {
                        toast("Delete unavailable", "serverDeleteSave not wired from tool.js.", "error");
                        return;
                    }

                    const ok = window.confirm(`Delete save "${id}"?\n\nThis cannot be undone.`);
                    if (!ok) return;

                    const r = await serverDeleteSave(id);
                    if (!r?.ok) {
                        toast("Delete failed", r?.error ? String(r.error) : "Server did not delete the save.", "error");
                        return;
                    }

                    rowsCache = rowsCache.filter((x) => String(x.id) !== String(id));
                    renderRows();

                    toast("Deleted", `Removed "${id}".`, "ok");
                });
            });
        }

        async function loadRows() {
            const list = wrap.querySelector("[data-role='list']");
            if (!list) return;

            list.innerHTML = `<div class="muted small">Loading…</div>`;

            const j = await serverListSaves?.();
            if (!j?.ok) {
                list.innerHTML = `<div class="muted small">Server saves unavailable. (Not connected or API missing)</div>`;
                rowsCache = [];
                return;
            }

            const autosave = j.autosave || null;
            const saves = Array.isArray(j.saves) ? j.saves : [];

            const rows = [];
            if (autosave) {
                rows.push({
                    id: "autosave",
                    name: "Autosave",
                    ts: autosave.ts || 0,
                    header: autosave.header || null,
                });
            }
            for (const s of saves) {
                rows.push({
                    id: s.id,
                    name: s.name || s.id,
                    ts: s.ts || 0,
                    header: s.header || null,
                });
            }

            rowsCache = rows;

            if (!rowsCache.length) {
                list.innerHTML = `<div class="muted small">No saves found yet.</div>`;
                return;
            }

            renderRows();
        }

        wrap.querySelector("#ebSaveSearch")?.addEventListener("input", () => renderRows());

        loadRows().catch(() => { });

        return wrap;
    }
    function createProjectEventListModal({
        project,
        currentEventId,
        onLoadEvent,
        onDeleteEvent,
        onCreateNew
    } = {}) {
        const wrap = document.createElement("div");
        wrap.className = "eb-modal-backdrop";

        wrap.innerHTML = `
  <div class="eb-modal" style="max-width:860px;">
    <div class="eb-modal-hdr">
      <div class="eb-modal-title">Event List</div>
      <button class="btn eb-modal-close" data-act="close" type="button"
              aria-label="Close"
              style="display:inline-flex; align-items:center; justify-content:center; min-width:38px;">X</button>
    </div>

    <div class="eb-modal-body">
      <div class="muted small" style="margin-bottom:10px;">
        Shows the events currently stored in this project. Select one to load it, or delete one from the project.
      </div>

      <div class="row" style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
        <div class="field" style="flex:1 1 auto; min-width:260px;">
          <label>Search</label>
          <input class="text" type="text" id="ebProjectEventSearch" placeholder="type to filter events…" />
        </div>
      </div>

      <div class="eb-preset-list" data-role="list"
           style="display:flex; flex-direction:column; gap:8px; max-height:420px; overflow:auto;">
        <div class="muted small">No events found.</div>
      </div>
    </div>

    <div class="eb-modal-actions">
      <button class="btn" data-act="new" type="button">New Event</button>
      <div class="spacer"></div>
      <button class="btn" data-act="cancel" type="button">Cancel</button>
    </div>
  </div>
`;

        const close = () => closeModal();

        wrap.querySelector("[data-act='close']")?.addEventListener("click", close);
        wrap.querySelector("[data-act='cancel']")?.addEventListener("click", close);

        wrap.querySelector("[data-act='new']")?.addEventListener("click", () => {
            close();
            onCreateNew?.();
        });

        wrap.addEventListener("mousedown", (e) => {
            if (e.target === wrap) closeModal();
        });

        let rowsCache = Array.isArray(project?.documents?.events)
            ? project.documents.events.map((ev) => ({
                id: String(ev?.id || "").trim(),
                name: String(ev?.name || "").trim(),
                header: ev?.header || {},
                ts: Number(ev?.ts || 0)
            }))
            : [];

        const fmt = (ts) => {
            try {
                const d = new Date(Number(ts) || 0);
                if (!Number.isFinite(d.getTime())) return "";
                return d.toLocaleString();
            } catch {
                return "";
            }
        };

        function renderRows() {
            const list = wrap.querySelector("[data-role='list']");
            if (!list) return;

            const q = String(wrap.querySelector("#ebProjectEventSearch")?.value || "")
                .trim()
                .toLowerCase();

            const filtered = rowsCache.filter((r) => {
                if (!q) return true;

                const id = String(r.id || "").toLowerCase();
                const name = String(r.name || "").toLowerCase();
                const h = r.header || {};
                const loc = String(h.location || "").toLowerCase();
                const eid = String(h.eventId || "").toLowerCase();

                return id.includes(q) || name.includes(q) || loc.includes(q) || eid.includes(q);
            });

            if (!filtered.length) {
                list.innerHTML = `<div class="muted small">No events found in this project.</div>`;
                return;
            }

            list.innerHTML = filtered.map((r) => {
                const h = r.header || {};
                const loc = String(h.location || "").trim();
                const eid = String(h.eventId || "").trim();
                const when = fmt(r.ts);

                const sub = [
                    loc ? `@ ${loc}` : "",
                    eid ? `• ${eid}` : "",
                    when ? `• ${when}` : ""
                ].filter(Boolean).join(" ");

                const isCurrent =
                    String(r.id || "").trim() !== "" &&
                    String(r.id || "").trim() === String(currentEventId || "").trim();

                return `
          <div class="eb-preset-row" data-id="${escapeHtml(r.id)}"
               style="display:flex; gap:10px; align-items:center; padding:10px; border:1px solid rgba(0,0,0,.15); border-radius:12px; background:${isCurrent ? "rgba(47,126,69,.08)" : "rgba(0,0,0,.03)"};">
            <div data-act="load" style="flex:1 1 auto; cursor:pointer;">
              <div style="font-weight:700;">
                ${escapeHtml(r.name || r.id || "Untitled Event")}
                ${isCurrent ? `<span class="muted small" style="margin-left:8px;">(current)</span>` : ``}
              </div>
              <div class="muted small">${escapeHtml(sub)}</div>
            </div>

            <div style="display:flex; gap:8px; align-items:center; flex:0 0 auto;">
              <button class="btn primary" data-act="loadBtn" type="button">Load</button>
              <button class="btn danger" data-act="del" type="button"
                      style="min-width:38px; display:inline-flex; align-items:center; justify-content:center;"
                      title="Delete event">X</button>
            </div>
          </div>
        `;
            }).join("");

            list.querySelectorAll(".eb-preset-row [data-act='load'], .eb-preset-row [data-act='loadBtn']").forEach((el) => {
                el.addEventListener("click", () => {
                    const row = el.closest(".eb-preset-row");
                    const id = row?.dataset?.id || "";
                    if (!id) return;

                    close();
                    onLoadEvent?.(id);
                });
            });

            list.querySelectorAll(".eb-preset-row [data-act='del']").forEach((btn) => {
                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const row = btn.closest(".eb-preset-row");
                    const id = row?.dataset?.id || "";
                    if (!id) return;

                    const picked = rowsCache.find((x) => String(x.id) === String(id));
                    const label = picked?.name || picked?.header?.eventId || id;

                    const ok = window.confirm(`Delete event "${label}"?\n\nThis removes it from the current project.`);
                    if (!ok) return;

                    rowsCache = rowsCache.filter((x) => String(x.id) !== String(id));
                    renderRows();

                    onDeleteEvent?.(id);
                });
            });
        }

        wrap.querySelector("#ebProjectEventSearch")?.addEventListener("input", () => renderRows());

        renderRows();

        return wrap;
    }
    function createCmdDropdown(inputEl, getChoices) {
        const root = document.body;

        const dd = document.createElement("div");
        dd.className = "cmd-dd";
        root.appendChild(dd);

        dd.style.position = "fixed";
        dd.style.zIndex = "99999";

        let isOpen = false;
        let activeIndex = -1;
        let lastItems = [];

        function position() {
            const r = inputEl.getBoundingClientRect();

            const w = Math.max(520, Math.ceil(r.width));
            dd.style.width = `${w}px`;

            let left = Math.floor(r.left);
            let top = Math.floor(r.bottom + 6);

            const pad = 8;
            left = Math.min(left, window.innerWidth - w - pad);
            left = Math.max(left, pad);

            dd.style.left = `${left}px`;
            dd.style.top = `${top}px`;
        }

        function close() {
            isOpen = false;
            activeIndex = -1;
            dd.classList.remove("open");
            dd.innerHTML = "";
        }

        function open(items) {
            isOpen = true;
            dd.classList.add("open");
            dd.innerHTML = "";

            lastItems = items || [];
            if (!lastItems.length) {
                const empty = document.createElement("div");
                empty.className = "cmd-dd-empty";
                empty.textContent = "No matches";
                dd.appendChild(empty);
                activeIndex = -1;
                return;
            }

            lastItems.forEach((it, i) => {
                const row = document.createElement("div");
                row.className = "cmd-dd-row";
                row.dataset.idx = String(i);

                row.innerHTML = `
          <div class="cmd-dd-cmd">${escapeHtml(it.name)}</div>
          <div class="cmd-dd-desc">${escapeHtml(it.desc || "")}</div>
        `;

                row.addEventListener("mouseenter", () => setActive(i));
                row.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    choose(i, { addImmediately: false });
                });

                dd.appendChild(row);
            });

            setActive(0);
        }

        function setActive(i) {
            activeIndex = i;
            dd.querySelectorAll(".cmd-dd-row").forEach((el) => el.classList.remove("active"));
            const el = dd.querySelector(`.cmd-dd-row[data-idx="${i}"]`);
            if (el) el.classList.add("active");

            if (el) {
                const er = el.getBoundingClientRect();
                const dr = dd.getBoundingClientRect();
                if (er.top < dr.top) dd.scrollTop -= dr.top - er.top;
                else if (er.bottom > dr.bottom) dd.scrollTop += er.bottom - dr.bottom;
            }
        }

        function choose(i, opts = { addImmediately: false }) {
            const it = lastItems[i];
            if (!it) return;
            inputEl.value = it.name;
            close();

            if (opts.addImmediately) elById("ebAddCmd")?.click();
            inputEl.focus();
        }

        function buildFiltered() {
            const q = (inputEl.value || "").trim().toLowerCase();
            const all = getChoices?.() || [];
            const items = all.filter((it) => {
                const n = String(it.name || "").toLowerCase();
                const d = String(it.desc || "").toLowerCase();
                if (!q) return true;
                return n.includes(q) || d.includes(q);
            });

            position();
            open(items.slice(0, 200));
        }

        try {
            inputEl.removeAttribute("list");
        } catch { }

        inputEl.addEventListener("focus", () => buildFiltered());
        inputEl.addEventListener("input", () => buildFiltered());

        inputEl.addEventListener("keydown", (e) => {
            if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                buildFiltered();
                e.preventDefault();
                return;
            }

            if (!isOpen) return;

            if (e.key === "Escape") {
                close();
                e.preventDefault();
                return;
            }

            if (e.key === "ArrowDown") {
                if (lastItems.length) setActive(Math.min(activeIndex + 1, lastItems.length - 1));
                e.preventDefault();
                return;
            }

            if (e.key === "ArrowUp") {
                if (lastItems.length) setActive(Math.max(activeIndex - 1, 0));
                e.preventDefault();
                return;
            }

            if (e.key === "Enter") {
                if (activeIndex >= 0) {
                    choose(activeIndex, { addImmediately: true });
                    e.preventDefault();
                }
                return;
            }
        });

        document.addEventListener("change", (e) => {
            const el = e.target;
            if (!(el instanceof Element)) return;

            if (el.matches('#ebCmds .eb-cmd-card select[data-k="dir"]')) {
                const card = el.closest(".eb-cmd-card");
                applyMoveDirRulesToCard(card);
            }
        });

        document.addEventListener("input", (e) => {
            const el = e.target;
            if (!(el instanceof Element)) return;

            if (!el.matches('#ebCmds .eb-cmd-card input[data-k="dx"], #ebCmds .eb-cmd-card input[data-k="dy"]')) {
                return;
            }

            const card = el.closest(".eb-cmd-card");
            if (!card) return;

            const type = (card.dataset?.cmdType || "").toLowerCase();
            if (type !== "move") return;

            applyMoveDirRulesToCard(card);
        });

        document.addEventListener("mousedown", (e) => {
            if (!isOpen) return;
            const t = e.target;
            if (t === inputEl || dd.contains(t)) return;
            close();
        });

        inputEl.addEventListener("blur", () => {
            setTimeout(() => {
                const ae = document.activeElement;
                if (ae && dd.contains(ae)) return;
                close();
            }, 0);
        });

        const onReposition = () => {
            if (isOpen) position();
        };
        window.addEventListener("resize", onReposition);
        window.addEventListener("scroll", onReposition, true);

        return { close };
    }
    function renderCondArgsHtml(cond) {
        const type = String(cond?.type || "").trim();
        const args = Array.isArray(cond?.args) ? cond.args : [];
        const negate = !!cond?.negate;
        let html = `
      <div class="field" style="min-width:130px;">
        <label>Mode</label>
        <select class="select" data-k="negate">
          <option value="false" ${negate ? "" : "selected"}>Is</option>
          <option value="true" ${negate ? "selected" : ""}>Is Not</option>
        </select>
      </div>
    `;

        if (type === "Raw") {
            return `
          <div class="field grow" style="min-width:520px;">
            <label>Raw</label>
            <textarea class="text eb-cmd-textarea"
                      data-k="raw"
                      rows="2"
                      style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;"
                      placeholder="Not all Preconditions has been implimented use this to enter raw preconditions">${escapeHtml(cond?.raw || "")}</textarea>
          </div>
        `;
        }

        if (type === "NPCVisible" || type === "NpcVisibleHere" || type === "Spouse" || type === "Friendship" || type === "Hearts") {
            if (type === "Friendship" || type === "Hearts") {
                html += `
              <div class="field" style="min-width:180px;">
                <label>NPC</label>
                <input class="text" type="text" list="eb-dl-npcs" value="${escapeHtml(args[0] || "")}" data-arg="0" />
              </div>
              <div class="field" style="min-width:140px;">
                <label>Val</label>
                <input class="text" type="text" value="${escapeHtml(args[1] || "")}" data-arg="1" />
              </div>
            `;
                return html;
            }

            html += `
          <div class="field" style="min-width:180px;">
            <label>NPC</label>
            <input class="text" type="text" list="eb-dl-npcs" value="${escapeHtml(args[0] || "")}" data-arg="0" />
          </div>
        `;
            return html;
        }

        if (type === "DayOfMonth" || type === "DayOfWeek" || type === "Season") {
            html += `
          <div class="field" style="min-width:260px;">
            <label>Vals</label>
            <input class="text" type="text" value="${escapeHtml(args[0] || "")}" data-arg="0" placeholder="e.g. 12 13 14" />
          </div>
        `;
            return html;
        }

        if (type === "Time") {
            html += `
          <div class="field" style="min-width:120px;">
            <label>Min</label>
            <input class="num" type="number" value="${escapeHtml(args[0] || "600")}" data-arg="0" />
          </div>
          <div class="field" style="min-width:120px;">
            <label>Max</label>
            <input class="num" type="number" value="${escapeHtml(args[1] || "2600")}" data-arg="1" />
          </div>
        `;
            return html;
        }

        if (type === "GameStateQuery") {
            html += `
          <div class="field grow" style="min-width:360px;">
            <label>Query</label>
            <input class="text" type="text" value="${escapeHtml(args[0] || "")}" data-arg="0" placeholder='e.g. WEATHER Here Sun' />
          </div>
        `;
            return html;
        }

        const def = CONDITION_DEFS.find((d) => d.key === type);
        const nargs = Math.max(def?.args?.length || 1, args.length || 1);

        for (let i = 0; i < nargs; i++) {
            html += `
          <div class="field" style="min-width:180px;">
            <label>${escapeHtml(def?.args?.[i] || `arg${i + 1}`)}</label>
            <input class="text" type="text" value="${escapeHtml(args[i] || "")}" data-arg="${i}" />
          </div>
        `;
        }

        return html;
    }

    function renderActors() {
        const host = $("ebActors");
        if (!host) return;
        host.innerHTML = "";

        state.actors.forEach((a, idx) => {
            const el = document.createElement("div");
            el.className = "card";
            el.style.borderRadius = "12px";
            el.style.overflow = "hidden";

            el.innerHTML = `
            <div class="card-body eb-card-row" style="padding:10px 12px;">
                <div class="row eb-row eb-row-compact">

                <div class="field eb-mini">
                    <label>#</label>
                    <input class="text" type="text" value="${idx + 1}" disabled />
                </div>

                <div class="field" style="min-width:180px;">
                    <label>Name</label>
                    <input class="text" type="text" data-k="name" list="eb-dl-actors" value="${escapeHtml(a.name || "")}" />
                </div>

                <div class="field" style="min-width:88px;">
                    <label>X</label>
                    <input class="num" type="number" data-k="x" value="${numOr(a.x, 0)}" />
                </div>

                <div class="field" style="min-width:88px;">
                    <label>Y</label>
                    <input class="num" type="number" data-k="y" value="${numOr(a.y, 0)}" />
                </div>

                <div class="field" style="min-width:100px;">
                    <label>&nbsp;</label>
                    <button class="btn" data-act="pickActorXY" type="button" title="Pick actor X/Y from map">
                    Pick X/Y
                    </button>
                </div>

                <div class="field" style="min-width:150px;">
                    <label>Dir</label>
                    <select class="select" data-k="dir">
                    <option value="0" ${String(numOr(a.dir, 2)) === "0" ? "selected" : ""}>0 - Up</option>
                    <option value="1" ${String(numOr(a.dir, 2)) === "1" ? "selected" : ""}>1 - Right</option>
                    <option value="2" ${String(numOr(a.dir, 2)) === "2" ? "selected" : ""}>2 - Down</option>
                    <option value="3" ${String(numOr(a.dir, 2)) === "3" ? "selected" : ""}>3 - Left</option>
                    </select>
                </div>

                <button class="btn danger eb-del" data-act="del" type="button" title="Delete actor">X</button>
                </div>
            </div>
            `;

            el.querySelectorAll("[data-k]").forEach((inp) => {
                const applyValue = () => {
                    const k = inp.dataset.k;
                    if (!k) return;

                    if (!state.actors[idx]) return;

                    if (k === "x" || k === "y" || k === "dir") {
                        state.actors[idx][k] = numOr(inp.value, k === "dir" ? 2 : 0);
                    } else {
                        state.actors[idx][k] = inp.value;
                    }

                    refreshDatalists();
                    scheduleAutosave();
                };

                inp.addEventListener("input", applyValue);
                inp.addEventListener("change", applyValue);
            });

            el.querySelector("[data-act='pickActorXY']")?.addEventListener("click", async () => {
                const location = String(elById("ebLocation")?.value || "").trim();

                if (!location) {
                    toast("Missing location", "Select a location first.", "error");
                    return;
                }

                try {
                    await openSimpleMapPicker({
                        location,
                        title: `Pick Actor X/Y`,
                        initialX: numOr(a.x, 0),
                        initialY: numOr(a.y, 0),
                        onPick: ({ x, y }) => {
                            if (!state.actors[idx]) return;

                            state.actors[idx].x = numOr(x, 0);
                            state.actors[idx].y = numOr(y, 0);

                            renderActors();
                            refreshDatalists();
                            scheduleAutosave();

                            toast(
                                "Actor updated",
                                `${state.actors[idx].name || "Actor"} set to ${x}, ${y}`,
                                "ok"
                            );
                        }
                    });
                } catch (err) {
                    toast("Picker error", String(err || "Unknown error"), "error");
                }
            });

            el.querySelector("[data-act='del']").addEventListener("click", () => {
                state.actors.splice(idx, 1);
                renderActors();
                refreshDatalists();
                scheduleAutosave();
            });

            host.appendChild(el);
        });
    }


    function renderConds() {
        const host = $("ebConds");
        if (!host) return;
        host.innerHTML = "";

        state.conds.forEach((c, idx) => {
            const def = CONDITION_DEFS.find((d) => d.key === c.type);
            const args = Array.isArray(c.args) ? c.args : [];
            const negate = !!c.negate;

            const el = document.createElement("div");
            el.className = "card";
            el.style.borderRadius = "12px";
            el.style.overflow = "hidden";

            el.innerHTML = `
          <div class="card-body eb-card-row" style="padding:10px 12px;">
            <div class="row eb-row eb-row-compact">

              <div class="field eb-type" style="min-width:190px;">
                <label>Type</label>
                <input class="text" type="text" value="${escapeHtml(c.type)}" disabled />
              </div>

                ${renderCondArgsHtml(c)}

              <div class="muted small" style="margin-left:6px; min-width:220px;">
                ${escapeHtml(def?.help || "")}
              </div>

              <button class="btn danger eb-del" data-act="del" type="button" title="Delete condition">X</button>
            </div>
          </div>
        `;
            el.querySelectorAll('[data-k="negate"]').forEach((inp) => {
                const applyNegate = () => {
                    if (!state.conds[idx]) return;
                    state.conds[idx].negate = String(inp.value) === "true";
                    scheduleAutosave();
                };

                inp.addEventListener("input", applyNegate);
                inp.addEventListener("change", applyNegate);
            });

            el.querySelectorAll('[data-k="raw"]').forEach((inp) => {
                const applyRaw = () => {
                    if (!state.conds[idx]) return;
                    state.conds[idx].raw = inp.value;
                    scheduleAutosave();
                };

                inp.addEventListener("input", applyRaw);
                inp.addEventListener("change", applyRaw);
            });
            el.querySelectorAll("[data-arg]").forEach((inp) => {
                const applyArg = () => {
                    if (!state.conds[idx]) return;

                    const argIndex = Number(inp.dataset.arg);
                    if (!Number.isInteger(argIndex) || argIndex < 0) return;

                    if (!Array.isArray(state.conds[idx].args)) {
                        state.conds[idx].args = [];
                    }

                    state.conds[idx].args[argIndex] = inp.value;
                    scheduleAutosave();
                };

                inp.addEventListener("input", applyArg);
                inp.addEventListener("change", applyArg);
            });

            el.querySelector("[data-act='del']")?.addEventListener("click", () => {
                state.conds.splice(idx, 1);
                renderConds();
                scheduleAutosave();
            });

            host.appendChild(el);
        });
    }
    let dragPayload = null;
    let dragOverKey = null;

    function clearDragUi(host) {
        dragOverKey = null;
        host.querySelectorAll(".eb-drop").forEach((el) => el.classList.remove("eb-drop"));
    }

    function setDropUi(host, key) {
        dragOverKey = key;
        host.querySelectorAll(".eb-drop").forEach((el) => el.classList.remove("eb-drop"));
        const el = host.querySelector(`[data-dropkey="${CSS.escape(key)}"]`);
        if (el) el.classList.add("eb-drop");
    }

    function moveCmdBetween(from, to) {
        const fromIsGrouped = from.gIndex != null;
        const toIsGrouped = to.gIndex != null;

        let cmdObj = null;

        if (fromIsGrouped) {
            const g = state.cmds[from.gIndex];
            if (!g || g.kind !== "group") return;
            cmdObj = g.items.splice(from.cIndex, 1)[0];
        } else {
            const b = state.cmds[from.cIndex];
            if (!b || b.kind !== "cmd") return;
            cmdObj = b.cmd;
            state.cmds.splice(from.cIndex, 1);
        }

        if (!cmdObj) return;

        if (toIsGrouped) {
            const g = state.cmds[to.gIndex];
            if (!g || g.kind !== "group") return;
            const idx = Math.max(0, Math.min(to.cIndex, g.items.length));
            g.items.splice(idx, 0, cmdObj);
        } else {
            const idx = Math.max(0, Math.min(to.cIndex, state.cmds.length));
            state.cmds.splice(idx, 0, { kind: "cmd", cmd: cmdObj });
        }
    }

    function adjustToAfterRemoval(from, to) {
        if (from?.gIndex == null && to?.gIndex != null) {
            if (typeof from.cIndex === "number" && typeof to.gIndex === "number") {
                if (from.cIndex < to.gIndex) {
                    return { ...to, gIndex: Math.max(0, to.gIndex - 1) };
                }
            }
        }
        return to;
    }

    function moveGroup(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        const b = state.cmds[fromIndex];
        if (!b || b.kind !== "group") return;
        state.cmds.splice(fromIndex, 1);
        const idx = Math.max(0, Math.min(toIndex, state.cmds.length));
        state.cmds.splice(idx, 0, b);
    }

    function computeFlatNumbering() {
        const m = new Map();
        let n = 1;
        for (let i = 0; i < state.cmds.length; i++) {
            const b = state.cmds[i];
            if (b?.kind === "cmd") {
                m.set(`t:${i}`, n++);
            } else if (b?.kind === "group") {
                for (let j = 0; j < (b.items || []).length; j++) {
                    m.set(`g:${i}:${j}`, n++);
                }
            }
        }
        return m;
    }

    function autoSizeCommandTextarea(textarea) {
        if (!textarea) return;

        textarea.style.height = "auto";

        const minHeight = 60;
        const next = Math.max(minHeight, textarea.scrollHeight || 0);

        textarea.style.height = `${next}px`;
    }

    function wireAutoSizeCommandTextareas(root) {
        if (!root) return;

        root.querySelectorAll("textarea.eb-cmd-textarea").forEach((ta) => {
            autoSizeCommandTextarea(ta);

            const onResize = () => autoSizeCommandTextarea(ta);

            ta.addEventListener("input", onResize);
            ta.addEventListener("change", onResize);

            requestAnimationFrame(() => autoSizeCommandTextarea(ta));
        });
    }

    function renderCmdCard({ cmd, number, dragKey, onInput, onDel, onDup, draggableSpec }) {
        const isTemplate = TEMPLATE_CMDS.has(cmd.type);
        const t = (cmd?.type || "").toLowerCase();
        const showMapBtn = false;
        const cmdTypeDesc =
            (getCommandChoices?.().find(c =>
                String(c?.name || "").toLowerCase() === t
            )?.desc) || "No description available yet.";

        const el = document.createElement("div");



        el.className = "card list-card eb-cmd-card";
        el.style.borderRadius = "12px";
        el.style.overflow = "hidden";
        el.dataset.dropkey = dragKey;
        el.dataset.cmdType = t;

        if (t === "advancedmove") {
            el.classList.add("eb-cmd-advancedmove");
        }

        if (t === "addtemporaryactor") {
            el.classList.add("eb-cmd-addtemporaryactor");
        }

        el.innerHTML = `
  <div class="card-body eb-card-row" style="padding:10px 12px;">
    <div class="row eb-row eb-row-compact">
      <button class="btn eb-drag-handle" type="button" title="Drag to reorder" draggable="true">≡</button>

      <div class="field eb-mini">
        <label>#</label>
        <input class="text" type="text" value="${number}" disabled />
      </div>

      <div class="field eb-mini">
        <label>ID</label>
        <input class="text" type="text" value="${escapeHtml(cmd.id || "")}" disabled title="Stable command ID" />
      </div>

      <div class="field eb-type has-tooltip-layer">
        <label>Type</label>
        <div class="tooltip-wrap" style="display:block; width:100%;">
          <input class="text" type="text" value="${escapeHtml(cmd.type)}" disabled />
          <div class="tooltip">
            <b>${escapeHtml(cmd.type || "Command")}</b><br><br>
            ${escapeHtml(cmdTypeDesc)}
          </div>
        </div>
      </div>

      ${isTemplate ? renderCmdTemplateHtml(cmd) : renderCmdRawHtml(cmd)}

      <div class="eb-row-actions">
        ${showMapBtn ? `<button class="btn eb-map" data-act="map" type="button" title="Pick on map">🗺</button>` : ""}
        <button class="btn eb-dup" data-act="dup" type="button" title="Duplicate command">⎘</button>
        <button class="btn danger eb-del" data-act="del" type="button" title="Delete command">X</button>
      </div>
    </div>
  </div>
`;

        wireAutoSizeCommandTextareas(el);

        el.querySelectorAll("[data-k]").forEach((inp) => {
            const applyValue = async (eventType) => {
                const k = inp.dataset.k;
                cmd[k] = inp.value;

                if (t === "addtemporaryactor" && k === "actorKind") {
                    const kind = String(cmd.actorKind || "Character").trim() || "Character";

                    if (kind === "Character") {
                        cmd.spriteWidth = 16;
                        cmd.spriteHeight = 32;
                    } else {
                        cmd.spriteWidth = 16;
                        cmd.spriteHeight = 16;
                    }

                    cmd.assetName = "";
                    cmd.spriteAssetName = "";

                    onInput?.({
                        rerender: true,
                        key: k,
                        eventType
                    });
                    return;
                }

                if (t === "addtemporaryactor" && k === "assetName") {
                    const selected = String(cmd.assetName || "").trim();
                    const kind = String(cmd.actorKind || "Character").trim() || "Character";
                    const rows = Array.isArray(getTempActorAssetOptions?.(kind)) ? getTempActorAssetOptions(kind) : [];
                    const hit = rows.find(r => String(r.assetName || "") === selected);

                    cmd.spriteAssetName = String(hit?.name || selected.split("/").pop() || "").trim();

                    try {
                        const meta = await getTempActorAssetMeta?.(selected);
                        if (meta?.ok) {
                            cmd.spriteWidth = Number(meta.tileWidth || cmd.spriteWidth || 16);
                            cmd.spriteHeight = Number(meta.tileHeight || cmd.spriteHeight || 16);
                        }
                    } catch { }

                    onInput?.({
                        rerender: true,
                        key: k,
                        eventType
                    });
                    return;
                }

                const isLayoutToggle =
                    (t === "viewport" && (k === "viewportType" || k === "targetType")) ||
                    (t === "end" && k === "endType");

                onInput?.({
                    rerender: isLayoutToggle,
                    key: k,
                    eventType
                });

                if (!isLayoutToggle) {
                    refreshMoveWarpSpotFields();
                }
            };


            inp.addEventListener("input", () => { void applyValue("input"); });
            inp.addEventListener("change", () => { void applyValue("change"); });

        });

        el.querySelector("[data-act='del']")?.addEventListener("click", () => onDel?.());
        el.querySelector("[data-act='dup']")?.addEventListener("click", () => onDup?.());

        const lanternSpriteBtn = el.querySelector("[data-act='pick-lantern-sprite']");
        if (lanternSpriteBtn) {
            lanternSpriteBtn.addEventListener("click", () => {
                openTextureSpritePickerForCmd(cmd, {
                    textureKey: "springobjects",
                    title: "Pick Lantern Sprite",
                    valueField: "spriteIndex",
                    fallbackTileWidth: 16,
                    fallbackTileHeight: 16,
                    errorMessage: "Could not load springobjects texture."
                });
            });
        }

        const festivalPropSpriteBtn = el.querySelector("[data-act='pick-festival-prop-sprite']");
        if (festivalPropSpriteBtn) {
            festivalPropSpriteBtn.addEventListener("click", () => {
                openTextureSpritePickerForCmd(cmd, {
                    textureKey: "festivals",
                    title: "Pick Festival Prop",
                    valueField: "propIndex",
                    fallbackTileWidth: 16,
                    fallbackTileHeight: 16,
                    errorMessage: "Could not load festivals texture."
                });
            });
        }

        const craftableSpriteBtn = el.querySelector("[data-act='pick-craftable-sprite']");
        if (craftableSpriteBtn) {
            craftableSpriteBtn.addEventListener("click", () => {
                openTextureSpritePickerForCmd(cmd, {
                    textureKey: "craftables",
                    title: "Pick Craftable Sprite",
                    valueField: "spriteIndex",
                    fallbackTileWidth: 16,
                    fallbackTileHeight: 32,
                    errorMessage: "Could not load craftables texture."
                });
            });
        }

        const tempActorPreviewBtn = el.querySelector("[data-act='preview-temp-actor']");
        if (tempActorPreviewBtn) {
            tempActorPreviewBtn.addEventListener("click", async () => {
                const assetName = String(cmd.assetName || "").trim();
                if (!assetName) {
                    toast("Missing sprite", "Select a sprite asset first.", "error");
                    return;
                }

                let tileWidth = Number(cmd.spriteWidth || 0);
                let tileHeight = Number(cmd.spriteHeight || 0);

                if (tileWidth <= 0 || tileHeight <= 0) {
                    try {
                        const meta = await getTempActorAssetMeta?.(assetName);
                        if (meta?.ok) {
                            tileWidth = Number(meta.tileWidth || 16);
                            tileHeight = Number(meta.tileHeight || 16);
                        }
                    } catch { }
                }

                const imgUrl = buildTempActorImageUrl?.(assetName, {
                    grid: true,
                    tileWidth: tileWidth || 16,
                    tileHeight: tileHeight || 16
                });

                if (!imgUrl) {
                    toast("Preview failed", "Could not build preview image URL.", "error");
                    return;
                }

                const wrap = document.createElement("div");
                wrap.className = "eb-modal-backdrop";
                wrap.innerHTML = `
                  <div class="eb-modal" style="max-width:900px;">
                    <div class="eb-modal-hdr">
                      <div class="eb-modal-title">Temp Actor Preview</div>
                      <button class="btn eb-modal-close" data-act="close" type="button"
                              aria-label="Close"
                              style="display:inline-flex; align-items:center; justify-content:center; min-width:38px;">X</button>
                    </div>

                    <div class="eb-modal-body">
                      <div class="muted small" style="margin-bottom:8px;">${escapeHtml(assetName)}</div>
                      <div style="border:1px solid rgba(0,0,0,.18); border-radius:12px; overflow:auto; max-height:70vh; background:rgba(0,0,0,.05);">
                        <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(assetName)}" style="display:block; max-width:100%; height:auto;" />
                      </div>
                    </div>

                    <div class="eb-modal-actions">
                      <div class="spacer"></div>
                      <button class="btn" data-act="close2" type="button">Close</button>
                    </div>
                  </div>
                `;

                wrap.querySelector("[data-act='close']")?.addEventListener("click", () => closeModal());
                wrap.querySelector("[data-act='close2']")?.addEventListener("click", () => closeModal());
                wrap.addEventListener("mousedown", (e) => {
                    if (e.target === wrap) closeModal();
                });

                openModal(wrap);
            });
        }


        const mapBtn = el.querySelector("[data-act='map']");
        if (mapBtn) {
            mapBtn.addEventListener("click", (e) => {
                const cardEl = e.currentTarget.closest(".eb-cmd-card");
                openMapPickerForCmd(cmd, cardEl);
            });
        }

        el.querySelector("[data-act='mapViewportXY']")?.addEventListener("click", async () => {
            const location = String(elById("ebLocation")?.value || "").trim();

            if (!location) {
                toast("Missing location", "Select a location first.", "error");
                return;
            }

            try {
                await openSimpleMapPicker({
                    location,
                    title: "Pick Viewport X/Y",
                    initialX: numOr(cmd.x, 0),
                    initialY: numOr(cmd.y, 0),
                    onPick: ({ x, y }) => {
                        cmd.x = numOr(x, 0);
                        cmd.y = numOr(y, 0);

                        onInput?.();

                        const xInp = el.querySelector('[data-k="x"]');
                        const yInp = el.querySelector('[data-k="y"]');
                        if (xInp) xInp.value = String(cmd.x);
                        if (yInp) yInp.value = String(cmd.y);

                        toast("Viewport updated", `Viewport set to ${x}, ${y}`, "ok");
                    }
                });
            } catch (err) {
                toast("Picker error", String(err || "Unknown error"), "error");
            }
        });



        if (t === "advancedmove") {
            if (!Array.isArray(cmd.steps)) {
                cmd.steps = [];
            }

            const rerenderAdvancedMove = () => {
                onInput?.({
                    rerender: true,
                    key: "steps",
                    eventType: "change"
                });
            };

            let advDragFrom = null;

            el.querySelectorAll("[data-act='adv-drag']").forEach((handle) => {
                handle.addEventListener("dragstart", (e) => {
                    const idx = Number(handle.getAttribute("data-adv-index"));
                    if (!Number.isInteger(idx) || idx < 0) return;

                    advDragFrom = idx;

                    try {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(idx));
                    } catch { }
                });

                handle.addEventListener("dragend", () => {
                    advDragFrom = null;
                    el.querySelectorAll("[data-adv-row]").forEach((row) => {
                        row.classList.remove("eb-drop");
                    });
                });
            });

            el.querySelectorAll("[data-adv-row]").forEach((rowEl) => {
                rowEl.addEventListener("dragover", (e) => {
                    if (advDragFrom == null) return;
                    e.preventDefault();
                    rowEl.classList.add("eb-drop");
                });

                rowEl.addEventListener("dragleave", () => {
                    rowEl.classList.remove("eb-drop");
                });

                rowEl.addEventListener("drop", (e) => {
                    if (advDragFrom == null) return;
                    e.preventDefault();

                    const targetRow = e.target.closest("[data-adv-row]") || rowEl;
                    const toIdx = Number(targetRow.getAttribute("data-adv-index"));

                    el.querySelectorAll("[data-adv-row]").forEach((row) => {
                        row.classList.remove("eb-drop");
                    });

                    if (!Number.isInteger(toIdx) || toIdx < 0) return;
                    if (!Array.isArray(cmd.steps)) return;
                    if (advDragFrom < 0 || advDragFrom >= cmd.steps.length) return;
                    if (toIdx === advDragFrom) return;

                    const moved = cmd.steps.splice(advDragFrom, 1)[0];
                    if (!moved) return;

                    let insertIdx = toIdx;
                    if (advDragFrom < toIdx) {
                        insertIdx = toIdx - 1;
                    }

                    cmd.steps.splice(insertIdx, 0, moved);
                    advDragFrom = null;
                    rerenderAdvancedMove();
                });
            });

            el.querySelectorAll("[data-adv-row]").forEach((rowEl) => {
                rowEl.addEventListener("dragover", (e) => {
                    if (advDragFrom == null) return;
                    e.preventDefault();
                    rowEl.classList.add("eb-drop");
                });

                rowEl.addEventListener("dragleave", () => {
                    rowEl.classList.remove("eb-drop");
                });

                rowEl.addEventListener("drop", (e) => {
                    if (advDragFrom == null) return;
                    e.preventDefault();

                    const toIdx = Number(rowEl.getAttribute("data-adv-index"));
                    rowEl.classList.remove("eb-drop");

                    if (!Number.isInteger(toIdx) || toIdx < 0) return;
                    if (toIdx === advDragFrom) return;
                    if (!Array.isArray(cmd.steps)) return;
                    if (advDragFrom < 0 || advDragFrom >= cmd.steps.length) return;

                    const moved = cmd.steps.splice(advDragFrom, 1)[0];
                    if (!moved) return;

                    let insertIdx = toIdx;
                    if (advDragFrom < toIdx) {
                        insertIdx = toIdx - 1;
                    }

                    cmd.steps.splice(insertIdx, 0, moved);
                    advDragFrom = null;
                    rerenderAdvancedMove();
                });
            });

            el.querySelector("[data-act='adv-add-move']")?.addEventListener("click", () => {
                cmd.steps.push({ kind: "move", x: 0, y: 1 });
                rerenderAdvancedMove();
            });

            el.querySelector("[data-act='adv-add-pause']")?.addEventListener("click", () => {
                cmd.steps.push({ kind: "pause", dir: 2, ms: 1000 });
                rerenderAdvancedMove();
            });

            el.querySelectorAll("[data-act='adv-dup']").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const idx = Number(btn.getAttribute("data-adv-index"));
                    if (!Number.isInteger(idx) || idx < 0) return;
                    if (!cmd.steps[idx]) return;

                    const copy = JSON.parse(JSON.stringify(cmd.steps[idx]));
                    cmd.steps.splice(idx + 1, 0, copy);
                    rerenderAdvancedMove();
                });
            });

            el.querySelectorAll("[data-act='adv-remove']").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const idx = Number(btn.getAttribute("data-adv-index"));
                    if (!Number.isInteger(idx) || idx < 0) return;
                    if (idx >= cmd.steps.length) return;

                    cmd.steps.splice(idx, 1);
                    rerenderAdvancedMove();
                });
            });

            el.querySelectorAll("[data-adv-index][data-adv-k]").forEach((inp) => {
                const applyAdvancedValue = () => {
                    const idx = Number(inp.getAttribute("data-adv-index"));
                    const key = String(inp.getAttribute("data-adv-k") || "");
                    const kind = String(inp.getAttribute("data-adv-kind") || "move");

                    if (!Number.isInteger(idx) || idx < 0 || !key) return;

                    const row = cmd.steps[idx];
                    if (!row) return;

                    row.kind = kind;

                    if (kind === "pause") {
                        if (key === "dir") row.dir = numOr(inp.value, 2);
                        if (key === "ms") row.ms = numOr(inp.value, 1000);
                    } else {
                        if (key === "x") row.x = numOr(inp.value, 0);
                        if (key === "y") row.y = numOr(inp.value, 0);
                    }

                    scheduleAutosave();
                };

                inp.addEventListener("input", applyAdvancedValue);
                inp.addEventListener("change", applyAdvancedValue);
            });
        }

        const handle = el.querySelector(".eb-drag-handle");
        handle?.addEventListener("dragstart", (e) => {
            dragPayload = { kind: "cmd", from: draggableSpec };
            try {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", "cmd");
            } catch { }
        });

        handle?.addEventListener("dragend", () => {
            dragPayload = null;
        });

        return el;
    }


    function renderMapBtnHtml(cmd) {

        const t = (cmd?.type || "").toLowerCase();
        if (t !== "warp" && t !== "move") return "";
        return `<button class="btn eb-map" data-act="mapPick" type="button" title="Pick on map">🗺️</button>`;
    }

    function flatCmdsWithRefs() {
        const out = [];
        for (let i = 0; i < (state.cmds || []).length; i++) {
            const b = state.cmds[i];
            if (!b) continue;
            if (b.kind === "cmd") {
                out.push({ cmd: b.cmd, ref: { gIndex: null, cIndex: i } });
            } else if (b.kind === "group") {
                for (let j = 0; j < (b.items || []).length; j++) {
                    out.push({ cmd: b.items[j], ref: { gIndex: i, cIndex: j } });
                }
            }
        }
        return out;
    }

    function refEq(a, b) {
        return (a?.gIndex ?? null) === (b?.gIndex ?? null) && (a?.cIndex ?? null) === (b?.cIndex ?? null);
    }

    function getAllActorNames() {
        const list = [];
        for (const a of (state.actors || [])) {
            const name = (a?.name || a?.actor || "").toString().trim();
            if (name) list.push(name);
        }

        for (const { cmd } of flatCmdsWithRefs()) {
            const who = (cmd?.actor || "").toString().trim();
            if (who && !list.includes(who)) list.push(who);
        }
        return list;
    }

    function buildInitialPositions() {
        const pos = {};
        for (const a of (state.actors || [])) {
            const name = (a?.name || a?.actor || "").toString().trim();
            if (!name) continue;
            const x = parseInt(a?.x ?? "0", 10);
            const y = parseInt(a?.y ?? "0", 10);
            const dir = parseInt(a?.dir ?? "2", 10);
            pos[name] = {
                x: Number.isFinite(x) ? x : 0,
                y: Number.isFinite(y) ? y : 0,
                dir: Number.isFinite(dir) ? dir : 2,
            };
        }
        return pos;
    }

    function simulatePathsUpTo(targetRef) {
        const pos = buildInitialPositions();
        const path = {};
        const allActors = getAllActorNames();
        for (const n of allActors) {
            path[n] = [];
            if (!pos[n]) pos[n] = { x: 0, y: 0, dir: 2 };
            path[n].push({ x: pos[n].x, y: pos[n].y, kind: "start" });
        }

        const flat = flatCmdsWithRefs();
        for (const it of flat) {
            if (refEq(it.ref, targetRef)) break;

            const cmd = it.cmd;
            const type = (cmd?.type || "").toLowerCase();
            const who = (cmd?.actor || "").toString().trim();
            if (!who) continue;
            if (!pos[who]) {
                pos[who] = { x: 0, y: 0, dir: 2 };
                path[who] = [{ x: 0, y: 0, kind: "start" }];
            }

            if (type === "warp") {
                const x = parseInt(cmd?.x ?? "0", 10);
                const y = parseInt(cmd?.y ?? "0", 10);
                if (Number.isFinite(x) && Number.isFinite(y)) {
                    pos[who].x = x;
                    pos[who].y = y;
                    path[who].push({ x, y, kind: "warp" });
                }
            } else if (type === "move") {
                const mx = parseInt(cmd?.dx ?? "0", 10);
                const my = parseInt(cmd?.dy ?? "0", 10);
                const dir = parseInt(cmd?.dir ?? pos[who].dir, 10);

                if (Number.isFinite(mx) && Number.isFinite(my)) {
                    pos[who].x += mx;
                    pos[who].y += my;
                    if (Number.isFinite(dir)) pos[who].dir = dir;
                    path[who].push({ x: pos[who].x, y: pos[who].y, kind: "move" });
                }
            }
        }

        return { posByActor: pos, pathByActor: path };
    }


    //Calculates move/warp differences from previous positions
    function refreshMoveWarpSpotFields() {
        const host = $("ebCmds");
        if (!host) return;
        const pos = {};
        (state.actors || []).forEach(a => {
            const name = (a?.name || "").trim();
            if (!name) return;

            pos[name] = {
                x: parseInt(a?.x ?? "0", 10) || 0,
                y: parseInt(a?.y ?? "0", 10) || 0
            };
        });
        const flat = flatCmdsWithRefs();

        for (const it of flat) {
            const cmd = it.cmd;
            const type = (cmd?.type || "").toLowerCase();
            const actor = (cmd?.actor || "").trim();

            if (!actor) continue;
            if (!pos[actor]) pos[actor] = { x: 0, y: 0 };

            const lastX = pos[actor].x;
            const lastY = pos[actor].y;

            let newX = lastX;
            let newY = lastY;

            if (type === "warp") {
                const x = parseInt(cmd?.x ?? "0", 10);
                const y = parseInt(cmd?.y ?? "0", 10);

                if (Number.isFinite(x)) newX = x;
                if (Number.isFinite(y)) newY = y;
            }

            if (type === "move") {
                const dx = parseInt(cmd?.dx ?? "0", 10);
                const dy = parseInt(cmd?.dy ?? "0", 10);

                if (Number.isFinite(dx)) newX = lastX + dx;
                if (Number.isFinite(dy)) newY = lastY + dy;
            }

            const dropKey = (it.ref?.gIndex == null)
                ? `drop:t:${it.ref.cIndex}`
                : `drop:g:${it.ref.gIndex}:${it.ref.cIndex}`;

            const card = host.querySelector(`.eb-cmd-card[data-dropkey="${dropKey}"]`);
            if (card) {
                const lastEl = card.querySelector('[data-spot="last"]');
                const curEl = card.querySelector('[data-spot="cur"]');

                if (lastEl) lastEl.value = `(${lastX}, ${lastY})`;
                if (curEl) curEl.value = `(${newX}, ${newY})`;
            }

            pos[actor].x = newX;
            pos[actor].y = newY;
        }
    }

    function dirFromDelta(x, y) {
        if (x > 0) return 1; // right
        if (x < 0) return 3; // left
        if (y > 0) return 2; // down
        if (y < 0) return 0; // up
        return 2; // default down
    }

    function lockMoveAxis(dx, dy) {
        const adx = Math.abs(dx || 0);
        const ady = Math.abs(dy || 0);
        if (!adx && !ady) return { dx: 0, dy: 1, dir: 2 };
        if (adx >= ady) {
            const dir = dx >= 0 ? 1 : 3;
            return { dx: dx, dy: 0, dir };
        } else {
            const dir = dy >= 0 ? 2 : 0;
            return { dx: 0, dy: dy, dir };
        }
    }

    //Used to hide and show fields for command 'move'
    function clampInt(v, fallback = 0) {
        const n = parseInt(v ?? fallback, 10);
        return Number.isFinite(n) ? n : fallback;
    }

    function applyMoveDirRulesToCard(card) {
        if (!card) return;

        const type = (card.dataset?.cmdType || "").toLowerCase();
        if (type !== "move") return;

        const dirEl = card.querySelector('select[data-k="dir"]');
        const dxWrap = card.querySelector('[data-axis-wrap="dx"]');
        const dyWrap = card.querySelector('[data-axis-wrap="dy"]');
        const dxEl = card.querySelector('input[data-k="dx"]');
        const dyEl = card.querySelector('input[data-k="dy"]');

        if (!dirEl || !dxEl || !dyEl) return;

        const dir = String(dirEl.value ?? "2");

        let dx = clampInt(dxEl.value, 0);
        let dy = clampInt(dyEl.value, 0);
        dxEl.removeAttribute("min");
        dxEl.removeAttribute("max");
        dyEl.removeAttribute("min");
        dyEl.removeAttribute("max");
        dxEl.step = "1";
        dyEl.step = "1";

        if (dir === "0") {
            dx = 0;
            if (dy > 0) dy = 0;

            if (dxWrap) dxWrap.style.display = "none";
            if (dyWrap) dyWrap.style.display = "";

            dxEl.value = "0";
            dyEl.value = String(dy);
            dyEl.max = "0";
        }
        else if (dir === "1") {
            dy = 0;
            if (dx < 0) dx = 0;

            if (dxWrap) dxWrap.style.display = "";
            if (dyWrap) dyWrap.style.display = "none";

            dxEl.value = String(dx);
            dyEl.value = "0";
            dxEl.min = "0";
        }
        else if (dir === "2") {
            dx = 0;
            if (dy < 0) dy = 0;

            if (dxWrap) dxWrap.style.display = "none";
            if (dyWrap) dyWrap.style.display = "";

            dxEl.value = "0";
            dyEl.value = String(dy);
            dyEl.min = "0";
        }
        else if (dir === "3") {
            dy = 0;
            if (dx > 0) dx = 0;

            if (dxWrap) dxWrap.style.display = "";
            if (dyWrap) dyWrap.style.display = "none";

            dxEl.value = String(dx);
            dyEl.value = "0";
            dxEl.max = "0";
        }
    }

    function applyMoveDirRulesAll() {
        const host = $("ebCmds");
        if (!host) return;

        host.querySelectorAll(".eb-cmd-card").forEach(card => {
            applyMoveDirRulesToCard(card);
        });
    }

    function toCmdRef(spec) {
        if (!spec) return { gIndex: null, cIndex: null };
        if (spec.kind === "cmd") return { gIndex: null, cIndex: spec.cIndex };
        if (spec.kind === "groupItem") return { gIndex: spec.gIndex, cIndex: spec.index };

        return { gIndex: spec.gIndex ?? null, cIndex: spec.cIndex ?? spec.index ?? null };
    }

    async function openMapPickerForCmd(cmd, cmdRef) {
        const location = ($("ebLocation")?.value || "").trim();
        if (!location) {
            toast("Set a Location first (top of the Event Builder).", "warn");
            return;
        }

        const type = (cmd?.type || "").toLowerCase();

        const isViewportXY =
            type === "viewport" &&
            String(cmd?.viewportType || "").trim().toLowerCase() === "target" &&
            String(cmd?.targetType || "").trim().toLowerCase() === "xy";

        const supportsAbsoluteMapPick =
            type === "warp" ||
            type === "addobject" ||
            type === "addlantern" ||
            type === "addprop" ||
            type === "addfloorprop" ||
            type === "addbigprop" ||
            type === "addtemporaryactor" ||
            isViewportXY;

        const supportsMapPick =
            supportsAbsoluteMapPick ||
            type === "move";

        if (!supportsMapPick) return;

        let who = (cmd?.actor || "").toString().trim();

        const cardEl =
            (cmdRef && cmdRef.nodeType === 1)
                ? (cmdRef.closest?.(".eb-cmd-card") || cmdRef)
                : null;

        if (!who) {
            try {
                const actorInput = cardEl?.querySelector?.('input[data-k="actor"], select[data-k="actor"]') || null;
                const v = (actorInput?.value || "").toString().trim();
                if (v) {
                    who = v;
                    cmd.actor = v;
                }
            } catch { }
        }

        if (!who && type !== "addtemporaryactor") {
            who = "Abigail";
            cmd.actor = who;
        }

        function parseSpotText(v) {
            const s = String(v || "").trim();
            const m = /^\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/.exec(s);
            if (!m) return null;
            return { x: Number(m[1]), y: Number(m[2]) };
        }

        let initialLastSpot = null;
        let initialCurrentSpot = null;

        try {
            initialLastSpot = parseSpotText(
                cardEl?.querySelector?.('[data-spot="last"]')?.value || ""
            );
            initialCurrentSpot = parseSpotText(
                cardEl?.querySelector?.('[data-spot="cur"]')?.value || ""
            );
        } catch { }

        if (!initialLastSpot || !initialCurrentSpot) {
            const ref = toCmdRef(cmdRef);
            const sim = simulatePathsUpTo(ref);
            const prev = sim?.posByActor?.[who];

            if (!initialLastSpot && prev && Number.isFinite(prev.x) && Number.isFinite(prev.y)) {
                initialLastSpot = { x: prev.x, y: prev.y };
            }

            if (!initialCurrentSpot) {
                if (supportsAbsoluteMapPick) {
                    const x = parseInt(cmd?.x ?? "", 10);
                    const y = parseInt(cmd?.y ?? "", 10);
                    if (Number.isFinite(x) && Number.isFinite(y)) {
                        initialCurrentSpot = { x, y };
                    }
                } else if (type === "move" && initialLastSpot) {
                    const dx = parseInt(cmd?.dx ?? "0", 10);
                    const dy = parseInt(cmd?.dy ?? "0", 10);
                    if (Number.isFinite(dx) && Number.isFinite(dy)) {
                        initialCurrentSpot = {
                            x: initialLastSpot.x + dx,
                            y: initialLastSpot.y + dy
                        };
                    }
                }
            }

            if (!initialCurrentSpot && initialLastSpot) {
                initialCurrentSpot = { x: initialLastSpot.x, y: initialLastSpot.y };
            }
        }

        let file = "";
        try {
            const cap = await captureMapForPicker?.(location);
            if (cap?.ok) {
                file = (cap.url || cap.file || "").trim();
            }
        } catch { }

        if (!file) {
            toast("Couldn't capture map screenshot. Make sure the game is running and connected.", "bad");
            return;
        }

        const ref = toCmdRef(cmdRef);
        const sim = simulatePathsUpTo(ref);
        const actors = getAllActorNames();
        const token = getAuthTokenBestEffort();

        const modal = createMapPickerModal({
            title: `Pick ${type === "warp" ? "Warp" : type === "move" ? "Move" : "Position"} — ${location}`,
            file,
            token,
            mode: type,
            activeActor: who,
            actors,
            sim,
            initialLastSpot,
            initialCurrentSpot,
            onPick: ({ x, y }) => {
                if (supportsAbsoluteMapPick) {
                    cmd.x = String(x);
                    cmd.y = String(y);
                } else if (type === "move") {
                    const start = initialLastSpot || sim?.posByActor?.[who] || { x: 0, y: 0, dir: 2 };
                    const dx0 = x - (start.x ?? 0);
                    const dy0 = y - (start.y ?? 0);
                    const locked = lockMoveAxis(dx0, dy0);

                    cmd.dx = String(locked.dx);
                    cmd.dy = String(locked.dy);
                    cmd.dir = String(locked.dir);
                }

                closeModal();
                renderCmds();
                scheduleAutosave();
            }
        });

        openModal(modal);
    }
    function buildTextureMetaUrl(key) {
        const token = getAuthTokenBestEffort();
        const qs = new URLSearchParams();
        qs.set("key", key);
        if (token) qs.set("token", token);
        return `/api/v1/textures/meta?${qs.toString()}`;
    }

    function buildTextureImageUrl(key, opts = {}) {
        const token = getAuthTokenBestEffort();
        const qs = new URLSearchParams();
        qs.set("key", key);
        if (opts.grid) qs.set("grid", "true");
        if (token) qs.set("token", token);
        return `/api/v1/textures/image?${qs.toString()}`;
    }

    async function fetchTextureMeta(key) {
        const url = buildTextureMetaUrl(key);
        const res = await fetch(url, { cache: "no-store" });

        let json = null;
        try {
            json = await res.json();
        } catch { }

        if (!res.ok || !json?.ok) {
            throw new Error(json?.error || `http_${res.status}`);
        }

        return json;
    }

    //Modal picker for sprite images like for commands like addLatern
    function createTextureSpritePickerModal({
        title,
        imageUrl,
        tileWidth,
        tileHeight,
        columns,
        rows,
        initialIndex,
        onPick
    }) {
        const backdrop = document.createElement("div");
        backdrop.className = "eb-modal-backdrop";

        const modalEl = document.createElement("div");
        modalEl.className = "eb-modal";
        modalEl.style.width = "min(1400px, calc(100vw - 20px))";
        modalEl.style.maxWidth = "min(1400px, calc(100vw - 20px))";
        modalEl.style.maxHeight = "calc(100vh - 20px)";

        modalEl.innerHTML = `
      <div class="eb-modal-hdr" style="gap:12px; flex-wrap:wrap;">
        <div class="eb-modal-title">${escapeHtml(title || "Pick Sprite")}</div>

        <div class="muted small" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
          <div><b>Hover:</b> <span data-k="hoverIdx">—</span></div>
          <div><b>Selected:</b> <span data-k="selIdx">${Number.isFinite(initialIndex) ? initialIndex : "—"}</span></div>
          <div><b>Zoom:</b> <span data-k="zoomLbl">1x</span></div>
        </div>

        <div class="spacer"></div>
        <button class="btn" data-act="close" type="button">X</button>
      </div>

      <div class="eb-modal-body" style="display:flex; flex-direction:column; gap:10px;">
        <div data-k="viewport"
             style="width:100%; height:min(82vh, 1000px); overflow:auto; border:1px solid rgba(0,0,0,.18); border-radius:12px; background:rgba(0,0,0,.03);">
          <div data-k="stage" style="position:relative; display:inline-block; transform-origin: top left;">
            <img data-k="imgLoader"
                 alt="texture loader"
                 draggable="false"
                 style="position:absolute; left:0; top:0; opacity:0; pointer-events:none; user-select:none; -webkit-user-drag:none;" />
            <canvas data-k="canvas"
                    style="display:block; image-rendering:pixelated; cursor:crosshair; position:relative; z-index:1;"></canvas>
          </div>
        </div>

        <div class="muted small">
          Click a sprite to select it. <b>Ctrl/⌘ + mouse wheel</b> zooms. <b>Right-click + drag</b> pans.
        </div>
      </div>

      <div class="eb-modal-actions">
        <div class="muted small">Top-left sprite = index 0</div>
        <div class="spacer"></div>
        <button class="btn" data-act="close2" type="button">Close</button>
      </div>
    `;

        backdrop.appendChild(modalEl);

        const viewportEl = modalEl.querySelector("[data-k='viewport']");
        const stageEl = modalEl.querySelector("[data-k='stage']");
        const imgEl = modalEl.querySelector("[data-k='imgLoader']");
        const canvas = modalEl.querySelector("[data-k='canvas']");
        const hoverIdxEl = modalEl.querySelector("[data-k='hoverIdx']");
        const selIdxEl = modalEl.querySelector("[data-k='selIdx']");
        const zoomLblEl = modalEl.querySelector("[data-k='zoomLbl']");

        let ready = false;
        let naturalW = 0;
        let naturalH = 0;

        let hoverIndex = null;
        let selectedIndex = Number.isFinite(initialIndex) ? initialIndex : null;

        let zoom = 1;
        const zoomMin = 0.25;
        const zoomMax = 8;

        let panning = false;
        let panStartX = 0;
        let panStartY = 0;
        let panStartScrollL = 0;
        let panStartScrollT = 0;

        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

        const onWindowMouseUp = (e) => {
            if (e.button === 2) panning = false;
        };

        const onWindowMouseMove = (e) => {
            if (!panning || !viewportEl) return;
            viewportEl.scrollLeft = panStartScrollL - (e.clientX - panStartX);
            viewportEl.scrollTop = panStartScrollT - (e.clientY - panStartY);
            e.preventDefault();
        };

        const close = () => {
            window.removeEventListener("mouseup", onWindowMouseUp);
            window.removeEventListener("mousemove", onWindowMouseMove);
            ready = false;
            closeModal();
        };

        modalEl.querySelector("[data-act='close']")?.addEventListener("click", close);
        modalEl.querySelector("[data-act='close2']")?.addEventListener("click", close);
        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) close();
        });

        function applyZoom() {
            zoom = clamp(zoom, zoomMin, zoomMax);
            if (stageEl) stageEl.style.transform = `scale(${zoom})`;
            if (zoomLblEl) zoomLblEl.textContent = `${zoom.toFixed(2).replace(/\.00$/, "")}x`;
        }

        function getCellRect(idx) {
            if (!Number.isFinite(idx) || idx < 0) return null;

            const col = idx % columns;
            const row = Math.floor(idx / columns);

            if (col < 0 || row < 0 || col >= columns || row >= rows) return null;

            return {
                x: col * tileWidth,
                y: row * tileHeight,
                w: tileWidth,
                h: tileHeight
            };
        }

        function drawCell(ctx, idx, strokeStyle, fillStyle) {
            const r = getCellRect(idx);
            if (!r) return;

            ctx.save();
            if (fillStyle) {
                ctx.fillStyle = fillStyle;
                ctx.fillRect(r.x, r.y, r.w, r.h);
            }
            ctx.lineWidth = 2;
            ctx.strokeStyle = strokeStyle;
            ctx.strokeRect(r.x + 1, r.y + 1, Math.max(1, r.w - 2), Math.max(1, r.h - 2));
            ctx.restore();
        }

        function redrawCanvas() {


            if (!ready || !imgEl || !imgEl.complete) return;

            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(imgEl, 0, 0);

            if (hoverIndex !== null) {
                drawCell(ctx, hoverIndex, "rgba(255,255,255,0.95)", "rgba(255,255,255,0.10)");
            }

            if (selectedIndex !== null) {
                drawCell(ctx, selectedIndex, "rgba(255,215,0,1)", "rgba(255,215,0,0.15)");
            }
        }

        function getIndexFromEvent(ev) {
            if (!ready) return null;

            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return null;

            const px = ev.clientX - rect.left;
            const py = ev.clientY - rect.top;

            const sx = canvas.width / rect.width;
            const sy = canvas.height / rect.height;

            const cx = px * sx;
            const cy = py * sy;

            const col = Math.floor(cx / tileWidth);
            const row = Math.floor(cy / tileHeight);


            if (col < 0 || row < 0 || col >= columns || row >= rows) return null;
            return row * columns + col;
        }

        function setHover(idx) {
            hoverIndex = Number.isFinite(idx) ? idx : null;
            if (hoverIdxEl) hoverIdxEl.textContent = hoverIndex == null ? "—" : String(hoverIndex);
            redrawCanvas();
        }

        function setSelected(idx) {
            selectedIndex = Number.isFinite(idx) ? idx : null;
            if (selIdxEl) selIdxEl.textContent = selectedIndex == null ? "—" : String(selectedIndex);
            redrawCanvas();
        }

        function centerOnIndex(idx) {
            const r = getCellRect(idx);
            if (!r || !viewportEl) return;

            const cx = (r.x + r.w / 2) * zoom;
            const cy = (r.y + r.h / 2) * zoom;

            viewportEl.scrollLeft = Math.max(0, cx - viewportEl.clientWidth / 2);
            viewportEl.scrollTop = Math.max(0, cy - viewportEl.clientHeight / 2);
        }

        function zoomAtPointer(nextZoom, clientX, clientY) {
            if (!viewportEl || !stageEl) {
                zoom = nextZoom;
                applyZoom();
                return;
            }

            const prevZoom = zoom;
            zoom = clamp(nextZoom, zoomMin, zoomMax);

            const vr = viewportEl.getBoundingClientRect();
            const px = clientX - vr.left + viewportEl.scrollLeft;
            const py = clientY - vr.top + viewportEl.scrollTop;

            const ux = px / prevZoom;
            const uy = py / prevZoom;

            applyZoom();

            viewportEl.scrollLeft = ux * zoom - (clientX - vr.left);
            viewportEl.scrollTop = uy * zoom - (clientY - vr.top);
        }

        viewportEl?.addEventListener("contextmenu", (e) => e.preventDefault());

        viewportEl?.addEventListener("mousedown", (e) => {
            if (e.button !== 2) return;
            panning = true;
            panStartX = e.clientX;
            panStartY = e.clientY;
            panStartScrollL = viewportEl.scrollLeft;
            panStartScrollT = viewportEl.scrollTop;
            e.preventDefault();
        });

        window.addEventListener("mouseup", onWindowMouseUp);
        window.addEventListener("mousemove", onWindowMouseMove, { passive: false });

        viewportEl?.addEventListener("wheel", (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();

            const factor = e.deltaY < 0 ? 1.10 : (1 / 1.10);
            zoomAtPointer(zoom * factor, e.clientX, e.clientY);
        }, { passive: false });

        canvas.addEventListener("mousemove", (ev) => {
            if (panning || !ready) return;
            setHover(getIndexFromEvent(ev));
        });

        canvas.addEventListener("mouseleave", () => {
            if (panning) return;
            setHover(null);
        });

        canvas.addEventListener("click", (ev) => {
            if (panning || !ready) return;

            const idx = getIndexFromEvent(ev);
            if (idx == null) return;

            setSelected(idx);
            onPick?.(idx);
            close();
        });

        imgEl.onload = () => {
            console.log("[TextureSpritePicker] img.onload fired", {
                src: imgEl.src,
                complete: imgEl.complete,
                naturalWidth: imgEl.naturalWidth,
                naturalHeight: imgEl.naturalHeight,
                width: imgEl.width,
                height: imgEl.height
            });

            naturalW = imgEl.naturalWidth || imgEl.width || 0;
            naturalH = imgEl.naturalHeight || imgEl.height || 0;


            if (!naturalW || !naturalH) {
                toast("Sprite picker failed", "Texture image loaded with zero size.", "error");
                return;
            }

            imgEl.style.width = `${naturalW}px`;
            imgEl.style.height = `${naturalH}px`;

            canvas.width = naturalW;
            canvas.height = naturalH;
            canvas.style.width = `${naturalW}px`;
            canvas.style.height = `${naturalH}px`;

            if (stageEl) {
                stageEl.style.width = `${naturalW}px`;
                stageEl.style.height = `${naturalH}px`;
            }

            ready = true;

            applyZoom();
            redrawCanvas();

            if (selectedIndex !== null) {

                centerOnIndex(selectedIndex);
            }
        };

        imgEl.onerror = (ev) => {
            console.error("[TextureSpritePicker] img.onerror fired", {
                src: imgEl.src,
                event: ev
            });
            toast("Sprite picker failed", "Could not load texture image.", "error");
        };


        imgEl.src = imageUrl;


        return backdrop;
    }





    async function openTextureSpritePickerForCmd(cmd, opts) {
        try {
            const {
                textureKey,
                title,
                valueField = "spriteIndex",
                fallbackTileWidth = 16,
                fallbackTileHeight = 16
            } = opts || {};

            const meta = await fetchTextureMeta(textureKey);
            const imageUrl = buildTextureImageUrl(textureKey, { grid: true });
            const initialIndex = parseInt(cmd?.[valueField] ?? "", 10);

            const modal = createTextureSpritePickerModal({
                title: title || "Pick Sprite",
                imageUrl,
                tileWidth: Number(meta.tileWidth || fallbackTileWidth),
                tileHeight: Number(meta.tileHeight || fallbackTileHeight),
                columns: Number(meta.columns || 1),
                rows: Number(meta.rows || 1),
                initialIndex: Number.isFinite(initialIndex) ? initialIndex : null,
                onPick: (idx) => {
                    cmd[valueField] = String(idx);
                    renderCmds();
                    scheduleAutosave();
                }
            });

            openModal(modal);
        } catch (e) {
            console.error("[TextureSpritePicker] failed", e);
            toast("Sprite picker failed", "Could not load texture.", "error");
        }
    }


    //other pickers

    async function openSimpleMapPicker(opts = {}) {
        const location = String(opts.location || ($("ebLocation")?.value || "")).trim();
        if (!location) {
            toast("Set a Location first (top of the Event Builder).", "warn");
            return;
        }

        let file = "";
        try {
            const cap = await captureMapForPicker?.(location);

            if (cap?.ok) {
                file = (cap.url || cap.file || "").trim();
            }


        } catch (e) {

        }

        if (!file) {
            toast("Couldn't capture map screenshot. Make sure the game is running and connected.", "bad");
            return;
        }

        const token = getAuthTokenBestEffort();

        const modal = createMapPickerModal({
            title: opts.title || "Pick Map Position",
            file,
            token,
            mode: "warp",
            activeActor: "",
            actors: [],
            sim: { posByActor: {}, pathByActor: {} },

            initialLastSpot:
                Number.isFinite(Number(opts.initialX)) && Number.isFinite(Number(opts.initialY))
                    ? { x: Number(opts.initialX), y: Number(opts.initialY) }
                    : null,

            initialCurrentSpot:
                Number.isFinite(Number(opts.initialX)) && Number.isFinite(Number(opts.initialY))
                    ? { x: Number(opts.initialX), y: Number(opts.initialY) }
                    : null,

            onPick: ({ x, y }) => {
                try {
                    opts.onPick?.({ x, y, location });
                } catch (e) {

                }

                closeModal();
            }
        });

        openModal(modal);
    }
    function _stripExt(name) {
        return (name || "").replace(/\.(png|jpg|jpeg|gif)$/i, "");
    }

    function _withToken(url, token) {
        const t = (token || "").trim();
        if (!t) return url;
        if (url.includes("token=")) return url;
        return url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(t);
    }

    async function _tryFetchImageBlob(url) {
        try {
            const res = await fetch(url, { method: "GET", cache: "no-store" });
            if (!res.ok) return null;

            const ct = (res.headers.get("content-type") || "").toLowerCase();
            if (!ct.startsWith("image/") && ct !== "application/octet-stream") {

            }

            const blob = await res.blob();
            if (!blob || !blob.size) return null;
            return blob;
        } catch {
            return null;
        }
    }

    /**
     * Loads a screenshot into an <img> element by probing several endpoints.
     * Returns { ok:true, revoke() } or { ok:false }.
     */
    async function loadScreenshotIntoImg(imgEl, fileName, token) {
        if (!imgEl) return { ok: false };

        const file = (fileName || "").trim();
        if (!file) return { ok: false };

        const fileNoExt = _stripExt(file);

        try {
            const prev = imgEl.dataset._objUrl;
            if (prev) URL.revokeObjectURL(prev);
            imgEl.dataset._objUrl = "";
        } catch { }

        const candidates = [
            `/api/v1/screenshots/file?file=${encodeURIComponent(file)}`,
            `/api/v1/screenshots/file?file=${encodeURIComponent(fileNoExt)}`,

            `/api/v1/screenshots/file?name=${encodeURIComponent(file)}`,
            `/api/v1/screenshots/file?name=${encodeURIComponent(fileNoExt)}`,

            `/api/v1/screenshots/image?file=${encodeURIComponent(file)}`,
            `/api/v1/screenshots/image?file=${encodeURIComponent(fileNoExt)}`,

            `/api/v1/screenshots/get?file=${encodeURIComponent(file)}`,
            `/api/v1/screenshots/get?file=${encodeURIComponent(fileNoExt)}`,

            `/${encodeURIComponent(file)}`,
            `/screenshots/${encodeURIComponent(file)}`,
            `/workspace/${encodeURIComponent(file)}`,
            `/workspace/screenshots/${encodeURIComponent(file)}`
        ].map(u => _withToken(u, token));

        for (const url of candidates) {
            const ok = await new Promise(resolve => {
                const testImg = new Image();

                testImg.onload = () => resolve(true);
                testImg.onerror = () => resolve(false);

                testImg.src = url;
            });

            if (ok) {

                imgEl.onload = () => {

                };

                imgEl.src = url;

                return {
                    ok: true,
                    revoke: () => { }
                };
            }
        }

        console.warn("MapPicker failed to load screenshot:", file);

        return { ok: false };
    }



    function createMapPickerModal({ title, file, token, mode, activeActor, actors, sim, initialLastSpot, initialCurrentSpot, onPick }) {
        const TILE_SIZE_PX = 64;

        const backdrop = document.createElement("div");
        backdrop.className = "eb-modal-backdrop";

        const modalEl = document.createElement("div");
        modalEl.className = "eb-modal eb-map-picker";
        modalEl.innerHTML = `
    <div class="eb-modal-hdr" style="gap:12px; flex-wrap:wrap;">
      <div class="eb-modal-title">${escapeHtml(title || "Map Picker")}</div>

      <div class="muted small" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <div style="display:flex; gap:6px; align-items:center;">
          <span style="font-weight:800;">Actor:</span>
          <span data-k="actorLbl">${escapeHtml(activeActor || "")}</span>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <span style="font-weight:800;">Hover:</span>
          <span data-k="hoverLbl">—</span>
        </div>
      </div>

      <div class="spacer"></div>
      <button class="btn" data-act="close" type="button" title="Close">X</button>
    </div>

    <div class="eb-modal-body" style="display:flex; flex-direction:column; gap:10px;">
      <div class="eb-map-viewport" data-k="viewport"
           style="width:100%; height:min(76vh, 900px); overflow:auto; border:1px solid rgba(0,0,0,.18); border-radius:12px; background:rgba(0,0,0,.03);">
        <div class="eb-map-stage" data-k="stage" style="transform-origin: top left;">
          <canvas data-k="canvas" style="display:block; image-rendering:pixelated;"></canvas>
        </div>
      </div>

      <div class="muted small">
        Click to select a tile.
        ${mode === "move"
                ? "Move will auto-fill dx/dy and dir (0 up, 1 right, 2 down, 3 left)."
                : "Warp fills x/y (absolute)."}
        <br/>
        Tip: <b>Ctrl/⌘ + mouse wheel</b> zooms the map. <b>Right-click + drag</b> pans. Scrollbars also work.
      </div>
    </div>

    <div class="eb-modal-actions">
      <div class="muted small">Ctrl/⌘+wheel zoom • Right-drag pan</div>
      <div class="spacer"></div>
      <button class="btn" data-act="close2" type="button">Close</button>
    </div>
    `;

        backdrop.appendChild(modalEl);
        let _bmp = null;
        let _bmpW = 0, _bmpH = 0;
        let _ready = false;

        const close = () => {
            try { if (_bmp && typeof _bmp.close === "function") _bmp.close(); } catch { }
            _bmp = null; _bmpW = 0; _bmpH = 0;
            _ready = false;
            closeModal();
        };

        modalEl.querySelector("[data-act='close']")?.addEventListener("click", close);
        modalEl.querySelector("[data-act='close2']")?.addEventListener("click", close);
        backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

        const canvas = modalEl.querySelector("[data-k='canvas']");
        const viewportEl = modalEl.querySelector("[data-k='viewport']");
        const stageEl = modalEl.querySelector("[data-k='stage']");
        const hoverLbl = modalEl.querySelector("[data-k='hoverLbl']");

        let _panning = false;
        let _panStartX = 0, _panStartY = 0;
        let _panStartScrollL = 0, _panStartScrollT = 0;

        function endPan() { _panning = false; }

        viewportEl?.addEventListener("contextmenu", (e) => e.preventDefault());
        viewportEl?.addEventListener("mousedown", (e) => {
            if (e.button !== 2) return;
            _panning = true;
            _panStartX = e.clientX;
            _panStartY = e.clientY;
            _panStartScrollL = viewportEl.scrollLeft;
            _panStartScrollT = viewportEl.scrollTop;
            e.preventDefault();
        });

        window.addEventListener("mouseup", (e) => { if (e.button === 2) endPan(); });
        window.addEventListener("mousemove", (e) => {
            if (!_panning || !viewportEl) return;
            viewportEl.scrollLeft = _panStartScrollL - (e.clientX - _panStartX);
            viewportEl.scrollTop = _panStartScrollT - (e.clientY - _panStartY);
            e.preventDefault();
        }, { passive: false });

        let _zoom = 1;
        const _zoomMin = 0.25;
        const _zoomMax = 6;
        const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

        function applyZoom() {
            _zoom = clamp(_zoom, _zoomMin, _zoomMax);
            if (stageEl) stageEl.style.transform = `scale(${_zoom})`;
        }

        function zoomAtPointer(nextZoom, clientX, clientY) {
            if (!viewportEl || !stageEl) { _zoom = nextZoom; applyZoom(); return; }

            const prevZoom = _zoom;
            _zoom = clamp(nextZoom, _zoomMin, _zoomMax);

            const vr = viewportEl.getBoundingClientRect();
            const px = clientX - vr.left + viewportEl.scrollLeft;
            const py = clientY - vr.top + viewportEl.scrollTop;

            const ux = px / prevZoom;
            const uy = py / prevZoom;

            applyZoom();

            viewportEl.scrollLeft = ux * _zoom - (clientX - vr.left);
            viewportEl.scrollTop = uy * _zoom - (clientY - vr.top);
        }

        viewportEl?.addEventListener("wheel", (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.10 : (1 / 1.10);
            zoomAtPointer(_zoom * factor, e.clientX, e.clientY);
        }, { passive: false });

        applyZoom();

        function getTileFromEvent(ev) {
            const r = canvas.getBoundingClientRect();
            const px = ev.clientX - r.left;
            const py = ev.clientY - r.top;

            const sx = canvas.width / r.width;
            const sy = canvas.height / r.height;

            const cx = px * sx;
            const cy = py * sy;

            return { x: Math.floor(cx / TILE_SIZE_PX), y: Math.floor(cy / TILE_SIZE_PX) };
        }

        let pickerLastSpot = null;
        let pickerCurrentSpot = null;

        function seedPickerSpots() {
            if (
                initialLastSpot &&
                Number.isFinite(initialLastSpot.x) &&
                Number.isFinite(initialLastSpot.y)
            ) {
                pickerLastSpot = { x: initialLastSpot.x, y: initialLastSpot.y };
            } else {
                pickerLastSpot = null;
            }

            if (
                initialCurrentSpot &&
                Number.isFinite(initialCurrentSpot.x) &&
                Number.isFinite(initialCurrentSpot.y)
            ) {
                pickerCurrentSpot = { x: initialCurrentSpot.x, y: initialCurrentSpot.y };
            } else if (pickerLastSpot) {
                pickerCurrentSpot = { x: pickerLastSpot.x, y: pickerLastSpot.y };
            } else {
                pickerCurrentSpot = null;
            }
        }

        function drawSpotOverlay(ctx, tileX, tileY, fill, stroke) {
            if (!ctx) return;
            if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return;

            const px = tileX * TILE_SIZE_PX;
            const py = tileY * TILE_SIZE_PX;

            ctx.save();
            ctx.fillStyle = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 3;
            ctx.fillRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);
            ctx.strokeRect(px + 1.5, py + 1.5, TILE_SIZE_PX - 3, TILE_SIZE_PX - 3);
            ctx.restore();
        }

        function redrawPickerCanvas() {
            if (!_ready || !_bmp) return;

            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(_bmp, 0, 0);
            if (pickerLastSpot) {
                drawSpotOverlay(
                    ctx,
                    pickerLastSpot.x,
                    pickerLastSpot.y,
                    "rgba(245, 158, 11, 0.28)",
                    "rgba(217, 119, 6, 0.95)"
                );
            }
            if (pickerCurrentSpot) {
                drawSpotOverlay(
                    ctx,
                    pickerCurrentSpot.x,
                    pickerCurrentSpot.y,
                    "rgba(34, 197, 94, 0.24)",
                    "rgba(22, 163, 74, 0.95)"
                );
            }
        }

        canvas.addEventListener("mousemove", (ev) => {
            if (!_ready) return;
            const t = getTileFromEvent(ev);
            if (hoverLbl) hoverLbl.textContent = `tile (${t.x}, ${t.y})`;
        });

        canvas.addEventListener("mouseleave", () => {
            if (hoverLbl) hoverLbl.textContent = "—";
        });

        canvas.addEventListener("click", (ev) => {
            if (!_ready) return;
            const t = getTileFromEvent(ev);

            pickerCurrentSpot = { x: t.x, y: t.y };
            redrawPickerCanvas();

            onPick?.({ x: t.x, y: t.y });
        });

        function _cleanFileName(raw) {
            const s = (raw || "").trim();
            if (!s) return "";
            if (s.startsWith("http://") || s.startsWith("https://")) {
                try {
                    const u = new URL(s);
                    const name = u.searchParams.get("name");
                    if (name) return name.trim();
                    const parts = u.pathname.split("/");
                    return (parts[parts.length - 1] || "").trim();
                } catch {
                    return s.split("/").pop()?.trim() || "";
                }
            }
            if (s.includes("/") || s.includes("\\")) {
                const norm = s.replace(/\\/g, "/");
                return (norm.split("/").pop() || "").trim();
            }
            return s;
        }

        function _withToken(url, tokenVal) {
            const t = (tokenVal || "").trim();
            if (!t) return url;
            if (/[?&]token=/.test(url)) return url;
            return url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(t);
        }

        async function _tryFetchBlob(url) {
            const tokenHdr = (token || "").trim();
            const ctrl = new AbortController();
            const tId = setTimeout(() => { try { ctrl.abort(); } catch { } }, 8000);

            try {
                const res = await fetch(url, {
                    method: "GET",
                    cache: "no-store",
                    signal: ctrl.signal,
                    headers: tokenHdr ? { "X-Devtools-Token": tokenHdr } : undefined
                });
                if (!res.ok) return null;

                const ab = await res.arrayBuffer();
                if (!ab || ab.byteLength === 0) return null;

                const ct = res.headers.get("content-type") || "application/octet-stream";
                return new Blob([ab], { type: ct });
            } catch {
                return null;
            } finally {
                clearTimeout(tId);
            }
        }

        async function loadScreenshot() {
            const name = _cleanFileName(file);
            if (!name) {
                toast("Failed to load screenshot image (missing file).", "bad");
                return;
            }

            const rel = `/api/v1/screenshots/file?name=${encodeURIComponent(name)}`;
            const candidates = [_withToken(rel, token), rel];

            let blob = null;
            for (const u of candidates) {
                blob = await _tryFetchBlob(u);
                if (blob) break;
            }
            if (!blob) {
                toast("Failed to load screenshot image.", "bad");
                return;
            }

            try {
                try { if (_bmp && typeof _bmp.close === "function") _bmp.close(); } catch { }
                _bmp = null; _bmpW = 0; _bmpH = 0;
                _ready = false;

                const bmp = await createImageBitmap(blob);
                _bmp = bmp;
                _bmpW = bmp.width || 0;
                _bmpH = bmp.height || 0;

                if (!_bmpW || !_bmpH) {
                    toast("Screenshot decoded but has zero size.", "bad");
                    return;
                }

                canvas.width = _bmpW;
                canvas.height = _bmpH;

                if (stageEl) {
                    stageEl.style.width = `${_bmpW}px`;
                    stageEl.style.height = `${_bmpH}px`;
                }
                applyZoom();

                seedPickerSpots();

                _ready = true;
                redrawPickerCanvas();
            } catch (err) {
                console.error("MapPicker bitmap decode failed:", err);
                toast("Failed to decode screenshot image.", "bad");
            }
        }

        loadScreenshot().catch(() => { });

        return backdrop;
    }



    function buildImageCandidates(file, token) {
        const origin = window.location.origin;
        const f = (file || "").replace(/^\//, "");
        const t = (token || "").trim();

        const list = [];
        if (!f) return list;
        if (/^https?:\/\//i.test(file)) {
            list.push(file);
            return list;
        }
        list.push(`${origin}/${f}`);
        list.push(`${origin}/workspace/${f}`);
        if (!f.toLowerCase().startsWith("screenshots/")) {
            list.push(`${origin}/screenshots/${f}`);
            list.push(`${origin}/workspace/screenshots/${f}`);
        }
        if (t) {
            const enc = encodeURIComponent(f);
            list.push(`${origin}/api/v1/screenshots/file?file=${enc}&token=${encodeURIComponent(t)}`);
            list.push(`${origin}/api/v1/screenshots/get?file=${enc}&token=${encodeURIComponent(t)}`);
            list.push(`${origin}/api/v1/screenshots/image?file=${enc}&token=${encodeURIComponent(t)}`);
        }

        return list;
    }

    function renderCmds() {
        const host = $("ebCmds");
        if (!host) return;
        host.innerHTML = "";

        state.cmds = normalizeCmdBlocks(state.cmds);

        const numbering = computeFlatNumbering();

        const ungroupZone = document.createElement("div");
        ungroupZone.className = "eb-dropzone";
        ungroupZone.dataset.dropkey = "zone:top";
        ungroupZone.innerHTML = `
      <div class="muted small" style="padding:8px 10px;">
        Drop here to ungroup (top-level)
      </div>
    `;
        host.appendChild(ungroupZone);

        ungroupZone.addEventListener("dragover", (e) => {
            if (!dragPayload) return;
            if (dragPayload.kind !== "cmd") return;
            e.preventDefault();
            setDropUi(host, "zone:top");
        });
        ungroupZone.addEventListener("dragleave", () => {
            if (dragOverKey === "zone:top") clearDragUi(host);
        });
        ungroupZone.addEventListener("drop", (e) => {
            e.preventDefault();
            clearDragUi(host);

            if (!dragPayload || dragPayload.kind !== "cmd") return;

            const from = dragPayload.from;
            const to = { gIndex: null, cIndex: state.cmds.length };
            moveCmdBetween(from, to);

            renderCmds();
            scheduleAutosave();
        });

        state.cmds.forEach((b, topIndex) => {
            if (!b) return;

            if (b.kind === "cmd") {
                const cmd = b.cmd;

                const card = renderCmdCard({
                    cmd,
                    number: numbering.get(`t:${topIndex}`) || "",
                    dragKey: `drop:t:${topIndex}`,
                    onInput: (meta) => {
                        if (meta?.rerender) {
                            renderCmds();
                            return;
                        }
                        scheduleAutosave();
                    },
                    onDel: () => {
                        state.cmds.splice(topIndex, 1);
                        renderCmds();
                        scheduleAutosave();
                    },
                    onDup: () => {
                        const copy = cloneCommandWithNewId ? cloneCommandWithNewId(cmd) : structuredClone(cmd);
                        state.cmds.splice(topIndex + 1, 0, { kind: "cmd", cmd: copy });
                        renderCmds();
                        scheduleAutosave();
                    },
                    draggableSpec: { gIndex: null, cIndex: topIndex },
                });

                card.addEventListener("dragover", (e) => {
                    if (!dragPayload) return;
                    e.preventDefault();
                    setDropUi(host, `drop:t:${topIndex}`);
                });
                card.addEventListener("dragleave", () => {
                    if (dragOverKey === `drop:t:${topIndex}`) clearDragUi(host);
                });
                card.addEventListener("drop", (e) => {
                    e.preventDefault();
                    clearDragUi(host);

                    if (!dragPayload) return;

                    if (dragPayload.kind === "group") {
                        const fromIdx = dragPayload.from.gIndex;
                        if (typeof fromIdx !== "number") return;
                        const toIdx = fromIdx < topIndex ? topIndex - 1 : topIndex;
                        moveGroup(fromIdx, toIdx);
                    } else if (dragPayload.kind === "cmd") {
                        const from = dragPayload.from;
                        const to = { gIndex: null, cIndex: topIndex };
                        if (from.gIndex == null && from.cIndex < topIndex) to.cIndex = topIndex - 1;
                        moveCmdBetween(from, to);
                    }

                    renderCmds();
                    scheduleAutosave();
                });

                host.appendChild(card);
                return;
            }

            if (b.kind === "group") {
                const g = b;

                const groupWrap = document.createElement("div");
                groupWrap.className = "eb-group";

                const groupCard = document.createElement("div");
                groupCard.className = "card";
                groupCard.style.borderRadius = "12px";
                groupCard.style.overflow = "hidden";
                groupCard.dataset.dropkey = `drop:group:${topIndex}`;

                groupCard.innerHTML = `
                  <div class="card-body eb-card-row eb-group-hdr" style="padding:8px 10px;">
                    <div class="row eb-row eb-row-compact" style="width:100%; align-items:flex-end; gap:6px 8px; flex-wrap:nowrap;">
                      <button class="btn eb-drag-handle eb-group-drag" type="button" title="Drag group to reorder" draggable="true">≡</button>

                      <button class="btn eb-group-toggle" type="button" title="Collapse/expand">${g.collapsed ? "▸" : "▾"}</button>

                      <div class="field eb-group-name" style="min-width:170px; flex:0 1 200px;">
                        <label>Name</label>
                        <input class="text" type="text" value="${escapeHtml(g.name || "Group")}" data-k="gname" />
                      </div>

                      <div class="field eb-group-desc" style="min-width:180px; flex:1 1 240px;">
                        <label>Desc</label>
                        <input class="text" type="text" value="${escapeHtml(g.description || "")}" data-k="gdesc"
                               placeholder="group note" style="width:100%;" />
                      </div>

                      <div class="field eb-group-addcmd" style="min-width:220px; flex:1 1 300px;">
                        <label>Add Cmd</label>
                        <div class="row eb-row" style="gap:6px; flex-wrap:nowrap;">
                          <input class="text" type="text" list="eb-dl-cmds" autocomplete="off"
                                 data-k="groupCmdType"
                                 placeholder="type to search..."
                                 style="min-width:140px; flex:1 1 auto; max-width:none;" />
                          <button class="btn" data-act="addCmdToGroup" type="button">Add</button>
                        </div>
                      </div>

                      <div class="spacer"></div>

                      <div class="eb-row-actions" style="margin-left:0;">
                        <button class="btn" data-act="saveGroupPreset" type="button" title="Save as preset">💾</button>
                        <button class="btn" data-act="dupGroup" type="button" title="Duplicate group">⎘</button>
                        <button class="btn danger" data-act="delGroup" type="button" title="Delete group and all commands">X</button>
                      </div>
                    </div>
                  </div>
                `;

                groupCard.querySelector("[data-k='gname']")?.addEventListener("input", (e) => {
                    g.name = e.target.value;
                    scheduleAutosave();
                });

                groupCard.querySelector("[data-k='gdesc']")?.addEventListener("input", (e) => {
                    g.description = e.target.value;
                    scheduleAutosave();
                });

                const groupCmdInput = groupCard.querySelector("[data-k='groupCmdType']");
                const addCmdToGroup = () => {
                    const raw = String(groupCmdInput?.value || "").trim();
                    if (!raw) {
                        toast("Missing command", "Choose a command to add.", "error");
                        return;
                    }

                    const choice = (getCommandChoices?.() || []).find(c =>
                        String(c?.name || "").toLowerCase() === raw.toLowerCase()
                    );

                    const cmdType = choice?.name || raw;
                    const newCmd = { type: cmdType };

                    if (cmdType === "addTemporaryActor") {
                        newCmd.actorKind = "Character";
                        newCmd.assetName = "";
                        newCmd.spriteAssetName = "";
                        newCmd.spriteWidth = 16;
                        newCmd.spriteHeight = 32;
                        newCmd.x = 0;
                        newCmd.y = 0;
                        newCmd.direction = 2;
                        newCmd.breather = "true";
                        newCmd.overrideName = "";
                    }


                    if (cmdType === "attachCharacterToTempSprite") {
                        newCmd.actor = "Abigail";
                    }

                    if (cmdType === "changeLocation") {
                        newCmd.location = "";
                    }

                    if (cmdType === "extendSourceRect") {
                        newCmd.actor = "Abigail";
                        newCmd.mode = "";
                    }

                    if (cmdType === "fade") {
                        newCmd.arg = "";
                    }

                    if (cmdType === "stopAnimation") {
                        newCmd.actor = "farmer";
                    }

                    if (cmdType === "advancedMove") {
                        newCmd.actor = "Abigail";
                        newCmd.loop = "true";
                        newCmd.steps = [];
                    }

                    if (typeof normalizeCmdBlocks === "function") {
                        const temp = [{ kind: "cmd", cmd: newCmd }];
                        normalizeCmdBlocks(temp);
                        if (temp[0]?.cmd) {
                            g.items.push(temp[0].cmd);
                        } else {
                            g.items.push(newCmd);
                        }
                    } else {
                        g.items.push(newCmd);
                    }

                    if (groupCmdInput) groupCmdInput.value = "";
                    renderCmds();
                    scheduleAutosave();
                };

                groupCard.querySelector("[data-act='addCmdToGroup']")?.addEventListener("click", addCmdToGroup);

                groupCmdInput?.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        addCmdToGroup();
                    }
                });

                groupCard.querySelector(".eb-group-toggle")?.addEventListener("click", () => {
                    g.collapsed = !g.collapsed;
                    renderCmds();
                    scheduleAutosave();
                });


                groupCard.querySelector("[data-act='saveGroupPreset']")?.addEventListener("click", async () => {
                    const modal = createSavePresetModal(g, async (data) => {
                        const mergedPresets = Array.isArray(getAllPresetsMerged?.())
                            ? structuredClone(getAllPresetsMerged())
                            : [];

                        const presets = mergedPresets.filter((p) => !p?.builtIn);

                        const id = `user_${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

                        const preset = {
                            id,
                            name: data.name,
                            description: data.description,
                            imageDataUrl: data.imageDataUrl || "",
                            items: (g.items || []).map((c) => structuredClone(c)),
                        };

                        const idx = presets.findIndex((p) => String(p?.id) === id);
                        if (idx >= 0) presets[idx] = preset;
                        else presets.push(preset);

                        const tomb = loadGroupPresetTombstones();
                        if (tomb.has(id)) {
                            tomb.delete(id);
                            saveGroupPresetTombstones(tomb);
                        }

                        saveGroupPresets?.(presets);
                        setServerGroupPresetsCache?.(structuredClone(presets));

                        try {
                            await saveGroupPresetsToServer?.(presets);

                            if (preset.imageDataUrl) {
                                await saveGroupPresetImageToServer?.(preset.id, preset.imageDataUrl);
                            }
                        } catch { }

                        toast("Saved", `Preset saved: ${preset.name}`, "info");
                    });

                    openModal(modal);
                });

                groupCard.querySelector("[data-act='dupGroup']")?.addEventListener("click", () => {
                    const copy = structuredClone(g);
                    copy.id = makeId("grp");
                    copy.name = `${copy.name || "Group"} (copy)`;
                    copy.items = assignFreshIdsToCommands ? assignFreshIdsToCommands(copy.items || []) : (copy.items || []).map((c) => structuredClone(c));
                    state.cmds.splice(topIndex + 1, 0, copy);
                    renderCmds();
                    scheduleAutosave();
                });

                groupCard.querySelector("[data-act='delGroup']")?.addEventListener("click", () => {
                    state.cmds.splice(topIndex, 1);
                    renderCmds();
                    scheduleAutosave();
                });

                const gHandle = groupCard.querySelector(".eb-group-drag");
                gHandle.addEventListener("dragstart", (e) => {
                    dragPayload = { kind: "group", from: { gIndex: topIndex } };
                    try {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", "group");
                    } catch { }
                });
                gHandle.addEventListener("dragend", () => {
                    dragPayload = null;
                });

                groupCard.addEventListener("dragover", (e) => {
                    if (!dragPayload) return;
                    e.preventDefault();
                    setDropUi(host, `drop:group:${topIndex}`);
                });
                groupCard.addEventListener("dragleave", () => {
                    if (dragOverKey === `drop:group:${topIndex}`) clearDragUi(host);
                });
                groupCard.addEventListener("drop", (e) => {
                    e.preventDefault();
                    clearDragUi(host);

                    if (!dragPayload) return;

                    if (dragPayload.kind === "group") {
                        const fromIdx = dragPayload.from.gIndex;
                        if (typeof fromIdx !== "number") return;
                        const toIdx = fromIdx < topIndex ? topIndex - 1 : topIndex;
                        moveGroup(fromIdx, toIdx);
                        renderCmds();
                        scheduleAutosave();
                        return;
                    }

                    if (dragPayload.kind === "cmd") {
                        const from = dragPayload.from;
                        let to = { gIndex: topIndex, cIndex: g.items.length };
                        to = adjustToAfterRemoval(from, to);
                        moveCmdBetween(from, to);
                        renderCmds();
                        scheduleAutosave();
                        return;
                    }
                });

                groupWrap.appendChild(groupCard);

                const itemsWrap = document.createElement("div");
                itemsWrap.className = "eb-group-items";
                itemsWrap.style.display = g.collapsed ? "none" : "block";

                const endZone = document.createElement("div");
                endZone.className = "eb-dropzone";
                endZone.dataset.dropkey = `zone:groupEnd:${topIndex}`;
                endZone.innerHTML = `<div class="muted small" style="padding:8px 10px;">Drop to append to group</div>`;

                endZone.addEventListener("dragover", (e) => {
                    if (!dragPayload) return;
                    if (dragPayload.kind !== "cmd") return;
                    e.preventDefault();
                    setDropUi(host, `zone:groupEnd:${topIndex}`);
                });
                endZone.addEventListener("dragleave", () => {
                    if (dragOverKey === `zone:groupEnd:${topIndex}`) clearDragUi(host);
                });
                endZone.addEventListener("drop", (e) => {
                    e.preventDefault();
                    clearDragUi(host);

                    if (!dragPayload || dragPayload.kind !== "cmd") return;

                    const from = dragPayload.from;
                    let to = { gIndex: topIndex, cIndex: g.items.length };
                    to = adjustToAfterRemoval(from, to);
                    moveCmdBetween(from, to);

                    renderCmds();
                    scheduleAutosave();
                });

                g.items.forEach((cmd, itemIndex) => {
                    const card = renderCmdCard({
                        cmd,
                        number: numbering.get(`g:${topIndex}:${itemIndex}`) || "",
                        dragKey: `drop:g:${topIndex}:${itemIndex}`,
                        onInput: (meta) => {
                            if (meta?.rerender) {
                                renderCmds();
                                return;
                            }
                            scheduleAutosave();
                        },
                        onDel: () => {
                            g.items.splice(itemIndex, 1);
                            renderCmds();
                            scheduleAutosave();
                        },
                        onDup: () => {
                            const copy = cloneCommandWithNewId ? cloneCommandWithNewId(cmd) : structuredClone(cmd);
                            g.items.splice(itemIndex + 1, 0, copy);
                            renderCmds();
                            scheduleAutosave();
                        },
                        draggableSpec: { gIndex: topIndex, cIndex: itemIndex },
                    });

                    card.addEventListener("dragover", (e) => {
                        if (!dragPayload) return;
                        if (dragPayload.kind !== "cmd") return;
                        e.preventDefault();
                        setDropUi(host, `drop:g:${topIndex}:${itemIndex}`);
                    });
                    card.addEventListener("dragleave", () => {
                        if (dragOverKey === `drop:g:${topIndex}:${itemIndex}`) clearDragUi(host);
                    });
                    card.addEventListener("drop", (e) => {
                        e.preventDefault();
                        clearDragUi(host);

                        if (!dragPayload || dragPayload.kind !== "cmd") return;

                        const from = dragPayload.from;
                        let to = { gIndex: topIndex, cIndex: itemIndex };

                        if (from.gIndex === topIndex && from.cIndex < itemIndex) {
                            to.cIndex = itemIndex - 1;
                        }

                        to = adjustToAfterRemoval(from, to);

                        moveCmdBetween(from, to);

                        renderCmds();
                        scheduleAutosave();
                    });

                    itemsWrap.appendChild(card);
                });

                itemsWrap.appendChild(endZone);
                groupWrap.appendChild(itemsWrap);

                host.appendChild(groupWrap);
            }


        });
        applyMoveDirRulesAll();
        refreshMoveWarpSpotFields();
        host.addEventListener("dragend", () => clearDragUi(host), { once: true });


    }

    function renderAll() {
        refreshDatalists();
        renderActors();
        renderConds();
        renderCmds();
    }
    function loadCollapsedMap(COLLAPSE_KEY) {
        try {
            const raw = localStorage.getItem(COLLAPSE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    function screenshotFileUrl(name, token) {
        const n = encodeURIComponent(name || "");
        const t = encodeURIComponent(token || "");
        return `/api/v1/screenshots/file?name=${n}${t ? `&token=${t}` : ""}`;
    }

    function saveCollapsedMap(COLLAPSE_KEY, map) {
        try {
            localStorage.setItem(COLLAPSE_KEY, JSON.stringify(map || {}));
        } catch { }
    }

    function wireSectionToggles(COLLAPSE_KEY) {
        const root = elById("eventBuilder");
        if (!root) return;

        const collapsed = loadCollapsedMap(COLLAPSE_KEY);

        root.querySelectorAll(".card").forEach((card, idx) => {
            const hdr = card.querySelector(":scope > .card-hdr");
            const body = card.querySelector(":scope > .card-body");
            if (!hdr || !body) return;

            const key = `${(hdr.textContent || "").trim()}#${idx}`;

            if (collapsed[key] === true) card.dataset.collapsed = "true";

            hdr.addEventListener("click", (e) => {
                const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "";
                if (tag === "button" || tag === "input" || tag === "select" || tag === "textarea") return;

                const now = card.dataset.collapsed !== "true";
                card.dataset.collapsed = now ? "true" : "false";
                collapsed[key] = card.dataset.collapsed === "true";
                saveCollapsedMap(COLLAPSE_KEY, collapsed);
            });
        });
    }

    function markAddBars() {
        try {
            const t = elById("ebCondType");
            if (t) {
                const row = t.closest(".row.eb-row");
                if (row) row.classList.add("eb-addbar");
            }
        } catch { }

        try {
            const t = elById("ebCmdType");
            if (t) {
                const row = t.closest(".row.eb-row");
                if (row) row.classList.add("eb-addbar");
            }
        } catch { }
    }

    return {
        openModal,
        closeModal,
        createGroupPickerModal,
        createSavePresetModal,
        createServerLoadModal,
        createProjectEventListModal,
        createCmdDropdown,
        openSimpleMapPicker,
        renderActors,
        renderConds,
        renderCmds,
        renderAll,

        wireSectionToggles,
        markAddBars,
    };



}