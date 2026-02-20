
import { COMMAND_META, newCommand, normalizeCommand, humanFieldName, cloneDefaultCommands } from "./command_meta.js";
import { initPreview } from "./preview.js";
import { genCommandKotlin, genEmitterKotlin } from "./kotlin_gen.js";
import { initSettingsSystem } from "./settings.js";
import { initHotkeysSystem } from "./hotkeys.js";
import { initLayoutSystem } from "./layout.js";
import { clamp, safeNum, escapeHtml, deepCopy, deepAssign } from "./utils.js";
import { InlineCodeEditor, mergeCompletionGroups } from "../../composition_builder/js/code_editor.js?v=20260220_5";
import {
    createDefaultBuilderState,
    normalizeBuilderState,
    evaluateBuilderState,
    countBuilderNodes,
} from "./points_builder_bridge.js";
import {
    createConditionRule,
    normalizeConditionFilter,
    validateBooleanExpr,
} from "./expression_cards.js";
import {
    createEmitterVar,
    createTickAction,
    createDeathVarAction,
    loadEmitterBehavior,
    saveEmitterBehavior,
	normalizeEmitterBehavior,
	isValidEmitterVarName,
} from "./emitter_behavior.js";
import {
	buildDoTickCompletions,
	compileDoTickExpressionSource,
	getDoTickAllowedIdentifiers,
	validateDoTickExpressionSource,
	normalizeDoTickExpression,
} from "./do_tick_expression.js";

(() => {
    const EMITTER_TYPE_META = {
        point: { title: "点 (Point)" },
        box: { title: "盒 (Box)" },
        sphere: { title: "球 (Sphere 体积)" },
        sphere_surface: { title: "球面 (Sphere Surface)" },
        ring: { title: "环 (Ring)" },
        line: { title: "直线 (Line)" },
        circle: { title: "圆 (Circle)" },
        arc: { title: "弧 (Arc)" },
        spiral: { title: "螺旋 (Spiral)" },
        points_builder: { title: "PointsBuilder" },
    };

    const EMITTER_TYPE_LIST = Object.keys(EMITTER_TYPE_META);

    const EMITTER_TIPS = {
        "emitter.type": "发射器形状类型，决定点的分布。",
        "emission.mode": "发射模式：持续/爆发/一次性。",
        "emission.burstInterval": "爆发间隔（秒），必须为 0.05s 的倍数。",
        "externalTemplate": "外放模板参数：生成 Kotlin 时将模板参数提升到 @CodecField 外层。",
        "externalData": "外放数据参数：生成 Kotlin 时将数据参数提升到 @CodecField 外层。",
        "vars.template": "模板变量名（留空自动 templateN）。外放同类型可同名（共享参数），但 template/data 不可重名。",
        "vars.data": "数据变量名（留空自动 dataN）。外放同类型可同名（共享参数），但 template/data 不可重名。",

        "emitter.offset.x": "预览偏移 X（整体平移，不改变形状）。",
        "emitter.offset.y": "预览偏移 Y（整体平移，不改变形状）。",
        "emitter.offset.z": "预览偏移 Z（整体平移，不改变形状）。",

        "particle.colorStart": "生命周期开始颜色（life=0）。",
        "particle.colorEnd": "生命周期结束颜色（life=end）。",
        "particle.lifeMin": "生命周期最小值（tick）。",
        "particle.lifeMax": "生命周期最大值（tick）。",
        "particle.sizeMin": "粒子大小下限（预览点大小）。",
        "particle.sizeMax": "粒子大小上限（预览点大小）。",
        "particle.countMin": "每次发射数量下限。",
        "particle.countMax": "每次发射数量上限。",
        "particle.vel.x": "初始速度方向 X（向量分量）。",
        "particle.vel.y": "初始速度方向 Y（向量分量）。",
        "particle.vel.z": "初始速度方向 Z（向量分量）。",
        "particle.velMode": "初速度方向模式：固定方向 或 按出生点相对发射器方向。",
        "particle.velSpeedMin": "速度倍率下限。",
        "particle.velSpeedMax": "速度倍率上限。",
        "particle.visibleRange": "可见范围（作用于游戏渲染距离）。",

        "template.alpha": "透明度（0~1）。",
        "template.light": "亮度（0~15）。",
        "template.sign": "粒子 sign 标识（用于 Command 过滤）。",
        "template.speedLimit": "速度上限。",
        "template.faceToCamera": "是否始终面向相机。",
        "template.yaw": "手动朝向 yaw（弧度，faceToCamera=false 时生效）。",
        "template.pitch": "手动朝向 pitch（弧度，faceToCamera=false 时生效）。",
        "template.roll": "手动朝向 roll（弧度，faceToCamera=false 时生效）。",

        "emitter.box.x": "盒尺寸 X（宽度）。",
        "emitter.box.y": "盒尺寸 Y（高度）。",
        "emitter.box.z": "盒尺寸 Z（深度）。",
        "emitter.box.density": "体积分布密度（0~1，0=表面）。",
        "emitter.box.surface": "是否仅发射盒表面。",

        "emitter.sphere.r": "球体半径（体积）。",
        "emitter.sphereSurface.r": "球面半径。",

        "emitter.ring.r": "环半径。",
        "emitter.ring.thickness": "环厚度。",
        "emitter.ring.axis.x": "环法线轴 X（会 normalize）。",
        "emitter.ring.axis.y": "环法线轴 Y（会 normalize）。",
        "emitter.ring.axis.z": "环法线轴 Z（会 normalize）。",

        "emitter.line.step": "直线步长（点间距）。",
        "emitter.line.dir.x": "直线方向 X（会 normalize）。",
        "emitter.line.dir.y": "直线方向 Y（会 normalize）。",
        "emitter.line.dir.z": "直线方向 Z（会 normalize）。",

        "emitter.circle.r": "圆半径。",
        "emitter.circle.axis.x": "圆法线轴 X（会 normalize）。",
        "emitter.circle.axis.y": "圆法线轴 Y（会 normalize）。",
        "emitter.circle.axis.z": "圆法线轴 Z（会 normalize）。",

        "emitter.arc.r": "弧半径。",
        "emitter.arc.start": "弧起始角（度）。",
        "emitter.arc.end": "弧结束角（度）。",
        "emitter.arc.rotate": "弧整体旋转（度）。",
        "emitter.arc.axis.x": "弧法线轴 X（会 normalize）。",
        "emitter.arc.axis.y": "弧法线轴 Y（会 normalize）。",
        "emitter.arc.axis.z": "弧法线轴 Z（会 normalize）。",

        "emitter.spiral.startR": "螺旋起始半径。",
        "emitter.spiral.endR": "螺旋结束半径。",
        "emitter.spiral.height": "螺旋高度。",
        "emitter.spiral.rotateSpeed": "螺旋旋转速度（每步角度增量）。",
        "emitter.spiral.rBias": "半径偏向指数（>1 偏向外侧）。",
        "emitter.spiral.hBias": "高度偏向指数（>1 偏向顶部）。",
        "emitter.spiral.axis.x": "螺旋轴 X（会 normalize）。",
        "emitter.spiral.axis.y": "螺旋轴 Y（会 normalize）。",
        "emitter.spiral.axis.z": "螺旋轴 Z（会 normalize）。",
    };

    const uid = () => (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 12);

    const DEFAULT_EMITTER_CARD = {
        externalData: false,
        externalTemplate: false,
        // Kotlin 变量名（留空则使用全局默认名；每卡片作用域隔离）
        vars: {
            template: "",
            data: "",
        },
        ui: { collapsed: false },
        emission: {
            mode: "continuous",
            burstInterval: 0.5,
        },
        emitter: {
            type: "point",
            offset: {x: 0, y: 0, z: 0},
            box: {x: 2, y: 1, z: 2, density: 0.0, surface: false},
            sphere: {r: 2},
            sphereSurface: {r: 2},
            ring: {r: 2.5, thickness: 0.15, axis: {x: 0, y: 1, z: 0}},
            line: {step: 0.2, dir: {x: 1, y: 0, z: 0}},
            circle: {r: 2.5, axis: {x: 0, y: 1, z: 0}},
            arc: {r: 2.5, start: 0, end: 180, rotate: 0, axis: {x: 0, y: 1, z: 0}},
            arcUnit: "deg",
            spiral: {startR: 0.5, endR: 2.5, height: 2.0, rotateSpeed: 0.35, rBias: 1.0, hBias: 1.0, axis: {x: 0, y: 1, z: 0}},
            builderState: createDefaultBuilderState(),
        },
        particle: {
            lifeMin: 40,
            lifeMax: 120,
            sizeMin: 0.08,
            sizeMax: 0.18,
            countMin: 2,
            countMax: 6,
            velMode: "fixed",
            vel: {x: 0, y: 0.15, z: 0},
            velSpeedMin: 1.0,
            velSpeedMax: 1.2,
            visibleRange: 128,
            colorStart: "#4df3ff",
            colorEnd: "#d04dff",
        },
        template: {
            alpha: 1.0,
            light: 15,
            faceToCamera: true,
            yaw: 0.0,
            pitch: 0.0,
            roll: 0.0,
            speedLimit: 32.0,
            sign: 0,
        },
    };

    function makeDefaultEmitterCard() {
        const card = deepCopy(DEFAULT_EMITTER_CARD);
        card.id = uid();
        return card;
    }

    const state = {
        commands: [],
        emitters: [makeDefaultEmitterCard()],
        playing: true,
        autoPaused: false,
        ticksPerSecond: 20,
        fullscreen: false,
        kotlin: {
            varName: "command",
            kRefName: "emitter",
        },
        emitterBehavior: loadEmitterBehavior(),
    };

    const STORAGE_KEY = "pe_state_v2";
    const EGPB_PREFIX = "egpb_";
    const EGPB_STATE_KEY = `${EGPB_PREFIX}pb_state_v1`;
    const EGPB_PROJECT_KEY = `${EGPB_PREFIX}pb_project_name_v1`;
    const EGPB_THEME_KEY = `${EGPB_PREFIX}pb_theme_v2`;
    const EGPB_RETURN_EMITTER_KEY = `${EGPB_PREFIX}return_emitter_v1`;
    const HISTORY_MAX = 80;
    const RAD_TO_DEG = 180 / Math.PI;

    const DEFAULT_BASE_STATE = deepCopy(state);
    let emitterSync = null;
    let commandSync = null;
    const emitterCollapseScope = { active: false, manualOpen: new Set() };
    const commandCollapseScope = { active: false, manualOpen: new Set() };
    let focusedEmitterId = null;
    let focusedCommandId = null;
    const doTickEditorState = {
        editor: null,
        textarea: null,
        compileSource: "",
        compileFn: null,
        compileOk: true,
        compileMessage: "",
    };

    function makeDefaultCommands() {
        return cloneDefaultCommands();
    }

    function buildPersistPayload() {
        return {
            version: 7,
            savedAt: new Date().toISOString(),
            state: {
                commands: deepCopy(state.commands),
                emitters: deepCopy(state.emitters),
                ticksPerSecond: state.ticksPerSecond,
                kotlin: deepCopy(state.kotlin),
                emitterBehavior: deepCopy(state.emitterBehavior),
            }
        };
    }

    let saveTimer = 0;
    function saveNow() {
        try {
            saveEmitterBehavior(state.emitterBehavior);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPersistPayload()));
        } catch (_) {
        }
    }

    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 200);
    }

    function isNumericLiteral(value) {
        const s = String(value ?? "").trim();
        if (!s) return false;
        const n = Number(s);
        return Number.isFinite(n);
    }

    function maybeNumericLiteral(value) {
        if (!isNumericLiteral(value)) return null;
        return Number(String(value).trim());
    }

    function normalizeNumExpr(value, fallback, opts = {}) {
        const raw = String(value ?? "").trim();
        if (raw && !isNumericLiteral(raw)) {
            if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return raw;
            return fallback;
        }

        let out = safeNum(raw === "" ? fallback : raw, fallback);
        if (opts.int) out = Math.trunc(out);
        if (typeof opts.min === "number") out = Math.max(opts.min, out);
        if (typeof opts.max === "number") out = Math.min(opts.max, out);
        if (typeof opts.step === "number" && opts.step > 0) out = Math.round(out / opts.step) * opts.step;
        if (typeof opts.fixed === "number" && opts.fixed >= 0) out = Number(out.toFixed(opts.fixed));
        return out;
    }

    function parseNumOrExprInput(value, fallback = 0) {
        const raw = String(value ?? "").trim();
        if (!raw) return fallback;
        if (isNumericLiteral(raw)) return Number(raw);
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return raw;
        return fallback;
    }

    function sanitizeEmitterCard(card) {
        if (!card || typeof card !== "object") return;

        card.externalData = !!card.externalData;
        card.externalTemplate = !!card.externalTemplate;


        // UI 状态（折叠/展开）
        if (!card.ui || typeof card.ui !== "object") card.ui = { collapsed: false };
        card.ui.collapsed = !!card.ui.collapsed;

        // Kotlin 变量名（可选）
        if (!card.vars || typeof card.vars !== "object") card.vars = { template: "", data: "" };
        card.vars.template = String(card.vars.template ?? "").trim();
        card.vars.data = String(card.vars.data ?? "").trim();

        const emission = card.emission || (card.emission = {});
        emission.mode = (emission.mode === "burst" || emission.mode === "once") ? emission.mode : "continuous";
        emission.burstInterval = normalizeNumExpr(emission.burstInterval, 0.5, { min: 0.05, step: 0.05, fixed: 4 });

        const emitter = card.emitter || (card.emitter = {});
        emitter.type = EMITTER_TYPE_META[emitter.type] ? emitter.type : "point";
        emitter.offset = emitter.offset || {x: 0, y: 0, z: 0};
        emitter.offset.x = normalizeNumExpr(emitter.offset.x, 0);
        emitter.offset.y = normalizeNumExpr(emitter.offset.y, 0);
        emitter.offset.z = normalizeNumExpr(emitter.offset.z, 0);

        emitter.box = emitter.box || {x: 2, y: 1, z: 2, density: 0.0, surface: false};
        emitter.box.x = normalizeNumExpr(emitter.box.x, 2.0, { min: 0.001 });
        emitter.box.y = normalizeNumExpr(emitter.box.y, 1.0, { min: 0.001 });
        emitter.box.z = normalizeNumExpr(emitter.box.z, 2.0, { min: 0.001 });
        emitter.box.density = normalizeNumExpr(emitter.box.density, 0.0, { min: 0, max: 1 });
        emitter.box.surface = !!emitter.box.surface;

        emitter.sphere = emitter.sphere || {r: 2};
        emitter.sphere.r = normalizeNumExpr(emitter.sphere.r, 2.0, { min: 0.001 });

        emitter.sphereSurface = emitter.sphereSurface || {r: 2};
        emitter.sphereSurface.r = normalizeNumExpr(emitter.sphereSurface.r, 2.0, { min: 0.001 });

        emitter.ring = emitter.ring || {r: 2.5, thickness: 0.15, axis: {x: 0, y: 1, z: 0}};
        emitter.ring.r = normalizeNumExpr(emitter.ring.r, 2.5, { min: 0.001 });
        emitter.ring.thickness = normalizeNumExpr(emitter.ring.thickness, 0.15, { min: 0 });
        emitter.ring.axis = emitter.ring.axis || {x: 0, y: 1, z: 0};
        emitter.ring.axis.x = normalizeNumExpr(emitter.ring.axis.x, 0);
        emitter.ring.axis.y = normalizeNumExpr(emitter.ring.axis.y, 1);
        emitter.ring.axis.z = normalizeNumExpr(emitter.ring.axis.z, 0);

        emitter.line = emitter.line || {step: 0.2, dir: {x: 1, y: 0, z: 0}};
        emitter.line.step = normalizeNumExpr(emitter.line.step, 0.2, { min: 0.0001 });
        emitter.line.dir = emitter.line.dir || {x: 1, y: 0, z: 0};
        emitter.line.dir.x = normalizeNumExpr(emitter.line.dir.x, 1);
        emitter.line.dir.y = normalizeNumExpr(emitter.line.dir.y, 0);
        emitter.line.dir.z = normalizeNumExpr(emitter.line.dir.z, 0);

        emitter.circle = emitter.circle || {r: 2.5, axis: {x: 0, y: 1, z: 0}};
        emitter.circle.r = normalizeNumExpr(emitter.circle.r, 2.5, { min: 0.001 });
        emitter.circle.axis = emitter.circle.axis || {x: 0, y: 1, z: 0};
        emitter.circle.axis.x = normalizeNumExpr(emitter.circle.axis.x, 0);
        emitter.circle.axis.y = normalizeNumExpr(emitter.circle.axis.y, 1);
        emitter.circle.axis.z = normalizeNumExpr(emitter.circle.axis.z, 0);

        emitter.arc = emitter.arc || {r: 2.5, start: 0, end: 180, rotate: 0, axis: {x: 0, y: 1, z: 0}};
        emitter.arc.r = normalizeNumExpr(emitter.arc.r, 2.5, { min: 0.001 });
        emitter.arc.start = normalizeNumExpr(emitter.arc.start, 0);
        emitter.arc.end = normalizeNumExpr(emitter.arc.end, 180);
        emitter.arc.rotate = normalizeNumExpr(emitter.arc.rotate, 0);
        emitter.arc.axis = emitter.arc.axis || {x: 0, y: 1, z: 0};
        emitter.arc.axis.x = normalizeNumExpr(emitter.arc.axis.x, 0);
        emitter.arc.axis.y = normalizeNumExpr(emitter.arc.axis.y, 1);
        emitter.arc.axis.z = normalizeNumExpr(emitter.arc.axis.z, 0);
        emitter.arcUnit = "deg";

        emitter.spiral = emitter.spiral || {startR: 0.5, endR: 2.5, height: 2.0, rotateSpeed: 0.35, rBias: 1.0, hBias: 1.0, axis: {x: 0, y: 1, z: 0}};
        emitter.spiral.startR = normalizeNumExpr(emitter.spiral.startR, 0.5, { min: 0.001 });
        emitter.spiral.endR = normalizeNumExpr(emitter.spiral.endR, 2.5, { min: 0.001 });
        emitter.spiral.height = normalizeNumExpr(emitter.spiral.height, 2.0);
        emitter.spiral.rotateSpeed = normalizeNumExpr(emitter.spiral.rotateSpeed, 0.35);
        emitter.spiral.rBias = normalizeNumExpr(emitter.spiral.rBias, 1.0, { min: 0.01 });
        emitter.spiral.hBias = normalizeNumExpr(emitter.spiral.hBias, 1.0, { min: 0.01 });
        emitter.spiral.axis = emitter.spiral.axis || {x: 0, y: 1, z: 0};
        emitter.spiral.axis.x = normalizeNumExpr(emitter.spiral.axis.x, 0);
        emitter.spiral.axis.y = normalizeNumExpr(emitter.spiral.axis.y, 1);
        emitter.spiral.axis.z = normalizeNumExpr(emitter.spiral.axis.z, 0);
        emitter.builderState = normalizeBuilderState(emitter.builderState);

        const particle = card.particle || (card.particle = {});
        particle.lifeMin = normalizeNumExpr(particle.lifeMin, 40, { min: 1 });
        particle.lifeMax = normalizeNumExpr(particle.lifeMax, 120, { min: 1 });
        particle.sizeMin = normalizeNumExpr(particle.sizeMin, 0.08, { min: 0.001 });
        particle.sizeMax = normalizeNumExpr(particle.sizeMax, 0.18, { min: 0.001 });
        particle.countMin = normalizeNumExpr(particle.countMin, 2, { min: 0 });
        particle.countMax = normalizeNumExpr(particle.countMax, 6, { min: 0 });
        particle.velMode = (particle.velMode === "spawn_rel") ? "spawn_rel" : "fixed";
        particle.vel = particle.vel || {x: 0, y: 0.15, z: 0};
        particle.vel.x = normalizeNumExpr(particle.vel.x, 0);
        particle.vel.y = normalizeNumExpr(particle.vel.y, 0.15);
        particle.vel.z = normalizeNumExpr(particle.vel.z, 0);
        particle.velSpeedMin = normalizeNumExpr(particle.velSpeedMin, 1.0, { min: 0 });
        particle.velSpeedMax = normalizeNumExpr(particle.velSpeedMax, 1.2, { min: 0 });
        particle.visibleRange = normalizeNumExpr(particle.visibleRange, 128, { min: 1 });
        particle.colorStart = (particle.colorStart || "#4df3ff").trim();
        particle.colorEnd = (particle.colorEnd || "#d04dff").trim();

        const lifeMinN = maybeNumericLiteral(particle.lifeMin);
        const lifeMaxN = maybeNumericLiteral(particle.lifeMax);
        if (lifeMinN != null && lifeMaxN != null && lifeMaxN < lifeMinN) particle.lifeMax = lifeMinN;

        const sizeMinN = maybeNumericLiteral(particle.sizeMin);
        const sizeMaxN = maybeNumericLiteral(particle.sizeMax);
        if (sizeMinN != null && sizeMaxN != null && sizeMaxN < sizeMinN) particle.sizeMax = sizeMinN;

        const countMinN = maybeNumericLiteral(particle.countMin);
        const countMaxN = maybeNumericLiteral(particle.countMax);
        if (countMinN != null && countMaxN != null && countMaxN < countMinN) particle.countMax = countMinN;

        const vMinN = maybeNumericLiteral(particle.velSpeedMin);
        const vMaxN = maybeNumericLiteral(particle.velSpeedMax);
        if (vMinN != null && vMaxN != null && vMaxN < vMinN) particle.velSpeedMax = vMinN;
    


        const template = card.template || (card.template = {});
        template.alpha = normalizeNumExpr(template.alpha, 1.0, { min: 0, max: 1 });
        template.light = normalizeNumExpr(template.light, 15, { int: true, min: 0, max: 15 });
        template.faceToCamera = (template.faceToCamera !== false);
        template.yaw = normalizeNumExpr(template.yaw, 0.0);
        template.pitch = normalizeNumExpr(template.pitch, 0.0);
        template.roll = normalizeNumExpr(template.roll, 0.0);
        template.speedLimit = normalizeNumExpr(template.speedLimit, 32.0, { min: 0.01 });
        template.sign = normalizeNumExpr(template.sign, 0, { int: true });
    }

    function normalizeEmitterCard(raw, fallbackId) {
        const card = deepCopy(DEFAULT_EMITTER_CARD);
        if (raw && typeof raw === "object") {
            if (raw.emission) deepAssign(card.emission, raw.emission);
            if (raw.emitter) deepAssign(card.emitter, raw.emitter);
            if (raw.particle) deepAssign(card.particle, raw.particle);
            if (raw.template) deepAssign(card.template, raw.template);
            if (raw.vars) deepAssign(card.vars, raw.vars);
            if (raw.ui) deepAssign(card.ui, raw.ui);
            if (raw.externalData !== undefined) card.externalData = !!raw.externalData;
            if (raw.externalTemplate !== undefined) card.externalTemplate = !!raw.externalTemplate;
        }
        card.id = (raw && raw.id) ? raw.id : (fallbackId || uid());
        if (raw && raw.emitter && raw.emitter.arcUnit && raw.emitter.arcUnit !== "deg" && card.emitter.arc) {
            const a0 = maybeNumericLiteral(card.emitter.arc.start);
            const a1 = maybeNumericLiteral(card.emitter.arc.end);
            const ar = maybeNumericLiteral(card.emitter.arc.rotate);
            if (a0 != null) card.emitter.arc.start = a0 * RAD_TO_DEG;
            if (a1 != null) card.emitter.arc.end = a1 * RAD_TO_DEG;
            if (ar != null) card.emitter.arc.rotate = ar * RAD_TO_DEG;
        }
        if (card.particle.velSpeedMin === undefined && card.particle.velSpeed !== undefined) {
            const v = Number(card.particle.velSpeed) || 0;
            card.particle.velSpeedMin = v;
            card.particle.velSpeedMax = v;
        }
        sanitizeEmitterCard(card);
        return card;
    }

    function applyLoadedState(s) {
        if (!s || typeof s !== "object") return false;

        if (typeof s.ticksPerSecond === "number") state.ticksPerSecond = s.ticksPerSecond;
        if (s.kotlin) deepAssign(state.kotlin, s.kotlin);
        if (s.emitterBehavior) state.emitterBehavior = normalizeEmitterBehavior(s.emitterBehavior);
        if (Array.isArray(s.emitters) && s.emitters.length) {
            state.emitters = s.emitters.map((em, idx) => normalizeEmitterCard(em, `em_${idx}`));
        } else if (s.emitter || s.particle || s.emission) {
            state.emitters = [normalizeEmitterCard({
                emitter: s.emitter,
                particle: s.particle,
                emission: s.emission,
                externalData: s.externalData,
            }, "em_0")];
        } else {
            state.emitters = [makeDefaultEmitterCard()];
        }
        if (!state.emitters.length) state.emitters = [makeDefaultEmitterCard()];

        const cmds = Array.isArray(s.commands) ? s.commands : [];
        const norm = cmds.map(normalizeCommand).filter(Boolean);
        state.commands = norm;
        state.commands.forEach((cmd) => sanitizeCommandLifeFilter(cmd));

        if (!state.commands.length) {
            state.commands = makeDefaultCommands();
            state.commands.forEach((cmd) => sanitizeCommandLifeFilter(cmd));
        }
        return true;
    }

    function loadPersisted() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const obj = JSON.parse(raw);
            if (obj && typeof obj === "object") {
                if (obj.state) return applyLoadedState(obj.state);
                return applyLoadedState(obj);
            }
        } catch (_) {
        }
        return false;
    }

    function getEmitterById(id) {
        if (!id) return null;
        return state.emitters.find((it) => it.id === id) || null;
    }

    function getEmitterIndexById(id) {
        if (!id) return -1;
        return state.emitters.findIndex((it) => it.id === id);
    }

    function getEmitterBuilderStats(card) {
        const builderState = normalizeBuilderState(card?.emitter?.builderState);
        const built = evaluateBuilderState(builderState);
        return {
            builderState,
            nodeCount: countBuilderNodes(builderState?.root?.children || []),
            pointCount: Array.isArray(built?.points) ? built.points.length : 0,
        };
    }

    function readEmitterBuilderSandboxState() {
        try {
            const raw = localStorage.getItem(EGPB_STATE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return normalizeBuilderState(parsed?.state || parsed);
        } catch (err) {
            console.warn("read emitter builder state failed:", err);
            return null;
        }
    }

    function seedEmitterBuilderSandbox(card) {
        if (!card) return;
        const idx = getEmitterIndexById(card.id);
        const projectName = (idx >= 0) ? `emitter_${idx + 1}` : "emitter_shape";
        const theme = String(document.body?.getAttribute("data-theme") || "dark-1");
        try {
            localStorage.setItem(EGPB_STATE_KEY, JSON.stringify({
                state: normalizeBuilderState(card?.emitter?.builderState),
                ts: Date.now(),
            }));
            localStorage.setItem(EGPB_PROJECT_KEY, projectName);
            localStorage.setItem(EGPB_THEME_KEY, theme);
        } catch (err) {
            console.warn("seed emitter builder sandbox failed:", err);
        }
    }

    function openEmitterBuilderEditor(cardId) {
        const card = getEmitterById(cardId);
        if (!card) return;
        seedEmitterBuilderSandbox(card);
        saveNow();
        const q = new URLSearchParams({
            emit: card.id,
            return: "../../generator.html",
            t: String(Date.now()),
        });
        window.location.href = `./assets/emitter_generator/pointsbuilder.html?${q.toString()}`;
    }

    function consumeEmitterBuilderReturnState() {
        let emitterId = "";
        try {
            emitterId = String(localStorage.getItem(EGPB_RETURN_EMITTER_KEY) || "").trim();
            if (!emitterId) return null;
            localStorage.removeItem(EGPB_RETURN_EMITTER_KEY);
        } catch {
            return null;
        }
        const card = getEmitterById(emitterId) || state.emitters[0] || null;
        const builderState = readEmitterBuilderSandboxState();
        if (!card || !builderState) return null;
        card.emitter.type = "points_builder";
        card.emitter.builderState = builderState;
        sanitizeEmitterCard(card);
        return card.id;
    }

    function importEmitterBuilderJson(cardId) {
        const card = getEmitterById(cardId);
        if (!card) return;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.onchange = async () => {
            const file = input.files && input.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                card.emitter.type = "points_builder";
                card.emitter.builderState = normalizeBuilderState(parsed?.state || parsed);
                sanitizeEmitterCard(card);
                cardHistory.push();
                renderEmitterList();
                scheduleSave();
                autoGenKotlin();
                if (preview) preview.resetEmission();
                toast("PointsBuilder JSON 导入成功", "success");
            } catch (err) {
                toast(`PointsBuilder JSON 导入失败: ${err?.message || err}`, "error");
            }
        };
        input.click();
    }

    function exportEmitterBuilderJson(cardId) {
        const card = getEmitterById(cardId);
        if (!card) return;
        const idx = getEmitterIndexById(card.id);
        const builderState = normalizeBuilderState(card?.emitter?.builderState);
        const filename = `emitter_${Math.max(1, idx + 1)}.pointsbuilder.json`;
        downloadText(filename, JSON.stringify(builderState, null, 2), "application/json");
        toast("PointsBuilder JSON 已导出", "success");
    }

    function clearEmitterBuilder(cardId) {
        const card = getEmitterById(cardId);
        if (!card) return;
        if (!confirm("确定清空该发射器的 PointsBuilder 形状？")) return;
        card.emitter.type = "points_builder";
        card.emitter.builderState = createDefaultBuilderState();
        sanitizeEmitterCard(card);
        cardHistory.push();
        renderEmitterList();
        scheduleSave();
        autoGenKotlin();
        if (preview) preview.resetEmission();
        toast("已清空 PointsBuilder 形状", "success");
    }

    const KOTLIN_TAB_KEY = "pe_kotlin_tab_v1";
    const KOTLIN_HEIGHT_KEY = "pe_kotlin_height_v1";
    const PREVIEW_HEIGHT_KEY = "pe_preview_height_v1";
    const CONFIG_PAGE_KEY = "pe_cfg_page_v2";
    let activeKotlinTab = "command";
    const kotlinCache = { command: "", emitter: "" };

    function toast(msg, type = "info") {
        const text = String(msg ?? "").trim();
        if (!text) return;
        let root = document.getElementById("toastRoot");
        if (!root) {
            root = document.createElement("div");
            root.id = "toastRoot";
            root.className = "toast-root";
            document.body.appendChild(root);
        }
        const el = document.createElement("div");
        el.className = `toast ${type || "info"}`;
        el.textContent = text;
        root.appendChild(el);
        setTimeout(() => {
            el.remove();
            if (!root.childElementCount) root.remove();
        }, 2200);
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

    function setKotlinOut(kind, text) {
        const el = (kind === "emitter")
            ? document.getElementById("kotlinOutEmitter")
            : document.getElementById("kotlinOutCmd");
        if (!el) return;
        const raw = String(text ?? "");
        kotlinCache[kind] = raw;
        const hl = window.CodeHighlighter && typeof window.CodeHighlighter.highlightKotlin === "function"
            ? window.CodeHighlighter.highlightKotlin
            : null;
        if (hl) el.innerHTML = hl(raw);
        else el.textContent = raw;
    }

    function autoGenKotlin() {
        readBaseForm();
        ensureEmitterBehaviorState();
        state.emitters.forEach(sanitizeEmitterCard);
        state.commands.forEach((cmd) => sanitizeCommandLifeFilter(cmd));
        const cmdText = genCommandKotlin(state);
        const emitterText = genEmitterKotlin(state);
        setKotlinOut("command", cmdText);
        setKotlinOut("emitter", emitterText);
    }
    globalThis.autoGenKotlin = autoGenKotlin;

    function copyKotlin() {
        const kind = (activeKotlinTab === "emitter") ? "emitter" : "command";
        if (!kotlinCache[kind]) autoGenKotlin();
        const text = kotlinCache[kind] || "";
        if (!text) return;

        const fallback = () => {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand("copy");
                toast("已复制", "success");
            } catch {
                toast("复制失败", "error");
            }
            ta.remove();
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                () => toast("已复制", "success"),
                () => fallback()
            );
        } else {
            fallback();
        }
    }

    function applyKotlinTab(tab) {
        const next = (tab === "emitter") ? "emitter" : "command";
        activeKotlinTab = next;
        try {
            localStorage.setItem(KOTLIN_TAB_KEY, next);
        } catch {}

        document.querySelectorAll(".kotlin-tab").forEach((el) => {
            el.classList.toggle("active", el.dataset && el.dataset.tab === next);
        });
        const cmd = document.getElementById("kotlinOutCmd");
        const emit = document.getElementById("kotlinOutEmitter");
        if (cmd) cmd.classList.toggle("hidden", next !== "command");
        if (emit) emit.classList.toggle("hidden", next !== "emitter");
    }

    function initKotlinTabs() {
        const tabs = Array.from(document.querySelectorAll(".kotlin-tab"));
        if (!tabs.length) return;
        let saved = "";
        try { saved = localStorage.getItem(KOTLIN_TAB_KEY) || ""; } catch {}
        if (saved !== "command" && saved !== "emitter") {
            const cur = tabs.find(t => t.classList.contains("active"));
            saved = (cur && cur.dataset && cur.dataset.tab) ? cur.dataset.tab : "command";
        }
        applyKotlinTab(saved);
        tabs.forEach((btn) => {
            btn.addEventListener("click", () => applyKotlinTab(btn.dataset.tab));
        });
    }

    function applyConfigPage(tab) {
        const next = (tab === "kotlin" || tab === "tick" || tab === "death") ? tab : "emitters";
        try {
            localStorage.setItem(CONFIG_PAGE_KEY, next);
        } catch {}

        document.querySelectorAll(".config-tab").forEach((el) => {
            el.classList.toggle("active", el.dataset && el.dataset.cfgTab === next);
        });
        const pageMap = {
            emitters: document.getElementById("cfgPageEmitters"),
            kotlin: document.getElementById("cfgPageKotlin"),
            tick: document.getElementById("cfgPageTick"),
            death: document.getElementById("cfgPageDeath"),
        };
        Object.keys(pageMap).forEach((key) => {
            const el = pageMap[key];
            if (!el) return;
            el.classList.toggle("active", key === next);
        });
    }

    function initConfigPages() {
        const tabs = Array.from(document.querySelectorAll(".config-tab"));
        if (!tabs.length) return;
        applyConfigPage("emitters");
        tabs.forEach((btn) => {
            btn.addEventListener("click", () => applyConfigPage(btn.dataset.cfgTab));
        });
    }

    function initPreviewResizer() {
        const resizer = document.getElementById("previewResizer");
        const previewWrap = document.getElementById("viewportWrap");
        const kotlinBody = document.getElementById("kotlinBody");
        const panel = document.querySelector(".panel.center");
        if (!resizer || !previewWrap || !kotlinBody || !panel) return;
        if (initPreviewResizer._bound) return;
        initPreviewResizer._bound = true;

        const stored = Number(localStorage.getItem(PREVIEW_HEIGHT_KEY));
        if (Number.isFinite(stored) && stored > 0) {
            previewWrap.style.height = `${stored}px`;
        }

        let raf = 0;
        const scheduleResize = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                raf = 0;
                if (preview) preview.resizeRenderer();
            });
        };

        resizer.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const startY = e.clientY;
            const startH = previewWrap.getBoundingClientRect().height;
            const panelH = panel.getBoundingClientRect().height;
            const curKotlin = kotlinBody.getBoundingClientRect().height;
            const otherH = panelH - startH - curKotlin;
            const minPreview = 240;
            const minKotlin = 180;
            const maxPreview = Math.max(minPreview, panelH - otherH - minKotlin);

            const onMove = (ev) => {
                const dy = ev.clientY - startY;
                let next = startH + dy;
                next = Math.min(maxPreview, Math.max(minPreview, next));
                previewWrap.style.height = `${next}px`;
                scheduleResize();
            };
            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("resizing-preview");
                const h = previewWrap.getBoundingClientRect().height;
                if (Number.isFinite(h)) {
                    try { localStorage.setItem(PREVIEW_HEIGHT_KEY, String(Math.round(h))); } catch {}
                }
                scheduleResize();
            };

            document.body.classList.add("resizing-preview");
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }

    function initKotlinResizer() {
        const resizer = document.getElementById("kotlinResizer");
        const previewWrap = document.getElementById("viewportWrap");
        const kotlinBody = document.getElementById("kotlinBody");
        const panel = document.querySelector(".panel.center");
        if (!resizer || !previewWrap || !kotlinBody || !panel) return;
        if (initKotlinResizer._bound) return;
        initKotlinResizer._bound = true;

        const stored = Number(localStorage.getItem(KOTLIN_HEIGHT_KEY));
        if (Number.isFinite(stored) && stored > 0) {
            kotlinBody.style.height = `${stored}px`;
            kotlinBody.style.flex = "0 0 auto";
        }

        let raf = 0;
        const scheduleResize = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                raf = 0;
                if (preview) preview.resizeRenderer();
            });
        };

        resizer.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const startY = e.clientY;
            const startH = kotlinBody.getBoundingClientRect().height;
            const panelH = panel.getBoundingClientRect().height;
            const curPreview = previewWrap.getBoundingClientRect().height;
            const otherH = panelH - startH - curPreview;
            const minPreview = 240;
            const minKotlin = 180;
            const maxKotlin = Math.max(minKotlin, panelH - otherH - minPreview);

            const onMove = (ev) => {
                const dy = ev.clientY - startY;
                let next = startH + dy;
                next = Math.min(maxKotlin, Math.max(minKotlin, next));
                kotlinBody.style.height = `${next}px`;
                kotlinBody.style.flex = "0 0 auto";
                scheduleResize();
            };
            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("resizing-code");
                const h = kotlinBody.getBoundingClientRect().height;
                if (Number.isFinite(h)) {
                    try { localStorage.setItem(KOTLIN_HEIGHT_KEY, String(Math.round(h))); } catch {}
                }
                scheduleResize();
            };

            document.body.classList.add("resizing-code");
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }

    function shouldIgnoreArrowPan() {
        const ae = document.activeElement;
        if (ae) {
            const tag = (ae.tagName || "").toUpperCase();
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
            if (ae.isContentEditable) return true;
        }
        const settingsModal = document.getElementById("settingsModal");
        if (settingsModal && !settingsModal.classList.contains("hidden")) return true;
        const hkModal = document.getElementById("hkModal");
        if (hkModal && !hkModal.classList.contains("hidden")) return true;
        return false;
    }

    function setFullscreen(enabled) {
        const on = !!enabled;
        const wrap = document.getElementById("viewportWrap");
        const btnFull = document.getElementById("btnFull");
        const btnExit = document.getElementById("btnExitFull");
        state.fullscreen = on;
        document.body.classList.toggle("fullscreen-lock", on);
        if (wrap) wrap.classList.toggle("isFull", on);
        if (btnFull) btnFull.style.display = on ? "none" : "";
        if (btnExit) btnExit.style.display = on ? "" : "none";
        if (on && wrap && wrap.requestFullscreen) {
            wrap.requestFullscreen().catch(() => {});
        } else if (!on && document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
        if (preview) preview.resizeRenderer();
    }

    function importStateJson() {
        const input = document.getElementById("importJsonFile");
        if (input) input.click();
    }

    async function exportStateJson() {
        readBaseForm();
        const payload = buildPersistPayload();
        const text = JSON.stringify(payload, null, 2);
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: "particle_emitter.json",
                    types: [{ description: "JSON", accept: {"application/json": [".json"]} }]
                });
                const writable = await handle.createWritable();
                await writable.write(text);
                await writable.close();
                toast("保存成功", "success");
                return;
            } catch (e) {
                if (e && e.name === "AbortError") {
                    toast("取消保存", "error");
                    return;
                }
                console.warn("showSaveFilePicker failed:", e);
                toast(`保存失败：${e.message || e}`, "error");
                return;
            }
        }
        try {
            downloadText("particle_emitter.json", text, "application/json");
            toast("保存成功", "success");
        } catch (e) {
            toast(`保存失败：${e.message || e}`, "error");
        }
    }

    function importStateFromText(text) {
        let obj;
        try {
            obj = JSON.parse(text);
        } catch (e) {
            toast(`导入失败-格式错误(${e.message || e})`, "error");
            return;
        }
        const raw = (obj && typeof obj === "object" && obj.state) ? obj.state : obj;
        if (!applyLoadedState(raw)) {
            toast("导入失败-格式错误", "error");
            return;
        }
        applyStateToForm();
        if (typeof renderEmitterSyncMenu === "function") renderEmitterSyncMenu();
        if (typeof renderCommandSyncMenu === "function") renderCommandSyncMenu();
        autoGenKotlin();
        cardHistory.init();
        scheduleSave();
        if (preview) preview.resetEmission();
        toast("导入成功", "success");
    }

    function resetAllToDefault() {
        if (!confirm("确定重置全部配置？")) return;
        state.commands = makeDefaultCommands();
        state.emitters = [makeDefaultEmitterCard()];
        state.ticksPerSecond = DEFAULT_BASE_STATE.ticksPerSecond;
        state.kotlin = deepCopy(DEFAULT_BASE_STATE.kotlin);
        state.emitterBehavior = normalizeEmitterBehavior(null);
        if (typeof clearEmitterSyncTargets === "function") clearEmitterSyncTargets();
        if (typeof clearCommandSyncTargets === "function") clearCommandSyncTargets();
        applyStateToForm();
        if (typeof renderEmitterSyncMenu === "function") renderEmitterSyncMenu();
        if (typeof renderCommandSyncMenu === "function") renderCommandSyncMenu();
        autoGenKotlin();
        cardHistory.init();
        scheduleSave();
        if (preview) preview.resetEmission();
        toast("已重置", "success");
    }

    function setEmitterSection($card, type) {
        if (!$card || !$card.length) return;
        const t = EMITTER_TYPE_META[type] ? type : "point";
        $card.find(".emitSection").removeClass("active");
        $card.find(`.emitSection[data-emit="${t}"]`).addClass("active");
    }

    function setEmissionSection($card, mode) {
        if (!$card || !$card.length) return;
        const m = (mode === "burst") ? "burst" : (mode === "once" ? "once" : "continuous");
        $card.find(".emission-field").removeClass("active");
        $card.find(`.emission-field[data-emission="${m}"]`).addClass("active");
    }


function setFaceToCameraSection($card, faceToCamera) {
    if (!$card || !$card.length) return;
    const on = (faceToCamera !== false);
    $card.find(".face-field").removeClass("active");
    if (!on) $card.find('.face-field[data-face="manual"]').addClass("active");
}

function setVelocitySection($card, mode) {
    if (!$card || !$card.length) return;
    const m = (mode === "spawn_rel") ? "spawn_rel" : "fixed";
    $card.find(".vel-field").removeClass("active");
    $card.find(`.vel-field[data-vel="${m}"]`).addClass("active");
}



    function getEmitterTypeLabel(type) {
        const meta = EMITTER_TYPE_META[type];
        return (meta && meta.title) ? meta.title : (type || "未命名");
    }

    function ensureEmitterBehaviorState() {
        state.emitterBehavior = normalizeEmitterBehavior(state.emitterBehavior);
    }

    const COND_LINK_OPTS = [
        ["and", "且"],
        ["or", "或"],
    ];
    const COND_CMP_OPTS = [
        [">", ">"],
        [">=", ">="],
        ["<", "<"],
        ["<=", "<="],
        ["calc_eq", "计算"],
        ["==", "=="],
        ["!=", "!="],
    ];
    const CALC_MATH_OPTS = [
        ["+", "+"],
        ["-", "-"],
        ["*", "*"],
        ["/", "/"],
        ["%", "%"],
    ];
    const CALC_VALUE_MODE_OPTS = [
        ["box", "框"],
        ["expr", "表达式"],
    ];
    function buildCalcTermTypeOptions(includeRespawn = true) {
        const opts = [
            ["number", "常量"],
            ["var", "变量"],
            ["age", "age"],
            ["maxAge", "maxAge"],
            ["sign", "sign"],
        ];
        if (includeRespawn) opts.push(["respawnCount", "respawnCount"]);
        opts.push(["tick", "tick"]);
        return opts;
    }
    const CALC_RESULT_MODE_OPTS = [
        ["fixed", "固定值"],
        ["calc", "计算值"],
    ];
    const CALC_RESULT_CMP_OPTS = [
        ["==", "=="],
        ["!=", "!="],
        [">", ">"],
        [">=", ">="],
        ["<", "<"],
        ["<=", "<="],
    ];
    const REASON_OPTS = [
        ["AGE", "AGE"],
        ["COLLISION", "COLLISION"],
        ["OUT_OF_RANGE", "OUT_OF_RANGE"],
        ["MANUAL", "MANUAL"],
        ["UNKNOWN", "UNKNOWN"],
    ];
    const ACTION_OPTS = [
        ["set", "="],
        ["add", "+="],
        ["sub", "-="],
        ["mul", "*="],
        ["div", "/="],
        ["inc", "++"],
        ["dec", "--"],
    ];
    const ACTION_VALUE_TYPES_TICK = [
        ["number", "常量"],
        ["var", "变量"],
        ["tick", "tick"],
    ];
    const ACTION_VALUE_TYPES_DEATH = [
        ["number", "常量"],
        ["var", "变量"],
        ["age", "age"],
        ["maxAge", "maxAge"],
        ["sign", "sign"],
        ["respawnCount", "respawnCount"],
    ];
    const TICK_COND_LEFT_OPTS = [
        ["tick", "tick"],
        ["var", "变量"],
    ];
    const TICK_COND_RIGHT_OPTS = [
        ["number", "常量"],
        ["var", "变量"],
        ["tick", "tick"],
    ];

    function getEmitterVarNames() {
        ensureEmitterBehaviorState();
        const vars = Array.isArray(state.emitterBehavior?.emitterVars) ? state.emitterBehavior.emitterVars : [];
        const out = [];
        const seen = new Set();
        for (const it of vars) {
            const name = String(it?.name || "").trim();
            if (!name) continue;
            if (!isValidEmitterVarName(name)) continue;
            if (seen.has(name)) continue;
            seen.add(name);
            out.push(name);
        }
        return out;
    }

    function buildDoTickApiDts(behavior) {
        const allowed = getDoTickAllowedIdentifiers(behavior);
        const declared = new Set();
        const lines = [];
        const declareConst = (name, type = "any") => {
            const id = String(name || "").trim();
            if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(id)) return;
            if (declared.has(id)) return;
            declared.add(id);
            lines.push(`declare const ${id}: ${type};`);
        };

        declareConst("Math", "Math");
        declareConst("PI", "number");
        declareConst("tick", "number");
        declareConst("setVar", "(name: string, value: number) => number");
        declareConst("getVar", "(name: string, fallback?: number) => number");
        declareConst("hasVar", "(name: string) => boolean");
        declareConst("addVar", "(name: string, value: number) => number");
        declareConst("subVar", "(name: string, value: number) => number");
        declareConst("mulVar", "(name: string, value: number) => number");
        declareConst("divVar", "(name: string, value: number) => number");
        declareConst("incVar", "(name: string) => number");
        declareConst("decVar", "(name: string) => number");
        declareConst("clampVar", "(name: string, min: number, max: number) => number");
        declareConst("rand", "(min: number, max?: number) => number");
        declareConst("randInt", "(min: number, max?: number) => number");
        declareConst("clamp", "(value: number, min: number, max: number) => number");
        declareConst("min", "typeof Math.min");
        declareConst("max", "typeof Math.max");
        declareConst("abs", "typeof Math.abs");
        declareConst("floor", "typeof Math.floor");
        declareConst("ceil", "typeof Math.ceil");
        declareConst("round", "typeof Math.round");
        declareConst("trunc", "typeof Math.trunc");
        declareConst("pow", "typeof Math.pow");
        declareConst("sqrt", "typeof Math.sqrt");
        declareConst("sin", "typeof Math.sin");
        declareConst("cos", "typeof Math.cos");
        declareConst("tan", "typeof Math.tan");
        declareConst("log", "typeof Math.log");
        declareConst("exp", "typeof Math.exp");
        declareConst("sign", "typeof Math.sign");

        for (const name of Array.from(allowed).sort((a, b) => a.localeCompare(b))) {
            declareConst(name, "any");
        }

        return `${lines.join("\n")}\n`;
    }

    function buildDoTickEditorLibs(behavior) {
        return [
            {
                id: "do-tick-api",
                name: "__do_tick_api__.d.ts",
                content: buildDoTickApiDts(behavior),
                enabled: true
            }
        ];
    }

    function disposeDoTickExpressionEditor() {
        if (doTickEditorState.editor) {
            try {
                doTickEditorState.editor.dispose();
            } catch (_) {
            }
        }
        doTickEditorState.editor = null;
        doTickEditorState.textarea = null;
    }

    function updateDoTickCompileStatusUi(ok, message) {
        doTickEditorState.compileOk = !!ok;
        doTickEditorState.compileMessage = String(message || "");
        const el = document.getElementById("tickExpressionCompileState");
        if (!el) return;
        el.classList.remove("ok", "error");
        el.classList.add(ok ? "ok" : "error");
        el.textContent = String(message || "");
    }

    function syncDoTickCompiledToPreview() {
        if (!preview || typeof preview.setDoTickCompiled !== "function") return;
        preview.setDoTickCompiled({
            source: doTickEditorState.compileSource,
            fn: doTickEditorState.compileFn,
        });
    }

    function compileDoTickExpressionFromState(opts = {}) {
        ensureEmitterBehaviorState();
        const source = normalizeDoTickExpression(state.emitterBehavior?.tickExpression || "");
        const result = compileDoTickExpressionSource(source, state.emitterBehavior);
        if (result.ok) {
            doTickEditorState.compileSource = result.source;
            doTickEditorState.compileFn = result.fn;
            updateDoTickCompileStatusUi(
                true,
                source ? "已编译并应用（失焦后生效）" : "doTick 为空：不会执行脚本。"
            );
        } else {
            doTickEditorState.compileSource = "";
            doTickEditorState.compileFn = null;
            updateDoTickCompileStatusUi(false, `编译失败：${result.message}`);
            if (opts.showToast) toast(`doTick 编译失败：${result.message}`, "error");
        }
        syncDoTickCompiledToPreview();
        return result;
    }

    function applyDoTickExpressionFromEditor(opts = {}) {
        ensureEmitterBehaviorState();
        const textarea = doTickEditorState.textarea;
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        const prevSource = normalizeDoTickExpression(state.emitterBehavior?.tickExpression || "");
        const draft = String(textarea.value || "");
        const result = compileDoTickExpressionSource(draft, state.emitterBehavior);
        if (!result.ok) {
            updateDoTickCompileStatusUi(false, `编译失败：${result.message}`);
            if (opts.showToast !== false) toast(`doTick 编译失败：${result.message}`, "error");
            textarea.value = prevSource;
            if (doTickEditorState.editor) {
                doTickEditorState.editor.renderHighlight();
                doTickEditorState.editor.runValidation();
            }
            return false;
        }

        state.emitterBehavior.tickExpression = result.source;
        doTickEditorState.compileSource = result.source;
        doTickEditorState.compileFn = result.fn;
        updateDoTickCompileStatusUi(
            true,
            result.source ? "已编译并应用（失焦后生效）" : "doTick 为空：不会执行脚本。"
        );
        syncDoTickCompiledToPreview();

        if (result.source !== prevSource) {
            scheduleHistoryPush();
            scheduleSave();
            autoGenKotlin();
        }
        return true;
    }

    function mountDoTickExpressionEditor() {
        const textarea = document.getElementById("tickExpressionInput");
        disposeDoTickExpressionEditor();
        if (!(textarea instanceof HTMLTextAreaElement)) return;
        ensureDoTickEditorHeightStyle();

        const completions = mergeCompletionGroups(buildDoTickCompletions(state.emitterBehavior));
        const validate = (source) => validateDoTickExpressionSource(source, state.emitterBehavior);
        const libs = buildDoTickEditorLibs(state.emitterBehavior);
        const editor = new InlineCodeEditor({
            textarea,
            title: "doTick 表达式（JS）",
            completions,
            validate,
            libs,
            showToolbar: false
        });
        applyDoTickEditorHeight(editor, textarea);
        doTickEditorState.editor = editor;
        doTickEditorState.textarea = textarea;
    }

    function applyDoTickEditorHeight(editor, textarea) {
        const isMobile = window.matchMedia && window.matchMedia("(max-width: 980px)").matches;
        const bodyHeight = isMobile ? 360 : 440;
        const shellHeight = isMobile ? 400 : 480;
        const fieldMinHeight = isMobile ? 460 : 540;
        const sourceMin = isMobile ? 280 : 320;
        try {
            textarea.style.minHeight = `${sourceMin}px`;
        } catch {}
        const fieldEl = textarea.closest(".tick-expression-field");
        if (fieldEl) {
            fieldEl.style.minHeight = `${fieldMinHeight}px`;
        }
        if (editor && editor.shellEl) {
            editor.shellEl.style.minHeight = `${shellHeight}px`;
            editor.shellEl.style.height = `${shellHeight}px`;
            editor.shellEl.style.maxHeight = `${shellHeight}px`;
        }
        if (editor && editor.bodyEl) {
            editor.bodyEl.style.minHeight = `${bodyHeight}px`;
            editor.bodyEl.style.height = `${bodyHeight}px`;
            editor.bodyEl.style.maxHeight = `${bodyHeight}px`;
        }
        if (editor && editor.monacoHostEl) {
            editor.monacoHostEl.style.minHeight = `${bodyHeight}px`;
            editor.monacoHostEl.style.height = `${bodyHeight}px`;
            editor.monacoHostEl.style.maxHeight = `${bodyHeight}px`;
        }
        const relayout = () => {
            try {
                if (editor && editor.editor && typeof editor.editor.layout === "function") {
                    editor.editor.layout();
                }
            } catch {}
        };
        requestAnimationFrame(relayout);
        setTimeout(relayout, 80);
    }

    const DOTICK_HEIGHT_STYLE_ID = "egpb-dotick-height-force";
    function ensureDoTickEditorHeightStyle() {
        try {
            if (document.getElementById(DOTICK_HEIGHT_STYLE_ID)) return;
            const style = document.createElement("style");
            style.id = DOTICK_HEIGHT_STYLE_ID;
            style.textContent = `
#tickActionList .tick-expression-field .editor-shell,
#tickActionList .tick-expression-field .editor-shell.editor-shell-compact {
  min-height: 400px !important;
}
#tickActionList .tick-expression-field .editor-body,
#tickActionList .tick-expression-field .editor-shell.editor-shell-compact .editor-body {
  min-height: 400px !important;
  height: 440px !important;
  max-height: 440px !important;
}
#tickActionList .tick-expression-field textarea#tickExpressionInput {
  min-height: 320px !important;
}
@media (max-width: 980px) {
  #tickActionList .tick-expression-field .editor-shell,
  #tickActionList .tick-expression-field .editor-shell.editor-shell-compact {
    min-height: 320px !important;
  }
  #tickActionList .tick-expression-field .editor-body,
  #tickActionList .tick-expression-field .editor-shell.editor-shell-compact .editor-body {
    min-height: 320px !important;
    height: 360px !important;
    max-height: 360px !important;
  }
  #tickActionList .tick-expression-field textarea#tickExpressionInput {
    min-height: 260px !important;
  }
}`;
            document.head.appendChild(style);
        } catch {}
    }

    function renderOptions(opts, selected) {
        const sel = String(selected ?? "");
        return (opts || []).map(([v, label]) => {
            const vv = String(v);
            const ss = (vv === sel) ? " selected" : "";
            return `<option value="${escapeHtml(vv)}"${ss}>${escapeHtml(String(label))}</option>`;
        }).join("");
    }

    function renderVarNameOptions(names, selected) {
        const opts = [];
        if (!Array.isArray(names) || !names.length) {
            opts.push(["", "(无可用变量)"]);
        } else {
            for (const name of names) opts.push([name, name]);
        }
        return renderOptions(opts, selected);
    }

    function refreshVarSelect($select, names) {
        if (!$select || !$select.length) return;
        const cur = String($select.val() || "");
        $select.html(renderVarNameOptions(names, cur));
        if (cur && names.includes(cur)) $select.val(cur);
    }

    function conditionSourceLabel(value) {
        const v = String(value || "");
        if (v === "number") return "常量";
        if (v === "var") return "变量";
        if (v === "life") return "maxAge";
        return v || "";
    }

    function encodeConditionSourceSelection(typeRaw, valueRaw) {
        const type = String(typeRaw || "").trim();
        if (!type) return "";
        if (type === "var") {
            const name = String(valueRaw || "").trim();
            return name ? `var:${name}` : "";
        }
        if (type === "life") return "maxAge";
        return type;
    }

    function decodeConditionSourceSelection(selectionRaw, side = "left") {
        const raw = String(selectionRaw || "").trim();
        if (!raw) {
            return side === "right"
                ? { type: "number", value: "" }
                : { type: "age", value: "" };
        }
        if (raw.startsWith("var:")) {
            return { type: "var", value: raw.slice(4).trim() };
        }
        if (raw === "life") return { type: "maxAge", value: "" };
        return { type: raw, value: "" };
    }

    function buildConditionSourceOptions(values, names, selectedRaw) {
        const opts = [];
        const seen = new Set();
        const selected = String(selectedRaw || "");
        const varNames = Array.isArray(names) ? names : [];
        for (const vRaw of (values || [])) {
            const v = String(vRaw || "").trim();
            if (!v) continue;
            if (v === "var") {
                for (const nameRaw of varNames) {
                    const name = String(nameRaw || "").trim();
                    if (!name) continue;
                    const key = `var:${name}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    opts.push([key, name]);
                }
                continue;
            }
            if (seen.has(v)) continue;
            seen.add(v);
            opts.push([v, conditionSourceLabel(v)]);
        }
        if (selected.startsWith("var:") && !seen.has(selected)) {
            const name = selected.slice(4).trim();
            if (name) opts.push([selected, `${name} (变量)`]);
        }
        if (!opts.length) opts.push(["number", "常量"]);
        return opts;
    }

    function renderConditionSourceOptions(values, names, selected) {
        return renderOptions(buildConditionSourceOptions(values, names, selected), selected);
    }

    function getConditionOptValuesFromRow($row, side) {
        if (!$row || !$row.length) return [];
        const key = (side === "right") ? "rightOptValues" : "leftOptValues";
        const raw = String($row.attr(`data-${key}`) || "").trim();
        if (raw) return raw.split("|").map((it) => String(it || "").trim()).filter(Boolean);
        const allowReason = String($row.data("allow-reason") || "") === "1";
        const includeRespawn = String($row.data("include-respawn") || "1") === "1";
        const fallback = side === "right"
            ? conditionRightOptions({ allowReason, includeRespawn })
            : conditionLeftOptions({ allowReason, includeRespawn });
        return fallback.map(([v]) => String(v));
    }

    function refreshConditionRowSourceSelects($row, names) {
        if (!$row || !$row.length) return;
        const leftVals = getConditionOptValuesFromRow($row, "left");
        const rightVals = getConditionOptValuesFromRow($row, "right");
        const $left = $row.find(".ruleLeftVar");
        const $right = $row.find(".ruleRightVar");
        const leftCur = String($left.val() || "");
        const rightCur = String($right.val() || "");
        $left.html(renderConditionSourceOptions(leftVals, names, leftCur));
        $right.html(renderConditionSourceOptions(rightVals, names, rightCur));
        if (leftCur) $left.val(leftCur);
        if (rightCur) $right.val(rightCur);
    }

    function refreshConditionRowVarBindings($row, names) {
        if (!$row || !$row.length) return;
        refreshConditionRowSourceSelects($row, names);
        [
            "calcLeftTerm",
            "calcRightTerm",
            "calcFixedTerm",
            "calcExpectLeftTerm",
            "calcExpectRightTerm",
        ].forEach((prefix) => refreshVarSelect($row.find(`.${prefix}Var`), names));
        const includeRespawn = String($row.data("include-respawn") || "1") === "1";
        const hintVars = ["age", "maxAge", "sign", ...(includeRespawn ? ["respawnCount"] : []), "tick", ...names].join(", ");
        $row.find(".calcExprHint").text(`可用变量: ${hintVars}`);
        refreshConditionRowVisibility($row);
    }

    function refreshAllVarBindings() {
        const names = getEmitterVarNames();
        $("#cmdList .expr-rule-row, #tickActionList .expr-rule-row, #deathConditionList .expr-rule-row").each((_, el) => {
            refreshConditionRowVarBindings($(el), names);
        });
        $("#tickActionList .actionVar, #tickActionList .actionValueVar, #deathVarActionList .actionVar, #deathVarActionList .actionValueVar").each((_, el) => {
            refreshVarSelect($(el), names);
        });
    }

    function calcBuiltinLabel(type) {
        if (type === "age" || type === "maxAge" || type === "sign" || type === "respawnCount" || type === "tick") {
            return type;
        }
        if (type === "life") {
            return "maxAge";
        }
        return "";
    }

    function renderCalcTerm(prefix, typeRaw, valueRaw, names, placeholder = "常量", includeRespawn = true) {
        const type = String(typeRaw || "number");
        const numVal = (type === "number")
            ? String(Number.isFinite(Number(valueRaw)) ? Number(valueRaw) : 0)
            : "0";
        const varVal = (type === "var") ? String(valueRaw || "") : "";
        const builtin = calcBuiltinLabel(type);
        return `
<div class="calc-term ${escapeHtml(prefix)}">
  <select class="input exprInput calcTermType ${escapeHtml(prefix)}Type">${renderOptions(buildCalcTermTypeOptions(includeRespawn), type)}</select>
  <input class="input exprInput calcTermNum ${escapeHtml(prefix)}Num" type="text" inputmode="decimal" value="${escapeHtml(numVal)}" placeholder="${escapeHtml(placeholder)}"/>
  <select class="input exprInput calcTermVar ${escapeHtml(prefix)}Var">${renderVarNameOptions(names, varVal)}</select>
  <span class="calcTermBuiltin ${escapeHtml(prefix)}Builtin">${escapeHtml(builtin)}</span>
</div>`;
    }

    function readCalcTermFromRow($row, prefix) {
        const type = String($row.find(`.${prefix}Type`).val() || "number");
        if (type === "number") {
            return { type, value: safeNum($row.find(`.${prefix}Num`).val(), 0) };
        }
        if (type === "var") {
            return { type, value: String($row.find(`.${prefix}Var`).val() || "").trim() };
        }
        return { type, value: 0 };
    }

    function refreshCalcTermVisibility($row, prefix) {
        const type = String($row.find(`.${prefix}Type`).val() || "number");
        const $num = $row.find(`.${prefix}Num`);
        const $var = $row.find(`.${prefix}Var`);
        const $tag = $row.find(`.${prefix}Builtin`);
        $num.toggle(type === "number");
        $var.toggle(type === "var");
        const label = calcBuiltinLabel(type);
        $tag.toggle(!!label).text(label);
    }

    function conditionLeftOptions(opts = {}) {
        const allowReason = !!opts.allowReason;
        const includeRespawn = opts.includeRespawn !== false;
        const base = [
            ["age", "age"],
            ["maxAge", "maxAge"],
            ["sign", "sign"],
            ["var", "变量"],
        ];
        if (includeRespawn) base.push(["respawnCount", "respawnCount"]);
        if (allowReason) base.push(["reason", "reason"]);
        return base;
    }

    function conditionRightOptions(opts = {}) {
        const allowReason = !!opts.allowReason;
        const includeRespawn = opts.includeRespawn !== false;
        const base = [
            ["number", "常量"],
            ["var", "变量"],
            ["age", "age"],
            ["maxAge", "maxAge"],
            ["sign", "sign"],
        ];
        if (includeRespawn) base.push(["respawnCount", "respawnCount"]);
        if (allowReason) base.push(["reason", "reason"]);
        return base;
    }

    function renderConditionRuleRow(rule, index, names, allowReason, rowClass, delClass, includeRespawn = true, leftOpts = null, rightOpts = null) {
        const row = createConditionRule(rule, { allowReason: !!allowReason });
        const leftOptValues = (leftOpts || conditionLeftOptions({ allowReason, includeRespawn })).map(([v]) => String(v));
        const rightOptValues = (rightOpts || conditionRightOptions({ allowReason, includeRespawn })).map(([v]) => String(v));
        const linkSel = renderOptions(COND_LINK_OPTS, row.link);
        const leftSel = renderConditionSourceOptions(leftOptValues, names, encodeConditionSourceSelection(row.left, row.leftVar));
        const cmpSel = renderOptions(COND_CMP_OPTS, row.op);
        const rightSel = renderConditionSourceOptions(rightOptValues, names, encodeConditionSourceSelection(row.right, row.rightValue));
        const rightNum = (row.right === "number")
            ? String(row.rightValue ?? 0)
            : "0";
        const rightReason = (row.right === "reason")
            ? String(row.rightValue || "AGE")
            : "AGE";
        const calcValueMode = String(row.calcValueMode || "box");
        const calcResultMode = String(row.calcResultMode || "fixed");
        const calcResultCmp = String(row.calcResultCmp || "==");
        const calcBooleanExpr = String(row.calcBooleanExpr || "");
        const calcOp = String(row.calcMathOp || "-");
        const calcCOp = String(row.calcExpectMathOp || "+");
        const leftTerm = { type: String(row.calcLeftTermType || "age"), value: row.calcLeftTermValue ?? 0 };
        const rightTerm = { type: String(row.calcRightTermType || "number"), value: row.calcRightTermValue ?? 0 };
        const fixedTerm = { type: String(row.calcFixedTermType || "number"), value: row.calcFixedTermValue ?? 0 };
        const expectLeftTerm = { type: String(row.calcExpectLeftTermType || "number"), value: row.calcExpectLeftTermValue ?? 0 };
        const expectRightTerm = { type: String(row.calcExpectRightTermType || "number"), value: row.calcExpectRightTermValue ?? 0 };
        const hintVars = ["age", "maxAge", "sign", ...(includeRespawn ? ["respawnCount"] : []), "tick", ...names].join(", ");
        return `
<div class="expr-rule-row ${escapeHtml(rowClass)}" data-id="${escapeHtml(row.id)}" data-index="${index}" data-allow-reason="${allowReason ? "1" : "0"}" data-include-respawn="${includeRespawn ? "1" : "0"}" data-left-opt-values="${escapeHtml(leftOptValues.join("|"))}" data-right-opt-values="${escapeHtml(rightOptValues.join("|"))}">
  <div class="rule-main-line">
    <select class="input exprInput ruleLink" data-key="link">${linkSel}</select>
    <div class="rule-left-wrap">
      <select class="input exprInput ruleLeftVar ruleLeftSource" data-key="leftSource">${leftSel}</select>
    </div>
    <select class="input exprInput ruleOp" data-key="op">${cmpSel}</select>
    <div class="rule-right-wrap">
      <select class="input exprInput ruleRightVar ruleRightSource" data-key="rightSource">${rightSel}</select>
      <input class="input exprInput ruleRightNum" data-key="rightValueNumber" type="number" step="0.1" value="${escapeHtml(rightNum)}"/>
      <select class="input exprInput ruleRightReason" data-key="rightValueReason">${renderOptions(REASON_OPTS, rightReason)}</select>
    </div>
  </div>
  <div class="calc-eq-row">
    <div class="calc-mode-row">
      <label>计算方式</label>
      <select class="input exprInput calcValueMode" data-key="calcValueMode">${renderOptions(CALC_VALUE_MODE_OPTS, calcValueMode)}</select>
    </div>
    <div class="calc-box-inline">
      <div class="small calcFormHint">框模式顺序: [左值] [运算] [右值] [比较] [目标]</div>
      <div class="calc-chain">
        <div class="calc-slot calc-slot-term">
          <div class="calc-slot-label">左值</div>
          ${renderCalcTerm("calcLeftTerm", leftTerm.type, leftTerm.value, names, "左值常量", includeRespawn)}
        </div>
        <div class="calc-slot calc-slot-op">
          <div class="calc-slot-label">运算</div>
          <select class="input exprInput calcEqOp calcMainOp" data-key="calcMathOp">${renderOptions(CALC_MATH_OPTS, calcOp)}</select>
        </div>
        <div class="calc-slot calc-slot-term">
          <div class="calc-slot-label">右值</div>
          ${renderCalcTerm("calcRightTerm", rightTerm.type, rightTerm.value, names, "右值常量", includeRespawn)}
        </div>
        <div class="calc-slot calc-slot-cmp">
          <div class="calc-slot-label">比较</div>
          <select class="input exprInput calcResultCmp" data-key="calcResultCmp">${renderOptions(CALC_RESULT_CMP_OPTS, calcResultCmp)}</select>
        </div>
        <div class="calc-slot calc-slot-target-mode">
          <div class="calc-slot-label">目标模式</div>
          <select class="input exprInput calcResultMode" data-key="calcResultMode">${renderOptions(CALC_RESULT_MODE_OPTS, calcResultMode)}</select>
        </div>
        <div class="calc-slot calc-slot-target calc-fixed-term-wrap">
          <div class="calc-slot-label">固定结果</div>
          ${renderCalcTerm("calcFixedTerm", fixedTerm.type, fixedTerm.value, names, "固定结果", includeRespawn)}
        </div>
        <div class="calc-slot calc-slot-target calc-result-calc-inline">
          <div class="calc-slot-label">计算结果</div>
          <div class="calc-target-chain">
            ${renderCalcTerm("calcExpectLeftTerm", expectLeftTerm.type, expectLeftTerm.value, names, "结果左值", includeRespawn)}
            <select class="input exprInput calcEqCOp calcExpectOp" data-key="calcExpectMathOp">${renderOptions(CALC_MATH_OPTS, calcCOp)}</select>
            ${renderCalcTerm("calcExpectRightTerm", expectRightTerm.type, expectRightTerm.value, names, "结果右值", includeRespawn)}
          </div>
        </div>
      </div>
    </div>
    <div class="calc-expr-inline">
      <div class="calc-slot-label">布尔表达式</div>
      <input class="input exprInput calcBooleanExpr" data-key="calcBooleanExpr" type="text" value="${escapeHtml(calcBooleanExpr)}" placeholder="布尔表达式，例如: (tick % 20) == 0 && maxAge > 5"/>
      <div class="small calcExprHint">可用变量: ${escapeHtml(hintVars)}</div>
      <div class="small calcExprError"></div>
    </div>
  </div>
  <button class="btn small ${escapeHtml(delClass)}" type="button">删除</button>
</div>`;
    }

    function refreshConditionRowVisibility($scope) {
        const leftParsed = decodeConditionSourceSelection($scope.find(".ruleLeftVar").val(), "left");
        const rightParsed = decodeConditionSourceSelection($scope.find(".ruleRightVar").val(), "right");
        const left = leftParsed.type;
        let right = rightParsed.type;
        const op = String($scope.find(".ruleOp").val() || ">=");
        const idx = Number($scope.data("index") || 0);
        const allowReason = String($scope.data("allow-reason") || "") === "1";
        const reasonCompare = allowReason && (left === "reason" || right === "reason");
        const hasCalcPayload = String($scope.find(".calcBooleanExpr").val() || "").trim().length > 0
            || String($scope.find(".calcValueMode").val() || "box") !== "box"
            || [
                "calcLeftTermType",
                "calcRightTermType",
                "calcFixedTermType",
                "calcExpectLeftTermType",
                "calcExpectRightTermType",
            ].some((cls) => String($scope.find(`.${cls}`).val() || "number") !== "number");
        const useCalcEq = (op === "calc_eq")
            || (op === "==" && !reasonCompare)
            || (!reasonCompare && hasCalcPayload && ![">", ">=", "<", "<=", "!="].includes(op));
        const calcValueMode = String($scope.find(".calcValueMode").val() || "box");
        const calcResultMode = String($scope.find(".calcResultMode").val() || "fixed");
        if (useCalcEq && !reasonCompare && op === "==") {
            $scope.find(".ruleOp").val("calc_eq");
        }

        if (!useCalcEq && allowReason && left === "reason" && right !== "reason") {
            right = "reason";
            $scope.find(".ruleRightVar").val("reason");
        }

        const showMainLine = true;
        const $ruleLink = $scope.find(".ruleLink");
        const $mainLine = $scope.find(".rule-main-line");
        $mainLine.toggle(showMainLine);
        $mainLine.toggleClass("first-row", idx <= 0);
        $mainLine.toggleClass("calc-link-only", useCalcEq);
        $mainLine.toggleClass("calc-first-row", useCalcEq && idx <= 0);
        if (idx > 0) {
            $ruleLink.show();
            $ruleLink.css("visibility", "visible");
            $ruleLink.prop("disabled", false);
        } else {
            $ruleLink.hide();
            $ruleLink.css("visibility", "hidden");
            $ruleLink.prop("disabled", true);
        }
        $scope.find(".rule-left-wrap, .rule-right-wrap, .ruleLeftVar, .ruleRightVar, .ruleRightNum, .ruleRightReason").toggle(!useCalcEq);
        $scope.find(".ruleOp").show();
        $scope.find(".calc-eq-row").toggleClass("is-visible", useCalcEq);

        const rightHasExtra = !useCalcEq && (right === "number" || right === "reason");
        $scope.toggleClass("right-has-extra", rightHasExtra);
        $scope.find(".ruleRightNum").toggle(!useCalcEq && right === "number");
        $scope.find(".ruleRightReason").toggle(!useCalcEq && right === "reason");

        $scope.find(".calc-mode-row").toggle(useCalcEq);
        $scope.find(".calc-box-inline").toggle(useCalcEq && calcValueMode === "box");
        $scope.find(".calc-expr-inline").toggle(useCalcEq && calcValueMode === "expr");
        $scope.find(".calc-fixed-term-wrap").toggle(useCalcEq && calcValueMode === "box" && calcResultMode !== "calc");
        $scope.find(".calc-result-calc-inline").toggle(useCalcEq && calcValueMode === "box" && calcResultMode === "calc");
        const $calcExpr = $scope.find(".calcBooleanExpr");
        const $calcErr = $scope.find(".calcExprError");
        if (useCalcEq && calcValueMode === "expr") {
            const expr = String($calcExpr.val() || "").trim();
            const check = validateBooleanExpr(expr);
            if (!check.ok) {
                $calcExpr.addClass("is-invalid");
                $calcErr.text(`表达式错误：${check.error}，将按 false 处理`).show();
            } else {
                $calcExpr.removeClass("is-invalid");
                $calcErr.hide().text("");
            }
        } else {
            $calcExpr.removeClass("is-invalid");
            $calcErr.hide().text("");
        }

        ["calcLeftTerm", "calcRightTerm", "calcFixedTerm", "calcExpectLeftTerm", "calcExpectRightTerm"].forEach((prefix) => {
            refreshCalcTermVisibility($scope, prefix);
        });

        if (!useCalcEq && allowReason && (left === "reason" || right === "reason")) {
            if (op !== "==" && op !== "!=") $scope.find(".ruleOp").val("==");
        }
    }

    function readConditionRulesFromDom($container) {
        const out = [];
        $container.find(".expr-rule-row").each((idx, el) => {
            const $row = $(el);
            const allowReason = String($row.data("allow-reason") || "") === "1";
            const leftParsed = decodeConditionSourceSelection($row.find(".ruleLeftVar").val(), "left");
            const rightParsed = decodeConditionSourceSelection($row.find(".ruleRightVar").val(), "right");
            const left = leftParsed.type;
            const right = rightParsed.type;
            let op = String($row.find(".ruleOp").val() || ">=");
            const reasonCompare = allowReason && (left === "reason" || right === "reason");
            if (!reasonCompare && op === "==") op = "calc_eq";
            const calcValueMode = String($row.find(".calcValueMode").val() || "box");
            const calcResultMode = String($row.find(".calcResultMode").val() || "fixed");
            const calcMathOp = String($row.find(".calcMainOp").val() || "-");
            const calcExpectMathOp = String($row.find(".calcExpectOp").val() || "+");
            const leftTerm = readCalcTermFromRow($row, "calcLeftTerm");
            const rightTerm = readCalcTermFromRow($row, "calcRightTerm");
            const fixedTerm = readCalcTermFromRow($row, "calcFixedTerm");
            const expectLeftTerm = readCalcTermFromRow($row, "calcExpectLeftTerm");
            const expectRightTerm = readCalcTermFromRow($row, "calcExpectRightTerm");
            const rule = createConditionRule({
                id: String($row.data("id") || ""),
                link: String($row.find(".ruleLink").val() || "and"),
                left,
                leftVar: (left === "var") ? leftParsed.value : "",
                op,
                right,
                rightValue: 0,
                calcValueMode,
                calcLeftExpr: "",
                calcMathOp,
                calcRightExpr: "",
                calcExpectExpr: "",
                calcBooleanExpr: String($row.find(".calcBooleanExpr").val() || ""),
                calcResultMode,
                calcResultCmp: String($row.find(".calcResultCmp").val() || "=="),
                calcExpectLeftExpr: "",
                calcExpectMathOp,
                calcExpectRightExpr: "",
                calcLeftTermType: leftTerm.type,
                calcLeftTermValue: leftTerm.value,
                calcRightTermType: rightTerm.type,
                calcRightTermValue: rightTerm.value,
                calcFixedTermType: fixedTerm.type,
                calcFixedTermValue: fixedTerm.value,
                calcExpectLeftTermType: expectLeftTerm.type,
                calcExpectLeftTermValue: expectLeftTerm.value,
                calcExpectRightTermType: expectRightTerm.type,
                calcExpectRightTermValue: expectRightTerm.value,
            }, { allowReason });

            if (rule.right === "number") {
                rule.rightValue = safeNum($row.find(".ruleRightNum").val(), 0);
            } else if (rule.right === "var") {
                rule.rightValue = String(rightParsed.value || "").trim();
            } else if (rule.right === "reason") {
                rule.rightValue = String($row.find(".ruleRightReason").val() || "AGE");
            } else {
                rule.rightValue = 0;
            }
            rule.link = idx === 0 ? "and" : rule.link;
            out.push(rule);
        });
        return out;
    }

    function renderActionRow(action, names, valueTypes, rowClass, delClass, opts = {}) {
        const a = createTickAction();
        Object.assign(a, action || {});
        const opSel = renderOptions(ACTION_OPTS, a.op);
        const typeSel = renderOptions(valueTypes, a.valueType);
        const valNum = String(Number.isFinite(Number(a.value)) ? Number(a.value) : 0);
        const valVar = String(typeof a.value === "string" ? a.value : "");
        const withCondition = !!opts.withCondition;
        const cond = normalizeConditionFilter(a.condition, { allowReason: false });
        const condRows = (Array.isArray(cond.rules) ? cond.rules : []).map((r, idx) =>
            renderConditionRuleRow(
                r,
                idx,
                names,
                false,
                "tickCondRule",
                "btnDelTickCondRule",
                false,
                TICK_COND_LEFT_OPTS,
                TICK_COND_RIGHT_OPTS
            )
        ).join("");
        const condHtml = withCondition ? `
  <div class="expr-action-cond${cond.enabled ? "" : " is-disabled"}">
    <div class="expr-action-cond-head">
      <label>条件</label>
      <select class="input exprInput tickCondEnabled" data-key="condition.enabled">
        <option value="true"${cond.enabled ? " selected" : ""}>true</option>
        <option value="false"${cond.enabled ? "" : " selected"}>false</option>
      </select>
      <button class="btn small btnAddTickCondRule" type="button">➕ 添加条件</button>
    </div>
    <div class="expr-action-cond-body">
      <div class="expr-rule-list tickCondRuleList">${condRows || `<div class="small">暂无条件卡片。</div>`}</div>
    </div>
  </div>` : "";
        return `
<div class="expr-action-row ${escapeHtml(rowClass)}" data-id="${escapeHtml(a.id)}">
  <select class="input exprInput actionVar" data-key="varName">${renderVarNameOptions(names, a.varName)}</select>
  <select class="input exprInput actionOp" data-key="op">${opSel}</select>
  <select class="input exprInput actionType" data-key="valueType">${typeSel}</select>
  <input class="input exprInput actionValueNum" data-key="valueNumber" type="number" step="0.1" value="${escapeHtml(valNum)}"/>
  <select class="input exprInput actionValueVar" data-key="valueVar">${renderVarNameOptions(names, valVar)}</select>
  <button class="btn small ${escapeHtml(delClass)}" type="button">删除</button>
  ${condHtml}
</div>`;
    }

    function refreshActionConditionVisibility($scope) {
        const $cond = $scope.find(".expr-action-cond");
        if (!$cond.length) return;
        const enabled = String($scope.find(".tickCondEnabled").val() || "false") === "true";
        $cond.toggleClass("is-disabled", !enabled);
    }

    function refreshActionRowVisibility($scope) {
        const op = String($scope.find(".actionOp").val() || "set");
        const valueType = String($scope.find(".actionType").val() || "number");
        const hasValue = (op !== "inc" && op !== "dec");
        $scope.find(".actionType").toggle(hasValue);
        $scope.find(".actionValueNum").toggle(hasValue && valueType === "number");
        $scope.find(".actionValueVar").toggle(hasValue && valueType === "var");
        refreshActionConditionVisibility($scope);
        $scope.find(".tickCondRuleList .expr-rule-row").each((_, el) => refreshConditionRowVisibility($(el)));
    }

    function readActionFromRow($row) {
        const action = createTickAction();
        action.id = String($row.data("id") || action.id);
        action.varName = String($row.find(".actionVar").val() || "").trim();
        action.op = String($row.find(".actionOp").val() || "set");
        if (action.op === "inc" || action.op === "dec") {
            action.valueType = "number";
            action.value = 1;
        } else {
            action.valueType = String($row.find(".actionType").val() || "number");
            if (action.valueType === "number") {
                action.value = safeNum($row.find(".actionValueNum").val(), 0);
            } else if (action.valueType === "var") {
                action.value = String($row.find(".actionValueVar").val() || "").trim();
            } else {
                action.value = 0;
            }
        }
        const $condEnabled = $row.find(".tickCondEnabled");
        const $condList = $row.find(".tickCondRuleList");
        if ($condEnabled.length && $condList.length) {
            action.condition = normalizeConditionFilter({
                enabled: String($condEnabled.val() || "false") === "true",
                rules: readConditionRulesFromDom($condList),
            }, { allowReason: false });
        } else {
            delete action.condition;
        }
        return action;
    }

    function renderEmitterBehaviorEditors() {
        ensureEmitterBehaviorState();
        const behavior = state.emitterBehavior;
        const varNames = getEmitterVarNames();

        const $varList = $("#globalVarList");
        if ($varList.length) {
            $varList.empty();
            if (!behavior.emitterVars.length) {
                $varList.append(`<div class="small">暂无变量。可添加 <code>Int</code>/<code>Double</code> 并生成 <code>@CodecField var ...</code></div>`);
            } else {
                behavior.emitterVars.forEach((v) => {
                    const row = `
<div class="kv-row kv-row-var" data-id="${escapeHtml(v.id)}">
  <input class="input globalVarInput" data-key="name" type="text" value="${escapeHtml(v.name)}" placeholder="变量名（如 wavePhase）" />
  <select class="input globalVarInput" data-key="type">
    <option value="double">Double</option>
    <option value="int">Int</option>
  </select>
  <input class="input globalVarInput" data-key="defaultValue" type="text" inputmode="decimal" value="${escapeHtml(String(v.defaultValue))}" placeholder="默认值" />
  <label class="kv-flag kv-min-flag"><input class="globalVarInput" data-key="minEnabled" type="checkbox" ${v.minEnabled ? "checked" : ""}/>min</label>
  <input class="input globalVarInput" data-key="minValue" type="text" inputmode="decimal" value="${escapeHtml(String(v.minValue))}" placeholder="最小值" />
  <label class="kv-flag kv-max-flag"><input class="globalVarInput" data-key="maxEnabled" type="checkbox" ${v.maxEnabled ? "checked" : ""}/>max</label>
  <input class="input globalVarInput" data-key="maxValue" type="text" inputmode="decimal" value="${escapeHtml(String(v.maxValue))}" placeholder="最大值" />
  <button class="btn small kv-del btnDelGlobalVar" type="button">删除</button>
</div>`;
                    $varList.append(row);
                });
                $varList.find('.globalVarInput[data-key="type"]').each((_, el) => {
                    const id = $(el).closest(".kv-row").data("id");
                    const target = behavior.emitterVars.find((it) => it.id === id);
                    if (target) $(el).val(target.type);
                });
            }
        }

        const $tickList = $("#tickActionList");
        if ($tickList.length) {
            const src = normalizeDoTickExpression(behavior.tickExpression || "");
            $tickList.html(`
<div class="field tick-expression-field">
  <label>doTick 表达式（JS）</label>
  <textarea
    id="tickExpressionInput"
    class="input script-area"
    data-code-editor="js"
    data-code-title="doTick expression"
    spellcheck="false"
    placeholder="addVar(&quot;wavePhase&quot;, 0.05)\nif (tick % 20 === 0) {\n  setVar(&quot;pulse&quot;, rand(0, 1))\n}"
  >${escapeHtml(src)}</textarea>
  <div class="small">失去焦点后编译并应用变化；预览执行已编译结果。</div>
  <div id="tickExpressionCompileState" class="small tick-expression-compile-state"></div>
</div>`);
            mountDoTickExpressionEditor();
            compileDoTickExpressionFromState({ showToast: false });
        }

        const death = behavior.death || {};
        const condCfg = normalizeConditionFilter(death.condition, { allowReason: true });
        const $deathEnabled = $("#deathEnabled");
        if ($deathEnabled.length) {
            $deathEnabled.val(death.enabled ? "true" : "false");
            $("#deathMode").val(death.mode || "dissipate");
            $("#deathConditionEnabled").val(condCfg.enabled ? "true" : "false");
            $("#deathRespawnCount").val(String(death.respawnCount ?? 1));
            $("#deathSizeMul").val(String(death.sizeMul ?? 1));
            $("#deathSpeedMul").val(String(death.speedMul ?? 1));
            $("#deathOffX").val(String(death.offset?.x ?? 0));
            $("#deathOffY").val(String(death.offset?.y ?? 0));
            $("#deathOffZ").val(String(death.offset?.z ?? 0));
            $("#deathSignMode").val(death.signMode || "keep");
            $("#deathSignValue").val(String(death.signValue ?? 0));
            $("#deathMaxAgeEnabled").val(death.maxAgeEnabled ? "true" : "false");
            $("#deathMaxAgeType").val(String(death.maxAgeValueType || "number"));
            $("#deathMaxAgeValueNum").val(String(Number.isFinite(Number(death.maxAgeValue)) ? Number(death.maxAgeValue) : 1));
            $("#deathMaxAgeValueVar").html(renderVarNameOptions(varNames, String(death.maxAgeValue || "")));
            $("#deathRespawnBlock").toggle(!!death.enabled && death.mode === "respawn");
            $("#deathSignValueWrap").toggle(death.signMode === "set");
            const maxType = String(death.maxAgeValueType || "number");
            const maxEnabled = !!death.maxAgeEnabled;
            $("#deathMaxAgeType").prop("disabled", !maxEnabled);
            $("#deathMaxAgeValueNum").toggle(maxType === "number").prop("disabled", !maxEnabled || maxType !== "number");
            $("#deathMaxAgeValueVar").toggle(maxType === "var").prop("disabled", !maxEnabled || maxType !== "var");
        }

        const $deathCondList = $("#deathConditionList");
        if ($deathCondList.length) {
            $deathCondList.empty();
            const rules = Array.isArray(condCfg.rules) ? condCfg.rules : [];
            if (!rules.length) {
                $deathCondList.append(`<div class="small">暂无死亡条件卡片。</div>`);
            } else {
                rules.forEach((r, idx) => {
                    $deathCondList.append(renderConditionRuleRow(r, idx, varNames, true, "deathCondRule", "btnDelDeathCondRule", true));
                });
                $deathCondList.find(".expr-rule-row").each((_, el) => refreshConditionRowVisibility($(el)));
            }
        }

        const $deathVarActionList = $("#deathVarActionList");
        if ($deathVarActionList.length) {
            $deathVarActionList.empty();
            const actions = Array.isArray(death.varActions) ? death.varActions : [];
            if (!actions.length) {
                $deathVarActionList.append(`<div class="small">暂无死亡时变量修改语句。</div>`);
            } else {
                actions.forEach((a) => {
                    $deathVarActionList.append(renderActionRow(a, varNames, ACTION_VALUE_TYPES_DEATH, "deathVarActionRow", "btnDelDeathVarAction"));
                });
                $deathVarActionList.find(".expr-action-row").each((_, el) => refreshActionRowVisibility($(el)));
            }
        }

        const deathEnabled = !!death.enabled;
        const deathCondEnabled = deathEnabled && !!condCfg.enabled;
        $("#deathMode").closest(".field").toggle(deathEnabled);
        $("#deathLogicBody").toggle(deathEnabled);
        $("#deathConditionTools").toggle(deathCondEnabled);
        $("#deathConditionList").toggle(deathCondEnabled);
    }

    function applyStateToForm() {
        $("#ticksPerSecond").val(state.ticksPerSecond);
        $("#kVarName").val(state.kotlin.varName);
        $("#kRefName").val(state.kotlin.kRefName);
        renderEmitterBehaviorEditors();
        renderEmitterList();
        renderCommandList();
    }

    function readBaseForm() {
        state.ticksPerSecond = Math.max(1, safeNum($("#ticksPerSecond").val(), 20));
        state.kotlin.varName = ($("#kVarName").val() || "command").trim() || "command";
        state.kotlin.kRefName = ($("#kRefName").val() || "emitter").trim() || "emitter";
    }

    function renderEmitterList() {
        const $list = $("#emitList");
        $list.empty();

        const typeOptions = EMITTER_TYPE_LIST
            .map((key) => `<option value="${key}">${getEmitterTypeLabel(key)}</option>`)
            .join("");

        state.emitters.forEach((card, index) => {
            sanitizeEmitterCard(card);
            const typeLabel = getEmitterTypeLabel(card.emitter.type);
            const builderStats = getEmitterBuilderStats(card);
            const builderNodeCount = builderStats.nodeCount;
            const builderPointCount = builderStats.pointCount;
            const esc = (v) => escapeHtml(String(v ?? ""));
            const foldIcon = (card.ui && card.ui.collapsed) ? "▸" : "▾";
            const lines = [
                `<div class="emitCard${card.ui && card.ui.collapsed ? " collapsed" : ""}" data-id="${card.id}">`,
                `  <div class="emitHead">`,
                `    <div class="dragHandle">≡</div>`,
                `    <div class="emitTitle">发射器 #${index + 1}<span class="sub">${esc(typeLabel)}</span></div>`,
                `    <div class="emitRight">`,
                `      <div class="emitBtns">`,
                `        <button class="iconBtn btnFold" title="折叠/展开">${foldIcon}</button>`,
                `        <button class="iconBtn btnDup" title="复制">⎘</button>`,
                `        <button class="iconBtn btnDel" title="删除">🗑</button>`,
                `      </div>`,
                `    </div>`,
                `  </div>`,
                `  <div class="emitBody">`,
                `    <div class="grid2">`,
                `      <div class="field">`,
                `        <label>发射器类型</label>`,
                `        <select class="emitInput" data-key="emitter.type" data-type="select">`,
                `          ${typeOptions}`,
                `        </select>`,
                `      </div>`,
                `      <div class="field">`,
                `        <label>发射模式</label>`,
                `        <select class="emitInput" data-key="emission.mode" data-type="select">`,
                `          <option value="continuous">持续（每 tick）</option>`,
                `          <option value="burst">爆发（间隔）</option>`,
                `          <option value="once">一次性</option>`,
                `        </select>`,
                `      </div>`,
                `    </div>`,
                `    <div class="grid2">`,
                `      <div class="field emission-field" data-emission="burst">`,
                `        <label>爆发间隔（秒）</label>`,
                `        <input class="emitInput" data-key="emission.burstInterval" data-type="number" type="number" step="0.05" min="0.05" data-step-fixed="1" value="${esc(card.emission.burstInterval)}" />`,
                `      </div>`,
                `      <div class="field">`,
                `        <label>是否外放模板参数</label>`,
                `        <select class="emitInput" data-key="externalTemplate" data-type="bool">`,
                `          <option value="0">否</option>`,
                `          <option value="1">是</option>`,
                `        </select>`,
                `      </div>`,
                `      <div class="field">`,
                `        <label>是否外放参数</label>`,
                `        <select class="emitInput" data-key="externalData" data-type="bool">`,
                `          <option value="0">否</option>`,
                `          <option value="1">是</option>`,
                `        </select>`,
                `      </div>`,
                `    </div>`,
                `    <div class="grid2">`,
                `      <div class="field">`,
                `        <label>template 变量名</label>`,
                `        <input class="emitInput" data-key="vars.template" data-type="kident" type="text" value="${esc(card.vars && card.vars.template ? card.vars.template : "")}" placeholder="${esc(`template${index + 1}`)}" />`,
                `      </div>`,
                `      <div class="field">`,
                `        <label>data 变量名</label>`,
                `        <input class="emitInput" data-key="vars.data" data-type="kident" type="text" value="${esc(card.vars && card.vars.data ? card.vars.data : "")}" placeholder="${esc(`data${index + 1}`)}" />`,
                `      </div>`,
                `    </div>`,
                `    <div class="hint">留空则自动使用 <code>${esc(`template${index + 1}`)}</code> / <code>${esc(`data${index + 1}`)}</code>。每张卡片可单独指定变量名；外放同类型允许同名（共享参数），但 template 与 data 不可重名。</div>`,
                `    <div class="panel-subtitle">发射器位置（偏移量）</div>`,
                `    <div class="vec3Row">`,
                `      <div class="miniLabel">Offset Vec3</div>`,
                `      <div class="vec3">`,
                `        <input class="emitInput" data-key="emitter.offset.x" data-type="number" type="number" step="0.01" value="${esc(card.emitter.offset.x)}" />`,
                `        <input class="emitInput" data-key="emitter.offset.y" data-type="number" type="number" step="0.01" value="${esc(card.emitter.offset.y)}" />`,
                `        <input class="emitInput" data-key="emitter.offset.z" data-type="number" type="number" step="0.01" value="${esc(card.emitter.offset.z)}" />`,
                `      </div>`,
                `    </div>`,
                `    <div class="hint">偏移量用于预览：发射器整体位置平移（不改变形状参数）。</div>`,
                `    <div class="panel-subtitle">颜色渐变（生命周期）</div>`,
                `    <div class="grid2">`,
                `      <div class="field">`,
                `        <label>开始颜色（life=0）</label>`,
                `        <input class="emitInput" data-key="particle.colorStart" data-type="color" type="color" value="${esc(card.particle.colorStart)}" />`,
                `      </div>`,
                `      <div class="field">`,
                `        <label>结束颜色（life=end）</label>`,
                `        <input class="emitInput" data-key="particle.colorEnd" data-type="color" type="color" value="${esc(card.particle.colorEnd)}" />`,
                `      </div>`,
                `    </div>`,
                `    <div class="panel-subtitle">粒子随机范围</div>`,
                `    <div class="grid2">`,
                `      <div class="field">`,
                `        <label>生命周期 min</label>`,
                `        <input class="emitInput" data-key="particle.lifeMin" data-type="number" type="number" step="1" min="1" value="${esc(card.particle.lifeMin)}" data-step-fixed="1" />`,
                `      </div>`,
                `      <div class="field">`,
                `        <label>生命周期 max</label>`,
                `        <input class="emitInput" data-key="particle.lifeMax" data-type="number" type="number" step="1" min="1" value="${esc(card.particle.lifeMax)}" data-step-fixed="1" />`,
                `      </div>`,
                `    </div>`,
                `    <div class="grid2">`,
                `      <div class="field">`,
                `        <label>大小 min（预览：点大小）</label>`,
                `        <input class="emitInput" data-key="particle.sizeMin" data-type="number" type="number" step="0.01" min="0.01" value="${esc(card.particle.sizeMin)}" />`,
                `      </div>`,
                `      <div class="field">`,
                `        <label>大小 max（预览：点大小）</label>`,
                `        <input class="emitInput" data-key="particle.sizeMax" data-type="number" type="number" step="0.01" min="0.01" value="${esc(card.particle.sizeMax)}" />`,
                `      </div>`,
                `    </div>`,
                `    <div class="grid2">`,
                `      <div class="field">`,
                `        <label>数量 min / 发射</label>`,
                `        <input class="emitInput" data-key="particle.countMin" data-type="number" type="number" step="1" min="0" value="${esc(card.particle.countMin)}" data-step-fixed="1" />`,
                `      </div>`,
                `      <div class="field">`,
                `        <label>数量 max / 发射</label>`,
                `        <input class="emitInput" data-key="particle.countMax" data-type="number" type="number" step="1" min="0" value="${esc(card.particle.countMax)}" data-step-fixed="1" />`,
                `      </div>`,
                `    </div>`,
                `    <div class="grid1">`,
                `      <div class="field">`,
                `        <label>初速度方向模式</label>`,
                `        <select class="emitInput" data-key="particle.velMode" data-type="select">`,
                `          <option value="fixed">固定方向</option>`,
                `          <option value="spawn_rel">按出生相对位置方向</option>`,
                `        </select>`,
                `      </div>`,
                `    </div>`,
                `    <div class="vel-field" data-vel="fixed">`,
                `      <div class="vec3Row">`,
                `        <div class="miniLabel">固定方向 Vec3</div>`,
                `        <div class="vec3">`,
                `          <input class="emitInput" data-key="particle.vel.x" data-type="number" type="number" step="0.01" value="${esc(card.particle.vel.x)}" />`,
                `          <input class="emitInput" data-key="particle.vel.y" data-type="number" type="number" step="0.01" value="${esc(card.particle.vel.y)}" />`,
                `          <input class="emitInput" data-key="particle.vel.z" data-type="number" type="number" step="0.01" value="${esc(card.particle.vel.z)}" />`,
                `        </div>`,
                `      </div>`,
                `    </div>`,
                `    <div class="vel-field" data-vel="spawn_rel">`,
                `      <div class="hint">速度方向将使用出生点相对发射器的位置向量（<code>rel.toVector()</code>）并按随机速度倍率归一化缩放。</div>`,
                `    </div>`,
                `    <div class="grid2">`,
                `      <div class="field">`,
                `        <label>速度倍率 min</label>`,
                `        <input class="emitInput" data-key="particle.velSpeedMin" data-type="number" type="number" step="0.01" min="0" value="${esc(card.particle.velSpeedMin)}" />`,
                `      </div>`,
                `      <div class="field">`,
                `        <label>速度倍率 max</label>`,
                `        <input class="emitInput" data-key="particle.velSpeedMax" data-type="number" type="number" step="0.01" min="0" value="${esc(card.particle.velSpeedMax)}" />`,
                `      </div>`,
                `    </div>`,
                  `    <div class="grid1">`,
                  `      <div class="field">`,
                  `        <label>可见范围（游戏渲染距离）</label>`,
                `        <input class="emitInput" data-key="particle.visibleRange" data-type="number" type="number" step="1" min="1" value="${esc(card.particle.visibleRange)}" data-step-fixed="1" />`,
                `      </div>`,
                `    </div>`,
                
`    <div class="panel-subtitle">模板参数（高级）</div>`,
`    <div class="grid3">`,
`      <div class="field">`,
`        <label>alpha（0~1）</label>`,
`        <input class="emitInput" data-key="template.alpha" data-type="number" type="number" step="0.01" min="0" max="1" value="${esc((card.template && card.template.alpha !== undefined) ? card.template.alpha : 1.0)}" />`,
`      </div>`,
`      <div class="field">`,
`        <label>light（0~15）</label>`,
`        <input class="emitInput" data-key="template.light" data-type="number" type="number" step="1" min="0" max="15" value="${esc((card.template && card.template.light !== undefined) ? card.template.light : 15)}" data-step-fixed="1" />`,
`      </div>`,
`      <div class="field">`,
`        <label>sign</label>`,
`        <input class="emitInput" data-key="template.sign" data-type="number" type="number" step="1" value="${esc((card.template && card.template.sign !== undefined) ? card.template.sign : 0)}" data-step-fixed="1" />`,
`      </div>`,
`    </div>`,
`    <div class="grid2">`,
                `      <div class="field">`,
                `        <label>speedLimit</label>`,
                `        <input class="emitInput" data-key="template.speedLimit" data-type="number" type="number" step="any" data-step-fixed="1" value="${esc((card.template && card.template.speedLimit !== undefined) ? card.template.speedLimit : 32.0)}" />`,
                `      </div>`,
`      <div class="field">`,
`        <label>faceToCamera</label>`,
`        <select class="emitInput" data-key="template.faceToCamera" data-type="bool">`,
`          <option value="1">是</option>`,
`          <option value="0">否</option>`,
`        </select>`,
`      </div>`,
`    </div>`,
`    <div class="face-field" data-face="manual">`,
`      <div class="grid3">`,
`        <div class="field">`,
`          <label>yaw（弧度）</label>`,
`          <input class="emitInput" data-key="template.yaw" data-type="number" type="number" step="0.01" value="${esc((card.template && card.template.yaw !== undefined) ? card.template.yaw : 0.0)}" />`,
`        </div>`,
`        <div class="field">`,
`          <label>pitch（弧度）</label>`,
`          <input class="emitInput" data-key="template.pitch" data-type="number" type="number" step="0.01" value="${esc((card.template && card.template.pitch !== undefined) ? card.template.pitch : 0.0)}" />`,
`        </div>`,
`        <div class="field">`,
`          <label>roll（弧度）</label>`,
`          <input class="emitInput" data-key="template.roll" data-type="number" type="number" step="0.01" value="${esc((card.template && card.template.roll !== undefined) ? card.template.roll : 0.0)}" />`,
`        </div>`,
`      </div>`,
`      <div class="hint">当 faceToCamera=false 时生效；yaw/pitch/roll 为弧度制。</div>`,
`    </div>`,
                `    <div class="panel-subtitle">发射器参数</div>`,
                `    <div class="emitBox emitSection" data-emit="points_builder">`,
                `      <div class="kv-list">`,
                `        <div class="kv-row display-row">`,
                `          <div class="builder-actions">`,
                `            <button class="btn small primary btnOpenEmitterBuilder" type="button">编辑 PointsBuilder</button>`,
                `            <button class="btn small btnImportEmitterBuilder" type="button">导入 JSON</button>`,
                `            <button class="btn small btnExportEmitterBuilder" type="button">导出 JSON</button>`,
                `            <button class="btn small btnClearEmitterBuilder" type="button">清空</button>`,
                `          </div>`,
                `        </div>`,
                `        <div class="kv-row display-row">`,
                `          <div class="builder-meta">节点 ${builderNodeCount} / 预览点 ${builderPointCount}</div>`,
                `        </div>`,
                `      </div>`,
                `      <div class="hint">发射器形状由 PointsBuilder 编辑，Kotlin 代码在 generator 内部生成。</div>`,
                `    </div>`,
                `    <div class="emitBox emitSection" data-emit="point">`,
                `      <div class="hint">点发射：无额外参数</div>`,
                `    </div>`,
                `    <div class="emitBox emitSection" data-emit="box">`,
                `      <div class="grid3">`,
                `        <div class="field">`,
                `          <label>盒子大小 X</label>`,
                `          <input class="emitInput" data-key="emitter.box.x" data-type="number" type="number" step="0.01" value="${esc(card.emitter.box.x)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>盒子大小 Y</label>`,
                `          <input class="emitInput" data-key="emitter.box.y" data-type="number" type="number" step="0.01" value="${esc(card.emitter.box.y)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>盒子大小 Z</label>`,
                `          <input class="emitInput" data-key="emitter.box.z" data-type="number" type="number" step="0.01" value="${esc(card.emitter.box.z)}" />`,
                `        </div>`,
                `      </div>`,
                `      <div class="grid2">`,
                `        <div class="field">`,
                `          <label>密度（0~1，越大越靠近中心）</label>`,
                `          <input class="emitInput" data-key="emitter.box.density" data-type="number" type="number" step="0.01" min="0" max="1" value="${esc(card.emitter.box.density)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>是否表面发射</label>`,
                `          <select class="emitInput" data-key="emitter.box.surface" data-type="bool">`,
                `            <option value="0">否（体积内）</option>`,
                `            <option value="1">是（表面）</option>`,
                `          </select>`,
                `        </div>`,
                `      </div>`,
                `    </div>`,
                `    <div class="emitBox emitSection" data-emit="sphere">`,
                `      <div class="grid1">`,
                `        <div class="field">`,
                `          <label>半径（体积）</label>`,
                `          <input class="emitInput" data-key="emitter.sphere.r" data-type="number" type="number" step="0.01" value="${esc(card.emitter.sphere.r)}" />`,
                `        </div>`,
                `      </div>`,
                `      <div class="hint">体积球：随机落在球内部。</div>`,
                `    </div>`,
                `    <div class="emitBox emitSection" data-emit="sphere_surface">`,
                `      <div class="grid1">`,
                `        <div class="field">`,
                `          <label>半径（球面）</label>`,
                `          <input class="emitInput" data-key="emitter.sphereSurface.r" data-type="number" type="number" step="0.01" value="${esc(card.emitter.sphereSurface.r)}" />`,
                `        </div>`,
                `      </div>`,
                `      <div class="hint">球面：随机落在球表面。</div>`,
                `    </div>`,
                `    <div class="emitBox emitSection" data-emit="ring">`,
                `      <div class="grid3">`,
                `        <div class="field">`,
                `          <label>半径</label>`,
                `          <input class="emitInput" data-key="emitter.ring.r" data-type="number" type="number" step="0.01" value="${esc(card.emitter.ring.r)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>厚度（离散/抖动）</label>`,
                `          <input class="emitInput" data-key="emitter.ring.thickness" data-type="number" type="number" step="0.01" min="0" value="${esc(card.emitter.ring.thickness)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>轴 Axis Vec3</label>`,
                `          <div class="vec3">`,
                `            <input class="emitInput" data-key="emitter.ring.axis.x" data-type="number" type="number" step="0.01" value="${esc(card.emitter.ring.axis.x)}" />`,
                `            <input class="emitInput" data-key="emitter.ring.axis.y" data-type="number" type="number" step="0.01" value="${esc(card.emitter.ring.axis.y)}" />`,
                `            <input class="emitInput" data-key="emitter.ring.axis.z" data-type="number" type="number" step="0.01" value="${esc(card.emitter.ring.axis.z)}" />`,
                `          </div>`,
                `        </div>`,
                `      </div>`,
                `    </div>`,
                `    <div class="emitBox emitSection" data-emit="line">`,
                `      <div class="grid2">`,
                `        <div class="field">`,
                `          <label>步长</label>`,
                `          <input class="emitInput" data-key="emitter.line.step" data-type="number" type="number" step="0.01" min="0.001" value="${esc(card.emitter.line.step)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>方向 Vec3</label>`,
                `          <div class="vec3">`,
                `            <input class="emitInput" data-key="emitter.line.dir.x" data-type="number" type="number" step="0.01" value="${esc(card.emitter.line.dir.x)}" />`,
                `            <input class="emitInput" data-key="emitter.line.dir.y" data-type="number" type="number" step="0.01" value="${esc(card.emitter.line.dir.y)}" />`,
                `            <input class="emitInput" data-key="emitter.line.dir.z" data-type="number" type="number" step="0.01" value="${esc(card.emitter.line.dir.z)}" />`,
                `          </div>`,
                `        </div>`,
                `      </div>`,
                `      <div class="hint">直线发射：数量使用「粒子随机范围」里的数量区间。</div>`,
                `    </div>`,
                `    <div class="emitBox emitSection" data-emit="circle">`,
                `      <div class="grid2">`,
                `        <div class="field">`,
                `          <label>半径</label>`,
                `          <input class="emitInput" data-key="emitter.circle.r" data-type="number" type="number" step="0.01" min="0.001" value="${esc(card.emitter.circle.r)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>轴 Axis Vec3</label>`,
                `          <div class="vec3">`,
                `            <input class="emitInput" data-key="emitter.circle.axis.x" data-type="number" type="number" step="0.01" value="${esc(card.emitter.circle.axis.x)}" />`,
                `            <input class="emitInput" data-key="emitter.circle.axis.y" data-type="number" type="number" step="0.01" value="${esc(card.emitter.circle.axis.y)}" />`,
                `            <input class="emitInput" data-key="emitter.circle.axis.z" data-type="number" type="number" step="0.01" value="${esc(card.emitter.circle.axis.z)}" />`,
                `          </div>`,
                `        </div>`,
                `      </div>`,
                `      <div class="hint">圆发射：数量使用「粒子随机范围」里的数量区间。</div>`,
                `    </div>`,
                `    <div class="emitBox emitSection" data-emit="arc">`,
                `      <div class="grid3">`,
                `        <div class="field">`,
                `          <label>半径</label>`,
                `          <input class="emitInput" data-key="emitter.arc.r" data-type="number" type="number" step="0.01" min="0.001" value="${esc(card.emitter.arc.r)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>起始角度</label>`,
                `          <input class="emitInput" data-key="emitter.arc.start" data-type="number" type="number" step="0.01" value="${esc(card.emitter.arc.start)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>结束角度</label>`,
                `          <input class="emitInput" data-key="emitter.arc.end" data-type="number" type="number" step="0.01" value="${esc(card.emitter.arc.end)}" />`,
                `        </div>`,
                `      </div>`,
                `      <div class="grid2">`,
                `        <div class="field">`,
                `          <label>旋转偏移（角度）</label>`,
                `          <input class="emitInput" data-key="emitter.arc.rotate" data-type="number" type="number" step="0.01" value="${esc(card.emitter.arc.rotate)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>轴 Axis Vec3</label>`,
                `          <div class="vec3">`,
                `            <input class="emitInput" data-key="emitter.arc.axis.x" data-type="number" type="number" step="0.01" value="${esc(card.emitter.arc.axis.x)}" />`,
                `            <input class="emitInput" data-key="emitter.arc.axis.y" data-type="number" type="number" step="0.01" value="${esc(card.emitter.arc.axis.y)}" />`,
                `            <input class="emitInput" data-key="emitter.arc.axis.z" data-type="number" type="number" step="0.01" value="${esc(card.emitter.arc.axis.z)}" />`,
                `          </div>`,
                `        </div>`,
                `      </div>`,
                `      <div class="hint">弧发射：角度单位为度，数量使用「粒子随机范围」里的数量区间。</div>`,
                `    </div>`,
                `    <div class="emitBox emitSection" data-emit="spiral">`,
                `      <div class="grid3">`,
                `        <div class="field">`,
                `          <label>起始半径</label>`,
                `          <input class="emitInput" data-key="emitter.spiral.startR" data-type="number" type="number" step="0.01" min="0.001" value="${esc(card.emitter.spiral.startR)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>结束半径</label>`,
                `          <input class="emitInput" data-key="emitter.spiral.endR" data-type="number" type="number" step="0.01" min="0.001" value="${esc(card.emitter.spiral.endR)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>高度</label>`,
                `          <input class="emitInput" data-key="emitter.spiral.height" data-type="number" type="number" step="0.01" value="${esc(card.emitter.spiral.height)}" />`,
                `        </div>`,
                `      </div>`,
                `      <div class="grid3">`,
                `        <div class="field">`,
                `          <label>旋转速度（弧度/步）</label>`,
                `          <input class="emitInput" data-key="emitter.spiral.rotateSpeed" data-type="number" type="number" step="0.01" value="${esc(card.emitter.spiral.rotateSpeed)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>半径曲线</label>`,
                `          <input class="emitInput" data-key="emitter.spiral.rBias" data-type="number" type="number" step="0.01" min="0.1" value="${esc(card.emitter.spiral.rBias)}" />`,
                `        </div>`,
                `        <div class="field">`,
                `          <label>高度曲线</label>`,
                `          <input class="emitInput" data-key="emitter.spiral.hBias" data-type="number" type="number" step="0.01" min="0.1" value="${esc(card.emitter.spiral.hBias)}" />`,
                `        </div>`,
                `      </div>`,
                `      <div class="vec3Row">`,
                `        <div class="miniLabel">轴 Axis Vec3</div>`,
                `        <div class="vec3">`,
                `          <input class="emitInput" data-key="emitter.spiral.axis.x" data-type="number" type="number" step="0.01" value="${esc(card.emitter.spiral.axis.x)}" />`,
                `          <input class="emitInput" data-key="emitter.spiral.axis.y" data-type="number" type="number" step="0.01" value="${esc(card.emitter.spiral.axis.y)}" />`,
                `          <input class="emitInput" data-key="emitter.spiral.axis.z" data-type="number" type="number" step="0.01" value="${esc(card.emitter.spiral.axis.z)}" />`,
                `        </div>`,
                `      </div>`,
                `      <div class="hint">螺旋发射：数量使用「粒子随机范围」里的数量区间。</div>`,
                `    </div>`,
                `  </div>`,
                `</div>`,
            ];

            const $card = $(lines.join("\n"));
            $card.find('.emitInput[data-type="number"]').attr("type", "text").attr("inputmode", "decimal");
            $card.find('[data-key="emitter.type"]').val(card.emitter.type);
            $card.find('[data-key="emitter.type"]').val(card.emitter.type);
            $card.find('[data-key="emission.mode"]').val(card.emission.mode);
            $card.find('[data-key="externalTemplate"]').val(card.externalTemplate ? "1" : "0");
            $card.find('[data-key="externalData"]').val(card.externalData ? "1" : "0");
            $card.find('[data-key="particle.velMode"]').val(card.particle && card.particle.velMode ? card.particle.velMode : "fixed");
            $card.find('[data-key="template.faceToCamera"]').val((card.template && card.template.faceToCamera === false) ? "0" : "1");
            $card.find('[data-key="emitter.box.surface"]').val(card.emitter.box.surface ? "1" : "0");

            setEmitterSection($card, card.emitter.type);
            setEmissionSection($card, card.emission.mode);
            setFaceToCameraSection($card, (card.template && card.template.faceToCamera === false) ? false : true);
            setVelocitySection($card, card.particle && card.particle.velMode);
            applyEmitterTips($card);

            if (emitterSync && emitterSync.selectedIds && emitterSync.selectedIds.has(card.id)) {
                $card.addClass("sync-target");
            }
            if (typeof filterAllowsEmitter === "function" && !filterAllowsEmitter(card.emitter.type)) {
                $card.addClass("filter-hidden");
            }

            $list.append($card);
        });

        if (!renderEmitterList._sortable) {
            const listEl = document.getElementById("emitList");
            if (listEl) {
                renderEmitterList._sortable = new Sortable(listEl, {
                    handle: ".dragHandle",
                    animation: 150,
                    onEnd: () => {
                        const oldOrder = state.emitters.map(x => x.id);
                        const ids = $("#emitList .emitCard").map((_, el) => $(el).data("id")).get();
                        const nextEmitters = ids.map(id => state.emitters.find(x => x.id === id)).filter(Boolean);
                        const chk = validateEmitterVarNames(nextEmitters, state.kotlin);
                        if (!chk.ok) {
                            toast(`${chk.msg}，已回退排序`, "error");
                            // restore
                            state.emitters = oldOrder.map(id => state.emitters.find(x => x.id === id)).filter(Boolean);
                            renderEmitterList();
                            return;
                        }
                        state.emitters = nextEmitters;
                        cardHistory.push();
                        scheduleSave();
                        autoGenKotlin();
                    }
                });
            }
        }

        if (settingsSystem) settingsSystem.applyParamStepToInputs();
    }

    function applyEmitterCollapseUI($card, collapsed) {
        if (!$card || !$card.length) return;
        $card.toggleClass("collapsed", !!collapsed);
        const $btn = $card.find(".btnFold");
        if ($btn.length) $btn.text(collapsed ? "▸" : "▾");
    }

    function applyCommandCollapseUI($card, collapsed) {
        if (!$card || !$card.length) return;
        $card.toggleClass("collapsed", !!collapsed);
        const $btn = $card.find(".cmdBtnFold");
        if ($btn.length) $btn.text(collapsed ? "▸" : "▾");
    }

    function setEmitterCardCollapsedById(id, collapsed, opts = {}) {
        const card = state.emitters.find((it) => it.id === id);
        if (!card) return false;
        if (!card.ui || typeof card.ui !== "object") card.ui = { collapsed: false };
        if (card.ui.collapsed === collapsed) return false;
        card.ui.collapsed = collapsed;
        const $card = $(`#emitList .emitCard[data-id="${id}"]`);
        if ($card.length) applyEmitterCollapseUI($card, collapsed);
        if (!opts.skipSave) scheduleSave();
        return true;
    }

    function setCommandCardCollapsedById(id, collapsed, opts = {}) {
        const cmd = state.commands.find((it) => it.id === id);
        if (!cmd) return false;
        if (!cmd.ui || typeof cmd.ui !== "object") cmd.ui = { collapsed: false };
        if (cmd.ui.collapsed === collapsed) return false;
        cmd.ui.collapsed = collapsed;
        const $card = $(`#cmdList .cmdCard[data-id="${id}"]`);
        if ($card.length) applyCommandCollapseUI($card, collapsed);
        if (!opts.skipSave) scheduleSave();
        return true;
    }

    function handleEmitterCollapseFocusChange(prevId, nextId) {
        if (!emitterCollapseScope.active) return;
        if (prevId && prevId !== nextId && !emitterCollapseScope.manualOpen.has(prevId)) {
            setEmitterCardCollapsedById(prevId, true);
        }
        if (nextId && prevId !== nextId) {
            setEmitterCardCollapsedById(nextId, false);
        }
    }

    function handleCommandCollapseFocusChange(prevId, nextId) {
        if (!commandCollapseScope.active) return;
        if (prevId && prevId !== nextId && !commandCollapseScope.manualOpen.has(prevId)) {
            setCommandCardCollapsedById(prevId, true);
        }
        if (nextId && prevId !== nextId) {
            setCommandCardCollapsedById(nextId, false);
        }
    }

    function applyEmitterTips($card) {
        if (!$card || !$card.length) return;
        $card.find(".emitInput").each((_, el) => {
            const key = el && el.dataset ? el.dataset.key : "";
            const tip = key ? EMITTER_TIPS[key] : "";
            if (tip && !el.getAttribute("data-tip")) {
                el.setAttribute("data-tip", tip);
            }
        });
    }

    function applyEmitterInputValues($root, card) {
        if (!$root || !$root.length || !card) return;
        $root.find(".emitInput").each((_, el) => {
            const key = el && el.dataset ? el.dataset.key : "";
            if (!key) return;
            const type = el && el.dataset ? String(el.dataset.type || "") : "";
            let val = getByPath(card, key);
            if (type === "bool") $(el).val(val ? "1" : "0");
            else if (type === "color") $(el).val(val || "#ffffff");
            else $(el).val(val ?? "");
        });
        setEmitterSection($root, card.emitter.type);
        setEmissionSection($root, card.emission.mode);
        setFaceToCameraSection($root, (card.template && card.template.faceToCamera === false) ? false : true);
        setVelocitySection($root, card.particle && card.particle.velMode);
    }

    function setAllEmittersCollapsed(collapsed) {
        emitterCollapseScope.active = !!collapsed;
        emitterCollapseScope.manualOpen.clear();
        const keepId = collapsed ? focusedEmitterId : null;
        let changed = false;
        for (const card of state.emitters) {
            if (!card.ui || typeof card.ui !== "object") card.ui = { collapsed: false };
            const nextCollapsed = (keepId && card.id === keepId) ? false : collapsed;
            if (card.ui.collapsed !== nextCollapsed) {
                card.ui.collapsed = nextCollapsed;
                changed = true;
            }
        }
        if (!changed) return;
        cardHistory.push();
        const $cards = $("#emitList .emitCard");
        if ($cards.length) {
            const byId = new Map(state.emitters.map((card) => [card.id, card]));
            $cards.each((_, el) => {
                const id = $(el).data("id");
                const card = byId.get(id);
                if (!card) return;
                applyEmitterCollapseUI($(el), card.ui && card.ui.collapsed);
            });
        } else {
            renderEmitterList();
        }
        scheduleSave();
        autoGenKotlin();
    }

    function setAllCommandsCollapsed(collapsed) {
        commandCollapseScope.active = !!collapsed;
        commandCollapseScope.manualOpen.clear();
        const keepId = collapsed ? focusedCommandId : null;
        let changed = false;
        for (const cmd of state.commands) {
            if (!cmd.ui || typeof cmd.ui !== "object") cmd.ui = { collapsed: false };
            const nextCollapsed = (keepId && cmd.id === keepId) ? false : collapsed;
            if (cmd.ui.collapsed !== nextCollapsed) {
                cmd.ui.collapsed = nextCollapsed;
                changed = true;
            }
        }
        if (!changed) return;
        cardHistory.push();
        const $cards = $("#cmdList .cmdCard");
        if ($cards.length) {
            const byId = new Map(state.commands.map((cmd) => [cmd.id, cmd]));
            $cards.each((_, el) => {
                const id = $(el).data("id");
                const cmd = byId.get(id);
                if (!cmd) return;
                applyCommandCollapseUI($(el), cmd.ui && cmd.ui.collapsed);
            });
        } else {
            renderCommandList();
        }
        scheduleSave();
        autoGenKotlin();
    }

    function setByPath(obj, path, value) {
        if (!obj || !path) return;
        const parts = String(path).split(".");
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const k = parts[i];
            if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
            cur = cur[k];
        }
        cur[parts[parts.length - 1]] = value;
    }

    function getByPath(obj, path) {
        if (!obj || !path) return undefined;
        const parts = String(path).split(".");
        let cur = obj;
        for (let i = 0; i < parts.length; i++) {
            if (!cur || typeof cur !== "object") return undefined;
            cur = cur[parts[i]];
        }
        return cur;
    }

    function isValidKotlinIdent(raw) {
        const s = String(raw ?? "").trim();
        if (!s) return true; // allow empty (auto)
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
    }

    function resolveEmitterVarName(card, index, kind) {
        // 留空则使用自动命名：templateN / dataN（不再依赖全局 base）
        const raw = String(card?.vars?.[kind] ?? "").trim();
        if (raw) return raw;
        const n = (Number(index) || 0) + 1;
        return kind === "template" ? `template${n}` : `data${n}`;
    }

    const EXTERNAL_TEMPLATE_SYNC_FIELDS = [
        "template.alpha",
        "template.light",
        "template.faceToCamera",
        "template.yaw",
        "template.pitch",
        "template.roll",
        "template.speedLimit",
        "template.sign",
        "particle.velMode",
        "particle.vel.x",
        "particle.vel.y",
        "particle.vel.z",
        "particle.visibleRange",
        "particle.colorStart",
        "particle.colorEnd",
    ];
    const EXTERNAL_DATA_SYNC_FIELDS = [
        "particle.lifeMin",
        "particle.lifeMax",
        "particle.sizeMin",
        "particle.sizeMax",
        "particle.countMin",
        "particle.countMax",
        "particle.velSpeedMin",
        "particle.velSpeedMax",
    ];
    const EXTERNAL_TEMPLATE_FIELD_SET = new Set(EXTERNAL_TEMPLATE_SYNC_FIELDS);
    const EXTERNAL_DATA_FIELD_SET = new Set(EXTERNAL_DATA_SYNC_FIELDS);

    function getExternalSyncKindByPath(path) {
        const key = String(path || "");
        if (key.startsWith("template.")) return "template";
        if (EXTERNAL_TEMPLATE_FIELD_SET.has(key)) return "template";
        if (EXTERNAL_DATA_FIELD_SET.has(key)) return "data";
        return null;
    }

    function updateEmitterInputValue(id, path, value) {
        if (!id || !path) return;
        const $card = $(`#emitList .emitCard[data-id="${id}"]`);
        if (!$card.length) return;
        const $input = $card.find(`.emitInput[data-key="${path}"]`);
        if (!$input.length) return;
        const type = String($input.data("type") || "");
        if (type === "bool") $input.val(value ? "1" : "0");
        else $input.val(value ?? "");
    }

    function syncSharedExternalEmitterGroup(sourceId, kind) {
        if (!sourceId || !kind) return false;
        const sourceIndex = state.emitters.findIndex((it) => it.id === sourceId);
        if (sourceIndex < 0) return false;
        const source = state.emitters[sourceIndex];
        if (!source) return false;
        const useExternal = (kind === "template") ? source.externalTemplate : source.externalData;
        if (!useExternal) return false;
        const varName = resolveEmitterVarName(source, sourceIndex, kind);
        if (!varName) return false;

        const fields = (kind === "template") ? EXTERNAL_TEMPLATE_SYNC_FIELDS : EXTERNAL_DATA_SYNC_FIELDS;
        let changed = false;

        for (let i = 0; i < state.emitters.length; i++) {
            const target = state.emitters[i];
            if (!target || target.id === sourceId) continue;
            if (kind === "template" && !target.externalTemplate) continue;
            if (kind === "data" && !target.externalData) continue;
            if (resolveEmitterVarName(target, i, kind) !== varName) continue;

            for (const field of fields) {
                const nextVal = getByPath(source, field);
                if (getByPath(target, field) !== nextVal) {
                    setByPath(target, field, nextVal);
                    changed = true;
                }
            }

            sanitizeEmitterCard(target);

            const $targetCard = $(`#emitList .emitCard[data-id="${target.id}"]`);
            if ($targetCard.length) {
                for (const field of fields) {
                    updateEmitterInputValue(target.id, field, getByPath(target, field));
                }
                if (kind === "template") {
                    setFaceToCameraSection($targetCard, (target.template && target.template.faceToCamera === false) ? false : true);
                }
            }
        }

        return changed;
    }

    function syncExternalSharedByPath(sourceId, path) {
        const key = String(path || "");
        if (key === "vars.template" || key === "externalTemplate") {
            return syncSharedExternalEmitterGroup(sourceId, "template");
        }
        if (key === "vars.data" || key === "externalData") {
            return syncSharedExternalEmitterGroup(sourceId, "data");
        }
        const kind = getExternalSyncKindByPath(key);
        if (!kind) return false;
        return syncSharedExternalEmitterGroup(sourceId, kind);
    }

    function validateEmitterVarNames(nextEmitters, nextKotlin) {
        // 规则：
        // - 每个卡片的本地变量会被 Kotlin 生成器用 run { } 包裹，所以不同卡片之间允许同名。
        // - externalTemplate/externalData 启用时才会输出到类作用域，同类型外放允许同名（共享参数）。
        // - template 与 data 不允许同名（同卡片/外放字段交叉）。
        const reserved = new Set([
            "res",
            "tick",
            "lerpProgress",
            "tps",
            "rand",
            "it",
            "this",
        ]);
        const externalTemplateNames = new Set();
        const externalDataNames = new Set();

        for (let i = 0; i < nextEmitters.length; i++) {
            const c = nextEmitters[i];
            const tRaw = String(c?.vars?.template ?? "").trim();
            const dRaw = String(c?.vars?.data ?? "").trim();
            const n = i + 1;
            const t = tRaw || `template${n}`;
            const d = dRaw || `data${n}`;

            // validate identifiers (if raw was set)
            if (tRaw && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(tRaw)) {
                return { ok: false, msg: `template 变量名不合法：${tRaw}` };
            }
            if (dRaw && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(dRaw)) {
                return { ok: false, msg: `data 变量名不合法：${dRaw}` };
            }

            if (reserved.has(t)) return { ok: false, msg: `变量名不可用：${t}` };
            if (reserved.has(d)) return { ok: false, msg: `变量名不可用：${d}` };

            if (t === d) {
                return { ok: false, msg: `同一张卡片 template/data 变量名不能相同：${t}` };
            }

            if (c?.externalTemplate) {
                externalTemplateNames.add(t);
            }
            if (c?.externalData) {
                externalDataNames.add(d);
            }
        }

        for (const name of externalTemplateNames) {
            if (externalDataNames.has(name)) {
                return { ok: false, msg: `外放 template/data 变量名不能重名：${name}` };
            }
        }

        return { ok: true };
    }

    function sanitizeCommandLifeFilter(cmd) {
        if (!cmd || typeof cmd !== "object") return;
        cmd.lifeFilter = normalizeConditionFilter(cmd.lifeFilter, { allowReason: false });
    }

    function normalizeSignList(arr) {
        const out = [];
        const seen = new Set();
        if (!Array.isArray(arr)) return out;
        for (const it of arr) {
            const n = Number(it);
            if (!Number.isFinite(n)) continue;
            const v = Math.trunc(n);
            if (seen.has(v)) continue;
            seen.add(v);
            out.push(v);
        }
        return out;
    }

    function mirrorEmitterInputValue(id, path, type, value) {
        if (!id || !path) return;
        const $card = $(`#emitList .emitCard[data-id="${id}"]`);
        if (!$card.length) return;
        const $mirror = $card.find(`.emitInput[data-key="${path}"]`);
        if (!$mirror.length) return;
        if (type === "bool") $mirror.val(value ? "1" : "0");
        else $mirror.val(value ?? "");
    }

    function buildEmitterVarSyncPreview(path, value) {
        const preview = state.emitters.slice();
        if (!emitterSync || !emitterSync.selectedIds) return preview;
        for (let i = 0; i < preview.length; i++) {
            const card = preview[i];
            if (!card || !emitterSync.selectedIds.has(card.id)) continue;
            const vars = (card.vars && typeof card.vars === "object") ? card.vars : { template: "", data: "" };
            const next = { ...card, vars: { ...vars } };
            setByPath(next, path, value);
            preview[i] = next;
        }
        return preview;
    }

    function handleEmitterInputChange(inputEl, sourceId = null) {
        const $input = $(inputEl);
        const id = sourceId || $input.closest(".emitCard").data("id");
        if (!id) return;
        const card = state.emitters.find((it) => it.id === id);
        if (!card) return;
        const editingSync = !!sourceId;
        const path = $input.data("key");
        if (!path) return;
        const type = String($input.data("type") || "");
        let value = $input.val();
        const oldValue = getByPath(card, path);

        if (type === "kident") {
            const raw = String(value ?? "").trim();
            if (!isValidKotlinIdent(raw)) {
                toast("变量名不合法（仅支持 [A-Za-z_][A-Za-z0-9_]* ）", "error");
                $input.val(oldValue ?? "");
                if (sourceId) mirrorEmitterInputValue(id, path, type, oldValue ?? "");
                return;
            }

            // 先写入，再全局校验；失败则回退
            setByPath(card, path, raw);
            sanitizeEmitterCard(card);
            const chk = validateEmitterVarNames(state.emitters, state.kotlin);
            if (!chk.ok) {
                toast(`${chk.msg}，已回退`, "error");
                setByPath(card, path, oldValue ?? "");
                sanitizeEmitterCard(card);
                $input.val(oldValue ?? "");
                if (sourceId) mirrorEmitterInputValue(id, path, type, oldValue ?? "");
                return;
            }
            value = raw;
        } else {
            if (type === "number") {
                value = parseNumOrExprInput(value, 0);
            } else if (type === "bool") {
                value = (value === "1" || value === "true");
            }
            setByPath(card, path, value);
            sanitizeEmitterCard(card);

            // external 开关变化时，需要校验外放 template/data 不可重名
            if (path === "externalData" || path === "externalTemplate") {
                const chk = validateEmitterVarNames(state.emitters, state.kotlin);
                if (!chk.ok) {
                    toast(`${chk.msg}，已回退`, "error");
                    setByPath(card, path, oldValue);
                    sanitizeEmitterCard(card);
                    $input.val(oldValue ? "1" : "0");
                    if (sourceId) mirrorEmitterInputValue(id, path, type, oldValue);
                    return;
                }
            }
        }

        if (sourceId) mirrorEmitterInputValue(id, path, type, value);

        const $card = sourceId ? $(`#emitList .emitCard[data-id="${id}"]`) : $input.closest(".emitCard");
        const $syncWrap = editingSync ? $input.closest(".sync-editor-inner") : null;
        if (path === "emitter.type") {
            setEmitterSection($card, card.emitter.type);
            $card.find(".emitTitle .sub").text(getEmitterTypeLabel(card.emitter.type));
            if (typeof filterAllowsEmitter === "function") {
                $card.toggleClass("filter-hidden", !filterAllowsEmitter(card.emitter.type));
            }
            if ($syncWrap && $syncWrap.length) {
                setEmitterSection($syncWrap, card.emitter.type);
            }
        }
        if (path === "emission.mode") {
            setEmissionSection($card, card.emission.mode);
            if ($syncWrap && $syncWrap.length) {
                setEmissionSection($syncWrap, card.emission.mode);
            }
        }
        if (path === "template.faceToCamera") {
            setFaceToCameraSection($card, (card.template && card.template.faceToCamera === false) ? false : true);
            if ($syncWrap && $syncWrap.length) {
                setFaceToCameraSection($syncWrap, (card.template && card.template.faceToCamera === false) ? false : true);
            }
        }
        if (path === "particle.velMode") {
            setVelocitySection($card, card.particle && card.particle.velMode);
            if ($syncWrap && $syncWrap.length) {
                setVelocitySection($syncWrap, card.particle && card.particle.velMode);
            }
        }

        const canSync = emitterSync && emitterSync.open && emitterSync.selectedIds
            && emitterSync.selectedIds.has(id)
            && path !== "externalTemplate"
            && path !== "externalData";
        let syncChanged = false;
        if (canSync) {
            if (String(path).startsWith("vars.")) {
                const chkSync = validateEmitterVarNames(buildEmitterVarSyncPreview(path, value), state.kotlin);
                if (!chkSync.ok) {
                    toast(`${chkSync.msg}，已回退`, "error");
                    setByPath(card, path, oldValue ?? "");
                    sanitizeEmitterCard(card);
                    $input.val(oldValue ?? "");
                    if (sourceId) mirrorEmitterInputValue(id, path, type, oldValue ?? "");
                    return;
                }
            }
            syncChanged = syncEmitterField(id, path, value);
        }

        syncExternalSharedByPath(id, path);

        scheduleHistoryPush();
        scheduleSave();
        autoGenKotlin();

        if (syncChanged) {
            renderEmitterList();
            if (!editingSync) renderEmitterSyncMenu();
        } else if (!editingSync && emitterSync && emitterSync.open && (path === "externalData" || path === "externalTemplate")) {
            renderEmitterSyncMenu();
        }
    }

    function handleCommandInputChange(inputEl, sourceId = null) {
        const $input = $(inputEl);
        const id = sourceId || $input.closest(".cmdCard").data("id");
        if (!id) return;
        const cmd = state.commands.find(x => x.id === id);
        if (!cmd) return;
        const key = $input.data("key");
        if (!key) return;
        sanitizeCommandLifeFilter(cmd);
        const meta = COMMAND_META[cmd.type];
        const field = meta.fields.find(f => f.k === key);
        const fieldType = field ? field.t : String($input.data("type") || "");

        let v;
        if (fieldType === "bool") v = ($input.val() === "true");
        else if (fieldType === "select") v = $input.val();
        else if (fieldType === "text") v = String($input.val() || "");
        else v = parseNumOrExprInput($input.val(), field ? field.def : 0);

        if (String(key).startsWith("lifeFilter.")) {
            setByPath(cmd, key, v);
            sanitizeCommandLifeFilter(cmd);
            v = getByPath(cmd, key);
        } else {
            cmd.params[key] = v;
        }

        if (sourceId) {
            const $mirror = $(`#cmdList .cmdCard[data-id="${id}"] .cmdInput[data-key="${key}"]`);
            if ($mirror.length) {
                if (fieldType === "bool") $mirror.val(v ? "true" : "false");
                else $mirror.val(v);
            }
        }

        if (key === "lifeFilter.enabled") {
            const $card = sourceId
                ? $(`#cmdList .cmdCard[data-id="${id}"]`)
                : $input.closest(".cmdCard");
            refreshCommandLifeFilterVisibility($card);
        }

        const canSync = commandSync && commandSync.open && commandSync.selectedIds && commandSync.selectedIds.has(id);
        const syncChanged = canSync ? syncCommandField(id, key, v) : false;

        scheduleHistoryPush();
        scheduleSave();
        autoGenKotlin();

        if (syncChanged) {
            renderCommandList();
            renderCommandSyncMenu();
        }
    }

    function isSyncSelectableEvent(ev) {
        if (!ev) return true;
        const t = ev.target;
        if (!t) return true;
        if (t.closest && t.closest(".dragHandle")) return false;
        if (t.closest && t.closest("button, input, select, textarea, .iconBtn")) return false;
        return true;
    }
    const cardHistory = {
        undo: [],
        redo: [],
        snapshot() {
            return deepCopy({
                ticksPerSecond: state.ticksPerSecond,
                kotlin: state.kotlin,
                emitters: state.emitters,
                commands: state.commands,
                emitterBehavior: state.emitterBehavior,
            });
        },
        applySnapshot(snap) {
            if (!snap || typeof snap !== "object") return;

            state.ticksPerSecond = Math.max(1, safeNum(snap.ticksPerSecond, state.ticksPerSecond));
            state.kotlin = deepCopy(snap.kotlin || state.kotlin);
            state.emitters = Array.isArray(snap.emitters) ? snap.emitters.map(normalizeEmitterCard) : state.emitters;
            state.commands = Array.isArray(snap.commands) ? snap.commands.map(normalizeCommand).filter(Boolean) : state.commands;
            state.commands.forEach((cmd) => sanitizeCommandLifeFilter(cmd));
            state.emitterBehavior = normalizeEmitterBehavior(snap.emitterBehavior || state.emitterBehavior);
            if (!state.commands.length) state.commands = makeDefaultCommands();

            // 清理同步目标（避免撤回/重做后引用不存在的 id）
            if (emitterSync && emitterSync.selectedIds) {
                for (const id of Array.from(emitterSync.selectedIds)) {
                    if (!state.emitters.some((it) => it.id === id)) emitterSync.selectedIds.delete(id);
                }
                if (!emitterSync.selectedIds.size) emitterSync.kind = null;
            }
            if (commandSync && commandSync.selectedIds) {
                for (const id of Array.from(commandSync.selectedIds)) {
                    if (!state.commands.some((it) => it.id === id)) commandSync.selectedIds.delete(id);
                }
                if (!commandSync.selectedIds.size) commandSync.kind = null;
            }

            applyStateToForm();
            if (typeof renderEmitterSyncMenu === "function") renderEmitterSyncMenu();
            if (typeof renderCommandSyncMenu === "function") renderCommandSyncMenu();
            autoGenKotlin();
            if (preview) preview.resetEmission();
        },
        init() {
            this.undo = [this.snapshot()];
            this.redo = [];
        },
        push() {
            const snap = this.snapshot();
            const last = this.undo[this.undo.length - 1];
            if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
            this.undo.push(snap);
            if (this.undo.length > HISTORY_MAX) this.undo.shift();
            this.redo = [];
        },
        undoOnce() {
            if (this.undo.length <= 1) return false;
            const cur = this.undo.pop();
            this.redo.push(cur);
            this.applySnapshot(this.undo[this.undo.length - 1]);
            scheduleSave();
            toast("已撤回");
            return true;
        },
        redoOnce() {
            if (!this.redo.length) return false;
            const next = this.redo.pop();
            this.undo.push(deepCopy(next));
            this.applySnapshot(next);
            scheduleSave();
            toast("已重做");
            return true;
        }
    };

    let histTimer = 0;
    function scheduleHistoryPush() {
        clearTimeout(histTimer);
        histTimer = setTimeout(() => cardHistory.push(), 250);
    }

    const FILTER_STORAGE_KEYS = {
        emitters: "pe_filter_emitters_v1",
        commands: "pe_filter_commands_v1",
    };
    const filterScopes = new Map();
    let filterPortal = null;
    let activeFilterMenu = null;
    let filterMenuBound = false;

    function loadFilterScope(scopeId) {
        const key = FILTER_STORAGE_KEYS[scopeId];
        if (!key) return { mode: "include", kinds: new Set(), search: "" };
        try {
            const raw = localStorage.getItem(key);
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
        let scope = filterScopes.get(scopeId);
        if (!scope) {
            scope = loadFilterScope(scopeId);
            filterScopes.set(scopeId, scope);
        }
        return scope;
    }

    function saveFilterScope(scopeId) {
        const key = FILTER_STORAGE_KEYS[scopeId];
        if (!key) return;
        try {
            const scope = getFilterScope(scopeId);
            const out = { mode: scope.mode, kinds: Array.from(scope.kinds || []) };
            localStorage.setItem(key, JSON.stringify(out));
        } catch {}
    }

    function isFilterActive(scopeId) {
        const scope = getFilterScope(scopeId);
        return scope.kinds && scope.kinds.size > 0;
    }

    function filterAllows(scopeId, kind) {
        if (!kind) return false;
        if (!isFilterActive(scopeId)) return true;
        const scope = getFilterScope(scopeId);
        const hit = scope.kinds.has(kind);
        return scope.mode === "include" ? hit : !hit;
    }

    function filterAllowsEmitter(kind) {
        return filterAllows("emitters", kind);
    }

    function filterAllowsCommand(kind) {
        return filterAllows("commands", kind);
    }

    function getFilterPortal() {
        if (filterPortal) return filterPortal;
        filterPortal = document.createElement("div");
        filterPortal.className = "filter-portal";
        document.body.appendChild(filterPortal);
        return filterPortal;
    }

    function positionFloatingMenu(menu, anchor) {
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
            if (menu.__wrap) menu.__wrap.classList.remove("open");
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
        positionFloatingMenu(menu, anchor);
        activeFilterMenu = { menu, anchor, wrap };
    }

    function updateActiveFilterMenuPosition() {
        if (!activeFilterMenu) return;
        positionFloatingMenu(activeFilterMenu.menu, activeFilterMenu.anchor);
    }

    function bindGlobalFilterClose() {
        if (filterMenuBound) return;
        filterMenuBound = true;
        document.addEventListener("click", () => closeAllFilterMenus());
        window.addEventListener("resize", () => updateActiveFilterMenuPosition());
        window.addEventListener("scroll", () => updateActiveFilterMenuPosition(), true);
    }

    function createFilterControls(scopeId, entries, onChange) {
        const scope = getFilterScope(scopeId);
        const wrap = document.createElement("div");
        wrap.className = "filter-wrap";
        const filterBtn = document.createElement("button");
        filterBtn.className = "btn small";
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
        const checkboxByKind = new Map();
        const labelByKind = new Map();
        (entries || []).forEach((it) => {
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
            label.dataset.searchText = `${it.title} ${it.kind} ${it.desc || ""}`.toLowerCase();
            label.appendChild(cb);
            label.appendChild(text);
            list.appendChild(label);
        });
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
        menu.__wrap = wrap;
        menu.__anchor = filterBtn;

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
            saveFilterScope(scopeId);
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

        return { wrap };
    }

    function createSyncState() {
        return {
            open: false,
            menuOpen: false,
            kind: null,
            selectedIds: new Set(),
            wrap: null,
            menu: null,
            list: null,
            editor: null,
            hint: null,
            anchor: null,
            render: null,
        };
    }

    let activeSyncMenu = null;
    let syncMenuBound = false;

    function closeAllSyncMenus() {
        document.querySelectorAll(".sync-menu.open").forEach((menu) => {
            menu.classList.remove("open");
            if (menu.__wrap) menu.__wrap.classList.remove("open");
        });
        activeSyncMenu = null;
    }

    function openSyncMenu(wrap, menu, anchor) {
        if (!menu) return;
        closeAllSyncMenus();
        wrap && wrap.classList.add("open");
        menu.classList.add("open");
        positionFloatingMenu(menu, anchor);
        activeSyncMenu = { menu, anchor, wrap };
    }

    function updateActiveSyncMenuPosition() {
        if (!activeSyncMenu) return;
        positionFloatingMenu(activeSyncMenu.menu, activeSyncMenu.anchor);
    }

    function bindGlobalSyncClose() {
        if (syncMenuBound) return;
        syncMenuBound = true;
        window.addEventListener("resize", () => updateActiveSyncMenuPosition());
        window.addEventListener("scroll", () => updateActiveSyncMenuPosition(), true);
    }

    function updateSyncButtonState(sync) {
        if (sync && sync.anchor) sync.anchor.classList.toggle("primary", sync.open);
    }

    function setSyncEnabled(sync, enabled) {
        if (!sync) return;
        sync.open = !!enabled;
        updateSyncButtonState(sync);
        if (!sync.open) {
            sync.menuOpen = false;
            closeAllSyncMenus();
        }
        if (sync === emitterSync) renderEmitterList();
        if (sync === commandSync) renderCommandList();
    }

    function showSyncMenu(sync) {
        if (!sync) return;
        sync.menuOpen = true;
        openSyncMenu(sync.wrap, sync.menu, sync.anchor);
        if (typeof sync.render === "function") sync.render();
    }

    function hideSyncMenu(sync) {
        if (!sync || !sync.menuOpen) return;
        sync.menuOpen = false;
        closeAllSyncMenus();
    }

    function toggleSyncMenu(sync) {
        if (!sync) return;
        if (!sync.open) {
            setSyncEnabled(sync, true);
            showSyncMenu(sync);
            return;
        }
        if (sync.menuOpen) hideSyncMenu(sync);
        else showSyncMenu(sync);
    }

    function createParamSyncControls(sync, onClear) {
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
        clearBtn.addEventListener("click", () => onClear && onClear());
        const hideBtn = document.createElement("button");
        hideBtn.className = "btn small";
        hideBtn.textContent = "隐藏";
        hideBtn.addEventListener("click", () => hideSyncMenu(sync));
        const closeBtn = document.createElement("button");
        closeBtn.className = "btn small";
        closeBtn.textContent = "关闭";
        closeBtn.addEventListener("click", () => setSyncEnabled(sync, false));
        actions.appendChild(clearBtn);
        actions.appendChild(hideBtn);
        actions.appendChild(closeBtn);

        menu.appendChild(hint);
        menu.appendChild(list);
        menu.appendChild(editor);
        menu.appendChild(actions);
        wrap.appendChild(btn);

        const portal = getFilterPortal();
        portal.appendChild(menu);
        menu.__wrap = wrap;
        menu.__anchor = btn;

        sync.wrap = wrap;
        sync.menu = menu;
        sync.list = list;
        sync.editor = editor;
        sync.hint = hint;
        sync.anchor = btn;

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleSyncMenu(sync);
        });
        menu.addEventListener("click", (e) => e.stopPropagation());
        bindGlobalSyncClose();

        return { wrap };
    }

    function renderSyncMenu(sync, cfg) {
        if (!sync || !sync.list) return [];
        const list = sync.list;
        list.innerHTML = "";
        const nodes = [];
        const removeIds = [];

        for (const id of sync.selectedIds) {
            const node = cfg.getNodeById(id);
            if (!node) {
                removeIds.push(id);
                continue;
            }
            const kind = cfg.getKind(node);
            if (sync.kind && kind !== sync.kind) {
                removeIds.push(id);
                continue;
            }
            nodes.push(node);
        }
        removeIds.forEach(id => sync.selectedIds.delete(id));

        if (!nodes.length) {
            sync.kind = null;
            const empty = document.createElement("div");
            empty.className = "sync-empty";
            empty.textContent = "还没有选择卡片";
            list.appendChild(empty);
            return [];
        }
        if (!sync.kind) sync.kind = cfg.getKind(nodes[0]);

        const kindLabel = cfg.getKindLabel(sync.kind);
        const kindBadge = document.createElement("div");
        kindBadge.className = "sync-kind";
        kindBadge.textContent = `${kindLabel}（${nodes.length}）`;
        list.appendChild(kindBadge);

        nodes.forEach((node) => {
            const item = document.createElement("div");
            item.className = "sync-item";
            const title = document.createElement("div");
            title.className = "sync-item-title";
            const idx = cfg.getIndex ? cfg.getIndex(node) : "";
            title.textContent = cfg.getItemLabel ? cfg.getItemLabel(node, idx) : (idx ? `${kindLabel} #${idx}` : kindLabel);
            const remove = document.createElement("button");
            remove.className = "iconBtn";
            remove.textContent = "✕";
            remove.title = "移除";
            remove.addEventListener("click", () => cfg.onRemove(node));
            item.appendChild(title);
            item.appendChild(remove);
            list.appendChild(item);
        });

        if (sync.menu && sync.anchor && sync.menu.classList.contains("open")) {
            positionFloatingMenu(sync.menu, sync.anchor);
        }

        return nodes;
    }

    function updateEmitterSyncCardUI(id) {
        const el = document.querySelector(`.emitCard[data-id="${id}"]`);
        if (el && emitterSync) el.classList.toggle("sync-target", emitterSync.selectedIds.has(id));
    }

    function updateCommandSyncCardUI(id) {
        const el = document.querySelector(`.cmdCard[data-id="${id}"]`);
        if (el && commandSync) el.classList.toggle("sync-target", commandSync.selectedIds.has(id));
    }

    function getSyncEditorSourceId(target) {
        const wrap = target && target.closest ? target.closest(".sync-editor-inner") : null;
        return (wrap && wrap.dataset) ? wrap.dataset.syncSourceId : "";
    }

    function initEmitterSyncEditor() {
        if (!emitterSync || !emitterSync.editor) return;
        if (emitterSync._editorBound) return;
        emitterSync._editorBound = true;
        const handler = (e) => {
            const input = e.target && e.target.closest ? e.target.closest(".emitInput") : null;
            if (!input) return;
            const sourceId = getSyncEditorSourceId(input);
            if (!sourceId) return;
            handleEmitterInputChange(input, sourceId);
        };
        emitterSync.editor.addEventListener("input", handler);
        emitterSync.editor.addEventListener("change", handler);
    }

    function renderEmitterSyncEditor(nodes) {
        if (!emitterSync || !emitterSync.editor) return;
        const editor = emitterSync.editor;
        editor.innerHTML = "";

        if (!nodes || !nodes.length) {
            const hint = document.createElement("div");
            hint.className = "sync-empty";
            hint.textContent = "打开后点击卡片加入";
            editor.appendChild(hint);
            return;
        }

        const source = nodes[0];
        const cardEl = document.querySelector(`#emitList .emitCard[data-id="${source.id}"]`);
        const wrap = document.createElement("div");
        wrap.className = "sync-editor-inner";
        wrap.dataset.syncSourceId = source.id;

        const body = cardEl ? cardEl.querySelector(".emitBody") : null;
        if (body) wrap.appendChild(body.cloneNode(true));

        if (!wrap.childElementCount) {
            const hint = document.createElement("div");
            hint.className = "sync-empty";
            hint.textContent = "未找到可编辑字段";
            wrap.appendChild(hint);
        }

        applyEmitterInputValues($(wrap), source);
        applyEmitterTips($(wrap));
        editor.appendChild(wrap);
    }

    function initCommandSyncEditor() {
        if (!commandSync || !commandSync.editor) return;
        if (commandSync._editorBound) return;
        commandSync._editorBound = true;

        const handler = (e) => {
            const input = e.target && e.target.closest ? e.target.closest(".cmdInput") : null;
            if (!input) return;
            const sourceId = getSyncEditorSourceId(input);
            if (!sourceId) return;
            handleCommandInputChange(input, sourceId);
        };
        commandSync.editor.addEventListener("input", handler);
        commandSync.editor.addEventListener("change", handler);

        commandSync.editor.addEventListener("click", (e) => {
            const btn = e.target && e.target.closest ? e.target.closest(".cmdSignAdd, .cmdSignClear, .cmdSignDel") : null;
            if (!btn) return;
            const sourceId = getSyncEditorSourceId(btn);
            if (!sourceId) return;
            const cmd = state.commands.find((it) => it.id === sourceId);
            if (!cmd) return;

            if (btn.classList.contains("cmdSignAdd")) {
                const input = btn.closest(".signRow") ? btn.closest(".signRow").querySelector(".cmdSignInput") : null;
                const n = input ? Number(input.value) : NaN;
                if (!Number.isFinite(n)) return;
                const s = Math.trunc(n);
                const arr = Array.isArray(cmd.signs) ? cmd.signs.slice() : [];
                if (!arr.includes(s)) arr.push(s);
                cmd.signs = normalizeSignList(arr);
                syncCommandSigns(cmd.id, cmd.signs);
                cardHistory.push();
                renderCommandList();
                renderCommandSyncMenu();
                scheduleSave();
                autoGenKotlin();
                return;
            }

            if (btn.classList.contains("cmdSignClear")) {
                cmd.signs = [];
                syncCommandSigns(cmd.id, cmd.signs);
                cardHistory.push();
                renderCommandList();
                renderCommandSyncMenu();
                scheduleSave();
                autoGenKotlin();
                return;
            }

            if (btn.classList.contains("cmdSignDel")) {
                const chip = btn.closest(".chip");
                const s = chip ? Math.trunc(Number(chip.dataset.sign)) : NaN;
                if (!Number.isFinite(s)) return;
                cmd.signs = (Array.isArray(cmd.signs) ? cmd.signs : []).filter((x) => Math.trunc(Number(x)) !== s);
                syncCommandSigns(cmd.id, cmd.signs);
                cardHistory.push();
                renderCommandList();
                renderCommandSyncMenu();
                scheduleSave();
                autoGenKotlin();
            }
        });
    }

    function renderCommandSyncEditor(nodes) {
        if (!commandSync || !commandSync.editor) return;
        const editor = commandSync.editor;
        editor.innerHTML = "";

        if (!nodes || !nodes.length) {
            const hint = document.createElement("div");
            hint.className = "sync-empty";
            hint.textContent = "打开后点击卡片加入";
            editor.appendChild(hint);
            return;
        }

        const source = nodes[0];
        const cardEl = document.querySelector(`#cmdList .cmdCard[data-id="${source.id}"]`);
        const wrap = document.createElement("div");
        wrap.className = "sync-editor-inner";
        wrap.dataset.syncSourceId = source.id;

        const body = cardEl ? cardEl.querySelector(".cmdBody") : null;
        if (body) wrap.appendChild(body.cloneNode(true));

        if (!wrap.childElementCount) {
            const hint = document.createElement("div");
            hint.className = "sync-empty";
            hint.textContent = "未找到可编辑字段";
            wrap.appendChild(hint);
        }

        editor.appendChild(wrap);
    }

    function renderEmitterSyncMenu() {
        initEmitterSyncEditor();
        const nodes = renderSyncMenu(emitterSync, {
            getNodeById: (id) => state.emitters.find((it) => it.id === id),
            getKind: (node) => node.emitter.type,
            getKindLabel: (kind) => getEmitterTypeLabel(kind),
            getIndex: (node) => state.emitters.findIndex((it) => it.id === node.id) + 1,
            getItemLabel: (node, idx) => `${getEmitterTypeLabel(node.emitter.type)} #${idx}`,
            onRemove: (node) => removeEmitterSyncTarget(node.id),
        });
        renderEmitterSyncEditor(nodes);
    }

    function renderCommandSyncMenu() {
        initCommandSyncEditor();
        const nodes = renderSyncMenu(commandSync, {
            getNodeById: (id) => state.commands.find((it) => it.id === id),
            getKind: (node) => node.type,
            getKindLabel: (kind) => (COMMAND_META[kind] && COMMAND_META[kind].title) ? COMMAND_META[kind].title : kind,
            getIndex: (node) => state.commands.findIndex((it) => it.id === node.id) + 1,
            getItemLabel: (node, idx) => {
                const label = (COMMAND_META[node.type] && COMMAND_META[node.type].title) ? COMMAND_META[node.type].title : node.type;
                return `${label} #${idx}`;
            },
            onRemove: (node) => removeCommandSyncTarget(node.id),
        });
        renderCommandSyncEditor(nodes);
    }

    function toggleEmitterSyncTarget(card) {
        if (!emitterSync || !card) return;
        const kind = card.emitter.type;
        if (!emitterSync.kind) emitterSync.kind = kind;
        if (emitterSync.kind !== kind) {
            toast("只能添加相同类型的卡片", "info");
            return;
        }
        if (emitterSync.selectedIds.has(card.id)) {
            removeEmitterSyncTarget(card.id);
            return;
        }
        emitterSync.selectedIds.add(card.id);
        updateEmitterSyncCardUI(card.id);
        renderEmitterSyncMenu();
    }

    function removeEmitterSyncTarget(id) {
        if (!emitterSync || !emitterSync.selectedIds.has(id)) return;
        emitterSync.selectedIds.delete(id);
        updateEmitterSyncCardUI(id);
        if (emitterSync.selectedIds.size === 0) emitterSync.kind = null;
        renderEmitterSyncMenu();
    }

    function clearEmitterSyncTargets() {
        if (!emitterSync) return;
        const ids = Array.from(emitterSync.selectedIds);
        emitterSync.selectedIds.clear();
        emitterSync.kind = null;
        ids.forEach(updateEmitterSyncCardUI);
        renderEmitterSyncMenu();
    }

    function toggleCommandSyncTarget(cmd) {
        if (!commandSync || !cmd) return;
        const kind = cmd.type;
        if (!commandSync.kind) commandSync.kind = kind;
        if (commandSync.kind !== kind) {
            toast("只能添加相同类型的卡片", "info");
            return;
        }
        if (commandSync.selectedIds.has(cmd.id)) {
            removeCommandSyncTarget(cmd.id);
            return;
        }
        commandSync.selectedIds.add(cmd.id);
        updateCommandSyncCardUI(cmd.id);
        renderCommandSyncMenu();
    }

    function removeCommandSyncTarget(id) {
        if (!commandSync || !commandSync.selectedIds.has(id)) return;
        commandSync.selectedIds.delete(id);
        updateCommandSyncCardUI(id);
        if (commandSync.selectedIds.size === 0) commandSync.kind = null;
        renderCommandSyncMenu();
    }

    function clearCommandSyncTargets() {
        if (!commandSync) return;
        const ids = Array.from(commandSync.selectedIds);
        commandSync.selectedIds.clear();
        commandSync.kind = null;
        ids.forEach(updateCommandSyncCardUI);
        renderCommandSyncMenu();
    }

    function syncEmitterField(sourceId, path, value) {
        if (!emitterSync || !emitterSync.open) return false;
        if (!emitterSync.selectedIds || !emitterSync.selectedIds.has(sourceId)) return false;
        const source = state.emitters.find((it) => it.id === sourceId);
        if (!source) return false;
        let changed = false;
        for (const id of emitterSync.selectedIds) {
            if (id === sourceId) continue;
            const target = state.emitters.find((it) => it.id === id);
            if (!target) continue;
            setByPath(target, path, value);
            sanitizeEmitterCard(target);
            updateEmitterInputValue(id, path, getByPath(target, path));
            const $card = $(`#emitList .emitCard[data-id="${id}"]`);
            if ($card.length) {
                if (path === "emitter.type") {
                    setEmitterSection($card, target.emitter.type);
                    $card.find(".emitTitle .sub").text(getEmitterTypeLabel(target.emitter.type));
                    if (typeof filterAllowsEmitter === "function") {
                        $card.toggleClass("filter-hidden", !filterAllowsEmitter(target.emitter.type));
                    }
                }
                if (path === "emission.mode") {
                    setEmissionSection($card, target.emission.mode);
                }
                if (path === "template.faceToCamera") {
                    setFaceToCameraSection($card, (target.template && target.template.faceToCamera === false) ? false : true);
                }
            }
            changed = true;
        }
        if (path === "emitter.type") emitterSync.kind = String(value);
        return changed;
    }

    function syncCommandField(sourceId, key, value) {
        if (!commandSync || !commandSync.open) return false;
        if (!commandSync.selectedIds || !commandSync.selectedIds.has(sourceId)) return false;
        const source = state.commands.find((it) => it.id === sourceId);
        if (!source) return false;
        const kind = source.type;
        let changed = false;
        for (const id of commandSync.selectedIds) {
            if (id === sourceId) continue;
            const target = state.commands.find((it) => it.id === id);
            if (!target || target.type !== kind) continue;
            if (String(key).startsWith("lifeFilter.")) {
                setByPath(target, key, value);
                sanitizeCommandLifeFilter(target);
            } else {
                target.params[key] = value;
            }
            changed = true;
        }
        return changed;
    }

    function syncCommandSigns(sourceId, signs) {
        if (!commandSync || !commandSync.open) return false;
        if (!commandSync.selectedIds || !commandSync.selectedIds.has(sourceId)) return false;
        const source = state.commands.find((it) => it.id === sourceId);
        if (!source) return false;
        const kind = source.type;
        let changed = false;
        for (const id of commandSync.selectedIds) {
            if (id === sourceId) continue;
            const target = state.commands.find((it) => it.id === id);
            if (!target || target.type !== kind) continue;
            target.signs = deepCopy(signs);
            changed = true;
        }
        return changed;
    }

    function syncCommandLifeFilter(sourceId, lifeFilter) {
        if (!commandSync || !commandSync.open) return false;
        if (!commandSync.selectedIds || !commandSync.selectedIds.has(sourceId)) return false;
        const source = state.commands.find((it) => it.id === sourceId);
        if (!source) return false;
        const kind = source.type;
        let changed = false;
        for (const id of commandSync.selectedIds) {
            if (id === sourceId) continue;
            const target = state.commands.find((it) => it.id === id);
            if (!target || target.type !== kind) continue;
            target.lifeFilter = normalizeConditionFilter(deepCopy(lifeFilter), { allowReason: false });
            changed = true;
        }
        return changed;
    }

    const CMD_TIP_DELAY = 650;
    const cmdTipState = { timer: 0, el: null, target: null };

    function ensureCmdTipEl() {
        if (cmdTipState.el) return cmdTipState.el;
        const el = document.createElement("div");
        el.className = "cmd-tooltip";
        el.setAttribute("role", "tooltip");
        el.style.display = "none";
        document.body.appendChild(el);
        cmdTipState.el = el;
        return el;
    }

    function hideCmdTip() {
        if (cmdTipState.timer) {
            clearTimeout(cmdTipState.timer);
            cmdTipState.timer = 0;
        }
        cmdTipState.target = null;
        const el = cmdTipState.el;
        if (!el) return;
        el.classList.remove("show");
        el.style.display = "none";
    }

    function positionCmdTip(target, el) {
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

    function showCmdTip(target, text) {
        if (!text) return;
        const el = ensureCmdTipEl();
        el.textContent = text;
        el.style.display = "block";
        el.style.visibility = "hidden";
        positionCmdTip(target, el);
        el.style.visibility = "visible";
        requestAnimationFrame(() => el.classList.add("show"));
    }

    function scheduleCmdTip(target) {
        if (!target) return;
        const tip = String(target.getAttribute("data-tip") || "").trim();
        if (!tip) return;
        if (cmdTipState.timer) clearTimeout(cmdTipState.timer);
        cmdTipState.target = target;
        cmdTipState.timer = setTimeout(() => {
            if (cmdTipState.target !== target) return;
            showCmdTip(target, tip);
        }, CMD_TIP_DELAY);
    }

    function scheduleCommandInputAdvance(inputEl) {
        if (!inputEl || !inputEl.closest || !inputEl.closest("#cmdList")) return;
        if (document.activeElement !== inputEl) return;
        const $input = $(inputEl);
        const cardEl = inputEl.closest(".cmdCard");
        const id = cardEl ? cardEl.dataset.id : null;
        const key = $input.data("key");
        if (!id || !key) return;
        const cmdIdx = state.commands.findIndex((it) => it.id === id);
        if (cmdIdx < 0) return;
        const cmd = state.commands[cmdIdx];
        const meta = COMMAND_META[cmd.type];
        if (!meta || !Array.isArray(meta.fields) || !meta.fields.length) return;
        const fieldIdx = meta.fields.findIndex((f) => f.k === key);
        if (fieldIdx < 0) return;

        let targetId = id;
        let targetKey = null;
        if (fieldIdx >= 0 && fieldIdx + 1 < meta.fields.length) {
            targetKey = meta.fields[fieldIdx + 1].k;
        } else {
            for (let i = cmdIdx + 1; i < state.commands.length; i++) {
                const next = state.commands[i];
                const nextMeta = COMMAND_META[next.type];
                if (nextMeta && Array.isArray(nextMeta.fields) && nextMeta.fields.length) {
                    targetId = next.id;
                    targetKey = nextMeta.fields[0].k;
                    break;
                }
            }
        }
        if (!targetKey) return;
        setTimeout(() => {
            const selector = `#cmdList .cmdCard[data-id="${targetId}"] .cmdInput[data-key="${targetKey}"]`;
            const target = document.querySelector(selector);
            if (target) target.focus();
        }, 0);
    }

    function applyCommandLifeFilterFromCard($card) {
        if (!$card || !$card.length) return;
        const id = $card.data("id");
        const cmd = state.commands.find((it) => it.id === id);
        if (!cmd) return;
        const enabled = $card.find('.cmdInput[data-key="lifeFilter.enabled"]').val() === "true";
        const $list = $card.find(".cmdLifeRuleList");
        const rules = readConditionRulesFromDom($list);
        cmd.lifeFilter = normalizeConditionFilter({
            enabled,
            rules,
        }, { allowReason: false });
        const syncChanged = syncCommandLifeFilter(id, cmd.lifeFilter);
        scheduleHistoryPush();
        scheduleSave();
        autoGenKotlin();
        if (syncChanged) {
            renderCommandList();
            renderCommandSyncMenu();
        }
    }

    function applyDeathConditionFromPanel() {
        ensureEmitterBehaviorState();
        const enabled = $("#deathConditionEnabled").val() === "true";
        const rules = readConditionRulesFromDom($("#deathConditionList"));
        state.emitterBehavior.death.condition = normalizeConditionFilter({
            enabled,
            rules,
        }, { allowReason: true });
    }

    function focusCmdSignInputById(id, selectAll = true) {
        if (!id) return;
        const target = document.querySelector(`#cmdList .cmdCard[data-id="${id}"] .cmdSignInput`);
        if (!target) return;
        target.focus();
        if (selectAll && typeof target.select === "function") target.select();
    }

    function applyCommandSignAdd($card, opts = {}) {
        if (!$card || !$card.length) return;
        const id = $card.data("id");
        const cmd = state.commands.find((it) => it.id === id);
        if (!cmd) return;
        const vRaw = $card.find(".cmdSignInput").val();
        const n = Number(vRaw);
        if (!Number.isFinite(n)) return;
        const s = Math.trunc(n);
        const arr = Array.isArray(cmd.signs) ? cmd.signs.slice() : [];
        if (!arr.includes(s)) arr.push(s);
        cmd.signs = normalizeSignList(arr);
        syncCommandSigns(cmd.id, cmd.signs);
        cardHistory.push();
        renderCommandList();
        scheduleSave();
        autoGenKotlin();
        if (opts.keepFocus) {
            setTimeout(() => focusCmdSignInputById(id), 0);
        }
    }

    function buildEmitterFilterEntries() {
        return EMITTER_TYPE_LIST
            .map((kind) => ({ kind, title: getEmitterTypeLabel(kind), desc: "" }))
            .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
    }

    function buildCommandFilterEntries() {
        return Object.entries(COMMAND_META)
            .map(([kind, meta]) => ({
                kind,
                title: (meta && meta.title) ? meta.title : kind,
                desc: (meta && meta.desc) ? meta.desc : "",
            }))
            .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
    }

    function initPanelTools() {
        emitterSync = createSyncState();
        emitterSync.render = renderEmitterSyncMenu;
        commandSync = createSyncState();
        commandSync.render = renderCommandSyncMenu;

        const emitterTools = document.getElementById("emitterTools");
        if (emitterTools) {
            const filterCtl = createFilterControls("emitters", buildEmitterFilterEntries(), () => renderEmitterList());
            emitterTools.appendChild(filterCtl.wrap);
            const syncCtl = createParamSyncControls(emitterSync, clearEmitterSyncTargets);
            emitterTools.appendChild(syncCtl.wrap);
        }

        const commandTools = document.getElementById("commandTools");
        if (commandTools) {
            const filterCtl = createFilterControls("commands", buildCommandFilterEntries(), () => renderCommandList());
            commandTools.appendChild(filterCtl.wrap);
            const syncCtl = createParamSyncControls(commandSync, clearCommandSyncTargets);
            commandTools.appendChild(syncCtl.wrap);
        }
    }

    function refreshCommandLifeFilterVisibility($card) {
        if (!$card || !$card.length) return;
        const enabled = $card.find('.cmdInput[data-key="lifeFilter.enabled"]').val() === "true";
        $card.find(".cmdLifeWrap").toggleClass("is-disabled", !enabled);
    }

    function renderCommandList() {
        hideCmdTip();
        const $list = $("#cmdList");
        $list.empty();

        for (const c of state.commands) {
            const meta = COMMAND_META[c.type];
            sanitizeCommandLifeFilter(c);
            if (!c.ui || typeof c.ui !== "object") c.ui = { collapsed: false };
            const foldIcon = (c.ui && c.ui.collapsed) ? "▸" : "▾";
            const $card = $(`
        <div class="cmdCard${c.ui && c.ui.collapsed ? " collapsed" : ""}" data-id="${c.id}">
          <div class="cmdHead">
            <div class="dragHandle">≡</div>
            <div class="cmdTitle">${meta.title}</div>
            <div class="cmdToggles">
              <label class="switch"><input type="checkbox" class="cmdEnabled" ${c.enabled ? "checked" : ""}/> 启用</label>
            </div>
            <div class="cmdBtns">
              <button class="iconBtn cmdBtnFold" title="折叠/展开">${foldIcon}</button>
              <button class="iconBtn cmdBtnDup" title="复制">⎘</button>
              <button class="iconBtn cmdBtnDel" title="删除">🗑</button>
            </div>
          </div>
          <div class="cmdBody">
            <div class="cmdGrid"></div>
          </div>
        </div>
      `);

            const $grid = $card.find(".cmdGrid");
            meta.fields.forEach(f => {
                const val = c.params[f.k];

                if (f.t === "bool") {
                    const $f = $(`
            <div class="field">
              <label>${humanFieldName(f.k)}</label>
              <select class="cmdInput" data-key="${f.k}">
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </div>
          `);
                    $f.find("select").val(val ? "true" : "false");
                    if (f.tip) $f.find(".cmdInput").attr("data-tip", f.tip);
                    $grid.append($f);
                } else if (f.t === "select") {
                    const opts = (f.opts || []).map(o => "<option value=\"" + o[0] + "\">" + o[1] + "</option>").join("");
                    const $f = $(`
            <div class="field">
              <label>${humanFieldName(f.k)}</label>
              <select class="cmdInput" data-key="${f.k}">${opts}</select>
            </div>
          `);
                    $f.find("select").val(val);
                    if (f.tip) $f.find(".cmdInput").attr("data-tip", f.tip);
                    $grid.append($f);
                } else if (f.t === "text") {
                    const $f = $(`
            <div class="field">
              <label>${humanFieldName(f.k)}</label>
              <input class="cmdInput" data-key="${f.k}" type="text" value="${escapeHtml(String(val ?? ""))}"/>
            </div>
          `);
                    if (f.tip) $f.find(".cmdInput").attr("data-tip", f.tip);
                    $grid.append($f);
                } else {
                    const step = (f.step != null) ? "step=\"" + f.step + "\"" : "";
                    const $f = $(`
            <div class="field">
              <label>${humanFieldName(f.k)}</label>
              <input class="cmdInput" data-key="${f.k}" data-type="number" type="text" inputmode="decimal" ${step} value="${escapeHtml(String(val ?? ""))}"/>
            </div>
          `);
                    if (f.tip) $f.find(".cmdInput").attr("data-tip", f.tip);
                    $grid.append($f);
                }
            });

            // 生效标识：如果 data.sign 在列表中，则应用该 command；为空则对所有粒子生效
            if (!Array.isArray(c.signs)) c.signs = [];
            const $signCtl = $(
                `<div class="cmdSignWrap">
                    <div class="field field-wide">
                      <label>生效标识 (sign)</label>
                      <div class="signChips"></div>
                      <div class="signRow">
                        <input class="cmdSignInput" type="number" step="1" placeholder="sign (Int)"/>
                        <button class="btn small cmdSignAdd" type="button">添加</button>
                        <button class="btn small cmdSignClear" type="button">清空</button>
                      </div>
                      <div class="small">为空=对所有粒子生效；否则仅当 <code>data.sign</code> 在列表中时生效</div>
                    </div>
                  </div>`
            );
            const $chips = $signCtl.find(".signChips");
            const renderChips = () => {
                $chips.empty();
                const arr = Array.isArray(c.signs) ? c.signs : [];
                if (!arr.length) {
                    $chips.append('<span class="chip chip-muted">(全部)</span>');
                    return;
                }
                for (const s of arr) {
                    const $chip = $(
                        `<span class="chip" data-sign="${escapeHtml(String(s))}">
                           ${escapeHtml(String(s))}
                           <button class="chipX cmdSignDel" type="button" title="移除">×</button>
                         </span>`
                    );
                    $chips.append($chip);
                }
            };
            renderChips();
            $card.find('.cmdBody').append($signCtl);
            $signCtl.find(".cmdSignInput").attr("data-tip", "生效标识 sign：为空=对所有粒子生效；否则仅当 data.sign 在列表中时生效。");

            const lifeFilter = normalizeConditionFilter(c.lifeFilter, { allowReason: false });
            c.lifeFilter = lifeFilter;
            const lifeEnabled = !!lifeFilter.enabled;
            const lifeRules = Array.isArray(lifeFilter.rules) ? lifeFilter.rules : [];
            const varNames = getEmitterVarNames();
            const ruleRows = lifeRules.map((r, idx) =>
                renderConditionRuleRow(r, idx, varNames, false, "cmdLifeRule", "btnDelCmdLifeRule", false)
            ).join("");
            const $lifeCtl = $(
                `<div class="cmdLifeWrap${lifeEnabled ? "" : " is-disabled"}">
                    <div class="field field-wide">
                      <label>额外条件</label>
                      <div class="cmdLifeHead">
                        <div class="field">
                          <label>启用</label>
                          <select class="cmdInput" data-key="lifeFilter.enabled" data-type="bool">
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        </div>
                        <div class="field lifeRuleTools">
                          <label>条件卡片</label>
                          <button class="btn small btnAddCmdLifeRule" type="button">➕ 添加条件</button>
                        </div>
                      </div>
                      <div class="cmdLifeBody">
                        <div class="expr-rule-list cmdLifeRuleList">${ruleRows || '<div class="small">暂无条件卡片。</div>'}</div>
                        <div class="small lifeRuleHint">最终会与 sign 条件一起使用 <code>&&</code> 判定。</div>
                      </div>
                    </div>
                 </div>`
            );
            $lifeCtl.find('select[data-key="lifeFilter.enabled"]').val(lifeEnabled ? "true" : "false");
            $lifeCtl.find(".expr-rule-row").each((_, el) => refreshConditionRowVisibility($(el)));
            $card.find('.cmdBody').append($lifeCtl);
            refreshCommandLifeFilterVisibility($card);

            const hasSign = Array.isArray(c.signs) && c.signs.length;
            const hasLife = lifeEnabled && lifeRules.length > 0;
            const helpSuffix = (hasSign || hasLife)
                ? " ) { data, particle -> (sign) && (maxAge) }"
                : " )";
            const $help = $("<div class=\"small\">Kotlin 会生成：<code>.add( " + c.type + "() ..." + helpSuffix + "</code></div>");
            $card.append($help);

            if (commandSync && commandSync.selectedIds && commandSync.selectedIds.has(c.id)) {
                $card.addClass("sync-target");
            }
            if (typeof filterAllowsCommand === "function" && !filterAllowsCommand(c.type)) {
                $card.addClass("filter-hidden");
            }

            $list.append($card);
        }

        if (!renderCommandList._sortable) {
            const listEl = document.getElementById("cmdList");
            if (listEl) {
                renderCommandList._sortable = new Sortable(listEl, {
                    handle: ".dragHandle",
                    animation: 150,
                    onEnd: () => {
                        const ids = $("#cmdList .cmdCard").map((_, el) => $(el).data("id")).get();
                        const next = ids.map(id => state.commands.find(x => x.id === id)).filter(Boolean);
                        if (!next.length) return;
                        state.commands = next;
                        cardHistory.push();
                        scheduleSave();
                        autoGenKotlin();
                        if (preview) preview.resetEmission();
                    }
                });
            }
        }

        $(".cmdEnabled").off("change").on("change", function () {
            const id = $(this).closest(".cmdCard").data("id");
            const cmd = state.commands.find(x => x.id === id);
            cmd.enabled = $(this).is(":checked");
            scheduleHistoryPush();
            scheduleSave();
            autoGenKotlin();
        });

        $(".cmdInput").off("input").on("input", function () {
            handleCommandInputChange(this);
        });
        $(".cmdInput").off("change").on("change", function () {
            handleCommandInputChange(this);
            scheduleCommandInputAdvance(this);
        });



        if (renderCommandList._eventsBound) return;
        renderCommandList._eventsBound = true;

        $("#cmdList").on("focusin", ".cmdInput, .cmdSignInput, .cmdLifeRule .exprInput", function () {
            const id = $(this).closest(".cmdCard").data("id");
            if (!id) return;
            if (focusedCommandId !== id) {
                handleCommandCollapseFocusChange(focusedCommandId, id);
                focusedCommandId = id;
            }
        });

        $("#cmdList").on("focusout", ".cmdInput, .cmdSignInput, .cmdLifeRule .exprInput", function (e) {
            const to = e.relatedTarget;
            if (to && $(to).closest("#cmdList .cmdCard").length) return;
            if (!focusedCommandId) return;
            handleCommandCollapseFocusChange(focusedCommandId, null);
            focusedCommandId = null;
        });

        $("#cmdList").on("click", ".cmdHead", function (e) {
            if (!commandCollapseScope.active) return;
            if ($(e.target).closest(".cmdBtnFold, .cmdBtnDup, .cmdBtnDel, .dragHandle, .cmdToggles").length) return;
            const $card = $(this).closest(".cmdCard");
            const id = $card.data("id");
            const cmd = state.commands.find((it) => it.id === id);
            if (!cmd) return;
            if (!cmd.ui || typeof cmd.ui !== "object") cmd.ui = { collapsed: false };
            if (cmd.ui.collapsed) {
                cmd.ui.collapsed = false;
                applyCommandCollapseUI($card, false);
                scheduleSave();
                const $first = $card.find(".cmdInput, .cmdSignInput, .exprInput").first();
                if ($first.length) $first.trigger("focus");
            }
        });

        // Command 卡片：复制/删除（避免与发射器按钮类名冲突，使用委托）
        $("#cmdList").on("click", ".cmdBtnDup", function (e) {
            e.stopPropagation();
            const id = $(this).closest(".cmdCard").data("id");
            const idx = state.commands.findIndex((it) => it.id === id);
            if (idx < 0) return;
            const clone = deepCopy(state.commands[idx]);
            clone.id = uid();
            state.commands.splice(idx + 1, 0, clone);
            cardHistory.push();
            renderCommandList();
            scheduleSave();
            autoGenKotlin();
        });

        $("#cmdList").on("click", ".cmdBtnDel", function (e) {
            e.stopPropagation();
            const id = $(this).closest(".cmdCard").data("id");
            if (state.commands.length <= 1) {
                toast("至少保留一个命令", "info");
                return;
            }
            state.commands = state.commands.filter((it) => it.id !== id);
            if (commandSync) removeCommandSyncTarget(id);
            cardHistory.push();
            renderCommandList();
            scheduleSave();
            autoGenKotlin();
        });

        $("#cmdList").on("click", ".cmdBtnFold", function (e) {
            e.stopPropagation();
            const $card = $(this).closest(".cmdCard");
            const id = $card.data("id");
            const cmd = state.commands.find((it) => it.id === id);
            if (!cmd) return;
            if (!cmd.ui || typeof cmd.ui !== "object") cmd.ui = { collapsed: false };
            const nextCollapsed = !cmd.ui.collapsed;
            cmd.ui.collapsed = nextCollapsed;
            if (commandCollapseScope.active) {
                if (nextCollapsed) commandCollapseScope.manualOpen.delete(id);
                else commandCollapseScope.manualOpen.add(id);
            }
            cardHistory.push();
            applyCommandCollapseUI($card, cmd.ui.collapsed);
            scheduleSave();
            autoGenKotlin();
        });

        $("#cmdList").on("keydown", ".cmdSignInput", function (e) {
            if (e.key !== "Enter") return;
            e.preventDefault();
            e.stopPropagation();
            const $card = $(this).closest(".cmdCard");
            applyCommandSignAdd($card, { keepFocus: true });
        });

        $(document).on("mouseenter", ".emitInput, .cmdInput, .cmdSignInput, .exprInput", function () {
            scheduleCmdTip(this);
        });
        $(document).on("mouseleave", ".emitInput, .cmdInput, .cmdSignInput, .exprInput", function () {
            hideCmdTip();
        });
        $(document).on("mousedown", ".emitInput, .cmdInput, .cmdSignInput, .exprInput", function () {
            hideCmdTip();
        });
        window.addEventListener("scroll", hideCmdTip, true);
        window.addEventListener("resize", hideCmdTip);
        document.addEventListener("keydown", hideCmdTip);

        // Command 生效标识(sign) 编辑：添加/删除/清空（支持同步到参数同步目标）
        $("#cmdList").on("click", ".cmdSignAdd", function (e) {
            e.stopPropagation();
            const $card = $(this).closest(".cmdCard");
            applyCommandSignAdd($card, { keepFocus: false });
        });

        $("#cmdList").on("click", ".cmdSignClear", function (e) {
            e.stopPropagation();
            const id = $(this).closest(".cmdCard").data("id");
            const cmd = state.commands.find((it) => it.id === id);
            if (!cmd) return;
            cmd.signs = [];
            syncCommandSigns(cmd.id, cmd.signs);
            cardHistory.push();
            renderCommandList();
            scheduleSave();
            autoGenKotlin();
        });

        $("#cmdList").on("click", ".cmdSignDel", function (e) {
            e.stopPropagation();
            const $card = $(this).closest(".cmdCard");
            const id = $card.data("id");
            const cmd = state.commands.find((it) => it.id === id);
            if (!cmd) return;
            const s = Math.trunc(Number($(this).closest(".chip").data("sign")));
            cmd.signs = normalizeSignList((Array.isArray(cmd.signs) ? cmd.signs : []).filter((x) => Math.trunc(Number(x)) !== s));
            syncCommandSigns(cmd.id, cmd.signs);
            cardHistory.push();
            renderCommandList();
            scheduleSave();
            autoGenKotlin();
        });

        $("#cmdList").on("click", ".btnAddCmdLifeRule", function (e) {
            e.stopPropagation();
            const $card = $(this).closest(".cmdCard");
            const id = $card.data("id");
            const cmd = state.commands.find((it) => it.id === id);
            if (!cmd) return;
            const life = normalizeConditionFilter(cmd.lifeFilter, { allowReason: false });
            const rules = Array.isArray(life.rules) ? life.rules.slice() : [];
            rules.push(createConditionRule({}, { allowReason: false }));
            cmd.lifeFilter = normalizeConditionFilter({
                enabled: life.enabled,
                rules,
            }, { allowReason: false });
            const syncChanged = syncCommandLifeFilter(cmd.id, cmd.lifeFilter);
            cardHistory.push();
            renderCommandList();
            if (syncChanged) renderCommandSyncMenu();
            scheduleSave();
            autoGenKotlin();
        });

        $("#cmdList").on("click", ".btnDelCmdLifeRule", function (e) {
            e.stopPropagation();
            const $card = $(this).closest(".cmdCard");
            const id = $card.data("id");
            const cmd = state.commands.find((it) => it.id === id);
            if (!cmd) return;
            const life = normalizeConditionFilter(cmd.lifeFilter, { allowReason: false });
            const rid = String($(this).closest(".expr-rule-row").data("id") || "");
            let rules = Array.isArray(life.rules) ? life.rules.filter((it) => String(it.id) !== rid) : [];
            if (!rules.length) rules = [createConditionRule({}, { allowReason: false })];
            cmd.lifeFilter = normalizeConditionFilter({
                enabled: life.enabled,
                rules,
            }, { allowReason: false });
            const syncChanged = syncCommandLifeFilter(cmd.id, cmd.lifeFilter);
            cardHistory.push();
            renderCommandList();
            if (syncChanged) renderCommandSyncMenu();
            scheduleSave();
            autoGenKotlin();
        });

        $("#cmdList").on("input change", ".cmdLifeRule .exprInput", function () {
            const $row = $(this).closest(".expr-rule-row");
            if ($row.length) refreshConditionRowVisibility($row);
            const $card = $(this).closest(".cmdCard");
            applyCommandLifeFilterFromCard($card);
        });

        $("#emitList").on("input change", ".emitInput", function () {
            handleEmitterInputChange(this);
        });

        $("#emitList").on("focusin", ".emitInput", function () {
            const id = $(this).closest(".emitCard").data("id");
            if (!id) return;
            if (focusedEmitterId !== id) {
                handleEmitterCollapseFocusChange(focusedEmitterId, id);
                focusedEmitterId = id;
            }
        });

        $("#emitList").on("focusout", ".emitInput", function (e) {
            const to = e.relatedTarget;
            if (to && $(to).closest("#emitList .emitCard").length) return;
            if (!focusedEmitterId) return;
            handleEmitterCollapseFocusChange(focusedEmitterId, null);
            focusedEmitterId = null;
        });

        $("#emitList").on("click", ".emitHead", function (e) {
            if (!emitterCollapseScope.active) return;
            if ($(e.target).closest(".btnFold, .btnDup, .btnDel, .dragHandle").length) return;
            const $card = $(this).closest(".emitCard");
            const id = $card.data("id");
            const card = state.emitters.find((it) => it.id === id);
            if (!card) return;
            if (!card.ui || typeof card.ui !== "object") card.ui = { collapsed: false };
            if (card.ui.collapsed) {
                card.ui.collapsed = false;
                applyEmitterCollapseUI($card, false);
                scheduleSave();
                const $first = $card.find(".emitInput").first();
                if ($first.length) $first.trigger("focus");
            }
        });

        $("#emitList").on("click", ".btnDup", function (e) {
            e.stopPropagation();
            const id = $(this).closest(".emitCard").data("id");
            const idx = state.emitters.findIndex((it) => it.id === id);
            if (idx < 0) return;
            const clone = deepCopy(state.emitters[idx]);
            clone.id = uid();
            // 复制时避免 Kotlin 变量名冲突：默认清空，使用自动命名
            if (clone.vars) {
                clone.vars.template = "";
                clone.vars.data = "";
            }
            state.emitters.splice(idx + 1, 0, clone);
            cardHistory.push();
            renderEmitterList();
            scheduleSave();
            autoGenKotlin();
            if (preview) preview.resetEmission();
        });

        $("#emitList").on("click", ".btnDel", function (e) {
            e.stopPropagation();
            const id = $(this).closest(".emitCard").data("id");
            if (state.emitters.length <= 1) {
                toast("至少保留一个发射器", "info");
                return;
            }
            state.emitters = state.emitters.filter((it) => it.id !== id);
            if (emitterSync) removeEmitterSyncTarget(id);
            cardHistory.push();
            renderEmitterList();
            scheduleSave();
            autoGenKotlin();
            if (preview) preview.resetEmission();
        });

        $("#emitList").on("click", ".btnOpenEmitterBuilder", function (e) {
            e.stopPropagation();
            const id = $(this).closest(".emitCard").data("id");
            openEmitterBuilderEditor(id);
        });

        $("#emitList").on("click", ".btnImportEmitterBuilder", function (e) {
            e.stopPropagation();
            const id = $(this).closest(".emitCard").data("id");
            importEmitterBuilderJson(id);
        });

        $("#emitList").on("click", ".btnExportEmitterBuilder", function (e) {
            e.stopPropagation();
            const id = $(this).closest(".emitCard").data("id");
            exportEmitterBuilderJson(id);
        });

        $("#emitList").on("click", ".btnClearEmitterBuilder", function (e) {
            e.stopPropagation();
            const id = $(this).closest(".emitCard").data("id");
            clearEmitterBuilder(id);
        });

        $("#emitList").on("click", ".btnFold", function (e) {
            e.stopPropagation();
            const $card = $(this).closest(".emitCard");
            const id = $card.data("id");
            const card = state.emitters.find((it) => it.id === id);
            if (!card) return;
            if (!card.ui || typeof card.ui !== "object") card.ui = { collapsed: false };
            const nextCollapsed = !card.ui.collapsed;
            card.ui.collapsed = nextCollapsed;
            if (emitterCollapseScope.active) {
                if (nextCollapsed) emitterCollapseScope.manualOpen.delete(id);
                else emitterCollapseScope.manualOpen.add(id);
            }
            cardHistory.push();
            applyEmitterCollapseUI($card, card.ui.collapsed);
            scheduleSave();
            autoGenKotlin();
        });

        $("#emitList").on("click", ".emitCard", function (e) {
            if (!emitterSync || !emitterSync.open) return;
            if (!isSyncSelectableEvent(e)) return;
            const id = $(this).data("id");
            const card = state.emitters.find((it) => it.id === id);
            if (!card) return;
            toggleEmitterSyncTarget(card);
        });

        $("#cmdList").on("click", ".cmdCard", function (e) {
            if (!commandSync || !commandSync.open) return;
            if (!isSyncSelectableEvent(e)) return;
            const id = $(this).data("id");
            const cmd = state.commands.find((it) => it.id === id);
            if (!cmd) return;
            toggleCommandSyncTarget(cmd);
        });

        $("#btnPlay").on("click", () => {
            state.playing = true;
            state.autoPaused = false;
            toast("预览：播放");
        });
        $("#btnPause").on("click", () => {
            state.playing = false;
            state.autoPaused = false;
            toast("预览：暂停");
        });
        $("#btnClear").on("click", () => {
            if (preview) preview.clearParticles(true);
            toast("已清空");
        });

        $("#btnAddEmitter").on("click", () => {
            state.emitters.push(makeDefaultEmitterCard());
            cardHistory.push();
            renderEmitterList();
            scheduleSave();
            autoGenKotlin();
            if (preview) preview.resetEmission();
        });

        $("#btnExpandEmitters").on("click", () => setAllEmittersCollapsed(false));
        $("#btnCollapseEmitters").on("click", () => setAllEmittersCollapsed(true));
        $("#btnExpandCommands").on("click", () => setAllCommandsCollapsed(false));
        $("#btnCollapseCommands").on("click", () => setAllCommandsCollapsed(true));

        $("#btnAddCmd").on("click", () => {
            const type = $("#addCommandType").val();
            state.commands.push(newCommand(type));
            cardHistory.push();
            scheduleSave();
            renderCommandList();
            autoGenKotlin();
        });

        $("#btnAddGlobalVar").on("click", () => {
            ensureEmitterBehaviorState();
            state.emitterBehavior.emitterVars.push(createEmitterVar());
            cardHistory.push();
            renderEmitterBehaviorEditors();
            refreshAllVarBindings();
            scheduleSave();
            autoGenKotlin();
        });

        $("#btnAddTickAction").on("click", () => {
            ensureEmitterBehaviorState();
            const item = createTickAction();
            const vars = getEmitterVarNames();
            if (vars.length) item.varName = vars[0];
            state.emitterBehavior.tickActions.push(item);
            cardHistory.push();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#globalVarList").on("input change", ".globalVarInput", function (e) {
            ensureEmitterBehaviorState();
            const $row = $(this).closest(".kv-row");
            const id = $row.data("id");
            const key = String($(this).data("key") || "");
            const item = state.emitterBehavior.emitterVars.find((it) => it.id === id);
            if (!item || !key) return;

            if (key === "name") {
                const raw = String($(this).val() || "").trim();
                item.name = raw;
                if (raw && !isValidEmitterVarName(raw) && e && e.type === "change") {
                    toast("变量名不合法（仅支持 [A-Za-z_][A-Za-z0-9_]* ）", "error");
                }
            } else if (key === "type") {
                item.type = ($(this).val() === "int") ? "int" : "double";
                item.defaultValue = item.type === "int"
                    ? Math.trunc(safeNum(item.defaultValue, 0))
                    : safeNum(item.defaultValue, 0);
                item.minValue = item.type === "int"
                    ? Math.trunc(safeNum(item.minValue, 0))
                    : safeNum(item.minValue, 0);
                item.maxValue = item.type === "int"
                    ? Math.trunc(safeNum(item.maxValue, 0))
                    : safeNum(item.maxValue, 0);
            } else if (key === "defaultValue") {
                item.defaultValue = safeNum($(this).val(), item.defaultValue);
                if (item.type === "int") item.defaultValue = Math.trunc(item.defaultValue);
            } else if (key === "minEnabled") {
                item.minEnabled = $(this).is(":checked");
            } else if (key === "maxEnabled") {
                item.maxEnabled = $(this).is(":checked");
            } else if (key === "minValue") {
                item.minValue = safeNum($(this).val(), item.minValue);
                if (item.type === "int") item.minValue = Math.trunc(item.minValue);
            } else if (key === "maxValue") {
                item.maxValue = safeNum($(this).val(), item.maxValue);
                if (item.type === "int") item.maxValue = Math.trunc(item.maxValue);
            }
            if (item.minEnabled && item.maxEnabled && item.minValue > item.maxValue) {
                const t = item.minValue;
                item.minValue = item.maxValue;
                item.maxValue = t;
            }
            const varSchemaChanged = (key === "name" || key === "type");
            if (varSchemaChanged && e && e.type === "change") {
                renderEmitterBehaviorEditors();
            }
            if (varSchemaChanged) {
                refreshAllVarBindings();
            }
            scheduleHistoryPush();
            scheduleSave();
            autoGenKotlin();
        });

        $("#globalVarList").on("click", ".btnDelGlobalVar", function () {
            ensureEmitterBehaviorState();
            const id = $(this).closest(".kv-row").data("id");
            state.emitterBehavior.emitterVars = state.emitterBehavior.emitterVars.filter((it) => it.id !== id);
            cardHistory.push();
            renderEmitterBehaviorEditors();
            refreshAllVarBindings();
            scheduleSave();
            autoGenKotlin();
        });

        $("#tickActionList").on("focusout", "#tickExpressionInput", function () {
            applyDoTickExpressionFromEditor({ showToast: true });
        });

        $("#tickActionList").on("input change", ".exprInput", function () {
            ensureEmitterBehaviorState();
            const $row = $(this).closest(".expr-action-row");
            if (!$row.length) return;
            refreshActionRowVisibility($row);
            const id = String($row.data("id") || "");
            const next = readActionFromRow($row);
            const item = state.emitterBehavior.tickActions.find((it) => String(it.id) === id);
            if (item) Object.assign(item, next);
            else state.emitterBehavior.tickActions.push(next);
            scheduleHistoryPush();
            scheduleSave();
            autoGenKotlin();
        });

        $("#tickActionList").on("click", ".btnAddTickCondRule", function () {
            ensureEmitterBehaviorState();
            const $row = $(this).closest(".expr-action-row");
            if (!$row.length) return;
            const id = String($row.data("id") || "");
            const item = state.emitterBehavior.tickActions.find((it) => String(it.id) === id);
            const next = item ? deepCopy(item) : readActionFromRow($row);
            const cond = normalizeConditionFilter(next.condition, { allowReason: false });
            const rules = Array.isArray(cond.rules) ? cond.rules.slice() : [];
            rules.push(createConditionRule({}, { allowReason: false }));
            next.condition = normalizeConditionFilter({
                enabled: cond.enabled,
                rules,
            }, { allowReason: false });
            if (item) Object.assign(item, next);
            else state.emitterBehavior.tickActions.push(next);
            cardHistory.push();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#tickActionList").on("click", ".btnDelTickCondRule", function () {
            ensureEmitterBehaviorState();
            const $row = $(this).closest(".expr-action-row");
            if (!$row.length) return;
            const rid = String($(this).closest(".expr-rule-row").data("id") || "");
            const id = String($row.data("id") || "");
            const item = state.emitterBehavior.tickActions.find((it) => String(it.id) === id);
            if (!item) return;
            const cond = normalizeConditionFilter(item.condition, { allowReason: false });
            let rules = Array.isArray(cond.rules) ? cond.rules.filter((it) => String(it.id) !== rid) : [];
            if (!rules.length) rules = [createConditionRule({}, { allowReason: false })];
            item.condition = normalizeConditionFilter({
                enabled: cond.enabled,
                rules,
            }, { allowReason: false });
            cardHistory.push();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#tickActionList").on("click", ".btnDelTickAction", function () {
            ensureEmitterBehaviorState();
            const id = $(this).closest(".expr-action-row").data("id");
            state.emitterBehavior.tickActions = state.emitterBehavior.tickActions.filter((it) => it.id !== id);
            cardHistory.push();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#btnAddDeathVarAction").on("click", () => {
            ensureEmitterBehaviorState();
            if (!Array.isArray(state.emitterBehavior.death.varActions)) state.emitterBehavior.death.varActions = [];
            const item = createDeathVarAction();
            const vars = getEmitterVarNames();
            if (vars.length) item.varName = vars[0];
            state.emitterBehavior.death.varActions.push(item);
            cardHistory.push();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#btnAddDeathCondRule").on("click", () => {
            ensureEmitterBehaviorState();
            const cond = normalizeConditionFilter(state.emitterBehavior.death.condition, { allowReason: true });
            const enabled = $("#deathConditionEnabled").val() === "true";
            const rules = Array.isArray(cond.rules) ? cond.rules.slice() : [];
            rules.push(createConditionRule({}, { allowReason: true }));
            state.emitterBehavior.death.condition = normalizeConditionFilter({
                enabled,
                rules,
            }, { allowReason: true });
            cardHistory.push();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#deathConditionList").on("click", ".btnDelDeathCondRule", function () {
            ensureEmitterBehaviorState();
            const cond = normalizeConditionFilter(state.emitterBehavior.death.condition, { allowReason: true });
            const rid = String($(this).closest(".expr-rule-row").data("id") || "");
            let rules = Array.isArray(cond.rules) ? cond.rules.filter((it) => String(it.id) !== rid) : [];
            if (!rules.length) rules = [createConditionRule({}, { allowReason: true })];
            state.emitterBehavior.death.condition = normalizeConditionFilter({
                enabled: cond.enabled,
                rules,
            }, { allowReason: true });
            cardHistory.push();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#deathConditionList").on("input change", ".deathCondRule .exprInput", function () {
            const $row = $(this).closest(".expr-rule-row");
            if ($row.length) refreshConditionRowVisibility($row);
            applyDeathConditionFromPanel();
            scheduleHistoryPush();
            scheduleSave();
            autoGenKotlin();
        });

        $("#deathVarActionList").on("input change", ".exprInput", function () {
            ensureEmitterBehaviorState();
            const $row = $(this).closest(".expr-action-row");
            if (!$row.length) return;
            refreshActionRowVisibility($row);
            const id = String($row.data("id") || "");
            const next = readActionFromRow($row);
            const item = state.emitterBehavior.death.varActions.find((it) => String(it.id) === id);
            if (item) Object.assign(item, next);
            else state.emitterBehavior.death.varActions.push(next);
            scheduleHistoryPush();
            scheduleSave();
            autoGenKotlin();
        });

        $("#deathVarActionList").on("click", ".btnDelDeathVarAction", function () {
            ensureEmitterBehaviorState();
            const id = $(this).closest(".expr-action-row").data("id");
            state.emitterBehavior.death.varActions = state.emitterBehavior.death.varActions.filter((it) => it.id !== id);
            cardHistory.push();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#deathEnabled").on("change", function () {
            ensureEmitterBehaviorState();
            state.emitterBehavior.death.enabled = ($(this).val() === "true");
            scheduleHistoryPush();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#deathMode").on("change", function () {
            ensureEmitterBehaviorState();
            state.emitterBehavior.death.mode = ($(this).val() === "respawn") ? "respawn" : "dissipate";
            scheduleHistoryPush();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#deathSignMode").on("change", function () {
            ensureEmitterBehaviorState();
            state.emitterBehavior.death.signMode = ($(this).val() === "set") ? "set" : "keep";
            scheduleHistoryPush();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#deathConditionEnabled").on("change", function () {
            applyDeathConditionFromPanel();
            scheduleHistoryPush();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#deathMaxAgeEnabled").on("change", function () {
            ensureEmitterBehaviorState();
            state.emitterBehavior.death.maxAgeEnabled = ($(this).val() === "true");
            scheduleHistoryPush();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#deathMaxAgeType").on("change", function () {
            ensureEmitterBehaviorState();
            state.emitterBehavior.death.maxAgeValueType = String($(this).val() || "number");
            scheduleHistoryPush();
            renderEmitterBehaviorEditors();
            scheduleSave();
            autoGenKotlin();
        });

        $("#deathMaxAgeValueNum, #deathMaxAgeValueVar").on("input change", function () {
            ensureEmitterBehaviorState();
            const type = String(state.emitterBehavior.death.maxAgeValueType || "number");
            if (type === "var") {
                state.emitterBehavior.death.maxAgeValue = String($("#deathMaxAgeValueVar").val() || "").trim();
            } else {
                state.emitterBehavior.death.maxAgeValue = safeNum($("#deathMaxAgeValueNum").val(), 1);
            }
            scheduleHistoryPush();
            scheduleSave();
            autoGenKotlin();
        });

        $("#deathRespawnCount, #deathSizeMul, #deathSpeedMul, #deathOffX, #deathOffY, #deathOffZ, #deathSignValue").on("input change", function () {
            ensureEmitterBehaviorState();
            const key = this.id;
            const raw = String($(this).val() || "").trim();
            const val = parseNumOrExprInput(raw, 0);
            if (key === "deathRespawnCount") state.emitterBehavior.death.respawnCount = val;
            else if (key === "deathSizeMul") state.emitterBehavior.death.sizeMul = val;
            else if (key === "deathSpeedMul") state.emitterBehavior.death.speedMul = val;
            else if (key === "deathOffX") state.emitterBehavior.death.offset.x = val;
            else if (key === "deathOffY") state.emitterBehavior.death.offset.y = val;
            else if (key === "deathOffZ") state.emitterBehavior.death.offset.z = val;
            else if (key === "deathSignValue") state.emitterBehavior.death.signValue = val;
            scheduleHistoryPush();
            scheduleSave();
            autoGenKotlin();
        });

        $("#btnGenKotlin").on("click", () => {
            autoGenKotlin();
            toast("已生成 Kotlin");
        });
        $("#btnCopyKotlin").on("click", () => {
            autoGenKotlin();
            copyKotlin();
        });

        $("#btnUndo").on("click", () => cardHistory.undoOnce());
        $("#btnRedo").on("click", () => cardHistory.redoOnce());

        $("#btnExportJson").on("click", () => exportStateJson());
        $("#btnImportJson").on("click", () => importStateJson());
        $("#btnResetAll").on("click", () => resetAllToDefault());

        const importInput = document.getElementById("importJsonFile");
        if (importInput) {
            importInput.addEventListener("change", async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    importStateFromText(text);
                } catch (err) {
                    console.error(err);
                    toast("导入失败-格式错误(" + (err.message || err) + ")", "error");
                } finally {
                    importInput.value = "";
                }
            });
        }

        $("#btnFull").on("click", () => setFullscreen(true));
        $("#btnExitFull").on("click", () => setFullscreen(false));
        document.addEventListener("fullscreenchange", () => {
            if (!document.fullscreenElement && state.fullscreen) {
                setFullscreen(false);
            }
        });

        window.addEventListener("keydown", (e) => {
            if (hotkeysSystem && hotkeysSystem.handleHotkeyCaptureKeydown(e)) return;

            if (e.key === "Escape") {
                const hadSyncMenu = (emitterSync && emitterSync.menuOpen) || (commandSync && commandSync.menuOpen);
                if (hadSyncMenu) {
                    if (emitterSync && emitterSync.menuOpen) hideSyncMenu(emitterSync);
                    if (commandSync && commandSync.menuOpen) hideSyncMenu(commandSync);
                    return;
                }
            }
            if (e.key === "Escape" && state.fullscreen) {
                setFullscreen(false);
                return;
            }
            if (e.key === "Escape") {
                if (hotkeysSystem) hotkeysSystem.hideHotkeysModal();
                if (settingsSystem) settingsSystem.hideSettingsModal();
                return;
            }

            const isEditable = hotkeysSystem ? hotkeysSystem.shouldIgnorePlainHotkeys() : false;
            if (isEditable && !e.ctrlKey && !e.metaKey && !e.altKey) return;

            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.togglePlay)) {
                e.preventDefault();
                state.playing = !state.playing;
                state.autoPaused = false;
                toast(state.playing ? "预览：播放" : "预览：暂停");
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.clearParticles)) {
                e.preventDefault();
                if (preview) preview.clearParticles(true);
                toast("已清空");
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.generateKotlin)) {
                e.preventDefault();
                autoGenKotlin();
                toast("已生成 Kotlin");
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.copyKotlin)) {
                e.preventDefault();
                autoGenKotlin();
                copyKotlin();
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.importJson)) {
                e.preventDefault();
                importStateJson();
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.exportJson)) {
                e.preventDefault();
                exportStateJson();
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.toggleFullscreen)) {
                e.preventDefault();
                setFullscreen(!state.fullscreen);
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.undo)) {
                e.preventDefault();
                cardHistory.undoOnce();
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.redo)) {
                e.preventDefault();
                cardHistory.redoOnce();
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.openSettings)) {
                e.preventDefault();
                if (settingsSystem) settingsSystem.showSettingsModal();
            }
        });

        const autoPause = () => {
            if (state.playing) {
                state.playing = false;
                state.autoPaused = true;
            }
        };
        const autoResume = () => {
            if (state.autoPaused) {
                state.playing = true;
                state.autoPaused = false;
                if (preview) preview.resetTime();
            }
        };
        window.addEventListener("blur", autoPause);
        window.addEventListener("focus", autoResume);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") autoPause();
            if (document.visibilityState === "visible") autoResume();
        });
    }

    function bindEvents() {
        $("#ticksPerSecond").on("input change", function () {
            const raw = $(this).val();
            if (raw === "" || raw == null) return;
            const next = Math.max(1, safeNum(raw, state.ticksPerSecond));
            if (next === state.ticksPerSecond) return;
            state.ticksPerSecond = next;
            scheduleHistoryPush();
            scheduleSave();
        });

        $("#kVarName, #kRefName").on("input change", function () {
            const nextVar = ($("#kVarName").val() || "command").trim() || "command";
            const nextRef = ($("#kRefName").val() || "emitter").trim() || "emitter";
            if (nextVar === state.kotlin.varName && nextRef === state.kotlin.kRefName) return;
            state.kotlin.varName = nextVar;
            state.kotlin.kRefName = nextRef;
            scheduleHistoryPush();
            scheduleSave();
            autoGenKotlin();
        });
    }

    let preview = null;
    let settingsSystem = null;
    let hotkeysSystem = null;
    let layoutSystem = null;

    function boot() {
        const loaded = loadPersisted();
        if (!loaded) state.commands = makeDefaultCommands();
        const returnedEmitterId = consumeEmitterBuilderReturnState();

        initPanelTools();
        applyStateToForm();
        renderCommandList();
        autoGenKotlin();
        cardHistory.init();
        scheduleSave();
        if (returnedEmitterId) {
            toast("已加载 PointsBuilder 形状", "success");
        }

        preview = initPreview({
            getState: () => state,
            viewportEl: document.getElementById("viewport"),
            statEl: document.getElementById("statChip"),
            fpsEl: document.getElementById("fpsChip"),
            shouldIgnoreArrowPan,
        });
        compileDoTickExpressionFromState({ showToast: false });

        settingsSystem = initSettingsSystem({
            settingsModal: document.getElementById("settingsModal"),
            settingsMask: document.getElementById("settingsMask"),
            btnSettings: document.getElementById("btnSettings"),
            btnCloseSettings: document.getElementById("btnCloseSettings"),
            themeSelect: document.getElementById("themeSelect"),
            chkAxes: document.getElementById("chkAxes"),
            chkGrid: document.getElementById("chkGrid"),
            inpPointSize: document.getElementById("inpPointSize"),
            inpParamStep: document.getElementById("inpParamStep"),
            onShowAxes: (on) => preview && preview.setShowAxes(on),
            onShowGrid: (on) => preview && preview.setShowGrid(on),
            onPointSize: (val) => preview && preview.setPointScale(val),
        });
        settingsSystem.loadSettingsFromStorage();
        settingsSystem.bindThemeHotkeys();
        settingsSystem.applyParamStepToInputs();
        autoGenKotlin();

        hotkeysSystem = initHotkeysSystem({
            hkModal: document.getElementById("hkModal"),
            hkMask: document.getElementById("hkMask"),
            hkSearch: document.getElementById("hkSearch"),
            hkList: document.getElementById("hkList"),
            hkHint: document.getElementById("hkHint"),
            btnSettings: document.getElementById("btnSettings"),
            btnOpenHotkeys: document.getElementById("btnOpenHotkeys"),
            btnCloseHotkeys: document.getElementById("btnCloseHotkeys"),
            btnCloseHotkeys2: document.getElementById("btnCloseHotkeys2"),
            btnHotkeysReset: document.getElementById("btnHotkeysReset"),
            btnHotkeysExport: document.getElementById("btnHotkeysExport"),
            btnHotkeysImport: document.getElementById("btnHotkeysImport"),
            fileHotkeys: document.getElementById("fileHotkeys"),
            settingsModal: document.getElementById("settingsModal"),
            settingsMask: document.getElementById("settingsMask"),
            showToast: toast,
            downloadText: downloadText,
            getSettingsPayload: settingsSystem.getSettingsPayload,
            applySettingsPayload: (payload) => {
                settingsSystem.applySettingsPayload(payload);
                autoGenKotlin();
            },
            btnPlay: document.getElementById("btnPlay"),
            btnPause: document.getElementById("btnPause"),
            btnClear: document.getElementById("btnClear"),
            btnGen: document.getElementById("btnGenKotlin"),
            btnCopy: document.getElementById("btnCopyKotlin"),
            btnImportJson: document.getElementById("btnImportJson"),
            btnExportJson: document.getElementById("btnExportJson"),
            btnUndo: document.getElementById("btnUndo"),
            btnRedo: document.getElementById("btnRedo"),
            btnFullscreen: document.getElementById("btnFull"),
        });
        hotkeysSystem.refreshHotkeyHints();

        layoutSystem = initLayoutSystem({
            layoutEl: document.querySelector(".main"),
            panelLeft: document.querySelector(".panel.left"),
            panelRight: document.querySelector(".panel.right"),
            resizerLeft: document.querySelector(".resizer-left"),
            resizerRight: document.querySelector(".resizer-right"),
            onResize: () => preview && preview.resizeRenderer(),
        });
        layoutSystem.applyLayoutState();
        layoutSystem.bindResizers();

        window.addEventListener("resize", () => layoutSystem.applyLayoutState(true));

        initKotlinTabs();
        initConfigPages();
        initKotlinResizer();
        initPreviewResizer();
    }

    $(document).ready(() => {
        bindEvents();
        boot();
    });
})();
