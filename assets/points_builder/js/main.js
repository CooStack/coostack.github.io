import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";

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

    const btnSaveJson = document.getElementById("btnSaveJson");
    const btnLoadJson = document.getElementById("btnLoadJson");
    const fileJson = document.getElementById("fileJson");
    const fileBuilderJson = document.getElementById("fileBuilderJson");
    const btnReset = document.getElementById("btnReset");
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
    const LAYOUT_STORAGE_KEY = "pb_layout_v1";
    const MIN_LEFT_W = 220;
    const MIN_RIGHT_W = 260;
    const MIN_VIEWER_W = 280;

    let layoutState = loadLayoutState();

    function clamp(v, min, max) {
        let lo = Number(min);
        let hi = Number(max);
        if (!Number.isFinite(lo)) lo = 0;
        if (!Number.isFinite(hi)) hi = lo;
        if (hi < lo) hi = lo;
        return Math.min(Math.max(Number(v) || 0, lo), hi);
    }

    function loadLayoutState() {
        try {
            const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
            if (raw) {
                const obj = JSON.parse(raw);
                if (obj && typeof obj === "object") {
                    return {
                        leftWidth: Number.isFinite(obj.leftWidth) ? obj.leftWidth : null,
                        rightWidth: Number.isFinite(obj.rightWidth) ? obj.rightWidth : null,
                        kotlinHidden: !!obj.kotlinHidden,
                    };
                }
            }
        } catch (e) {
            console.warn("loadLayoutState failed:", e);
        }
        return { leftWidth: null, rightWidth: null, kotlinHidden: false };
    }

    function saveLayoutState() {
        try {
            localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layoutState));
        } catch (e) {
            console.warn("saveLayoutState failed:", e);
        }
    }

    function getPanelWidth(panel) {
        if (!panel) return 0;
        const rect = panel.getBoundingClientRect();
        return rect && rect.width ? rect.width : 0;
    }

    function setPanelWidth(panel, w) {
        if (!panel || !Number.isFinite(w)) return;
        const v = Math.max(0, w);
        panel.style.width = `${v}px`;
        panel.style.flex = `0 0 ${v}px`;
    }

    function clampLeftWidth(w) {
        if (!layoutEl) return w;
        const layoutW = layoutEl.getBoundingClientRect().width || 0;
        const rightW = layoutState.kotlinHidden ? 0 : (getPanelWidth(panelRight) || layoutState.rightWidth || MIN_RIGHT_W);
        const max = Math.max(MIN_LEFT_W, layoutW - rightW - MIN_VIEWER_W);
        return clamp(w, MIN_LEFT_W, max);
    }

    function clampRightWidth(w) {
        if (!layoutEl) return w;
        const layoutW = layoutEl.getBoundingClientRect().width || 0;
        const leftW = getPanelWidth(panelLeft) || layoutState.leftWidth || MIN_LEFT_W;
        const max = Math.max(MIN_RIGHT_W, layoutW - leftW - MIN_VIEWER_W);
        return clamp(w, MIN_RIGHT_W, max);
    }

    function updateKotlinToggleText() {
        if (!btnToggleKotlin) return;
        if (layoutState.kotlinHidden) {
            btnToggleKotlin.textContent = "<";
            btnToggleKotlin.title = "显示 Kotlin";
        } else {
            btnToggleKotlin.textContent = ">";
            btnToggleKotlin.title = "隐藏 Kotlin";
        }
    }

    function setKotlinHidden(hidden, persist = true) {
        if (!layoutEl) return;
        const next = !!hidden;
        if (next) {
            const curRight = getPanelWidth(panelRight);
            if (curRight) layoutState.rightWidth = curRight;
            if (Number.isFinite(curRight) && curRight > 0) setPanelWidth(panelRight, curRight);
            requestAnimationFrame(() => layoutEl.classList.add("kotlin-hidden"));
        } else {
            layoutEl.classList.remove("kotlin-hidden");
            if (Number.isFinite(layoutState.rightWidth)) {
                const w = clampRightWidth(layoutState.rightWidth);
                layoutState.rightWidth = w;
                requestAnimationFrame(() => setPanelWidth(panelRight, w));
            }
        }
        layoutState.kotlinHidden = next;
        updateKotlinToggleText();
        scheduleThreeResize();
        scheduleTogglePosition();
        setTimeout(scheduleThreeResize, 360);
        setTimeout(scheduleTogglePosition, 360);
        if (persist) saveLayoutState();
    }

    function applyLayoutState(persist = false) {
        if (!layoutEl) return;
        setKotlinHidden(!!layoutState.kotlinHidden, false);
        if (Number.isFinite(layoutState.leftWidth)) {
            const w = clampLeftWidth(layoutState.leftWidth);
            layoutState.leftWidth = w;
            setPanelWidth(panelLeft, w);
        }
        if (!layoutState.kotlinHidden && Number.isFinite(layoutState.rightWidth)) {
            const w = clampRightWidth(layoutState.rightWidth);
            layoutState.rightWidth = w;
            setPanelWidth(panelRight, w);
        }
        scheduleTogglePosition();
        if (persist) saveLayoutState();
    }

    let resizeRaf = 0;
    let togglePosRaf = 0;
    function scheduleThreeResize() {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = 0;
            onResize();
        });
    }

    function positionKotlinToggle() {
        if (!btnToggleKotlin || !layoutEl) return;
        const layoutRect = layoutEl.getBoundingClientRect();
        if (!layoutRect || layoutRect.width <= 0) return;
        if (layoutState.kotlinHidden || !panelRight) {
            btnToggleKotlin.style.left = "auto";
            btnToggleKotlin.style.right = "10px";
            return;
        }
        const rightRect = panelRight.getBoundingClientRect();
        const desiredLeft = rightRect.left - layoutRect.left + 8;
        const safeLeft = clamp(desiredLeft, 8, Math.max(8, layoutRect.width - 36));
        btnToggleKotlin.style.left = `${safeLeft}px`;
        btnToggleKotlin.style.right = "auto";
    }

    function scheduleTogglePosition() {
        if (togglePosRaf) cancelAnimationFrame(togglePosRaf);
        togglePosRaf = requestAnimationFrame(() => {
            togglePosRaf = 0;
            positionKotlinToggle();
        });
    }

    if (panelRight) {
        panelRight.addEventListener("transitionend", (e) => {
            if (e.propertyName === "width" || e.propertyName === "flex-basis" || e.propertyName === "transform") {
                scheduleThreeResize();
                scheduleTogglePosition();
            }
        });
    }

    function bindResizer(el, side) {
        if (!el) return;
        el.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            if (side === "right" && layoutState.kotlinHidden) return;
            e.preventDefault();
            const startX = e.clientX;
            const startLeft = getPanelWidth(panelLeft);
            const startRight = getPanelWidth(panelRight);

            const onMove = (ev) => {
                const dx = ev.clientX - startX;
                if (side === "left") {
                    const w = clampLeftWidth(startLeft + dx);
                    layoutState.leftWidth = w;
                    setPanelWidth(panelLeft, w);
                    scheduleTogglePosition();
                } else {
                    const w = clampRightWidth(startRight - dx);
                    layoutState.rightWidth = w;
                    setPanelWidth(panelRight, w);
                    scheduleTogglePosition();
                }
            };

            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("resizing-panels");
                saveLayoutState();
                scheduleThreeResize();
                scheduleTogglePosition();
            };

            document.body.classList.add("resizing-panels");
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }

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
    // Hotkeys + Download helpers
    // -------------------------
    const HOTKEY_STORAGE_KEY = "pb_hotkeys_v1";

    const DEFAULT_HOTKEYS = {
        version: 1,
        actions: {
            openPicker: "KeyW",          // W
            pickLineXZ: "KeyQ",          // Q
            pickPoint: "KeyE",           // E
            snapPlaneXZ: "Digit1",       // 1
            snapPlaneXY: "Digit2",       // 2
            snapPlaneZY: "Digit3",       // 3
            mirrorPlaneXZ: "Shift+Digit1", // Shift + 1
            mirrorPlaneXY: "Shift+Digit2", // Shift + 2
            mirrorPlaneZY: "Shift+Digit3", // Shift + 3
            copyFocused: "Mod+KeyD",     // Ctrl/Cmd + D
            mirrorCopy: "Mod+Shift+KeyM",// Ctrl/Cmd + Shift + M
            undo: "Mod+KeyZ",            // Ctrl/Cmd + Z
            redo: "Mod+Shift+KeyZ",      // Ctrl/Cmd + Shift + Z
            // 删除聚焦卡片（Mac 键盘上的“Delete”通常对应 Backspace；更通用）
            deleteFocused: "Backspace",
        },
        kinds: {},
    };

    function normalizeHotkey(hk) {
        if (!hk || typeof hk !== "string") return "";
        const parts = hk.split("+").map(s => s.trim()).filter(Boolean);
        const hasMod = parts.includes("Mod");
        const hasShift = parts.includes("Shift");
        const hasAlt = parts.includes("Alt");
        const main = parts.find(p => p !== "Mod" && p !== "Shift" && p !== "Alt") || "";
        const out = [];
        if (hasMod) out.push("Mod");
        if (hasShift) out.push("Shift");
        if (hasAlt) out.push("Alt");
        if (main) out.push(main);
        return out.join("+");
    }

    function eventToHotkey(e) {
        const parts = [];
        if (e.ctrlKey || e.metaKey) parts.push("Mod");
        if (e.shiftKey) parts.push("Shift");
        if (e.altKey) parts.push("Alt");

        const code = e.code || "";
        const isModifierCode = (
            code === "ShiftLeft" || code === "ShiftRight" ||
            code === "ControlLeft" || code === "ControlRight" ||
            code === "AltLeft" || code === "AltRight" ||
            code === "MetaLeft" || code === "MetaRight"
        );
        if (code && !isModifierCode) parts.push(code);
        return normalizeHotkey(parts.join("+"));
    }

    function hotkeyToHuman(hk) {
        hk = normalizeHotkey(hk);
        if (!hk) return "";
        const parts = hk.split("+");
        const out = parts.map(p => {
            if (p === "Mod") return "Ctrl/Cmd";
            if (p === "Shift") return "Shift";
            if (p === "Alt") return "Alt";
                        if (p.startsWith("Key")) return p.slice(3).toUpperCase();
            if (p.startsWith("Digit")) return p.slice(5);
            if (p === "Space") return "Space";
            if (p === "Escape") return "Esc";
            if (p === "Backspace") return "Backspace";
            if (p === "Enter") return "Enter";
            if (p.startsWith("Arrow")) return p.replace("Arrow", "");
            return p;
        });
        return out.join("+");
    }

    function hotkeyMatchEvent(e, hk) {
        hk = normalizeHotkey(hk);
        if (!hk) return false;
        return eventToHotkey(e) === hk;
    }

    function shouldIgnorePlainHotkeys() {
        const ae = document.activeElement;
        if (!ae) return false;
        const tag = (ae.tagName || "").toUpperCase();
        if (tag === "INPUT") {
            const type = (ae.type || "text").toLowerCase();
            // number 输入允许快捷键触发（避免影响常用工作流）
            if (type === "number") return false;
            return true;
        }
        if (tag === "TEXTAREA") {
            // 右侧 Kotlin 代码栏只读，但用户希望快捷键（W/Q等）依然可用
            if (ae.id === "kotlinOut" && ae.readOnly) return false;
            return true;
        }
        if (ae.isContentEditable) return true;
        return false;
    }

    function downloadText(filename, text, mime = "text/plain") {
        const blob = new Blob([text], { type: `${mime};charset=utf-8` });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename || "download.txt";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 200);
    }

    function loadHotkeys() {
        try {
            const raw = localStorage.getItem(HOTKEY_STORAGE_KEY);
            if (raw) {
                const obj = JSON.parse(raw);
                const out = {
                    version: 1,
                    actions: Object.assign({}, DEFAULT_HOTKEYS.actions),
                    kinds: {},
                };
                if (obj && typeof obj === "object") {
                    if (obj.actions && typeof obj.actions === "object") {
                        Object.assign(out.actions, obj.actions);
                    }
                    if (obj.kinds && typeof obj.kinds === "object") {
                        out.kinds = Object.assign({}, obj.kinds);
                    }
                }
                // normalize
                for (const k of Object.keys(out.actions)) out.actions[k] = normalizeHotkey(out.actions[k]);
                for (const k of Object.keys(out.kinds)) out.kinds[k] = normalizeHotkey(out.kinds[k]);
                return out;
            }
        } catch (e) {
            console.warn("loadHotkeys failed:", e);
        }
        return JSON.parse(JSON.stringify(DEFAULT_HOTKEYS));
    }

    function saveHotkeys() {
        try {
            localStorage.setItem(HOTKEY_STORAGE_KEY, JSON.stringify(hotkeys));
        } catch (e) {
            console.warn("saveHotkeys failed:", e);
        }
        refreshHotkeyHints();
    }

    function resetHotkeys() {
        hotkeys = JSON.parse(JSON.stringify(DEFAULT_HOTKEYS));
        saveHotkeys();
        renderHotkeysList();
    }

    function removeHotkeyConflicts(hk, except = null) {
        hk = normalizeHotkey(hk);
        if (!hk) return;

        // 清理重复绑定（同一个按键只能绑定一个功能）
        for (const [id, v] of Object.entries(hotkeys.actions || {})) {
            if (except && except.type === "action" && except.id === id) continue;
            if (normalizeHotkey(v) === hk) hotkeys.actions[id] = "";
        }
        for (const [kind, v] of Object.entries(hotkeys.kinds || {})) {
            if (except && except.type === "kind" && except.id === kind) continue;
            if (normalizeHotkey(v) === hk) delete hotkeys.kinds[kind];
        }
    }

    // load hotkeys once
    let hotkeys = loadHotkeys();
    // 关键动作快捷键不允许为空（否则用户会出现“按 W/Q 没反应”的体验）
    for (const k of Object.keys(DEFAULT_HOTKEYS.actions)) {
        if (!hotkeys.actions[k]) hotkeys.actions[k] = DEFAULT_HOTKEYS.actions[k];
    }


    // -------------------------
    // KIND
    // -------------------------
    const KIND = {
        axis: {
            title: "axis(对称轴)",
            desc: "PointsBuilder.axis(RelativeLocation)",
            defaultParams: {x: 0, y: 1, z: 0},
            apply(ctx, node) {
                ctx.axis = U.v(num(node.params.x), num(node.params.y), num(node.params.z));
            },
            kotlin(node) {
                return `.axis(${relExpr(node.params.x, node.params.y, node.params.z)})`;
            }
        },

        rotate_as_axis: {
            title: "rotateAsAxis(绕轴旋转)",
            desc: "度输入；导出为 系数*PI",
            defaultParams: {deg: 90, useCustomAxis: false, ax: 0, ay: 1, az: 0},
            apply(ctx, node) {
                const rad = U.degToRad(num(node.params.deg));
                const axis = node.params.useCustomAxis
                    ? U.v(num(node.params.ax), num(node.params.ay), num(node.params.az))
                    : ctx.axis;
                ctx.points = ctx.points.map(p => U.rotateAroundAxis(p, axis, rad));
            },
            kotlin(node) {
                const radExpr = U.degToKotlinRadExpr(num(node.params.deg));
                if (node.params.useCustomAxis) {
                    return `.rotateAsAxis(${radExpr}, ${relExpr(node.params.ax, node.params.ay, node.params.az)})`;
                }
                return `.rotateAsAxis(${radExpr})`;
            }
        },

        rotate_to: {
            title: "rotateTo(指向目标)",
            desc: "让 axis 指向目标方向（已修复预览）",
            defaultParams: {mode: "toVec", tox: 0, toy: 1, toz: 1, ox: 0, oy: 0, oz: 0, ex: 0, ey: 0, ez: 1},
            apply(ctx, node) {
                if (!ctx.points || ctx.points.length === 0) return;

                // 检查参数
                const toX = num(node.params.tox);
                const toY = num(node.params.toy);
                const toZ = num(node.params.toz);

                let to;
                if (node.params.mode === "originEnd") {
                    // origin+end 模式计算目标向量
                    const origin = U.v(num(node.params.ox), num(node.params.oy), num(node.params.oz));
                    const end = U.v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
                    to = U.sub(end, origin); // 计算目标向量
                } else {
                    // 使用传入的 toX, toY, toZ 作为目标向量
                    to = U.v(toX, toY, toZ);  // 将目标向量传入
                }

                console.log(to, toX, toY, toZ);
                const axis = U.norm(ctx.axis);  // 当前轴向
                const toN = U.norm(to);         // 目标向量的单位向量

                // 目标向量和轴向为零向量：跳过
                if (U.len(axis) <= 1e-12 || U.len(toN) <= 1e-12) return;

                // 计算旋转的四元数（根据目标向量来旋转）
                const q = new THREE.Quaternion();
                q.setFromUnitVectors(
                    new THREE.Vector3(axis.x, axis.y, axis.z),
                    new THREE.Vector3(toN.x, toN.y, toN.z)
                );

                // 使用四元数旋转所有点
                const v = new THREE.Vector3();
                for (let i = 0; i < ctx.points.length; i++) {
                    const p = ctx.points[i];
                    v.set(p.x, p.y, p.z).applyQuaternion(q);  // 使用四元数旋转
                    p.x = v.x;
                    p.y = v.y;
                    p.z = v.z;
                }
            },
            kotlin(node) {
                if (node.params.mode === "originEnd") {
                    return `.rotateTo(${relExpr(node.params.ox, node.params.oy, node.params.oz)}, ${relExpr(node.params.ex, node.params.ey, node.params.ez)})`;
                }
                return `.rotateTo(${relExpr(node.params.tox, node.params.toy, node.params.toz)})`;
            }
        },

        scale: {
            title: "scale(缩放)",
            desc: "PointsBuilder.scale(factor)",
            defaultParams: {factor: 1},
            apply(ctx, node) {
                const f = num(node.params.factor);
                if (f <= 0) return;
                ctx.points = ctx.points.map(p => U.mul(p, f));
            },
            kotlin(node) {
                return `.scale(${U.fmt(num(node.params.factor))})`;
            }
        },

        add_point: {
            title: "addPoint(单点)",
            desc: "PointsBuilder.addPoint(RelativeLocation)",
            defaultParams: {x: 0, y: 0, z: 0},
            apply(ctx, node) {
                ctx.points.push(U.v(num(node.params.x), num(node.params.y), num(node.params.z)));
            },
            kotlin(node) {
                return `.addPoint(${relExpr(node.params.x, node.params.y, node.params.z)})`;
            }
        },

        add_line: {
            title: "addLine(线段)",
            desc: "start -> end",
            defaultParams: {sx: 0, sy: 0, sz: 0, ex: 3, ey: 0, ez: 3, count: 30},
            apply(ctx, node) {
                const s = U.v(num(node.params.sx), num(node.params.sy), num(node.params.sz));
                const e = U.v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
                ctx.points.push(...U.getLineLocations(s, e, Math.max(1, int(node.params.count))));
            },
            kotlin(node) {
                return `.addLine(${relExpr(node.params.sx, node.params.sy, node.params.sz)}, ${relExpr(node.params.ex, node.params.ey, node.params.ez)}, ${int(node.params.count)})`;
            }
        },

        add_circle: {
            title: "addCircle(XZ圆)",
            desc: "addCircle(r, count)",
            defaultParams: {r: 2, count: 120},
            apply(ctx, node) {
                ctx.points.push(...U.getCircleXZ(num(node.params.r), int(node.params.count)));
            },
            kotlin(node) {
                return `.addCircle(${U.fmt(num(node.params.r))}, ${int(node.params.count)})`;
            }
        },

        add_discrete_circle_xz: {
            title: "addDiscreteCircleXZ(离散圆环)",
            desc: "addDiscreteCircleXZ(r, count, discrete)",
            defaultParams: {r: 2, count: 120, discrete: 0.4, seedEnabled: false, seed: 1},
            apply(ctx, node) {
                const seed = node.params.seedEnabled ? int(node.params.seed) : null;
                ctx.points.push(...U.getDiscreteCircleXZ(num(node.params.r), int(node.params.count), num(node.params.discrete), seed));
            },
            kotlin(node) {
                return `.addDiscreteCircleXZ(${U.fmt(num(node.params.r))}, ${int(node.params.count)}, ${U.fmt(num(node.params.discrete))})`;
            }
        },

        add_half_circle: {
            title: "addHalfCircle(半圆XZ)",
            desc: "可选 rotate(rad)；输入度导出*PI",
            defaultParams: {r: 2, count: 80, useRotate: false, rotateDeg: 0},
            apply(ctx, node) {
                const rot = node.params.useRotate ? U.degToRad(num(node.params.rotateDeg)) : 0;
                ctx.points.push(...U.getHalfCircleXZ(num(node.params.r), int(node.params.count), rot));
            },
            kotlin(node) {
                const r = U.fmt(num(node.params.r));
                const c = int(node.params.count);
                if (!node.params.useRotate) return `.addHalfCircle(${r}, ${c})`;
                const radExpr = U.degToKotlinRadExpr(num(node.params.rotateDeg));
                return `.addHalfCircle(${r}, ${c}, ${radExpr})`;
            }
        },

        add_radian_center: {
            title: "addRadianCenter(弧线中心XZ)",
            desc: "从 -radian/2..radian/2；可选 rotate(rad)；输入度导出*PI",
            defaultParams: {r: 2, count: 80, radianDeg: 120, useRotate: false, rotateDeg: 0},
            apply(ctx, node) {
                const radian = U.degToRad(num(node.params.radianDeg));
                const rot = node.params.useRotate ? U.degToRad(num(node.params.rotateDeg)) : 0;
                ctx.points.push(...U.getRadianXZCenter(num(node.params.r), int(node.params.count), radian, rot));
            },
            kotlin(node) {
                const r = U.fmt(num(node.params.r));
                const c = int(node.params.count);
                const radianExpr = U.degToKotlinRadExpr(num(node.params.radianDeg));
                if (!node.params.useRotate) return `.addRadianCenter(${r}, ${c}, ${radianExpr})`;
                const rotExpr = U.degToKotlinRadExpr(num(node.params.rotateDeg));
                return `.addRadianCenter(${r}, ${c}, ${radianExpr}, ${rotExpr})`;
            }
        },

        add_radian: {
            title: "addRadian(弧线XZ)",
            desc: "从 start..end；可选 rotate(rad)；输入度导出*PI",
            defaultParams: {r: 2, count: 80, startDeg: 0, endDeg: 120, useRotate: false, rotateDeg: 0},
            apply(ctx, node) {
                const sr = U.degToRad(num(node.params.startDeg));
                const er = U.degToRad(num(node.params.endDeg));
                const rot = node.params.useRotate ? U.degToRad(num(node.params.rotateDeg)) : 0;
                ctx.points.push(...U.getRadianXZ(num(node.params.r), int(node.params.count), sr, er, rot));
            },
            kotlin(node) {
                const r = U.fmt(num(node.params.r));
                const c = int(node.params.count);
                const srExpr = U.degToKotlinRadExpr(num(node.params.startDeg));
                const erExpr = U.degToKotlinRadExpr(num(node.params.endDeg));
                if (!node.params.useRotate) return `.addRadian(${r}, ${c}, ${srExpr}, ${erExpr})`;
                const rotExpr = U.degToKotlinRadExpr(num(node.params.rotateDeg));
                return `.addRadian(${r}, ${c}, ${srExpr}, ${erExpr}, ${rotExpr})`;
            }
        },

        add_ball: {
            title: "addBall(球面点集)",
            desc: "addBall(r, countPow)",
            defaultParams: {r: 2, countPow: 24},
            apply(ctx, node) {
                ctx.points.push(...U.getBallLocations(num(node.params.r), int(node.params.countPow)));
            },
            kotlin(node) {
                return `.addBall(${U.fmt(num(node.params.r))}, ${int(node.params.countPow)})`;
            }
        },

        add_polygon_in_circle: {
            title: "addPolygonInCircle(内接正多边形边点)",
            desc: "addPolygonInCircle(n, edgeCount, r)",
            defaultParams: {n: 5, edgeCount: 30, r: 2},
            apply(ctx, node) {
                ctx.points.push(...U.getPolygonInCircleLocations(int(node.params.n) || 3, int(node.params.edgeCount) || 1, num(node.params.r)));
            },
            kotlin(node) {
                return `.addPolygonInCircle(${int(node.params.n)}, ${int(node.params.edgeCount)}, ${U.fmt(num(node.params.r))})`;
            }
        },

        add_round_shape: {
            title: "addRoundShape(圆面XZ)",
            desc: "addRoundShape(r, step, preCircleCount) 或 (min,max)",
            defaultParams: {
                r: 3,
                step: 0.25,
                mode: "fixed",
                preCircleCount: 60,
                minCircleCount: 20,
                maxCircleCount: 120
            },
            apply(ctx, node) {
                if (node.params.mode === "range") {
                    ctx.points.push(...U.getRoundScapeLocationsRange(num(node.params.r), num(node.params.step), int(node.params.minCircleCount), int(node.params.maxCircleCount)));
                } else {
                    ctx.points.push(...U.getRoundScapeLocations(num(node.params.r), num(node.params.step), int(node.params.preCircleCount)));
                }
            },
            kotlin(node) {
                const r = U.fmt(num(node.params.r));
                const step = U.fmt(num(node.params.step));
                if (node.params.mode === "range") {
                    return `.addRoundShape(${r}, ${step}, ${int(node.params.minCircleCount)}, ${int(node.params.maxCircleCount)})`;
                }
                return `.addRoundShape(${r}, ${step}, ${int(node.params.preCircleCount)})`;
            }
        },

        add_bezier_curve: {
            title: "addBezierCurve(三次贝塞尔)",
            desc: "addBezierCurve(target, startHandle, endHandle, count)",
            defaultParams: {tx: 5, ty: 0, shx: 2, shy: 2, ehx: -2, ehy: 2, count: 80},
            apply(ctx, node) {
                const target = U.v(num(node.params.tx), num(node.params.ty), 0);
                const sh = U.v(num(node.params.shx), num(node.params.shy), 0);
                const eh = U.v(num(node.params.ehx), num(node.params.ehy), 0);
                ctx.points.push(...U.generateBezierCurve(target, sh, eh, int(node.params.count)));
            },
            kotlin(node) {
                const target = relExpr(node.params.tx, node.params.ty, 0);
                const sh = relExpr(node.params.shx, node.params.shy, 0);
                const eh = relExpr(node.params.ehx, node.params.ehy, 0);
                return `.addBezierCurve(${target}, ${sh}, ${eh}, ${int(node.params.count)})`;
            }
        },

        add_lightning_points: {
            title: "addLightningPoints(闪电折线点)",
            desc: "对应 PointsBuilder.addLightningPoints(...)",
            defaultParams: {
                useStart: false,
                sx: 0, sy: 0, sz: 0,
                ex: 6, ey: 2, ez: 0,
                count: 6,
                preLineCount: 10,
                useOffsetRange: true,
                offsetRange: 1.2
            },
            apply(ctx, node) {
                const end = U.v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
                const counts = int(node.params.count);
                const plc = int(node.params.preLineCount);
                const offset = node.params.useOffsetRange ? num(node.params.offsetRange) : null;

                if (!node.params.useStart) {
                    ctx.points.push(...U.getLightningEffectPoints(end, counts, plc, offset));
                } else {
                    // 对齐 Kotlin：getLightningEffectPoints(end...).onEach{ it.add(start) }
                    // 注意：这里 end 是“偏移向量”，不是绝对终点
                    const start = U.v(num(node.params.sx), num(node.params.sy), num(node.params.sz));
                    const pts = U.getLightningEffectPoints(end, counts, plc, offset);
                    ctx.points.push(...pts.map(p => U.add(p, start)));
                }
            },
            kotlin(node) {
                const counts = int(node.params.count);
                const plc = int(node.params.preLineCount);
                const end = relExpr(node.params.ex, node.params.ey, node.params.ez);

                if (!node.params.useStart) {
                    if (node.params.useOffsetRange) {
                        return `.addLightningPoints(${end}, ${counts}, ${plc}, ${U.fmt(num(node.params.offsetRange))})`;
                    }
                    return `.addLightningPoints(${end}, ${counts}, ${plc})`;
                } else {
                    const start = relExpr(node.params.sx, node.params.sy, node.params.sz);
                    if (node.params.useOffsetRange) {
                        return `.addLightningPoints(${start}, ${end}, ${counts}, ${plc}, ${U.fmt(num(node.params.offsetRange))})`;
                    }
                    return `.addLightningPoints(${start}, ${end}, ${counts}, ${plc})`;
                }
            }
        },
        add_lightning_nodes_attenuation: {
            title: "addLightningNodesAttenuation(衰减闪电节点)",
            desc: "只添加节点（不进行每段采样连线）",
            defaultParams: {
                useStart: false,
                sx: 0, sy: 0, sz: 0,
                ex: 6, ey: 2, ez: 0,
                counts: 6,
                maxOffset: 1.2,
                attenuation: 0.8,
                seedEnabled: false,
                seed: 1
            },
            apply(ctx, node) {
                const p = node.params;
                const start = p.useStart ? U.v(num(p.sx), num(p.sy), num(p.sz)) : U.v(0, 0, 0);
                const end = U.v(num(p.ex), num(p.ey), num(p.ez));
                const seed = p.seedEnabled ? int(p.seed) : null;

                ctx.points.push(
                    ...U.getLightningNodesEffectAttenuation(
                        start,
                        end,
                        int(p.counts),
                        num(p.maxOffset),
                        num(p.attenuation),
                        seed
                    )
                );
            },
            kotlin(node) {
                const p = node.params;
                const end = relExpr(p.ex, p.ey, p.ez);
                const counts = int(p.counts);
                const maxOffset = U.fmt(num(p.maxOffset));
                const attenuation = U.fmt(num(p.attenuation));

                if (!p.useStart) {
                    return `.addLightningNodesAttenuation(${end}, ${counts}, ${maxOffset}, ${attenuation})`;
                }
                const start = relExpr(p.sx, p.sy, p.sz);
                return `.addLightningNodesAttenuation(${start}, ${end}, ${counts}, ${maxOffset}, ${attenuation})`;
            }
        },
        apply_noise_offset: {
            title: "applyNoiseOffset(随机扰动)",
            desc: "applyNoiseOffset(noiseX, noiseY, noiseZ, mode, seed, offsetLenMin, offsetLenMax)",
            defaultParams: {
                noiseX: 0.2, noiseY: 0.2, noiseZ: 0.2,
                mode: "AXIS_UNIFORM",
                seedEnabled: false, seed: 1,
                lenMinEnabled: false, offsetLenMin: 0.0,
                lenMaxEnabled: false, offsetLenMax: 0.0
            },
            apply(ctx, node) {
                const opts = {
                    mode: node.params.mode,
                    seed: node.params.seedEnabled ? int(node.params.seed) : null,
                    offsetLenMin: node.params.lenMinEnabled ? num(node.params.offsetLenMin) : null,
                    offsetLenMax: node.params.lenMaxEnabled ? num(node.params.offsetLenMax) : null,
                };
                U.applyNoiseOffset(ctx.points, num(node.params.noiseX), num(node.params.noiseY), num(node.params.noiseZ), opts);
            },
            kotlin(node) {
                const nx = U.fmt(num(node.params.noiseX));
                const ny = U.fmt(num(node.params.noiseY));
                const nz = U.fmt(num(node.params.noiseZ));

                const named = [];
                if (node.params.mode && node.params.mode !== "AXIS_UNIFORM") named.push(`mode = NoiseMode.${node.params.mode}`);
                if (node.params.seedEnabled) named.push(`seed = ${int(node.params.seed)}L`);
                if (node.params.lenMinEnabled) named.push(`offsetLenMin = ${U.fmt(num(node.params.offsetLenMin))}`);
                if (node.params.lenMaxEnabled) named.push(`offsetLenMax = ${U.fmt(num(node.params.offsetLenMax))}`);

                if (named.length > 0) return `.applyNoiseOffset(${nx}, ${ny}, ${nz}, ${named.join(", ")})`;
                return `.applyNoiseOffset(${nx}, ${ny}, ${nz})`;
            }
        },

        points_on_each_offset: {
            title: "pointsOnEach { it.add(...) } (快捷偏移)",
            desc: "三种导出形式",
            defaultParams: {offX: 0.2, offY: 0, offZ: 0, kotlinMode: "direct3"},
            apply(ctx, node) {
                const dx = num(node.params.offX), dy = num(node.params.offY), dz = num(node.params.offZ);
                ctx.points = ctx.points.map(p => ({x: p.x + dx, y: p.y + dy, z: p.z + dz}));
            },
            kotlin(node, emitCtx) {
                const dx = U.fmt(num(node.params.offX));
                const dy = U.fmt(num(node.params.offY));
                const dz = U.fmt(num(node.params.offZ));
                const mode = node.params.kotlinMode;

                if (mode === "newRel") return `.pointsOnEach { it.add(RelativeLocation(${dx}, ${dy}, ${dz})) }`;
                if (mode === "valRel") {
                    const varName = `rel_${node.id.slice(0, 6)}`;
                    emitCtx.decls.push(`val ${varName} = RelativeLocation(${dx}, ${dy}, ${dz})`);
                    return `.pointsOnEach { it.add(${varName}) }`;
                }
                return `.pointsOnEach { it.add(${dx}, ${dy}, ${dz}) }`;
            }
        },

        add_with: {
            title: "addWith(旋转重复)",
            desc: "PointsBuilder.addWith { 子Builder 旋转重复 }",
            defaultParams: {r: 3, c: 6, rotateToCenter: true, rotateReverse: false, rotateOffsetEnabled: false, rox: 0, roy: 0, roz: 0},
            apply(ctx, node) {
                const r = num(node.params.r);
                const c = int(node.params.c);
                const rotateToCenter = !!node.params.rotateToCenter;
                const rotateReverse = !!node.params.rotateReverse;
                const rotateOffsetEnabled = !!node.params.rotateOffsetEnabled;
                const rox = num(node.params.rox);
                const roy = num(node.params.roy);
                const roz = num(node.params.roz);
                const verts = U.getPolygonInCircleVertices(c, r);

                for (const it of verts) {
                    const childCtx = {points: [], axis: U.v(0, 1, 0)};
                    for (const ch of (node.children || [])) {
                        const def = KIND[ch.kind];
                        if (def && def.apply) def.apply(childCtx, ch);
                    }

                    const pts = (childCtx.points || []).map(p => U.clone(p));
                    const base = it;
                    if (rotateToCenter) {
                        const targetPoint = rotateOffsetEnabled ? U.v(rox, roy, roz) : U.v(0, 0, 0);
                        const rotateTarget = rotateReverse ? U.add(targetPoint, it) : U.sub(targetPoint, it);
                        rotatePointsToPointUpright(pts, rotateTarget, childCtx.axis);
                    }
                    for (const p of pts) {
                        ctx.points.push({x: p.x + base.x, y: p.y + base.y, z: p.z + base.z});
                    }
                }
            },
            kotlin(node, emitCtx, indent, emitNodesKotlinLines) {
                const r = U.fmt(num(node.params.r));
                const c = int(node.params.c);
                const rotateToCenter = !!node.params.rotateToCenter;
                const rotateReverse = !!node.params.rotateReverse;
                const rotateOffsetEnabled = !!node.params.rotateOffsetEnabled;
                const rox = U.fmt(num(node.params.rox));
                const roy = U.fmt(num(node.params.roy));
                const roz = U.fmt(num(node.params.roz));
                const lines = [];
                lines.push(`${indent}.addWith {`);
                lines.push(`${indent}  val res = arrayListOf<RelativeLocation>()`);
                lines.push(`${indent}  getPolygonInCircleVertices(${c}, ${r})`);
                lines.push(`${indent}        .forEach { it ->`);
                lines.push(`${indent}            val p = PointsBuilder()`);

                const childLines = emitNodesKotlinLines(node.children || [], indent + "              ", emitCtx);
                lines.push(...childLines);

                if (rotateToCenter) {
                    if (rotateOffsetEnabled) {
                        if (rotateReverse) {
                            lines.push(`${indent}            p.rotateTo(it.clone().add(${rox}, ${roy}, ${roz}))`);
                        } else {
                            lines.push(`${indent}            p.rotateTo((-it).add(${rox}, ${roy}, ${roz}))`);
                        }
                    } else {
                        lines.push(`${indent}            p.rotateTo(${rotateReverse ? "it" : "-it"})`);
                    }
                }
                lines.push(`${indent}            res.addAll(p`);
                lines.push(`${indent}                    .pointsOnEach { rel -> rel.add(it) }`);
                lines.push(`${indent}                    .createWithoutClone()`);
                lines.push(`${indent}            )`);
                lines.push(`${indent}        }`);
                lines.push(`${indent}  res`);
                lines.push(`${indent}}`);
                return lines;
            }
        },

        with_builder: {
            title: "withBuilder(子PointsBuilder)",
            desc: "PointsBuilder.withBuilder { it.xxx() }",
            defaultParams: {folded: false},
            apply(ctx, node) {
                const childCtx = {points: [], axis: U.v(0, 1, 0)};
                for (const ch of (node.children || [])) {
                    const def = KIND[ch.kind];
                    if (def && def.apply) def.apply(childCtx, ch);
                }
                ctx.points.push(...childCtx.points);
            },
            kotlin(node, emitCtx, indent, emitNodesKotlinLines) {
                const lines = [];
                lines.push(`${indent}.withBuilder(`);
                lines.push(`${indent}  PointsBuilder()`);

                const childLines = emitNodesKotlinLines(node.children || [], indent + "    ", emitCtx);
                lines.push(...childLines);

                lines.push(`${indent}  )`);
                return lines;
            }
        },

        add_fourier_series: {
            title: "addFourierSeries(傅里叶级数)",
            desc: "PointsBuilder.addFourierSeries(FourierSeriesBuilder().addFourier(...))",
            defaultParams: {count: 360, scale: 1.0, folded: false},
            apply(ctx, node) {
                const terms = (node.terms || []).map(t => ({r: num(t.r), w: num(t.w), startAngle: num(t.startAngle)}));
                const pts = U.buildFourierSeries(terms, int(node.params.count), num(node.params.scale));
                ctx.points.push(...pts);
            },
            kotlin(node, emitCtx, indent) {
                const lines = [];
                lines.push(`${indent}.addFourierSeries(`);
                lines.push(`${indent}  FourierSeriesBuilder()`);
                lines.push(`${indent}    .count(${int(node.params.count)})`);
                lines.push(`${indent}    .scale(${U.fmt(num(node.params.scale))})`);
                for (const t of (node.terms || [])) {
                    // Kotlin: addFourier(r, w, startAngle)
                    lines.push(`${indent}    .addFourier(${U.fmt(num(t.r))}, ${U.fmt(num(t.w))}, ${U.fmt(num(t.startAngle))})`);
                }
                lines.push(`${indent}  )`);
                return lines;
            }
        },

        clear: {
            title: "clear()",
            desc: "清空 points",
            defaultParams: {},
            apply(ctx) {
                ctx.points = [];
            },
            kotlin() {
                return `.clear()`;
            }
        },
    };

    // -------------------------
    // Node
    // -------------------------
    function makeNode(kind, init = {}) {
        const def = KIND[kind];
        const n = {
            id: uid(),
            kind,
            folded: false,
            collapsed: false,
            bodyHeight: null,
            subWidth: null,
            subHeight: null,
            params: JSON.parse(JSON.stringify(def?.defaultParams || {})),
            children: [],
            terms: [],
            ...init
        };
        if (init.params) Object.assign(n.params, init.params);
        if (init.folded !== undefined) n.folded = !!init.folded;
        // FourierSeries：terms 初始化空即可
        return n;
    }

    // 深拷贝一个节点（含 children/terms），并重新生成所有 id
    function cloneNodeDeep(node) {
        const raw = JSON.parse(JSON.stringify(node || {}));
        const reId = (n) => {
            n.id = uid();
            if (Array.isArray(n.terms)) {
                for (const t of n.terms) {
                    if (t && typeof t === "object") t.id = uid();
                }
            }
            if (Array.isArray(n.children)) {
                for (const c of n.children) reId(c);
            }
        };
        reId(raw);
        return raw;
    }

    function mirrorPointByPlane(p, planeKey) {
        const plane = planeKey || mirrorPlane || "XZ";
        if (plane === "XY") return {x: p.x, y: p.y, z: -p.z};
        if (plane === "ZY") return {x: -p.x, y: p.y, z: p.z};
        return {x: p.x, y: -p.y, z: p.z}; // XZ
    }

    function mirrorCopyNode(node, planeKey) {
        if (!node || !node.kind) return null;
        const cloned = cloneNodeDeep(node);
        if (node.kind === "add_line") {
            const s = mirrorPointByPlane({x: node.params.sx, y: node.params.sy, z: node.params.sz}, planeKey);
            const e = mirrorPointByPlane({x: node.params.ex, y: node.params.ey, z: node.params.ez}, planeKey);
            cloned.params.sx = s.x; cloned.params.sy = s.y; cloned.params.sz = s.z;
            cloned.params.ex = e.x; cloned.params.ey = e.y; cloned.params.ez = e.z;
            return cloned;
        }
        if (node.kind === "points_on_each_offset") {
            const v = mirrorPointByPlane({x: node.params.offX, y: node.params.offY, z: node.params.offZ}, planeKey);
            cloned.params.offX = v.x; cloned.params.offY = v.y; cloned.params.offZ = v.z;
            return cloned;
        }
        return null;
    }

    // -------------------------
    // state
    // -------------------------
    let state = {
        root: {
            id: "root",
            kind: "ROOT",
            children: []}
    };

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

        const [moved] = fromList.splice(fromIndex, 1);

        let idx = Math.max(0, Math.min(targetIndex, targetList.length));
        if (fromList === targetList && fromIndex < idx) idx -= 1;
        targetList.splice(idx, 0, moved);

        ensureAxisEverywhere();
        return true;
    }


    // -------------------------
    // Eval（同时计算：每个卡片新增的点在最终点数组里的区间，用于高亮）
    // -------------------------
    function evalBuilderWithMeta(nodes, initialAxis) {
        const ctx = { points: [], axis: U.clone(initialAxis || U.v(0, 1, 0)) };
        const segments = new Map(); // nodeId -> {start, end}

        function evalList(list, targetCtx, baseOffset) {
            const arr = list || [];
            for (const n of arr) {
                if (!n) continue;

                // 特殊：withBuilder 需要递归并把子段位移到父数组区间
                if (n.kind === "with_builder") {
                    const before = targetCtx.points.length;
                    const child = evalBuilderWithMeta(n.children || [], U.v(0, 1, 0));
                    targetCtx.points.push(...child.points);
                    const after = targetCtx.points.length;

                    if (after > before) segments.set(n.id, { start: before + baseOffset, end: after + baseOffset });
                    for (const [cid, seg] of child.segments.entries()) {
                        segments.set(cid, { start: seg.start + before + baseOffset, end: seg.end + before + baseOffset });
                    }
                    continue;
                }

                const def = KIND[n.kind];
                if (!def || !def.apply) continue;

                const beforeLen = targetCtx.points.length;
                const beforeRef = targetCtx.points;
                def.apply(targetCtx, n);
                const afterLen = targetCtx.points.length;

                // 只有“追加到同一数组”的情况才认为这张卡片直接新增了粒子
                if (afterLen > beforeLen && targetCtx.points === beforeRef) {
                    segments.set(n.id, { start: beforeLen + baseOffset, end: afterLen + baseOffset });
                }
            }
        }

        evalList(nodes || [], ctx, 0);
        return { points: ctx.points, segments };
    }

    // 兼容旧调用：只要点集
    function evalBuilder(nodes, initialAxis) {
        return evalBuilderWithMeta(nodes, initialAxis).points;
    }

    // -------------------------
    // Kotlin emit（每个 add/调用一行）
    // -------------------------
    function emitNodesKotlinLines(nodes, indent, emitCtx) {
        const lines = [];
        for (const n of (nodes || [])) {
            const def = KIND[n.kind];
            if (!def || !def.kotlin) continue;

            if (n.kind === "with_builder" || n.kind === "add_with") {
                lines.push(...def.kotlin(n, emitCtx, indent, emitNodesKotlinLines));
                continue;
            }
            if (n.kind === "add_fourier_series") {
                lines.push(...def.kotlin(n, emitCtx, indent));
                continue;
            }
            const call = def.kotlin(n, emitCtx);
            lines.push(`${indent}${call}`);
        }
        return lines;
    }

    function emitKotlin() {
        const emitCtx = {decls: []};
        const lines = [];
        lines.push("PointsBuilder()");
        lines.push(...emitNodesKotlinLines(state.root.children, "  ", emitCtx));
        lines.push("  .createWithoutClone()");

        const expr = lines.join("\n");
        if (emitCtx.decls.length > 0) {
            const declLines = emitCtx.decls.map(s => `  ${s}`);
            return ["run {", ...declLines, `  ${expr.replace(/\n/g, "\n  ")}`, "}"].join("\n");
        }
        return expr;
    }

    // -------------------------
    // Three.js
    // -------------------------
    let renderer, scene, camera, controls;
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

    function resetCameraToPoints() {
        if (!lastPoints || lastPoints.length === 0 || !camera || !controls) return;
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
        if (recordHistory && !isRestoringHistory && !suppressFocusHistory && !isRenderingCards) {
            historyCapture("focus_change");
        }
        focusedNodeId = next;
        updateFocusColors();
        updateFocusCardUI();
    }

    function clearFocusedNodeIf(id, recordHistory = true) {
        if (!id) return;
        if (focusedNodeId !== id) return;
        if (recordHistory && !isRestoringHistory && !suppressFocusHistory && !isRenderingCards) {
            historyCapture("focus_clear");
        }
        focusedNodeId = null;
        updateFocusColors();
        updateFocusCardUI();
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
        });
    }

    function renderAll() {
        // 保持选中卡片：用于高亮 & 插入规则（withBuilder 内新增等）
        renderCards();
        // 如果选中的卡片已不存在，则清空
        if (focusedNodeId && !linePickMode) {
            const ctx = findNodeContextById(focusedNodeId);
            if (!ctx) focusedNodeId = null;
        }
        rebuildPreviewAndKotlin();
    }

    function iconBtn(text, onClick, danger = false) {
        const b = document.createElement("button");
        b.className = "iconbtn" + (danger ? " danger" : "");
        b.classList.add("action-item");
        b.textContent = text;
        b.addEventListener("click", onClick);
        return b;
    }

    let moreMenuBound = false;
    function ensureMoreMenu(actionsEl) {
        let wrap = actionsEl.querySelector(".more-wrap");
        if (wrap) return wrap;
        wrap = document.createElement("div");
        wrap.className = "more-wrap hidden";
        const btn = document.createElement("button");
        btn.className = "iconbtn more-btn";
        btn.textContent = "⋯";
        const menu = document.createElement("div");
        menu.className = "more-menu";
        wrap.appendChild(btn);
        wrap.appendChild(menu);
        actionsEl.appendChild(wrap);
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            wrap.classList.toggle("open");
        });
        menu.addEventListener("click", (e) => e.stopPropagation());
        if (!moreMenuBound) {
            moreMenuBound = true;
            document.addEventListener("click", () => {
                document.querySelectorAll(".more-wrap.open").forEach((el) => el.classList.remove("open"));
            });
        }
        return wrap;
    }

    function layoutActionOverflow() {
        const cards = document.querySelectorAll(".card-actions");
        cards.forEach((actionsEl) => {
            const wrap = ensureMoreMenu(actionsEl);
            const menu = wrap.querySelector(".more-menu");
            wrap.classList.remove("open");

            // move all items back to main row
            Array.from(menu.children).forEach((item) => {
                actionsEl.insertBefore(item, wrap);
            });
            menu.innerHTML = "";
            wrap.classList.add("hidden");

            if (actionsEl.scrollWidth <= actionsEl.clientWidth) return;
            wrap.classList.remove("hidden");

            let items = Array.from(actionsEl.querySelectorAll(".action-item")).filter((el) => !wrap.contains(el));
            while (actionsEl.scrollWidth > actionsEl.clientWidth && items.length) {
                const item = items.pop();
                menu.insertBefore(item, menu.firstChild);
            }
            if (!menu.children.length) wrap.classList.add("hidden");
        });
    }

    function row(label, editorEl) {
        const r = document.createElement("div");
        r.className = "row";
        const l = document.createElement("div");
        l.className = "label";
        l.textContent = label;
        r.appendChild(l);
        r.appendChild(editorEl);
        return r;
    }

    function inputNum(value, onInput) {
        const i = document.createElement("input");
        i.className = "input";
        i.type = "number";
        i.step = "any";
        i.value = String(value ?? 0);
        armHistoryOnFocus(i, "edit");
        i.addEventListener("input", () => onInput(num(i.value)));
        return i;
    }

    function select(options, value, onChange) {
        const s = document.createElement("select");
        s.className = "input";
        armHistoryOnFocus(s, "edit");
        for (const [val, name] of options) {
            const o = document.createElement("option");
            o.value = val;
            o.textContent = name;
            if (val === value) o.selected = true;
            s.appendChild(o);
        }
        s.addEventListener("change", () => onChange(s.value));
        return s;
    }

    function checkbox(checked, onChange) {
        const wrap = document.createElement("div");
        wrap.className = "mini";
        const c = document.createElement("input");
        c.type = "checkbox";
        c.checked = !!checked;
        armHistoryOnFocus(c, "edit");
        c.addEventListener("pointerdown", () => historyCapture("checkbox"));
        c.addEventListener("change", () => onChange(c.checked));
        wrap.appendChild(c);
        const sp = document.createElement("span");
        sp.className = "pill";
        sp.textContent = c.checked ? "启用" : "禁用";
        wrap.appendChild(sp);
        c.addEventListener("change", () => sp.textContent = c.checked ? "启用" : "禁用");
        return wrap;
    }

    function makeVec3Editor(p, prefix, onChange, label = "") {
        const box = document.createElement("div");
        box.className = "mini";
        const ix = inputNum(p[prefix + "x"], v => {
            p[prefix + "x"] = v;
            onChange();
        });
        const iy = inputNum(p[prefix + "y"], v => {
            p[prefix + "y"] = v;
            onChange();
        });
        const iz = inputNum(p[prefix + "z"], v => {
            p[prefix + "z"] = v;
            onChange();
        });
        ix.style.width = iy.style.width = iz.style.width = "96px";
        box.appendChild(ix);
        box.appendChild(iy);
        box.appendChild(iz);
        const target = {
            obj: p,
            keys: {x: prefix + "x", y: prefix + "y", z: prefix + "z"},
            inputs: {x: ix, y: iy, z: iz},
            label: label || prefix || "vec3",
            onChange
        };
        ix.__vecTarget = target;
        iy.__vecTarget = target;
        iz.__vecTarget = target;
        const onFocus = () => { activeVecTarget = target; };
        ix.addEventListener("focus", onFocus);
        iy.addEventListener("focus", onFocus);
        iz.addEventListener("focus", onFocus);
        return box;
    }

    let draggingId = null;

    function setupDnD(handleEl, cardEl, node, listRef, getIdx, ownerNode = null) {
        handleEl.setAttribute("draggable", "true");
        handleEl.addEventListener("dragstart", (e) => {
            draggingId = node?.id || cardEl.dataset.id;
            cardEl.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", draggingId);
        });
        handleEl.addEventListener("dragend", () => {
            draggingId = null;
            cardEl.classList.remove("dragging");
            cardEl.classList.remove("drag-over");
        });

        cardEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            cardEl.classList.add("drag-over");
        });
        cardEl.addEventListener("dragleave", () => cardEl.classList.remove("drag-over"));
        cardEl.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cardEl.classList.remove("drag-over");
            const id = e.dataTransfer.getData("text/plain") || draggingId;
            if (!id) return;

            // drop 在卡片上：插入到该卡片之前（同列表=排序，跨列表=移动）
            historyCapture("drag_drop");
            const ok = moveNodeById(id, listRef, getIdx(), ownerNode);
            if (ok) renderAll();
        });
    }

    // 用于 add_fourier_series 内部 term 卡片的拖拽排序
    function setupDrag(handleEl, cardEl, listRef, getIdx, onRender) {
        if (!handleEl || !cardEl || !Array.isArray(listRef)) return;
        handleEl.setAttribute("draggable", "true");
        handleEl.addEventListener("dragstart", (e) => {
            draggingId = cardEl.dataset.id;
            cardEl.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", draggingId);
        });
        handleEl.addEventListener("dragend", () => {
            draggingId = null;
            cardEl.classList.remove("dragging");
            cardEl.classList.remove("drag-over");
        });

        cardEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            cardEl.classList.add("drag-over");
        });
        cardEl.addEventListener("dragleave", () => cardEl.classList.remove("drag-over"));
        cardEl.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cardEl.classList.remove("drag-over");
            const id = e.dataTransfer.getData("text/plain") || draggingId;
            if (!id) return;
            const fromIdx = listRef.findIndex(it => it && it.id === id);
            const toIdx = getIdx();
            if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
            historyCapture("drag_term");
            const item = listRef.splice(fromIdx, 1)[0];
            const insertAt = (fromIdx < toIdx) ? Math.max(0, toIdx - 1) : toIdx;
            listRef.splice(insertAt, 0, item);
            if (typeof onRender === "function") onRender();
            else renderAll();
        });
    }

    function setupListDropZone(containerEl, getListRef, getOwnerNode) {
        if (!containerEl || containerEl.__pbDropZoneBound) return;
        containerEl.__pbDropZoneBound = true;

        containerEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            containerEl.classList.add("dropzone-active");
        });

        containerEl.addEventListener("dragleave", () => containerEl.classList.remove("dropzone-active"));

        containerEl.addEventListener("drop", (e) => {
            e.preventDefault();
            containerEl.classList.remove("dropzone-active");
            const id = e.dataTransfer.getData("text/plain") || draggingId;
            if (!id) return;
            const listRef = getListRef();
            const owner = getOwnerNode ? getOwnerNode() : null;
            if (!Array.isArray(listRef)) return;

            historyCapture("drag_drop_end");
            const ok = moveNodeById(id, listRef, listRef.length, owner);
            if (ok) renderAll();
        });
    }

    function bindSubDropZone(zoneEl, listRef, ownerNode) {
        if (!zoneEl) return;
        zoneEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            zoneEl.classList.add("active");
        });
        zoneEl.addEventListener("dragleave", () => zoneEl.classList.remove("active"));
        zoneEl.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            zoneEl.classList.remove("active");
            const id = e.dataTransfer.getData("text/plain") || draggingId;
            if (!id) return;
            historyCapture("drag_into_withBuilder");
            const ok = moveNodeById(id, listRef, listRef.length, ownerNode);
            if (ok) renderAll();
        });
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
        const entries = Object.entries(KIND).map(([kind, def]) => ({kind, def}));

        const shown = entries.filter(({kind, def}) => {
            const key = (kind + " " + def.title + " " + (def.desc || "")).toLowerCase();
            return !f || key.includes(f);
        });

        for (const it of shown) {
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
    // Hotkeys modal UI
    // -------------------------
    let hotkeyCapture = null; // {type:"action"|"kind", id:"...", title:"..."}

    const HOTKEY_ACTION_DEFS = [
        {id: "openPicker", title: "打开「添加卡片」", desc: "默认 W"},
        {id: "pickLineXZ", title: "进入 XZ 拾取直线", desc: "默认 Q"},
        {id: "pickPoint", title: "点拾取（填充当前输入）", desc: "默认 E"},
        {id: "snapPlaneXZ", title: "切换吸附平面：XZ", desc: "默认 1"},
        {id: "snapPlaneXY", title: "切换吸附平面：XY", desc: "默认 2"},
        {id: "snapPlaneZY", title: "切换吸附平面：ZY", desc: "默认 3"},
        {id: "mirrorPlaneXZ", title: "切换镜像平面：XZ", desc: "默认 Shift+1"},
        {id: "mirrorPlaneXY", title: "切换镜像平面：XY", desc: "默认 Shift+2"},
        {id: "mirrorPlaneZY", title: "切换镜像平面：ZY", desc: "默认 Shift+3"},
        {id: "copyFocused", title: "复制当前聚焦卡片", desc: "默认 Ctrl/Cmd + D"},
        {id: "mirrorCopy", title: "镜像复制（直线/Offset）", desc: "默认 Ctrl/Cmd + Shift + M"},
        {id: "deleteFocused", title: "删除当前聚焦卡片", desc: "默认 Backspace"},
        {id: "undo", title: "撤销", desc: "默认 Ctrl/Cmd + Z"},
        {id: "redo", title: "恢复", desc: "默认 Ctrl/Cmd + Shift + Z"},
    ];


    // ✅ 解决：从「添加卡片」窗口内打开快捷键设置会遮挡：采用“叠窗 + 底层磨砂”
// 打开快捷键时：让添加卡片弹窗进入 under（模糊、不可交互）；关闭快捷键时恢复。
    let _addModalWasOpenWhenHotkeys = false;
    function openHotkeysModal() {
        _addModalWasOpenWhenHotkeys = !!(modal && !modal.classList.contains("hidden"));
        if (_addModalWasOpenWhenHotkeys) {
            try { modal.classList.add("under"); } catch {}
            try { modalMask.classList.add("under"); } catch {} // under 会把 mask 隐藏，避免双层遮罩
        }
        showHotkeysModal();
    }

    function showHotkeysModal() {
        hkModal?.classList.remove("hidden");
        hkMask?.classList.remove("hidden");
        hkSearch.value = "";
        renderHotkeysList();
        hkSearch.focus();
    }

    function hideHotkeysModal() {
        hkModal?.classList.add("hidden");
        hkMask?.classList.add("hidden");
        hotkeyCapture = null;
        if (hkHint) hkHint.textContent = "提示：点击“设置”后按键。Esc 取消，Backspace/Delete 清空。所有配置会保存到浏览器。";

        // ✅ 若打开快捷键时下面还有「添加卡片」窗口，则恢复其可交互状态
        if (_addModalWasOpenWhenHotkeys) {
            _addModalWasOpenWhenHotkeys = false;
            try { modal.classList.remove("under"); } catch {}
            try { modalMask.classList.remove("under"); } catch {}
            // 添加卡片窗口仍然打开时，恢复遮罩
            if (modal && !modal.classList.contains("hidden")) {
                modalMask.classList.remove("hidden");
                try { cardSearch && cardSearch.focus(); } catch {}
            }
        }
    }


function beginHotkeyCapture(target) {
        hotkeyCapture = target;
        if (hkHint) hkHint.textContent = `正在设置：${target.title || target.id}（按下新按键；Esc 取消；Backspace/Delete 清空）`;
    }

    function setHotkeyFor(target, hk) {
        if (!target) return;
        const except = {type: target.type, id: target.id};
        removeHotkeyConflicts(hk, except);
        if (target.type === "action") {
            hotkeys.actions[target.id] = hk || "";
        } else if (target.type === "kind") {
            if (!hk) delete hotkeys.kinds[target.id];
            else hotkeys.kinds[target.id] = hk;
        }
        saveHotkeys();
        renderHotkeysList();
    }

    function renderHotkeysList() {
        if (!hkList) return;
        const f = (hkSearch.value || "").trim().toLowerCase();
        hkList.innerHTML = "";

        const makeRow = ({title, desc, type, id, hk}) => {
            const rowEl = document.createElement("div");
            rowEl.className = "hk-row";

            const name = document.createElement("div");
            name.className = "hk-name";
            const t = document.createElement("div");
            t.className = "t";
            t.textContent = title;
            const d = document.createElement("div");
            d.className = "d";
            d.textContent = desc || id;
            name.appendChild(t);
            name.appendChild(d);

            const key = document.createElement("div");
            const human = hotkeyToHuman(hk || "");
            key.className = "hk-key" + (human ? "" : " empty");
            key.textContent = human || "未设置";

            const btns = document.createElement("div");
            btns.className = "hk-btns";

            const bSet = document.createElement("button");
            bSet.className = "btn small primary";
            bSet.textContent = "设置";
            bSet.addEventListener("click", () => beginHotkeyCapture({type, id, title}));

            const bClr = document.createElement("button");
            bClr.className = "btn small";
            bClr.textContent = "清空";
            bClr.addEventListener("click", () => setHotkeyFor({type, id, title}, ""));

            btns.appendChild(bSet);
            btns.appendChild(bClr);

            rowEl.appendChild(name);
            rowEl.appendChild(key);
            rowEl.appendChild(btns);
            return rowEl;
        };

        const section = (title) => {
            const s = document.createElement("div");
            s.className = "hk-section";
            const h = document.createElement("div");
            h.className = "hk-section-title";
            h.textContent = title;
            s.appendChild(h);
            return s;
        };

        // Actions
        const s1 = section("动作");
        for (const a of HOTKEY_ACTION_DEFS) {
            const hk = (hotkeys.actions || {})[a.id] || "";
            const text = (a.title + " " + a.desc + " " + hotkeyToHuman(hk)).toLowerCase();
            if (f && !text.includes(f)) continue;
            s1.appendChild(makeRow({title: a.title, desc: a.desc, type: "action", id: a.id, hk}));
        }
        hkList.appendChild(s1);

        // Card kinds
        const s2 = section("卡片类型（新增）");
        const entries = Object.entries(KIND).map(([kind, def]) => ({kind, def}))
            .filter(it => it.kind !== "ROOT");
        entries.sort((a, b) => (a.def?.title || a.kind).localeCompare(b.def?.title || b.kind, "zh-CN"));

        for (const it of entries) {
            const hk = (hotkeys.kinds || {})[it.kind] || "";
            const title = it.def?.title || it.kind;
            const desc = it.def?.desc || it.kind;
            const text = (it.kind + " " + title + " " + desc + " " + hotkeyToHuman(hk)).toLowerCase();
            if (f && !text.includes(f)) continue;
            s2.appendChild(makeRow({title, desc, type: "kind", id: it.kind, hk}));
        }
        hkList.appendChild(s2);
    }

    function refreshHotkeyHints() {
        // 不改变按钮原始文案，只更新 title 提示
        if (btnAddCard) btnAddCard.title = `快捷键：${hotkeyToHuman(hotkeys.actions.openPicker || "") || "未设置"}`;
        if (btnPickLine) btnPickLine.title = `快捷键：${hotkeyToHuman(hotkeys.actions.pickLineXZ || "") || "未设置"}`;
        if (btnPickPoint) btnPickPoint.title = `快捷键：${hotkeyToHuman(hotkeys.actions.pickPoint || "") || "未设置"}`;
        if (btnHotkeys) btnHotkeys.title = "打开快捷键设置";
    }

    // Hotkeys modal events
    btnHotkeys && btnHotkeys.addEventListener("click", openHotkeysModal);
    btnCloseHotkeys && btnCloseHotkeys.addEventListener("click", hideHotkeysModal);
    btnCloseHotkeys2 && btnCloseHotkeys2.addEventListener("click", hideHotkeysModal);
    hkMask && hkMask.addEventListener("click", hideHotkeysModal);
    hkSearch && hkSearch.addEventListener("input", renderHotkeysList);

    btnHotkeysReset && btnHotkeysReset.addEventListener("click", () => {
        if (!confirm("确定恢复默认快捷键？")) return;
        resetHotkeys();
    });

    btnHotkeysExport && btnHotkeysExport.addEventListener("click", () => {
        downloadText("hotkeys.json", JSON.stringify(hotkeys, null, 2), "application/json");
    });

    btnHotkeysImport && btnHotkeysImport.addEventListener("click", () => fileHotkeys && fileHotkeys.click());
    fileHotkeys && fileHotkeys.addEventListener("change", async () => {
        const f = fileHotkeys.files && fileHotkeys.files[0];
        if (!f) return;
        try {
            const text = await f.text();
            const obj = JSON.parse(text);
            if (!obj || typeof obj !== "object") throw new Error("invalid json");
            if (!obj.actions || typeof obj.actions !== "object") obj.actions = {};
            if (!obj.kinds || typeof obj.kinds !== "object") obj.kinds = {};
            hotkeys = {
                version: 1,
                actions: Object.assign({}, DEFAULT_HOTKEYS.actions, obj.actions),
                kinds: Object.assign({}, obj.kinds),
            };
            saveHotkeys();
            renderHotkeysList();
            showToast("导入成功", "success");
        } catch (e) {
            showToast(`导入失败-格式错误(${e.message || e})`, "error");
        } finally {
            fileHotkeys.value = "";
        }
    });


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
        if (!hkModal?.classList.contains("hidden") && hotkeyCapture) {
            e.preventDefault();
            e.stopPropagation();

            if (e.code === "Escape") {
                hotkeyCapture = null;
                if (hkHint) hkHint.textContent = "已取消。";
                renderHotkeysList();
                return;
            }
            if (e.code === "Backspace" || e.code === "Delete") {
                setHotkeyFor(hotkeyCapture, "");
                hotkeyCapture = null;
                if (hkHint) hkHint.textContent = "已清空。";
                return;
            }

            const hk = eventToHotkey(e);
            // 必须包含一个“非修饰键”
            if (!hk || hk === "Mod" || hk === "Shift" || hk === "Alt" || hk === "Mod+Shift" || hk === "Mod+Alt" || hk === "Shift+Alt" || hk === "Mod+Shift+Alt") {
                return;
            }
            setHotkeyFor(hotkeyCapture, hk);
            hotkeyCapture = null;
            if (hkHint) hkHint.textContent = "已保存。";
            return;
        }

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

    // -------------------------
    // Cards render
    // -------------------------
    function renderCards() {
        isRenderingCards = true;
        try {
            elCardsRoot.innerHTML = "";
            const list = state.root.children;
            for (let i = 0; i < list.length; i++) {
                elCardsRoot.appendChild(renderNodeCard(list[i], list, i, "主Builder", null));
            }
        } finally {
            isRenderingCards = false;
        }
        // DOM 重建后重新标记聚焦高亮
        updateFocusCardUI();
        requestAnimationFrame(() => layoutActionOverflow());
    }


function addQuickOffsetTo(list) {
        const target = (list || state.root.children);
        historyCapture("quick_offset");
        target.push(makeNode("points_on_each_offset", {params: {offX: 0.2, offY: 0, offZ: 0}}));
        renderAll();
    }

    function renderParamsEditors(body, node, ownerLabel) {
        const p = node.params;

        switch (node.kind) {
            case "axis":
                body.appendChild(row("axis", makeVec3Editor(p, "", rebuildPreviewAndKotlin, "axis")));
                break;

            case "scale":
                body.appendChild(row("factor", inputNum(p.factor, v => {
                    p.factor = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "rotate_as_axis":
                body.appendChild(row("角度(度)", inputNum(p.deg, v => {
                    p.deg = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("自定义轴", checkbox(p.useCustomAxis, v => {
                    p.useCustomAxis = v;
                    renderAll();
                })));
                if (p.useCustomAxis) {
                    body.appendChild(row("ax", inputNum(p.ax, v => {
                        p.ax = v;
                        rebuildPreviewAndKotlin();
                    })));
                    body.appendChild(row("ay", inputNum(p.ay, v => {
                        p.ay = v;
                        rebuildPreviewAndKotlin();
                    })));
                    body.appendChild(row("az", inputNum(p.az, v => {
                        p.az = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                break;

            case "rotate_to":
                body.appendChild(row("模式", select([["toVec", "目标向量"], ["originEnd", "origin+end"]], p.mode, v => {
                    p.mode = v;
                    renderAll();
                })));
                if (p.mode === "originEnd") {
                    body.appendChild(row("origin", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "origin")));
                    body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                } else {
                    body.appendChild(row("to", makeVec3Editor(p, "to", rebuildPreviewAndKotlin, "to")));
                }
                break;

            case "add_point":
                body.appendChild(row("point", makeVec3Editor(p, "", rebuildPreviewAndKotlin, "point")));
                break;

            case "add_circle":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_discrete_circle_xz":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("discrete", inputNum(p.discrete, v => {
                    p.discrete = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("seed", checkbox(p.seedEnabled, v => {
                    p.seedEnabled = v;
                    renderAll();
                })));
                if (p.seedEnabled) body.appendChild(row("seed值", inputNum(p.seed, v => {
                    p.seed = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_half_circle":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("角度(度)", inputNum(p.rotateDeg, v => {
                    p.rotateDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_radian_center":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("radian(度)", inputNum(p.radianDeg, v => {
                    p.radianDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("rotate角度(度)", inputNum(p.rotateDeg, v => {
                    p.rotateDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_radian":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("start(度)", inputNum(p.startDeg, v => {
                    p.startDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("end(度)", inputNum(p.endDeg, v => {
                    p.endDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("rotate角度(度)", inputNum(p.rotateDeg, v => {
                    p.rotateDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_ball":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("countPow", inputNum(p.countPow, v => {
                    p.countPow = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_polygon_in_circle":
                body.appendChild(row("n", inputNum(p.n, v => {
                    p.n = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("edgeCount", inputNum(p.edgeCount, v => {
                    p.edgeCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_round_shape":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("step", inputNum(p.step, v => {
                    p.step = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("模式", select([["fixed", "固定点数"], ["range", "区间点数"]], p.mode, v => {
                    p.mode = v;
                    renderAll();
                })));
                if (p.mode === "range") {
                    body.appendChild(row("min", inputNum(p.minCircleCount, v => {
                        p.minCircleCount = v;
                        rebuildPreviewAndKotlin();
                    })));
                    body.appendChild(row("max", inputNum(p.maxCircleCount, v => {
                        p.maxCircleCount = v;
                        rebuildPreviewAndKotlin();
                    })));
                } else {
                    body.appendChild(row("preCount", inputNum(p.preCircleCount, v => {
                        p.preCircleCount = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                break;

            case "add_bezier_curve":
                body.appendChild(row("target(x,y)", (() => {
                    const box = document.createElement("div");
                    box.className = "mini";
                    const ix = inputNum(p.tx, v => {
                        p.tx = v;
                        rebuildPreviewAndKotlin();
                    });
                    const iy = inputNum(p.ty, v => {
                        p.ty = v;
                        rebuildPreviewAndKotlin();
                    });
                    ix.style.width = iy.style.width = "120px";
                    box.appendChild(ix);
                    box.appendChild(iy);
                    return box;
                })()));
                body.appendChild(row("startHandle(x,y)", (() => {
                    const box = document.createElement("div");
                    box.className = "mini";
                    const ix = inputNum(p.shx, v => {
                        p.shx = v;
                        rebuildPreviewAndKotlin();
                    });
                    const iy = inputNum(p.shy, v => {
                        p.shy = v;
                        rebuildPreviewAndKotlin();
                    });
                    ix.style.width = iy.style.width = "120px";
                    box.appendChild(ix);
                    box.appendChild(iy);
                    return box;
                })()));
                body.appendChild(row("endHandle(x,y)", (() => {
                    const box = document.createElement("div");
                    box.className = "mini";
                    const ix = inputNum(p.ehx, v => {
                        p.ehx = v;
                        rebuildPreviewAndKotlin();
                    });
                    const iy = inputNum(p.ehy, v => {
                        p.ehy = v;
                        rebuildPreviewAndKotlin();
                    });
                    ix.style.width = iy.style.width = "120px";
                    box.appendChild(ix);
                    box.appendChild(iy);
                    return box;
                })()));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_line":
                body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin, "start")));
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_lightning_points":
                body.appendChild(row("使用start", checkbox(p.useStart, v => {
                    p.useStart = v;
                    renderAll();
                })));
                if (p.useStart) body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin, "start")));
                body.appendChild(row("end(偏移)", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("preLineCount", inputNum(p.preLineCount, v => {
                    p.preLineCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offsetRange", checkbox(p.useOffsetRange, v => {
                    p.useOffsetRange = v;
                    renderAll();
                })));
                if (p.useOffsetRange) body.appendChild(row("range值", inputNum(p.offsetRange, v => {
                    p.offsetRange = v;
                    rebuildPreviewAndKotlin();
                })));
                break;
            case "add_lightning_nodes_attenuation": {
                const p = node.params;
                body.appendChild(row("使用start", checkbox(p.useStart, v => {
                    p.useStart = v;
                    renderAll();
                })));
                if (p.useStart) body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin, "start")));
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                body.appendChild(row("counts", inputNum(p.counts, v => {
                    p.counts = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("maxOffset", inputNum(p.maxOffset, v => {
                    p.maxOffset = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("attenuation", inputNum(p.attenuation, v => {
                    p.attenuation = v;
                    rebuildPreviewAndKotlin();
                })));

                body.appendChild(row("seed", checkbox(p.seedEnabled, v => {
                    p.seedEnabled = v;
                    renderAll();
                })));
                if (p.seedEnabled) body.appendChild(row("seed值", inputNum(p.seed, v => {
                    p.seed = v;
                    rebuildPreviewAndKotlin();
                })));
                break;
            }

            case "apply_noise_offset":
                body.appendChild(row("noiseX", inputNum(p.noiseX, v => {
                    p.noiseX = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("noiseY", inputNum(p.noiseY, v => {
                    p.noiseY = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("noiseZ", inputNum(p.noiseZ, v => {
                    p.noiseZ = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("mode", select(
                    [["AXIS_UNIFORM", "AXIS_UNIFORM"], ["SPHERE_UNIFORM", "SPHERE_UNIFORM"], ["SHELL_UNIFORM", "SHELL_UNIFORM"]],
                    p.mode,
                    v => {
                        p.mode = v;
                        rebuildPreviewAndKotlin();
                    }
                )));
                body.appendChild(row("seed", checkbox(p.seedEnabled, v => {
                    p.seedEnabled = v;
                    renderAll();
                })));
                if (p.seedEnabled) body.appendChild(row("seed值", inputNum(p.seed, v => {
                    p.seed = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("lenMin", checkbox(p.lenMinEnabled, v => {
                    p.lenMinEnabled = v;
                    renderAll();
                })));
                if (p.lenMinEnabled) body.appendChild(row("min值", inputNum(p.offsetLenMin, v => {
                    p.offsetLenMin = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("lenMax", checkbox(p.lenMaxEnabled, v => {
                    p.lenMaxEnabled = v;
                    renderAll();
                })));
                if (p.lenMaxEnabled) body.appendChild(row("max值", inputNum(p.offsetLenMax, v => {
                    p.offsetLenMax = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "points_on_each_offset":
                body.appendChild(row("offX", inputNum(p.offX, v => {
                    p.offX = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offY", inputNum(p.offY, v => {
                    p.offY = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offZ", inputNum(p.offZ, v => {
                    p.offZ = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("输出形式", select(
                    [["direct3", "it.add(x,y,z)"], ["newRel", "it.add(RelativeLocation)"], ["valRel", "val rel; it.add(rel)"]],
                    p.kotlinMode,
                    v => {
                        p.kotlinMode = v;
                        rebuildPreviewAndKotlin();
                    }
                )));
                break;

            case "add_with":
                if (!Array.isArray(node.children)) node.children = [];
                body.appendChild(row("旋转半径 r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("置换个数 c", inputNum(p.c, v => {
                    p.c = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("rotateToCenter", checkbox(p.rotateToCenter, v => {
                    p.rotateToCenter = v;
                    renderAll();
                })));
                if (p.rotateToCenter) {
                    body.appendChild(row("反向", checkbox(p.rotateReverse, v => {
                        p.rotateReverse = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                body.appendChild(row("旋转偏移", checkbox(p.rotateOffsetEnabled, v => {
                    p.rotateOffsetEnabled = v;
                    renderAll();
                })));
                if (p.rotateOffsetEnabled) {
                    body.appendChild(row("偏移", makeVec3Editor(p, "ro", rebuildPreviewAndKotlin, "offset")));
                }
                body.appendChild(row("折叠子卡片", checkbox(node.folded, v => {
                    node.folded = v;
                    renderAll();
                })));
                if (!node.folded) {
                    const block = document.createElement("div");
                    block.className = "subblock";
                    if (Number.isFinite(node.subWidth)) {
                        const w = Math.max(240, node.subWidth);
                        node.subWidth = w;
                        block.style.width = `${w}px`;
                    }

                    const head = document.createElement("div");
                    head.className = "subblock-head";

                    const title = document.createElement("div");
                    title.className = "subblock-title";
                    title.textContent = "子 PointsBuilder（addWith）";

                    const actions = document.createElement("div");
                    actions.className = "mini";

                    const addBtn = document.createElement("button");
                    addBtn.className = "btn small primary";
                    addBtn.textContent = "添加卡片";
                    addBtn.addEventListener("click", () => openModal(node.children, (node.children || []).length, "子Builder", node.id));

                    const offBtn = document.createElement("button");
                    offBtn.className = "btn small";
                    offBtn.textContent = "快捷Offset";
                    offBtn.addEventListener("click", () => addQuickOffsetTo(node.children));

                    const pickBtn = document.createElement("button");
                    pickBtn.className = "btn small";
                    pickBtn.textContent = "XZ拾取直线";
                    pickBtn.dataset.pickLineBtn = "1";
                    pickBtn.addEventListener("click", () => {
                        if (linePickMode) stopLinePick();
                        else {
                            if (pointPickMode) stopPointPick();
                            startLinePick(node.children, "子Builder", (node.children || []).length);
                        }
                    });

                    const exportBtn = document.createElement("button");
                    exportBtn.className = "btn small";
                    exportBtn.textContent = "导出JSON";
                    exportBtn.addEventListener("click", () => {
                        const out = {root: {id: "root", kind: "ROOT", children: deepClone(node.children || [])}};
                        downloadText("addWithBuilder.json", JSON.stringify(out, null, 2), "application/json");
                    });

                    const importBtn = document.createElement("button");
                    importBtn.className = "btn small";
                    importBtn.textContent = "导入JSON";
                    importBtn.addEventListener("click", () => {
                        if (!fileBuilderJson) return;
                        builderJsonTargetNode = node;
                        fileBuilderJson.click();
                    });

                    const clearBtn = document.createElement("button");
                    clearBtn.className = "btn small danger";
                    clearBtn.textContent = "清空";
                    clearBtn.addEventListener("click", () => {
                        historyCapture("clear_add_with");
                        node.children.splice(0);
                        ensureAxisInList(node.children);
                        renderAll();
                    });

                    actions.appendChild(addBtn);
                    actions.appendChild(offBtn);
                    actions.appendChild(pickBtn);
                    actions.appendChild(exportBtn);
                    actions.appendChild(importBtn);
                    actions.appendChild(clearBtn);

                    head.appendChild(title);
                    head.appendChild(actions);

                    const sub = document.createElement("div");
                    sub.className = "subcards";
                    if (Number.isFinite(node.subHeight)) {
                        const h = Math.max(120, node.subHeight);
                        node.subHeight = h;
                        sub.style.height = `${h}px`;
                        sub.style.maxHeight = `${h}px`;
                    }
                    setupListDropZone(sub, () => node.children, () => node);

                    const list = node.children || [];
                    for (let i = 0; i < list.length; i++) {
                        sub.appendChild(renderNodeCard(list[i], list, i, "子Builder", node));
                    }

                    block.appendChild(head);
                    block.appendChild(sub);

                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖拽卡片到这里：放入该 addWith 的子卡片（也可拖到主列表把子卡片拖出来）";
                    bindSubDropZone(zone, node.children, node);
                    block.appendChild(zone);

                    const heightResizer = document.createElement("div");
                    heightResizer.className = "subblock-resizer-y";
                    bindSubblockHeightResizer(heightResizer, sub, node);
                    block.appendChild(heightResizer);

                    const widthResizer = document.createElement("div");
                    widthResizer.className = "subblock-resizer";
                    bindSubblockWidthResizer(widthResizer, block, node);
                    block.appendChild(widthResizer);

                    body.appendChild(block);
                } else {
                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖拽卡片到这里：放入该 addWith 的子卡片（折叠状态）";
                    bindSubDropZone(zone, node.children, node);
                    body.appendChild(zone);
                }
                break;

            case "with_builder":
                body.appendChild(row("折叠子卡片", checkbox(node.folded, v => {
                    node.folded = v;
                    renderAll();
                })));
                if (!node.folded) {
                    const block = document.createElement("div");
                    block.className = "subblock";
                    if (Number.isFinite(node.subWidth)) {
                        const w = Math.max(240, node.subWidth);
                        node.subWidth = w;
                        block.style.width = `${w}px`;
                    }

                    const head = document.createElement("div");
                    head.className = "subblock-head";

                    const title = document.createElement("div");
                    title.className = "subblock-title";
                    title.textContent = `子 PointsBuilder（${ownerLabel}）`;

                    const actions = document.createElement("div");
                    actions.className = "mini";

                    // ✅ 内部控制与外部一致：添加卡片 / 快捷Offset / XZ拾取直线
                    const addBtn = document.createElement("button");
                    addBtn.className = "btn small primary";
                    addBtn.textContent = "添加卡片";
                    addBtn.addEventListener("click", () => openModal(node.children, (node.children || []).length, "子Builder", node.id));

                    const offBtn = document.createElement("button");
                    offBtn.className = "btn small";
                    offBtn.textContent = "快捷Offset";
                    offBtn.addEventListener("click", () => addQuickOffsetTo(node.children));

                    const pickBtn = document.createElement("button");
                    pickBtn.className = "btn small";
                    pickBtn.textContent = "XZ拾取直线";
                    pickBtn.dataset.pickLineBtn = "1";
                    pickBtn.addEventListener("click", () => {
                        if (linePickMode) stopLinePick();
                        else {
                            if (pointPickMode) stopPointPick();
                            startLinePick(node.children, "子Builder", (node.children || []).length);
                        }
                    });

                    const exportBtn = document.createElement("button");
                    exportBtn.className = "btn small";
                    exportBtn.textContent = "导出JSON";
                    exportBtn.addEventListener("click", () => {
                        const out = {root: {id: "root", kind: "ROOT", children: deepClone(node.children || [])}};
                        downloadText("withBuilder.json", JSON.stringify(out, null, 2), "application/json");
                    });

                    const importBtn = document.createElement("button");
                    importBtn.className = "btn small";
                    importBtn.textContent = "导入JSON";
                    importBtn.addEventListener("click", () => {
                        if (!fileBuilderJson) return;
                        builderJsonTargetNode = node;
                        fileBuilderJson.click();
                    });

                    const clearBtn = document.createElement("button");
                    clearBtn.className = "btn small danger";
                    clearBtn.textContent = "清空";
                    clearBtn.addEventListener("click", () => {
                        historyCapture("clear_withBuilder");
                        node.children.splice(0);
                        ensureAxisInList(node.children);
                        renderAll();
                    });

                    actions.appendChild(addBtn);
                    actions.appendChild(offBtn);
                    actions.appendChild(pickBtn);
                    actions.appendChild(exportBtn);
                    actions.appendChild(importBtn);
                    actions.appendChild(clearBtn);

                    head.appendChild(title);
                    head.appendChild(actions);

                    const sub = document.createElement("div");
                    sub.className = "subcards";
                    if (Number.isFinite(node.subHeight)) {
                        const h = Math.max(120, node.subHeight);
                        node.subHeight = h;
                        sub.style.height = `${h}px`;
                        sub.style.maxHeight = `${h}px`;
                    }
                    setupListDropZone(sub, () => node.children, () => node);

                    const list = node.children || [];
                    for (let i = 0; i < list.length; i++) {
                        sub.appendChild(renderNodeCard(list[i], list, i, "子Builder", node));
                    }

                    block.appendChild(head);
                    block.appendChild(sub);

                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖拽卡片到这里：放入该 withBuilder 的子卡片（也可拖到主列表把子卡片拖出来）";
                    bindSubDropZone(zone, node.children, node);
                    block.appendChild(zone);

                    const heightResizer = document.createElement("div");
                    heightResizer.className = "subblock-resizer-y";
                    bindSubblockHeightResizer(heightResizer, sub, node);
                    block.appendChild(heightResizer);

                    const widthResizer = document.createElement("div");
                    widthResizer.className = "subblock-resizer";
                    bindSubblockWidthResizer(widthResizer, block, node);
                    block.appendChild(widthResizer);

                    body.appendChild(block);
                } else {
                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖拽卡片到这里：放入该 withBuilder 的子卡片（折叠状态）";
                    bindSubDropZone(zone, node.children, node);
                    body.appendChild(zone);
                }
                break;

            case "add_fourier_series":
                body.appendChild(row("折叠", checkbox(node.folded, v => {
                    node.folded = v;
                    renderAll();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("scale", inputNum(p.scale, v => {
                    p.scale = v;
                    rebuildPreviewAndKotlin();
                })));
                if (!node.folded) {
                    const block = document.createElement("div");
                    block.className = "subblock";

                    const head = document.createElement("div");
                    head.className = "subblock-head";

                    const title = document.createElement("div");
                    title.className = "subblock-title";
                    title.textContent = "Fourier 项（addFourier）";

                    const actions = document.createElement("div");
                    actions.className = "mini";

                    const addBtn = document.createElement("button");
                    addBtn.className = "btn small primary";
                    addBtn.textContent = "添加 Fourier 项";
                    addBtn.addEventListener("click", () => {
                        historyCapture("add_fourier_term");
                        node.terms.push({id: uid(), r: 1, w: 1, startAngle: 0, collapsed: false, bodyHeight: null});
                        renderAll();
                    });

                    const clearBtn = document.createElement("button");
                    clearBtn.className = "btn small danger";
                    clearBtn.textContent = "清空";
                    clearBtn.addEventListener("click", () => {
                        historyCapture("clear_fourier_terms");
                        node.terms.splice(0);
                        renderAll();
                    });

                    actions.appendChild(addBtn);
                    actions.appendChild(clearBtn);

                    head.appendChild(title);
                    head.appendChild(actions);

                    const sub = document.createElement("div");
                    sub.className = "subcards";

                    for (let i = 0; i < node.terms.length; i++) {
                        sub.appendChild(renderFourierTermCard(node, i));
                    }

                    block.appendChild(head);
                    block.appendChild(sub);
                    body.appendChild(block);
                }
                break;

            default:
                break;
        }
    }

    function renderFourierTermCard(parentNode, idx) {
        const t = parentNode.terms[idx];

        const card = document.createElement("div");
        card.className = "card";
        card.dataset.id = t.id;
        if (t.id === focusedNodeId) card.classList.add("focused");
        if (t.collapsed) card.classList.add("collapsed");

        const head = document.createElement("div");
        head.className = "card-head";

        const title = document.createElement("div");
        title.className = "card-title";

        const handle = document.createElement("div");
        handle.className = "handle";
        handle.textContent = "≡";

        const ttext = document.createElement("div");
        ttext.className = "title-text";
        ttext.textContent = `Fourier #${idx + 1}`;

        const badge = document.createElement("div");
        badge.className = "badge2";
        badge.textContent = "addFourier";

        title.appendChild(handle);
        title.appendChild(ttext);
        title.appendChild(badge);

        const actions = document.createElement("div");
        actions.className = "card-actions";

        const collapseBtn = iconBtn(t.collapsed ? "▸" : "▾", (e) => {
            e.stopPropagation();
            historyCapture("toggle_term_collapse");
            t.collapsed = !t.collapsed;
            card.classList.toggle("collapsed", t.collapsed);
            collapseBtn.textContent = t.collapsed ? "▸" : "▾";
            collapseBtn.title = t.collapsed ? "展开" : "收起";
        });
        collapseBtn.title = t.collapsed ? "展开" : "收起";
        actions.appendChild(collapseBtn);

        actions.appendChild(iconBtn("↑", () => {
            if (idx > 0) {
                historyCapture("move_fourier_term_up");
                historyCapture("move_up");
                const tmp = parentNode.terms[idx - 1];
                parentNode.terms[idx - 1] = parentNode.terms[idx];
                parentNode.terms[idx] = tmp;
                renderAll();
            }
        }));
        actions.appendChild(iconBtn("↓", () => {
            if (idx < parentNode.terms.length - 1) {
                historyCapture("move_fourier_term_down");
                const tmp = parentNode.terms[idx + 1];
                parentNode.terms[idx + 1] = parentNode.terms[idx];
                parentNode.terms[idx] = tmp;
                renderAll();
            }
        }));
        actions.appendChild(iconBtn("🗑", () => {
            historyCapture("delete_fourier_term");
            const wasFocused = (focusedNodeId === t.id);
            parentNode.terms.splice(idx, 1);
            if (wasFocused) {
                const next = pickReasonableFocusAfterDelete({ parentList: parentNode.terms, index: idx, parentNode });
                setFocusedNode(next, false);
            }
            renderAll();
        }, true));

        head.appendChild(title);
        head.appendChild(actions);

        const body = document.createElement("div");
        body.className = "card-body";
        if (Number.isFinite(t.bodyHeight)) {
            body.style.height = `${t.bodyHeight}px`;
            body.style.maxHeight = `${t.bodyHeight}px`;
        }
        const desc = document.createElement("div");
        desc.className = "pill";
        desc.textContent = "r, w, startAngle(度)";
        body.appendChild(desc);

        body.appendChild(row("r", inputNum(t.r, v => {
            t.r = v;
            rebuildPreviewAndKotlin();
        })));
        body.appendChild(row("w", inputNum(t.w, v => {
            t.w = v;
            rebuildPreviewAndKotlin();
        })));
        body.appendChild(row("startAngle", inputNum(t.startAngle, v => {
            t.startAngle = v;
            rebuildPreviewAndKotlin();
        })));

        card.appendChild(head);
        card.appendChild(body);
        const resizer = document.createElement("div");
        resizer.className = "card-resizer";
        bindCardBodyResizer(resizer, body, t);
        card.appendChild(resizer);

        // ✅ 同样处理焦点：避免焦点落在 Fourier 子卡片时仍残留上一张卡的高亮
        card.tabIndex = 0;
        card.addEventListener("pointerdown", (e) => {
            if (isRenderingCards) return;
            if (e.button !== 0) return;
            // ✅ 避免父卡片接管子卡片的点击：只响应“事件发生在当前卡片自身区域”
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            setFocusedNode(t.id);
        });
        card.addEventListener("focusin", (e) => {
            if (isRenderingCards) return;
            // ✅ focusin 会冒泡：子卡片获得焦点时，父卡片不应抢走高亮
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            setFocusedNode(t.id);
        });
        card.addEventListener("focusout", (e) => {
            if (isRenderingCards) return;
            if (suppressCardFocusOutClear) return;
            const next = e.relatedTarget;
            if (next && card.contains(next)) return;
            requestAnimationFrame(() => {
                const ae = document.activeElement;
                if (ae && card.contains(ae)) return;
                clearFocusedNodeIf(t.id);
            });
        });

        setupDrag(handle, card, parentNode.terms, () => idx, () => renderAll());
        return card;
    }

    function renderNodeCard(node, siblings, idx, ownerLabel, ownerNode = null) {
        const def = KIND[node.kind];
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.id = node.id;
        if (node.id === focusedNodeId) card.classList.add("focused");
        if (node.id === focusedNodeId) card.classList.add("focused");
        if (node.collapsed) card.classList.add("collapsed");

        const head = document.createElement("div");
        head.className = "card-head";

        const title = document.createElement("div");
        title.className = "card-title";

        const handle = document.createElement("div");
        handle.className = "handle";
        handle.textContent = "≡";

        const ttext = document.createElement("div");
        ttext.className = "title-text";
        ttext.textContent = def ? def.title : node.kind;

        const badge = document.createElement("div");
        badge.className = "badge2";
        badge.textContent = node.kind;

        title.appendChild(handle);
        title.appendChild(ttext);
        title.appendChild(badge);

        const actions = document.createElement("div");
        actions.className = "card-actions";

        const collapseBtn = iconBtn(node.collapsed ? "▸" : "▾", (e) => {
            e.stopPropagation();
            historyCapture("toggle_card_collapse");
            node.collapsed = !node.collapsed;
            card.classList.toggle("collapsed", node.collapsed);
            collapseBtn.textContent = node.collapsed ? "▸" : "▾";
            collapseBtn.title = node.collapsed ? "展开" : "收起";
        });
        collapseBtn.title = node.collapsed ? "展开" : "收起";
        actions.appendChild(collapseBtn);

        // ✅ 快捷添加：在当前卡片下方插入（若选中 withBuilder 卡片则插入到子Builder）
        const addBtn = iconBtn("＋", () => {
            if (isBuilderContainerKind(node.kind)) {
                openModal(node.children, (node.children || []).length, "子Builder", node.id);
            } else {
                openModal(siblings, idx + 1, ownerLabel);
            }
        });
        addBtn.title = "在下方新增";
        actions.appendChild(addBtn);

        const toTopBtn = iconBtn("⇡", () => {
            if (idx > 0) {
                historyCapture("move_top");
                const n = siblings.splice(idx, 1)[0];
                siblings.unshift(n);
                renderAll();
            }
        });
        toTopBtn.title = "置顶";
        actions.appendChild(toTopBtn);

        const upBtn = iconBtn("↑", () => {
            if (idx > 0) {
                historyCapture("move_up");
                const t = siblings[idx - 1];
                siblings[idx - 1] = siblings[idx];
                siblings[idx] = t;
                renderAll();
            }
        });
        upBtn.title = "上移";
        actions.appendChild(upBtn);

        const downBtn = iconBtn("↓", () => {
            if (idx < siblings.length - 1) {
                historyCapture("move_down");
                const t = siblings[idx + 1];
                siblings[idx + 1] = siblings[idx];
                siblings[idx] = t;
                renderAll();
            }
        });
        downBtn.title = "下移";
        actions.appendChild(downBtn);

        const toBottomBtn = iconBtn("⇣", () => {
            if (idx < siblings.length - 1) {
                historyCapture("move_bottom");
                const n = siblings.splice(idx, 1)[0];
                siblings.push(n);
                renderAll();
            }
        });
        toBottomBtn.title = "置底";
        actions.appendChild(toBottomBtn);

        if (node.kind === "add_line" || node.kind === "points_on_each_offset") {
            const mirrorBtn = iconBtn("⇋", () => {
                const cloned = mirrorCopyNode(node, mirrorPlane);
                if (!cloned) return;
                historyCapture("mirror_copy");
                siblings.splice(idx + 1, 0, cloned);
                renderAll();
                requestAnimationFrame(() => {
                    const el = elCardsRoot.querySelector(`.card[data-id="${cloned.id}"]`);
                    if (el) {
                        try { el.focus(); } catch {}
                        try { el.scrollIntoView({ block: "nearest" }); } catch {}
                        setFocusedNode(cloned.id, false);
                    }
                });
            });
            mirrorBtn.dataset.mirrorBtn = "1";
            mirrorBtn.title = `镜像复制（${getMirrorPlaneInfo().label}）`;
            actions.appendChild(mirrorBtn);
        }

        // ✅ 复制卡片：在当前卡片下方插入一张一模一样的（含子卡片/terms）
        const copyBtn = iconBtn("⧉", () => {
            historyCapture("copy_card");
            const cloned = cloneNodeDeep(node);
            siblings.splice(idx + 1, 0, cloned);
            renderAll();

            // 尝试把焦点放到新卡片，方便继续编辑
            requestAnimationFrame(() => {
                const el = elCardsRoot.querySelector(`.card[data-id="${cloned.id}"]`);
                if (el) {
                    el.focus();
                    try { el.scrollIntoView({ block: "nearest" }); } catch {}
                }
            });
        });
        copyBtn.title = "复制";
        actions.appendChild(copyBtn);

        const delBtn = iconBtn("🗑", () => {
            historyCapture("delete_card");
            siblings.splice(idx, 1);
            // 如果删的是当前聚焦卡片：把焦点挪到更合理的位置（不额外写历史）
            if (focusedNodeId === node.id) {
                const next = pickReasonableFocusAfterDelete({ parentList: siblings, index: idx, parentNode: ownerNode });
                setFocusedNode(next, false);
            }
            ensureAxisEverywhere();
            renderAll();
        }, true);
        delBtn.title = "删除";
        actions.appendChild(delBtn);

        head.appendChild(title);
        head.appendChild(actions);

        const body = document.createElement("div");
        body.className = "card-body";
        if (Number.isFinite(node.bodyHeight)) {
            body.style.height = `${node.bodyHeight}px`;
            body.style.maxHeight = `${node.bodyHeight}px`;
        }

        if (def?.desc) {
            const d = document.createElement("div");
            d.className = "pill";
            d.textContent = def.desc;
            body.appendChild(d);
        }

        renderParamsEditors(body, node, ownerLabel);

        card.appendChild(head);
        card.appendChild(body);
        const resizer = document.createElement("div");
        resizer.className = "card-resizer";
        bindCardBodyResizer(resizer, body, node);
        card.appendChild(resizer);

        // ✅ 聚焦高亮：卡片获得焦点时，让对应新增的粒子变色
        card.tabIndex = 0; // 让卡片标题区也可获得焦点（点击空白处也算聚焦）
        card.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            // ✅ 避免 withBuilder 父卡片接管子卡片：只响应“事件发生在当前卡片自身区域”
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            setFocusedNode(node.id);
        });
        card.addEventListener("focusin", (e) => {
            // ✅ focusin 会冒泡：子卡片获得焦点时，父卡片不应抢走高亮
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            setFocusedNode(node.id);
        });
        card.addEventListener("focusout", (e) => {
            if (isRenderingCards) return;
            if (suppressCardFocusOutClear) return;
            const next = e.relatedTarget;
            if (next && card.contains(next)) return;
            // 延迟一帧：避免同卡片内切换焦点时误清空
            requestAnimationFrame(() => {
                const ae = document.activeElement;
                if (ae && card.contains(ae)) return;
                clearFocusedNodeIf(node.id);
            });
        });

        setupDnD(handle, card, node, siblings, () => idx, ownerNode);
        return card;
    }

    // -------------------------
    // Top buttons
    // -------------------------
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
        a.download = "PointsBuilder_Generated.kt";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 200);
    }

    btnExportKotlin.addEventListener("click", doExportKotlin);
    btnExportKotlin2.addEventListener("click", doExportKotlin);
    btnToggleKotlin && btnToggleKotlin.addEventListener("click", () => setKotlinHidden(!layoutState.kotlinHidden));
    btnCopyKotlin.addEventListener("click", doCopyKotlin);
    btnCopyKotlin2.addEventListener("click", doCopyKotlin);
    btnDownloadKotlin && btnDownloadKotlin.addEventListener("click", doDownloadKotlin);
    btnDownloadKotlin2 && btnDownloadKotlin2.addEventListener("click", doDownloadKotlin);

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

    btnFullscreen.addEventListener("click", () => {
        const host = document.querySelector(".viewer");
        if (!document.fullscreenElement) host.requestFullscreen?.();
        else document.exitFullscreen?.();
    });

    btnSaveJson.addEventListener("click", async () => {
        const text = JSON.stringify(state, null, 2);
        // 选择保存位置与名字（若浏览器支持 File System Access API）
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: "shape.json",
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
            downloadText("shape.json", text, "application/json");
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
    bindResizer(resizerLeft, "left");
    bindResizer(resizerRight, "right");
    updateKotlinToggleText();
    window.addEventListener("resize", () => applyLayoutState(true));
    initThree();
    setupListDropZone(elCardsRoot, () => state.root.children, () => null);
    refreshHotkeyHints();
    renderAll();
})();
