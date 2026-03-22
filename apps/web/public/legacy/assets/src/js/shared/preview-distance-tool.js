const STYLE_ID = "preview-distance-tool-style";

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

function formatPoint(point, prefix = "") {
    if (!point) return `${prefix}(?, ?, ?)`;
    const lead = prefix ? `${prefix}` : "";
    return `${lead}(${formatNum(point.x)}, ${formatNum(point.y)}, ${formatNum(point.z)})`;
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

export function createPreviewDistanceTool(options = {}) {
    ensureStyle();

    const {
        title = "预览测距",
        canvas = null,
        showToast = null,
        resolvePointFromEvent = null,
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
        anchorPoint: null,
        hoverPoint: null,
        lockedResult: null,
        hoverResult: null
    };

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

    const titleEl = panel.querySelector(".preview-distance-tool-title");
    const closeBtn = panel.querySelector(".preview-distance-tool-close");
    const actionsEl = panel.querySelector(".preview-distance-tool-actions");
    const bodyEl = panel.querySelector(".preview-distance-tool-body");
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
            lines.push({ text: "选择模式后，移动鼠标到吸附点即可查看距离。", strong: false });
            lines.push({ text: "热键或右键菜单可随时重新打开。", strong: false });
        } else if (state.mode === "origin") {
            lines.push({ text: "模式：点到原点", strong: true });
            lines.push({ text: "移动鼠标查看当前吸附点到原点的距离，左键可锁定结果。", strong: false });
        } else if (!state.anchorPoint) {
            lines.push({ text: "模式：A-B 距离", strong: true });
            lines.push({ text: "左键先选择 A 点。", strong: false });
            if (state.hoverPoint) lines.push({ text: `当前吸附 ${formatPoint(state.hoverPoint, "P")}`, strong: false });
        } else {
            lines.push({ text: `模式：A-B 距离 | ${formatPoint(state.anchorPoint, "A")}`, strong: true });
            lines.push({ text: "移动鼠标查看 A 到当前吸附点的距离，左键确认 B 点。", strong: false });
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

    function render() {
        panel.classList.toggle("hidden", !state.visible);
        setActiveButton();
        updateBody();
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
        state.anchorPoint = null;
        state.hoverPoint = null;
        state.lockedResult = null;
        state.hoverResult = null;
        state.visible = keepVisible ? state.visible : false;
        render();
    }

    function startMode(mode, anchor = null) {
        const wasHidden = !state.visible;
        state.mode = (mode === "ab") ? "ab" : "origin";
        state.anchorPoint = null;
        state.hoverPoint = null;
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
            return clonePoint(resolvePointFromEvent(ev));
        } catch {
            return null;
        }
    }

    function updateHover(ev) {
        if (!state.visible || !state.mode || isToolBlocked()) return;
        if (ev && ev.buttons) return;
        const point = resolvePoint(ev);
        state.hoverPoint = point;
        if (!point) {
            state.hoverResult = null;
            render();
            return;
        }
        if (state.mode === "origin") {
            state.hoverResult = computeOriginResult(point);
        } else if (state.anchorPoint) {
            state.hoverResult = computeAbResult(state.anchorPoint, point);
        } else {
            state.hoverResult = null;
        }
        render();
    }

    function confirmPoint(ev) {
        if (!state.visible || !state.mode || isToolBlocked()) return false;
        const point = resolvePoint(ev);
        if (!point) {
            emitToast("当前没有吸附到可测距的点", "info");
            return false;
        }
        if (state.mode === "origin") {
            state.lockedResult = computeOriginResult(point);
            state.hoverResult = state.lockedResult;
            render();
            return true;
        }
        if (!state.anchorPoint) {
            state.anchorPoint = point;
            state.hoverResult = null;
            state.lockedResult = null;
            render();
            emitToast("已记录 A 点", "info");
            return true;
        }
        state.lockedResult = computeAbResult(state.anchorPoint, point);
        state.hoverResult = state.lockedResult;
        render();
        return true;
    }

    function handleContextMenu(ev) {
        if (!attachContextMenu || isToolBlocked()) return;
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

    originBtn.addEventListener("click", () => startMode("origin"));
    abBtn.addEventListener("click", () => startMode("ab"));
    clearBtn.addEventListener("click", () => clearState(true));
    closeBtn.addEventListener("click", () => closePanel());
    panel.addEventListener("contextmenu", (ev) => ev.preventDefault());
    canvas.addEventListener("pointermove", updateHover, true);
    canvas.addEventListener("click", (ev) => {
        if (ev.button !== undefined && ev.button !== 0) return;
        confirmPoint(ev);
    }, true);
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
            canvas.removeEventListener("pointermove", updateHover, true);
            canvas.removeEventListener("contextmenu", handleContextMenu, true);
            if (panel.parentElement) panel.parentElement.removeChild(panel);
        }
    };
}
