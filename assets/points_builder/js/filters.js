export function initFilterSystem(ctx) {
    const {
        KIND,
        showToast,
        elCardsRoot,
        deepClone,
        findNodeContextById,
        renderCards,
        rebuildPreviewAndKotlin,
        renderParamsEditors
    } = ctx || {};

    const FILTER_STORAGE_KEY = "pb_root_filter_v2";
    const FILTER_SCOPE_ROOT = "root";
    const filterScopes = new Map(); // scopeId -> { mode, kinds:Set, search:string }
    let rootFilterLoaded = false;

    function loadRootFilter() {
        try {
            const raw = localStorage.getItem(FILTER_STORAGE_KEY);
            if (raw) {
                const obj = JSON.parse(raw);
                const mode = (obj && obj.mode === "exclude") ? "exclude" : "include";
                const kinds = new Set(Array.isArray(obj?.kinds) ? obj.kinds : []);
                return { mode, kinds, search: "" };
            }
        } catch {}
        return { mode: "include", kinds: new Set(), search: "" };
    }

    function getFilterScope(scopeId) {
        const key = scopeId || FILTER_SCOPE_ROOT;
        let scope = filterScopes.get(key);
        if (!scope) {
            if (key === FILTER_SCOPE_ROOT && !rootFilterLoaded) {
                scope = loadRootFilter();
                rootFilterLoaded = true;
            } else {
                scope = { mode: "include", kinds: new Set(), search: "" };
            }
            filterScopes.set(key, scope);
        }
        return scope;
    }

    function saveRootFilter() {
        try {
            const scope = getFilterScope(null);
            const out = { mode: scope.mode, kinds: Array.from(scope.kinds || []) };
            localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(out));
        } catch {}
    }

    function isFilterActive(scopeId) {
        const scope = getFilterScope(scopeId);
        return scope.kinds && scope.kinds.size > 0;
    }

    function filterAllows(node, scopeId) {
        if (!node) return false;
        if (!isFilterActive(scopeId)) return true;
        const scope = getFilterScope(scopeId);
        const hit = scope.kinds.has(node.kind);
        return scope.mode === "include" ? hit : !hit;
    }

    function getVisibleEntries(list, scopeId) {
        const arr = list || [];
        const out = [];
        for (let i = 0; i < arr.length; i++) {
            const n = arr[i];
            if (!n) continue;
            if (filterAllows(n, scopeId)) out.push({ node: n, index: i });
        }
        return out;
    }

    function getVisibleIndices(list, scopeId) {
        return getVisibleEntries(list, scopeId).map(it => it.index);
    }

    function swapInList(list, i, j) {
        if (!Array.isArray(list)) return;
        if (i < 0 || j < 0 || i >= list.length || j >= list.length || i === j) return;
        const tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
    }

    function findVisibleSwapIndex(fromIndex, mode, list, scopeId) {
        const visible = getVisibleIndices(list, scopeId);
        if (!visible.length) return -1;
        const pos = visible.indexOf(fromIndex);
        if (pos < 0) return -1;
        if (mode === "prev") return visible[pos - 1] ?? -1;
        if (mode === "next") return visible[pos + 1] ?? -1;
        if (mode === "top") return visible[0];
        if (mode === "bottom") return visible[visible.length - 1];
        return -1;
    }

    let filterPortal = null;
    let activeFilterMenu = null;
    let filterMenuBound = false;

    function getFilterPortal() {
        if (filterPortal) return filterPortal;
        filterPortal = document.createElement("div");
        filterPortal.className = "filter-portal";
        document.body.appendChild(filterPortal);
        return filterPortal;
    }

    function positionFilterMenu(menu, anchor) {
        if (!menu || !anchor) return;
        const rect = anchor.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        menu.style.left = "-9999px";
        menu.style.top = "-9999px";
        const mRect = menu.getBoundingClientRect();
        const gap = 6;
        let left = rect.left;
        let top = rect.bottom + gap;
        if (left + mRect.width > vw - 8) left = Math.max(8, vw - mRect.width - 8);
        if (top + mRect.height > vh - 8) {
            const up = rect.top - mRect.height - gap;
            if (up >= 8) top = up;
        }
        menu.style.left = `${Math.max(8, left)}px`;
        menu.style.top = `${Math.max(8, top)}px`;
    }

    function closeAllFilterMenus() {
        document.querySelectorAll(".filter-menu.open").forEach((menu) => {
            menu.classList.remove("open");
            if (menu.__pbWrap) menu.__pbWrap.classList.remove("open");
        });
        activeFilterMenu = null;
    }

    function openFilterMenu(wrap, menu, anchor) {
        if (!menu) return;
        if (menu.classList.contains("open")) {
            closeAllFilterMenus();
            return;
        }
        closeAllFilterMenus();
        wrap && wrap.classList.add("open");
        menu.classList.add("open");
        positionFilterMenu(menu, anchor);
        activeFilterMenu = { menu, anchor, wrap };
    }

    function updateActiveFilterMenuPosition() {
        if (!activeFilterMenu) return;
        positionFilterMenu(activeFilterMenu.menu, activeFilterMenu.anchor);
    }

    function bindGlobalFilterClose() {
        if (filterMenuBound) return;
        filterMenuBound = true;
        document.addEventListener("click", () => closeAllFilterMenus());
        window.addEventListener("resize", () => updateActiveFilterMenuPosition());
        window.addEventListener("scroll", () => updateActiveFilterMenuPosition(), true);
    }

    function cleanupFilterMenus() {
        document.querySelectorAll(".filter-menu").forEach((menu) => {
            const wrap = menu.__pbWrap;
            if (wrap && wrap.isConnected) return;
            if (activeFilterMenu && activeFilterMenu.menu === menu) {
                activeFilterMenu = null;
            }
            if (menu.parentElement) menu.parentElement.removeChild(menu);
        });
    }

    function buildFilterKindEntries() {
        return Object.entries(KIND || {})
            .filter(([kind]) => kind !== "ROOT")
            .map(([kind, def]) => ({
                kind,
                title: def?.title || kind,
                desc: def?.desc || ""
            }))
            .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
    }

    function createFilterControls(scopeId, onChange, small = true) {
        const scope = getFilterScope(scopeId);
        const wrap = document.createElement("div");
        wrap.className = "filter-wrap";
        const filterBtn = document.createElement("button");
        filterBtn.className = small ? "btn small" : "btn";
        filterBtn.textContent = "过滤器";
        wrap.appendChild(filterBtn);

        const menu = document.createElement("div");
        menu.className = "filter-menu";

        const searchRow = document.createElement("div");
        searchRow.className = "filter-search-row";
        const searchInput = document.createElement("input");
        searchInput.className = "input filter-search";
        searchInput.placeholder = "搜索卡片类型";
        searchInput.value = scope.search || "";
        searchRow.appendChild(searchInput);
        menu.appendChild(searchRow);

        const modeRow = document.createElement("div");
        modeRow.className = "mode";
        const modeLabel = document.createElement("span");
        modeLabel.textContent = "模式";
        const modeSelect = document.createElement("select");
        modeSelect.className = "input filter-select";
        const optInclude = document.createElement("option");
        optInclude.value = "include";
        optInclude.textContent = "只显示所选";
        const optExclude = document.createElement("option");
        optExclude.value = "exclude";
        optExclude.textContent = "屏蔽所选";
        modeSelect.appendChild(optInclude);
        modeSelect.appendChild(optExclude);
        modeSelect.value = scope.mode;
        modeRow.appendChild(modeLabel);
        modeRow.appendChild(modeSelect);
        menu.appendChild(modeRow);

        const list = document.createElement("div");
        list.className = "filter-list";
        const entries = buildFilterKindEntries();
        const checkboxByKind = new Map();
        const labelByKind = new Map();
        for (const it of entries) {
            const label = document.createElement("label");
            label.className = "filter-item";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = scope.kinds.has(it.kind);
            cb.addEventListener("change", () => {
                if (cb.checked) scope.kinds.add(it.kind);
                else scope.kinds.delete(it.kind);
                handleFilterChange();
            });
            checkboxByKind.set(it.kind, cb);
            labelByKind.set(it.kind, label);
            const text = document.createElement("span");
            text.textContent = it.title;
            label.dataset.searchText = `${it.title} ${it.kind} ${it.desc}`.toLowerCase();
            label.appendChild(cb);
            label.appendChild(text);
            list.appendChild(label);
        }
        menu.appendChild(list);

        const actions = document.createElement("div");
        actions.className = "filter-actions";
        const clearBtn = document.createElement("button");
        clearBtn.className = "btn small";
        clearBtn.textContent = "清空";
        clearBtn.addEventListener("click", () => {
            scope.kinds.clear();
            checkboxByKind.forEach(cb => { cb.checked = false; });
            handleFilterChange();
        });
        actions.appendChild(clearBtn);
        menu.appendChild(actions);

        const portal = getFilterPortal();
        portal.appendChild(menu);
        menu.classList.add("floating");
        menu.__pbWrap = wrap;
        menu.__pbAnchor = filterBtn;

        function updateFilterButtonState() {
            filterBtn.classList.toggle("primary", isFilterActive(scopeId));
        }

        function applySearchFilter() {
            const q = (scope.search || "").trim().toLowerCase();
            for (const label of labelByKind.values()) {
                if (!q) {
                    label.style.display = "";
                } else {
                    const hay = label.dataset.searchText || "";
                    label.style.display = hay.includes(q) ? "" : "none";
                }
            }
        }

        function handleFilterChange() {
            if (scopeId === null) saveRootFilter();
            updateFilterButtonState();
            if (typeof onChange === "function") onChange();
        }

        modeSelect.addEventListener("change", () => {
            scope.mode = modeSelect.value === "exclude" ? "exclude" : "include";
            handleFilterChange();
        });

        searchInput.addEventListener("input", () => {
            scope.search = searchInput.value || "";
            applySearchFilter();
        });

        updateFilterButtonState();
        applySearchFilter();

        filterBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            openFilterMenu(wrap, menu, filterBtn);
        });
        menu.addEventListener("click", (e) => e.stopPropagation());
        bindGlobalFilterClose();

        return { wrap, updateFilterButtonState, applySearchFilter };
    }

    // -------------------------
    // 参数同步（独立于过滤器）
    // -------------------------
    const paramSync = {
        open: false,
        kind: null,
        selectedIds: new Set(),
        snapshots: new Map(),
        wrap: null,
        menu: null,
        list: null,
        editor: null,
        hint: null,
        anchor: null
    };

    let activeSyncMenu = null;
    let syncMenuBound = false;

    function positionSyncMenu(menu, anchor) {
        if (!menu || !anchor) return;
        const rect = anchor.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        menu.style.left = "-9999px";
        menu.style.top = "-9999px";
        const mRect = menu.getBoundingClientRect();
        const gap = 6;
        let left = rect.left;
        let top = rect.bottom + gap;
        if (left + mRect.width > vw - 8) left = Math.max(8, vw - mRect.width - 8);
        if (top + mRect.height > vh - 8) {
            const up = rect.top - mRect.height - gap;
            if (up >= 8) top = up;
        }
        menu.style.left = `${Math.max(8, left)}px`;
        menu.style.top = `${Math.max(8, top)}px`;
    }

    function closeSyncMenu() {
        if (paramSync.menu) paramSync.menu.classList.remove("open");
        if (paramSync.wrap) paramSync.wrap.classList.remove("open");
        activeSyncMenu = null;
    }

    function openSyncMenu(wrap, menu, anchor) {
        if (!menu) return;
        if (menu.classList.contains("open")) {
            closeSyncMenu();
            return;
        }
        closeSyncMenu();
        wrap && wrap.classList.add("open");
        menu.classList.add("open");
        positionSyncMenu(menu, anchor);
        activeSyncMenu = { menu, anchor, wrap };
    }

    function updateActiveSyncMenuPosition() {
        if (!activeSyncMenu) return;
        positionSyncMenu(activeSyncMenu.menu, activeSyncMenu.anchor);
    }

    function bindGlobalSyncClose() {
        if (syncMenuBound) return;
        syncMenuBound = true;
        document.addEventListener("click", () => closeSyncMenu());
        window.addEventListener("resize", () => updateActiveSyncMenuPosition());
        window.addEventListener("scroll", () => updateActiveSyncMenuPosition(), true);
    }

    function isSyncSelectableEvent(ev) {
        if (!paramSync.open) return false;
        if (!ev) return true;
        const t = ev.target;
        if (!t) return true;
        if (t.closest && t.closest(".card-actions")) return false;
        if (t.closest && t.closest(".handle")) return false;
        if (t.closest && t.closest("button, input, select, textarea, .iconbtn")) return false;
        return true;
    }

    function updateSyncCardUI(id) {
        if (!elCardsRoot || !id) return;
        const el = elCardsRoot.querySelector(`.card[data-id="${id}"]`);
        if (el) el.classList.toggle("sync-target", paramSync.selectedIds.has(id));
    }

    function getSyncNodes() {
        const out = [];
        const remove = [];
        for (const id of paramSync.selectedIds) {
            const ctx = findNodeContextById && findNodeContextById(id);
            if (!ctx || !ctx.node) {
                remove.push(id);
                continue;
            }
            if (paramSync.kind && ctx.node.kind !== paramSync.kind) {
                remove.push(id);
                continue;
            }
            out.push(ctx.node);
        }
        for (const id of remove) {
            paramSync.selectedIds.delete(id);
            paramSync.snapshots.delete(id);
        }
        if (!out.length) {
            paramSync.kind = null;
        } else if (!paramSync.kind) {
            paramSync.kind = out[0].kind;
        }
        return out;
    }

    function setSyncMenuOpen(open) {
        paramSync.open = !!open;
        if (paramSync.open) {
            openSyncMenu(paramSync.wrap, paramSync.menu, paramSync.anchor);
            renderSyncMenu();
        } else {
            closeSyncMenu();
        }
    }

    function toggleSyncMenu() {
        setSyncMenuOpen(!paramSync.open);
    }

    function clearSyncTargets() {
        const ids = Array.from(paramSync.selectedIds);
        paramSync.selectedIds.clear();
        paramSync.snapshots.clear();
        paramSync.kind = null;
        ids.forEach(updateSyncCardUI);
        renderSyncMenu();
    }

    function addSyncTarget(node) {
        if (!node || !node.id) return;
        if (!paramSync.kind) paramSync.kind = node.kind;
        if (node.kind !== paramSync.kind) {
            showToast && showToast("只能添加相同类型的卡片", "info");
            return;
        }
        if (paramSync.selectedIds.has(node.id)) return;
        paramSync.selectedIds.add(node.id);
        paramSync.snapshots.set(node.id, deepClone ? deepClone(node.params || {}) : JSON.parse(JSON.stringify(node.params || {})));
        updateSyncCardUI(node.id);
        renderSyncMenu();
    }

    function removeSyncTarget(id) {
        if (!id) return;
        if (!paramSync.selectedIds.has(id)) return;
        paramSync.selectedIds.delete(id);
        paramSync.snapshots.delete(id);
        updateSyncCardUI(id);
        if (paramSync.selectedIds.size === 0) paramSync.kind = null;
        renderSyncMenu();
    }

    function toggleSyncTarget(node) {
        if (!node || !node.id) return;
        if (paramSync.selectedIds.has(node.id)) removeSyncTarget(node.id);
        else addSyncTarget(node);
    }

    function diffParams(prev, next) {
        const diffs = [];
        const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
        const isArr = (v) => Array.isArray(v);
        const walk = (p, n, path) => {
            if (isObj(p) && isObj(n)) {
                const keys = new Set([...Object.keys(p), ...Object.keys(n)]);
                for (const k of keys) {
                    walk(p[k], n[k], path.concat(k));
                }
                return;
            }
            if (isArr(p) || isArr(n)) {
                if (JSON.stringify(p) !== JSON.stringify(n)) {
                    diffs.push({ path, value: deepClone ? deepClone(n) : JSON.parse(JSON.stringify(n)) });
                }
                return;
            }
            if (p !== n) diffs.push({ path, value: n });
        };
        walk(prev || {}, next || {}, []);
        return diffs;
    }

    function applyParamDiff(obj, diffs) {
        if (!obj || !diffs || !diffs.length) return;
        for (const d of diffs) {
            const path = d.path || [];
            if (!path.length) continue;
            let cur = obj;
            for (let i = 0; i < path.length - 1; i++) {
                const k = path[i];
                if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
                cur = cur[k];
            }
            cur[path[path.length - 1]] = deepClone ? deepClone(d.value) : JSON.parse(JSON.stringify(d.value));
        }
    }

    function syncFromNodeId(sourceId) {
        if (!sourceId || !paramSync.selectedIds.has(sourceId)) return;
        const ctxNode = findNodeContextById && findNodeContextById(sourceId);
        if (!ctxNode || !ctxNode.node) return;
        if (paramSync.kind && ctxNode.node.kind !== paramSync.kind) return;

        const prev = paramSync.snapshots.get(sourceId) || {};
        const diff = diffParams(prev, ctxNode.node.params || {});
        if (!diff.length) return;

        let changed = false;
        const nodes = getSyncNodes();
        for (const n of nodes) {
            if (!n || n.id === sourceId) continue;
            if (!n.params) n.params = {};
            applyParamDiff(n.params, diff);
            changed = true;
        }

        for (const n of nodes) {
            if (!n) continue;
            paramSync.snapshots.set(n.id, deepClone ? deepClone(n.params || {}) : JSON.parse(JSON.stringify(n.params || {})));
        }

        if (changed) {
            if (typeof renderCards === "function") renderCards();
            if (typeof rebuildPreviewAndKotlin === "function") rebuildPreviewAndKotlin();
        }
    }

    function renderSyncMenu() {
        if (!paramSync.menu || !paramSync.list || !paramSync.editor) return;
        const nodes = getSyncNodes();
        paramSync.list.innerHTML = "";
        paramSync.editor.innerHTML = "";

        if (!nodes.length) {
            const empty = document.createElement("div");
            empty.className = "sync-empty";
            empty.textContent = "还没有选择卡片";
            paramSync.list.appendChild(empty);
            const hint = document.createElement("div");
            hint.className = "sync-empty";
            hint.textContent = "打开后点击卡片加入";
            paramSync.editor.appendChild(hint);
            return;
        }

        const kindDef = (KIND && KIND[paramSync.kind]) || {};
        const kindTitle = kindDef.title || paramSync.kind || "未命名";
        const kindBadge = document.createElement("div");
        kindBadge.className = "sync-kind";
        kindBadge.textContent = `${kindTitle}（${nodes.length}）`;
        paramSync.list.appendChild(kindBadge);

        for (const n of nodes) {
            if (!paramSync.snapshots.has(n.id)) {
                paramSync.snapshots.set(n.id, deepClone ? deepClone(n.params || {}) : JSON.parse(JSON.stringify(n.params || {})));
            }
            const item = document.createElement("div");
            item.className = "sync-item";
            const title = document.createElement("div");
            title.className = "sync-item-title";
            const ctxNode = findNodeContextById && findNodeContextById(n.id);
            const idx = ctxNode ? (ctxNode.index + 1) : "";
            title.textContent = idx ? `${kindTitle} #${idx}` : kindTitle;
            const remove = document.createElement("button");
            remove.className = "iconbtn";
            remove.textContent = "✕";
            remove.title = "移除";
            remove.addEventListener("click", () => removeSyncTarget(n.id));
            item.appendChild(title);
            item.appendChild(remove);
            paramSync.list.appendChild(item);
        }

        const editorWrap = document.createElement("div");
        editorWrap.className = "sync-editor-inner";
        editorWrap.dataset.syncSourceId = nodes[0].id;
        if (typeof renderParamsEditors === "function") {
            renderParamsEditors(editorWrap, nodes[0], "参数同步", { paramsOnly: true });
        }
        const onSync = () => syncFromNodeId(nodes[0].id);
        editorWrap.addEventListener("input", onSync);
        editorWrap.addEventListener("change", onSync);
        paramSync.editor.appendChild(editorWrap);

        if (paramSync.menu && paramSync.anchor && paramSync.menu.classList.contains("open")) {
            positionSyncMenu(paramSync.menu, paramSync.anchor);
        }
    }

    function createParamSyncControls() {
        const wrap = document.createElement("div");
        wrap.className = "sync-wrap";
        const btn = document.createElement("button");
        btn.className = "btn small";
        btn.textContent = "参数同步";
        const menu = document.createElement("div");
        menu.className = "sync-menu";
        const hint = document.createElement("div");
        hint.className = "sync-hint";
        hint.textContent = "打开后点击卡片加入/移除（同类型）";
        const list = document.createElement("div");
        list.className = "sync-list";
        const editor = document.createElement("div");
        editor.className = "sync-editor";
        const actions = document.createElement("div");
        actions.className = "sync-actions";
        const clearBtn = document.createElement("button");
        clearBtn.className = "btn small";
        clearBtn.textContent = "清空";
        clearBtn.addEventListener("click", clearSyncTargets);
        const closeBtn = document.createElement("button");
        closeBtn.className = "btn small";
        closeBtn.textContent = "关闭";
        closeBtn.addEventListener("click", () => setSyncMenuOpen(false));
        actions.appendChild(clearBtn);
        actions.appendChild(closeBtn);

        menu.appendChild(hint);
        menu.appendChild(list);
        menu.appendChild(editor);
        menu.appendChild(actions);

        wrap.appendChild(btn);

        const portal = getFilterPortal();
        portal.appendChild(menu);
        menu.classList.add("floating");
        menu.__pbWrap = wrap;
        menu.__pbAnchor = btn;

        paramSync.wrap = wrap;
        paramSync.menu = menu;
        paramSync.list = list;
        paramSync.editor = editor;
        paramSync.hint = hint;
        paramSync.anchor = btn;

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleSyncMenu();
        });
        menu.addEventListener("click", (e) => e.stopPropagation());
        bindGlobalSyncClose();

        return { wrap };
    }

    function bindParamSyncListeners() {
        if (!elCardsRoot || elCardsRoot.__pbParamSync) return;
        elCardsRoot.__pbParamSync = true;
        const handler = (e) => {
            const target = e.target;
            const card = target && target.closest ? target.closest(".card") : null;
            if (!card) return;
            const id = card.dataset.id;
            if (!id) return;
            if (!paramSync.selectedIds.has(id)) return;
            syncFromNodeId(id);
        };
        elCardsRoot.addEventListener("input", handler);
        elCardsRoot.addEventListener("change", handler);
    }

    return {
        getFilterScope,
        saveRootFilter,
        isFilterActive,
        filterAllows,
        getVisibleEntries,
        getVisibleIndices,
        swapInList,
        findVisibleSwapIndex,
        cleanupFilterMenus,
        createFilterControls,
        createParamSyncControls,
        renderSyncMenu,
        bindParamSyncListeners,
        isSyncSelectableEvent,
        toggleSyncTarget,
        updateSyncCardUI,
        syncFromNodeId,
        paramSync
    };
}
