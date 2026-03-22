const STYLE_ID = "preview-distance-tool-style";
const CONTEXT_DRAG_PX = 6;
const CONTEXT_SUPPRESS_MS = 260;

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.preview-distance-tool {
    position: fixed;
    z-index: 10050;
    min-width: 260px;
    max-width: min(360px, calc(100vw - 24px));
    padding: 12px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(11, 16, 23, 0.94);
    color: #eef6ff;
    box-shadow: 0 18px 48px rgba(0,0,0,0.36);
    backdrop-filter: blur(14px);
}
.preview-distance-tool.hidden {
    display: none;
}
.preview-distance-tool-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
}
.preview-distance-tool-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
}
.preview-distance-tool-close {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 14px;
    opacity: 0.72;
}
.preview-distance-tool-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
}
.preview-distance-tool-btn {
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06);
    color: inherit;
    border-radius: 999px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1.2;
}
.preview-distance-tool-btn.active {
    background: rgba(99, 195, 255, 0.2);
    border-color: rgba(99, 195, 255, 0.42);
}
.preview-distance-tool-btn.ghost {
    opacity: 0.86;
}
.preview-distance-tool-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
    line-height: 1.5;
}
.preview-distance-tool-line {
    color: rgba(238, 246, 255, 0.82);
    word-break: break-word;
}
.preview-distance-tool-line.strong {
    color: #ffffff;
    font-weight: 600;
}
.preview-distance-tool-overlay {
    position: fixed;
    inset: 0;
    z-index: 10040;
    pointer-events: none;
}
.preview-distance-tool-overlay.hidden {
    display: none;
}
.preview-distance-tool-overlay-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
}
.preview-distance-tool-overlay-line {
    stroke: rgba(99, 195, 255, 0.92);
    stroke-width: 2;
    stroke-linecap: round;
    filter: drop-shadow(0 0 6px rgba(99, 195, 255, 0.35));
}
.preview-distance-tool-marker {
    position: absolute;
    width: 12px;
    height: 12px;
    margin-left: -6px;
    margin-top: -6px;
    border-radius: 999px;
    border: 2px solid rgba(255,255,255,0.92);
    box-shadow: 0 0 0 3px rgba(11, 16, 23, 0.36), 0 0 12px rgba(99, 195, 255, 0.42);
    background: rgba(99, 195, 255, 0.95);
}
.preview-distance-tool-marker.anchor {
    background: rgba(255, 196, 77, 0.96);
    border-color: rgba(255,255,255,0.98);
}
.preview-distance-tool-marker.origin {
    background: rgba(255, 110, 177, 0.96);
}
.preview-distance-tool-marker.hidden {
    display: none;
}
`;
    document.head.appendChild(style);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function safeNum(value) {
    const next = Number(value);
    return Number.isFinite(next) ? next : 0;
}

function formatNum(value) {
    const next = safeNum(value);
    if (Math.abs(next) < 1e-9) return "0";
    const fixed = next.toFixed(4);
    return fixed.replace(/\.?0+$/, "");
}

function clonePoint(point) {
    if (!point) return null;
    return {
        x: safeNum(point.x),
        y: safeNum(point.y),
        z: safeNum(point.z),
        label: String(point.label || "")
    };
}

function normalizeResolvedPoint(value, fallbackClientX = NaN, fallbackClientY = NaN) {
    if (!value) return null;
    const rawPoint = (value.point && typeof value.point === "object") ? value.point : value;
    const point = clonePoint(rawPoint);
    if (!point) return null;
    return {
        point,
        clientX: Number.isFinite(value.clientX) ? Number(value.clientX) : fallbackClientX,
        clientY: Number.isFinite(value.clientY) ? Number(value.clientY) : fallbackClientY,
        label: String(value.label || point.label || ""),
        source: String(value.source || "")
    };
}

function formatPoint(point, prefix = "") {
    if (!point) return `${prefix}(?, ?, ?)`;
    const lead = prefix ? `${prefix}` : "";
    const label = point.label ? ` ${point.label}` : "";
    return `${lead}${label}(${formatNum(point.x)}, ${formatNum(point.y)}, ${formatNum(point.z)})`;
}

function computeOriginResult(point) {
    const p = clonePoint(point);
    const dx = p ? p.x : 0;
    const dy = p ? p.y : 0;
    const dz = p ? p.z : 0;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return { type: "origin", point: p, dx, dy, dz, distance };
}

function computeAbResult(pointA, pointB) {
    const a = clonePoint(pointA);
    const b = clonePoint(pointB);
    const dx = safeNum(b?.x) - safeNum(a?.x);
    const dy = safeNum(b?.y) - safeNum(a?.y);
    const dz = safeNum(b?.z) - safeNum(a?.z);
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return { type: "ab", pointA: a, pointB: b, dx, dy, dz, distance };
}

function formatResult(result, provisional = false) {
    if (!result) {
        return {
            summary: "未选中点",
            details: []
        };
    }
    if (result.type === "origin") {
        return {
            summary: `${provisional ? "当前" : "结果"} |OP| = ${formatNum(result.distance)}`,
            details: [
                formatPoint(result.point, "P"),
                `dx=${formatNum(result.dx)}  dy=${formatNum(result.dy)}  dz=${formatNum(result.dz)}`
            ]
        };
    }
    return {
        summary: `${provisional ? "当前" : "结果"} |AB| = ${formatNum(result.distance)}`,
        details: [
            formatPoint(result.pointA, "A"),
            formatPoint(result.pointB, "B"),
            `dx=${formatNum(result.dx)}  dy=${formatNum(result.dy)}  dz=${formatNum(result.dz)}`
        ]
    };
}

function createButton(text, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `preview-distance-tool-btn${extraClass ? ` ${extraClass}` : ""}`;
    button.textContent = text;
    return button;
}

function isRightLike(ev) {
    return !!ev && (
        ev.button === 2
        || ((ev.buttons & 2) === 2)
        || (ev.button === 0 && ev.ctrlKey)
    );
}

export function createPreviewDistanceTool(options = {}) {
    ensureStyle();

    const {
        title = "预览测距",
        canvas = null,
        showToast = null,
        resolvePointFromEvent = null,
        projectPointToClient = null,
        attachContextMenu = true,
        shouldOpenContextMenu = null,
        isBlocked = null
    } = options;

    if (!(canvas instanceof Element) || typeof resolvePointFromEvent !== "function") {
        return {
            isOpen: () => false,
            isActive: () => false,
            openPanelAt() {},
            openPanelAtCanvasCenter() {},
            togglePanelAtCanvasCenter() {},
            startMode() {},
            clear() {},
            destroy() {}
        };
    }

    const state = {
        visible: false,
        mode: "",
        anchorResolved: null,
        hoverResolved: null,
        lockedResolved: null,
        lockedResult: null,
        hoverResult: null
    };

    let overlayRaf = 0;
    let rightGesture = null;
    let suppressContextMenuUntil = 0;

    const panel = document.createElement("div");
    panel.className = "preview-distance-tool hidden";
    panel.innerHTML = `
        <div class="preview-distance-tool-head">
            <div class="preview-distance-tool-title"></div>
            <button type="button" class="preview-distance-tool-close" aria-label="关闭">×</button>
        </div>
        <div class="preview-distance-tool-actions"></div>
        <div class="preview-distance-tool-body"></div>
    `;
    document.body.appendChild(panel);

    const overlay = document.createElement("div");
    overlay.className = "preview-distance-tool-overlay hidden";
    overlay.innerHTML = `
        <svg class="preview-distance-tool-overlay-svg" aria-hidden="true">
            <line class="preview-distance-tool-overlay-line" x1="0" y1="0" x2="0" y2="0"></line>
        </svg>
        <div class="preview-distance-tool-marker anchor hidden" aria-hidden="true"></div>
        <div class="preview-distance-tool-marker current hidden" aria-hidden="true"></div>
        <div class="preview-distance-tool-marker origin hidden" aria-hidden="true"></div>
    `;
    document.body.appendChild(overlay);

    const titleEl = panel.querySelector(".preview-distance-tool-title");
    const closeBtn = panel.querySelector(".preview-distance-tool-close");
    const actionsEl = panel.querySelector(".preview-distance-tool-actions");
    const bodyEl = panel.querySelector(".preview-distance-tool-body");
    const overlayLine = overlay.querySelector(".preview-distance-tool-overlay-line");
    const anchorMarker = overlay.querySelector(".preview-distance-tool-marker.anchor");
    const currentMarker = overlay.querySelector(".preview-distance-tool-marker.current");
    const originMarker = overlay.querySelector(".preview-distance-tool-marker.origin");
    titleEl.textContent = title;

    const originBtn = createButton("点到原点");
    const abBtn = createButton("A-B 距离");
    const clearBtn = createButton("清空", "ghost");
    actionsEl.appendChild(originBtn);
    actionsEl.appendChild(abBtn);
    actionsEl.appendChild(clearBtn);

    function emitToast(message, type = "info") {
        if (!message || typeof showToast !== "function") return;
        try {
            showToast(message, type);
        } catch {
        }
    }

    function isToolBlocked() {
        if (typeof isBlocked !== "function") return false;
        try {
            return !!isBlocked();
        } catch {
            return false;
        }
    }

    function setActiveButton() {
        originBtn.classList.toggle("active", state.mode === "origin");
        abBtn.classList.toggle("active", state.mode === "ab");
    }

    function updateBody() {
        const lines = [];
        if (!state.mode) {
            lines.push({ text: "选择模式后，移动鼠标到吸附点或网格点即可查看距离。", strong: false });
            lines.push({ text: "左键锁定当前结果，热键或右键菜单可重新打开。", strong: false });
        } else if (state.mode === "origin") {
            lines.push({ text: "模式：点到原点", strong: true });
            lines.push({ text: "移动鼠标查看当前点到原点的距离，左键可锁定结果。", strong: false });
        } else if (!state.anchorResolved) {
            lines.push({ text: "模式：A-B 距离", strong: true });
            lines.push({ text: "左键先选择 A 点。", strong: false });
            if (state.hoverResolved?.point) lines.push({ text: `当前吸附 ${formatPoint(state.hoverResolved.point, "P")}`, strong: false });
        } else {
            lines.push({ text: `模式：A-B 距离 | ${formatPoint(state.anchorResolved.point, "A")}`, strong: true });
            lines.push({ text: "移动鼠标查看 A 到当前点的距离，左键确认 B 点。", strong: false });
        }

        const displayResult = state.lockedResult || state.hoverResult;
        const formatted = formatResult(displayResult, !state.lockedResult && !!state.hoverResult);
        lines.push({ text: formatted.summary, strong: true });
        for (const detail of formatted.details) lines.push({ text: detail, strong: false });

        bodyEl.innerHTML = "";
        for (const line of lines) {
            const div = document.createElement("div");
            div.className = `preview-distance-tool-line${line.strong ? " strong" : ""}`;
            div.textContent = line.text;
            bodyEl.appendChild(div);
        }
    }

    function resolveScreenPoint(resolved) {
        if (!resolved?.point) return null;
        if (typeof projectPointToClient === "function") {
            try {
                const projected = projectPointToClient(resolved.point);
                if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
                    return { x: Number(projected.x), y: Number(projected.y) };
                }
            } catch {
            }
        }
        if (Number.isFinite(resolved.clientX) && Number.isFinite(resolved.clientY)) {
            return { x: Number(resolved.clientX), y: Number(resolved.clientY) };
        }
        return null;
    }

    function positionMarker(marker, screen) {
        if (!marker) return;
        if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) {
            marker.classList.add("hidden");
            return;
        }
        marker.style.left = `${Math.round(screen.x)}px`;
        marker.style.top = `${Math.round(screen.y)}px`;
        marker.classList.remove("hidden");
    }

    function buildOriginResolved() {
        return {
            point: { x: 0, y: 0, z: 0, label: "origin" },
            clientX: NaN,
            clientY: NaN,
            label: "origin",
            source: "origin"
        };
    }

    function updateOverlay() {
        const active = state.visible && !!state.mode;
        overlay.classList.toggle("hidden", !active);
        if (!active) {
            anchorMarker.classList.add("hidden");
            currentMarker.classList.add("hidden");
            originMarker.classList.add("hidden");
            overlayLine.style.display = "none";
            return;
        }

        const fromResolved = state.mode === "origin" ? buildOriginResolved() : state.anchorResolved;
        const toResolved = state.lockedResolved || state.hoverResolved;
        const fromScreen = resolveScreenPoint(fromResolved);
        const toScreen = resolveScreenPoint(toResolved);

        if (state.mode === "origin") {
            positionMarker(originMarker, fromScreen);
            anchorMarker.classList.add("hidden");
        } else {
            originMarker.classList.add("hidden");
            positionMarker(anchorMarker, fromScreen);
        }
        positionMarker(currentMarker, toScreen);

        if (fromScreen && toScreen) {
            overlayLine.style.display = "";
            overlayLine.setAttribute("x1", `${fromScreen.x}`);
            overlayLine.setAttribute("y1", `${fromScreen.y}`);
            overlayLine.setAttribute("x2", `${toScreen.x}`);
            overlayLine.setAttribute("y2", `${toScreen.y}`);
        } else {
            overlayLine.style.display = "none";
        }
    }

    function stopOverlayLoop() {
        if (!overlayRaf) return;
        cancelAnimationFrame(overlayRaf);
        overlayRaf = 0;
    }

    function tickOverlay() {
        overlayRaf = 0;
        updateOverlay();
        if (state.visible) overlayRaf = requestAnimationFrame(tickOverlay);
    }

    function ensureOverlayLoop() {
        if (overlayRaf || !state.visible) return;
        overlayRaf = requestAnimationFrame(tickOverlay);
    }

    function render() {
        panel.classList.toggle("hidden", !state.visible);
        setActiveButton();
        updateBody();
        updateOverlay();
        if (state.visible && state.mode) ensureOverlayLoop();
        else stopOverlayLoop();
    }

    function placePanel(clientX, clientY) {
        const rect = panel.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        const left = clamp(Math.round(clientX), 8, Math.max(8, vw - rect.width - 8));
        const top = clamp(Math.round(clientY), 8, Math.max(8, vh - rect.height - 8));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    }

    function openPanelAt(clientX, clientY) {
        state.visible = true;
        render();
        const nextX = Number.isFinite(clientX) ? clientX : ((window.innerWidth || 0) * 0.5 - 140);
        const nextY = Number.isFinite(clientY) ? clientY : Math.max(24, (window.innerHeight || 0) * 0.18);
        placePanel(nextX, nextY);
    }

    function openPanelAtCanvasCenter() {
        const rect = canvas.getBoundingClientRect();
        openPanelAt(rect.left + rect.width * 0.5 - 120, rect.top + Math.max(18, rect.height * 0.12));
    }

    function clearState(keepVisible = true) {
        state.mode = "";
        state.anchorResolved = null;
        state.hoverResolved = null;
        state.lockedResolved = null;
        state.lockedResult = null;
        state.hoverResult = null;
        state.visible = keepVisible ? state.visible : false;
        render();
    }

    function startMode(mode, anchor = null) {
        const wasHidden = !state.visible;
        state.mode = (mode === "ab") ? "ab" : "origin";
        state.anchorResolved = null;
        state.hoverResolved = null;
        state.lockedResolved = null;
        state.lockedResult = null;
        state.hoverResult = null;
        state.visible = true;
        render();
        if (anchor && Number.isFinite(anchor.clientX) && Number.isFinite(anchor.clientY)) {
            placePanel(anchor.clientX, anchor.clientY);
        } else if (wasHidden) {
            openPanelAtCanvasCenter();
        }
    }

    function closePanel() {
        state.visible = false;
        render();
    }

    function togglePanelAtCanvasCenter() {
        if (state.visible) {
            closePanel();
            return;
        }
        openPanelAtCanvasCenter();
    }

    function resolvePoint(ev) {
        try {
            return normalizeResolvedPoint(
                resolvePointFromEvent(ev),
                Number(ev?.clientX),
                Number(ev?.clientY)
            );
        } catch {
            return null;
        }
    }

    function updateHover(ev) {
        if (!state.visible || !state.mode || isToolBlocked()) return;
        if (ev && ev.buttons) return;
        const resolved = resolvePoint(ev);
        state.hoverResolved = resolved;
        if (!resolved?.point) {
            state.hoverResult = null;
            render();
            return;
        }
        if (state.mode === "origin") {
            state.hoverResult = computeOriginResult(resolved.point);
        } else if (state.anchorResolved?.point) {
            state.hoverResult = computeAbResult(state.anchorResolved.point, resolved.point);
        } else {
            state.hoverResult = null;
        }
        render();
    }

    function confirmPoint(ev) {
        if (!state.visible || !state.mode || isToolBlocked()) return false;
        const resolved = resolvePoint(ev);
        if (!resolved?.point) {
            emitToast("当前没有吸附到可测距的点", "info");
            return false;
        }
        if (state.mode === "origin") {
            state.lockedResolved = resolved;
            state.lockedResult = computeOriginResult(resolved.point);
            state.hoverResolved = resolved;
            state.hoverResult = state.lockedResult;
            render();
            return true;
        }
        if (!state.anchorResolved?.point) {
            state.anchorResolved = resolved;
            state.hoverResolved = null;
            state.lockedResolved = null;
            state.lockedResult = null;
            state.hoverResult = null;
            render();
            emitToast("已记录 A 点", "info");
            return true;
        }
        state.lockedResolved = resolved;
        state.lockedResult = computeAbResult(state.anchorResolved.point, resolved.point);
        state.hoverResolved = resolved;
        state.hoverResult = state.lockedResult;
        render();
        return true;
    }

    function updateRightGesture(ev) {
        if (!rightGesture || !ev) return;
        if (rightGesture.pointerId !== undefined && ev.pointerId !== rightGesture.pointerId) return;
        const dx = Number(ev.clientX) - rightGesture.startX;
        const dy = Number(ev.clientY) - rightGesture.startY;
        if (Math.hypot(dx, dy) > CONTEXT_DRAG_PX) rightGesture.moved = true;
    }

    function handlePointerDown(ev) {
        if (!attachContextMenu || !isRightLike(ev)) return;
        rightGesture = {
            pointerId: ev.pointerId,
            startX: Number(ev.clientX) || 0,
            startY: Number(ev.clientY) || 0,
            moved: false
        };
    }

    function handlePointerMoveGesture(ev) {
        updateRightGesture(ev);
    }

    function handlePointerUp(ev) {
        if (!attachContextMenu || !rightGesture || !ev) return;
        if (rightGesture.pointerId !== undefined && ev.pointerId !== rightGesture.pointerId) return;
        updateRightGesture(ev);
        if (rightGesture.moved) {
            suppressContextMenuUntil = performance.now() + CONTEXT_SUPPRESS_MS;
        }
        rightGesture = null;
    }

    function shouldSuppressContextMenuByGesture(ev) {
        if (!attachContextMenu) return false;
        if (performance.now() < suppressContextMenuUntil) return true;
        if (!rightGesture || !ev) return false;
        if (rightGesture.pointerId !== undefined && ev.pointerId !== rightGesture.pointerId) return false;
        updateRightGesture(ev);
        return !!rightGesture.moved;
    }

    function handleContextMenu(ev) {
        if (!attachContextMenu || isToolBlocked()) return;
        if (shouldSuppressContextMenuByGesture(ev)) {
            ev.preventDefault();
            return;
        }
        if (typeof shouldOpenContextMenu === "function") {
            let next = false;
            try {
                next = !!shouldOpenContextMenu(ev);
            } catch {
                next = false;
            }
            if (!next) return;
        }
        ev.preventDefault();
        openPanelAt(ev.clientX + 8, ev.clientY + 8);
    }

    const handleCanvasClick = (ev) => {
        if (ev.button !== undefined && ev.button !== 0) return;
        confirmPoint(ev);
    };

    originBtn.addEventListener("click", () => startMode("origin"));
    abBtn.addEventListener("click", () => startMode("ab"));
    clearBtn.addEventListener("click", () => clearState(true));
    closeBtn.addEventListener("click", () => closePanel());
    panel.addEventListener("contextmenu", (ev) => ev.preventDefault());
    canvas.addEventListener("pointerdown", handlePointerDown, true);
    canvas.addEventListener("pointermove", handlePointerMoveGesture, true);
    canvas.addEventListener("pointermove", updateHover, true);
    canvas.addEventListener("pointerup", handlePointerUp, true);
    canvas.addEventListener("pointercancel", handlePointerUp, true);
    canvas.addEventListener("click", handleCanvasClick, true);
    canvas.addEventListener("contextmenu", handleContextMenu, true);

    render();

    return {
        isOpen: () => state.visible,
        isActive: () => !!state.mode,
        openPanelAt,
        openPanelAtCanvasCenter,
        togglePanelAtCanvasCenter,
        startMode,
        clear: () => clearState(true),
        destroy() {
            stopOverlayLoop();
            canvas.removeEventListener("pointerdown", handlePointerDown, true);
            canvas.removeEventListener("pointermove", handlePointerMoveGesture, true);
            canvas.removeEventListener("pointermove", updateHover, true);
            canvas.removeEventListener("pointerup", handlePointerUp, true);
            canvas.removeEventListener("pointercancel", handlePointerUp, true);
            canvas.removeEventListener("click", handleCanvasClick, true);
            canvas.removeEventListener("contextmenu", handleContextMenu, true);
            if (panel.parentElement) panel.parentElement.removeChild(panel);
            if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
        }
    };
}
