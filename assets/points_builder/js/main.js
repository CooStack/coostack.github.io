import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import { createCardInputs, initCardSystem } from "./cards.js";
import { initFilterSystem } from "./filters.js";
import { initHotkeysSystem } from "./hotkeys.js";
import { createKindDefs } from "./kinds.js";
import { createBuilderTools } from "./builder.js";
import { initLayoutSystem } from "./layout.js";
import { createNodeHelpers } from "./nodes.js";
import { toggleFullscreen } from "./viewer.js";
import {
    sanitizeFileBase,
    loadProjectName,
    saveProjectName,
    loadKotlinEndMode,
    saveKotlinEndMode,
    loadAutoState,
    saveAutoState,
    downloadText
} from "./io.js";

(function () {
    const U = globalThis.Utils;
    if (!U) throw new Error("Utils 未加载：请确认 utils.js 在 main.js 之前加载，且 utils.js 内部设置了 globalThis.Utils");

    // -------------------------
    // DOM
    // -------------------------
    const elCardsRoot = document.getElementById("cardsRoot");
    const elKotlinOut = document.getElementById("kotlinOut");

    // 用户要求：右侧 Kotlin 代码栏只读（可复制，不可编辑）
    if (elKotlinOut && elKotlinOut.tagName === "TEXTAREA") {
        try { elKotlinOut.readOnly = true; } catch {}
        try { elKotlinOut.setAttribute("readonly", ""); } catch {}
    }

    const btnAddCard = document.getElementById("btnAddCard");
    const btnQuickOffset = document.getElementById("btnQuickOffset");
    const btnPickLine = document.getElementById("btnPickLine");
    const pickPointBtns = Array.from(document.querySelectorAll("#btnPickPoint"));
    const btnPickPoint = pickPointBtns[0] || null;
    if (pickPointBtns.length > 1) {
        for (let i = 1; i < pickPointBtns.length; i++) {
            try { pickPointBtns[i].remove(); } catch {}
        }
    }
    const btnHotkeys = document.getElementById("btnHotkeys");
    const btnFullscreen = document.getElementById("btnFullscreen");

    const btnExportKotlin = document.getElementById("btnExportKotlin");
    const btnToggleKotlin = document.getElementById("btnToggleKotlin");
    const btnCopyKotlin = document.getElementById("btnCopyKotlin");
    const btnDownloadKotlin = document.getElementById("btnDownloadKotlin");
    const btnCopyKotlin2 = document.getElementById("btnCopyKotlin2");
    const btnExportKotlin2 = document.getElementById("btnExportKotlin2");
    const btnDownloadKotlin2 = document.getElementById("btnDownloadKotlin2");
    const selKotlinEnd = document.getElementById("selKotlinEnd");

    const btnSaveJson = document.getElementById("btnSaveJson");
    const btnLoadJson = document.getElementById("btnLoadJson");
    const fileJson = document.getElementById("fileJson");
    const fileBuilderJson = document.getElementById("fileBuilderJson");
    const btnReset = document.getElementById("btnReset");
    const inpProjectName = document.getElementById("inpProjectName");
    let builderJsonTargetNode = null;

    const modal = document.getElementById("modal");
    const modalMask = document.getElementById("modalMask");
    const btnCloseModal = document.getElementById("btnCloseModal");
    const btnCancelModal = document.getElementById("btnCancelModal");
    const cardPicker = document.getElementById("cardPicker");
    const cardSearch = document.getElementById("cardSearch");

    // -------------------------
    // Hotkeys DOM
    // -------------------------
    const hkModal = document.getElementById("hkModal");
    const hkMask = document.getElementById("hkMask");
    const hkSearch = document.getElementById("hkSearch");
    const hkList = document.getElementById("hkList");
    const hkHint = document.getElementById("hkHint");
    const btnCloseHotkeys = document.getElementById("btnCloseHotkeys");
    const btnCloseHotkeys2 = document.getElementById("btnCloseHotkeys2");
    const btnHotkeysReset = document.getElementById("btnHotkeysReset");
    const btnHotkeysExport = document.getElementById("btnHotkeysExport");
    const btnHotkeysImport = document.getElementById("btnHotkeysImport");
    const fileHotkeys = document.getElementById("fileHotkeys");

    const threeHost = document.getElementById("threeHost");
    const chkAxes = document.getElementById("chkAxes");
    const chkGrid = document.getElementById("chkGrid");
    const btnResetCamera = document.getElementById("btnResetCamera");
    const chkSnapGrid = document.getElementById("chkSnapGrid");
    const chkSnapParticle = document.getElementById("chkSnapParticle");
    const selSnapPlane = document.getElementById("selSnapPlane");
    const selMirrorPlane = document.getElementById("selMirrorPlane");
    const inpPointSize = document.getElementById("inpPointSize");
    const inpSnapStep = document.getElementById("inpSnapStep");
    const statusLinePick = document.getElementById("statusLinePick");
    const statusPoints = document.getElementById("statusPoints");

    const layoutEl = document.querySelector(".layout");
    const panelLeft = document.querySelector(".panel.left");
    const panelRight = document.querySelector(".panel.right");
    const resizerLeft = document.querySelector(".resizer-left");
    const resizerRight = document.querySelector(".resizer-right");

    // -------------------------
    // helpers
    // -------------------------
    const uid = () => (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16);

    function num(v) {
        const x = Number(v);
        return Number.isFinite(x) ? x : 0;
    }

    function int(v) {
        return Math.max(0, Math.trunc(num(v)));
    }

    function relExpr(x, y, z) {
        return `RelativeLocation(${U.fmt(num(x))}, ${U.fmt(num(y))}, ${U.fmt(num(z))})`;
    }

    function clamp(v, min, max) {
        let lo = Number(min);
        let hi = Number(max);
        if (!Number.isFinite(lo)) lo = 0;
        if (!Number.isFinite(hi)) hi = lo;
        if (hi < lo) hi = lo;
        return Math.min(Math.max(Number(v) || 0, lo), hi);
    }

    let getFilterScope, saveRootFilter, isFilterActive, filterAllows, getVisibleEntries, getVisibleIndices, swapInList, findVisibleSwapIndex, cleanupFilterMenus;
    let renderCards, renderParamsEditors, layoutActionOverflow, initCollapseAllControls, setupListDropZone, addQuickOffsetTo;
    let createFilterControls, createParamSyncControls, renderSyncMenu, bindParamSyncListeners, isSyncSelectableEvent, toggleSyncTarget, paramSync;
    let hotkeys, hotkeyToHuman, hotkeyMatchEvent, normalizeHotkey, shouldIgnorePlainHotkeys;
    let openHotkeysModal, hideHotkeysModal, beginHotkeyCapture, refreshHotkeyHints, handleHotkeyCaptureKeydown;


    let toastTimer = 0;
    function showToast(msg, type = "info") {
        let el = document.getElementById("pbToast");
        if (!el) {
            el = document.createElement("div");
            el.id = "pbToast";
            el.className = "toast";
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.remove("success", "error", "info", "show");
        if (type) el.classList.add(type);
        el.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
    }

    // -------------------------
    // Project name / Kotlin ending
    // -------------------------
    let projectName = loadProjectName();

    function getProjectBaseName() {
        return sanitizeFileBase(projectName || "");
    }

    function makeExportFileName(ext, fallbackBase) {
        const base = getProjectBaseName();
        const safeBase = base || fallbackBase || "export";
        return `${safeBase}.${ext}`;
    }

    let kotlinEndMode = loadKotlinEndMode();

    // 让 axis 指向 toPoint，并保持“上方向”稳定（平面包含世界 Up）
    function rotatePointsToPointUpright(points, toPoint, axis, upRef = U.v(0, 1, 0)) {
        if (!points || points.length === 0) return points;
        const fwd = U.norm(axis);
        const dir = U.norm(toPoint);
        if (U.len(fwd) <= 1e-6 || U.len(dir) <= 1e-6) return points;

        const buildBasis = (forward) => {
            const f = U.norm(forward);
            let r = U.cross(upRef, f);
            if (U.len(r) <= 1e-6) {
                const altUp = (Math.abs(upRef.y) > 0.9) ? U.v(1, 0, 0) : U.v(0, 1, 0);
                r = U.cross(altUp, f);
            }
            if (U.len(r) <= 1e-6) return null;
            r = U.norm(r);
            const u = U.norm(U.cross(f, r));
            return {r, u, f};
        };

        const from = buildBasis(fwd);
        const to = buildBasis(dir);
        if (!from || !to) return points;

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const x = U.dot(p, from.r);
            const y = U.dot(p, from.u);
            const z = U.dot(p, from.f);
            points[i] = {
                x: to.r.x * x + to.u.x * y + to.f.x * z,
                y: to.r.y * x + to.u.y * y + to.f.y * z,
                z: to.r.z * x + to.u.z * y + to.f.z * z,
            };
        }
        return points;
    }

    // -------------------------
    // Kotlin output (highlight)
    // -------------------------
    let kotlinRaw = "";
    function setKotlinOut(text) {
        kotlinRaw = text || "";
        if (!elKotlinOut) return;
        const highlighter = globalThis.CodeHighlighter && globalThis.CodeHighlighter.highlightKotlin;
        if (typeof highlighter === "function") {
            elKotlinOut.innerHTML = highlighter(kotlinRaw);
        } else {
            elKotlinOut.textContent = kotlinRaw;
        }
    }

    // -------------------------
    // Layout (panel sizes + kotlin toggle)
    // -------------------------
    const layoutSystem = initLayoutSystem({
        layoutEl,
        panelLeft,
        panelRight,
        resizerLeft,
        resizerRight,
        btnToggleKotlin,
        onResize,
        clamp
    });
    const {
        applyLayoutState,
        setKotlinHidden,
        updateKotlinToggleText,
        bindResizers,
        isKotlinHidden
    } = layoutSystem;

    function bindCardBodyResizer(resizerEl, bodyEl, target) {
        if (!resizerEl || !bodyEl || !target) return;
        resizerEl.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            if (target.collapsed) return;
            e.preventDefault();
            e.stopPropagation();
            historyCapture("resize_card_body");

            const startY = e.clientY;
            const startH = bodyEl.getBoundingClientRect().height || 0;
            const minH = 40;
            let maxH = Math.max(minH, Math.round(window.innerHeight * 0.8));

            const cardEl = bodyEl.closest ? bodyEl.closest(".card") : null;
            const subcards = cardEl && cardEl.parentElement && cardEl.parentElement.classList.contains("subcards")
                ? cardEl.parentElement
                : null;
            if (subcards) {
                const comp = window.getComputedStyle(subcards);
                const maxHStr = comp && comp.maxHeight ? String(comp.maxHeight) : "";
                const maxFromCss = maxHStr && maxHStr !== "none" ? parseFloat(maxHStr) : NaN;
                const headEl = cardEl.querySelector(".card-head");
                const headH = headEl ? headEl.getBoundingClientRect().height : 0;
                const limit = Math.floor((Number.isFinite(maxFromCss) ? maxFromCss : subcards.getBoundingClientRect().height) - headH - 12);
                if (Number.isFinite(limit) && limit > minH) {
                    maxH = Math.min(maxH, limit);
                }
            }
            const prevTransition = bodyEl.style.transition;
            bodyEl.style.transition = "none";

            const onMove = (ev) => {
                const next = clamp(startH + (ev.clientY - startY), minH, maxH);
                target.bodyHeight = next;
                bodyEl.style.height = `${next}px`;
                bodyEl.style.maxHeight = `${next}px`;
            };

            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("resizing-card");
                bodyEl.style.transition = prevTransition || "";
            };

            document.body.classList.add("resizing-card");
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }

    function bindSubblockWidthResizer(resizerEl, blockEl, target) {
        if (!resizerEl || !blockEl || !target) return;
        resizerEl.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            historyCapture("resize_subblock");

            const startX = e.clientX;
            const startW = blockEl.getBoundingClientRect().width || 0;
            const parentW = (blockEl.parentElement && blockEl.parentElement.getBoundingClientRect().width) || startW;
            const minW = 240;
            const maxW = Math.max(minW, parentW - 6);
            const prevTransition = blockEl.style.transition;
            blockEl.style.transition = "none";

            const onMove = (ev) => {
                const next = clamp(startW + (ev.clientX - startX), minW, maxW);
                target.subWidth = next;
                blockEl.style.width = `${next}px`;
            };

            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("resizing-subblock");
                blockEl.style.transition = prevTransition || "";
            };

            document.body.classList.add("resizing-subblock");
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }

    function bindSubblockHeightResizer(resizerEl, subEl, target) {
        if (!resizerEl || !subEl || !target) return;
        resizerEl.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            historyCapture("resize_subblock_height");

            const startY = e.clientY;
            const startH = subEl.getBoundingClientRect().height || 0;
            const minH = 120;
            let maxH = Math.max(minH, Math.round(window.innerHeight * 0.75));
            const blockEl = subEl.closest ? subEl.closest(".subblock") : null;
            const parentBody = blockEl ? blockEl.closest(".card-body") : null;
            if (parentBody && parentBody.style && parentBody.style.height) {
                const bodyRect = parentBody.getBoundingClientRect();
                const blockRect = blockEl.getBoundingClientRect();
                const subRect = subEl.getBoundingClientRect();
                const otherH = Math.max(0, blockRect.height - subRect.height);
                const limit = Math.floor(bodyRect.height - otherH - 10);
                if (Number.isFinite(limit) && limit > minH) {
                    maxH = Math.min(maxH, limit);
                }
            }
            const prevTransition = subEl.style.transition;
            subEl.style.transition = "none";

            const onMove = (ev) => {
                const next = clamp(startH + (ev.clientY - startY), minH, maxH);
                target.subHeight = next;
                subEl.style.height = `${next}px`;
                subEl.style.maxHeight = `${next}px`;
            };

            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("resizing-subblock-y");
                subEl.style.transition = prevTransition || "";
            };

            document.body.classList.add("resizing-subblock-y");
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }


    // -------------------------
    // KIND
    // -------------------------
    const KIND = createKindDefs({ U, num, int, relExpr, rotatePointsToPointUpright });

    // -------------------------
    // Node
    // -------------------------
    const nodeHelpers = createNodeHelpers({
        KIND,
        uid,
        getDefaultMirrorPlane: () => mirrorPlane
    });
    const {
        makeNode,
        cloneNodeDeep,
        cloneNodeListDeep,
        replaceListContents,
        mirrorCopyNode
    } = nodeHelpers;

    // -------------------------
    // state
    // -------------------------
    let state = {
        root: {
            id: "root",
            kind: "ROOT",
            children: []}
    };

    function normalizeState(obj) {
        if (!obj || typeof obj !== "object") return null;
        if (!obj.root || typeof obj.root !== "object") return null;
        if (!Array.isArray(obj.root.children)) obj.root.children = [];
        if (!obj.root.id) obj.root.id = "root";
        if (!obj.root.kind) obj.root.kind = "ROOT";
        return obj;
    }

    const restoredState = normalizeState(loadAutoState());
    if (restoredState) state = restoredState;

    let autoSaveTimer = 0;
    let lastSavedStateJson = "";

    function safeStringifyState(obj) {
        try {
            return JSON.stringify(obj);
        } catch (e) {
            console.warn("state stringify failed:", e);
            return "";
        }
    }

    lastSavedStateJson = safeStringifyState(state);

    function scheduleAutoSave() {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            autoSaveTimer = 0;
            const json = safeStringifyState(state);
            if (!json || json === lastSavedStateJson) return;
            if (saveAutoState(state)) lastSavedStateJson = json;
        }, 180);
    }

    const hotkeySystem = initHotkeysSystem({
        modal,
        modalMask,
        hkModal,
        hkMask,
        hkSearch,
        hkList,
        hkHint,
        btnAddCard,
        btnPickLine,
        btnPickPoint,
        btnFullscreen,
        btnResetCamera,
        btnLoadJson,
        btnHotkeys,
        btnCloseHotkeys,
        btnCloseHotkeys2,
        btnHotkeysReset,
        btnHotkeysExport,
        btnHotkeysImport,
        fileHotkeys,
        cardSearch,
        KIND,
        showToast,
        downloadText
    });
    ({
        hotkeys,
        hotkeyToHuman,
        hotkeyMatchEvent,
        normalizeHotkey,
        shouldIgnorePlainHotkeys,
        openHotkeysModal,
        hideHotkeysModal,
        beginHotkeyCapture,
        refreshHotkeyHints,
        handleHotkeyCaptureKeydown
    } = hotkeySystem);

    const builderTools = createBuilderTools({
        KIND,
        U,
        getState: () => state,
        getKotlinEndMode: () => kotlinEndMode
    });
    const { evalBuilderWithMeta, emitKotlin } = builderTools;

    // -------------------------
    // focus/render flags
    // -------------------------
    // 渲染卡片列表时会触发 focusout（DOM 被重建）。这些 focus 事件不应写入历史，也不应清空聚焦。
    let suppressFocusHistory = false;
    let isRenderingCards = false;

    // -------------------------
    // History (Undo / Redo)
    // -------------------------
    // 撤销栈容量（用户要求“变大一点”）
    const HISTORY_MAX = 800;
    const undoStack = [];
    const redoStack = [];
    let isRestoringHistory = false;

    function deepClone(x) {
        return JSON.parse(JSON.stringify(x));
    }

    function historyCapture(reason = "") {
        if (isRestoringHistory) return;
        try {
            const snap = { state: deepClone(state), focusedNodeId: focusedNodeId || null };
            const last = undoStack.length ? undoStack[undoStack.length - 1] : null;
            // ✅ 允许“仅焦点变化”入栈：state 相同但 focusedNodeId 不同也要记录
            if (last) {
                const sameState = (JSON.stringify(last.state) === JSON.stringify(snap.state));
                const sameFocus = ((last.focusedNodeId || null) === (snap.focusedNodeId || null));
                if (sameState && sameFocus) return;
            }
            undoStack.push(snap);
            if (undoStack.length > HISTORY_MAX) undoStack.shift();
            redoStack.length = 0;
        } catch (e) {
            console.warn("historyCapture failed:", reason, e);
        }
    }


    function restoreSnapshot(snap) {
        isRestoringHistory = true;
        try {
            stopLinePick?.(); // 取消拾取模式，避免状态错乱
            stopPointPick?.();
        } catch {}
        try {
            state = deepClone(snap.state);
            focusedNodeId = snap.focusedNodeId || null;
        } finally {
            isRestoringHistory = false;
        }
        suppressFocusHistory = true;
        renderAll();
        suppressFocusHistory = false;
        // 尝试恢复焦点（不强制，避免打断用户）
        requestAnimationFrame(() => {
            if (!focusedNodeId) return;
            const el = document.querySelector(`.card[data-id="${focusedNodeId}"]`);
            if (el) {
                try { el.scrollIntoView({block: "nearest"}); } catch {}
            }
            updateFocusColors?.();
            updateFocusCardUI?.();
        });
    }

    function historyUndo() {
        if (!undoStack.length) return;
        const snap = undoStack.pop();
        redoStack.push({ state: deepClone(state), focusedNodeId: focusedNodeId || null });
        restoreSnapshot(snap);
    }

    function historyRedo() {
        if (!redoStack.length) return;
        const snap = redoStack.pop();
        undoStack.push({ state: deepClone(state), focusedNodeId: focusedNodeId || null });
        restoreSnapshot(snap);
    }

    // 输入控件 focus 时只 capture 一次（开始编辑的那一刻）
    function armHistoryOnFocus(el, reason = "edit") {
        if (!el) return;
        if (el.__pbHistoryArmed) return;
        el.__pbHistoryArmed = true;
        el.addEventListener("focus", () => {
            if (isRestoringHistory) return;
            if (!el.__pbHistoryCaptured) {
                el.__pbHistoryCaptured = true;
                historyCapture(reason);
            }
        });
        el.addEventListener("blur", () => {
            el.__pbHistoryCaptured = false;
        });
    }

    const { row, inputNum, select, checkbox, makeVec3Editor } = createCardInputs({
        num,
        armHistoryOnFocus,
        historyCapture,
        setActiveVecTarget: (target) => { activeVecTarget = target; }
    });

    // 用户要求：左侧卡片允许“全部删除”（不再强制至少保留 axis）。
    // PointsBuilder 本身 axis 默认是 y 轴，因此 UI 不必强制插入 axis 卡片。
    function ensureAxisInList(_list) {
        // no-op
    }

    function ensureAxisEverywhere() {
        // no-op
    }

    function isBuilderContainerKind(kind) {
        return kind === "with_builder" || kind === "add_with";
    }

    function forEachNode(list, fn) {
        const arr = list || [];
        for (const n of arr) {
            if (!n) continue;
            fn(n);
            if (isBuilderContainerKind(n.kind) && Array.isArray(n.children)) {
                forEachNode(n.children, fn);
            }
        }
    }

    const COLLAPSE_SCOPE_ROOT = "root";
    const collapseScopes = new Map(); // scopeId -> { active: boolean, manualOpen: Set }

    function scopeKey(scopeId) {
        return scopeId || COLLAPSE_SCOPE_ROOT;
    }

    function getCollapseScope(scopeId) {
        const key = scopeKey(scopeId);
        let scope = collapseScopes.get(key);
        if (!scope) {
            scope = { active: false, manualOpen: new Set(), forceOpenOnce: false };
            collapseScopes.set(key, scope);
        }
        return scope;
    }

    function isCollapseAllActive(scopeId) {
        return !!getCollapseScope(scopeId).active;
    }

    function buildFocusPathIds(focusId = focusedNodeId) {
        const set = new Set();
        if (!focusId) return set;
        let ctx = findNodeContextById(focusId);
        if (!ctx || !ctx.node) return set;
        set.add(ctx.node.id);
        let parent = ctx.parentNode || null;
        while (parent && parent.id) {
            set.add(parent.id);
            const next = findNodeContextById(parent.id);
            parent = next ? (next.parentNode || null) : null;
        }
        return set;
    }

    function collapseAllInList(list, scopeId, focusPath = null) {
        const scope = getCollapseScope(scopeId);
        const focusSet = focusPath || buildFocusPathIds();
        const arr = list || [];
        for (const n of arr) {
            if (!n) continue;
            const keepOpen = scope.manualOpen.has(n.id) || (focusSet && focusSet.has(n.id));
            n.collapsed = !keepOpen;
        }
    }

    function expandAllInList(list) {
        const arr = list || [];
        for (const n of arr) {
            if (!n) continue;
            n.collapsed = false;
        }
    }

    function applyCollapseAllStates() {
        const focusPath = buildFocusPathIds();
        const rootScope = getCollapseScope(null);
        if (rootScope.forceOpenOnce) {
            expandAllInList(state.root.children);
            rootScope.forceOpenOnce = false;
        } else if (rootScope.active) {
            collapseAllInList(state.root.children, null, focusPath);
        }
        forEachNode(state.root.children, (n) => {
            if (!isBuilderContainerKind(n.kind)) return;
            const scope = collapseScopes.get(n.id);
            if (scope && scope.forceOpenOnce) {
                expandAllInList(n.children || []);
                scope.forceOpenOnce = false;
            } else if (scope && scope.active) {
                collapseAllInList(n.children || [], n.id, focusPath);
            }
        });
    }

    function getScopeIdForNodeId(id) {
        const ctx = findNodeContextById(id);
        if (!ctx) return null;
        return ctx.parentNode ? ctx.parentNode.id : null;
    }


    function syncCardCollapseUI(id) {
        if (!id || !elCardsRoot) return;
        const ctx = findNodeContextById(id);
        if (!ctx || !ctx.node) return;
        const card = elCardsRoot.querySelector(`.card[data-id="${id}"]`);
        if (!card) return;
        const collapsed = !!ctx.node.collapsed;
        card.classList.toggle("collapsed", collapsed);
        const btn = card.querySelector('.iconbtn[data-collapse-btn="1"]');
        if (btn) {
            btn.textContent = collapsed ? "▸" : "▾";
            btn.title = collapsed ? "展开" : "收起";
        }
    }

    function handleCollapseAllFocusChange(prevId, nextId) {
        const nextPath = nextId ? buildFocusPathIds(nextId) : null;
        if (prevId && prevId !== nextId) {
            const scopeId = getScopeIdForNodeId(prevId);
            const scope = getCollapseScope(scopeId);
            const keepOpen = nextPath && nextPath.has(prevId);
            if (scope.active && !scope.manualOpen.has(prevId) && !keepOpen) {
                const ctx = findNodeContextById(prevId);
                if (ctx && ctx.node && !ctx.node.collapsed) {
                    ctx.node.collapsed = true;
                    syncCardCollapseUI(prevId);
                }
            }
        }
        if (nextId) {
            const scopeId = getScopeIdForNodeId(nextId);
            const scope = getCollapseScope(scopeId);
            if (scope.active) {
                const ctx = findNodeContextById(nextId);
                if (ctx && ctx.node && ctx.node.collapsed) {
                    ctx.node.collapsed = false;
                    syncCardCollapseUI(nextId);
                }
            }
        }
    }

    function collapseAllInScope(scopeId, list) {
        const scope = getCollapseScope(scopeId);
        scope.active = true;
        scope.manualOpen.clear();
        collapseAllInList(list, scopeId, buildFocusPathIds());
    }

    function expandAllInScope(scopeId, list) {
        const scope = getCollapseScope(scopeId);
        scope.active = false;
        scope.manualOpen.clear();
        scope.forceOpenOnce = true;
        expandAllInList(list);
    }

    function findNodeContextById(id, list = state.root.children, parentNode = null) {
        const arr = list || [];
        for (let i = 0; i < arr.length; i++) {
            const n = arr[i];
            if (!n) continue;
            if (n.id === id) return { node: n, parentList: arr, index: i, parentNode };
            if (isBuilderContainerKind(n.kind) && Array.isArray(n.children)) {
                const r = findNodeContextById(id, n.children, n);
                if (r) return r;
            }
        }
        return null;
    }

    // ✅ 支持“删除聚焦卡片”：不仅能找到普通卡片，也能找到 add_fourier_series 的 term 子卡片
    function findAnyCardContextById(id, list = state.root.children, parentNode = null) {
        const arr = list || [];
        for (let i = 0; i < arr.length; i++) {
            const n = arr[i];
            if (!n) continue;
            if (n.id === id) return { type: "node", node: n, parentList: arr, index: i, parentNode };

            // Fourier 子卡片（terms）
            if (n.kind === "add_fourier_series" && Array.isArray(n.terms)) {
                for (let ti = 0; ti < n.terms.length; ti++) {
                    const t = n.terms[ti];
                    if (t && t.id === id) {
                        return { type: "term", term: t, parentList: n.terms, index: ti, parentNode: n };
                    }
                }
            }

            if (isBuilderContainerKind(n.kind) && Array.isArray(n.children)) {
                const r = findAnyCardContextById(id, n.children, n);
                if (r) return r;
            }
        }
        return null;
    }

    function pickReasonableFocusAfterDelete(ctx) {
        try {
            const list = ctx?.parentList;
            if (Array.isArray(list) && list.length) {
                const i = Math.max(0, Math.min(ctx.index, list.length - 1));
                const cand = list[i] || list[i - 1];
                if (cand && cand.id) return cand.id;
            }
            if (ctx?.parentNode && ctx.parentNode.id) return ctx.parentNode.id;
        } catch {}
        return null;
    }

    function deleteFocusedCard() {
        if (!focusedNodeId) return false;
        const ctx = findAnyCardContextById(focusedNodeId);
        if (!ctx || !Array.isArray(ctx.parentList)) {
            // 找不到：清空焦点即可
            setFocusedNode(null, true);
            return false;
        }

        historyCapture("delete_focused");

        // 删除
        ctx.parentList.splice(ctx.index, 1);

        // 删除后合理地保留焦点（不额外写历史，由 delete_focused 这一条快照承载）
        const nextFocus = pickReasonableFocusAfterDelete(ctx);
        setFocusedNode(nextFocus, false);

        ensureAxisEverywhere();
        renderAll();
        return true;
    }

    function copyFocusedCard() {
        if (!focusedNodeId) return false;
        const ctx = findAnyCardContextById(focusedNodeId);
        if (!ctx || !Array.isArray(ctx.parentList)) return false;
        historyCapture("copy_focused");
        let cloned = null;
        if (ctx.type === "term") {
            cloned = JSON.parse(JSON.stringify(ctx.term));
            cloned.id = uid();
        } else {
            cloned = cloneNodeDeep(ctx.node);
        }
        ctx.parentList.splice(ctx.index + 1, 0, cloned);
        renderAll();
        requestAnimationFrame(() => {
            const el = elCardsRoot.querySelector(`.card[data-id="${cloned.id}"]`);
            if (el) {
                try { el.focus(); } catch {}
                try { el.scrollIntoView({ block: "nearest" }); } catch {}
                setFocusedNode(cloned.id, false);
            }
        });
        return true;
    }

    function mirrorCopyFocusedCard() {
        if (!focusedNodeId) return false;
        const ctx = findNodeContextById(focusedNodeId);
        if (!ctx || !Array.isArray(ctx.parentList)) return false;
        const cloned = mirrorCopyNode(ctx.node, mirrorPlane);
        if (!cloned) return false;
        historyCapture("mirror_copy");
        ctx.parentList.splice(ctx.index + 1, 0, cloned);
        renderAll();
        requestAnimationFrame(() => {
            const el = elCardsRoot.querySelector(`.card[data-id="${cloned.id}"]`);
            if (el) {
                try { el.focus(); } catch {}
                try { el.scrollIntoView({ block: "nearest" }); } catch {}
                setFocusedNode(cloned.id, false);
            }
        });
        return true;
    }

    function nodeContainsId(node, id) {
        if (!node) return false;
        if (node.id === id) return true;
        if (isBuilderContainerKind(node.kind) && Array.isArray(node.children)) {
            for (const c of node.children) if (nodeContainsId(c, id)) return true;
        }
        return false;
    }

    function moveNodeById(dragId, targetList, targetIndex, targetOwnerNode = null) {
        if (!dragId || !Array.isArray(targetList)) return false;

        const from = findNodeContextById(dragId);
        if (!from) return false;

        // 不能把节点拖进自己的子树（目标 owner 在拖拽节点子树中）
        if (targetOwnerNode && nodeContainsId(from.node, targetOwnerNode.id)) return false;

        const fromList = from.parentList;
        const fromIndex = from.index;

        // 过滤模式下，同列表只允许交换位置。
        const scopeId = targetOwnerNode ? targetOwnerNode.id : null;
        if (typeof isFilterActive === "function" && isFilterActive(scopeId) && fromList === targetList) {
            if (targetIndex < 0 || targetIndex >= targetList.length) return false;
            if (fromIndex === targetIndex) return false;
            swapInList(targetList, fromIndex, targetIndex);
            ensureAxisEverywhere();
            return true;
        }

        const [moved] = fromList.splice(fromIndex, 1);

        let idx = Math.max(0, Math.min(targetIndex, targetList.length));
        if (fromList === targetList && fromIndex < idx) idx -= 1;
        targetList.splice(idx, 0, moved);

        ensureAxisEverywhere();
        return true;
    }

    function tryCopyWithBuilderIntoAddWith(dragId, targetOwnerNode) {
        if (!dragId || !targetOwnerNode || targetOwnerNode.kind !== "add_with") return false;
        const from = findNodeContextById(dragId);
        if (!from || !from.node || from.node.kind !== "with_builder") return false;

        historyCapture("copy_withBuilder_into_addWith");
        if (!Array.isArray(targetOwnerNode.children)) targetOwnerNode.children = [];
        const cloned = cloneNodeListDeep(from.node.children || []);
        replaceListContents(targetOwnerNode.children, cloned);
        return true;
    }

    function handleBuilderDrop(info, targetList, targetIndex, targetOwnerNode) {
        if (!info || !Array.isArray(targetList)) return false;
        if (info.type !== "add_with_builder") return false;
        const srcCtx = findNodeContextById(info.ownerId);
        if (!srcCtx || !srcCtx.node || srcCtx.node.kind !== "add_with") return false;
        if (targetOwnerNode && targetOwnerNode.id === srcCtx.node.id) return false;

        historyCapture("drag_out_addWith_builder");
        const node = makeNode("with_builder");
        node.children = cloneNodeListDeep(srcCtx.node.children || []);

        const idx = Math.max(0, Math.min(targetIndex, targetList.length));
        targetList.splice(idx, 0, node);
        return true;
    }


    // -------------------------
    // Three.js
    // -------------------------
    let renderer, scene, camera, controls;
    let initialCameraState = null;
    let pointsObj = null;
    let axesHelper, gridHelper, axisLabelGroup;
    let raycaster, mouse;
    let pickPlane;
    const SNAP_PLANES = {
        XZ: {label: "XZ", normal: new THREE.Vector3(0, 1, 0), axis: "XZ"},
        XY: {label: "XY", normal: new THREE.Vector3(0, 0, 1), axis: "XY"},
        ZY: {label: "ZY", normal: new THREE.Vector3(1, 0, 0), axis: "ZY"},
    };
    let snapPlane = "XZ";
    let mirrorPlane = "XZ";
    let hoverMarker = null;   // ✅ 实时跟随的红点
    let lastPoints = [];      // ✅ 当前预览点，用于“吸附到最近点”

    // ✅ 点高亮：卡片获得焦点时，让该卡片“直接新增”的粒子变色
    let nodePointSegments = new Map(); // nodeId -> {start,end}
    let pointOwnerByIndex = null; // pointIndex -> nodeId（更细粒度优先）
    let suppressCardFocusOutClear = false; // 预览区点击时避免 focusout 清空焦点
    let focusedNodeId = null;          // 当前聚焦的卡片 id（或 null）
    let defaultColorBuf = null;        // Float32Array：默认颜色缓存（与 position 等长）
    const DEFAULT_POINT_HEX = 0xffffff;
    const FOCUS_POINT_HEX = 0xffcc33;

    let pickMarkers = [];
    let pointSize = 0.2;     // ✅ 粒子大小（PointsMaterial.size）
    // line pick state (可指向主/任意子 builder)
    let linePickMode = false;
    let picked = [];
    let linePickTargetList = null;
    let linePickTargetLabel = "主Builder";
    // 插入位置（用于：在某个卡片后/某个 withBuilder 子列表末尾连续插入）
    let linePickInsertIndex = null;
    // 进入拾取前的聚焦卡片（用于：拾取新增后保持聚焦不丢失）
    let linePickKeepFocusId = null;
    // ✅ 解决：拾取直线时 pointerdown 处理完后仍会触发 click 事件，可能导致焦点被 onCanvasClick 清空
    let suppressNextCanvasClick = false;
    // point pick state (for axis/start/end/vec3 fields)
    let pointPickMode = false;
    let pointPickTarget = null;
    let pointPickKeepFocusId = null;
    let activeVecTarget = null;
    const panKeyState = {ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false};
    const PAN_KEY_SPEED = 0.0025;
    const _panDir = new THREE.Vector3();
    const _panRight = new THREE.Vector3();
    const _panUp = new THREE.Vector3();
    const _panMove = new THREE.Vector3();

    let _rClickT = 0;
    let _rClickX = 0;
    let _rClickY = 0;
    const RDBL_MS = 320;  // 双击间隔
    const RDBL_PX = 7;    // 双击最大位移
    let _rDown = false;
    let _rMoved = false;
    let _rDownX = 0;
    let _rDownY = 0;

    function isRightLike(ev) {
        // 1) 标准右键：button===2
        // 2) 右键按下位掩码：buttons&2
        // 3) macOS Ctrl+Click：button===0 且 ctrlKey=true
        return ev.button === 2 || (ev.buttons & 2) === 2 || (ev.button === 0 && ev.ctrlKey);
    }

    function isArrowKey(code) {
        return code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight";
    }

    function shouldIgnoreArrowPan() {
        if ((modal && !modal.classList.contains("hidden")) || (hkModal && !hkModal.classList.contains("hidden"))) return true;
        const ae = document.activeElement;
        if (!ae) return false;
        const tag = (ae.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA") return true;
        if (ae.isContentEditable) return true;
        return false;
    }

    function applyArrowPan() {
        if (!controls || !camera) return;
        if (!panKeyState.ArrowUp && !panKeyState.ArrowDown && !panKeyState.ArrowLeft && !panKeyState.ArrowRight) return;
        const dist = camera.position.distanceTo(controls.target);
        const step = Math.max(0.0001, dist * PAN_KEY_SPEED) * (controls.panSpeed || 1);
        camera.getWorldDirection(_panDir);
        _panRight.crossVectors(_panDir, camera.up).normalize();
        _panUp.copy(camera.up).normalize();
        _panMove.set(0, 0, 0);
        if (panKeyState.ArrowLeft) _panMove.addScaledVector(_panRight, -step);
        if (panKeyState.ArrowRight) _panMove.addScaledVector(_panRight, step);
        if (panKeyState.ArrowUp) _panMove.addScaledVector(_panUp, step);
        if (panKeyState.ArrowDown) _panMove.addScaledVector(_panUp, -step);
        if (_panMove.lengthSq() > 0) {
            controls.target.add(_panMove);
            camera.position.add(_panMove);
        }
    }

    function ensureHoverMarker() {
        if (hoverMarker) return;
        const geom = new THREE.SphereGeometry(0.12, 16, 12);
        const mat = new THREE.MeshBasicMaterial({color: 0xff3333});
        hoverMarker = new THREE.Mesh(geom, mat);
        hoverMarker.visible = false;
        scene.add(hoverMarker);
    }

    function setHoverMarkerColor(hex) {
        ensureHoverMarker();
        hoverMarker.material.color.setHex(hex);
    }

    function colorForPickIndex(idx) {
        // idx=0：第一个点；idx=1：第二个点
        return idx === 0 ? 0xff3333 : 0x33a1ff;
    }

    function addPickMarker(p, hex) {
        const geom = new THREE.SphereGeometry(0.12, 16, 12);
        const mat = new THREE.MeshBasicMaterial({color: hex});
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(p.x, p.y, p.z);
        scene.add(mesh);
        pickMarkers.push(mesh);
    }

    function clearPickMarkers() {
        if (!pickMarkers || pickMarkers.length === 0) return;
        if (!scene) {
            pickMarkers = [];
            return;
        }

        for (const m of pickMarkers) {
            try {
                scene.remove(m);
            } catch {
            }
            try {
                m.geometry && m.geometry.dispose && m.geometry.dispose();
            } catch {
            }
            try {
                m.material && m.material.dispose && m.material.dispose();
            } catch {
            }
        }
        pickMarkers = [];
    }

    function showHoverMarker(p) {
        ensureHoverMarker();
        hoverMarker.position.set(p.x, p.y, p.z);
        hoverMarker.visible = true;
    }

    function hideHoverMarker() {
        if (!hoverMarker) return;
        hoverMarker.visible = false;
    }

    function clampNum(v, min, max) {
        const x = Number(v);
        if (!Number.isFinite(x)) return min;
        return Math.max(min, Math.min(max, x));
    }

    function setPointSize(v) {
        pointSize = clampNum(v, 0.001, 5);

        // ✅ 更新点云材质（不会重置相机）
        if (pointsObj && pointsObj.material) {
            pointsObj.material.size = pointSize;
            pointsObj.material.needsUpdate = true;
        }

    }

    function getSnapStep() {
        const v = parseFloat(inpSnapStep?.value);
        if (!Number.isFinite(v) || v <= 0) return 1;
        return v;
    }
    function getPlaneInfo() {
        return SNAP_PLANES[snapPlane] || SNAP_PLANES.XZ;
    }

    function getMirrorPlaneInfo() {
        return SNAP_PLANES[mirrorPlane] || SNAP_PLANES.XZ;
    }

    function updateGridForPlane() {
        if (!gridHelper) return;
        const info = getPlaneInfo();
        gridHelper.rotation.set(0, 0, 0);
        if (info.axis === "XY") {
            gridHelper.rotation.x = Math.PI / 2;
        } else if (info.axis === "ZY") {
            gridHelper.rotation.z = -Math.PI / 2;
        }
        if (info.normal) {
            gridHelper.position.set(info.normal.x * -0.01, info.normal.y * -0.01, info.normal.z * -0.01);
        }
    }

    function makeAxisLabelSprite(text, colorHex) {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, size, size);
        ctx.font = "bold 56px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, size / 2, size / 2);
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 6;
        ctx.strokeText(text, size / 2, size / 2);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({map: tex, transparent: true, color: colorHex});
        const sprite = new THREE.Sprite(mat);
        sprite.material.depthTest = false;
        sprite.renderOrder = 10;
        return sprite;
    }

    function buildAxisLabels() {
        if (!scene) return;
        if (axisLabelGroup) {
            scene.remove(axisLabelGroup);
        }
        axisLabelGroup = new THREE.Group();
        const len = 5.6;
        const sx = makeAxisLabelSprite("+X", 0xff5555);
        const sy = makeAxisLabelSprite("+Y", 0x55ff55);
        const sz = makeAxisLabelSprite("+Z", 0x5599ff);
        sx.position.set(len, 0, 0);
        sy.position.set(0, len, 0);
        sz.position.set(0, 0, len);
        axisLabelGroup.add(sx, sy, sz);
        axisLabelGroup.visible = !!(chkAxes && chkAxes.checked);
        scene.add(axisLabelGroup);
        updateAxisLabelScale();
    }

    function updateAxisLabelScale() {
        if (!axisLabelGroup || !camera || !controls) return;
        const dist = camera.position.distanceTo(controls.target);
        const scale = Math.max(0.6, dist * 0.04);
        axisLabelGroup.children.forEach((s) => {
            s.scale.set(scale, scale, scale);
        });
    }

    function mapHitToPlaneRaw(hitVec3) {
        const plane = getPlaneInfo().axis;
        if (plane === "XY") return {x: hitVec3.x, y: hitVec3.y, z: 0};
        if (plane === "ZY") return {x: 0, y: hitVec3.y, z: hitVec3.z};
        return {x: hitVec3.x, y: 0, z: hitVec3.z};
    }

    function snapToGridOnPlane(p, step, planeKey) {
        const s = step || 1;
        const plane = planeKey || getPlaneInfo().axis;
        if (plane === "XY") {
            return {x: Math.round(p.x / s) * s, y: Math.round(p.y / s) * s, z: p.z};
        }
        if (plane === "ZY") {
            return {x: p.x, y: Math.round(p.y / s) * s, z: Math.round(p.z / s) * s};
        }
        return {x: Math.round(p.x / s) * s, y: p.y, z: Math.round(p.z / s) * s};
    }

    function dist2(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return dx * dx + dy * dy + dz * dz;
    }

    function nearestPointCandidate(ref, maxDist = 0.35) {
        if (!lastPoints || lastPoints.length === 0) return null;
        let best = null;
        let bestD2 = Infinity;
        for (const q of lastPoints) {
            const d2 = dist2(ref, q);
            if (d2 < bestD2) {
                bestD2 = d2;
                best = q;
            }
        }
        if (!best) return null;
        const limit2 = maxDist * maxDist;
        if (bestD2 > limit2) return null;
        return {point: {x: best.x, y: best.y, z: best.z}, d2: bestD2};
    }

    function mapPickPoint(hitVec3, particlePoint = null) {
        const raw = mapHitToPlaneRaw(hitVec3);

        const useGrid = chkSnapGrid && chkSnapGrid.checked;
        const useParticle = chkSnapParticle && chkSnapParticle.checked;

        if (!useGrid && !useParticle) return raw;

        const gridP = useGrid ? snapToGridOnPlane(raw, getSnapStep(), getPlaneInfo().axis) : null;

        let particleP = null;
        const particleHit = particlePoint ? {x: particlePoint.x, y: particlePoint.y, z: particlePoint.z} : null;
        if (useParticle) {
            if (particleHit) {
                particleP = particleHit;
            } else {
                const cand = nearestPointCandidate(hitVec3, 0.35);
                particleP = cand ? cand.point : null;
            }
        }

        // 鼠标命中粒子时优先吸附粒子
        if (useParticle && particleHit) return particleHit;
        if (useParticle && !useGrid) return particleP || raw;
        if (useGrid && useParticle) return particleP || gridP;
        if (useGrid && !useParticle) return gridP;
        return raw;
    }

    function updatePickLineButtons() {
        const label = getPlaneInfo().label;
        if (btnPickLine) btnPickLine.textContent = `${label} 拾取直线`;
        document.querySelectorAll("[data-pick-line-btn]").forEach((el) => {
            el.textContent = `${label}拾取直线`;
        });
        if (btnPickPoint) btnPickPoint.textContent = `${label} 点拾取`;
    }

    function updateMirrorButtons() {
        const label = getMirrorPlaneInfo().label;
        document.querySelectorAll("[data-mirror-btn]").forEach((el) => {
            el.title = `镜像复制（${label}）`;
        });
    }

    function setSnapPlane(next) {
        const key = SNAP_PLANES[next] ? next : "XZ";
        snapPlane = key;
        if (selSnapPlane && selSnapPlane.value !== key) selSnapPlane.value = key;
        applyPickPlane();
    }

    function setMirrorPlane(next) {
        const key = SNAP_PLANES[next] ? next : "XZ";
        mirrorPlane = key;
        if (selMirrorPlane && selMirrorPlane.value !== key) selMirrorPlane.value = key;
        updateMirrorButtons();
    }

    function applyPickPlane() {
        if (!pickPlane) pickPlane = new THREE.Plane();
        const info = getPlaneInfo();
        pickPlane.set(info.normal, 0);
        updatePickLineButtons();
        updateGridForPlane();
        if (linePickMode) {
            setLinePickStatus(`${info.label} 拾取模式[${linePickTargetLabel}]：请点第 1 点`);
        }
        if (pointPickMode) {
            setPointPickStatus(`${info.label} 点拾取：左键确定，右键取消`);
        }
    }

    function initThree() {
        renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(threeHost.clientWidth, threeHost.clientHeight);
        threeHost.appendChild(renderer.domElement);

        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(55, threeHost.clientWidth / threeHost.clientHeight, 0.01, 5000);
        camera.position.set(10, 10, 10);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        // 旋转改为中键，其它操作保持（左键不再旋转）
        controls.mouseButtons.LEFT = null;
        controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
        controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
        captureInitialCamera();
        axesHelper = new THREE.AxesHelper(5);
        scene.add(axesHelper);
        buildAxisLabels();

        gridHelper = new THREE.GridHelper(256, 256, 0x223344, 0x223344);
        gridHelper.position.y = -0.01;
        scene.add(gridHelper);

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(10, 20, 10);
        scene.add(dir);

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();
        pickPlane = new THREE.Plane(getPlaneInfo().normal.clone(), 0);
        updatePickLineButtons();
        updateGridForPlane();
        updateMirrorButtons();

        window.addEventListener("resize", onResize);
        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("pointerup", onPointerUp);
        renderer.domElement.addEventListener("click", onCanvasClick);

        chkAxes.addEventListener("change", () => {
            axesHelper.visible = chkAxes.checked;
            if (axisLabelGroup) axisLabelGroup.visible = chkAxes.checked;
        });
        chkGrid.addEventListener("change", () => gridHelper.visible = chkGrid.checked);
        if (btnResetCamera) {
            btnResetCamera.addEventListener("click", () => resetCameraToPoints());
        }
        if (selSnapPlane) {
            selSnapPlane.value = snapPlane;
            selSnapPlane.addEventListener("change", () => setSnapPlane(selSnapPlane.value));
        }
        if (selMirrorPlane) {
            selMirrorPlane.value = mirrorPlane;
            selMirrorPlane.addEventListener("change", () => setMirrorPlane(selMirrorPlane.value));
        }
        if (inpSnapStep) inpSnapStep.disabled = !(chkSnapGrid && chkSnapGrid.checked);
        chkSnapGrid?.addEventListener("change", () => {
            if (inpSnapStep) inpSnapStep.disabled = !chkSnapGrid.checked;
        });
        renderer.domElement.addEventListener("contextmenu", (e) => {
            // 通常 three 应用都会禁用默认右键菜单（不影响右键拖动平移）
            e.preventDefault();
        });
        inpSnapStep?.addEventListener("input", () => {
            // 拾取模式下，步长改变时让红点立刻更新一次
            if (linePickMode) {
                // 触发一次 move 逻辑最简单：直接隐藏，下一次 move 会刷新
                // 或者你也可以在这里主动调用 showHoverMarker(当前映射点)
            }
        });
        if (inpPointSize) {
            inpPointSize.value = String(pointSize);
            inpPointSize.addEventListener("input", () => {
                setPointSize(inpPointSize.value);
            });
        }

        animate();
    }

    function onResize() {
        if (!renderer || !camera) return;
        renderer.setSize(threeHost.clientWidth, threeHost.clientHeight);
        camera.aspect = threeHost.clientWidth / threeHost.clientHeight;
        camera.updateProjectionMatrix();
        layoutActionOverflow();
    }

    function captureInitialCamera() {
        if (!camera || !controls) return;
        initialCameraState = {
            position: camera.position.clone(),
            target: controls.target.clone(),
            near: camera.near,
            far: camera.far,
        };
    }

    function restoreInitialCamera() {
        if (!camera || !controls || !initialCameraState) return;
        camera.position.copy(initialCameraState.position);
        controls.target.copy(initialCameraState.target);
        camera.near = initialCameraState.near;
        camera.far = initialCameraState.far;
        camera.updateProjectionMatrix();
        controls.update();
    }

    function resetCameraToPoints() {
        if (!camera || !controls) return;
        if (!lastPoints || lastPoints.length === 0) {
            restoreInitialCamera();
            return;
        }
        const b = U.computeBounds(lastPoints);
        const r = b.radius;
        const c = b.center;
        controls.target.set(c.x, c.y, c.z);

        const dist = r * 2.4 + 2;
        camera.position.set(c.x + dist, c.y + dist * 0.8, c.z + dist);
        camera.near = Math.max(0.01, r / 100);
        camera.far = Math.max(5000, r * 20);
        camera.updateProjectionMatrix();
        controls.update();
    }

    function setPoints(points) {
        statusPoints.textContent = `点数：${points.length}`;

        if (pointsObj) {
            scene.remove(pointsObj);
            pointsObj.geometry.dispose();
            pointsObj.material.dispose();
            pointsObj = null;
        }

        lastPoints = points ? points.map(p => ({ x: p.x, y: p.y, z: p.z })) : [];
        if (!points || points.length === 0) {
            defaultColorBuf = null;
            return;
        }

        const geom = new THREE.BufferGeometry();

        // position
        const pos = new Float32Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
            pos[i * 3 + 0] = points[i].x;
            pos[i * 3 + 1] = points[i].y;
            pos[i * 3 + 2] = points[i].z;
        }
        geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));

        // color（默认色 + 聚焦色）
        const c0 = new THREE.Color(DEFAULT_POINT_HEX);
        defaultColorBuf = new Float32Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
            defaultColorBuf[i * 3 + 0] = c0.r;
            defaultColorBuf[i * 3 + 1] = c0.g;
            defaultColorBuf[i * 3 + 2] = c0.b;
        }
        const colorArr = defaultColorBuf.slice();
        geom.setAttribute("color", new THREE.BufferAttribute(colorArr, 3));

        geom.computeBoundingSphere();

        const mat = new THREE.PointsMaterial({
            size: pointSize,
            sizeAttenuation: true,
            vertexColors: true,
            color: 0xffffff
        });
        pointsObj = new THREE.Points(geom, mat);
        scene.add(pointsObj);

        // ✅ 根据当前聚焦的卡片，重新着色
        updateFocusColors();

        // 不自动重置镜头：由用户手动点击“重置镜头”
    }

    function updateFocusColors() {
        if (!pointsObj) return;
        const g = pointsObj.geometry;
        const attr = g.getAttribute("color");
        if (!attr || !attr.array || !defaultColorBuf) return;

        // 先恢复默认色
        attr.array.set(defaultColorBuf);

        // 再打聚焦色
        const seg = focusedNodeId ? nodePointSegments.get(focusedNodeId) : null;
        if (seg && seg.end > seg.start) {
            const c1 = new THREE.Color(FOCUS_POINT_HEX);
            for (let i = seg.start; i < seg.end; i++) {
                const k = i * 3;
                attr.array[k + 0] = c1.r;
                attr.array[k + 1] = c1.g;
                attr.array[k + 2] = c1.b;
            }
        }

        attr.needsUpdate = true;
    }

    // ✅ 左侧卡片聚焦高亮（UI）
    function updateFocusCardUI() {
        if (!elCardsRoot) return;
        try {
            elCardsRoot.querySelectorAll('.card.focused').forEach(el => el.classList.remove('focused'));
        } catch {}
        if (!focusedNodeId) return;
        const el = elCardsRoot.querySelector(`.card[data-id="${focusedNodeId}"]`);
        if (el) el.classList.add('focused');
    }

    function setFocusedNode(id, recordHistory = true) {
        const next = id || null;
        if (focusedNodeId === next) return;
        const prev = focusedNodeId;
        if (recordHistory && !isRestoringHistory && !suppressFocusHistory && !isRenderingCards) {
            historyCapture("focus_change");
        }
        focusedNodeId = next;
        updateFocusColors();
        updateFocusCardUI();
        handleCollapseAllFocusChange(prev, focusedNodeId);
    }

    function clearFocusedNodeIf(id, recordHistory = true) {
        if (!id) return;
        if (focusedNodeId !== id) return;
        const prev = focusedNodeId;
        if (recordHistory && !isRestoringHistory && !suppressFocusHistory && !isRenderingCards) {
            historyCapture("focus_clear");
        }
        focusedNodeId = null;
        updateFocusColors();
        updateFocusCardUI();
        handleCollapseAllFocusChange(prev, null);
    }


function buildPointOwnerByIndex(totalCount, segments) {
    const owners = new Array(totalCount || 0);
    if (!segments) return owners;
    for (const [id, seg] of segments.entries()) {
        if (!seg) continue;
        const s = Math.max(0, (seg.start | 0));
        const e = Math.min(owners.length, (seg.end | 0));
        for (let i = s; i < e; i++) owners[i] = id; // 后写入的更细粒度（子卡片）会覆盖父段
    }
    return owners;
}

function ownerIdForPointIndex(i) {
    if (i === null || i === undefined) return null;
    if (pointOwnerByIndex && pointOwnerByIndex[i]) return pointOwnerByIndex[i];
    // fallback：在 segments 里找“最短段”（更细粒度）
    let best = null;
    let bestLen = Infinity;
    for (const [id, seg] of nodePointSegments.entries()) {
        if (!seg) continue;
        if (i >= seg.start && i < seg.end) {
            const len = seg.end - seg.start;
            if (len < bestLen) {
                bestLen = len;
                best = id;
            }
        }
    }
    return best;
}

function pickPointIndexFromEvent(ev) {
    if (!pointsObj || !renderer || !camera || !raycaster) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(mouse, camera);
    // Points 的阈值是“世界坐标”，这里给一个随点大小变化的经验值
    raycaster.params.Points = raycaster.params.Points || {};
    raycaster.params.Points.threshold = Math.max(0.06, (pointSize || 0.2) * 0.25);
    const hits = raycaster.intersectObject(pointsObj, false);
    if (!hits || hits.length === 0) return null;
    const idx = hits[0].index;
    return (idx === undefined || idx === null) ? null : idx;
}

function getParticleSnapFromEvent(ev) {
    if (!(chkSnapParticle && chkSnapParticle.checked)) return null;
    if (!pointsObj || !renderer || !camera || !raycaster) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(mouse, camera);
    // 吸附更宽松的阈值，优先捕获鼠标附近的粒子
    raycaster.params.Points = raycaster.params.Points || {};
    raycaster.params.Points.threshold = Math.max(0.12, (pointSize || 0.2) * 0.6);
    const hits = raycaster.intersectObject(pointsObj, false);
    if (!hits || hits.length === 0) return null;
    const idx = hits[0].index;
    if (idx === null || idx === undefined) return null;
    if (!lastPoints || !lastPoints[idx]) return null;
    return lastPoints[idx];
}

function scrollCardToTop(cardEl) {
    if (!cardEl || !elCardsRoot) return;
    const c = elCardsRoot;
    const cr = c.getBoundingClientRect();
    const r = cardEl.getBoundingClientRect();
    const delta = (r.top - cr.top);
    // 让卡片顶端尽量贴近容器顶端
    c.scrollTop += delta - 8;
}

function focusCardById(id, recordHistory = true, scrollToTop = true) {
    if (!id) return false;
    setFocusedNode(id, recordHistory);
    requestAnimationFrame(() => {
        const el = elCardsRoot ? elCardsRoot.querySelector(`.card[data-id="${id}"]`) : null;
        if (el) {
            try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch {} }
            if (scrollToTop) {
                try { scrollCardToTop(el); } catch {}
            }
        }
    });
    return true;
}

function onCanvasClick(ev) {
    // ✅ 直线拾取用 pointerdown 处理，但浏览器仍会在 pointerup 后补一个 click。
    // 如果不屏蔽，这个 click 会走到下面的“点到空白处清空焦点”，导致聚焦丢失。
    if (suppressNextCanvasClick) {
        suppressNextCanvasClick = false;
        return;
    }

    // 拾取模式中由 onPointerDown 处理；此处不抢逻辑
    if (linePickMode || pointPickMode) return;

    // 防止因为 input blur 触发 focusout -> clearFocusedNodeIf（导致焦点先被清空，历史也变脏）
    suppressCardFocusOutClear = true;
    try {
        const ae = document.activeElement;
        if (ae && ae.blur) ae.blur();
    } catch {}
    suppressCardFocusOutClear = false;

    const idx = pickPointIndexFromEvent(ev);
    if (idx !== null) {
        const ownerId = ownerIdForPointIndex(idx);
        if (ownerId) {
            focusCardById(ownerId, true, true);
            return;
        }
    }

    // 点到空白处：清空焦点
    if (focusedNodeId) setFocusedNode(null, true);
}

    function animate() {
        requestAnimationFrame(animate);
        applyArrowPan();
        updateAxisLabelScale();
        controls.update();
        renderer.render(scene, camera);
    }

    // -------------------------
    // line pick / point pick
    // -------------------------
    function setLinePickStatus(text) {
        statusLinePick.textContent = text;
        statusLinePick.classList.remove("hidden");
    }

    function hideLinePickStatus() {
        statusLinePick.classList.add("hidden");
    }

    function setPointPickStatus(text) {
        setLinePickStatus(text);
    }

    function startLinePick(targetList, label, insertIndex = null) {
        _rClickT = 0;
        clearPickMarkers();
        ensureHoverMarker();
        setHoverMarkerColor(colorForPickIndex(0)); // 第一个点红
        hoverMarker.visible = true;
        linePickTargetList = targetList || state.root.children;
        linePickTargetLabel = label || "主Builder";
        linePickInsertIndex = (insertIndex === undefined ? null : insertIndex);
        // 记录进入拾取前的聚焦卡片：拾取新增完成后要把聚焦留在原卡片上
        linePickKeepFocusId = focusedNodeId;
        linePickMode = true;
        picked = [];
        setLinePickStatus(`${getPlaneInfo().label} 拾取模式[${linePickTargetLabel}]：请点第 1 点`);
    }

    function stopLinePick() {
        _rClickT = 0;
        clearPickMarkers();
        hideHoverMarker();
        linePickMode = false;
        picked = [];
        linePickInsertIndex = null;
        linePickKeepFocusId = null;
        hideLinePickStatus();
    }

    function startPointPick() {
        const target = activeVecTarget || (document.activeElement && document.activeElement.__vecTarget);
        if (!target) {
            setPointPickStatus("请先聚焦到需要输入点的字段（axis/start/end）");
            setTimeout(() => hideLinePickStatus(), 900);
            return;
        }
        activeVecTarget = target;
        if (linePickMode) stopLinePick();
        _rClickT = 0;
        pointPickTarget = target;
        pointPickKeepFocusId = focusedNodeId;
        pointPickMode = true;
        ensureHoverMarker();
        setHoverMarkerColor(0xffcc33);
        hoverMarker.visible = true;
        setPointPickStatus(`${getPlaneInfo().label} 点拾取：左键确定，右键取消`);
    }

    function stopPointPick() {
        hideHoverMarker();
        pointPickMode = false;
        pointPickTarget = null;
        pointPickKeepFocusId = null;
        _rClickT = 0;
        hideLinePickStatus();
    }

    function applyPointToTarget(p) {
        if (!pointPickTarget) return;
        const t = pointPickTarget;
        historyCapture("pick_point");
        t.obj[t.keys.x] = p.x;
        t.obj[t.keys.y] = p.y;
        t.obj[t.keys.z] = p.z;
        if (t.inputs) {
            t.inputs.x.value = String(p.x);
            t.inputs.y.value = String(p.y);
            t.inputs.z.value = String(p.z);
        }
        if (typeof t.onChange === "function") t.onChange();
        if (t.inputs && t.inputs.x && t.inputs.x.isConnected === false) {
            renderAll();
        }
        if (t.inputs && t.inputs.x) {
            try { t.inputs.x.focus({ preventScroll: true }); } catch { try { t.inputs.x.focus(); } catch {} }
        }
    }

    function onPointerMove(ev) {
        if (!linePickMode && !pointPickMode) return;
        if ((linePickMode || pointPickMode) && _rDown) {
            const d = Math.hypot(ev.clientX - _rDownX, ev.clientY - _rDownY);
            if (d > 6) _rMoved = true; // 视为拖动
            hideHoverMarker();
            return;
        }
        if (!renderer || !camera) return;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
        raycaster.setFromCamera(mouse, camera);
        const particle = getParticleSnapFromEvent(ev);

        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(pickPlane, hit)) {
            const mapped = mapPickPoint(hit, particle);
            if (linePickMode) {
                setHoverMarkerColor(colorForPickIndex((picked?.length || 0) >= 1 ? 1 : 0));
            } else {
                setHoverMarkerColor(0xffcc33);
            }
            showHoverMarker(mapped);
        } else {
            hideHoverMarker();
        }
    }

    function onPointerUp(ev) {
        if (!linePickMode && !pointPickMode) return;
        if (!_rDown) return;

        _rDown = false;

        // 右键拖动过：这是平移，不算点击，不参与双击取消
        if (_rMoved) {
            _rMoved = false;
            return;
        }

        // 没拖动：算一次“右键点击”
        const now = performance.now();
        const dx = ev.clientX - _rClickX;
        const dy = ev.clientY - _rClickY;
        const dist = Math.hypot(dx, dy);

        if (now - _rClickT < RDBL_MS && dist < RDBL_PX) {
            // ✅ 右键双击取消拾取
            if (linePickMode) stopLinePick();
            if (pointPickMode) stopPointPick();
            _rClickT = 0;
            return;
        }

        // 记录第一次点击
        _rClickT = now;
        _rClickX = ev.clientX;
        _rClickY = ev.clientY;
    }

    function onPointerDown(ev) {
        // 非拾取模式：点击/拖动预览主要用于 OrbitControls；选点聚焦由 click 事件处理
        if (!linePickMode && !pointPickMode) return;

        // ✅ 右键 / Ctrl+Click：不选点，只进入“可能的右键双击取消”判定流程
        if ((linePickMode || pointPickMode) && isRightLike(ev)) {
            _rDown = true;
            _rMoved = false;
            _rDownX = ev.clientX;
            _rDownY = ev.clientY;
            return; // 关键：右键永远不选点
        }

        // ✅ 只允许纯左键选点（排除 ctrlKey）
        if (ev.button !== 0 || ev.ctrlKey) return;

        // ✅ 屏蔽随后到来的 click（否则可能清空焦点/误聚焦）
        suppressNextCanvasClick = true;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
        raycaster.setFromCamera(mouse, camera);
        const particle = getParticleSnapFromEvent(ev);

        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(pickPlane, hit)) {
            const mapped = mapPickPoint(hit, particle);
            if (pointPickMode) {
                applyPointToTarget(mapped);
                stopPointPick();
                setTimeout(() => hideLinePickStatus(), 900);
                return;
            }
            const idx = picked.length; // 0=第一个点, 1=第二个点
            picked.push(mapped);

            addPickMarker(mapped, colorForPickIndex(idx));
            setHoverMarkerColor(colorForPickIndex(picked.length >= 1 ? 1 : 0));
            showHoverMarker(mapped);

            if (picked.length === 1) {
                setLinePickStatus(`${getPlaneInfo().label} 拾取模式[${linePickTargetLabel}]：已选第 1 点：(${U.fmt(mapped.x)}, ${U.fmt(mapped.y)}, ${U.fmt(mapped.z)})，再点第 2 点`);
            } else if (picked.length === 2) {
                const a = picked[0], b = picked[1];
                const list = linePickTargetList || state.root.children;
                // ✅ 允许撤销：把“新增直线”纳入历史栈
                historyCapture("pick_line_xz");

                const nn = makeNode("add_line", {
                    params: {sx: a.x, sy: a.y, sz: a.z, ex: b.x, ey: b.y, ez: b.z, count: 30}
                });

                // ✅ 支持插入位置：如果是从 withBuilder 或某张卡片后进入拾取，则按 insertIndex 插入并可连续插入
                if (linePickInsertIndex === null || linePickInsertIndex === undefined) {
                    list.push(nn);
                } else {
                    const at = Math.max(0, Math.min(linePickInsertIndex, list.length));
                    list.splice(at, 0, nn);
                    linePickInsertIndex = at + 1;
                }

                setLinePickStatus(`${getPlaneInfo().label} 拾取模式[${linePickTargetLabel}]：已添加 addLine（可在卡片里改 count）`);
                picked = [];
                linePickMode = false;
                // 退出拾取时清掉插入点；聚焦保留由 keepId 处理
                linePickInsertIndex = null;
                setTimeout(() => hideLinePickStatus(), 900);
                hideHoverMarker();
                clearPickMarkers();
                const keepId = linePickKeepFocusId;
                renderAll();
                // 用户要求：若进入拾取前聚焦在 withBuilder，则拾取新增后仍保持聚焦在原卡片上
                if (keepId) {
                    requestAnimationFrame(() => {
                        suppressFocusHistory = true;
                        const el = elCardsRoot.querySelector(`.card[data-id="${keepId}"]`);
                        if (el) {
                            try { el.focus(); } catch {}
                            try { el.scrollIntoView({ block: "nearest" }); } catch {}
                            setFocusedNode(keepId, false);
                        }
                    suppressFocusHistory = false;
                    });
                }
            }
        }
    }

    // -------------------------
    // UI render
    // -------------------------
    let rebuildTimer = null;

    function rebuildPreviewAndKotlin() {
        if (rebuildTimer) cancelAnimationFrame(rebuildTimer);
        rebuildTimer = requestAnimationFrame(() => {
            const res = evalBuilderWithMeta(state.root.children, U.v(0, 1, 0));
            nodePointSegments = res.segments;
            pointOwnerByIndex = buildPointOwnerByIndex(res.points.length, res.segments);
            setPoints(res.points);
            // setPoints 内部会根据 focusedNodeId 重新上色
            setKotlinOut(emitKotlin());
            scheduleAutoSave();
        });
    }

    function renderAll() {
        // 保持选中卡片：用于高亮 & 插入规则（withBuilder 内新增等）
        applyCollapseAllStates();
        renderCards();
        if (paramSync && paramSync.open && typeof renderSyncMenu === "function") renderSyncMenu();
        // 如果选中的卡片已不存在，则清空
        if (focusedNodeId && !linePickMode) {
            const ctx = findNodeContextById(focusedNodeId);
            if (!ctx) focusedNodeId = null;
        }
        rebuildPreviewAndKotlin();
    }


    // ------- Modal -------
    let addTarget = { list: null, insertIndex: null, ownerLabel: "主Builder", ownerNodeId: null, keepFocusId: null };

    function showModal() {
        // ✅ 任何时候打开「添加卡片」都必须是可交互的（不能遗留 under）
        modal.classList.remove("under");
        modalMask.classList.remove("under");
        modal.classList.remove("hidden");
        modalMask.classList.remove("hidden");
        cardSearch.value = "";
        renderPicker("");
        cardSearch.focus();
    }

    function hideModal() {
        modal.classList.add("hidden");
        modalMask.classList.add("hidden");
        // 清理 under 状态，避免下次打开还是模糊不可点
        modal.classList.remove("under");
        modalMask.classList.remove("under");
    }

    function openModal(targetList, insertIndex = null, ownerLabel = "主Builder", ownerNodeId = null) {
        // ✅ 记录插入目标 + 需要保持的焦点（在子 builder 内新增后，默认保持聚焦在 withBuilder 上）
        addTarget = {
            list: targetList || null,
            insertIndex: insertIndex,
            ownerLabel,
            ownerNodeId: ownerNodeId || null,
            keepFocusId: ownerNodeId || null,
        };
        showModal();
    }

    function renderPicker(filterText) {
        const f = (filterText || "").trim().toLowerCase();
        cardPicker.innerHTML = "";
        const entries = Object.entries(KIND).map(([kind, def], order) => ({kind, def, order}));

        const shown = [];
        for (const it of entries) {
            const title = ((it.def?.title || it.kind) + "").toLowerCase();
            const kind = (it.kind || "").toLowerCase();
            const desc = ((it.def?.desc || "") + "").toLowerCase();
            if (!f) {
                shown.push({it, group: 0, score: 0, order: it.order});
                continue;
            }
            const tIdx = title.indexOf(f);
            const kIdx = kind.indexOf(f);
            const bestTitleIdx = [tIdx, kIdx].filter(v => v >= 0).reduce((a, b) => Math.min(a, b), Infinity);
            const dIdx = desc.indexOf(f);
            if (Number.isFinite(bestTitleIdx)) {
                shown.push({it, group: 0, score: bestTitleIdx, order: it.order});
            } else if (dIdx >= 0) {
                shown.push({it, group: 1, score: dIdx, order: it.order});
            }
        }

        if (f) {
            shown.sort((a, b) => {
                if (a.group !== b.group) return a.group - b.group;
                if (a.score !== b.score) return a.score - b.score;
                return a.order - b.order;
            });
        } else {
            shown.sort((a, b) => a.order - b.order);
        }

        for (const {it} of shown) {
            const div = document.createElement("div");
            div.className = "pickitem";
            const t = document.createElement("div");
            t.className = "t";
            t.textContent = it.def.title;
            const d = document.createElement("div");
            d.className = "d";
            d.textContent = it.def.desc || it.kind;
            div.appendChild(t);
            div.appendChild(d);

            // 显示该卡片的快捷键（如果有）
            const hk = hotkeys && hotkeys.kinds ? (hotkeys.kinds[it.kind] || "") : "";
            if (hk) {
                const bad = document.createElement("div");
                bad.className = "hkbad";
                bad.textContent = hotkeyToHuman(hk);
                div.appendChild(bad);
            }
            // 在“选择添加”里提供快速设置快捷键
            const setBtn = document.createElement("button");
            setBtn.className = "sethk";
            setBtn.textContent = "⌨";
            setBtn.title = "设置该卡片的快捷键";
            setBtn.addEventListener("click", (ev) => {
                ev.stopPropagation();
                openHotkeysModal();
                beginHotkeyCapture({type:"kind", id: it.kind, title: it.def.title});
            });
            div.appendChild(setBtn);

            div.addEventListener("click", () => {
                const list = addTarget.list || state.root.children;
                const atRaw = addTarget.insertIndex;
                historyCapture("add_" + it.kind);
                const nn = makeNode(it.kind);
                if (atRaw === null || atRaw === undefined) {
                    list.push(nn);
                } else {
                    const at = Math.max(0, Math.min(atRaw, list.length));
                    list.splice(at, 0, nn);
                    // 连续添加时，保持插入点向后移动
                    addTarget.insertIndex = at + 1;
                }
                ensureAxisEverywhere();
                // ✅ 子 builder 内新增：默认保持聚焦在 withBuilder 上；否则聚焦到新卡片
                const focusAfter = (addTarget.keepFocusId && findNodeContextById(addTarget.keepFocusId))
                    ? addTarget.keepFocusId
                    : nn.id;

                hideModal();
                renderAll();

                requestAnimationFrame(() => {
                    suppressFocusHistory = true;
                    focusCardById(focusAfter, false, true);
                    suppressFocusHistory = false;
                });
            });
            cardPicker.appendChild(div);
        }
    }

    btnCloseModal.addEventListener("click", hideModal);
    btnCancelModal.addEventListener("click", hideModal);
    modalMask.addEventListener("click", hideModal);
    cardSearch.addEventListener("input", () => renderPicker(cardSearch.value));


    // -------------------------
    // Insert context (based on selected / focused card)
    // -------------------------
    function getInsertContextFromFocus() {
        if (focusedNodeId) {
            const ctx = findNodeContextById(focusedNodeId);
            if (ctx && ctx.node) {
                if (isBuilderContainerKind(ctx.node.kind)) {
                    if (!Array.isArray(ctx.node.children)) ctx.node.children = [];
                    return { list: ctx.node.children, insertIndex: ctx.node.children.length, label: "子Builder", ownerNode: ctx.node };
                }
                // 普通卡片：插到它后面（同一列表）
                const label = ctx.parentNode ? "子Builder" : "主Builder";
                return { list: ctx.parentList, insertIndex: ctx.index + 1, label, ownerNode: ctx.parentNode || null };
            }
        }
        return { list: state.root.children, insertIndex: state.root.children.length, label: "主Builder", ownerNode: null };
    }

    function addKindInContext(kind, ctx) {
        const list = ctx?.list || state.root.children;
        const at = (ctx && ctx.insertIndex != null) ? ctx.insertIndex : list.length;
        historyCapture("hotkey_add_" + kind);
        const nn = makeNode(kind);
        const idx = Math.max(0, Math.min(at, list.length));
        list.splice(idx, 0, nn);
        ensureAxisEverywhere();
        renderAll();

        // ✅ 若是在 withBuilder 内新增，则保持聚焦在 withBuilder；否则聚焦新卡片
        const focusAfter = (ctx && ctx.ownerNode && isBuilderContainerKind(ctx.ownerNode.kind)) ? ctx.ownerNode.id : nn.id;
        requestAnimationFrame(() => {
            suppressFocusHistory = true;
            focusCardById(focusAfter, false, true);
            suppressFocusHistory = false;
        });
    }

    // -------------------------
    // Global keyboard shortcuts
    // -------------------------
    window.addEventListener("keydown", (e) => {
        // 1) Hotkey capture mode (for settings)
        if (typeof handleHotkeyCaptureKeydown === "function" && handleHotkeyCaptureKeydown(e)) return;

        const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
        const mod = isMac ? e.metaKey : e.ctrlKey;
        const key = (e.key || "").toLowerCase();
        if (mod && key === "s" && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            if (btnSaveJson) btnSaveJson.click();
            return;
        }

        // Esc closes modal / hotkeys menu
        if (e.code === "Escape") {
            if (hkModal && !hkModal.classList.contains("hidden")) {
                e.preventDefault();
                hideHotkeysModal();
                return;
            }
            if (modal && !modal.classList.contains("hidden")) {
                e.preventDefault();
                hideModal();
                return;
            }
        }

        // 2) Undo/Redo should work everywhere (including inputs)
        if (hotkeyMatchEvent(e, hotkeys.actions.undo)) {
            e.preventDefault();
            historyUndo();
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.redo)) {
            e.preventDefault();
            historyRedo();
            return;
        }

        // Arrow keys: pan like right-drag (avoid when typing)
        if (isArrowKey(e.code) && !shouldIgnoreArrowPan()) {
            e.preventDefault();
            panKeyState[e.code] = true;
            return;
        }

        // ignore plain single-key hotkeys when typing
        const isPlainKey = !(e.ctrlKey || e.metaKey || e.altKey);
        if (isPlainKey && shouldIgnorePlainHotkeys()) return;

        // when Add-Card modal is open, avoid triggering kind hotkeys while typing search
        if (!modal.classList.contains("hidden") && document.activeElement === cardSearch && isPlainKey) {
            // allow Esc handled elsewhere
            return;
        }

        // 2.5) Delete focused card (plain key)
        // 为了避免“在弹窗里误删卡片”，当任意弹窗打开时不响应删除快捷键
        if ((modal && !modal.classList.contains("hidden")) || (hkModal && !hkModal.classList.contains("hidden"))) {
            // 仍然允许 undo/redo 在上面已经处理
        } else {
            const ae = document.activeElement;
            const tag = (ae && ae.tagName ? String(ae.tagName).toUpperCase() : "");
            const isTypingField = !!(ae && (tag === "INPUT" || tag === "TEXTAREA" || ae.isContentEditable));
            // 删除快捷键不应该在编辑输入时触发（尤其是 number 输入里的 Backspace）
            if (!isTypingField) {
                const delHk = hotkeys.actions.deleteFocused || "";
                const delMatch = hotkeyMatchEvent(e, delHk)
                    // 兼容：用户默认是 Backspace，但很多键盘会按 Delete
                    || (normalizeHotkey(delHk) === "Backspace" && (e.code === "Delete" || e.code === "Backspace") && !(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey));
                if (delMatch) {
                    e.preventDefault();
                    deleteFocusedCard();
                    return;
                }
            }
        }

        // 3) Open picker
        if (hotkeyMatchEvent(e, hotkeys.actions.openPicker)) {
            e.preventDefault();
            // 若快捷键弹窗打开，优先关闭（避免叠窗状态残留）
            if (hkModal && !hkModal.classList.contains("hidden")) {
                hideHotkeysModal();
            }
            const ctx = getInsertContextFromFocus();
            const ownerNodeId = (ctx && ctx.ownerNode && isBuilderContainerKind(ctx.ownerNode.kind)) ? ctx.ownerNode.id : null;
            openModal(ctx.list, ctx.insertIndex, ctx.label, ownerNodeId);
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.toggleFullscreen)) {
            e.preventDefault();
            if (modal && !modal.classList.contains("hidden")) hideModal();
            if (hkModal && !hkModal.classList.contains("hidden")) hideHotkeysModal();
            toggleFullscreen();
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.resetCamera)) {
            e.preventDefault();
            resetCameraToPoints();
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.importJson)) {
            e.preventDefault();
            if (modal && !modal.classList.contains("hidden")) hideModal();
            if (hkModal && !hkModal.classList.contains("hidden")) hideHotkeysModal();
            triggerImportJson();
            return;
        }

        // 4) Pick line XZ
        if (hotkeyMatchEvent(e, hotkeys.actions.pickLineXZ)) {
            e.preventDefault();
            // 进入拾取模式前，关闭弹窗，避免鼠标事件被遮罩拦截
            if (modal && !modal.classList.contains("hidden")) hideModal();
            if (hkModal && !hkModal.classList.contains("hidden")) hideHotkeysModal();

            if (linePickMode) stopLinePick();
            else {
                const ctx = getInsertContextFromFocus();
                startLinePick(ctx.list, ctx.label, ctx.insertIndex);
            }
            return;
        }

        // 4.5) Pick point (fill focused vec3)
        if (hotkeyMatchEvent(e, hotkeys.actions.pickPoint)) {
            e.preventDefault();
            if (modal && !modal.classList.contains("hidden")) hideModal();
            if (hkModal && !hkModal.classList.contains("hidden")) hideHotkeysModal();
            if (pointPickMode) stopPointPick();
            else {
                if (linePickMode) stopLinePick();
                startPointPick();
            }
            return;
        }

        // 4.6) Snap plane quick switch
        if (hotkeyMatchEvent(e, hotkeys.actions.snapPlaneXZ)) {
            e.preventDefault();
            setSnapPlane("XZ");
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.snapPlaneXY)) {
            e.preventDefault();
            setSnapPlane("XY");
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.snapPlaneZY)) {
            e.preventDefault();
            setSnapPlane("ZY");
            return;
        }

        // 4.6.1) Mirror plane quick switch
        if (hotkeyMatchEvent(e, hotkeys.actions.mirrorPlaneXZ)) {
            e.preventDefault();
            setMirrorPlane("XZ");
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.mirrorPlaneXY)) {
            e.preventDefault();
            setMirrorPlane("XY");
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.mirrorPlaneZY)) {
            e.preventDefault();
            setMirrorPlane("ZY");
            return;
        }

        // 4.7) Copy focused / mirror copy
        if (hotkeyMatchEvent(e, hotkeys.actions.copyFocused)) {
            if ((modal && !modal.classList.contains("hidden")) || (hkModal && !hkModal.classList.contains("hidden"))) return;
            e.preventDefault();
            copyFocusedCard();
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.mirrorCopy)) {
            if ((modal && !modal.classList.contains("hidden")) || (hkModal && !hkModal.classList.contains("hidden"))) return;
            e.preventDefault();
            mirrorCopyFocusedCard();
            return;
        }

        // 5) Add specific kind
        for (const [kind, hk] of Object.entries(hotkeys.kinds || {})) {
            if (!hk) continue;
            if (hotkeyMatchEvent(e, hk)) {
                e.preventDefault();
                const ctx = getInsertContextFromFocus();
                addKindInContext(kind, ctx);
                return;
            }
        }
    }, true);

    window.addEventListener("keyup", (e) => {
        if (isArrowKey(e.code)) {
            panKeyState[e.code] = false;
        }
    }, true);

    window.addEventListener("blur", () => {
        panKeyState.ArrowUp = false;
        panKeyState.ArrowDown = false;
        panKeyState.ArrowLeft = false;
        panKeyState.ArrowRight = false;
    });

    const cardSystem = initCardSystem({
        KIND,
        elCardsRoot,
        row,
        inputNum,
        select,
        checkbox,
        makeVec3Editor,
        historyCapture,
        rebuildPreviewAndKotlin,
        openModal,
        mirrorCopyNode,
        cloneNodeDeep,
        cloneNodeListDeep,
        makeNode,
        ensureAxisEverywhere,
        ensureAxisInList,
        isBuilderContainerKind,
        showToast,
        pickReasonableFocusAfterDelete,
        bindCardBodyResizer,
        bindSubblockWidthResizer,
        bindSubblockHeightResizer,
        handleBuilderDrop,
        tryCopyWithBuilderIntoAddWith,
        moveNodeById,
        downloadText,
        deepClone,
        fileBuilderJson,
        stopLinePick,
        startLinePick,
        stopPointPick,
        uid,
        getState: () => state,
        getRenderAll: () => renderAll,
        getFocusedNodeId: () => focusedNodeId,
        setFocusedNode,
        clearFocusedNodeIf,
        updateFocusCardUI,
        getIsRenderingCards: () => isRenderingCards,
        setIsRenderingCards: (v) => { isRenderingCards = v; },
        getSuppressCardFocusOutClear: () => suppressCardFocusOutClear,
        getMirrorPlaneInfo,
        getMirrorPlane: () => mirrorPlane,
        getVisibleEntries: () => getVisibleEntries,
        getCleanupFilterMenus: () => cleanupFilterMenus,
        getIsFilterActive: () => isFilterActive,
        getFindVisibleSwapIndex: () => findVisibleSwapIndex,
        getSwapInList: () => swapInList,
        getCreateFilterControls: () => createFilterControls,
        getCreateParamSyncControls: () => createParamSyncControls,
        getParamSync: () => paramSync,
        getIsSyncSelectableEvent: () => isSyncSelectableEvent,
        getToggleSyncTarget: () => toggleSyncTarget,
        getBuilderJsonTargetNode: () => builderJsonTargetNode,
        setBuilderJsonTargetNode: (node) => { builderJsonTargetNode = node; },
        getLinePickMode: () => linePickMode,
        getPointPickMode: () => pointPickMode,
        isCollapseAllActive,
        getCollapseScope,
        collapseAllInScope,
        expandAllInScope
    });
    ({
        renderCards,
        renderParamsEditors,
        layoutActionOverflow,
        initCollapseAllControls,
        setupListDropZone,
        addQuickOffsetTo
    } = cardSystem);

    const filterSystem = initFilterSystem({
        KIND,
        showToast,
        elCardsRoot,
        deepClone,
        findNodeContextById,
        renderCards: () => renderCards(),
        rebuildPreviewAndKotlin: () => rebuildPreviewAndKotlin(),
        renderParamsEditors: (...args) => renderParamsEditors(...args)
    });
    ({
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
        paramSync
    } = filterSystem);

    // -------------------------
    // Top buttons
    // -------------------------
    function triggerImportJson() {
        if (focusedNodeId) {
            const ctx = findNodeContextById(focusedNodeId);
            if (ctx && ctx.node && isBuilderContainerKind(ctx.node.kind)) {
                builderJsonTargetNode = ctx.node;
                fileBuilderJson && fileBuilderJson.click();
                return;
            }
        }
        fileJson && fileJson.click();
    }

    function doExportKotlin() {
        setKotlinOut(emitKotlin());
    }

    function doCopyKotlin() {
        const text = kotlinRaw || emitKotlin();
        if (!kotlinRaw) setKotlinOut(text);
        navigator.clipboard?.writeText(text);
    }

    function doDownloadKotlin() {
        const text = kotlinRaw || emitKotlin();
        if (!kotlinRaw) setKotlinOut(text);
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = makeExportFileName("kt", "PointsBuilder_Generated");
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 200);
    }

    btnExportKotlin.addEventListener("click", doExportKotlin);
    btnExportKotlin2.addEventListener("click", doExportKotlin);
    btnToggleKotlin && btnToggleKotlin.addEventListener("click", () => setKotlinHidden(!isKotlinHidden()));
    btnCopyKotlin.addEventListener("click", doCopyKotlin);
    btnCopyKotlin2.addEventListener("click", doCopyKotlin);
    btnDownloadKotlin && btnDownloadKotlin.addEventListener("click", doDownloadKotlin);
    btnDownloadKotlin2 && btnDownloadKotlin2.addEventListener("click", doDownloadKotlin);
    if (selKotlinEnd) {
        selKotlinEnd.value = kotlinEndMode;
        selKotlinEnd.addEventListener("change", () => {
            kotlinEndMode = selKotlinEnd.value || "builder";
            saveKotlinEndMode(kotlinEndMode);
            setKotlinOut(emitKotlin());
        });
    }
    if (inpProjectName) {
        inpProjectName.value = projectName || "";
        inpProjectName.addEventListener("input", () => {
            projectName = sanitizeFileBase(inpProjectName.value || "");
            saveProjectName(projectName);
            if (inpProjectName.value !== projectName) inpProjectName.value = projectName;
        });
    }

    btnAddCard.addEventListener("click", () => {
            const ctx = getInsertContextFromFocus();
            const ownerNodeId = (ctx && ctx.ownerNode && isBuilderContainerKind(ctx.ownerNode.kind)) ? ctx.ownerNode.id : null;
            openModal(ctx.list, ctx.insertIndex, ctx.label, ownerNodeId);
        });
    btnQuickOffset.addEventListener("click", () => {
        const ctx = getInsertContextFromFocus();
        addQuickOffsetTo(ctx.list);
    });

    btnPickLine.addEventListener("click", () => {
        if (linePickMode) stopLinePick();
        else {
            if (pointPickMode) stopPointPick();
            const ctx = getInsertContextFromFocus();
            startLinePick(ctx.list, ctx.label, ctx.insertIndex);
        }
    });
    btnPickPoint && btnPickPoint.addEventListener("click", () => {
        if (pointPickMode) {
            stopPointPick();
        } else {
            if (linePickMode) stopLinePick();
            startPointPick();
        }
    });

    btnFullscreen.addEventListener("click", toggleFullscreen);

    btnSaveJson.addEventListener("click", async () => {
        const text = JSON.stringify(state, null, 2);
        // 选择保存位置与名字（若浏览器支持 File System Access API）
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: makeExportFileName("json", "shape"),
                    types: [{ description: "JSON", accept: {"application/json": [".json"]} }]
                });
                const writable = await handle.createWritable();
                await writable.write(text);
                await writable.close();
                showToast("保存成功", "success");
                return;
            } catch (e) {
                if (e && e.name === "AbortError") {
                    showToast("取消保存", "error");
                    return;
                }
                console.warn("showSaveFilePicker failed:", e);
                showToast(`保存失败：${e.message || e}`, "error");
                return;
            }
        }
        try {
            downloadText(makeExportFileName("json", "shape"), text, "application/json");
            showToast("保存成功", "success");
        } catch (e) {
            showToast(`保存失败：${e.message || e}`, "error");
        }
    });

    btnLoadJson.addEventListener("click", () => fileJson.click());
    fileJson.addEventListener("change", async () => {
        const f = fileJson.files && fileJson.files[0];
        if (!f) return;
        const text = await f.text();
        try {
            const obj = JSON.parse(text);
            if (!obj || !obj.root || !Array.isArray(obj.root.children)) throw new Error("invalid json");
            historyCapture("import_json");
            state = obj;
            ensureAxisEverywhere();
            renderAll();
            showToast("导入成功", "success");
        } catch (e) {
            showToast(`导入失败-格式错误(${e.message || e})`, "error");
        } finally {
            fileJson.value = "";
        }
    });

    fileBuilderJson && fileBuilderJson.addEventListener("change", async () => {
        const f = fileBuilderJson.files && fileBuilderJson.files[0];
        if (!f) return;
        const target = builderJsonTargetNode;
        try {
            const text = await f.text();
            const obj = JSON.parse(text);
            if (!obj || !obj.root || !Array.isArray(obj.root.children)) throw new Error("invalid json");
            if (!target) throw new Error("no target");
            historyCapture("import_with_builder_json");
            target.children = obj.root.children;
            ensureAxisInList(target.children);
            renderAll();
            showToast("导入成功", "success");
        } catch (e) {
            showToast(`导入失败-格式错误(${e.message || e})`, "error");
        } finally {
            builderJsonTargetNode = null;
            fileBuilderJson.value = "";
        }
    });

    btnReset.addEventListener("click", () => {
        if (!confirm("确定重置全部卡片？")) return;
        historyCapture("reset");
        state = {root: {id: "root", kind: "ROOT", children: []}};
        renderAll();
    });

    // -------------------------
    // Boot
    // -------------------------
    applyLayoutState(false);
    bindResizers();
    updateKotlinToggleText();
    window.addEventListener("resize", () => applyLayoutState(true));
    window.addEventListener("beforeunload", () => {
        const json = safeStringifyState(state);
        if (json && json !== lastSavedStateJson) saveAutoState(state);
    });
    initThree();
    setupListDropZone(elCardsRoot, () => state.root.children, () => null);
    initCollapseAllControls();
    if (typeof bindParamSyncListeners === "function") bindParamSyncListeners();
    if (typeof refreshHotkeyHints === "function") refreshHotkeyHints();
    renderAll();
})();

