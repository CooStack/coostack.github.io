export function createCardInputs(ctx) {
    const { num, armHistoryOnFocus, historyCapture, setActiveVecTarget, getParamStep } = ctx || {};

    function countDecimalsFromString(value) {
        const text = String(value ?? "").trim().toLowerCase();
        if (!text) return 0;
        const parts = text.split("e-");
        const base = parts[0];
        const dot = base.indexOf(".");
        let dec = dot >= 0 ? (base.length - dot - 1) : 0;
        if (parts.length > 1) {
            const exp = parseInt(parts[1], 10);
            if (Number.isFinite(exp)) dec += exp;
        }
        return dec;
    }

    function formatAngleValue(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return "0";
        const fixed = Math.abs(n) < 1e-12 ? 0 : Number(n.toFixed(6));
        return String(fixed);
    }

    function normalizeAngleUnit(unit) {
        return unit === "rad" ? "rad" : "deg";
    }

    function convertAngleValue(value, fromUnit, toUnit) {
        const v = Number(value) || 0;
        const from = normalizeAngleUnit(fromUnit);
        const to = normalizeAngleUnit(toUnit);
        if (from === to) return v;
        if (from === "deg" && to === "rad") return v * Math.PI / 180;
        return v * 180 / Math.PI;
    }

    const TIP_MAP = {
        generic: {
            seed: "启用随机种子，固定结果可复现。",
            "seed值": "随机种子数值。",
            rotate: "启用整体旋转/角度偏移。",
            "rotate角度": "整体旋转角度。",
            r: "半径，决定图形大小。",
            count: "采样点数量，越大越密。",
            w: "宽度/尺度，影响图形横向尺寸。",
            h: "高度/尺度，影响图形纵向尺寸。",
            step: "步进间距，越小越密。",
            thickness: "环宽/厚度，决定内外差。",
            scale: "缩放倍数，>1 放大，<1 缩小。",
            height: "高度范围。",
            min: "最小偏移长度。",
            max: "最大偏移长度。",
            xOffset: "X 方向偏移。",
            zOffset: "Z 方向偏移。",
            offX: "X 方向偏移分量。",
            offY: "Y 方向偏移分量。",
            offZ: "Z 方向偏移分量。",
            countW: "宽方向采样点数量。",
            countH: "高方向采样点数量。",
            sideCount: "边数。",
            edgeCount: "每条边采样点数量。",
            n: "边数。",
            mode: "采样/噪声模式。",
            "输出形式": "Kotlin 输出方式。"
        },
        kinds: {
            fourier_term: {
                r: "该项振幅，决定这条谐波的半径大小。",
                w: "该项频率（倍频），决定波形振荡速度。",
                startAngle: "相位起始角，整体相位偏移。"
            },
            axis: {
                axis: "对称轴方向，影响旋转/指向操作。"
            },
            scale: {
                factor: "整体缩放倍数，>1 放大，<1 缩小。"
            },
            rotate_as_axis: {
                "角度": "绕当前轴旋转的角度。",
                "自定义轴": "启用自定义轴向量。",
                ax: "自定义轴 X 分量。",
                ay: "自定义轴 Y 分量。",
                az: "自定义轴 Z 分量。"
            },
            rotate_to: {
                "模式": "选择目标向量或起止点计算朝向。",
                origin: "起点坐标，用于计算朝向向量。",
                end: "终点坐标，与起点形成朝向。",
                to: "目标朝向向量（从原点指向）。"
            },
            add_point: {
                point: "点的位置坐标。"
            },
            add_line: {
                start: "线段起点坐标。",
                end: "线段终点坐标。",
                count: "线段采样点数量。"
            },
            add_circle: {
                r: "圆半径。",
                count: "圆周采样点数量。"
            },
            add_discrete_circle_xz: {
                r: "圆环半径。",
                count: "圆环采样点数量。",
                discrete: "离散间距，越大越稀疏。",
                seed: "启用随机种子（固定结果）。",
                "seed值": "随机种子数值。"
            },
            add_half_circle: {
                r: "半圆半径。",
                count: "半圆采样点数量。",
                rotate: "是否整体旋转半圆。",
                "角度": "半圆整体旋转角度。"
            },
            add_radian_center: {
                r: "弧线半径。",
                count: "弧线采样点数量。",
                radian: "弧线总角度（中心对称）。",
                rotate: "是否整体旋转弧线。",
                "rotate角度": "弧线整体旋转角度。"
            },
            add_radian: {
                r: "弧线半径。",
                count: "弧线采样点数量。",
                start: "弧线起始角。",
                end: "弧线结束角。",
                rotate: "是否整体旋转弧线。",
                "rotate角度": "弧线整体旋转角度。"
            },
            add_ball: {
                r: "球半径。",
                count: "采样点数量（越大越密）。",
                discrete: "离散间距（影响稀疏度）。"
            },
            add_ring: {
                r: "外环半径。",
                thickness: "环宽/厚度，决定内外差。",
                count: "环面采样点数量。",
                discrete: "离散间距。"
            },
            add_rect: {
                w: "矩形宽度。",
                h: "矩形高度。",
                countW: "宽方向采样点数量。",
                countH: "高方向采样点数量。"
            },
            add_arc: {
                r: "弧线半径。",
                center: "圆心位置。",
                start: "起始角。",
                end: "结束角。",
                count: "弧线采样点数量。"
            },
            add_lightning_points: {
                useStart: "是否自定义起点。",
                start: "起点坐标（未启用则从原点开始）。",
                end: "终点向量/位置。",
                count: "折线段数量。",
                preLineCount: "每段插值点数量。",
                useOffsetRange: "启用随机偏移。",
                offsetRange: "随机偏移幅度。"
            },
            add_lightning_nodes: {
                useStart: "是否自定义起点。",
                start: "起点坐标。",
                end: "终点坐标。",
                count: "节点数量。",
                useOffsetRange: "启用随机偏移。",
                offsetRange: "随机偏移幅度。"
            },
            add_lightning_nodes_attenuation: {
                useStart: "是否自定义起点。",
                start: "起点坐标。",
                end: "终点坐标。",
                counts: "节点数量。",
                maxOffset: "最大偏移幅度。",
                attenuation: "衰减系数（越小收束更快）。",
                seed: "启用随机种子。",
                "seed值": "随机种子数值。"
            },
            add_bezier: {
                p1: "起点坐标。",
                p2: "控制点坐标（影响曲线弯曲）。",
                p3: "终点坐标。",
                count: "采样点数量。"
            },
            add_bezier_4: {
                p1: "起点坐标。",
                p2: "控制点 1。",
                p3: "控制点 2。",
                p4: "终点坐标。",
                count: "采样点数量。"
            },
            add_bezier_curve: {
                "target.x": "终点向量 X（相对起点）。",
                "target.y": "终点向量 Y（相对起点）。",
                "startHandle.x": "起点控制柄 X。",
                "startHandle.y": "起点控制柄 Y。",
                "endHandle.x": "终点控制柄 X。",
                "endHandle.y": "终点控制柄 Y。",
                count: "采样点数量。"
            },
            add_broken_line: {
                p1: "起点坐标。",
                p2: "折点坐标。",
                p3: "终点坐标。",
                count1: "第一段采样点数量。",
                count2: "第二段采样点数量。"
            },
            add_polygon: {
                r: "外接圆半径。",
                sideCount: "边数。",
                count: "每条边采样点数量。"
            },
            add_polygon_in_circle: {
                n: "边数。",
                edgeCount: "每条边采样点数量。",
                r: "内接圆半径。"
            },
            add_round_shape: {
                r: "圆面半径。",
                step: "圆环步进间距，越小越密。",
                mode: "采样模式：固定 / 范围。",
                minCircleCount: "最小圆环点数量。",
                maxCircleCount: "最大圆环点数量。",
                preCircleCount: "固定模式下每圈点数量。"
            },
            apply_rotate: {
                angle: "整体旋转角度。",
                axis: "旋转轴方向。",
                rotateAsAxis: "启用自定义旋转轴。",
                rotateAxis: "自定义旋转轴向量。"
            },
            apply_move: {
                offset: "整体平移偏移量。"
            },
            apply_rel_move: {
                offset: "相对平移偏移量。"
            },
            apply_per_point_offset: {
                offset: "对每个点追加偏移量。"
            },
            apply_scale: {
                scale: "整体缩放倍数。"
            },
            apply_spiral_offset: {
                count: "螺旋采样段数量。",
                r: "螺旋半径。",
                height: "螺旋高度。",
                rotate: "是否整体旋转螺旋。",
                "rotate角度": "螺旋整体旋转角度。"
            },
            apply_random_offset: {
                min: "随机偏移最小长度。",
                max: "随机偏移最大长度。",
                seed: "启用随机种子。",
                "seed值": "随机种子数值。"
            },
            apply_noise_offset: {
                noiseX: "X 轴噪声强度。",
                noiseY: "Y 轴噪声强度。",
                noiseZ: "Z 轴噪声强度。",
                mode: "噪声分布模式。",
                seed: "启用随机种子。",
                "seed值": "随机种子数值。",
                lenMin: "启用最小偏移限制。",
                "min值": "最小偏移长度。",
                lenMax: "启用最大偏移限制。",
                "max值": "最大偏移长度。"
            },
            points_on_each_offset: {
                offX: "X 方向追加偏移分量。",
                offY: "Y 方向追加偏移分量。",
                offZ: "Z 方向追加偏移分量。",
                "输出形式": "Kotlin 输出方式。"
            },
            add_with: {
                "旋转半径 r": "复制布局半径。",
                "置换个数 c": "复制数量（围成多边形）。",
                rotateToCenter: "是否朝向中心。",
                "反向": "朝向反转。",
                "旋转偏移": "启用中心偏移。",
                "偏移": "中心偏移量。",
                "折叠子卡片": "折叠/展开子 Builder。"
            },
            add_builder: {
                offset: "子 Builder 的整体偏移量。"
            },
            add_fourier_series: {
                "折叠": "折叠/展开 term 列表。",
                angle: "整体相位旋转。",
                xOffset: "整体 X 方向偏移。",
                zOffset: "整体 Z 方向偏移。",
                count: "采样点数量。"
            }
        }
    };

    let activeTipKind = null;
    function setTipKind(kind) {
        activeTipKind = kind || null;
    }

    function getTipForLabel(label) {
        const key = String(label || "").trim();
        if (!key) return "";
        if (activeTipKind && TIP_MAP.kinds[activeTipKind] && TIP_MAP.kinds[activeTipKind][key]) {
            return TIP_MAP.kinds[activeTipKind][key];
        }
        if (TIP_MAP.generic && TIP_MAP.generic[key]) return TIP_MAP.generic[key];
        return "";
    }

    function applyRowTips(editorEl, label) {
        const tip = getTipForLabel(label);
        if (!tip || !editorEl) return;
        const applyTip = (el) => {
            if (!el || el.dataset?.tipSkip) return;
            if (el.getAttribute && el.getAttribute("data-tip")) return;
            el.setAttribute && el.setAttribute("data-tip", tip);
        };
        if (editorEl.matches && editorEl.matches("input.input, select.input")) {
            applyTip(editorEl);
        }
        if (editorEl.querySelectorAll) {
            editorEl.querySelectorAll("input.input, select.input").forEach(applyTip);
        }
    }

    function row(label, editorEl) {
        const r = document.createElement("div");
        r.className = "row";
        const l = document.createElement("div");
        l.className = "label";
        l.textContent = label;
        r.appendChild(l);
        r.appendChild(editorEl);
        applyRowTips(editorEl, label);
        return r;
    }

    function inputNum(value, onInput) {
        const i = document.createElement("input");
        i.className = "input";
        i.type = "number";
        const step = (typeof getParamStep === "function") ? getParamStep() : null;
        i.step = Number.isFinite(step) ? String(step) : "any";
        i.value = String(value ?? 0);
        armHistoryOnFocus && armHistoryOnFocus(i, "edit");
        i.addEventListener("keydown", (e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            const liveStep = (typeof getParamStep === "function") ? getParamStep() : null;
            if (!Number.isFinite(liveStep) || liveStep <= 0) return;
            e.preventDefault();
            const curStr = i.value;
            const cur = parseFloat(curStr);
            const base = Number.isFinite(cur) ? cur : 0;
            const next = base + (e.key === "ArrowUp" ? liveStep : -liveStep);
            const precision = Math.max(countDecimalsFromString(curStr), countDecimalsFromString(liveStep));
            const fixed = Number.isFinite(next) ? Number(next.toFixed(Math.min(12, precision + 2))) : next;
            i.value = String(fixed);
            i.dispatchEvent(new Event("input", { bubbles: true }));
        });
        i.addEventListener("input", () => onInput(num ? num(i.value) : Number(i.value)));
        return i;
    }

    function select(options, value, onChange) {
        const s = document.createElement("select");
        s.className = "input";
        armHistoryOnFocus && armHistoryOnFocus(s, "edit");
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
        armHistoryOnFocus && armHistoryOnFocus(c, "edit");
        c.addEventListener("pointerdown", () => historyCapture && historyCapture("checkbox"));
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
        const tipBase = getTipForLabel(label) || getTipForLabel(prefix);
        if (tipBase) {
            ix.setAttribute("data-tip", `${tipBase}（X）`);
            iy.setAttribute("data-tip", `${tipBase}（Y）`);
            iz.setAttribute("data-tip", `${tipBase}（Z）`);
        }
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
        const onFocus = () => {
            if (typeof setActiveVecTarget === "function") setActiveVecTarget(target);
        };
        ix.addEventListener("focus", onFocus);
        iy.addEventListener("focus", onFocus);
        iz.addEventListener("focus", onFocus);
        return box;
    }

    let anglePiBound = false;
    function bindAnglePiClose() {
        if (anglePiBound) return;
        anglePiBound = true;
        document.addEventListener("click", (e) => {
            const target = e.target;
            if (target && target.closest && target.closest(".angle-pi")) return;
            document.querySelectorAll(".angle-pi-panel.open").forEach((panel) => {
                panel.classList.remove("open");
                const btn = panel.__toggle || panel.closest(".angle-pi")?.querySelector(".angle-pi-toggle");
                if (btn) btn.classList.remove("active");
            });
        });
    }

    function angleInput(obj, key, onChange, options = {}) {
        const wrap = document.createElement("div");
        wrap.className = "angle-control";

        const main = document.createElement("div");
        main.className = "angle-control-main";

        const unitKey = options.unitKey || `${key}Unit`;
        const unit = normalizeAngleUnit(obj[unitKey]);
        obj[unitKey] = unit;

        const input = inputNum(obj[key], v => {
            obj[key] = v;
            if (typeof onChange === "function") onChange();
        });
        input.classList.add("angle-value");

        const unitSelect = select([["deg", "度"], ["rad", "弧度"]], unit, (val) => {
            const prevUnit = normalizeAngleUnit(obj[unitKey]);
            const nextUnit = normalizeAngleUnit(val);
            if (prevUnit === nextUnit) return;
            obj[unitKey] = nextUnit;
            const converted = convertAngleValue(input.value, prevUnit, nextUnit);
            input.value = formatAngleValue(converted);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        unitSelect.classList.add("angle-unit");
        unitSelect.setAttribute("data-tip", "单位切换：度 / 弧度");

        const piWrap = document.createElement("div");
        piWrap.className = "angle-pi";

        const piToggle = document.createElement("button");
        piToggle.type = "button";
        piToggle.className = "btn small angle-pi-toggle";
        piToggle.textContent = "nπ";
        piToggle.title = "n×PI 转换";

        const piPanel = document.createElement("div");
        piPanel.className = "angle-pi-panel";

        const piField = document.createElement("div");
        piField.className = "angle-pi-field";
        const piLabel = document.createElement("div");
        piLabel.className = "angle-pi-label";
        piLabel.textContent = "n×π";
        const piInput = document.createElement("input");
        piInput.className = "input angle-pi-input";
        piInput.type = "number";
        const piStep = (typeof getParamStep === "function") ? getParamStep() : null;
        piInput.step = Number.isFinite(piStep) ? String(piStep) : "0.1";
        piInput.value = "1";
        piInput.dataset.tipSkip = "1";
        piField.appendChild(piLabel);
        piField.appendChild(piInput);

        const piInfo = document.createElement("div");
        piInfo.className = "angle-pi-info";
        const degLine = document.createElement("div");
        const radLine = document.createElement("div");
        piInfo.appendChild(degLine);
        piInfo.appendChild(radLine);

        const updatePiInfo = () => {
            const n = Number(piInput.value);
            const safe = Number.isFinite(n) ? n : 0;
            const deg = safe * 180;
            const rad = safe * Math.PI;
            degLine.textContent = `角度: ${formatAngleValue(deg)}°`;
            radLine.textContent = `弧度: ${formatAngleValue(rad)}`;
        };
        updatePiInfo();
        piInput.addEventListener("input", updatePiInfo);

        const applyBtn = document.createElement("button");
        applyBtn.type = "button";
        applyBtn.className = "btn small primary angle-pi-apply";
        applyBtn.textContent = "应用";
        applyBtn.addEventListener("click", () => {
            historyCapture && historyCapture("angle_pi_apply");
            const n = Number(piInput.value);
            const safe = Number.isFinite(n) ? n : 0;
            const rad = safe * Math.PI;
            const deg = safe * 180;
            const curUnit = normalizeAngleUnit(unitSelect.value);
            const nextVal = curUnit === "rad" ? rad : deg;
            input.value = formatAngleValue(nextVal);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });

        piPanel.appendChild(piField);
        piPanel.appendChild(piInfo);
        piPanel.appendChild(applyBtn);
        piPanel.__toggle = piToggle;

        piToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            document.querySelectorAll(".angle-pi-panel.open").forEach((panel) => {
                if (panel !== piPanel) {
                    panel.classList.remove("open");
                    const btn = panel.__toggle || panel.closest(".angle-pi")?.querySelector(".angle-pi-toggle");
                    if (btn) btn.classList.remove("active");
                }
            });
            const next = !piPanel.classList.contains("open");
            piPanel.classList.toggle("open", next);
            piToggle.classList.toggle("active", next);
        });
        piPanel.addEventListener("click", (e) => e.stopPropagation());
        piWrap.appendChild(piToggle);

        main.appendChild(input);
        main.appendChild(unitSelect);
        main.appendChild(piWrap);
        wrap.appendChild(main);
        wrap.appendChild(piPanel);

        bindAnglePiClose();
        return wrap;
    }

    return { row, inputNum, select, checkbox, makeVec3Editor, angleInput, setTipKind };
}

export function initCardSystem(ctx = {}) {
    const {
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
        downloadText,
        deepClone,
        fileBuilderJson,
        stopLinePick,
        startLinePick,
        stopPointPick,
        startOffsetMode
    } = ctx;

    const getState = ctx.getState || (() => ctx.state);
    const getRenderAll = ctx.getRenderAll || (() => ctx.renderAll);
    const getFocusedNodeId = ctx.getFocusedNodeId || (() => ctx.focusedNodeId);
    const setFocusedNode = ctx.setFocusedNode || (() => {});
    const clearFocusedNodeIf = ctx.clearFocusedNodeIf || (() => {});
    const updateFocusCardUI = ctx.updateFocusCardUI || (() => {});
    const getIsRenderingCards = ctx.getIsRenderingCards || (() => false);
    const setIsRenderingCards = ctx.setIsRenderingCards || (() => {});
    const getSuppressCardFocusOutClear = ctx.getSuppressCardFocusOutClear || (() => false);
    const getMirrorPlaneInfo = ctx.getMirrorPlaneInfo || (() => ({ label: "XZ" }));
    const getMirrorPlane = ctx.getMirrorPlane || (() => "XZ");
    const getBuilderJsonTargetNode = ctx.getBuilderJsonTargetNode || (() => null);
    const setBuilderJsonTargetNode = ctx.setBuilderJsonTargetNode || (() => {});
    const getLinePickMode = ctx.getLinePickMode || (() => false);
    const getPointPickMode = ctx.getPointPickMode || (() => false);
    const makeUid = ctx.uid || (() => (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16));

    const INPUT_TIP_DELAY = 650;
    const inputTipState = { timer: 0, el: null, target: null };
    let inputTipBound = false;

    function ensureInputTipEl() {
        if (inputTipState.el) return inputTipState.el;
        const el = document.createElement("div");
        el.className = "pb-tooltip";
        el.setAttribute("role", "tooltip");
        el.style.display = "none";
        document.body.appendChild(el);
        inputTipState.el = el;
        return el;
    }

    function hideInputTip() {
        if (inputTipState.timer) {
            clearTimeout(inputTipState.timer);
            inputTipState.timer = 0;
        }
        inputTipState.target = null;
        const el = inputTipState.el;
        if (!el) return;
        el.classList.remove("show");
        el.style.display = "none";
    }

    function positionInputTip(target, el) {
        const rect = target.getBoundingClientRect();
        const margin = 10;
        const gap = 8;
        const tipRect = el.getBoundingClientRect();

        let x = rect.left + rect.width / 2 - tipRect.width / 2;
        x = Math.max(margin, Math.min(x, window.innerWidth - margin - tipRect.width));

        let y = rect.bottom + gap;
        if (y + tipRect.height + margin > window.innerHeight) {
            y = rect.top - gap - tipRect.height;
        }
        if (y < margin) y = margin;

        el.style.left = `${Math.round(x)}px`;
        el.style.top = `${Math.round(y)}px`;
    }

    function showInputTip(target, text) {
        if (!text) return;
        const el = ensureInputTipEl();
        el.textContent = text;
        el.style.display = "block";
        el.style.visibility = "hidden";
        positionInputTip(target, el);
        el.style.visibility = "visible";
        requestAnimationFrame(() => el.classList.add("show"));
    }

    function scheduleInputTip(target) {
        if (!target) return;
        const tip = String(target.getAttribute("data-tip") || "").trim();
        if (!tip) return;
        if (inputTipState.timer) clearTimeout(inputTipState.timer);
        inputTipState.target = target;
        inputTipState.timer = setTimeout(() => {
            if (inputTipState.target !== target) return;
            showInputTip(target, tip);
        }, INPUT_TIP_DELAY);
    }

    function bindInputTips() {
        if (inputTipBound) return;
        inputTipBound = true;
        document.addEventListener("mouseover", (e) => {
            const target = e.target;
            const input = target && target.closest ? target.closest(".input[data-tip]") : null;
            if (!input) return;
            scheduleInputTip(input);
        });
        document.addEventListener("mouseout", (e) => {
            const target = e.target;
            const input = target && target.closest ? target.closest(".input[data-tip]") : null;
            if (!input) return;
            if (e.relatedTarget && input.contains(e.relatedTarget)) return;
            hideInputTip();
        });
        document.addEventListener("mousedown", hideInputTip);
        window.addEventListener("scroll", hideInputTip, true);
        window.addEventListener("resize", hideInputTip);
        document.addEventListener("keydown", hideInputTip);
    }

    const renderAll = () => {
        const fn = getRenderAll();
        if (typeof fn === "function") fn();
    };

    const getVisibleEntries = (...args) => {
        const fn = ctx.getVisibleEntries ? ctx.getVisibleEntries() : ctx.getVisibleEntries;
        return typeof fn === "function" ? fn(...args) : null;
    };
    const cleanupFilterMenus = () => {
        const fn = ctx.getCleanupFilterMenus ? ctx.getCleanupFilterMenus() : ctx.cleanupFilterMenus;
        if (typeof fn === "function") fn();
    };
    const isFilterActive = (...args) => {
        const fn = ctx.getIsFilterActive ? ctx.getIsFilterActive() : ctx.isFilterActive;
        return typeof fn === "function" ? fn(...args) : false;
    };
    const findVisibleSwapIndex = (...args) => {
        const fn = ctx.getFindVisibleSwapIndex ? ctx.getFindVisibleSwapIndex() : ctx.findVisibleSwapIndex;
        return typeof fn === "function" ? fn(...args) : -1;
    };
    const swapInList = (...args) => {
        const fn = ctx.getSwapInList ? ctx.getSwapInList() : ctx.swapInList;
        if (typeof fn === "function") fn(...args);
    };
    const createFilterControls = (...args) => {
        const fn = ctx.getCreateFilterControls ? ctx.getCreateFilterControls() : ctx.createFilterControls;
        return typeof fn === "function" ? fn(...args) : null;
    };
    const createParamSyncControls = (...args) => {
        const fn = ctx.getCreateParamSyncControls ? ctx.getCreateParamSyncControls() : ctx.createParamSyncControls;
        return typeof fn === "function" ? fn(...args) : null;
    };
    const getParamSync = () => (ctx.getParamSync ? ctx.getParamSync() : ctx.paramSync);
    const isSyncSelectableEvent = (e) => {
        const fn = ctx.getIsSyncSelectableEvent ? ctx.getIsSyncSelectableEvent() : ctx.isSyncSelectableEvent;
        return typeof fn === "function" ? fn(e) : false;
    };
    const toggleSyncTarget = (node) => {
        const fn = ctx.getToggleSyncTarget ? ctx.getToggleSyncTarget() : ctx.toggleSyncTarget;
        if (typeof fn === "function") fn(node);
    };

    function iconBtn(text, onClick, danger = false) {
        const b = document.createElement("button");
        b.className = "iconbtn" + (danger ? " danger" : "");
        b.classList.add("action-item");
        b.textContent = text;
        b.addEventListener("click", onClick);
        return b;
    }

    function syncCollapseUIForList(list) {
        if (typeof ctx.syncCardCollapseUI !== "function") return false;
        let updated = 0;
        const visit = (arr) => {
            const nodes = arr || [];
            for (const n of nodes) {
                if (!n) continue;
                if (n.id && ctx.syncCardCollapseUI(n.id)) updated++;
                if (isBuilderContainerKind(n.kind) && Array.isArray(n.children)) {
                    visit(n.children);
                }
            }
        };
        visit(list);
        return updated > 0;
    }

    function makeCollapseAllButtons(scopeId, listGetter, small = true) {
        const collapseBtn = document.createElement("button");
        collapseBtn.className = small ? "btn small" : "btn";
        collapseBtn.textContent = "折叠所有";
        collapseBtn.addEventListener("click", () => {
            const list = (typeof listGetter === "function") ? listGetter() : [];
            if (typeof ctx.collapseAllInScope === "function") ctx.collapseAllInScope(scopeId, list);
            if (!syncCollapseUIForList(list)) renderAll();
        });

        const expandBtn = document.createElement("button");
        expandBtn.className = small ? "btn small" : "btn";
        expandBtn.textContent = "展开所有";
        expandBtn.addEventListener("click", () => {
            const list = (typeof listGetter === "function") ? listGetter() : [];
            if (typeof ctx.expandAllInScope === "function") ctx.expandAllInScope(scopeId, list);
            if (!syncCollapseUIForList(list)) renderAll();
        });

        return { collapseBtn, expandBtn };
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

    function initCollapseAllControls() {
        const title = document.querySelector(".panel.left .panel-title");
        if (!title || !title.parentElement) return;
        if (title.parentElement.querySelector(".panel-tools")) return;
        const tools = document.createElement("div");
        tools.className = "panel-tools";
        const { collapseBtn, expandBtn } = makeCollapseAllButtons(null, () => (getState()?.root?.children || []), true);
        tools.appendChild(collapseBtn);
        tools.appendChild(expandBtn);

        const filterUi = createFilterControls(null, renderCards, true);
        const syncUi = createParamSyncControls();
        if (filterUi && filterUi.wrap) tools.appendChild(filterUi.wrap);
        if (syncUi && syncUi.wrap) tools.appendChild(syncUi.wrap);

        title.insertAdjacentElement("afterend", tools);
    }

    let draggingId = null;
    const DRAG_TYPE_NODE = "application/x-pb-node";
    const DRAG_TYPE_BUILDER = "application/x-pb-builder";
    let draggingBuilder = null;
    let pendingCardSwapAnim = false;
    let dragPreview = null;
    const requestCardSwapAnim = () => {
        pendingCardSwapAnim = true;
    };

    function getDragNodeId(e) {
        try {
            if (e?.dataTransfer) {
                const byType = e.dataTransfer.getData(DRAG_TYPE_NODE);
                if (byType) return byType;
                const plain = e.dataTransfer.getData("text/plain");
                if (plain) return plain;
            }
        } catch {}
        return draggingId;
    }

    function getDragBuilderInfo(e) {
        try {
            const raw = e?.dataTransfer?.getData(DRAG_TYPE_BUILDER);
            if (raw) {
                try { return JSON.parse(raw); } catch { return { type: raw }; }
            }
        } catch {}
        return draggingBuilder;
    }

    function startDragPreview(cardEl, listRef, ownerNode) {
        if (!cardEl) return;
        const container = cardEl.parentElement;
        dragPreview = {
            id: cardEl.dataset.id,
            cardEl,
            listRef,
            ownerNode,
            container,
            originalOrder: container ? Array.from(container.querySelectorAll(".card[data-id]")) : [],
            dirty: false,
            didDrop: false,
            lastTargetId: null,
            lastMode: null,
            lastAfter: null,
        };
    }

    function markDragPreviewDrop() {
        if (dragPreview) dragPreview.didDrop = true;
    }

    function finishDragPreview() {
        if (!dragPreview) return;
        const shouldRevert = dragPreview.dirty && !dragPreview.didDrop;
        dragPreview = null;
        if (shouldRevert) renderAll();
    }


    function setupDnD(handleEl, cardEl, node, listRef, getIdx, ownerNode = null) {
        const isNestedDropTarget = (target) => {
            if (!target || !target.closest) return false;
            const zone = target.closest(".subcards, .dropzone");
            return !!zone && cardEl.contains(zone);
        };
        handleEl.setAttribute("draggable", "true");
        handleEl.addEventListener("pointerdown", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(true);
        });
        handleEl.addEventListener("pointerup", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
        handleEl.addEventListener("pointercancel", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
        handleEl.addEventListener("dragstart", (e) => {
            draggingId = node?.id || cardEl.dataset.id;
            draggingBuilder = null;
            cardEl.classList.add("dragging");
            startDragPreview(cardEl, listRef, ownerNode);
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(true);
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData(DRAG_TYPE_NODE, draggingId); } catch {}
            e.dataTransfer.setData("text/plain", draggingId);
        });
        handleEl.addEventListener("dragend", () => {
            draggingId = null;
            draggingBuilder = null;
            cardEl.classList.remove("dragging");
            cardEl.classList.remove("drag-over");
            finishDragPreview();
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });

        cardEl.addEventListener("dragover", (e) => {
            if (isNestedDropTarget(e.target)) return;
            e.preventDefault();
            const builderInfo = getDragBuilderInfo(e);
            e.dataTransfer.dropEffect = builderInfo ? "copy" : "move";
            cardEl.classList.add("drag-over");

            if (builderInfo) return;
            const id = getDragNodeId(e);
            if (!id || !dragPreview || dragPreview.id !== id) return;
            if (dragPreview.listRef !== listRef) return;
            if (dragPreview.cardEl === cardEl) return;
            if (!cardEl.parentElement || cardEl.parentElement !== dragPreview.container) return;

            const scopeId = ownerNode ? ownerNode.id : null;
            const mode = isFilterActive(scopeId) ? "swap" : "insert";
            const rect = cardEl.getBoundingClientRect();
            const after = (mode === "insert") && (e.clientY > rect.top + rect.height / 2);
            if (dragPreview.lastTargetId === cardEl.dataset.id
                && dragPreview.lastMode === mode
                && (mode === "swap" || dragPreview.lastAfter === after)) {
                return;
            }

            const prevPositions = captureCardPositionsIn(cardEl.parentElement);
            if (mode === "swap") {
                const baseOrder = Array.isArray(dragPreview.originalOrder) ? dragPreview.originalOrder : [];
                const fromIdx = baseOrder.indexOf(dragPreview.cardEl);
                const toIdx = baseOrder.indexOf(cardEl);
                if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
                const nextOrder = baseOrder.slice();
                nextOrder[fromIdx] = baseOrder[toIdx];
                nextOrder[toIdx] = baseOrder[fromIdx];
                nextOrder.forEach((el) => cardEl.parentElement.appendChild(el));
            } else {
                const ref = after ? cardEl.nextElementSibling : cardEl;
                if (ref === dragPreview.cardEl) return;
                cardEl.parentElement.insertBefore(dragPreview.cardEl, ref);
            }
            dragPreview.dirty = true;
            dragPreview.lastTargetId = cardEl.dataset.id;
            dragPreview.lastMode = mode;
            dragPreview.lastAfter = after;
            applyCardSwapAnimationIn(cardEl.parentElement, prevPositions);
        });
        cardEl.addEventListener("dragleave", () => cardEl.classList.remove("drag-over"));
        cardEl.addEventListener("drop", (e) => {
            if (isNestedDropTarget(e.target)) {
                cardEl.classList.remove("drag-over");
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            cardEl.classList.remove("drag-over");
            const builderInfo = getDragBuilderInfo(e);
            if (builderInfo) {
                if (handleBuilderDrop(builderInfo, listRef, getIdx(), ownerNode)) {
                    markDragPreviewDrop();
                    requestCardSwapAnim();
                    renderAll();
                }
                return;
            }

            const id = getDragNodeId(e);
            if (!id) return;

            if (dragPreview && dragPreview.dirty && dragPreview.id === id) {
                const scopeId = ownerNode ? ownerNode.id : null;
                const useSwap = isFilterActive(scopeId);
                const targetId = dragPreview.lastTargetId;
                if (targetId && targetId !== id) {
                    const targetIdx = listRef.findIndex((it) => it && it.id === targetId);
                    if (targetIdx >= 0) {
                        historyCapture("drag_drop");
                        const targetIndex = targetIdx + (!useSwap && dragPreview.lastAfter ? 1 : 0);
                        const ok = moveNodeById(id, listRef, targetIndex, ownerNode);
                        if (ok) {
                            markDragPreviewDrop();
                            requestCardSwapAnim();
                            renderAll();
                        }
                        return;
                    }
                }
            }

            // drop 在卡片上：插入到该卡片之前（同列表=排序，跨列表=移动）
            if (tryCopyWithBuilderIntoAddWith(id, ownerNode)) {
                markDragPreviewDrop();
                requestCardSwapAnim();
                renderAll();
                return;
            }
            historyCapture("drag_drop");
            const scopeId = ownerNode ? ownerNode.id : null;
            const useSwap = isFilterActive(scopeId);
            const rect = cardEl.getBoundingClientRect();
            const after = !useSwap && (e.clientY > rect.top + rect.height / 2);
            const targetIndex = getIdx() + (after ? 1 : 0);
            const ok = moveNodeById(id, listRef, targetIndex, ownerNode);
            if (ok) {
                markDragPreviewDrop();
                requestCardSwapAnim();
                renderAll();
            }
        });
    }

    // 用于 add_fourier_series 内部 term 卡片的拖拽排序
    function setupDrag(handleEl, cardEl, listRef, getIdx, onRender) {
        if (!handleEl || !cardEl || !Array.isArray(listRef)) return;
        handleEl.setAttribute("draggable", "true");
        handleEl.addEventListener("pointerdown", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(true);
        });
        handleEl.addEventListener("pointerup", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
        handleEl.addEventListener("pointercancel", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
        handleEl.addEventListener("dragstart", (e) => {
            draggingId = cardEl.dataset.id;
            draggingBuilder = null;
            cardEl.classList.add("dragging");
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(true);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", draggingId);
        });
        handleEl.addEventListener("dragend", () => {
            draggingId = null;
            draggingBuilder = null;
            cardEl.classList.remove("dragging");
            cardEl.classList.remove("drag-over");
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
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
            requestCardSwapAnim();
            if (typeof onRender === "function") onRender();
            else renderAll();
        });
    }

    function bindAddWithBuilderDrag(handleEl, ownerNode) {
        if (!handleEl || !ownerNode) return;
        handleEl.setAttribute("draggable", "true");
        handleEl.classList.add("drag-handle");
        handleEl.addEventListener("pointerdown", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(true);
        });
        handleEl.addEventListener("pointerup", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
        handleEl.addEventListener("pointercancel", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
        handleEl.addEventListener("dragstart", (e) => {
            const payload = { type: "add_with_builder", ownerId: ownerNode.id };
            draggingId = null;
            draggingBuilder = payload;
            handleEl.classList.add("dragging");
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(true);
            e.dataTransfer.effectAllowed = "copy";
            try { e.dataTransfer.setData(DRAG_TYPE_BUILDER, JSON.stringify(payload)); } catch {}
            try { e.dataTransfer.setData("text/plain", "pb_builder"); } catch {}
        });
        handleEl.addEventListener("dragend", () => {
            draggingBuilder = null;
            handleEl.classList.remove("dragging");
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
    }

    function setupListDropZone(containerEl, getListRef, getOwnerNode) {
        if (!containerEl || containerEl.__pbDropZoneBound) return;
        containerEl.__pbDropZoneBound = true;

        containerEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const builderInfo = getDragBuilderInfo(e);
            e.dataTransfer.dropEffect = builderInfo ? "copy" : "move";
            containerEl.classList.add("dropzone-active");
        });

        containerEl.addEventListener("dragleave", () => containerEl.classList.remove("dropzone-active"));

        containerEl.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            containerEl.classList.remove("dropzone-active");
            const listRef = getListRef();
            const owner = getOwnerNode ? getOwnerNode() : null;
            if (!Array.isArray(listRef)) return;
            const scopeId = owner ? owner.id : null;
            if (isFilterActive(scopeId)) {
                showToast("过滤中只能交换顺序", "info");
                return;
            }

            const builderInfo = getDragBuilderInfo(e);
            if (builderInfo) {
                if (handleBuilderDrop(builderInfo, listRef, listRef.length, owner)) {
                    markDragPreviewDrop();
                    requestCardSwapAnim();
                    renderAll();
                }
                return;
            }

            const id = getDragNodeId(e);
            if (!id) return;

            if (tryCopyWithBuilderIntoAddWith(id, owner)) {
                markDragPreviewDrop();
                requestCardSwapAnim();
                renderAll();
                return;
            }
            historyCapture("drag_drop_end");
            const ok = moveNodeById(id, listRef, listRef.length, owner);
            if (ok) {
                markDragPreviewDrop();
                requestCardSwapAnim();
                renderAll();
            }
        });
    }

    function bindSubDropZone(zoneEl, listRef, ownerNode) {
        if (!zoneEl) return;
        zoneEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const builderInfo = getDragBuilderInfo(e);
            e.dataTransfer.dropEffect = builderInfo ? "copy" : "move";
            zoneEl.classList.add("active");
        });
        zoneEl.addEventListener("dragleave", () => zoneEl.classList.remove("active"));
        zoneEl.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            zoneEl.classList.remove("active");
            const scopeId = ownerNode ? ownerNode.id : null;
            if (isFilterActive(scopeId)) {
                showToast("过滤中只能交换顺序", "info");
                return;
            }
            const builderInfo = getDragBuilderInfo(e);
            if (builderInfo) {
                if (handleBuilderDrop(builderInfo, listRef, listRef.length, ownerNode)) {
                    markDragPreviewDrop();
                    requestCardSwapAnim();
                    renderAll();
                }
                return;
            }

            const id = getDragNodeId(e);
            if (!id) return;

            if (tryCopyWithBuilderIntoAddWith(id, ownerNode)) {
                markDragPreviewDrop();
                requestCardSwapAnim();
                renderAll();
                return;
            }
            historyCapture("drag_drop_sub");
            const ok = moveNodeById(id, listRef, listRef.length, ownerNode);
            if (ok) {
                markDragPreviewDrop();
                requestCardSwapAnim();
                renderAll();
            }
        });
    }

    function addQuickOffsetTo(list) {
        const state = getState();
        const target = (list || state?.root?.children || []);
        historyCapture("quick_offset");
        target.push(makeNode("points_on_each_offset", {params: {offX: 0.2, offY: 0, offZ: 0}}));
        renderAll();
    }

    function renderFourierTermCard(parentNode, idx) {
        const t = parentNode.terms[idx];
        if (!t) return document.createElement("div");
        if (typeof setTipKind === "function") setTipKind("fourier_term");
        const card = document.createElement("div");
        card.className = "card subcard";
        card.dataset.id = t.id;
        if (getFocusedNodeId() === t.id) card.classList.add("focused");
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
        ttext.textContent = `term ${idx + 1}`;

        title.appendChild(handle);
        title.appendChild(ttext);

        const actions = document.createElement("div");
        actions.className = "card-actions";

        const collapseBtn = iconBtn(t.collapsed ? "▸" : "▾", (e) => {
            e.stopPropagation();
            historyCapture("toggle_term_collapse");
            t.collapsed = !t.collapsed;
            const synced = (typeof ctx.syncCardCollapseUI === "function") ? ctx.syncCardCollapseUI(t.id) : false;
            if (!synced) {
                card.classList.toggle("collapsed", t.collapsed);
                collapseBtn.textContent = t.collapsed ? "▸" : "▾";
                collapseBtn.title = t.collapsed ? "展开" : "收起";
            }
        });
        collapseBtn.title = t.collapsed ? "展开" : "收起";
        actions.appendChild(collapseBtn);

        actions.appendChild(iconBtn("↑", () => {
            if (idx > 0) {
                historyCapture("move_fourier_term_up");
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
            const wasFocused = (getFocusedNodeId() === t.id);
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
        if (Number.isFinite(t.bodyHeight) && !t.collapsed) {
            body.style.height = `${t.bodyHeight}px`;
            body.style.maxHeight = `${t.bodyHeight}px`;
        }
        const desc = document.createElement("div");
        desc.className = "pill";
        desc.textContent = "r, w, startAngle";
        body.appendChild(desc);

        body.appendChild(row("r", inputNum(t.r, v => {
            t.r = v;
            rebuildPreviewAndKotlin();
        })));
        body.appendChild(row("w", inputNum(t.w, v => {
            t.w = v;
            rebuildPreviewAndKotlin();
        })));
        body.appendChild(row("startAngle", angleInput(t, "startAngle", rebuildPreviewAndKotlin)));

        card.appendChild(head);
        card.appendChild(body);
        const resizer = document.createElement("div");
        resizer.className = "card-resizer";
        bindCardBodyResizer(resizer, body, t);
        card.appendChild(resizer);

        // ✅ 同样处理焦点：避免焦点落在 Fourier 子卡片时仍残留上一张卡的高亮
        card.tabIndex = 0;
        card.addEventListener("pointerdown", (e) => {
            if (getIsRenderingCards()) return;
            if (e.button !== 0) return;
            // ✅ 避免父卡片接管子卡片的点击：只响应“事件发生在当前卡片自身区域”
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            setFocusedNode(t.id);
        });
        card.addEventListener("focusin", (e) => {
            if (getIsRenderingCards()) return;
            // ✅ focusin 会冒泡：子卡片获得焦点时，父卡片不应抢走高亮
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            setFocusedNode(t.id);
        });
        card.addEventListener("focusout", (e) => {
            if (getIsRenderingCards()) return;
            if (getSuppressCardFocusOutClear()) return;
            const next = e.relatedTarget;
            if (next && card.contains(next)) return;
            requestAnimationFrame(() => {
                const ae = document.activeElement;
                if (ae && card.contains(ae)) return;
                clearFocusedNodeIf(t.id);
            });
        });

        setupDrag(handle, card, parentNode.terms, () => idx, () => renderAll());
        if (typeof setTipKind === "function") setTipKind(null);
        return card;
    }

    function renderNodeCard(node, siblings, idx, ownerLabel, ownerNode = null) {
        const def = KIND[node.kind];
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.id = node.id;
        const scopeId = ownerNode ? ownerNode.id : null;
        const useFilterSwap = isFilterActive(scopeId);
        if (node.id === getFocusedNodeId()) card.classList.add("focused");
        const sync = getParamSync();
        if (sync && sync.selectedIds && sync.selectedIds.has(node.id)) card.classList.add("sync-target");
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

        let collapsePrev = null;
        const rememberCollapsePrev = () => {
            if (collapsePrev !== null) return;
            collapsePrev = node.collapsed;
        };
        const collapseBtn = iconBtn(node.collapsed ? "▸" : "▾", (e) => {
            e.stopPropagation();
            historyCapture("toggle_card_collapse");
            const wasCollapsed = (collapsePrev !== null) ? collapsePrev : node.collapsed;
            collapsePrev = null;
            node.collapsed = !wasCollapsed;
            if (typeof ctx.isCollapseAllActive === "function" && ctx.isCollapseAllActive(scopeId)) {
                const scope = (typeof ctx.getCollapseScope === "function") ? ctx.getCollapseScope(scopeId) : null;
                if (scope && scope.manualOpen) {
                    if (node.collapsed) scope.manualOpen.delete(node.id);
                    else scope.manualOpen.add(node.id);
                }
            }
            const synced = (typeof ctx.syncCardCollapseUI === "function") ? ctx.syncCardCollapseUI(node.id) : false;
            if (!synced) {
                card.classList.toggle("collapsed", node.collapsed);
                collapseBtn.textContent = node.collapsed ? "▸" : "▾";
                collapseBtn.title = node.collapsed ? "展开" : "收起";
            }
        });
        collapseBtn.addEventListener("pointerdown", rememberCollapsePrev);
        collapseBtn.addEventListener("mousedown", rememberCollapsePrev);
        collapseBtn.addEventListener("touchstart", rememberCollapsePrev, { passive: true });
        collapseBtn.addEventListener("keydown", (ev) => {
            if (ev.key === " " || ev.key === "Enter") rememberCollapsePrev();
        });
        collapseBtn.dataset.collapseBtn = "1";
        collapseBtn.title = node.collapsed ? "展开" : "收起";
        actions.appendChild(collapseBtn);

        // ✅ 快捷添加：在当前卡片下方插入（若选中 addBuilder 卡片则插入到子Builder）
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
            if (useFilterSwap) {
                const target = findVisibleSwapIndex(idx, "top", siblings, scopeId);
                if (target >= 0 && target !== idx) {
                    historyCapture("move_top");
                    swapInList(siblings, idx, target);
                    renderAll();
                }
                return;
            }
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
            if (useFilterSwap) {
                const target = findVisibleSwapIndex(idx, "prev", siblings, scopeId);
                if (target >= 0 && target !== idx) {
                    historyCapture("move_up");
                    swapInList(siblings, idx, target);
                    renderAll();
                }
                return;
            }
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
            if (useFilterSwap) {
                const target = findVisibleSwapIndex(idx, "next", siblings, scopeId);
                if (target >= 0 && target !== idx) {
                    historyCapture("move_down");
                    swapInList(siblings, idx, target);
                    renderAll();
                }
                return;
            }
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
            if (useFilterSwap) {
                const target = findVisibleSwapIndex(idx, "bottom", siblings, scopeId);
                if (target >= 0 && target !== idx) {
                    historyCapture("move_bottom");
                    swapInList(siblings, idx, target);
                    renderAll();
                }
                return;
            }
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
                const cloned = mirrorCopyNode(node, getMirrorPlane());
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
            if (getFocusedNodeId() === node.id) {
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
        if (Number.isFinite(node.bodyHeight) && !node.collapsed) {
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
            // ✅ 避免 addBuilder 父卡片接管子卡片：只响应“事件发生在当前卡片自身区域”
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            if (isSyncSelectableEvent(e)) toggleSyncTarget(node);
            setFocusedNode(node.id);
        });
        card.addEventListener("dblclick", (e) => {
            if (getIsRenderingCards()) return;
            if (typeof startOffsetMode !== "function") return;
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            const tag = e.target && e.target.tagName ? String(e.target.tagName).toUpperCase() : "";
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
            if (e.target && e.target.isContentEditable) return;
            if (e.target && e.target.closest && e.target.closest(".card-actions")) return;
            setFocusedNode(node.id);
            startOffsetMode(node.id);
        });
        card.addEventListener("focusin", (e) => {
            // ✅ focusin 会冒泡：子卡片获得焦点时，父卡片不应抢走高亮
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            setFocusedNode(node.id);
        });
        card.addEventListener("focusout", (e) => {
            if (getIsRenderingCards()) return;
            if (getSuppressCardFocusOutClear()) return;
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

    function captureCardPositionsIn(containerEl) {
        const map = new Map();
        if (!containerEl) return map;
        containerEl.querySelectorAll(".card[data-id]").forEach((el) => {
            map.set(el.dataset.id, el.getBoundingClientRect());
        });
        return map;
    }

    function applyCardSwapAnimationIn(containerEl, prevPositions) {
        if (!prevPositions || !prevPositions.size || !containerEl) return;
        const moving = [];
        containerEl.querySelectorAll(".card[data-id]").forEach((el) => {
            if (el.classList.contains("dragging")) return;
            const prev = prevPositions.get(el.dataset.id);
            if (!prev) return;
            const next = el.getBoundingClientRect();
            const dx = prev.left - next.left;
            const dy = prev.top - next.top;
            if (dx || dy) {
                el.style.transform = `translate(${dx}px, ${dy}px)`;
                el.style.transition = "transform 0s";
                moving.push(el);
            }
        });
        if (!moving.length) return;
        requestAnimationFrame(() => {
            moving.forEach((el) => {
                el.style.transition = "";
                el.style.transform = "";
            });
        });
    }

    function captureCardPositions() {
        return captureCardPositionsIn(elCardsRoot);
    }

    function applyCardSwapAnimation(prevPositions) {
        applyCardSwapAnimationIn(elCardsRoot, prevPositions);
    }

    function renderCards() {
        setIsRenderingCards(true);
        const prevPositions = pendingCardSwapAnim ? captureCardPositions() : null;
        try {
            elCardsRoot.innerHTML = "";
            cleanupFilterMenus();
            const state = getState();
            const list = state?.root?.children || [];
            const entries = getVisibleEntries(list, null) || list.map((node, index) => ({ node, index }));
            for (const it of entries) {
                elCardsRoot.appendChild(renderNodeCard(it.node, list, it.index, "主Builder", null));
            }
        } finally {
            setIsRenderingCards(false);
        }
        // DOM 重建后重新标记聚焦高亮
        updateFocusCardUI();
        requestAnimationFrame(() => {
            if (prevPositions) applyCardSwapAnimation(prevPositions);
            layoutActionOverflow();
        });
        pendingCardSwapAnim = false;
    }
    function renderParamsEditors(body, node, ownerLabel, options = null) {
        const p = node.params;
        const opts = options || {};
        if (typeof setTipKind === "function") setTipKind(node.kind);
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
                body.appendChild(row("角度", angleInput(p, "deg", rebuildPreviewAndKotlin)));
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
                if (p.useRotate) body.appendChild(row("角度", angleInput(p, "rotateDeg", rebuildPreviewAndKotlin)));
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
                body.appendChild(row("radian", angleInput(p, "radianDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("rotate角度", angleInput(p, "rotateDeg", rebuildPreviewAndKotlin)));
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
                body.appendChild(row("start", angleInput(p, "startDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("end", angleInput(p, "endDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("rotate角度", angleInput(p, "rotateDeg", rebuildPreviewAndKotlin)));
                break;

            case "add_ball":
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
                break;

            case "add_ring":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("thickness", inputNum(p.thickness, v => {
                    p.thickness = v;
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
                break;

            case "add_line":
                body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin, "start")));
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_bezier_curve":
                body.appendChild(row("target.x", inputNum(p.tx, v => {
                    p.tx = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("target.y", inputNum(p.ty, v => {
                    p.ty = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("startHandle.x", inputNum(p.shx, v => {
                    p.shx = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("startHandle.y", inputNum(p.shy, v => {
                    p.shy = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("endHandle.x", inputNum(p.ehx, v => {
                    p.ehx = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("endHandle.y", inputNum(p.ehy, v => {
                    p.ehy = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_bezier":
                body.appendChild(row("p1", makeVec3Editor(p, "p1", rebuildPreviewAndKotlin, "p1")));
                body.appendChild(row("p2", makeVec3Editor(p, "p2", rebuildPreviewAndKotlin, "p2")));
                body.appendChild(row("p3", makeVec3Editor(p, "p3", rebuildPreviewAndKotlin, "p3")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_bezier_4":
                body.appendChild(row("p1", makeVec3Editor(p, "p1", rebuildPreviewAndKotlin, "p1")));
                body.appendChild(row("p2", makeVec3Editor(p, "p2", rebuildPreviewAndKotlin, "p2")));
                body.appendChild(row("p3", makeVec3Editor(p, "p3", rebuildPreviewAndKotlin, "p3")));
                body.appendChild(row("p4", makeVec3Editor(p, "p4", rebuildPreviewAndKotlin, "p4")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_broken_line":
                body.appendChild(row("p1", makeVec3Editor(p, "p1", rebuildPreviewAndKotlin, "p1")));
                body.appendChild(row("p2", makeVec3Editor(p, "p2", rebuildPreviewAndKotlin, "p2")));
                body.appendChild(row("p3", makeVec3Editor(p, "p3", rebuildPreviewAndKotlin, "p3")));
                body.appendChild(row("count1", inputNum(p.count1, v => {
                    p.count1 = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count2", inputNum(p.count2, v => {
                    p.count2 = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_polygon":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("sideCount", inputNum(p.sideCount, v => {
                    p.sideCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
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
                body.appendChild(row("mode", select(
                    [["fixed", "fixed"], ["range", "range"]],
                    p.mode,
                    v => {
                        p.mode = v;
                        renderAll();
                    }
                )));
                if (p.mode === "range") {
                    body.appendChild(row("minCircleCount", inputNum(p.minCircleCount, v => {
                        p.minCircleCount = v;
                        rebuildPreviewAndKotlin();
                    })));
                    body.appendChild(row("maxCircleCount", inputNum(p.maxCircleCount, v => {
                        p.maxCircleCount = v;
                        rebuildPreviewAndKotlin();
                    })));
                } else {
                    body.appendChild(row("preCircleCount", inputNum(p.preCircleCount, v => {
                        p.preCircleCount = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                break;

            case "add_rect":
                body.appendChild(row("w", inputNum(p.w, v => {
                    p.w = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("h", inputNum(p.h, v => {
                    p.h = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("countW", inputNum(p.countW, v => {
                    p.countW = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("countH", inputNum(p.countH, v => {
                    p.countH = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_arc":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("center", makeVec3Editor(p, "c", rebuildPreviewAndKotlin, "center")));
                body.appendChild(row("start", angleInput(p, "startDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("end", angleInput(p, "endDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_lightning_points":
                body.appendChild(row("useStart", checkbox(p.useStart, v => {
                    p.useStart = v;
                    renderAll();
                })));
                if (p.useStart) {
                    body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin, "start")));
                }
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("preLineCount", inputNum(p.preLineCount, v => {
                    p.preLineCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("useOffsetRange", checkbox(p.useOffsetRange, v => {
                    p.useOffsetRange = v;
                    renderAll();
                })));
                if (p.useOffsetRange) {
                    body.appendChild(row("offsetRange", inputNum(p.offsetRange, v => {
                        p.offsetRange = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                break;

            case "add_lightning_nodes":
                body.appendChild(row("useStart", checkbox(p.useStart, v => {
                    p.useStart = v;
                    renderAll();
                })));
                if (p.useStart) {
                    body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin, "start")));
                }
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("useOffsetRange", checkbox(p.useOffsetRange, v => {
                    p.useOffsetRange = v;
                    renderAll();
                })));
                if (p.useOffsetRange) {
                    body.appendChild(row("offsetRange", inputNum(p.offsetRange, v => {
                        p.offsetRange = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                break;

            case "add_lightning_nodes_attenuation":
                body.appendChild(row("useStart", checkbox(p.useStart, v => {
                    p.useStart = v;
                    renderAll();
                })));
                if (p.useStart) {
                    body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin, "start")));
                }
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
                if (p.seedEnabled) {
                    body.appendChild(row("seed值", inputNum(p.seed, v => {
                        p.seed = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                break;

            case "apply_rotate":
                body.appendChild(row("angle", angleInput(p, "angleDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("axis", makeVec3Editor(p, "axis", rebuildPreviewAndKotlin, "axis")));
                body.appendChild(row("rotateAsAxis", checkbox(p.rotateAsAxis, v => {
                    p.rotateAsAxis = v;
                    renderAll();
                })));
                if (p.rotateAsAxis) body.appendChild(row("rotateAxis", makeVec3Editor(p, "rotAxis", rebuildPreviewAndKotlin, "rotateAxis")));
                break;

            case "apply_move":
                body.appendChild(row("offset", makeVec3Editor(p, "off", rebuildPreviewAndKotlin, "offset")));
                break;

            case "apply_rel_move":
                body.appendChild(row("offset", makeVec3Editor(p, "off", rebuildPreviewAndKotlin, "offset")));
                break;

            case "apply_scale":
                body.appendChild(row("scale", inputNum(p.scale, v => {
                    p.scale = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "apply_per_point_offset":
                body.appendChild(row("offset", makeVec3Editor(p, "off", rebuildPreviewAndKotlin, "offset")));
                break;

            case "apply_spiral_offset":
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("height", inputNum(p.h, v => {
                    p.h = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("rotate角度", angleInput(p, "rotateDeg", rebuildPreviewAndKotlin)));
                break;

            case "apply_random_offset":
                body.appendChild(row("min", inputNum(p.offsetLenMin, v => {
                    p.offsetLenMin = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("max", inputNum(p.offsetLenMax, v => {
                    p.offsetLenMax = v;
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
                if (!opts.paramsOnly) {
                    body.appendChild(row("折叠子卡片", checkbox(node.folded, v => {
                        node.folded = v;
                        renderAll();
                    })));
                }
                if (!opts.paramsOnly && !node.folded) {
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
                    const dragHandle = document.createElement("div");
                    dragHandle.className = "handle subblock-handle";
                    dragHandle.textContent = "≡";
                    dragHandle.title = "拖到外部生成 addBuilder";
                    bindAddWithBuilderDrag(dragHandle, node);
                    const titleText = document.createElement("div");
                    titleText.className = "subblock-title-text";
                    titleText.textContent = "子 PointsBuilder（addWith）";
                    title.appendChild(dragHandle);
                    title.appendChild(titleText);

                    const actions = document.createElement("div");
                    actions.className = "mini";

                    const addBtn = document.createElement("button");
                    addBtn.className = "btn small primary";
                    addBtn.textContent = "添加元素";
                    addBtn.addEventListener("click", () => openModal(node.children, (node.children || []).length, "子Builder", node.id));

                    const dragOutBtn = document.createElement("div");
                    dragOutBtn.className = "btn small drag-handle";
                    dragOutBtn.textContent = "拖出Builder";
                    dragOutBtn.setAttribute("role", "button");
                    dragOutBtn.tabIndex = 0;
                    dragOutBtn.title = "拖到外部生成 addBuilder";
                    bindAddWithBuilderDrag(dragOutBtn, node);

                    const { collapseBtn: collapseAllBtn, expandBtn: expandAllBtn } = makeCollapseAllButtons(node.id, () => node.children, true);
                    const filterUi = createFilterControls(node.id, renderCards, true);

                    const offBtn = document.createElement("button");
                    offBtn.className = "btn small";
                    offBtn.textContent = "快捷Offset";
                    offBtn.addEventListener("click", () => addQuickOffsetTo(node.children));

                    const pickBtn = document.createElement("button");
                    pickBtn.className = "btn small";
                    pickBtn.textContent = "XZ拾取直线";
                    pickBtn.dataset.pickLineBtn = "1";
                    pickBtn.addEventListener("click", () => {
                        if (getLinePickMode()) stopLinePick();
                        else {
                            if (getPointPickMode()) stopPointPick();
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
                        setBuilderJsonTargetNode(node);
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
                    actions.appendChild(dragOutBtn);
                    actions.appendChild(collapseAllBtn);
                    actions.appendChild(expandAllBtn);
                    if (filterUi && filterUi.wrap) actions.appendChild(filterUi.wrap);
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
                    const entries = getVisibleEntries(list, node.id) || list.map((node, index) => ({ node, index }));
                    for (const it of entries) {
                        sub.appendChild(renderNodeCard(it.node, list, it.index, "子Builder", node));
                    }

                    block.appendChild(head);
                    block.appendChild(sub);

                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖到这里 → 放进 addWith 子列表（可拖回主列表）";
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
                } else if (!opts.paramsOnly) {
                    const mini = document.createElement("div");
                    mini.className = "mini";
                    const dragOutBtn = document.createElement("div");
                    dragOutBtn.className = "btn small drag-handle";
                    dragOutBtn.textContent = "拖出Builder";
                    dragOutBtn.setAttribute("role", "button");
                    dragOutBtn.tabIndex = 0;
                    dragOutBtn.title = "拖到外部生成 addBuilder";
                    bindAddWithBuilderDrag(dragOutBtn, node);
                    mini.appendChild(dragOutBtn);
                    body.appendChild(mini);

                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖到这里 → 放进 addWith 子列表";
                    bindSubDropZone(zone, node.children, node);
                    body.appendChild(zone);
                }
                break;

            case "add_builder":
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                if (opts.paramsOnly) break;
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

                    // ✅ 内部控制与外部一致：添加元素 / 快捷Offset / XZ拾取直线
                    const addBtn = document.createElement("button");
                    addBtn.className = "btn small primary";
                    addBtn.textContent = "添加元素";
                    addBtn.addEventListener("click", () => openModal(node.children, (node.children || []).length, "子Builder", node.id));

                    const { collapseBtn: collapseAllBtn, expandBtn: expandAllBtn } = makeCollapseAllButtons(node.id, () => node.children, true);
                    const filterUi = createFilterControls(node.id, renderCards, true);

                    const offBtn = document.createElement("button");
                    offBtn.className = "btn small";
                    offBtn.textContent = "快捷Offset";
                    offBtn.addEventListener("click", () => addQuickOffsetTo(node.children));

                    const pickBtn = document.createElement("button");
                    pickBtn.className = "btn small";
                    pickBtn.textContent = "XZ拾取直线";
                    pickBtn.dataset.pickLineBtn = "1";
                    pickBtn.addEventListener("click", () => {
                        if (getLinePickMode()) stopLinePick();
                        else {
                            if (getPointPickMode()) stopPointPick();
                            startLinePick(node.children, "子Builder", (node.children || []).length);
                        }
                    });

                    const exportBtn = document.createElement("button");
                    exportBtn.className = "btn small";
                    exportBtn.textContent = "导出JSON";
                    exportBtn.addEventListener("click", () => {
                        const out = {root: {id: "root", kind: "ROOT", children: deepClone(node.children || [])}};
                        downloadText("addBuilder.json", JSON.stringify(out, null, 2), "application/json");
                    });

                    const importBtn = document.createElement("button");
                    importBtn.className = "btn small";
                    importBtn.textContent = "导入JSON";
                    importBtn.addEventListener("click", () => {
                        if (!fileBuilderJson) return;
                        setBuilderJsonTargetNode(node);
                        fileBuilderJson.click();
                    });

                    const clearBtn = document.createElement("button");
                    clearBtn.className = "btn small danger";
                    clearBtn.textContent = "清空";
                    clearBtn.addEventListener("click", () => {
                        historyCapture("clear_addBuilder");
                        node.children.splice(0);
                        ensureAxisInList(node.children);
                        renderAll();
                    });

                    actions.appendChild(addBtn);
                    actions.appendChild(collapseAllBtn);
                    actions.appendChild(expandAllBtn);
                    if (filterUi && filterUi.wrap) actions.appendChild(filterUi.wrap);
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
                    const entries = getVisibleEntries(list, node.id) || list.map((node, index) => ({ node, index }));
                    for (const it of entries) {
                        sub.appendChild(renderNodeCard(it.node, list, it.index, "子Builder", node));
                    }

                    block.appendChild(head);
                    block.appendChild(sub);

                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖到这里 → 放进 addBuilder 子列表（可拖回主列表）";
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
                    zone.textContent = "拖到这里 → 放进 addBuilder 子列表";
                    bindSubDropZone(zone, node.children, node);
                    body.appendChild(zone);
                }
                break;

            case "add_fourier_series":
                if (!opts.paramsOnly) {
                    body.appendChild(row("折叠", checkbox(node.folded, v => {
                        node.folded = v;
                        renderAll();
                    })));
                }
                body.appendChild(row("angle", angleInput(p, "angle", rebuildPreviewAndKotlin)));
                body.appendChild(row("xOffset", inputNum(p.xOffset, v => {
                    p.xOffset = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("zOffset", inputNum(p.zOffset, v => {
                    p.zOffset = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                if (!opts.paramsOnly && !node.folded) {
                    const sub = document.createElement("div");
                    sub.className = "subcards";
                    const list = node.terms || [];
                    for (let i = 0; i < list.length; i++) {
                        sub.appendChild(renderFourierTermCard(node, i));
                    }
                    body.appendChild(sub);

                    const btn = document.createElement("button");
                    btn.className = "btn small";
                    btn.textContent = "添加 term";
                    btn.addEventListener("click", () => {
                        historyCapture("add_fourier_term");
                        node.terms.push({id: makeUid(), r: 1, w: 1, startAngle: 0, startAngleUnit: "deg", collapsed: false, bodyHeight: null});
                        renderAll();
                    });
                    body.appendChild(btn);
                }
                break;
            default:
                break;
        }
        if (typeof setTipKind === "function") setTipKind(null);
    }

    bindInputTips();
    return {
        renderCards,
        renderParamsEditors,
        layoutActionOverflow,
        initCollapseAllControls,
        setupListDropZone,
        addQuickOffsetTo
    };
}
