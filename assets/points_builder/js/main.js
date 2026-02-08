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
    const settingsModal = document.getElementById("settingsModal");
    const settingsMask = document.getElementById("settingsMask");
    const btnCloseSettings = document.getElementById("btnCloseSettings");
    const btnOpenHotkeys = document.getElementById("btnOpenHotkeys");

    const threeHost = document.getElementById("threeHost");
    const chkAxes = document.getElementById("chkAxes");
    const chkGrid = document.getElementById("chkGrid");
    const chkRealtimeKotlin = document.getElementById("chkRealtimeKotlin");
    const chkPointPickPreview = document.getElementById("chkPointPickPreview");
    const btnResetCamera = document.getElementById("btnResetCamera");
    const themeSelect = document.getElementById("themeSelect");
    const chkSnapGrid = document.getElementById("chkSnapGrid");
    const chkSnapParticle = document.getElementById("chkSnapParticle");
    const selSnapPlane = document.getElementById("selSnapPlane");
    const selMirrorPlane = document.getElementById("selMirrorPlane");
    const inpPointSize = document.getElementById("inpPointSize");
    const inpParamStep = document.getElementById("inpParamStep");
    const inpOffsetPreviewLimit = document.getElementById("inpOffsetPreviewLimit");
    const inpSnapStep = document.getElementById("inpSnapStep");
    const inpSnapParticleRange = document.getElementById("inpSnapParticleRange");
    const statusLinePick = document.getElementById("statusLinePick");
    const statusPoints = document.getElementById("statusPoints");

    const layoutEl = document.querySelector(".layout");
    const panelLeft = document.querySelector(".panel.left");
    const panelRight = document.querySelector(".panel.right");
    const resizerLeft = document.querySelector(".resizer-left");
    const resizerRight = document.querySelector(".resizer-right");
    let actionMenuEl = null;
    let actionMenuListEl = null;
    let quickSyncPanelEl = null;
    let quickSyncEditorHostEl = null;
    let quickSyncTitleEl = null;
    let quickSyncHintEl = null;
    let quickSyncState = null;
    let quickSyncHistoryLockTimer = 0;

    // -------------------------
    // helpers
    // -------------------------
    const uid = () => (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16);

    function isDragCopyAllowedTarget(target) {
        if (!target || !target.closest) return false;
        if (target.closest("input, textarea")) return true;
        if (target.closest("#kotlinOut")) return true;
        return false;
    }

    function isInternalDragHandleTarget(target) {
        if (!target || !target.closest) return false;
        return !!target.closest(".handle, .drag-handle");
    }

    function bindDragCopyGuards() {
        if (document.__pbDragCopyGuardBound) return;
        document.__pbDragCopyGuardBound = true;

        document.addEventListener("selectstart", (ev) => {
            if (isDragCopyAllowedTarget(ev.target)) return;
            ev.preventDefault();
        }, true);

        document.addEventListener("dragstart", (ev) => {
            if (isInternalDragHandleTarget(ev.target)) return;
            if (isDragCopyAllowedTarget(ev.target)) return;
            ev.preventDefault();
        }, true);
    }

    function ensureActionMenuEl() {
        if (actionMenuEl && actionMenuListEl) return actionMenuEl;
        const wrap = document.createElement("div");
        wrap.id = "pbActionMenu";
        wrap.className = "pb-context-menu hidden";
        const list = document.createElement("div");
        list.className = "pb-context-menu-list";
        wrap.appendChild(list);
        wrap.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
        });
        wrap.addEventListener("pointerdown", (ev) => ev.stopPropagation(), true);
        document.body.appendChild(wrap);
        actionMenuEl = wrap;
        actionMenuListEl = list;
        return wrap;
    }

    function hideActionMenu() {
        if (!actionMenuEl) return;
        actionMenuEl.classList.add("hidden");
    }

    function clonePlain(value) {
        if (typeof deepClone === "function") return deepClone(value);
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function diffPlain(prev, next) {
        const diffs = [];
        const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
        const isArr = (v) => Array.isArray(v);
        const walk = (a, b, path) => {
            if (isObj(a) && isObj(b)) {
                const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
                for (const k of keys) walk(a[k], b[k], path.concat(k));
                return;
            }
            if (isArr(a) || isArr(b)) {
                if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ path, value: clonePlain(b) });
                return;
            }
            if (a !== b) diffs.push({ path, value: b });
        };
        walk(prev || {}, next || {}, []);
        return diffs;
    }

    function applyPlainDiff(target, diffs) {
        if (!target || !Array.isArray(diffs) || !diffs.length) return;
        for (const d of diffs) {
            const path = Array.isArray(d.path) ? d.path : [];
            if (!path.length) continue;
            let cur = target;
            for (let i = 0; i < path.length - 1; i++) {
                const k = path[i];
                if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
                cur = cur[k];
            }
            cur[path[path.length - 1]] = clonePlain(d.value);
        }
    }

    function ensureQuickSyncPanelEl() {
        if (quickSyncPanelEl && quickSyncEditorHostEl && quickSyncTitleEl && quickSyncHintEl) return quickSyncPanelEl;
        const panel = document.createElement("div");
        panel.id = "pbQuickSyncPanel";
        panel.className = "pb-context-panel hidden";
        const head = document.createElement("div");
        head.className = "pb-context-panel-head";
        const title = document.createElement("div");
        title.className = "pb-context-panel-title";
        title.textContent = "参数同步";
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "pb-context-panel-close";
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", () => hideQuickSyncPanel());
        head.appendChild(title);
        head.appendChild(closeBtn);
        const hint = document.createElement("div");
        hint.className = "pb-context-panel-hint";
        const editor = document.createElement("div");
        editor.className = "pb-context-panel-editor";
        panel.appendChild(head);
        panel.appendChild(hint);
        panel.appendChild(editor);
        panel.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
        });
        panel.addEventListener("pointerdown", (ev) => ev.stopPropagation(), true);
        document.body.appendChild(panel);
        quickSyncPanelEl = panel;
        quickSyncEditorHostEl = editor;
        quickSyncTitleEl = title;
        quickSyncHintEl = hint;
        return panel;
    }

    function hideQuickSyncPanel() {
        if (quickSyncPanelEl) quickSyncPanelEl.classList.add("hidden");
        if (quickSyncEditorHostEl && quickSyncEditorHostEl.__pbQuickSyncInputHandler) {
            quickSyncEditorHostEl.removeEventListener("input", quickSyncEditorHostEl.__pbQuickSyncInputHandler);
            quickSyncEditorHostEl.__pbQuickSyncInputHandler = null;
        }
        if (quickSyncEditorHostEl && quickSyncEditorHostEl.__pbQuickSyncChangeHandler) {
            quickSyncEditorHostEl.removeEventListener("change", quickSyncEditorHostEl.__pbQuickSyncChangeHandler);
            quickSyncEditorHostEl.__pbQuickSyncChangeHandler = null;
        }
        quickSyncState = null;
    }

    function positionFloatingPanel(panelEl, clientX, clientY) {
        if (!panelEl) return;
        const margin = 8;
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        panelEl.style.left = "-9999px";
        panelEl.style.top = "-9999px";
        const rect = panelEl.getBoundingClientRect();
        const maxLeft = Math.max(margin, vw - rect.width - margin);
        const maxTop = Math.max(margin, vh - rect.height - margin);
        const left = Math.max(margin, Math.min(clientX, maxLeft));
        const top = Math.max(margin, Math.min(clientY, maxTop));
        panelEl.style.left = `${Math.round(left)}px`;
        panelEl.style.top = `${Math.round(top)}px`;
    }

    function showActionMenu(clientX, clientY, items) {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) {
            hideActionMenu();
            return false;
        }
        const wrap = ensureActionMenuEl();
        const host = actionMenuListEl;
        if (!wrap || !host) return false;
        host.innerHTML = "";
        for (const item of list) {
            if (!item || !item.label || typeof item.onSelect !== "function") continue;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `pb-context-menu-item${item.danger ? " danger" : ""}`;
            btn.textContent = item.label;
            btn.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                hideActionMenu();
                item.onSelect();
            });
            host.appendChild(btn);
        }
        if (!host.children.length) {
            hideActionMenu();
            return false;
        }
        wrap.classList.remove("hidden");
        positionFloatingPanel(wrap, clientX, clientY);
        return true;
    }

    function bindActionMenuDismiss() {
        if (document.__pbActionMenuBound) return;
        document.__pbActionMenuBound = true;
        document.addEventListener("pointerdown", (ev) => {
            if (!actionMenuEl || actionMenuEl.classList.contains("hidden")) return;
            if (actionMenuEl.contains(ev.target)) return;
            hideActionMenu();
        }, true);
        document.addEventListener("pointerdown", (ev) => {
            if (!quickSyncPanelEl || quickSyncPanelEl.classList.contains("hidden")) return;
            if (quickSyncPanelEl.contains(ev.target)) return;
            hideQuickSyncPanel();
        }, true);
        window.addEventListener("resize", () => {
            hideActionMenu();
            hideQuickSyncPanel();
        });
        window.addEventListener("scroll", () => {
            hideActionMenu();
            hideQuickSyncPanel();
        }, true);
        window.addEventListener("blur", () => {
            hideActionMenu();
            hideQuickSyncPanel();
        });
        window.addEventListener("keydown", (ev) => {
            if (ev.code === "Escape") {
                hideActionMenu();
                hideQuickSyncPanel();
            }
        }, true);
    }

    const THEMES = [
        { id: "dark-1", label: "夜岚" },
        { id: "dark-2", label: "深潮" },
        { id: "dark-3", label: "焰砂" },
        { id: "light-1", label: "雾蓝" },
        { id: "light-2", label: "杏露" },
        { id: "light-3", label: "薄荷" }
    ];
    const THEME_ORDER = THEMES.map(t => t.id);
    const THEME_KEY = "pb_theme_v2";
    const hasTheme = (id) => THEMES.some(t => t.id === id);
    const normalizeTheme = (id) => {
        if (id === "dark") return "dark-1";
        if (id === "light") return "light-1";
        return hasTheme(id) ? id : "dark-1";
    };
    const readCssColor = (name, fallback) => {
        if (!document || !document.body) return fallback;
        const v = getComputedStyle(document.body).getPropertyValue(name).trim();
        return v || fallback;
    };
    const applySceneTheme = () => {
        const gridColor = readCssColor("--grid-color", "#223344");
        const pointColor = readCssColor("--point-color", "#ffffff");
        const focusColor = readCssColor("--point-focus", "#ffcc33");
        const syncColor = readCssColor("--point-sync", "#5dd6ff");
        const offsetColor = readCssColor("--point-offset", "#ff6ad5");

        defaultPointColor.set(pointColor);
        focusPointColor.set(focusColor);
        syncPointColor.set(syncColor);
        offsetPointColor.set(offsetColor);

        if (gridHelper && scene) {
            const wasVisible = gridHelper.visible;
            try {
                scene.remove(gridHelper);
                gridHelper.geometry && gridHelper.geometry.dispose();
                if (Array.isArray(gridHelper.material)) {
                    gridHelper.material.forEach(m => m && m.dispose && m.dispose());
                } else if (gridHelper.material && gridHelper.material.dispose) {
                    gridHelper.material.dispose();
                }
            } catch {}
            gridHelper = new THREE.GridHelper(256, 256, gridColor, gridColor);
            gridHelper.position.y = -0.01;
            gridHelper.visible = wasVisible;
            scene.add(gridHelper);
            updateGridForPlane();
        }
        refreshPointBaseColors();
    };
    const applyTheme = (id) => {
        const finalId = normalizeTheme(id);
        document.body.setAttribute("data-theme", finalId);
        if (themeSelect && themeSelect.value !== finalId) themeSelect.value = finalId;
        applySceneTheme();
    };
    const initTheme = () => {
        const saved = localStorage.getItem(THEME_KEY) || "";
        const initial = normalizeTheme(saved || "dark-1");
        applyTheme(initial);
        localStorage.setItem(THEME_KEY, initial);
        if (!themeSelect) return;
        themeSelect.addEventListener("change", () => {
            const next = normalizeTheme(themeSelect.value);
            applyTheme(next);
            localStorage.setItem(THEME_KEY, next);
            saveSettingsToStorage();
        });
    };
    const cycleTheme = (dir) => {
        const cur = document.body.getAttribute("data-theme") || "dark-1";
        const idx = Math.max(0, THEME_ORDER.indexOf(cur));
        const next = THEME_ORDER[(idx + dir + THEME_ORDER.length) % THEME_ORDER.length];
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
    };
    const bindThemeHotkeys = () => {
        window.addEventListener("keydown", (e) => {
            if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            if (e.key !== "[" && e.key !== "]") return;
            const el = document.activeElement;
            const isEditable = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName));
            if (isEditable) return;
            e.preventDefault();
            cycleTheme(e.key === "]" ? 1 : -1);
        });
    };

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

    const SETTINGS_STORAGE_KEY = "pb_settings_v1";
    let paramStep = 0.1;
    let snapStep = 1;
    let particleSnapRange = 0.35;
    let offsetPreviewLimit = -1;
    let realtimeKotlin = false;
    let pointPickPreviewEnabled = true;

    function normalizeParamStep(v) {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n <= 0) return 0.1;
        return Math.max(0.000001, n);
    }

    function normalizeSnapStep(v) {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n <= 0) return 1;
        return Math.max(0.000001, n);
    }

    function normalizeParticleSnapRange(v) {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n <= 0) return 0.35;
        return Math.max(0.000001, n);
    }

    function normalizeOffsetPreviewLimit(v) {
        const raw = String(v ?? "").trim();
        if (raw === "-" || raw === "-1") return -1;
        if (/^\d+$/.test(raw)) return Math.trunc(Number(raw));
        const n = Math.trunc(Number(raw));
        if (!Number.isFinite(n)) return -1;
        if (n < -1) return -1;
        if (n === -1) return -1;
        return Math.max(0, n);
    }

    function applyParamStepToInputs() {
        const step = String(paramStep);
        const inputs = document.querySelectorAll('input[type="number"]');
        inputs.forEach((el) => {
            if (el.id === "inpSnapStep") return;
            if (el.id === "inpParamStep") return;
            if (el.id === "inpSnapParticleRange") return;
            if (el.id === "inpOffsetPreviewLimit") return;
            el.step = step;
        });
    }

    function setParamStep(v, opts = {}) {
        const next = normalizeParamStep(v);
        paramStep = next;
        if (inpParamStep && inpParamStep.value !== String(next)) {
            inpParamStep.value = String(next);
        }
        applyParamStepToInputs();
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function setSnapStep(v, opts = {}) {
        const next = normalizeSnapStep(v);
        snapStep = next;
        if (inpSnapStep && inpSnapStep.value !== String(next)) {
            inpSnapStep.value = String(next);
        }
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function setParticleSnapRange(v, opts = {}) {
        const next = normalizeParticleSnapRange(v);
        particleSnapRange = next;
        if (inpSnapParticleRange && inpSnapParticleRange.value !== String(next)) {
            inpSnapParticleRange.value = String(next);
        }
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function setOffsetPreviewLimit(v, opts = {}) {
        const next = normalizeOffsetPreviewLimit(v);
        offsetPreviewLimit = next;
        if (inpOffsetPreviewLimit && inpOffsetPreviewLimit.value !== String(next)) {
            inpOffsetPreviewLimit.value = String(next);
        }
        if (!opts.skipSave) saveSettingsToStorage();
        updateOffsetPreview(offsetHoverPoint);
        if (pointPickMode && pointPickHoverPoint) {
            queuePointPickPreview(pointPickHoverPoint);
        } else if (!pointPickMode) {
            hidePointPickPreview();
        }
    }

    function setRealtimeKotlin(v, opts = {}) {
        const next = (v !== false);
        const changed = realtimeKotlin !== next;
        realtimeKotlin = next;
        if (chkRealtimeKotlin && chkRealtimeKotlin.checked !== next) {
            chkRealtimeKotlin.checked = next;
        }
        if (!next && kotlinRenderTimer) {
            clearTimeout(kotlinRenderTimer);
            kotlinRenderTimer = 0;
        }
        if (next && changed && opts.flushOnEnable) {
            flushKotlinOut();
        }
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function setPointPickPreviewEnabled(v, opts = {}) {
        const next = (v !== false);
        pointPickPreviewEnabled = next;
        if (chkPointPickPreview && chkPointPickPreview.checked !== next) {
            chkPointPickPreview.checked = next;
        }
        if (!next) {
            hidePointPickPreview();
        } else if (pointPickMode && pointPickHoverPoint) {
            queuePointPickPreview(pointPickHoverPoint);
        }
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function collectSettingsPayload() {
        const currentTheme = normalizeTheme(
            (themeSelect && themeSelect.value) ||
            document.body.getAttribute("data-theme") ||
            localStorage.getItem(THEME_KEY) ||
            "dark-1"
        );
        return {
            paramStep,
            snapStep,
            particleSnapRange,
            showAxes: chkAxes ? !!chkAxes.checked : true,
            showGrid: chkGrid ? !!chkGrid.checked : true,
            realtimeKotlin,
            pointPickPreviewEnabled,
            theme: currentTheme,
            pointSize,
            offsetPreviewLimit
        };
    }

    function saveSettingsToStorage() {
        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(collectSettingsPayload()));
        } catch (e) {
            console.warn("saveSettings failed:", e);
        }
    }

    function applySettingsPayload(payload, opts = {}) {
        if (!payload || typeof payload !== "object") return;
        if (payload.paramStep !== undefined) {
            setParamStep(payload.paramStep, { skipSave: true });
        }
        if (payload.snapStep !== undefined) {
            setSnapStep(payload.snapStep, { skipSave: true });
        }
        if (payload.particleSnapRange !== undefined) {
            setParticleSnapRange(payload.particleSnapRange, { skipSave: true });
        }
        if (payload.offsetPreviewLimit !== undefined) {
            setOffsetPreviewLimit(payload.offsetPreviewLimit, { skipSave: true });
        }
        if (payload.realtimeKotlin !== undefined) {
            setRealtimeKotlin(payload.realtimeKotlin, { skipSave: true });
        }
        if (payload.pointPickPreviewEnabled !== undefined) {
            setPointPickPreviewEnabled(payload.pointPickPreviewEnabled, { skipSave: true });
        }
        if (payload.theme) {
            const next = normalizeTheme(payload.theme);
            applyTheme(next);
            localStorage.setItem(THEME_KEY, next);
        }
        if (payload.showAxes !== undefined && chkAxes) {
            chkAxes.checked = !!payload.showAxes;
            if (axesHelper) axesHelper.visible = chkAxes.checked;
            if (axisLabelGroup) axisLabelGroup.visible = chkAxes.checked;
        }
        if (payload.showGrid !== undefined && chkGrid) {
            chkGrid.checked = !!payload.showGrid;
            if (gridHelper) gridHelper.visible = chkGrid.checked;
        }
        if (payload.pointSize !== undefined) {
            setPointSize(payload.pointSize);
            if (inpPointSize) inpPointSize.value = String(pointSize);
        }
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function loadSettingsFromStorage() {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (!raw) return;
            const obj = JSON.parse(raw);
            applySettingsPayload(obj, { skipSave: true });
        } catch (e) {
            console.warn("loadSettings failed:", e);
        }
    }

    let getFilterScope, saveRootFilter, isFilterActive, filterAllows, getVisibleEntries, getVisibleIndices, swapInList, findVisibleSwapIndex, cleanupFilterMenus;
      let renderCards, renderParamsEditors, layoutActionOverflow, initCollapseAllControls, setupListDropZone, addQuickOffsetTo;
      let createFilterControls, createParamSyncControls, renderSyncMenu, bindParamSyncListeners, isSyncSelectableEvent, toggleSyncTarget, setSyncTargetsByIds, setSyncEnabled, paramSync;
      let getCardSelectionIds, setCardSelectionIds, clearCardSelectionIds;
      let hotkeys, hotkeyToHuman, hotkeyMatchEvent, normalizeHotkey, shouldIgnorePlainHotkeys;
      let openHotkeysModal, hideHotkeysModal, beginHotkeyCapture, refreshHotkeyHints, handleHotkeyCaptureKeydown;
      let isDraggingCard = false;


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
    if (!projectName) {
        projectName = "shape";
        saveProjectName(projectName);
    }

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
    let kotlinDirty = true;
    let kotlinRenderTimer = 0;
    const KOTLIN_RENDER_DELAY_MS = 110;

    function setKotlinOut(text, options = {}) {
        const next = text || "";
        const force = !!options.force;
        if (!force && next === kotlinRaw) {
            kotlinDirty = false;
            return;
        }
        kotlinRaw = next;
        kotlinDirty = false;
        if (!elKotlinOut) return;
        const highlighter = globalThis.CodeHighlighter && globalThis.CodeHighlighter.highlightKotlin;
        if (typeof highlighter === "function") {
            elKotlinOut.innerHTML = highlighter(kotlinRaw);
        } else {
            elKotlinOut.textContent = kotlinRaw;
        }
    }

    function flushKotlinOut() {
        if (kotlinRenderTimer) {
            clearTimeout(kotlinRenderTimer);
            kotlinRenderTimer = 0;
        }
        setKotlinOut(emitKotlin());
    }

    function scheduleKotlinOut() {
        if (kotlinRenderTimer) clearTimeout(kotlinRenderTimer);
        kotlinRenderTimer = setTimeout(() => {
            kotlinRenderTimer = 0;
            setKotlinOut(emitKotlin());
        }, KOTLIN_RENDER_DELAY_MS);
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

    function normalizeLegacyVecParams(p, prefix, objKey = null) {
        if (!p || typeof p !== "object") return;
        const px = `${prefix}x`;
        const py = `${prefix}y`;
        const pz = `${prefix}z`;
        if (p[px] !== undefined || p[py] !== undefined || p[pz] !== undefined) return;
        const key = objKey || prefix;
        const raw = p[key];
        if (!raw) return;
        if (Array.isArray(raw)) {
            if (raw[0] !== undefined) p[px] = raw[0];
            if (raw[1] !== undefined) p[py] = raw[1];
            if (raw[2] !== undefined) p[pz] = raw[2];
            return;
        }
        if (typeof raw === "object") {
            if (raw.x !== undefined) p[px] = raw.x;
            if (raw.y !== undefined) p[py] = raw.y;
            if (raw.z !== undefined) p[pz] = raw.z;
        }
    }

    function normalizeNodeParams(node) {
        if (!node || !node.kind) return;
        if (!node.params || typeof node.params !== "object") node.params = {};
        if (node.kind === "with_builder") node.kind = "add_builder";
        if (node.kind === "add_builder") {
            if (node.params.ox === undefined) node.params.ox = 0;
            if (node.params.oy === undefined) node.params.oy = 0;
            if (node.params.oz === undefined) node.params.oz = 0;
        }
        const p = node.params;
        switch (node.kind) {
            case "add_bezier":
                normalizeLegacyVecParams(p, "p1");
                normalizeLegacyVecParams(p, "p2");
                normalizeLegacyVecParams(p, "p3");
                if (p.count === undefined && p.counts !== undefined) p.count = p.counts;
                break;
            case "add_bezier_4":
                normalizeLegacyVecParams(p, "p1");
                normalizeLegacyVecParams(p, "p2");
                normalizeLegacyVecParams(p, "p3");
                normalizeLegacyVecParams(p, "p4");
                if (p.count === undefined && p.counts !== undefined) p.count = p.counts;
                break;
            case "add_bezier_curve":
                if (p.tx === undefined && p.target && typeof p.target === "object") p.tx = p.target.x ?? p.target[0];
                if (p.ty === undefined && p.target && typeof p.target === "object") p.ty = p.target.y ?? p.target[1];
                if (p.shx === undefined && p.startHandle && typeof p.startHandle === "object") p.shx = p.startHandle.x ?? p.startHandle[0];
                if (p.shy === undefined && p.startHandle && typeof p.startHandle === "object") p.shy = p.startHandle.y ?? p.startHandle[1];
                if (p.ehx === undefined && p.endHandle && typeof p.endHandle === "object") p.ehx = p.endHandle.x ?? p.endHandle[0];
                if (p.ehy === undefined && p.endHandle && typeof p.endHandle === "object") p.ehy = p.endHandle.y ?? p.endHandle[1];
                break;
            case "add_polygon":
                if (p.count === undefined && p.edgeCount !== undefined) p.count = p.edgeCount;
                if (p.sideCount === undefined && p.n !== undefined) p.sideCount = p.n;
                break;
            case "add_polygon_in_circle":
                if (p.edgeCount === undefined && p.count !== undefined) p.edgeCount = p.count;
                if (p.n === undefined && p.sideCount !== undefined) p.n = p.sideCount;
                break;
            case "add_round_shape":
                if (p.preCircleCount === undefined && p.circleCount !== undefined) p.preCircleCount = p.circleCount;
                if (p.minCircleCount === undefined && p.minCount !== undefined) p.minCircleCount = p.minCount;
                if (p.maxCircleCount === undefined && p.maxCount !== undefined) p.maxCircleCount = p.maxCount;
                break;
            case "add_lightning_points":
            case "add_lightning_nodes":
            case "add_lightning_nodes_attenuation":
                normalizeLegacyVecParams(p, "s", "start");
                normalizeLegacyVecParams(p, "e", "end");
                if (p.useStart === undefined && (p.start || p.sx !== undefined || p.sy !== undefined || p.sz !== undefined)) p.useStart = true;
                if (p.useOffsetRange === undefined && p.offsetRange !== undefined) p.useOffsetRange = true;
                break;
            default:
                break;
        }
    }

    function normalizeNodeTree(node) {
        if (!node) return;
        if (Array.isArray(node)) {
            for (const n of node) normalizeNodeTree(n);
            return;
        }
        normalizeNodeParams(node);
        if (Array.isArray(node.children)) {
            for (const c of node.children) normalizeNodeTree(c);
        }
    }

    function normalizeState(obj) {
        if (!obj || typeof obj !== "object") return null;
        if (!obj.root || typeof obj.root !== "object") return null;
        if (!Array.isArray(obj.root.children)) obj.root.children = [];
        if (!obj.root.id) obj.root.id = "root";
        if (!obj.root.kind) obj.root.kind = "ROOT";
        normalizeNodeTree(obj.root);
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
        btnOpenHotkeys,
        btnCloseHotkeys,
        btnCloseHotkeys2,
        btnHotkeysReset,
        btnHotkeysExport,
        btnHotkeysImport,
        fileHotkeys,
        cardSearch,
        settingsModal,
        settingsMask,
        KIND,
        showToast,
        downloadText,
        getSettingsPayload: collectSettingsPayload,
        applySettingsPayload
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

    const { row, inputNum, select, checkbox, makeVec3Editor, angleInput, setTipKind } = createCardInputs({
        num,
        armHistoryOnFocus,
        historyCapture,
        setActiveVecTarget: (target) => { activeVecTarget = target; },
        getParamStep: () => paramStep
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
        return kind === "add_builder" || kind === "with_builder" || kind === "add_with";
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

    function collapseAllNodes(list) {
        const arr = list || [];
        for (const n of arr) {
            if (!n) continue;
            n.collapsed = true;
            if (Array.isArray(n.terms)) {
                for (const t of n.terms) {
                    if (t) t.collapsed = true;
                }
            }
            if (isBuilderContainerKind(n.kind) && Array.isArray(n.children)) {
                collapseAllNodes(n.children);
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

    function resetCollapseScopes() {
        collapseScopes.clear();
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
        if (!id || !elCardsRoot) return false;
        const ctx = findNodeContextById(id);
        if (!ctx || !ctx.node) return false;
        const card = elCardsRoot.querySelector(`.card[data-id="${id}"]`);
        if (!card) return false;
        const body = card.querySelector(".card-body");
        const btn = card.querySelector('.iconbtn[data-collapse-btn="1"]');
        const collapsed = !!ctx.node.collapsed;
        const wasCollapsed = card.classList.contains("collapsed");

        if (btn) {
            btn.textContent = collapsed ? "▸" : "▾";
            btn.title = collapsed ? "展开" : "收起";
        }
        if (wasCollapsed === collapsed) {
            if (!collapsed && body && !Number.isFinite(ctx.node.bodyHeight)) {
                body.style.height = "";
                body.style.maxHeight = "";
            }
            return true;
        }

        const token = String(Date.now() + Math.random());
        if (body) body.dataset.animToken = token;

        if (collapsed) {
            // 先测量当前高度，再折叠（避免先加 collapsed 导致高度变成 0）
            if (body) {
                const current = body.getBoundingClientRect().height || 0;
                body.style.height = `${current}px`;
                body.style.maxHeight = `${current}px`;
            }
            card.classList.add("collapsed");
            if (body) {
                requestAnimationFrame(() => {
                    if (body.dataset.animToken !== token) return;
                    body.style.height = "0px";
                    body.style.maxHeight = "0px";
                });
            }
        } else {
            // 先取消 collapsed，再动画展开到内容高度
            card.classList.remove("collapsed");
            if (body) {
                const targetH = Number.isFinite(ctx.node.bodyHeight)
                    ? ctx.node.bodyHeight
                    : body.scrollHeight || 0;
                body.style.height = "0px";
                body.style.maxHeight = "0px";
                requestAnimationFrame(() => {
                    if (body.dataset.animToken !== token) return;
                    body.style.height = `${targetH}px`;
                    body.style.maxHeight = `${targetH}px`;
                });
                if (!Number.isFinite(ctx.node.bodyHeight)) {
                    setTimeout(() => {
                        if (body.dataset.animToken !== token) return;
                        if (!ctx.node.collapsed) {
                            body.style.height = "";
                            body.style.maxHeight = "";
                        }
                    }, 460);
                }
            }
        }
        scheduleAutoSave();
        return true;
    }

    function handleCollapseAllFocusChange(prevId, nextId) {
        if (isDraggingCard) return;
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
        scope.forceOpenOnce = false;
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

    function findNodePathById(id, list = state.root.children, parentNode = null) {
        const arr = list || [];
        for (let i = 0; i < arr.length; i++) {
            const n = arr[i];
            if (!n) continue;
            if (n.id === id) return [{ node: n, parentList: arr, index: i, parentNode }];
            if (isBuilderContainerKind(n.kind) && Array.isArray(n.children)) {
                const childPath = findNodePathById(id, n.children, n);
                if (childPath) {
                    return [{ node: n, parentList: arr, index: i, parentNode }, ...childPath];
                }
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

    function collectSelectedDeleteContexts(ids) {
        const src = Array.isArray(ids) ? ids : [];
        const unique = [];
        const seen = new Set();
        for (const id of src) {
            if (!id || seen.has(id)) continue;
            seen.add(id);
            unique.push(id);
        }
        const rows = [];
        for (const id of unique) {
            const ctx = findAnyCardContextById(id);
            if (!ctx || !Array.isArray(ctx.parentList)) continue;
            rows.push({ id, ctx });
        }
        if (!rows.length) return [];

        const selectedNodeIds = new Set(rows.filter((r) => r.ctx && r.ctx.type === "node").map((r) => r.id));
        const out = [];
        for (const row of rows) {
            const { id, ctx } = row;
            if (ctx.type === "node") {
                const path = findNodePathById(id);
                let coveredByAncestor = false;
                if (Array.isArray(path) && path.length > 1) {
                    for (let i = 0; i < path.length - 1; i++) {
                        const ancId = path[i] && path[i].node ? path[i].node.id : null;
                        if (ancId && ancId !== id && selectedNodeIds.has(ancId)) {
                            coveredByAncestor = true;
                            break;
                        }
                    }
                }
                if (coveredByAncestor) continue;
            } else if (ctx.type === "term") {
                const pid = ctx.parentNode && ctx.parentNode.id ? ctx.parentNode.id : null;
                if (pid && selectedNodeIds.has(pid)) continue;
            }
            out.push(row);
        }
        return out;
    }

    function deleteSelectedCards() {
        const sel = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        const selectedIds = sel ? Array.from(sel).filter(Boolean) : [];
        if (!selectedIds.length) return false;

        const rows = collectSelectedDeleteContexts(selectedIds);
        if (!rows.length) return false;

        const focusedInSelection = !!(focusedNodeId && selectedIds.includes(focusedNodeId));
        const focusCtxBeforeDelete = focusedInSelection
            ? (rows.find((r) => r.id === focusedNodeId)?.ctx || null)
            : null;

        historyCapture("delete_selected");

        const sorted = rows.slice().sort((a, b) => {
            if (a.ctx.parentList === b.ctx.parentList) return b.ctx.index - a.ctx.index;
            const depthA = (a.ctx.type === "node") ? ((findNodePathById(a.id)?.length) || 1) : 999;
            const depthB = (b.ctx.type === "node") ? ((findNodePathById(b.id)?.length) || 1) : 999;
            return depthB - depthA;
        });

        for (const row of sorted) {
            const { id, ctx } = row;
            const list = ctx.parentList;
            if (!Array.isArray(list)) continue;
            if (ctx.index >= 0 && ctx.index < list.length && list[ctx.index] && list[ctx.index].id === id) {
                list.splice(ctx.index, 1);
                continue;
            }
            const at = list.findIndex((it) => it && it.id === id);
            if (at >= 0) list.splice(at, 1);
        }

        if (typeof clearCardSelectionIds === "function") clearCardSelectionIds();

        let nextFocus = null;
        if (!focusedInSelection && focusedNodeId && findAnyCardContextById(focusedNodeId)) {
            nextFocus = focusedNodeId;
        } else if (focusCtxBeforeDelete) {
            nextFocus = pickReasonableFocusAfterDelete(focusCtxBeforeDelete);
        }
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

          const originalLength = targetList.length;
          const [moved] = fromList.splice(fromIndex, 1);
  
          let idx = Math.max(0, Math.min(targetIndex, targetList.length));
          if (fromList === targetList && fromIndex < idx && targetIndex < originalLength) idx -= 1;
          targetList.splice(idx, 0, moved);

        ensureAxisEverywhere();
        return true;
    }

    function moveNodesByIds(dragIds, targetList, targetIndex, targetOwnerNode = null) {
        if (!Array.isArray(dragIds) || dragIds.length === 0 || !Array.isArray(targetList)) return false;
        const seen = new Set();
        const ids = [];
        for (const id of dragIds) {
            if (!id || seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
        }
        if (!ids.length) return false;

        const contexts = [];
        for (const id of ids) {
            const ctx = findNodeContextById(id);
            if (!ctx || !ctx.node || !Array.isArray(ctx.parentList)) continue;
            contexts.push(ctx);
        }
        if (!contexts.length) return false;

        // 允许“部分可移动”：当多选里包含目标子卡片自身（或其祖先）时，仅跳过这些非法项。
        const movable = [];
        for (const ctx of contexts) {
            if (targetOwnerNode && nodeContainsId(ctx.node, targetOwnerNode.id)) continue;
            movable.push(ctx);
        }
        if (!movable.length) return false;

        const fromList = movable[0].parentList;
        for (const ctx of movable) {
            if (ctx.parentList !== fromList) return false;
        }

        const scopeId = targetOwnerNode ? targetOwnerNode.id : null;
        if (typeof isFilterActive === "function" && isFilterActive(scopeId) && fromList === targetList) {
            return false;
        }

        movable.sort((a, b) => a.index - b.index);
        const moved = [];
        for (let i = movable.length - 1; i >= 0; i--) {
            const ctx = movable[i];
            const item = fromList.splice(ctx.index, 1)[0];
            if (item) moved.unshift(item);
        }
        if (!moved.length) return false;

        let idx = Math.max(0, Math.min(targetIndex, targetList.length));
        if (fromList === targetList) {
            let removedBefore = 0;
            for (const ctx of movable) {
                if (ctx.index < idx) removedBefore++;
            }
            idx = Math.max(0, idx - removedBefore);
        }
        targetList.splice(idx, 0, ...moved);
        ensureAxisEverywhere();
        return true;
    }

    function tryCopyWithBuilderIntoAddWith(dragId, targetOwnerNode) {
        if (!dragId || !targetOwnerNode || targetOwnerNode.kind !== "add_with") return false;
        const from = findNodeContextById(dragId);
        if (!from || !from.node || (from.node.kind !== "add_builder" && from.node.kind !== "with_builder")) return false;

        historyCapture("copy_addBuilder_into_addWith");
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
        const node = makeNode("add_builder");
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
    let offsetPreviewObj = null;
    let offsetPreviewBuf = null;
    let offsetPreviewCount = 0;
    let linePickPreviewObj = null;
    let linePickPreviewBuf = null;
    let linePickPreviewCount = 0;
    let pointPickPreviewObj = null;
    let pointPickPreviewBuf = null;
    let pointPickPreviewCount = 0;
    let pointPickPreviewRaf = 0;
    let pointPickPreviewPendingPoint = null;
    let pointPickPreviewLastTarget = null;
    let pointPickPreviewLastX = NaN;
    let pointPickPreviewLastY = NaN;
    let pointPickPreviewLastZ = NaN;
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
    const SYNC_POINT_HEX = 0x5dd6ff;
    const OFFSET_POINT_HEX = 0xff6ad5;
    const OFFSET_PREVIEW_HEX = 0x8a8a8a;
    const LINE_PICK_PREVIEW_HEX = 0x33a1ff;
    const POINT_PICK_PREVIEW_HEX = 0x5dd6ff;
    const defaultPointColor = new THREE.Color(DEFAULT_POINT_HEX);
    const focusPointColor = new THREE.Color(FOCUS_POINT_HEX);
    const syncPointColor = new THREE.Color(SYNC_POINT_HEX);
    const offsetPointColor = new THREE.Color(OFFSET_POINT_HEX);
    const offsetPreviewColor = new THREE.Color(OFFSET_PREVIEW_HEX);
    const linePickPreviewColor = new THREE.Color(LINE_PICK_PREVIEW_HEX);
    const pointPickPreviewColor = new THREE.Color(POINT_PICK_PREVIEW_HEX);

    let pickMarkers = [];
    let pointSize = 0.2;     // ✅ 粒子大小（PointsMaterial.size）
    // line pick state (可指向主/任意子 builder)
    let linePickMode = false;
    let picked = [];
    let linePickTargetList = null;
    let linePickTargetLabel = "主Builder";
    // 插入位置（用于：在某个卡片后/某个 addBuilder 子列表末尾连续插入）
    let linePickInsertIndex = null;
    // 进入拾取前的聚焦卡片（用于：拾取新增后保持聚焦不丢失）
    let linePickKeepFocusId = null;
    // ✅ 解决：拾取直线时 pointerdown 处理完后仍会触发 click 事件，可能导致焦点被 onCanvasClick 清空
    let suppressNextCanvasClick = false;
    let suppressCanvasClickUntil = 0;
    let suppressCanvasClickPos = null;
    const SUPPRESS_CANVAS_CLICK_MS = 220;
    const SUPPRESS_CANVAS_CLICK_DIST = 8;
    // point pick state (for axis/start/end/vec3 fields)
    let pointPickMode = false;
    let pointPickTarget = null;
    let pointPickKeepFocusId = null;
    let pointPickHoverPoint = null;
    let pointPickPendingMapped = null;
    let pointPickMenuAnchorX = NaN;
    let pointPickMenuAnchorY = NaN;
    let activeVecTarget = null;
    let offsetMode = false;
    let offsetTargetId = null;
    let offsetTargetIds = [];
    let offsetRefPoint = null;
    let offsetHoverPoint = null;
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

    function rememberPointPickMenuAnchor(ev) {
        if (!ev) return;
        if (Number.isFinite(ev.clientX)) pointPickMenuAnchorX = ev.clientX;
        if (Number.isFinite(ev.clientY)) pointPickMenuAnchorY = ev.clientY;
    }

    function resolvePointPickMenuAnchor() {
        if (Number.isFinite(pointPickMenuAnchorX) && Number.isFinite(pointPickMenuAnchorY)) {
            return { x: pointPickMenuAnchorX, y: pointPickMenuAnchorY };
        }
        if (renderer && renderer.domElement) {
            const rect = renderer.domElement.getBoundingClientRect();
            if (rect && rect.width > 0 && rect.height > 0) {
                return {
                    x: rect.left + rect.width * 0.5,
                    y: rect.top + Math.min(rect.height * 0.5, Math.max(56, rect.height * 0.2))
                };
            }
        }
        return {
            x: (window.innerWidth || 0) * 0.5,
            y: Math.max(56, (window.innerHeight || 0) * 0.3)
        };
    }

    function bindPointPickMenuAnchorTracking() {
        if (window.__pbPointPickAnchorBound) return;
        window.__pbPointPickAnchorBound = true;
        window.addEventListener("pointermove", rememberPointPickMenuAnchor, true);
        window.addEventListener("pointerdown", rememberPointPickMenuAnchor, true);
    }

    const VIEW_BOX_DELAY_MS = 90;
    const VIEW_BOX_DRAG_START_PX = 2;
    let viewBoxEl = null;
    let viewBoxTimer = 0;
    let viewBoxPending = null; // { pointerId,startX,startY,ctrlKey,shiftKey }
    let viewBoxSelecting = false;
    let viewBoxRect = null; // {left,top,right,bottom}
    const _viewProjTmp = new THREE.Vector3();

    function isRightLike(ev) {
        // 1) 标准右键：button===2
        // 2) 右键按下位掩码：buttons&2
        // 3) macOS Ctrl+Click：button===0 且 ctrlKey=true
        return ev.button === 2 || (ev.buttons & 2) === 2 || (ev.button === 0 && ev.ctrlKey);
    }

    function armCanvasClickSuppress(ev = null, ttlMs = SUPPRESS_CANVAS_CLICK_MS) {
        suppressNextCanvasClick = true;
        suppressCanvasClickUntil = performance.now() + Math.max(0, Number(ttlMs) || 0);
        suppressCanvasClickPos = (ev && Number.isFinite(ev.clientX) && Number.isFinite(ev.clientY))
            ? { x: ev.clientX, y: ev.clientY }
            : null;
    }

    function shouldSuppressCanvasClick(ev) {
        if (!suppressNextCanvasClick) return false;
        const now = performance.now();
        if (now > suppressCanvasClickUntil) {
            suppressNextCanvasClick = false;
            suppressCanvasClickUntil = 0;
            suppressCanvasClickPos = null;
            return false;
        }
        if (ev && suppressCanvasClickPos) {
            const dx = ev.clientX - suppressCanvasClickPos.x;
            const dy = ev.clientY - suppressCanvasClickPos.y;
            if (Math.hypot(dx, dy) > SUPPRESS_CANVAS_CLICK_DIST) {
                suppressNextCanvasClick = false;
                suppressCanvasClickUntil = 0;
                suppressCanvasClickPos = null;
                return false;
            }
        }
        suppressNextCanvasClick = false;
        suppressCanvasClickUntil = 0;
        suppressCanvasClickPos = null;
        return true;
    }

    function blurActiveElementForCanvas() {
        suppressCardFocusOutClear = true;
        try {
            const ae = document.activeElement;
            if (ae && ae.blur) ae.blur();
        } catch {}
        suppressCardFocusOutClear = false;
    }

    function isArrowKey(code) {
        return code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight";
    }

    function shouldIgnoreArrowPan() {
        if ((modal && !modal.classList.contains("hidden")) || (hkModal && !hkModal.classList.contains("hidden")) || (settingsModal && !settingsModal.classList.contains("hidden"))) return true;
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
        if (offsetPreviewObj && offsetPreviewObj.material) {
            offsetPreviewObj.material.size = pointSize;
            offsetPreviewObj.material.needsUpdate = true;
        }
        if (linePickPreviewObj && linePickPreviewObj.material) {
            linePickPreviewObj.material.size = pointSize;
            linePickPreviewObj.material.needsUpdate = true;
        }
        if (pointPickPreviewObj && pointPickPreviewObj.material) {
            pointPickPreviewObj.material.size = pointSize;
            pointPickPreviewObj.material.needsUpdate = true;
        }

    }

    function getSnapStep() {
        return snapStep;
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

    function nearestPointCandidate(ref, maxDist = particleSnapRange) {
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
        const snapRange = particleSnapRange;
        const snapRange2 = snapRange * snapRange;

        if (!useGrid && !useParticle) return raw;

        const gridP = useGrid ? snapToGridOnPlane(raw, getSnapStep(), getPlaneInfo().axis) : null;

        let particleP = null;
        let particleFromHit = false;
        const particleHit = particlePoint ? {x: particlePoint.x, y: particlePoint.y, z: particlePoint.z} : null;
        if (useParticle) {
            if (particleHit && dist2(raw, particleHit) <= snapRange2) {
                particleP = particleHit;
                particleFromHit = true;
            } else {
                const cand = nearestPointCandidate(raw, snapRange);
                particleP = cand ? cand.point : null;
            }
        }

        // 鼠标命中粒子时优先吸附粒子
        if (useParticle && particleFromHit) return particleP;
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
            if (picked && picked.length === 1) {
                const a = picked[0];
                setLinePickStatus(`${info.label} 拾取模式[${linePickTargetLabel}]：已选第 1 点：(${U.fmt(a.x)}, ${U.fmt(a.y)}, ${U.fmt(a.z)})，再点第 2 点`);
            } else {
                setLinePickStatus(`${info.label} 拾取模式[${linePickTargetLabel}]：请点第 1 点`);
            }
        }
        if (pointPickMode) {
            refreshPointPickStatus();
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
        if (chkAxes) axesHelper.visible = chkAxes.checked;

        gridHelper = new THREE.GridHelper(256, 256, 0x223344, 0x223344);
        gridHelper.position.y = -0.01;
        scene.add(gridHelper);
        if (chkGrid) gridHelper.visible = chkGrid.checked;
        applySceneTheme();

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
        renderer.domElement.addEventListener("pointercancel", (ev) => {
            if (viewBoxPending && ev && ev.pointerId === viewBoxPending.pointerId) {
                clearViewBoxState(ev.pointerId);
            }
        });
        renderer.domElement.addEventListener("click", onCanvasClick);
        renderer.domElement.addEventListener("dblclick", onCanvasDblClick);

        chkAxes.addEventListener("change", () => {
            axesHelper.visible = chkAxes.checked;
            if (axisLabelGroup) axisLabelGroup.visible = chkAxes.checked;
            saveSettingsToStorage();
        });
        chkGrid.addEventListener("change", () => {
            gridHelper.visible = chkGrid.checked;
            saveSettingsToStorage();
        });
        if (chkRealtimeKotlin) {
            chkRealtimeKotlin.addEventListener("change", () => {
                const next = !!chkRealtimeKotlin.checked;
                setRealtimeKotlin(next);
                if (next) flushKotlinOut();
            });
        }
        if (chkPointPickPreview) {
            chkPointPickPreview.addEventListener("change", () => {
                setPointPickPreviewEnabled(!!chkPointPickPreview.checked);
            });
        }
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
        renderer.domElement.addEventListener("contextmenu", onCanvasContextMenu);
        if (inpPointSize) {
            inpPointSize.value = String(pointSize);
            inpPointSize.addEventListener("input", () => {
                setPointSize(inpPointSize.value);
                saveSettingsToStorage();
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
            hideOffsetPreview();
            hideLinePickPreview();
            hidePointPickPreview();
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
        const c0 = defaultPointColor;
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
        updateOffsetPreview(offsetHoverPoint);

        // 不自动重置镜头：由用户手动点击“重置镜头”
    }

    function refreshPointBaseColors() {
        if (!pointsObj || !defaultColorBuf) return;
        const c0 = defaultPointColor;
        for (let i = 0; i < defaultColorBuf.length; i += 3) {
            defaultColorBuf[i + 0] = c0.r;
            defaultColorBuf[i + 1] = c0.g;
            defaultColorBuf[i + 2] = c0.b;
        }
        updateFocusColors();
    }

    function updateFocusColors() {
        if (!pointsObj) return;
        const g = pointsObj.geometry;
        const attr = g.getAttribute("color");
        if (!attr || !attr.array || !defaultColorBuf) return;

        // 先恢复默认色
        attr.array.set(defaultColorBuf);

        // 参数同步选中：统一颜色标记
        const syncIds = (paramSync && paramSync.selectedIds) ? paramSync.selectedIds : null;
        if (syncIds && syncIds.size) {
            const cSync = syncPointColor;
            for (const id of syncIds) {
                const seg = nodePointSegments.get(id);
                if (!seg || seg.end <= seg.start) continue;
                for (let i = seg.start; i < seg.end; i++) {
                    const k = i * 3;
                    attr.array[k + 0] = cSync.r;
                    attr.array[k + 1] = cSync.g;
                    attr.array[k + 2] = cSync.b;
                }
            }
        }

        const selectedIds = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        if (selectedIds && selectedIds.size) {
            const cSel = focusPointColor;
            for (const id of selectedIds) {
                const seg = nodePointSegments.get(id);
                if (!seg || seg.end <= seg.start) continue;
                for (let i = seg.start; i < seg.end; i++) {
                    const k = i * 3;
                    attr.array[k + 0] = cSel.r;
                    attr.array[k + 1] = cSel.g;
                    attr.array[k + 2] = cSel.b;
                }
            }
        }

        // 聚焦色优先覆盖
        const focusSeg = focusedNodeId ? nodePointSegments.get(focusedNodeId) : null;
        if (focusSeg && focusSeg.end > focusSeg.start) {
            const c1 = focusPointColor;
            for (let i = focusSeg.start; i < focusSeg.end; i++) {
                const k = i * 3;
                attr.array[k + 0] = c1.r;
                attr.array[k + 1] = c1.g;
                attr.array[k + 2] = c1.b;
            }
        }

        const c2 = offsetPointColor;
        const offsetIds = getActiveOffsetTargetIds();
        for (const id of offsetIds) {
            const seg = nodePointSegments.get(id);
            if (!seg || seg.end <= seg.start) continue;
            for (let i = seg.start; i < seg.end; i++) {
                const k = i * 3;
                attr.array[k + 0] = c2.r;
                attr.array[k + 1] = c2.g;
                attr.array[k + 2] = c2.b;
            }
        }

        attr.needsUpdate = true;
    }

    function shouldShowOffsetPreview(count) {
        if (offsetPreviewLimit === 0) return false;
        if (offsetPreviewLimit < 0) return true;
        return count <= offsetPreviewLimit;
    }

    function ensureOffsetPreviewObj() {
        if (offsetPreviewObj || !scene) return;
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.PointsMaterial({
            size: pointSize,
            sizeAttenuation: true,
            color: offsetPreviewColor.getHex(),
            transparent: true,
            opacity: 0.55,
            depthWrite: false
        });
        offsetPreviewObj = new THREE.Points(geom, mat);
        offsetPreviewObj.visible = false;
        scene.add(offsetPreviewObj);
    }

    function hideOffsetPreview() {
        if (offsetPreviewObj) offsetPreviewObj.visible = false;
    }

    function ensureLinePickPreviewObj() {
        if (linePickPreviewObj || !scene) return;
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.PointsMaterial({
            size: pointSize,
            sizeAttenuation: true,
            color: linePickPreviewColor.getHex(),
            transparent: true,
            opacity: 0.65,
            depthWrite: false
        });
        linePickPreviewObj = new THREE.Points(geom, mat);
        linePickPreviewObj.visible = false;
        scene.add(linePickPreviewObj);
    }

    function hideLinePickPreview() {
        if (linePickPreviewObj) linePickPreviewObj.visible = false;
    }

    function updateLinePickPreview(targetPoint) {
        if (!linePickMode || !targetPoint || !picked || picked.length !== 1) {
            hideLinePickPreview();
            return;
        }
        const start = picked[0];
        if (!start) {
            hideLinePickPreview();
            return;
        }
        const count = 30;
        ensureLinePickPreviewObj();
        if (!linePickPreviewObj) return;
        const geom = linePickPreviewObj.geometry;
        if (!linePickPreviewBuf || linePickPreviewCount !== count) {
            linePickPreviewBuf = new Float32Array(count * 3);
            linePickPreviewCount = count;
            geom.setAttribute("position", new THREE.BufferAttribute(linePickPreviewBuf, 3));
        }
        let o = 0;
        for (let i = 0; i < count; i++) {
            const t = count <= 1 ? 0 : (i / (count - 1));
            linePickPreviewBuf[o++] = start.x + (targetPoint.x - start.x) * t;
            linePickPreviewBuf[o++] = start.y + (targetPoint.y - start.y) * t;
            linePickPreviewBuf[o++] = start.z + (targetPoint.z - start.z) * t;
        }
        const posAttr = geom.getAttribute("position");
        if (posAttr) posAttr.needsUpdate = true;
        geom.computeBoundingSphere();
        linePickPreviewObj.visible = true;
    }

    function getActiveOffsetTargetIds() {
        if (Array.isArray(offsetTargetIds) && offsetTargetIds.length) {
            const out = [];
            const seen = new Set();
            for (const id of offsetTargetIds) {
                if (!id || seen.has(id)) continue;
                seen.add(id);
                out.push(id);
            }
            if (out.length) return out;
        }
        return offsetTargetId ? [offsetTargetId] : [];
    }

    function updateOffsetPreview(targetPoint) {
        if (!offsetMode || !offsetRefPoint || !targetPoint || !scene) {
            hideOffsetPreview();
            return;
        }
        const targetIds = getActiveOffsetTargetIds();
        if (!targetIds.length || !lastPoints || !lastPoints.length) {
            hideOffsetPreview();
            return;
        }
        const ranges = [];
        let count = 0;
        for (const id of targetIds) {
            const seg = nodePointSegments.get(id);
            if (!seg || seg.end <= seg.start) continue;
            ranges.push(seg);
            count += (seg.end - seg.start);
        }
        if (!ranges.length || count <= 0) {
            hideOffsetPreview();
            return;
        }
        if (!shouldShowOffsetPreview(count)) {
            hideOffsetPreview();
            return;
        }
        const dx = targetPoint.x - offsetRefPoint.x;
        const dy = targetPoint.y - offsetRefPoint.y;
        const dz = targetPoint.z - offsetRefPoint.z;
        if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) {
            hideOffsetPreview();
            return;
        }
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-9) {
            hideOffsetPreview();
            return;
        }

        ensureOffsetPreviewObj();
        if (!offsetPreviewObj) return;

        const geom = offsetPreviewObj.geometry;
        if (!offsetPreviewBuf || offsetPreviewCount !== count) {
            offsetPreviewBuf = new Float32Array(count * 3);
            offsetPreviewCount = count;
            geom.setAttribute("position", new THREE.BufferAttribute(offsetPreviewBuf, 3));
        }
        let o = 0;
        for (const seg of ranges) {
            for (let i = seg.start; i < seg.end; i++) {
                const p = lastPoints[i];
                if (!p) {
                    offsetPreviewBuf[o++] = 0;
                    offsetPreviewBuf[o++] = 0;
                    offsetPreviewBuf[o++] = 0;
                    continue;
                }
                offsetPreviewBuf[o++] = p.x + dx;
                offsetPreviewBuf[o++] = p.y + dy;
                offsetPreviewBuf[o++] = p.z + dz;
            }
        }
        const posAttr = geom.getAttribute("position");
        if (posAttr) posAttr.needsUpdate = true;
        geom.computeBoundingSphere();
        offsetPreviewObj.visible = true;
    }

    function resetPointPickPreviewFrameState() {
        pointPickPreviewLastTarget = null;
        pointPickPreviewLastX = NaN;
        pointPickPreviewLastY = NaN;
        pointPickPreviewLastZ = NaN;
    }

    function cancelPointPickPreviewRaf() {
        if (pointPickPreviewRaf) {
            cancelAnimationFrame(pointPickPreviewRaf);
            pointPickPreviewRaf = 0;
        }
        pointPickPreviewPendingPoint = null;
    }

    function ensurePointPickPreviewObj() {
        if (pointPickPreviewObj || !scene) return;
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.PointsMaterial({
            size: pointSize,
            sizeAttenuation: true,
            color: pointPickPreviewColor.getHex(),
            transparent: true,
            opacity: 0.45,
            depthWrite: false
        });
        pointPickPreviewObj = new THREE.Points(geom, mat);
        pointPickPreviewObj.visible = false;
        scene.add(pointPickPreviewObj);
    }

    function hidePointPickPreview() {
        cancelPointPickPreviewRaf();
        resetPointPickPreviewFrameState();
        if (pointPickPreviewObj) pointPickPreviewObj.visible = false;
    }

    function updatePointPickPreview(targetPoint) {
        if (!pointPickMode || !pointPickPreviewEnabled || !pointPickTarget || !targetPoint || !scene) {
            hidePointPickPreview();
            return;
        }
        const t = pointPickTarget;
        const previewTargetsRaw = (Array.isArray(t.multiTargets) && t.multiTargets.length) ? t.multiTargets : [t];
        const previewTargets = previewTargetsRaw.filter((it) => (
            it && it.obj && it.keys && it.keys.x && it.keys.y && it.keys.z
        ));
        if (!previewTargets.length) {
            hidePointPickPreview();
            return;
        }
        if (pointPickPreviewLastTarget === t
            && pointPickPreviewLastX === targetPoint.x
            && pointPickPreviewLastY === targetPoint.y
            && pointPickPreviewLastZ === targetPoint.z) {
            return;
        }
        if (Array.isArray(lastPoints) && lastPoints.length > 0 && !shouldShowOffsetPreview(lastPoints.length)) {
            hidePointPickPreview();
            return;
        }
        pointPickPreviewLastTarget = t;
        pointPickPreviewLastX = targetPoint.x;
        pointPickPreviewLastY = targetPoint.y;
        pointPickPreviewLastZ = targetPoint.z;
        let previewPoints = null;
        const backups = [];
        try {
            for (const it of previewTargets) {
                const kx = it.keys.x;
                const ky = it.keys.y;
                const kz = it.keys.z;
                backups.push({
                    target: it,
                    x: it.obj[kx],
                    y: it.obj[ky],
                    z: it.obj[kz]
                });
                it.obj[kx] = targetPoint.x;
                it.obj[ky] = targetPoint.y;
                it.obj[kz] = targetPoint.z;
            }
            const res = evalBuilderWithMeta(state.root.children, U.v(0, 1, 0));
            if (res && Array.isArray(res.points)) previewPoints = res.points;
        } catch {
            previewPoints = null;
        } finally {
            for (const b of backups) {
                const it = b.target;
                if (!it || !it.obj || !it.keys) continue;
                it.obj[it.keys.x] = b.x;
                it.obj[it.keys.y] = b.y;
                it.obj[it.keys.z] = b.z;
            }
        }
        if (!previewPoints || !previewPoints.length) {
            hidePointPickPreview();
            return;
        }
        if (!shouldShowOffsetPreview(previewPoints.length)) {
            hidePointPickPreview();
            return;
        }
        ensurePointPickPreviewObj();
        if (!pointPickPreviewObj) return;

        const geom = pointPickPreviewObj.geometry;
        const count = previewPoints.length;
        if (!pointPickPreviewBuf || pointPickPreviewCount !== count) {
            pointPickPreviewBuf = new Float32Array(count * 3);
            pointPickPreviewCount = count;
            geom.setAttribute("position", new THREE.BufferAttribute(pointPickPreviewBuf, 3));
        }
        let o = 0;
        for (let i = 0; i < count; i++) {
            const p = previewPoints[i];
            if (!p) {
                pointPickPreviewBuf[o++] = 0;
                pointPickPreviewBuf[o++] = 0;
                pointPickPreviewBuf[o++] = 0;
                continue;
            }
            pointPickPreviewBuf[o++] = p.x;
            pointPickPreviewBuf[o++] = p.y;
            pointPickPreviewBuf[o++] = p.z;
        }
        const posAttr = geom.getAttribute("position");
        if (posAttr) posAttr.needsUpdate = true;
        geom.computeBoundingSphere();
        pointPickPreviewObj.visible = true;
    }

    function queuePointPickPreview(targetPoint) {
        if (!pointPickMode || !pointPickPreviewEnabled || !targetPoint) {
            hidePointPickPreview();
            return;
        }
        pointPickPreviewPendingPoint = targetPoint;
        if (pointPickPreviewRaf) return;
        pointPickPreviewRaf = requestAnimationFrame(() => {
            pointPickPreviewRaf = 0;
            const next = pointPickPreviewPendingPoint;
            pointPickPreviewPendingPoint = null;
            updatePointPickPreview(next);
        });
    }

    // ✅ 左侧卡片聚焦高亮（UI）
    function updateFocusCardUI() {
        if (!elCardsRoot) return;
        try {
            elCardsRoot.querySelectorAll('.card.focused').forEach(el => el.classList.remove('focused'));
            elCardsRoot.querySelectorAll('.card.multi-selected').forEach(el => el.classList.remove('multi-selected'));
        } catch {}
        const selectedIds = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        if (selectedIds && selectedIds.size) {
            for (const id of selectedIds) {
                const sel = elCardsRoot.querySelector(`.card[data-id="${id}"]`);
                if (sel) sel.classList.add("multi-selected");
            }
        }
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

function getNodeSegmentCenter(id) {
    if (!id) return null;
    const seg = nodePointSegments.get(id);
    if (!seg || !lastPoints || !lastPoints.length) return null;
    const start = Math.max(0, seg.start | 0);
    const end = Math.min(lastPoints.length, seg.end | 0);
    if (end <= start) return null;
    let sx = 0, sy = 0, sz = 0;
    for (let i = start; i < end; i++) {
        const p = lastPoints[i];
        if (!p) continue;
        sx += p.x;
        sy += p.y;
        sz += p.z;
    }
    const count = end - start;
    if (!count) return null;
    return { x: sx / count, y: sy / count, z: sz / count };
}

function buildAxisFromParams(p) {
    if (!p) return U.v(0, 1, 0);
    return U.v(num(p.x), num(p.y), num(p.z));
}

function makeInverseAxisAngleQuat(axis, rad) {
    if (!Number.isFinite(rad) || Math.abs(rad) < 1e-12) return null;
    const n = U.norm(axis);
    if (U.len(n) <= 1e-9) return null;
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(n.x, n.y, n.z), rad);
    q.invert();
    return q;
}

function makeInverseRotateToQuat(node, axisVec) {
    const axisN = U.norm(axisVec);
    if (U.len(axisN) <= 1e-9) return null;
    const p = node.params || {};
    let to;
    if (p.mode === "originEnd") {
        const origin = U.v(num(p.ox), num(p.oy), num(p.oz));
        const end = U.v(num(p.ex), num(p.ey), num(p.ez));
        to = U.sub(end, origin);
    } else {
        to = U.v(num(p.tox), num(p.toy), num(p.toz));
    }
    const toN = U.norm(to);
    if (U.len(toN) <= 1e-9) return null;
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(
        new THREE.Vector3(axisN.x, axisN.y, axisN.z),
        new THREE.Vector3(toN.x, toN.y, toN.z)
    );
    q.invert();
    return q;
}

function collectPostLinearTransformsForList(list, afterIndex) {
    const arr = list || [];
    const transforms = [];
    let axis = U.v(0, 1, 0);

    for (let i = 0; i < arr.length; i++) {
        const n = arr[i];
        if (!n || !n.kind || !KIND[n.kind]) continue;

        if (n.kind === "axis") {
            axis = buildAxisFromParams(n.params);
            continue;
        }

        if (i <= afterIndex) continue;

        if (n.kind === "rotate_as_axis") {
            const rad = U.angleToRad(num(n.params?.deg), n.params?.degUnit);
            const axisVec = n.params?.useCustomAxis
                ? U.v(num(n.params?.ax), num(n.params?.ay), num(n.params?.az))
                : axis;
            const inv = makeInverseAxisAngleQuat(axisVec, rad);
            if (inv) transforms.push({ type: "rot", inv });
            continue;
        }

        if (n.kind === "rotate_to") {
            const inv = makeInverseRotateToQuat(n, axis);
            if (inv) transforms.push({ type: "rot", inv });
            continue;
        }

        if (n.kind === "scale") {
            const f = num(n.params?.factor);
            if (Number.isFinite(f) && f > 0 && Math.abs(f - 1) > 1e-12) {
                transforms.push({ type: "scale", inv: 1 / f });
            }
        }
    }
    return transforms;
}

function applyInverseTransformsToDelta(delta, transforms) {
    if (!delta || !transforms || transforms.length === 0) return delta;
    const v = new THREE.Vector3(delta.x, delta.y, delta.z);
    for (let i = transforms.length - 1; i >= 0; i--) {
        const t = transforms[i];
        if (t.type === "scale") {
            v.multiplyScalar(t.inv);
        } else if (t.type === "rot") {
            v.applyQuaternion(t.inv);
        }
    }
    return { x: v.x, y: v.y, z: v.z };
}

function mapWorldDeltaToLocalDelta(worldDelta, path, pathIndex) {
    if (!worldDelta) return worldDelta;
    if (!Array.isArray(path) || pathIndex < 0 || pathIndex >= path.length) return worldDelta;
    const transforms = [];
    for (let i = pathIndex; i >= 0; i--) {
        const ctx = path[i];
        if (!ctx || !Array.isArray(ctx.parentList)) continue;
        const post = collectPostLinearTransformsForList(ctx.parentList, ctx.index);
        if (post.length) transforms.push(...post);
    }
    return applyInverseTransformsToDelta(worldDelta, transforms);
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
    const hitThreshold = Math.max(0.12, (pointSize || 0.2) * 0.6);
    raycaster.params.Points.threshold = Math.min(hitThreshold, particleSnapRange);
    const hits = raycaster.intersectObject(pointsObj, false);
    if (!hits || hits.length === 0) return null;
    const idx = hits[0].index;
    if (idx === null || idx === undefined) return null;
    if (!lastPoints || !lastPoints[idx]) return null;
    return lastPoints[idx];
}

function getMappedPointFromEvent(ev) {
    if (!renderer || !camera || !raycaster || !pickPlane) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(mouse, camera);
    const particle = getParticleSnapFromEvent(ev);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(pickPlane, hit)) return null;
    return mapPickPoint(hit, particle);
}

function ensureViewBoxEl() {
    if (viewBoxEl) return viewBoxEl;
    const el = document.createElement("div");
    el.className = "pb-select-box pb-select-box-view hidden";
    document.body.appendChild(el);
    viewBoxEl = el;
    return el;
}

function releaseViewBoxPointer(pointerId) {
    const dom = renderer && renderer.domElement;
    if (!dom || pointerId === null || pointerId === undefined) return;
    try {
        if (dom.hasPointerCapture && dom.hasPointerCapture(pointerId)) {
            dom.releasePointerCapture(pointerId);
        }
    } catch {}
}

function hideViewBox() {
    if (!viewBoxEl) return;
    viewBoxEl.classList.add("hidden");
}

function setViewBoxRectByClient(startX, startY, endX, endY) {
    const left = Math.min(startX, endX);
    const right = Math.max(startX, endX);
    const top = Math.min(startY, endY);
    const bottom = Math.max(startY, endY);
    viewBoxRect = { left, top, right, bottom };
    const el = ensureViewBoxEl();
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.width = `${Math.round(Math.max(0, right - left))}px`;
    el.style.height = `${Math.round(Math.max(0, bottom - top))}px`;
    el.classList.remove("hidden");
}

function clearViewBoxState(pointerId = null) {
    if (viewBoxTimer) {
        clearTimeout(viewBoxTimer);
        viewBoxTimer = 0;
    }
    viewBoxPending = null;
    viewBoxSelecting = false;
    viewBoxRect = null;
    hideViewBox();
    if (pointerId !== null && pointerId !== undefined) releaseViewBoxPointer(pointerId);
}

function shouldStartViewBox(ev) {
    if (!renderer || !renderer.domElement) return false;
    if (!ev || ev.button !== 0) return false;
    if (ev.altKey) return false;
    const leftMouseAction = controls && controls.mouseButtons ? controls.mouseButtons.LEFT : null;
    if (leftMouseAction !== null && leftMouseAction !== undefined) return false;
    if (linePickMode || pointPickMode || offsetMode) return false;
    return true;
}

function startViewBoxSelecting(ev) {
    if (!viewBoxPending || !ev || ev.pointerId !== viewBoxPending.pointerId) return;
    viewBoxSelecting = true;
    setViewBoxRectByClient(viewBoxPending.startX, viewBoxPending.startY, ev.clientX, ev.clientY);
}

function beginViewBoxPending(ev) {
    if (!shouldStartViewBox(ev)) return false;
    clearViewBoxState();
    viewBoxPending = {
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        ctrlKey: !!ev.ctrlKey,
        shiftKey: !!ev.shiftKey
    };
    const dom = renderer && renderer.domElement;
    if (dom && dom.setPointerCapture) {
        try { dom.setPointerCapture(ev.pointerId); } catch {}
    }
    viewBoxTimer = setTimeout(() => {
        viewBoxTimer = 0;
        if (!viewBoxPending) return;
        startViewBoxSelecting({
            pointerId: viewBoxPending.pointerId,
            clientX: viewBoxPending.startX,
            clientY: viewBoxPending.startY
        });
    }, VIEW_BOX_DELAY_MS);
    return true;
}

function updateViewBoxSelecting(ev) {
    if (!viewBoxPending || !ev || ev.pointerId !== viewBoxPending.pointerId) return false;
    if (!viewBoxSelecting) {
        const dx = ev.clientX - viewBoxPending.startX;
        const dy = ev.clientY - viewBoxPending.startY;
        if (Math.hypot(dx, dy) >= VIEW_BOX_DRAG_START_PX) {
            if (viewBoxTimer) {
                clearTimeout(viewBoxTimer);
                viewBoxTimer = 0;
            }
            startViewBoxSelecting(ev);
        } else {
            return false;
        }
    }
    setViewBoxRectByClient(viewBoxPending.startX, viewBoxPending.startY, ev.clientX, ev.clientY);
    return true;
}

function projectPointToClient(p) {
    if (!camera || !renderer || !p) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    _viewProjTmp.set(p.x, p.y, p.z).project(camera);
    if (!Number.isFinite(_viewProjTmp.x) || !Number.isFinite(_viewProjTmp.y) || !Number.isFinite(_viewProjTmp.z)) return null;
    if (_viewProjTmp.z < -1 || _viewProjTmp.z > 1) return null;
    const x = ((_viewProjTmp.x + 1) / 2) * rect.width + rect.left;
    const y = ((-_viewProjTmp.y + 1) / 2) * rect.height + rect.top;
    return { x, y };
}

function collectOwnerIdsInViewBox(rect) {
    if (!rect || !lastPoints || !lastPoints.length) return [];
    const counts = new Map();
    for (let i = 0; i < lastPoints.length; i++) {
        const p = lastPoints[i];
        if (!p) continue;
        const ownerId = ownerIdForPointIndex(i);
        if (!ownerId) continue;
        const sp = projectPointToClient(p);
        if (!sp) continue;
        if (sp.x < rect.left || sp.x > rect.right || sp.y < rect.top || sp.y > rect.bottom) continue;
        counts.set(ownerId, (counts.get(ownerId) || 0) + 1);
    }
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
}

function applyViewBoxSelection(ownerIds, options = {}) {
    const ids = Array.isArray(ownerIds) ? ownerIds.filter(Boolean) : [];
    const replace = !options.additive;
    blurActiveElementForCanvas();
    if (typeof setCardSelectionIds === "function") {
        setCardSelectionIds(ids, {
            replace,
            focus: false,
            reveal: false,
            syncWithParamSync: true,
            syncStrictKind: true
        });
    }
    if (!ids.length) {
        if (replace && focusedNodeId) setFocusedNode(null, true);
        return;
    }
    const focusId = ids[0];
    focusCardById(focusId, true, false, true);
}

function finishViewBoxSelection(ev) {
    if (!viewBoxPending || !ev || ev.pointerId !== viewBoxPending.pointerId) return false;
    const additive = !!(viewBoxPending.ctrlKey || viewBoxPending.shiftKey);
    const pointerId = viewBoxPending.pointerId;
    const rect = viewBoxRect;
    const active = viewBoxSelecting;
    clearViewBoxState(pointerId);
    if (!active || !rect) return false;
    if ((rect.right - rect.left) < 3 && (rect.bottom - rect.top) < 3) return false;
    const ids = collectOwnerIdsInViewBox(rect);
    applyViewBoxSelection(ids, { additive });
    armCanvasClickSuppress(ev);
    return true;
}

function scrollCardToTop(cardEl) {
    if (!cardEl || !elCardsRoot) return;
    scrollCardIntoContainer(elCardsRoot, cardEl);
}

function scrollCardIntoContainer(containerEl, cardEl, offset = 8) {
    if (!containerEl || !cardEl) return;
    const cr = containerEl.getBoundingClientRect();
    const r = cardEl.getBoundingClientRect();
    const delta = (r.top - cr.top);
    containerEl.scrollTop += delta - offset;
}

function getCardScrollContainer(cardEl) {
    if (!cardEl) return elCardsRoot;
    const sub = cardEl.closest ? cardEl.closest(".subcards") : null;
    return sub || elCardsRoot;
}

function revealCardPathById(id) {
    const ctx = findNodeContextById(id);
    if (!ctx || !ctx.node) return false;
    let changed = false;
    const list = [];
    list.push(ctx.node);
    let parent = ctx.parentNode;
    while (parent && parent.id) {
        list.push(parent);
        const next = findNodeContextById(parent.id);
        parent = next ? (next.parentNode || null) : null;
    }
    for (const n of list) {
        if (n.collapsed) {
            n.collapsed = false;
            changed = true;
        }
        if (n.folded && (isBuilderContainerKind(n.kind) || n.kind === "add_fourier_series")) {
            n.folded = false;
            changed = true;
        }
    }
    return changed;
}

function focusCardById(id, recordHistory = true, scrollToTop = true, revealPath = false) {
    if (!id) return false;
    const ctx = findNodeContextById(id);
    const parentNode = ctx ? ctx.parentNode : null;
    const parentIsBuilder = parentNode && isBuilderContainerKind(parentNode.kind);
    const parentId = parentIsBuilder ? parentNode.id : null;
    const needRender = revealPath ? revealCardPathById(id) : false;
    setFocusedNode(id, recordHistory);
    if (needRender) renderAll();
    requestAnimationFrame(() => {
        const el = elCardsRoot ? elCardsRoot.querySelector(`.card[data-id="${id}"]`) : null;
        const parentEl = parentId ? elCardsRoot.querySelector(`.card[data-id="${parentId}"]`) : null;
        if (parentEl) {
            const container = getCardScrollContainer(parentEl);
            scrollCardIntoContainer(container, parentEl);
        } else if (scrollToTop && el) {
            const container = getCardScrollContainer(el);
            scrollCardIntoContainer(container, el);
        }
        if (el) {
            try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch {} }
        }
        if (parentEl && el) {
            requestAnimationFrame(() => {
                const parentEl2 = elCardsRoot ? elCardsRoot.querySelector(`.card[data-id="${parentId}"]`) : null;
                const el2 = elCardsRoot ? elCardsRoot.querySelector(`.card[data-id="${id}"]`) : null;
                const subcards = parentEl2 ? parentEl2.querySelector(".subcards") : null;
                if (subcards && el2) {
                    scrollCardIntoContainer(subcards, el2);
                }
            });
        }
    });
    return true;
}

function isActionMenuAllowed() {
    if (linePickMode || pointPickMode || offsetMode) return false;
    if ((modal && !modal.classList.contains("hidden"))
        || (hkModal && !hkModal.classList.contains("hidden"))
        || (settingsModal && !settingsModal.classList.contains("hidden"))) {
        return false;
    }
    return true;
}

function normalizeActionTargetIds(ids) {
    const src = Array.isArray(ids) ? ids : [];
    const out = [];
    const seen = new Set();
    for (const id of src) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (!findNodeContextById(id)) continue;
        out.push(id);
    }
    return out;
}

function getActionTargetIds(preferredId = null) {
    const selectedSet = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
    const selected = selectedSet ? Array.from(selectedSet).filter(Boolean) : [];
    if (preferredId) {
        if (selected.length && selected.includes(preferredId)) return normalizeActionTargetIds(selected);
        return normalizeActionTargetIds([preferredId]);
    }
    if (selected.length) return normalizeActionTargetIds(selected);
    if (focusedNodeId) return normalizeActionTargetIds([focusedNodeId]);
    return [];
}

function areActionTargetsSameKind(ids) {
    const valid = normalizeActionTargetIds(ids);
    if (!valid.length) return false;
    let kind = null;
    for (const id of valid) {
        const ctx = findNodeContextById(id);
        if (!ctx || !ctx.node) return false;
        if (!kind) kind = ctx.node.kind;
        else if (kind !== ctx.node.kind) return false;
    }
    return true;
}

function startMoveForTargetIds(ids) {
    const valid = normalizeActionTargetIds(ids);
    if (!valid.length) return;
    if (typeof setCardSelectionIds === "function") {
        setCardSelectionIds(valid, { replace: true, focus: false, syncWithParamSync: false });
    }
    const focusId = valid[0];
    focusCardById(focusId, false, false, true);
    if (valid.length > 1) startOffsetMode(focusId, { ids: valid });
    else startOffsetMode(focusId);
}

function deleteTargetIds(ids) {
    const valid = normalizeActionTargetIds(ids);
    if (!valid.length) return;
    if (valid.length > 1) {
        if (typeof setCardSelectionIds === "function") {
            setCardSelectionIds(valid, { replace: true, focus: false, syncWithParamSync: false });
        }
        setFocusedNode(valid[0], false);
        deleteSelectedCards();
        return;
    }
    setFocusedNode(valid[0], false);
    deleteFocusedCard();
}

function quickSyncTargetIds(ids, anchor = {}) {
    const valid = normalizeActionTargetIds(ids);
    if (valid.length < 1) return false;
    if (!areActionTargetsSameKind(valid)) {
        showToast("仅同类型目标支持修改参数", "error");
        return false;
    }
    if (typeof renderParamsEditors !== "function") {
        showToast("参数编辑器不可用", "error");
        return false;
    }

    const nodes = [];
    for (const id of valid) {
        const ctx = findNodeContextById(id);
        if (!ctx || !ctx.node) continue;
        nodes.push(ctx.node);
    }
    if (nodes.length < 1) return false;

    hideActionMenu();
    const panel = ensureQuickSyncPanelEl();
    if (!panel || !quickSyncEditorHostEl || !quickSyncTitleEl || !quickSyncHintEl) return false;
    quickSyncEditorHostEl.innerHTML = "";

    const source = nodes[0];
    const sourceName = (KIND && KIND[source.kind] && KIND[source.kind].title) ? KIND[source.kind].title : source.kind;
    const model = {
        id: source.id,
        kind: source.kind,
        params: clonePlain(source.params || {})
    };
    quickSyncTitleEl.textContent = `修改参数：${sourceName}`;
    quickSyncHintEl.textContent = `此修改会同步选中的${nodes.length}个项目`;
    quickSyncState = {
        ids: valid.slice(),
        model,
        snapshot: clonePlain(model.params || {})
    };

    const renderInlineEditor = () => {
        if (!quickSyncState || quickSyncState.model !== model) return;
        quickSyncEditorHostEl.innerHTML = "";
        renderParamsEditors(quickSyncEditorHostEl, model, "修改参数", { paramsOnly: true });
        applyParamStepToInputs();
    };

    const applyInlineSync = (opts = {}) => {
        if (!quickSyncState || quickSyncState.model !== model) return;
        const current = clonePlain(model.params || {});
        const diff = diffPlain(quickSyncState.snapshot, current);
        const rerenderInlineEditor = () => {
            if (!quickSyncState || quickSyncState.model !== model) return;
            renderInlineEditor();
        };
        if (!diff.length) {
            if (opts.rerender) {
                rerenderInlineEditor();
            }
            return;
        }
        if (!quickSyncHistoryLockTimer) {
            historyCapture("quick_sync_inline");
            quickSyncHistoryLockTimer = setTimeout(() => {
                quickSyncHistoryLockTimer = 0;
            }, 180);
        }
        let changed = false;
        for (const id of quickSyncState.ids) {
            const ctx = findNodeContextById(id);
            if (!ctx || !ctx.node) continue;
            if (!ctx.node.params) ctx.node.params = {};
            applyPlainDiff(ctx.node.params, diff);
            changed = true;
        }
        quickSyncState.snapshot = current;
        if (changed) {
            rebuildPreviewAndKotlin();
            if (opts.rerender) renderAll();
        }
        if (opts.rerender) {
            rerenderInlineEditor();
        }
    };

    const onInlineInput = () => {
        applyInlineSync();
    };
    const onInlineChange = (ev) => {
        const t = ev && ev.target;
        const tag = t && t.tagName ? String(t.tagName).toUpperCase() : "";
        const type = t && t.type ? String(t.type).toLowerCase() : "";
        const needRerender = (tag === "SELECT") || (tag === "INPUT" && (type === "checkbox" || type === "radio"));
        applyInlineSync({ rerender: needRerender });
    };

    if (quickSyncEditorHostEl.__pbQuickSyncInputHandler) {
        quickSyncEditorHostEl.removeEventListener("input", quickSyncEditorHostEl.__pbQuickSyncInputHandler);
    }
    if (quickSyncEditorHostEl.__pbQuickSyncChangeHandler) {
        quickSyncEditorHostEl.removeEventListener("change", quickSyncEditorHostEl.__pbQuickSyncChangeHandler);
    }
    quickSyncEditorHostEl.__pbQuickSyncInputHandler = onInlineInput;
    quickSyncEditorHostEl.__pbQuickSyncChangeHandler = onInlineChange;
    quickSyncEditorHostEl.addEventListener("input", onInlineInput);
    quickSyncEditorHostEl.addEventListener("change", onInlineChange);
    renderInlineEditor();

    const ax = Number.isFinite(anchor.x) ? anchor.x : 0;
    const ay = Number.isFinite(anchor.y) ? anchor.y : 0;
    panel.classList.remove("hidden");
    positionFloatingPanel(panel, ax + 14, ay);
    return true;
}

function openQuickSyncTargetIdsAt(ids, clientX, clientY) {
    return quickSyncTargetIds(ids, { x: clientX, y: clientY });
}

function openActionMenuForBlankNoSelection(ev) {
    if (!ev || !isActionMenuAllowed()) {
        hideActionMenu();
        hideQuickSyncPanel();
        return false;
    }
    const selectedSet = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
    const selectedCount = selectedSet ? selectedSet.size : 0;
    if (selectedCount > 0) return false;
    hideQuickSyncPanel();
    const items = [
        {
            label: "添加卡片",
            onSelect: () => {
                const ctx = getInsertContextFromFocus();
                const ownerNodeId = (ctx && ctx.ownerNode && isBuilderContainerKind(ctx.ownerNode.kind)) ? ctx.ownerNode.id : null;
                openModal(ctx.list, ctx.insertIndex, ctx.label, ownerNodeId);
            }
        },
        {
            label: "绘制直线",
            onSelect: () => {
                if (linePickMode) stopLinePick();
                if (pointPickMode) stopPointPick();
                const ctx = getInsertContextFromFocus();
                startLinePick(ctx.list, ctx.label, ctx.insertIndex);
            }
        },
        {
            label: "添加全局偏移",
            onSelect: () => addQuickOffsetTo(state.root.children)
        }
    ];
    return showActionMenu(ev.clientX, ev.clientY, items);
}

function openActionMenuForTargets(ev, targetIds, options = {}) {
    if (!ev || !isActionMenuAllowed()) {
        hideActionMenu();
        hideQuickSyncPanel();
        return false;
    }
    const ids = normalizeActionTargetIds(targetIds);
    if (!ids.length) {
        hideActionMenu();
        hideQuickSyncPanel();
        return false;
    }
    hideQuickSyncPanel();
    const allowQuickSync = !!options.allowQuickSync;
    const sameKind = areActionTargetsSameKind(ids);
    const items = [];
    if (allowQuickSync && sameKind && ids.length >= 1) {
        items.push({
            label: "修改参数",
            onSelect: () => openQuickSyncTargetIdsAt(ids, ev.clientX, ev.clientY)
        });
    }
    items.push({
        label: "移动",
        onSelect: () => startMoveForTargetIds(ids)
    });
    items.push({
        label: "删除",
        danger: true,
        onSelect: () => deleteTargetIds(ids)
    });
    return showActionMenu(ev.clientX, ev.clientY, items);
}

function onCanvasContextMenu(ev) {
    ev.preventDefault();
    if (!isActionMenuAllowed()) {
        hideActionMenu();
        return;
    }
    let targetIds = [];
    const idx = pickPointIndexFromEvent(ev);
    if (idx !== null) {
        const ownerId = ownerIdForPointIndex(idx);
        if (ownerId) {
            targetIds = getActionTargetIds(ownerId);
            if (!targetIds.length) targetIds = [ownerId];
            if (typeof setCardSelectionIds === "function") {
                setCardSelectionIds(targetIds, { replace: true, focus: false, syncWithParamSync: false });
            }
            focusCardById(ownerId, false, false, true);
        }
    }
    if (!targetIds.length) {
        const selectedSet = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        const selectedCount = selectedSet ? selectedSet.size : 0;
        if (selectedCount === 0 && openActionMenuForBlankNoSelection(ev)) return;
        targetIds = getActionTargetIds();
    }
    openActionMenuForTargets(ev, targetIds, { allowQuickSync: true });
}

function onCardsContextMenu(ev) {
    const target = ev && ev.target;
    const card = target && target.closest ? target.closest(".card[data-id]") : null;
    if (!card || !elCardsRoot || !elCardsRoot.contains(card)) {
        if (!ev) return;
        ev.preventDefault();
        if (openActionMenuForBlankNoSelection(ev)) return;
        const ids = getActionTargetIds();
        openActionMenuForTargets(ev, ids, { allowQuickSync: true });
        return;
    }
    ev.preventDefault();
    if (!isActionMenuAllowed()) {
        hideActionMenu();
        return;
    }
    const id = card.dataset.id;
    if (!id) return;
    if (typeof setCardSelectionIds === "function") {
        setCardSelectionIds([id], { replace: true, focus: false, syncWithParamSync: false });
    }
    focusCardById(id, false, false, true);
    openActionMenuForTargets(ev, [id], { allowQuickSync: true });
}

function onCanvasClick(ev) {
    // ✅ 直线拾取用 pointerdown 处理，但浏览器仍会在 pointerup 后补一个 click。
    // 如果不屏蔽，这个 click 会走到下面的“点到空白处清空焦点”，导致聚焦丢失。
    if (shouldSuppressCanvasClick(ev)) return;
    hideActionMenu();
    hideQuickSyncPanel();

    // 拾取模式中由 onPointerDown 处理；此处不抢逻辑
    if (linePickMode || pointPickMode) return;

    blurActiveElementForCanvas();

    if (offsetMode) {
        const mapped = getMappedPointFromEvent(ev);
        if (mapped) applyOffsetAtPoint(mapped);
        return;
    }

    const idx = pickPointIndexFromEvent(ev);
    if (idx !== null) {
        const ownerId = ownerIdForPointIndex(idx);
        if (ownerId) {
            const additive = !!(ev && (ev.ctrlKey || ev.shiftKey));
            if (typeof setCardSelectionIds === "function") {
                setCardSelectionIds([ownerId], {
                    replace: !additive,
                    focus: false,
                    reveal: false,
                    syncWithParamSync: false
                });
            }
            const ctx = findNodeContextById(ownerId);
            if (paramSync && paramSync.open && ctx && ctx.node) {
                toggleSyncTarget(ctx.node);
            }
            focusCardById(ownerId, true, true, true);
            return;
        }
    }

    // 点到空白处：清空粒子聚焦与多选
    if (typeof clearCardSelectionIds === "function") clearCardSelectionIds();
    if (focusedNodeId) setFocusedNode(null, true);
}

function onCanvasDblClick(ev) {
    // 已移除“双击左键进入快捷移动”。
    hideActionMenu();
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

    function pointPickTargetLabel(target) {
        if (!target) return "";
        const raw = String(target.label || "").trim();
        if (raw) return raw;
        const kx = target.keys && target.keys.x ? String(target.keys.x) : "";
        if (!kx) return "point";
        if (kx === "sx") return "start";
        if (kx === "ex") return "end";
        if (kx === "ox") return "origin";
        if (kx === "tox") return "to";
        if (kx === "cx") return "center";
        if (kx === "x") return "point";
        return kx.replace(/x$/, "") || "point";
    }

    function buildPointPickStatus() {
        const info = getPlaneInfo().label;
        const label = pointPickTargetLabel(pointPickTarget);
        if (label) return `${info} 点拾取[${label}]：左键确定，右键取消`;
        return `${info} 点拾取：请先选择目标坐标组，再左键确定，右键取消`;
    }

    function refreshPointPickStatus() {
        if (!pointPickMode) return;
        setPointPickStatus(buildPointPickStatus());
    }

    function setPointPickTarget(target) {
        pointPickTarget = target || null;
        if (pointPickTarget) activeVecTarget = pointPickTarget;
        refreshPointPickStatus();
    }

    function collectVecTargetsFromRoot(rootEl) {
        if (!rootEl || !rootEl.querySelectorAll) return [];
        const out = [];
        const seen = new Set();
        rootEl.querySelectorAll("input").forEach((el) => {
            const t = el && el.__vecTarget;
            if (!t || !t.obj || !t.keys) return;
            const k = t.keys || {};
            if (!k.x || !k.y || !k.z) return;
            if (seen.has(t)) return;
            seen.add(t);
            out.push(t);
        });
        return out;
    }

    function collectQuickSyncVecTargets() {
        if (!quickSyncPanelEl || quickSyncPanelEl.classList.contains("hidden")) return [];
        return collectVecTargetsFromRoot(quickSyncEditorHostEl);
    }

    function collectCardVecTargets(nodeId) {
        if (!nodeId || !elCardsRoot) return [];
        const card = elCardsRoot.querySelector(`.card[data-id="${nodeId}"]`);
        if (!card) return [];
        return collectVecTargetsFromRoot(card);
    }

    function fallbackPointLabelByPrefix(prefix, kind = "") {
        const p = String(prefix || "");
        if (!p) return (kind === "axis" ? "axis" : "point");
        if (p === "s") return "start";
        if (p === "e") return "end";
        if (p === "o") return "origin";
        if (p === "to") return "to";
        if (p === "c") return "center";
        if (p === "off" || p === "ro") return "offset";
        if (p === "axis") return "axis";
        if (p === "rotAxis") return "rotateAxis";
        return p;
    }

    function collectSyntheticVecTargetsForNode(node) {
        const p = node && node.params;
        if (!p || typeof p !== "object") return [];
        const byPrefix = new Map();
        for (const key of Object.keys(p)) {
            const m = String(key).match(/^(.*?)([xyz])$/);
            if (!m) continue;
            const prefix = m[1] || "";
            const axis = m[2];
            if (!byPrefix.has(prefix)) byPrefix.set(prefix, {});
            byPrefix.get(prefix)[axis] = key;
        }
        const keys = Array.from(byPrefix.keys()).sort();
        const out = [];
        for (const prefix of keys) {
            const g = byPrefix.get(prefix) || {};
            if (!g.x || !g.y || !g.z) continue;
            out.push({
                obj: p,
                keys: { x: g.x, y: g.y, z: g.z },
                inputs: null,
                label: fallbackPointLabelByPrefix(prefix, node.kind),
                onChange: () => renderAll()
            });
        }
        return out;
    }

    function mergePointPickTargets(cardTargets, syntheticTargets) {
        const out = [];
        const seen = new Set();
        const pushTarget = (t) => {
            if (!t || !t.keys || !t.keys.x || !t.keys.y || !t.keys.z) return;
            const sig = `${t.keys.x}|${t.keys.y}|${t.keys.z}`;
            if (seen.has(sig)) return;
            seen.add(sig);
            out.push(t);
        };
        (cardTargets || []).forEach(pushTarget);
        (syntheticTargets || []).forEach(pushTarget);
        return out;
    }

    function getPointPickTargetsForNodeId(nodeId) {
        const ctx = findNodeContextById(nodeId);
        if (!ctx || !ctx.node) return [];
        const cardTargets = collectCardVecTargets(nodeId);
        const syntheticTargets = collectSyntheticVecTargetsForNode(ctx.node);
        return mergePointPickTargets(cardTargets, syntheticTargets);
    }

    function findTargetByKeys(targets, xKey, yKey, zKey) {
        if (!Array.isArray(targets) || !targets.length) return null;
        for (const t of targets) {
            if (!t || !t.keys) continue;
            if (t.keys.x === xKey && t.keys.y === yKey && t.keys.z === zKey) return t;
        }
        return null;
    }

    function collectSyncPointPickTargetsForNodeIds(ids) {
        const valid = normalizeActionTargetIds(ids);
        if (valid.length < 2) return [];
        if (!areActionTargetsSameKind(valid)) return [];
        const targetBuckets = valid.map((id) => ({
            id,
            targets: getPointPickTargetsForNodeId(id)
        }));
        if (!targetBuckets.length || !Array.isArray(targetBuckets[0].targets)) return [];
        const baseTargets = targetBuckets[0].targets;
        const wrapTarget = (target, ownerId) => {
            if (!target) return null;
            return {
                obj: target.obj,
                keys: target.keys,
                inputs: target.inputs || null,
                label: target.label || "",
                onChange: target.onChange,
                ownerId: ownerId || null
            };
        };
        const out = [];
        for (const base of baseTargets) {
            if (!base || !base.keys || !base.keys.x || !base.keys.y || !base.keys.z) continue;
            const group = [];
            const first = wrapTarget(base, targetBuckets[0].id);
            if (!first) continue;
            group.push(first);
            let ok = true;
            for (let i = 1; i < targetBuckets.length; i++) {
                const bucket = targetBuckets[i];
                const matched = findTargetByKeys(
                    bucket.targets,
                    base.keys.x,
                    base.keys.y,
                    base.keys.z
                );
                if (!matched) {
                    ok = false;
                    break;
                }
                const wrapped = wrapTarget(matched, bucket.id);
                if (!wrapped) {
                    ok = false;
                    break;
                }
                group.push(wrapped);
            }
            if (!ok || group.length !== valid.length) continue;
            const lead = group[0];
            out.push({
                obj: lead.obj,
                keys: { x: lead.keys.x, y: lead.keys.y, z: lead.keys.z },
                inputs: lead.inputs || null,
                label: lead.label || "",
                onChange: lead.onChange,
                ownerId: lead.ownerId || null,
                multiTargets: group
            });
        }
        return out;
    }

    function chooseLineEndpointTarget(nodeId, pickedIndex, targets, options = {}) {
        const seg = nodePointSegments.get(nodeId);
        const useEnd = (!seg || !Number.isInteger(pickedIndex))
            ? false
            : (Math.abs(pickedIndex - (seg.end - 1)) < Math.abs(pickedIndex - seg.start));
        const keyPrefix = useEnd ? "e" : "s";
        const x = `${keyPrefix}x`;
        const y = `${keyPrefix}y`;
        const z = `${keyPrefix}z`;
        const matched = findTargetByKeys(targets, x, y, z);
        if (matched) return matched;
        if (options.allowFallback === false) return null;
        const ctx = findNodeContextById(nodeId);
        if (!ctx || !ctx.node) return null;
        const p = ctx.node.params || (ctx.node.params = {});
        return {
            obj: p,
            keys: { x, y, z },
            inputs: null,
            label: useEnd ? "end" : "start",
            onChange: () => renderAll()
        };
    }

    function showPointPickTargetMenu(targets, anchorX, anchorY, pendingMapped = null) {
        const list = Array.isArray(targets) ? targets.filter(Boolean) : [];
        if (!list.length) return false;
        pointPickPendingMapped = pendingMapped || null;
        const items = list.map((t, i) => ({
            label: `选择 ${pointPickTargetLabel(t) || `point${i + 1}`}`,
            onSelect: () => {
                if (!pointPickMode) return;
                setPointPickTarget(t);
                const pending = pointPickPendingMapped;
                pointPickPendingMapped = null;
                if (pending) {
                    applyPointToTarget(pending);
                    stopPointPick();
                    setTimeout(() => hideLinePickStatus(), 900);
                }
            }
        }));
        const x = Number.isFinite(anchorX) ? anchorX : ((window.innerWidth || 0) * 0.5);
        const y = Number.isFinite(anchorY) ? anchorY : ((window.innerHeight || 0) * 0.5);
        const shown = showActionMenu(x, y, items);
        if (shown) {
            setPointPickStatus(`${getPlaneInfo().label} 点拾取：请先在菜单里选择要修改的坐标组`);
        }
        return shown;
    }

    function getPointPickFallbackNodeId() {
        if (focusedNodeId && findNodeContextById(focusedNodeId)) return focusedNodeId;
        if (typeof getCardSelectionIds === "function") {
            const ids = getCardSelectionIds();
            if (ids && ids.size === 1) {
                const id = Array.from(ids)[0];
                if (id && findNodeContextById(id)) return id;
            }
        }
        return null;
    }

    function resolvePointPickTargetByNodeId(nodeId, options = {}) {
        if (!nodeId) return null;
        const ctx = findNodeContextById(nodeId);
        if (!ctx || !ctx.node) return null;
        const targets = getPointPickTargetsForNodeId(nodeId);
        if (!targets.length) return null;
        if (ctx.node.kind === "add_line" && Number.isInteger(options.pickedIndex)) {
            const lineTarget = chooseLineEndpointTarget(nodeId, options.pickedIndex, targets);
            if (lineTarget) return lineTarget;
        }
        if (targets.length === 1) return targets[0];
        if (options.allowMenu) {
            showPointPickTargetMenu(targets, options.anchorX, options.anchorY, options.pendingMapped || null);
        }
        return null;
    }

    function resolvePointPickTargetOnPick(ev, mappedPoint) {
        const idx = pickPointIndexFromEvent(ev);
        const ownerId = (idx !== null) ? ownerIdForPointIndex(idx) : null;
        const ownerCtx = ownerId ? findNodeContextById(ownerId) : null;
        const quickTargets = collectQuickSyncVecTargets();
        if (quickTargets.length === 1) return quickTargets[0];
        if (quickTargets.length > 1) {
            if (ownerCtx && ownerCtx.node && ownerCtx.node.kind === "add_line" && Number.isInteger(idx)) {
                const lineTarget = chooseLineEndpointTarget(ownerId, idx, quickTargets, { allowFallback: false });
                if (lineTarget) return lineTarget;
            }
            showPointPickTargetMenu(
                quickTargets,
                ev ? ev.clientX : undefined,
                ev ? ev.clientY : undefined,
                mappedPoint
            );
            return null;
        }
        if (ownerId) {
            const target = resolvePointPickTargetByNodeId(ownerId, {
                pickedIndex: idx,
                allowMenu: true,
                anchorX: ev ? ev.clientX : undefined,
                anchorY: ev ? ev.clientY : undefined,
                pendingMapped: mappedPoint
            });
            if (target) {
                try { focusCardById(ownerId, false, false, true); } catch {}
            }
            return target;
        }
        const fallbackNodeId = getPointPickFallbackNodeId();
        if (!fallbackNodeId) return null;
        return resolvePointPickTargetByNodeId(fallbackNodeId, {
            allowMenu: true,
            anchorX: ev ? ev.clientX : undefined,
            anchorY: ev ? ev.clientY : undefined,
            pendingMapped: mappedPoint
        });
    }

    function startLinePick(targetList, label, insertIndex = null) {
        hideActionMenu();
        hideQuickSyncPanel();
        if (offsetMode) stopOffsetMode();
        _rClickT = 0;
        clearPickMarkers();
        hideLinePickPreview();
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
        hideLinePickPreview();
        hideHoverMarker();
        linePickMode = false;
        picked = [];
        linePickInsertIndex = null;
        linePickKeepFocusId = null;
        hideLinePickStatus();
    }

    function startPointPick() {
        hideActionMenu();
        hidePointPickPreview();
        pointPickHoverPoint = null;
        if (offsetMode) stopOffsetMode();
        if (linePickMode) stopLinePick();
        const selectedSet = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        const selectedIds = normalizeActionTargetIds(selectedSet ? Array.from(selectedSet) : []);
        const selectedCount = selectedIds.length;
        const hasSelectedCard = selectedCount > 0;
        if (!hasSelectedCard) {
            setPointPickStatus("请先选中卡片，再按 E 进行点拾取");
            setTimeout(() => hideLinePickStatus(), 1200);
            showToast("请先选中卡片后再使用点拾取", "error");
            return false;
        }
        const multiSelection = selectedCount > 1;
        let syncTargets = [];
        if (multiSelection) {
            if (!areActionTargetsSameKind(selectedIds)) {
                setPointPickStatus("多选点拾取仅支持同类型卡片");
                setTimeout(() => hideLinePickStatus(), 1200);
                showToast("多选卡片类型不一致，无法同步点拾取", "error");
                return false;
            }
            syncTargets = collectSyncPointPickTargetsForNodeIds(selectedIds);
            if (!syncTargets.length) {
                setPointPickStatus("当前多选不具备可同步的坐标组");
                setTimeout(() => hideLinePickStatus(), 1200);
                showToast("多选卡片缺少可同步参数，无法使用 E 点拾取", "error");
                return false;
            }
        }
        const activeTarget = (document.activeElement && document.activeElement.__vecTarget) || null;
        const quickTargets = collectQuickSyncVecTargets();
        const fallbackNodeId = getPointPickFallbackNodeId();
        const hasCardContext = multiSelection
            ? (syncTargets.length > 0 || !!activeTarget)
            : (!!fallbackNodeId || !!activeTarget || quickTargets.length > 0);
        if (!hasCardContext) {
            setPointPickStatus("请先选中卡片，再按 E 进行点拾取");
            setTimeout(() => hideLinePickStatus(), 1200);
            showToast("请先选中卡片后再使用点拾取", "error");
            return false;
        }
        _rClickT = 0;
        pointPickPendingMapped = null;
        pointPickKeepFocusId = focusedNodeId;
        pointPickMode = true;
        setPointPickStatus(`${getPlaneInfo().label} 点拾取：正在准备目标...`);
        let target = null;
        let openedMenu = false;
        if (multiSelection) {
            if (activeTarget && activeTarget.keys) {
                target = findTargetByKeys(
                    syncTargets,
                    activeTarget.keys.x,
                    activeTarget.keys.y,
                    activeTarget.keys.z
                );
            }
            if (!target && syncTargets.length === 1) {
                target = syncTargets[0];
            } else if (!target && syncTargets.length > 1) {
                const anchor = resolvePointPickMenuAnchor();
                openedMenu = !!showPointPickTargetMenu(
                    syncTargets,
                    anchor.x,
                    anchor.y
                );
            }
        } else {
            target = activeTarget || null;
            if (!target && quickTargets.length === 1) {
                target = quickTargets[0];
            } else if (!target && quickTargets.length > 1) {
                const anchor = resolvePointPickMenuAnchor();
                openedMenu = !!showPointPickTargetMenu(
                    quickTargets,
                    anchor.x,
                    anchor.y
                );
            }
            if (!target && fallbackNodeId) {
                const ctx = findNodeContextById(fallbackNodeId);
                if (ctx && ctx.node) {
                    const nodeTargets = getPointPickTargetsForNodeId(fallbackNodeId);
                    if (nodeTargets.length === 1) {
                        target = nodeTargets[0];
                    } else if (nodeTargets.length > 1 && !openedMenu) {
                        const anchor = resolvePointPickMenuAnchor();
                        openedMenu = !!showPointPickTargetMenu(
                            nodeTargets,
                            anchor.x,
                            anchor.y
                        );
                    }
                }
            }
        }
        pointPickTarget = target || null;
        if (pointPickTarget) activeVecTarget = pointPickTarget;
        ensureHoverMarker();
        setHoverMarkerColor(0xffcc33);
        hoverMarker.visible = true;
        if (openedMenu) {
            setPointPickStatus(`${getPlaneInfo().label} 点拾取：请先在菜单里选择要修改的坐标组`);
        } else {
            refreshPointPickStatus();
        }
        return true;
    }

    function stopPointPick() {
        hideHoverMarker();
        hidePointPickPreview();
        pointPickMode = false;
        pointPickTarget = null;
        pointPickKeepFocusId = null;
        pointPickHoverPoint = null;
        pointPickPendingMapped = null;
        _rClickT = 0;
        hideLinePickStatus();
    }

    const OFFSET_PARAM_GROUPS = {
        add_point: [["x", "y", "z"]],
        add_line: [["sx", "sy", "sz"], ["ex", "ey", "ez"]],
        add_bezier: [
            ["p1x", "p1y", "p1z"],
            ["p2x", "p2y", "p2z"],
            ["p3x", "p3y", "p3z"]
        ],
        add_bezier_4: [
            ["p1x", "p1y", "p1z"],
            ["p2x", "p2y", "p2z"],
            ["p3x", "p3y", "p3z"],
            ["p4x", "p4y", "p4z"]
        ]
    };

    function applyOffsetDeltaToNode(node, delta) {
        if (!node || !node.kind) return false;
        const groups = OFFSET_PARAM_GROUPS[node.kind];
        if (!groups) return false;
        const p = node.params || (node.params = {});
        for (const g of groups) {
            const kx = g[0], ky = g[1], kz = g[2];
            if (kx) p[kx] = num(p[kx]) + delta.x;
            if (ky) p[ky] = num(p[ky]) + delta.y;
            if (kz) p[kz] = num(p[kz]) + delta.z;
        }
        return true;
    }

    function normalizeOffsetTargetIds(ids) {
        const src = Array.isArray(ids) ? ids : [];
        const out = [];
        const seen = new Set();
        for (const id of src) {
            if (!id || seen.has(id)) continue;
            seen.add(id);
            if (!findNodeContextById(id)) continue;
            out.push(id);
        }
        if (out.length <= 1) return out;
        const outSet = new Set(out);
        const pruned = [];
        for (const id of out) {
            const path = findNodePathById(id);
            let coveredByAncestor = false;
            if (Array.isArray(path) && path.length > 1) {
                for (let i = 0; i < path.length - 1; i++) {
                    const ancId = path[i] && path[i].node ? path[i].node.id : null;
                    if (ancId && outSet.has(ancId)) {
                        coveredByAncestor = true;
                        break;
                    }
                }
            }
            if (!coveredByAncestor) pruned.push(id);
        }
        return pruned;
    }

    function startOffsetMode(nodeId, options = {}) {
        hideActionMenu();
        hideQuickSyncPanel();
        const srcIds = Array.isArray(options.ids) && options.ids.length
            ? options.ids
            : (nodeId ? [nodeId] : []);
        const targetIds = normalizeOffsetTargetIds(srcIds);
        if (!targetIds.length) return;

        const usableIds = [];
        let sx = 0, sy = 0, sz = 0;
        for (const id of targetIds) {
            const center = getNodeSegmentCenter(id);
            if (!center) continue;
            usableIds.push(id);
            sx += center.x;
            sy += center.y;
            sz += center.z;
        }
        if (!usableIds.length) {
            showToast("无法进入偏移模式：该图形没有点", "error");
            return;
        }

        if (linePickMode) stopLinePick();
        if (pointPickMode) stopPointPick();
        offsetMode = true;
        offsetTargetIds = usableIds;
        offsetTargetId = usableIds[0] || null;
        offsetRefPoint = {
            x: sx / usableIds.length,
            y: sy / usableIds.length,
            z: sz / usableIds.length
        };
        offsetHoverPoint = null;
        hideOffsetPreview();
        const groupTip = usableIds.length > 1 ? `（${usableIds.length}项）` : "";
        setLinePickStatus(`${getPlaneInfo().label} 偏移模式${groupTip}：左键确定位置，Esc / T / 右键双击 退出`);
        ensureHoverMarker();
        setHoverMarkerColor(offsetPointColor.getHex());
        hoverMarker.visible = false;
        updateFocusColors();
    }

    function stopOffsetMode() {
        if (!offsetMode) return;
        offsetMode = false;
        offsetTargetId = null;
        offsetTargetIds = [];
        offsetRefPoint = null;
        offsetHoverPoint = null;
        hideHoverMarker();
        hideOffsetPreview();
        hideLinePickStatus();
        updateFocusColors();
    }

    function applyOffsetToTargetId(targetId, worldDelta) {
        if (!targetId || !worldDelta) return false;
        const ctx = findNodeContextById(targetId);
        if (!ctx || !ctx.node) return false;

        const path = findNodePathById(targetId);
        const localDeltaRaw = mapWorldDeltaToLocalDelta(worldDelta, path, path ? path.length - 1 : -1);
        const localDelta = (localDeltaRaw
            && Number.isFinite(localDeltaRaw.x)
            && Number.isFinite(localDeltaRaw.y)
            && Number.isFinite(localDeltaRaw.z))
            ? localDeltaRaw
            : worldDelta;

        if (ctx.node.kind === "add_builder" || ctx.node.kind === "with_builder") {
            const p = ctx.node.params || (ctx.node.params = {});
            p.ox = num(p.ox) + localDelta.x;
            p.oy = num(p.oy) + localDelta.y;
            p.oz = num(p.oz) + localDelta.z;
            return true;
        }

        if (applyOffsetDeltaToNode(ctx.node, localDelta)) return true;

        if (ctx.parentNode && ctx.parentNode.kind === "add_builder"
            && Array.isArray(ctx.parentNode.children)
            && ctx.parentNode.children.length === 1) {
            const parentDeltaRaw = mapWorldDeltaToLocalDelta(worldDelta, path, path ? path.length - 2 : -1);
            const parentDelta = (parentDeltaRaw
                && Number.isFinite(parentDeltaRaw.x)
                && Number.isFinite(parentDeltaRaw.y)
                && Number.isFinite(parentDeltaRaw.z))
                ? parentDeltaRaw
                : localDelta;
            const p = ctx.parentNode.params || (ctx.parentNode.params = {});
            p.ox = num(p.ox) + parentDelta.x;
            p.oy = num(p.oy) + parentDelta.y;
            p.oz = num(p.oz) + parentDelta.z;
            return true;
        }

        const wrapper = makeNode("add_builder", { params: { ox: localDelta.x, oy: localDelta.y, oz: localDelta.z } });
        wrapper.children = [ctx.node];
        ctx.parentList.splice(ctx.index, 1, wrapper);
        return true;
    }

    function applyOffsetAtPoint(target) {
        if (!offsetMode || !offsetRefPoint || !target) return;
        const targetIds = getActiveOffsetTargetIds();
        if (!targetIds.length) {
            stopOffsetMode();
            return;
        }
        const dx = target.x - offsetRefPoint.x;
        const dy = target.y - offsetRefPoint.y;
        const dz = target.z - offsetRefPoint.z;
        if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) return;
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-9) {
            stopOffsetMode();
            return;
        }

        const worldDelta = { x: dx, y: dy, z: dz };
        historyCapture("offset_move");
        let changed = false;
        for (const id of targetIds) {
            if (applyOffsetToTargetId(id, worldDelta)) changed = true;
        }
        if (changed) renderAll();
        stopOffsetMode();
    }

    function applyPointToTarget(p) {
        if (!pointPickTarget) return;
        const root = pointPickTarget;
        const targets = (Array.isArray(root.multiTargets) && root.multiTargets.length)
            ? root.multiTargets
            : [root];
        historyCapture(targets.length > 1 ? "pick_point_multi" : "pick_point");
        let needRenderAll = false;
        let focusInput = null;
        for (const t of targets) {
            if (!t || !t.obj || !t.keys) continue;
            t.obj[t.keys.x] = p.x;
            t.obj[t.keys.y] = p.y;
            t.obj[t.keys.z] = p.z;
            let dispatched = false;
            if (t.inputs) {
                t.inputs.x.value = String(p.x);
                t.inputs.y.value = String(p.y);
                t.inputs.z.value = String(p.z);
                if (t.inputs.x && t.inputs.x.isConnected) {
                    try {
                        t.inputs.x.dispatchEvent(new Event("input", { bubbles: true }));
                        dispatched = true;
                        if (!focusInput) focusInput = t.inputs.x;
                    } catch {}
                }
            }
            if (!dispatched && typeof t.onChange === "function") t.onChange();
            if (t.inputs && t.inputs.x && t.inputs.x.isConnected === false) {
                needRenderAll = true;
            }
        }
        if (needRenderAll) renderAll();
        if (focusInput) {
            try { focusInput.focus({ preventScroll: true }); } catch { try { focusInput.focus(); } catch {} }
        }
    }

    function onPointerMove(ev) {
        rememberPointPickMenuAnchor(ev);
        if (updateViewBoxSelecting(ev)) {
            ev.preventDefault();
            return;
        }
        if (!linePickMode && !pointPickMode && !offsetMode) return;
        if ((linePickMode || pointPickMode || offsetMode) && _rDown) {
            const d = Math.hypot(ev.clientX - _rDownX, ev.clientY - _rDownY);
            if (d > 6) _rMoved = true; // 视为拖动
            hideHoverMarker();
            if (linePickMode) hideLinePickPreview();
            if (pointPickMode) hidePointPickPreview();
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
                if (picked && picked.length === 1) updateLinePickPreview(mapped);
                else hideLinePickPreview();
            } else if (pointPickMode) {
                setHoverMarkerColor(0xffcc33);
                pointPickHoverPoint = mapped;
                queuePointPickPreview(mapped);
            } else if (offsetMode) {
                setHoverMarkerColor(offsetPointColor.getHex());
                offsetHoverPoint = mapped;
                updateOffsetPreview(mapped);
            }
            showHoverMarker(mapped);
        } else {
            hideHoverMarker();
            if (linePickMode) hideLinePickPreview();
            if (pointPickMode) {
                pointPickHoverPoint = null;
                hidePointPickPreview();
            }
            if (offsetMode) {
                offsetHoverPoint = null;
                updateOffsetPreview(null);
            }
        }
    }

    function onPointerUp(ev) {
        rememberPointPickMenuAnchor(ev);
        if (finishViewBoxSelection(ev)) return;
        if (viewBoxPending && ev && ev.pointerId === viewBoxPending.pointerId) {
            clearViewBoxState(ev.pointerId);
        }
        if (!linePickMode && !pointPickMode && !offsetMode) return;
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
            if (offsetMode) stopOffsetMode();
            _rClickT = 0;
            return;
        }

        // 记录第一次点击
        _rClickT = now;
        _rClickX = ev.clientX;
        _rClickY = ev.clientY;
    }

    function onPointerDown(ev) {
        rememberPointPickMenuAnchor(ev);
        // 非拾取模式：点击/拖动预览主要用于 OrbitControls；选点聚焦由 click 事件处理
        if (!linePickMode && !pointPickMode && !offsetMode) {
            beginViewBoxPending(ev);
            return;
        }

        // ✅ 右键 / Ctrl+Click：不选点，只进入“可能的右键双击取消”判定流程
        if ((linePickMode || pointPickMode || offsetMode) && isRightLike(ev)) {
            _rDown = true;
            _rMoved = false;
            _rDownX = ev.clientX;
            _rDownY = ev.clientY;
            return; // 关键：右键永远不选点
        }

        // 偏移模式下左键由 click 事件统一处理（可保留原有吸附与历史逻辑）
        if (offsetMode) return;

        // ✅ 只允许纯左键选点（排除 ctrlKey）
        if (ev.button !== 0 || ev.ctrlKey) return;

        // ✅ 屏蔽随后到来的 click（否则可能清空焦点/误聚焦）
        armCanvasClickSuppress(ev);

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
        raycaster.setFromCamera(mouse, camera);
        const particle = getParticleSnapFromEvent(ev);

        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(pickPlane, hit)) {
            const mapped = mapPickPoint(hit, particle);
            if (pointPickMode) {
                let target = pointPickTarget;
                if (target && target.inputs && target.inputs.x && !target.inputs.x.isConnected) {
                    setPointPickTarget(null);
                    target = null;
                }
                if (!target) {
                    setPointPickStatus(`${getPlaneInfo().label} 点拾取：请先在菜单里选择要修改的坐标组`);
                    return;
                }
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

                // ✅ 支持插入位置：如果是从 addBuilder 或某张卡片后进入拾取，则按 insertIndex 插入并可连续插入
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
                hideLinePickPreview();
                const keepId = linePickKeepFocusId;
                renderAll();
                // 用户要求：若进入拾取前聚焦在 addBuilder，则拾取新增后仍保持聚焦在原卡片上
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
            kotlinDirty = true;
            if (realtimeKotlin) scheduleKotlinOut();
            scheduleAutoSave();
        });
    }

    function renderAll() {
        // 保持选中卡片：用于高亮 & 插入规则（addBuilder 内新增等）
        applyCollapseAllStates();
        renderCards();
        if (paramSync && paramSync.open && typeof renderSyncMenu === "function") renderSyncMenu();
        applyParamStepToInputs();
        // 如果选中的卡片已不存在，则清空
        if (focusedNodeId && !linePickMode) {
            const ctx = findNodeContextById(focusedNodeId);
            if (!ctx) focusedNodeId = null;
        }
        rebuildPreviewAndKotlin();
    }

    // ------- Settings modal -------
    function showSettingsModal() {
        if (!settingsModal || !settingsMask) return;
        settingsModal.classList.remove("hidden");
        settingsMask.classList.remove("hidden");
    }

    function hideSettingsModal() {
        if (!settingsModal || !settingsMask) return;
        settingsModal.classList.add("hidden");
        settingsMask.classList.add("hidden");
        settingsModal.classList.remove("under");
        settingsMask.classList.remove("under");
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
        // ✅ 记录插入目标 + 需要保持的焦点（在子 builder 内新增后，默认保持聚焦在 addBuilder 上）
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
                // ✅ 子 builder 内新增：默认保持聚焦在 addBuilder 上；否则聚焦到新卡片
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
        const resolveCtx = (nodeId) => {
            if (!nodeId) return null;
            const ctx = findNodeContextById(nodeId);
            if (ctx && ctx.node) {
                if (isBuilderContainerKind(ctx.node.kind)) {
                    if (!Array.isArray(ctx.node.children)) ctx.node.children = [];
                    return { list: ctx.node.children, insertIndex: ctx.node.children.length, label: "子Builder", ownerNode: ctx.node };
                }
                // 普通卡片：插到它后面（同一列表）
                const label = ctx.parentNode ? "子Builder" : "主Builder";
                return { list: ctx.parentList, insertIndex: ctx.index + 1, label, ownerNode: ctx.parentNode || null };
            }
            return null;
        };
        if (focusedNodeId) {
            const resolved = resolveCtx(focusedNodeId);
            if (resolved) return resolved;
        }
        if (typeof getCardSelectionIds === "function") {
            const selected = getCardSelectionIds();
            if (selected && selected.size === 1) {
                const oneId = Array.from(selected)[0];
                const resolved = resolveCtx(oneId);
                if (resolved) return resolved;
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

        // ✅ 若是在 addBuilder 内新增，则保持聚焦在 addBuilder；否则聚焦新卡片
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
            if (offsetMode) {
                e.preventDefault();
                stopOffsetMode();
                return;
            }
            if (hkModal && !hkModal.classList.contains("hidden")) {
                e.preventDefault();
                hideHotkeysModal();
                return;
            }
            if (settingsModal && !settingsModal.classList.contains("hidden")) {
                e.preventDefault();
                hideSettingsModal();
                return;
            }
            if (modal && !modal.classList.contains("hidden")) {
                e.preventDefault();
                hideModal();
                return;
            }
            if (paramSync && paramSync.open && typeof setSyncEnabled === "function") {
                e.preventDefault();
                setSyncEnabled(false);
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
        if ((modal && !modal.classList.contains("hidden")) || (hkModal && !hkModal.classList.contains("hidden")) || (settingsModal && !settingsModal.classList.contains("hidden"))) {
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
                    if (!deleteSelectedCards()) deleteFocusedCard();
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
            if (settingsModal && !settingsModal.classList.contains("hidden")) {
                hideSettingsModal();
            }
            const ctx = getInsertContextFromFocus();
            const ownerNodeId = (ctx && ctx.ownerNode && isBuilderContainerKind(ctx.ownerNode.kind)) ? ctx.ownerNode.id : null;
            openModal(ctx.list, ctx.insertIndex, ctx.label, ownerNodeId);
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.toggleSettings)) {
            e.preventDefault();
            const wasHotkeysOpen = !!(hkModal && !hkModal.classList.contains("hidden"));
            if (wasHotkeysOpen) hideHotkeysModal();
            if (modal && !modal.classList.contains("hidden")) hideModal();
            if (settingsModal && !settingsModal.classList.contains("hidden")) {
                if (!wasHotkeysOpen) hideSettingsModal();
            } else {
                showSettingsModal();
            }
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.toggleFullscreen)) {
            e.preventDefault();
            if (modal && !modal.classList.contains("hidden")) hideModal();
            if (hkModal && !hkModal.classList.contains("hidden")) hideHotkeysModal();
            if (settingsModal && !settingsModal.classList.contains("hidden")) hideSettingsModal();
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
            if (settingsModal && !settingsModal.classList.contains("hidden")) hideSettingsModal();
            triggerImportJson();
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.toggleParamSync)) {
            e.preventDefault();
            if (paramSync && paramSync.anchor) {
                paramSync.anchor.click();
            } else if (typeof setSyncEnabled === "function") {
                setSyncEnabled(!(paramSync && paramSync.open));
            }
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.toggleFilter)) {
            e.preventDefault();
            const btn = document.querySelector(".panel.left .panel-tools .filter-wrap button");
            if (btn) btn.click();
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.toggleSnapGrid)) {
            e.preventDefault();
            if (chkSnapGrid) chkSnapGrid.click();
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.toggleSnapParticle)) {
            e.preventDefault();
            if (chkSnapParticle) chkSnapParticle.click();
            return;
        }

        // 4) Pick line XZ
        if (hotkeyMatchEvent(e, hotkeys.actions.pickLineXZ)) {
            e.preventDefault();
            // 进入拾取模式前，关闭弹窗，避免鼠标事件被遮罩拦截
            if (modal && !modal.classList.contains("hidden")) hideModal();
            if (hkModal && !hkModal.classList.contains("hidden")) hideHotkeysModal();
            if (settingsModal && !settingsModal.classList.contains("hidden")) hideSettingsModal();

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
            if (settingsModal && !settingsModal.classList.contains("hidden")) hideSettingsModal();
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
        if (hotkeyMatchEvent(e, hotkeys.actions.triggerFocusedMove)) {
            if ((modal && !modal.classList.contains("hidden")) || (hkModal && !hkModal.classList.contains("hidden"))) return;
            e.preventDefault();
            if (offsetMode) {
                stopOffsetMode();
                return;
            }
            let targetId = focusedNodeId;
            let selectedIds = [];
            if (!targetId && typeof getCardSelectionIds === "function") {
                const sel = getCardSelectionIds();
                if (sel && sel.size) targetId = Array.from(sel)[0] || null;
            }
            if (typeof getCardSelectionIds === "function") {
                const sel = getCardSelectionIds();
                if (sel && sel.size) selectedIds = Array.from(sel).filter(Boolean);
            }
            if (!targetId) return;
            focusCardById(targetId, false, false, true);
            if (selectedIds.length > 1) startOffsetMode(targetId, { ids: selectedIds });
            else startOffsetMode(targetId);
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
        hideActionMenu();
        const pid = viewBoxPending ? viewBoxPending.pointerId : null;
        clearViewBoxState(pid);
    });

      const cardSystem = initCardSystem({
          KIND,
        elCardsRoot,
        row,
        inputNum,
        select,
        checkbox,
        makeVec3Editor,
        angleInput,
        setTipKind,
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
        moveNodesByIds,
        downloadText,
        deepClone,
        fileBuilderJson,
        stopLinePick,
        startLinePick,
        stopPointPick,
        startOffsetMode,
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
        getSetSyncTargetsByIds: () => setSyncTargetsByIds,
        getBuilderJsonTargetNode: () => builderJsonTargetNode,
        setBuilderJsonTargetNode: (node) => { builderJsonTargetNode = node; },
        findNodeContextById,
          getLinePickMode: () => linePickMode,
          getPointPickMode: () => pointPickMode,
          setDraggingState: (v) => { isDraggingCard = !!v; },
          onCardSelectionChange: () => updateFocusColors(),
          syncCardCollapseUI,
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
        addQuickOffsetTo,
        getSelectedNodeIds: getCardSelectionIds,
        setSelectedNodeIds: setCardSelectionIds,
        clearSelectedNodeIds: clearCardSelectionIds
    } = cardSystem);

    const filterSystem = initFilterSystem({
        KIND,
        showToast,
        elCardsRoot,
        deepClone,
        findNodeContextById,
        renderCards: () => renderCards(),
        rebuildPreviewAndKotlin: () => rebuildPreviewAndKotlin(),
        renderParamsEditors: (...args) => renderParamsEditors(...args),
        onSyncSelectionChange: () => updateFocusColors()
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
        setSyncTargetsByIds,
        setSyncEnabled,
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
        flushKotlinOut();
    }

    function doCopyKotlin() {
        if (kotlinRenderTimer || kotlinDirty) flushKotlinOut();
        const text = kotlinRaw || emitKotlin();
        if (!kotlinRaw) setKotlinOut(text);
        navigator.clipboard?.writeText(text);
    }

    function doDownloadKotlin() {
        if (kotlinRenderTimer || kotlinDirty) flushKotlinOut();
        const text = kotlinRaw || emitKotlin();
        if (!kotlinRaw) setKotlinOut(text);
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = makeExportFileName("kt", "PointsBuilder_Generated");
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 200);
    }

    btnExportKotlin?.addEventListener("click", doExportKotlin);
    btnExportKotlin2?.addEventListener("click", doExportKotlin);
    btnToggleKotlin && btnToggleKotlin.addEventListener("click", () => setKotlinHidden(!isKotlinHidden()));
    btnCopyKotlin?.addEventListener("click", doCopyKotlin);
    btnCopyKotlin2?.addEventListener("click", doCopyKotlin);
    if (selKotlinEnd) {
        selKotlinEnd.value = kotlinEndMode;
        selKotlinEnd.addEventListener("change", () => {
            kotlinEndMode = selKotlinEnd.value || "builder";
            saveKotlinEndMode(kotlinEndMode);
            flushKotlinOut();
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
    if (inpParamStep) {
        if (inpParamStep.value === "") inpParamStep.value = String(paramStep);
        setParamStep(inpParamStep.value, { skipSave: true });
        inpParamStep.addEventListener("input", () => {
            const n = parseFloat(inpParamStep.value);
            if (!Number.isFinite(n) || n <= 0) return;
            paramStep = n;
            applyParamStepToInputs();
            saveSettingsToStorage();
        });
        inpParamStep.addEventListener("blur", () => {
            setParamStep(inpParamStep.value);
        });
    }
    if (inpSnapStep) {
        if (inpSnapStep.value === "") inpSnapStep.value = String(snapStep);
        setSnapStep(inpSnapStep.value, { skipSave: true });
        inpSnapStep.addEventListener("input", () => {
            const n = parseFloat(inpSnapStep.value);
            if (!Number.isFinite(n) || n <= 0) return;
            snapStep = n;
            saveSettingsToStorage();
        });
        inpSnapStep.addEventListener("blur", () => {
            setSnapStep(inpSnapStep.value);
        });
    }
    if (inpSnapParticleRange) {
        if (inpSnapParticleRange.value === "") inpSnapParticleRange.value = String(particleSnapRange);
        setParticleSnapRange(inpSnapParticleRange.value, { skipSave: true });
        inpSnapParticleRange.addEventListener("input", () => {
            const n = parseFloat(inpSnapParticleRange.value);
            if (!Number.isFinite(n) || n <= 0) return;
            particleSnapRange = n;
            saveSettingsToStorage();
        });
        inpSnapParticleRange.addEventListener("blur", () => {
            setParticleSnapRange(inpSnapParticleRange.value);
        });
    }
    if (inpOffsetPreviewLimit) {
        if (inpOffsetPreviewLimit.value === "") inpOffsetPreviewLimit.value = String(offsetPreviewLimit);
        setOffsetPreviewLimit(inpOffsetPreviewLimit.value, { skipSave: true });
        inpOffsetPreviewLimit.addEventListener("keydown", (ev) => {
            if (ev.key !== "-" && ev.code !== "NumpadSubtract") return;
            ev.preventDefault();
            setOffsetPreviewLimit(-1);
        });
        inpOffsetPreviewLimit.addEventListener("input", () => {
            setOffsetPreviewLimit(inpOffsetPreviewLimit.value);
        });
    }
    btnHotkeys && btnHotkeys.addEventListener("click", showSettingsModal);
    btnCloseSettings && btnCloseSettings.addEventListener("click", hideSettingsModal);
    settingsMask && settingsMask.addEventListener("click", hideSettingsModal);

    btnAddCard.addEventListener("click", () => {
            const ctx = getInsertContextFromFocus();
            const ownerNodeId = (ctx && ctx.ownerNode && isBuilderContainerKind(ctx.ownerNode.kind)) ? ctx.ownerNode.id : null;
            openModal(ctx.list, ctx.insertIndex, ctx.label, ownerNodeId);
        });
    btnQuickOffset.addEventListener("click", () => {
        addQuickOffsetTo(state.root.children);
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
            normalizeNodeTree(state.root);
            ensureAxisEverywhere();
            resetCollapseScopes();
            collapseAllNodes(state.root.children);
            const rawName = (f.name || "").replace(/\.[^/.]+$/, "");
            const nextName = sanitizeFileBase(rawName || "");
            if (nextName) {
                projectName = nextName;
                saveProjectName(projectName);
                if (inpProjectName) inpProjectName.value = projectName;
            }
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
            historyCapture("import_add_builder_json");
            target.children = obj.root.children;
            normalizeNodeTree(target.children);
            ensureAxisInList(target.children);
            resetCollapseScopes();
            collapseAllNodes(target.children);
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
    loadSettingsFromStorage();
    if (chkRealtimeKotlin) setRealtimeKotlin(chkRealtimeKotlin.checked, { skipSave: true });
    if (chkPointPickPreview) setPointPickPreviewEnabled(chkPointPickPreview.checked, { skipSave: true });
    initTheme();
    bindThemeHotkeys();
    bindDragCopyGuards();
    bindActionMenuDismiss();
    bindPointPickMenuAnchorTracking();
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
    if (elCardsRoot && !elCardsRoot.__pbActionMenuBound) {
        elCardsRoot.__pbActionMenuBound = true;
        elCardsRoot.addEventListener("contextmenu", onCardsContextMenu);
    }
    initCollapseAllControls();
    if (typeof bindParamSyncListeners === "function") bindParamSyncListeners();
    if (typeof refreshHotkeyHints === "function") refreshHotkeyHints();
    renderAll();
})();
