import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createKindDefs } from "../../points_builder/js/kinds.js";
import { createBuilderTools } from "../../points_builder/js/builder.js";
import { createExpressionRuntime } from "./expression_runtime.js";
import { InlineCodeEditor, mergeCompletionGroups } from "./code_editor.js";
import {
    isVectorLiteralType,
    normalizeVectorCtor,
    formatVectorLiteral,
    parseCtorInLiteral,
    vectorToHex01,
    hexToVector01,
    formatNumberCompact
} from "./vector_value_utils.js";
import {
    normalizeScaleHelperConfig,
    SCALE_HELPER_TYPES
} from "./scale_helper_utils.js";

const U = globalThis.Utils;
if (!U) throw new Error("Utils 未加载：请先加载 points_builder/utils.js");

const STORAGE_KEY = "cb_state_v1";
const EXPORTED_SIG_KEY = "cb_export_sig_v1";
const CPB_PREFIX = "cpb_";
const CPB_STATE_KEY = `${CPB_PREFIX}pb_state_v1`;
const CPB_PROJECT_KEY = `${CPB_PREFIX}pb_project_name_v1`;
const CPB_THEME_KEY = `${CPB_PREFIX}pb_theme_v2`;
const CPB_RETURN_CARD_KEY = `${CPB_PREFIX}return_card_v1`;
const CPB_RETURN_TARGET_KEY = `${CPB_PREFIX}return_target_v1`;
const CPB_COMP_CONTEXT_KEY = `${CPB_PREFIX}pb_comp_context_v1`;

const DEFAULT_HOTKEYS = {
    version: 1,
    actions: {
        addCard: "KeyW",
        switchEditor: "KeyE",
        switchCode: "KeyC",
        toggleSettings: "KeyH",
        toggleHotkeys: "Shift+KeyH",
        generateCode: "KeyK",
        copyCode: "Mod+Shift+KeyC",
        toggleRealtime: "KeyR",
        openBuilderEditor: "KeyB",
        deleteCard: "Backspace",
        fullscreen: "KeyF",
        undo: "Mod+KeyZ",
        redo: "Mod+Shift+KeyZ"
    }
};

const HOTKEY_ACTION_DEFS = [
    { id: "addCard", title: "添加卡片", desc: "默认 W" },
    { id: "switchEditor", title: "切换到编辑页", desc: "默认 E" },
    { id: "switchCode", title: "切换到代码页", desc: "默认 C" },
    { id: "toggleSettings", title: "打开/关闭设置", desc: "默认 H" },
    { id: "toggleHotkeys", title: "打开/关闭快捷键", desc: "默认 Shift+H" },
    { id: "generateCode", title: "重新生成代码", desc: "默认 K" },
    { id: "copyCode", title: "复制 Kotlin", desc: "默认 Ctrl/Cmd+Shift+C" },
    { id: "toggleRealtime", title: "切换实时生成代码", desc: "默认 R" },
    { id: "openBuilderEditor", title: "编辑当前 Builder", desc: "默认 B" },
    { id: "deleteCard", title: "删除选中卡片", desc: "默认 Backspace/Delete" },
    { id: "fullscreen", title: "预览全屏", desc: "默认 F" },
    { id: "undo", title: "撤销", desc: "默认 Ctrl/Cmd+Z" },
    { id: "redo", title: "重做", desc: "默认 Ctrl/Cmd+Shift+Z" }
];

const GLOBAL_VAR_TYPES = [
    "Int",
    "Long",
    "Float",
    "Double",
    "Boolean",
    "String",
    "Vec3",
    "RelativeLocation",
    "Vector3f"
];

const DEFAULT_EFFECT_CLASS = "ControlableEndRodEffect";

const EFFECT_CLASS_OPTIONS = [
    "ControlableEndRodEffect",
    "ControlableEnchantmentEffect",
    "ControlableCloudEffect",
    "ControlableFallingDustEffect",
    "ControlableSplashEffect",
    "ControlableFlashEffect",
    "ControlableFireworkEffect"
];

const CONTROLLER_VAR_TYPES = [
    "Boolean",
    "Int",
    "Float",
    "Double",
    "Long",
    "String"
];

const PARTICLE_INIT_TARGET_OPTIONS = [
    "color",
    "size",
    "particleAlpha",
    "currentAge",
    "textureSheet"
];

const CONTROLLER_ACTION_TYPES = [
    { id: "tick_js", title: "tick action (JS)" }
];

const DISPLAY_ACTION_TYPES = [
    { id: "rotateTo", title: "rotateTo(dir)" },
    { id: "rotateAsAxis", title: "rotateAsAxis(angle)" },
    { id: "rotateToWithAngle", title: "rotateToWithAngle(to, angle)" },
    { id: "expression", title: "表达式" }
];

const CARD_SECTION_KEYS = [
    "base",
    "source",
    "single_particle_init",
    "single_controller_init",
    "shape_base",
    "shape_child_params",
    "shape_axis",
    "shape_display",
    "shape_scale",
    "growth"
];

function createDefaultCardSectionCollapse() {
    const out = {};
    for (const key of CARD_SECTION_KEYS) out[key] = false;
    return out;
}

function normalizeCardSectionCollapse(raw) {
    const base = createDefaultCardSectionCollapse();
    if (!raw || typeof raw !== "object") return base;
    for (const key of CARD_SECTION_KEYS) {
        if (raw[key] === true) base[key] = true;
    }
    return base;
}

const KOTLIN_IDENTIFIER_KEYWORDS = new Set([
    "as", "break", "class", "continue", "do", "else", "false", "for", "fun", "if", "in", "interface", "is",
    "null", "object", "package", "return", "super", "this", "throw", "true", "try", "typealias", "typeof",
    "val", "var", "when", "while"
]);

function isKotlinIdentifier(name) {
    const id = String(name || "").trim();
    if (!id) return false;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) return false;
    return !KOTLIN_IDENTIFIER_KEYWORDS.has(id);
}

function normalizeKotlinSymbolName(name, fallback = "value") {
    let id = sanitizeKotlinIdentifier(name, fallback);
    if (!id) id = fallback;
    if (KOTLIN_IDENTIFIER_KEYWORDS.has(id)) id = `_${id}`;
    return id;
}


function uid() {
    return (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16);
}

function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function int(v) {
    return Math.trunc(num(v));
}

function clamp(v, min, max) {
    let lo = Number(min);
    let hi = Number(max);
    if (!Number.isFinite(lo)) lo = 0;
    if (!Number.isFinite(hi)) hi = lo;
    if (hi < lo) hi = lo;
    return Math.min(Math.max(Number(v) || 0, lo), hi);
}

function esc(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function relExpr(x, y, z) {
    return `RelativeLocation(${U.fmt(num(x))}, ${U.fmt(num(y))}, ${U.fmt(num(z))})`;
}

function sanitizeKotlinIdentifier(name, fallback = "value") {
    const raw = String(name || "").trim();
    const rep = raw.replace(/[^A-Za-z0-9_]/g, "_");
    if (!rep) return fallback;
    if (/^[0-9]/.test(rep)) return `_${rep}`;
    return rep;
}

function sanitizeKotlinClassName(name) {
    const id = sanitizeKotlinIdentifier(name, "NewComposition");
    return /^[A-Z]/.test(id) ? id : id.charAt(0).toUpperCase() + id.slice(1);
}

function normalizeHotkey(hk) {
    if (!hk || typeof hk !== "string") return "";
    const parts = hk.split("+").map((it) => it.trim()).filter(Boolean);
    const hasMod = parts.includes("Mod");
    const hasShift = parts.includes("Shift");
    const hasAlt = parts.includes("Alt");
    const main = parts.find((p) => p !== "Mod" && p !== "Shift" && p !== "Alt") || "";
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
    const code = String(e.code || "");
    const isModifier = code === "ShiftLeft" || code === "ShiftRight"
        || code === "ControlLeft" || code === "ControlRight"
        || code === "MetaLeft" || code === "MetaRight"
        || code === "AltLeft" || code === "AltRight";
    if (code && !isModifier) parts.push(code);
    return normalizeHotkey(parts.join("+"));
}

function hotkeyToHuman(hk) {
    const norm = normalizeHotkey(hk);
    if (!norm) return "";
    return norm.split("+").map((p) => {
        if (p === "Mod") return "Ctrl/Cmd";
        if (p === "Shift") return "Shift";
        if (p === "Alt") return "Alt";
        if (p.startsWith("Key")) return p.slice(3).toUpperCase();
        if (p.startsWith("Digit")) return p.slice(5);
        if (p === "Escape") return "Esc";
        if (p === "Backspace") return "Backspace";
        if (p === "Delete") return "Delete";
        if (p.startsWith("Arrow")) return p.replace("Arrow", "");
        if (p === "Space") return "Space";
        return p;
    }).join("+");
}

function hotkeyMatchEvent(e, hk) {
    return eventToHotkey(e) === normalizeHotkey(hk);
}

function normalizeAngleUnit(unit) {
    return unit === "rad" ? "rad" : "deg";
}

function formatAngleValue(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "0";
    if (Math.abs(n) < 1e-9) return "0";
    return n.toFixed(6).replace(/0+$/g, "").replace(/\.$/, "");
}

function parseVectorLiteralNumbers(rawExpr, fallback = { x: 0, y: 1, z: 0 }) {
    const text = String(rawExpr || "").trim();
    const base = {
        x: Number.isFinite(Number(fallback?.x)) ? num(fallback.x) : 0,
        y: Number.isFinite(Number(fallback?.y)) ? num(fallback.y) : 1,
        z: Number.isFinite(Number(fallback?.z)) ? num(fallback.z) : 0
    };
    const m = text.match(/(?:Vec3|RelativeLocation|Vector3f)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i);
    if (!m) return base;
    const read = (raw, fb) => {
        const n = Number(String(raw || "").trim().replace(/[fFdDlL]/g, ""));
        return Number.isFinite(n) ? n : fb;
    };
    return {
        x: read(m[1], base.x),
        y: read(m[2], base.y),
        z: read(m[3], base.z)
    };
}

const JS_LINT_KEYWORDS = new Set([
    "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "return",
    "let", "const", "var", "function", "class", "new", "this", "typeof", "instanceof",
    "try", "catch", "finally", "throw", "extends", "super", "import", "from", "export", "as",
    "true", "false", "null", "undefined", "in", "of", "await", "async"
]);

const JS_LINT_GLOBALS = new Set([
    "Math", "Random", "Number", "String", "Boolean", "Object", "Array", "Date", "JSON", "console",
    "parseInt", "parseFloat", "isNaN", "isFinite", "Infinity", "NaN",
    "PI", "age", "tick", "index",
    "rotateTo", "rotateAsAxis", "rotateToWithAngle", "addSingle", "addMultiple", "addPreTickAction",
    "setReversedScaleOnCompositionStatus", "particle",
    "thisAt",
    "color", "size", "alpha", "particleColor", "particleSize", "particleAlpha", "currentAge", "textureSheet",
    "RelativeLocation", "Vec3", "Vector3f"
]);

function stripJsForLint(raw) {
    const src = String(raw || "");
    return src.replace(
        /\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
        (m) => " ".repeat(m.length)
    );
}

function collectJsDeclaredNames(raw) {
    const src = stripJsForLint(raw);
    const names = new Set();
    const push = (value) => {
        const name = String(value || "").trim();
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) names.add(name);
    };
    for (const m of src.matchAll(/\b(?:let|const|var|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
        push(m[1]);
    }
    for (const m of src.matchAll(/\bfunction(?:\s+[A-Za-z_$][A-Za-z0-9_$]*)?\s*\(([^)]*)\)/g)) {
        const params = String(m[1] || "").split(",");
        for (const rawParam of params) {
            const head = String(rawParam || "").split("=")[0];
            push(head.trim());
        }
    }
    for (const m of src.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)/g)) {
        push(m[1]);
    }
    for (const m of src.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\s*=>/g)) {
        push(m[1]);
    }
    for (const m of src.matchAll(/\(\s*([^)]*?)\s*\)\s*=>/g)) {
        const params = String(m[1] || "").split(",");
        for (const rawParam of params) {
            const head = String(rawParam || "").split("=")[0];
            push(head.trim());
        }
    }
    return names;
}

function findFirstUnknownJsIdentifier(raw, allowedNames = new Set()) {
    const src = stripJsForLint(raw);
    const local = collectJsDeclaredNames(src);
    for (const m of src.matchAll(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g)) {
        const name = String(m[0] || "");
        if (!name) continue;
        if (JS_LINT_KEYWORDS.has(name)) continue;
        if (JS_LINT_GLOBALS.has(name)) continue;
        if (allowedNames.has(name)) continue;
        if (local.has(name)) continue;
        const idx = Number(m.index) || 0;
        const prev = idx > 0 ? src[idx - 1] : "";
        if (prev === ".") continue;
        let j = idx + name.length;
        while (j < src.length && /\s/.test(src[j])) j += 1;
        if (src[j] === ":") continue;
        return name;
    }
    return "";
}

function safeNumberLiteral(value, kotlinType) {
    const t = String(kotlinType || "").trim().toLowerCase();
    const raw = String(value ?? "").trim();
    if (!raw) {
        if (t === "int") return "0";
        if (t === "float") return "0f";
        if (t === "long") return "0L";
        if (t === "double") return "0.0";
        if (t === "boolean") return "false";
        return "0";
    }
    if (t === "float") {
        if (/^-?\d+(\.\d+)?f$/i.test(raw)) return raw;
        if (/^-?\d+(\.\d+)?$/.test(raw)) return `${raw}f`;
    }
    if (t === "long") {
        if (/^-?\d+L$/i.test(raw)) return raw;
        if (/^-?\d+$/.test(raw)) return `${raw}L`;
    }
    if (t === "double") {
        if (/^-?\d+$/.test(raw)) return `${raw}.0`;
    }
    if (t === "boolean") {
        return /^true$/i.test(raw) ? "true" : "false";
    }
    return raw;
}

function normalizeGlobalVar(v) {
    const x = Object.assign({}, v || {});
    x.id = x.id || uid();
    x.name = String(x.name || "value");
    x.type = String(x.type || "Double");
    x.value = String(x.value ?? "0.0");
    x.codec = x.codec !== false;
    x.mutable = x.mutable !== false;
    return x;
}

function normalizeGlobalConst(v) {
    const x = Object.assign({}, v || {});
    x.id = x.id || uid();
    x.name = String(x.name || "constant");
    x.type = String(x.type || "Int");
    x.value = String(x.value ?? "0");
    return x;
}

function normalizeAnimate(a) {
    const x = Object.assign({}, a || {});
    x.id = x.id || uid();
    x.count = Math.max(1, int(x.count || 1));
    x.condition = String(x.condition || "age > 0");
    return x;
}

function normalizeControllerAction(raw) {
    const x = Object.assign({}, raw || {});
    x.id = x.id || uid();
    x.type = CONTROLLER_ACTION_TYPES.some((it) => it.id === x.type) ? x.type : "tick_js";
    x.script = String(x.script || "");
    return x;
}

function normalizeDisplayAction(a) {
    const x = Object.assign({}, a || {});
    x.id = x.id || uid();
    x.type = DISPLAY_ACTION_TYPES.some((it) => it.id === x.type) ? x.type : "rotateToWithAngle";
    x.toUsePreset = x.toUsePreset === true;
    x.toPreset = String(x.toPreset || "RelativeLocation.yAxis()");
    x.toExpr = String(x.toExpr || x.toPreset || "RelativeLocation.yAxis()");
    x.toManualCtor = normalizeVectorCtor(x.toManualCtor || parseCtorInLiteral(x.toExpr, "RelativeLocation"));
    x.toManualX = Number.isFinite(Number(x.toManualX)) ? num(x.toManualX) : 0;
    x.toManualY = Number.isFinite(Number(x.toManualY)) ? num(x.toManualY) : 1;
    x.toManualZ = Number.isFinite(Number(x.toManualZ)) ? num(x.toManualZ) : 0;
    x.angleMode = x.angleMode === "expr" ? "expr" : "numeric";
    x.angleValue = Number.isFinite(Number(x.angleValue)) ? num(x.angleValue) : 0.05;
    x.angleUnit = normalizeAngleUnit(x.angleUnit || "rad");
    x.angleExpr = String(x.angleExpr || "speed / 180 * PI");
    x.angleExprPreset = String(x.angleExprPreset || x.angleExpr || "speed / 180 * PI");
    x.expression = String(x.expression || "");
    return x;
}

function createDefaultBuilderState() {
    return {
        root: {
            id: "root",
            kind: "ROOT",
            children: []
        }
    };
}

function normalizeBuilderState(raw) {
    const base = createDefaultBuilderState();
    if (!raw || typeof raw !== "object") return base;
    if (raw.root && Array.isArray(raw.root.children)) {
        return { root: { id: "root", kind: "ROOT", children: deepClone(raw.root.children) } };
    }
    if (raw.state && raw.state.root && Array.isArray(raw.state.root.children)) {
        return { root: { id: "root", kind: "ROOT", children: deepClone(raw.state.root.children) } };
    }
    if (Array.isArray(raw.children)) {
        return { root: { id: "root", kind: "ROOT", children: deepClone(raw.children) } };
    }
    if (Array.isArray(raw)) {
        return { root: { id: "root", kind: "ROOT", children: deepClone(raw) } };
    }
    return base;
}

function normalizeShapeNestedLevel(raw, index = 0) {
    const x = Object.assign({}, raw || {});
    x.id = x.id || uid();
    x.collapsed = !!x.collapsed;
    x.type = ["single", "particle_shape", "sequenced_shape"].includes(String(x.type || "")) ? String(x.type) : "single";
    x.effectClass = String(x.effectClass || DEFAULT_EFFECT_CLASS);
    x.bindMode = x.bindMode === "builder" ? "builder" : "point";
    x.point = x.point && typeof x.point === "object" ? x.point : { x: 0, y: 0, z: 0 };
    x.point.x = num(x.point.x);
    x.point.y = num(x.point.y);
    x.point.z = num(x.point.z);
    x.builderState = normalizeBuilderState(x.builderState);
    x.axisPreset = String(x.axisPreset || "RelativeLocation.yAxis()");
    x.axisExpr = String(x.axisExpr || x.axisPreset || "RelativeLocation.yAxis()");
    x.axisManualCtor = normalizeVectorCtor(x.axisManualCtor || parseCtorInLiteral(x.axisExpr, "RelativeLocation"));
    x.axisManualX = Number.isFinite(Number(x.axisManualX)) ? num(x.axisManualX) : 0;
    x.axisManualY = Number.isFinite(Number(x.axisManualY)) ? num(x.axisManualY) : 1;
    x.axisManualZ = Number.isFinite(Number(x.axisManualZ)) ? num(x.axisManualZ) : 0;
    x.displayActions = Array.isArray(x.displayActions) ? x.displayActions.map((a) => normalizeDisplayAction(a)) : [];
    x.scale = normalizeScaleHelperConfig(x.scale, { type: "none" });
    x.growthAnimates = Array.isArray(x.growthAnimates) ? x.growthAnimates.map((it) => normalizeAnimate(it)) : [];
    x.name = String(x.name || `嵌套层 ${index + 2}`);
    return x;
}

function normalizeCard(card, index = 0) {
    const x = Object.assign({}, card || {});
    x.id = x.id || uid();
    x.name = String(x.name || `卡片 ${index + 1}`);
    x.folded = !!x.folded;
    x.sectionCollapse = normalizeCardSectionCollapse(x.sectionCollapse);
    x.bindMode = x.bindMode === "point" ? "point" : "builder";
    x.point = x.point && typeof x.point === "object" ? x.point : { x: 0, y: 0, z: 0 };
    x.point.x = num(x.point.x);
    x.point.y = num(x.point.y);
    x.point.z = num(x.point.z);
    x.builderState = normalizeBuilderState(x.builderState);
    x.builderKotlinOverride = String(x.builderKotlinOverride || "");
    x.dataType = ["single", "particle_shape", "sequenced_shape"].includes(x.dataType) ? x.dataType : "single";
    x.singleEffectClass = String(x.singleEffectClass || DEFAULT_EFFECT_CLASS);
    x.particleInit = Array.isArray(x.particleInit) ? x.particleInit : [];
    x.controllerVars = Array.isArray(x.controllerVars) ? x.controllerVars : [];
    x.particleInit = x.particleInit.map((it) => {
        const preset = String(it?.exprPreset || "");
        const expr = String(it?.expr || preset || "");
        return {
            id: it?.id || uid(),
            target: String(it?.target || "size"),
            expr,
            exprPreset: preset
        };
    });
    x.controllerVars = x.controllerVars.map((it) => ({ id: it.id || uid(), name: String(it.name || "tick"), type: String(it.type || "Boolean"), expr: String(it.expr || "true") }));
    x.controllerActions = Array.isArray(x.controllerActions) ? x.controllerActions.map((it) => normalizeControllerAction(it)) : [];
    const legacyControllerScript = String(x.controllerTickScript || "").trim();
    if (!x.controllerActions.length && legacyControllerScript) {
        x.controllerActions.push(normalizeControllerAction({ type: "tick_js", script: legacyControllerScript }));
    }
    x.controllerTickScript = "";
    x.controllerInitScript = "";
    x.rotateToWithAngle = !!x.rotateToWithAngle;
    x.rotateToUsePreset = x.rotateToUsePreset === true;
    x.rotateToPreset = String(x.rotateToPreset || "RelativeLocation.yAxis()");
    x.rotateToExpr = String(x.rotateToExpr || x.rotateToPreset || "RelativeLocation.yAxis()");
    x.rotateToManualCtor = normalizeVectorCtor(x.rotateToManualCtor || parseCtorInLiteral(x.rotateToExpr, "RelativeLocation"));
    x.rotateToManualX = Number.isFinite(Number(x.rotateToManualX)) ? num(x.rotateToManualX) : 0;
    x.rotateToManualY = Number.isFinite(Number(x.rotateToManualY)) ? num(x.rotateToManualY) : 1;
    x.rotateToManualZ = Number.isFinite(Number(x.rotateToManualZ)) ? num(x.rotateToManualZ) : 0;
    x.rotateAngleMode = x.rotateAngleMode === "expr" ? "expr" : "numeric";
    x.rotateAngleValue = Number.isFinite(Number(x.rotateAngleValue)) ? num(x.rotateAngleValue) : 0.05;
    x.rotateAngleUnit = normalizeAngleUnit(x.rotateAngleUnit || "rad");
    x.rotateAngleExpr = String(x.rotateAngleExpr || "speed / 180 * PI");
    x.rotateAnglePreset = String(x.rotateAnglePreset || x.rotateAngleExpr || "speed / 180 * PI");
    x.growthAnimates = Array.isArray(x.growthAnimates) ? x.growthAnimates.map((it) => normalizeAnimate(it)) : [];
    x.sequencedAnimates = Array.isArray(x.sequencedAnimates) ? x.sequencedAnimates.map((it) => normalizeAnimate(it)) : [];
    x.shapeAxisPreset = String(x.shapeAxisPreset || "RelativeLocation.yAxis()");
    x.shapeAxisExpr = String(x.shapeAxisExpr || x.shapeAxisPreset || "RelativeLocation.yAxis()");
    x.shapeAxisManualCtor = normalizeVectorCtor(x.shapeAxisManualCtor || parseCtorInLiteral(x.shapeAxisExpr, "RelativeLocation"));
    x.shapeAxisManualX = Number.isFinite(Number(x.shapeAxisManualX)) ? num(x.shapeAxisManualX) : 0;
    x.shapeAxisManualY = Number.isFinite(Number(x.shapeAxisManualY)) ? num(x.shapeAxisManualY) : 1;
    x.shapeAxisManualZ = Number.isFinite(Number(x.shapeAxisManualZ)) ? num(x.shapeAxisManualZ) : 0;
    x.shapeDisplayActions = Array.isArray(x.shapeDisplayActions) ? x.shapeDisplayActions.map((a) => normalizeDisplayAction(a)) : [];
    x.shapeScale = normalizeScaleHelperConfig(x.shapeScale, { type: "none" });
    x.shapeBindMode = x.shapeBindMode === "builder" ? "builder" : "point";
    x.shapePoint = x.shapePoint && typeof x.shapePoint === "object" ? x.shapePoint : { x: 0, y: 0, z: 0 };
    x.shapePoint.x = num(x.shapePoint.x);
    x.shapePoint.y = num(x.shapePoint.y);
    x.shapePoint.z = num(x.shapePoint.z);
    x.shapeBuilderState = normalizeBuilderState(x.shapeBuilderState);
    x.shapeChildType = ["single", "particle_shape", "sequenced_shape"].includes(String(x.shapeChildType || ""))
        ? String(x.shapeChildType)
        : "single";
    x.shapeChildEffectClass = String(x.shapeChildEffectClass || x.singleEffectClass || DEFAULT_EFFECT_CLASS);
    x.shapeChildCollapsed = !!x.shapeChildCollapsed;
    x.shapeChildBindMode = x.shapeChildBindMode === "builder" ? "builder" : "point";
    x.shapeChildPoint = x.shapeChildPoint && typeof x.shapeChildPoint === "object" ? x.shapeChildPoint : { x: 0, y: 0, z: 0 };
    x.shapeChildPoint.x = num(x.shapeChildPoint.x);
    x.shapeChildPoint.y = num(x.shapeChildPoint.y);
    x.shapeChildPoint.z = num(x.shapeChildPoint.z);
    x.shapeChildBuilderState = normalizeBuilderState(x.shapeChildBuilderState);
    x.shapeChildAxisPreset = String(x.shapeChildAxisPreset || "RelativeLocation.yAxis()");
    x.shapeChildAxisExpr = String(x.shapeChildAxisExpr || x.shapeChildAxisPreset || "RelativeLocation.yAxis()");
    x.shapeChildAxisManualCtor = normalizeVectorCtor(x.shapeChildAxisManualCtor || parseCtorInLiteral(x.shapeChildAxisExpr, "RelativeLocation"));
    x.shapeChildAxisManualX = Number.isFinite(Number(x.shapeChildAxisManualX)) ? num(x.shapeChildAxisManualX) : 0;
    x.shapeChildAxisManualY = Number.isFinite(Number(x.shapeChildAxisManualY)) ? num(x.shapeChildAxisManualY) : 1;
    x.shapeChildAxisManualZ = Number.isFinite(Number(x.shapeChildAxisManualZ)) ? num(x.shapeChildAxisManualZ) : 0;
    x.shapeChildDisplayActions = Array.isArray(x.shapeChildDisplayActions) ? x.shapeChildDisplayActions.map((a) => normalizeDisplayAction(a)) : [];
    x.shapeChildScale = normalizeScaleHelperConfig(x.shapeChildScale, { type: "none" });
    x.shapeChildGrowthAnimates = Array.isArray(x.shapeChildGrowthAnimates) ? x.shapeChildGrowthAnimates.map((it) => normalizeAnimate(it)) : [];
    x.shapeChildLevels = Array.isArray(x.shapeChildLevels)
        ? x.shapeChildLevels.map((it, i) => normalizeShapeNestedLevel(it, i))
        : [];
    return x;
}

function createDefaultCard(index = 0) {
    return normalizeCard({
        name: `卡片 ${index + 1}`,
        bindMode: "builder",
        point: { x: 0, y: 0, z: 0 },
        builderState: createDefaultBuilderState(),
        dataType: "single",
        singleEffectClass: DEFAULT_EFFECT_CLASS,
        particleInit: [],
        controllerVars: [],
        controllerActions: [],
        controllerInitScript: "",
        controllerTickScript: "",
        rotateToWithAngle: false,
        rotateToUsePreset: false,
        rotateToPreset: "RelativeLocation.yAxis()",
        rotateToExpr: "RelativeLocation.yAxis()",
        rotateAngleMode: "numeric",
        rotateAngleValue: 0.05,
        rotateAngleUnit: "rad",
        rotateAnglePreset: "speed / 180 * PI",
        rotateAngleExpr: "speed / 180 * PI",
        growthAnimates: [],
        sequencedAnimates: [],
        shapeAxisPreset: "RelativeLocation.yAxis()",
        shapeAxisExpr: "RelativeLocation.yAxis()",
        shapeAxisManualCtor: "RelativeLocation",
        shapeAxisManualX: 0,
        shapeAxisManualY: 1,
        shapeAxisManualZ: 0,
        shapeDisplayActions: [],
        shapeScale: { type: "none" },
        shapeBindMode: "point",
        shapePoint: { x: 0, y: 0, z: 0 },
        shapeBuilderState: createDefaultBuilderState(),
        shapeChildType: "single",
        shapeChildEffectClass: DEFAULT_EFFECT_CLASS,
        shapeChildCollapsed: false,
        shapeChildBindMode: "point",
        shapeChildPoint: { x: 0, y: 0, z: 0 },
        shapeChildBuilderState: createDefaultBuilderState(),
        shapeChildAxisPreset: "RelativeLocation.yAxis()",
        shapeChildAxisExpr: "RelativeLocation.yAxis()",
        shapeChildAxisManualCtor: "RelativeLocation",
        shapeChildAxisManualX: 0,
        shapeChildAxisManualY: 1,
        shapeChildAxisManualZ: 0,
        shapeChildDisplayActions: [],
        shapeChildScale: { type: "none" },
        shapeChildGrowthAnimates: [],
        shapeChildLevels: [],
        sectionCollapse: createDefaultCardSectionCollapse()
    }, index);
}

function normalizeStateShape(state) {
    const next = deepClone(state || {});
    if (!next.settings || typeof next.settings !== "object") next.settings = {};
    if (!next.hotkeys || typeof next.hotkeys !== "object") next.hotkeys = {};
    if (!next.hotkeys.actions || typeof next.hotkeys.actions !== "object") next.hotkeys.actions = {};
    next.hotkeys.version = DEFAULT_HOTKEYS.version;
    next.hotkeys.actions = Object.assign({}, DEFAULT_HOTKEYS.actions, next.hotkeys.actions);

    if (!Array.isArray(next.globalVars)) next.globalVars = [];
    if (!Array.isArray(next.globalConsts)) next.globalConsts = [];
    if (!Array.isArray(next.compositionAnimates)) next.compositionAnimates = [];
    if (!Array.isArray(next.displayActions)) next.displayActions = [];
    if (!Array.isArray(next.cards)) next.cards = [];

    next.projectName = String(next.projectName || "NewComposition");
    next.compositionType = next.compositionType === "sequenced" ? "sequenced" : "particle";
    next.disabledInterval = Math.max(0, int(next.disabledInterval || 0));
    next.compositionAxisPreset = String(next.compositionAxisPreset || "RelativeLocation.yAxis()");
    next.compositionAxisExpr = String(next.compositionAxisExpr || next.compositionAxisPreset || "RelativeLocation.yAxis()");
    next.compositionAxisManualCtor = normalizeVectorCtor(next.compositionAxisManualCtor || parseCtorInLiteral(next.compositionAxisExpr, "RelativeLocation"));
    const axisParsed = parseVectorLiteralNumbers(next.compositionAxisExpr, { x: 0, y: 1, z: 0 });
    next.compositionAxisManualX = Number.isFinite(Number(next.compositionAxisManualX)) ? num(next.compositionAxisManualX) : axisParsed.x;
    next.compositionAxisManualY = Number.isFinite(Number(next.compositionAxisManualY)) ? num(next.compositionAxisManualY) : axisParsed.y;
    next.compositionAxisManualZ = Number.isFinite(Number(next.compositionAxisManualZ)) ? num(next.compositionAxisManualZ) : axisParsed.z;

    next.settings.theme = String(next.settings.theme || "dark-1");
    next.settings.paramStep = Math.max(0.000001, num(next.settings.paramStep || 0.1));
    next.settings.pointSize = Math.max(0.001, num(next.settings.pointSize || 0.07));
    next.settings.showAxes = next.settings.showAxes !== false;
    next.settings.showGrid = next.settings.showGrid !== false;
    next.settings.realtimeCode = next.settings.realtimeCode !== false;
    next.settings.leftPanelWidth = clamp(num(next.settings.leftPanelWidth || 560), 400, 1200);
    next.settings.projectSectionHeight = clamp(num(next.settings.projectSectionHeight || 42), 20, 70);
    next.settings.leftPanelTab = next.settings.leftPanelTab === "cards" ? "cards" : "project";
    next.projectScale = normalizeScaleHelperConfig(next.projectScale, { type: "none" });

    next.globalVars = next.globalVars.map((v) => normalizeGlobalVar(v));
    next.globalConsts = next.globalConsts.map((v) => normalizeGlobalConst(v));
    next.compositionAnimates = next.compositionAnimates.map((v) => normalizeAnimate(v));
    next.displayActions = next.displayActions.map((a) => normalizeDisplayAction(a));
    next.cards = next.cards.map((c, i) => normalizeCard(c, i));
    const hasDirectionVar = next.globalVars.some((v) => String(v?.name || "").trim() === "direction");
    if (!hasDirectionVar) {
        for (const act of next.displayActions) {
            if (String(act.toExpr || "").trim() === "direction.asRelative()") {
                act.toExpr = "RelativeLocation.yAxis()";
                act.toPreset = "RelativeLocation.yAxis()";
            }
        }
        for (const card of next.cards) {
            if (String(card.rotateToExpr || "").trim() === "direction.asRelative()") {
                card.rotateToExpr = "RelativeLocation.yAxis()";
                card.rotateToPreset = "RelativeLocation.yAxis()";
            }
            for (const act of (card.shapeDisplayActions || [])) {
                if (String(act.toExpr || "").trim() === "direction.asRelative()") {
                    act.toExpr = "RelativeLocation.yAxis()";
                    act.toPreset = "RelativeLocation.yAxis()";
                }
            }
        }
    }
    next.globalVars = next.globalVars.filter((v) => {
        const name = String(v?.name || "").trim();
        if (name !== "direction") return true;
        const type = String(v?.type || "").trim();
        const value = String(v?.value || "").trim();
        if (type !== "Vec3" || value !== "Vec3.ZERO") return true;
        const used = next.displayActions.some((a) => String(a?.toExpr || "").includes("direction"))
            || next.cards.some((card) => String(card?.rotateToExpr || "").includes("direction")
                || (card?.shapeDisplayActions || []).some((a) => String(a?.toExpr || "").includes("direction")));
        return used;
    });
    if (!next.cards.length) next.cards.push(createDefaultCard(0));

    return next;
}

function createDefaultState() {
    return normalizeStateShape({
        projectName: "NewComposition",
        compositionType: "particle",
        disabledInterval: 0,
        compositionAxisPreset: "RelativeLocation.yAxis()",
        compositionAxisExpr: "RelativeLocation.yAxis()",
        compositionAxisManualCtor: "RelativeLocation",
        compositionAxisManualX: 0,
        compositionAxisManualY: 1,
        compositionAxisManualZ: 0,
        projectScale: {
            type: "none",
            min: 0.01,
            max: 4.0,
            tick: 18,
            c1x: 0.17106,
            c1y: 0.49026,
            c1z: 0.0,
            c2x: -0.771523,
            c2y: -0.116883,
            c2z: 0.0,
            reversedOnDisable: false
        },
        globalVars: [],
        globalConsts: [],
        compositionAnimates: [],
        displayActions: [],
        cards: [createDefaultCard(0)],
        settings: {
            theme: "dark-1",
            paramStep: 0.1,
            pointSize: 0.07,
            showAxes: true,
            showGrid: true,
            realtimeCode: true,
            leftPanelTab: "project"
        },
        hotkeys: deepClone(DEFAULT_HOTKEYS)
    });
}

function normalizeBuilderTarget(targetRaw) {
    const target = String(targetRaw || "").trim();
    if (/^shape_level:\d+$/.test(target)) return target;
    if (target === "shape" || target === "shape_child") return target;
    return "root";
}

function loadStateFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return createDefaultState();
        return normalizeStateShape(JSON.parse(raw));
    } catch (e) {
        console.warn("load state failed:", e);
        return createDefaultState();
    }
}

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
        return { r, u, f };
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
            z: to.r.z * x + to.u.z * y + to.f.z * z
        };
    }
    return points;
}

const BUILDER_EXPR_TAG = "__pbExprNum";
let builderNumericContextProvider = () => ({});

function stripNumericSuffix(raw) {
    return String(raw || "").replace(/(\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)[fFdDlL]\b/g, "$1");
}

function isNumericLiteralText(raw) {
    const s = String(raw || "").trim();
    return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+\-]?\d+)?[fFdDlL]?$/.test(s);
}

function makeExprNumber(expr, value, forceInt = false) {
    const v = Number(value);
    const n = Number.isFinite(v) ? (forceInt ? Math.trunc(v) : v) : 0;
    return {
        [BUILDER_EXPR_TAG]: true,
        expr: String(expr || "").trim(),
        value: n,
        valueOf() {
            return this.value;
        },
        toString() {
            return this.expr || String(this.value);
        }
    };
}

function isExprNumber(v) {
    return !!(v && typeof v === "object" && v[BUILDER_EXPR_TAG]);
}

function extractExprText(v) {
    if (isExprNumber(v)) return String(v.expr || "").trim();
    const s = String(v ?? "").trim();
    if (!s) return "";
    if (isNumericLiteralText(s)) return "";
    return s;
}

function evaluateExprWithMap(rawExpr, vars = {}) {
    const expr = stripNumericSuffix(String(rawExpr || "").trim());
    if (!expr) return 0;
    if (isNumericLiteralText(expr)) {
        const n = Number(expr.replace(/[fFdDlL]/g, ""));
        return Number.isFinite(n) ? n : 0;
    }
    const keys = Object.keys(vars || {});
    const vals = keys.map((k) => Number(vars[k]) || 0);
    try {
        const fn = new Function(...keys, "PI", "Math", `return (${expr});`);
        const out = fn(...vals, Math.PI, Math);
        return Number.isFinite(Number(out)) ? Number(out) : 0;
    } catch {
        return 0;
    }
}

function getBuilderNumericContextMap() {
    try {
        const map = builderNumericContextProvider?.() || {};
        if (map && typeof map === "object") return map;
    } catch {
    }
    return {};
}

function builderNum(v) {
    if (isExprNumber(v)) return v;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v ?? "").trim();
    if (!s) return 0;
    if (isNumericLiteralText(s)) {
        const n = Number(s.replace(/[fFdDlL]/g, ""));
        return Number.isFinite(n) ? n : 0;
    }
    const val = evaluateExprWithMap(s, getBuilderNumericContextMap());
    return makeExprNumber(s, val, false);
}

function builderInt(v) {
    if (isExprNumber(v)) return makeExprNumber(v.expr, v.value, true);
    if (typeof v === "number") return Math.trunc(Number.isFinite(v) ? v : 0);
    const s = String(v ?? "").trim();
    if (!s) return 0;
    if (isNumericLiteralText(s)) {
        const n = Number(s.replace(/[fFdDlL]/g, ""));
        return Math.trunc(Number.isFinite(n) ? n : 0);
    }
    const val = evaluateExprWithMap(s, getBuilderNumericContextMap());
    return makeExprNumber(s, val, true);
}

function builderFmt(v) {
    const expr = extractExprText(v);
    if (expr) return expr;
    const n = Number(v);
    return U.fmt(Number.isFinite(n) ? n : 0);
}

function builderRelExpr(x, y, z) {
    return `RelativeLocation(${builderFmt(builderNum(x))}, ${builderFmt(builderNum(y))}, ${builderFmt(builderNum(z))})`;
}

const builderU = Object.assign({}, U, {
    fmt: (v) => builderFmt(v),
    angleToKotlinRadExpr: (value, unit) => {
        const expr = extractExprText(value);
        if (expr) {
            if (U.normalizeAngleUnit(unit) === "rad") return `(${expr})`;
            return `(${expr})/180*PI`;
        }
        return U.angleToKotlinRadExpr(Number(value) || 0, unit);
    }
});

const KIND = createKindDefs({ U: builderU, num: builderNum, int: builderInt, relExpr: builderRelExpr, rotatePointsToPointUpright });
let builderEvalState = { root: { id: "root", kind: "ROOT", children: [] } };
const builderTools = createBuilderTools({
    KIND,
    U: builderU,
    getState: () => builderEvalState,
    getKotlinEndMode: () => "builder"
});
const { evalBuilderWithMeta, emitKotlin: emitPointsBuilderKotlin } = builderTools;

class CompositionBuilderApp {
    constructor() {
        this.state = loadStateFromStorage();
        this.selectedCardIds = new Set();
        this.focusedCardId = this.state.cards[0]?.id || null;
        if (this.focusedCardId) this.selectedCardIds.add(this.focusedCardId);

        this.undoStack = [];
        this.redoStack = [];
        this.armedHistorySnapshot = null;

        this.currentKotlin = "";
        this.saveTimer = 0;
        this.toastTimer = 0;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.axes = null;
        this.grid = null;
        this.pointsMesh = null;
        this.pointsGeom = null;
        this.pointsMat = null;

        this.previewPoints = [];
        this.previewBasePoints = [];
        this.previewOwners = [];
        this.previewBirthOffsets = [];
        this.previewOwnerLocalIndex = [];
        this.previewOwnerPointCount = [];
        this.previewAnchorBase = [];
        this.previewLocalBase = [];
        this.previewAnchorRef = [];
        this.previewLocalRef = [];
        this.previewLevelBases = [];
        this.previewLevelRefs = [];
        this.previewUseLocalOps = [];
        this.previewVisibleMask = [];
        this.previewSizeFactors = [];
        this.previewAlphaFactors = [];
        this.cardColorCache = new Map();
        this.previewAnimStart = performance.now();
        this.previewPerfLastTs = 0;
        this.previewPaused = false;
        this.previewAutoPaused = false;
        this.previewWasPlayingBeforeAutoPause = false;
        this.lastPointsStatusText = "";
        this.previewCycleCache = null;
        this.previewExprCountCache = new Map();
        this.previewExprPrefixCache = new Map();
        this.previewExprFnCache = new Map();
        this.previewCondFnCache = new Map();
        this.previewNumericFnCache = new Map();
        this.previewRuntimeGlobals = null;
        this.previewRuntimeAppliedTick = -1;
        this.lastExportedStateSig = this.readExportedSignature();

        this.selectState = null;
        this.selectPointerId = null;

        this.hotkeyCaptureActionId = null;
        this.builderModalCardId = null;
        this.bezierToolTarget = { scope: "project", cardId: "" };

        this.exprSuggest = {
            el: null,
            activeInput: null,
            items: [],
            filtered: [],
            token: "",
            range: null,
            active: 0
        };
        this.codeEditors = new Map();

        this.exprRuntime = createExpressionRuntime({
            U,
            getState: () => this.state,
            sanitizeIdentifier: (raw, fallback = "") => sanitizeKotlinIdentifier(raw, fallback)
        });
        builderNumericContextProvider = () => this.getBuilderNumericContextMap();
    }

    init() {
        this.bindDom();
        this.initExpressionSuggest();
        this.consumeBuilderReturnState();
        this.initThree();
        this.applySettingsToDom();
        this.refreshPauseButtonUi();
        this.initLayoutSplitters();
        this.switchPage("editor");
        this.renderProjectSection();
        this.renderCards();
        this.rebuildPreview();
        this.generateCodeAndRender(true);
        this.writeBuilderCompositionContext();
        this.bindEvents();
    }

    bindDom() {
        this.dom = {
            pageEditor: document.getElementById("pageEditor"),
            pageCode: document.getElementById("pageCode"),
            btnPageEditor: document.getElementById("btnPageEditor"),
            btnPageCode: document.getElementById("btnPageCode"),
            btnNewProject: document.getElementById("btnNewProject"),
            btnAddCard: document.getElementById("btnAddCard"),
            btnAddCard2: document.getElementById("btnAddCard2"),
            btnUndo: document.getElementById("btnUndo"),
            btnRedo: document.getElementById("btnRedo"),
            btnSettings: document.getElementById("btnSettings"),
            btnHotkeys: document.getElementById("btnHotkeys"),
            btnImportProject: document.getElementById("btnImportProject"),
            btnExportProject: document.getElementById("btnExportProject"),
            fileProject: document.getElementById("fileProject"),
            chkRealtimeCode: document.getElementById("chkRealtimeCode"),
            btnGenerateCode: document.getElementById("btnGenerateCode"),
            btnCopyCode: document.getElementById("btnCopyCode"),
            btnGenerateCode2: document.getElementById("btnGenerateCode2"),
            btnCopyCode2: document.getElementById("btnCopyCode2"),
            btnDownloadCode: document.getElementById("btnDownloadCode"),
            btnPausePreview: document.getElementById("btnPausePreview"),
            btnReplayPreview: document.getElementById("btnReplayPreview"),
            btnLeftTabProject: document.getElementById("btnLeftTabProject"),
            btnLeftTabCards: document.getElementById("btnLeftTabCards"),
            leftPageProject: document.getElementById("leftPageProject"),
            leftPageCards: document.getElementById("leftPageCards"),
            projectSection: document.getElementById("projectSection"),
            projectCardsResizer: document.getElementById("projectCardsResizer"),
            cardsRoot: document.getElementById("cardsRoot"),
            leftPanel: document.querySelector(".panel.left"),
            editorResizer: document.getElementById("editorResizer"),
            pageEditorWrap: document.getElementById("pageEditor"),
            viewerWrap: document.getElementById("viewerWrap"),
            threeHost: document.getElementById("threeHost"),
            selectBox: document.getElementById("selectBox"),
            statusPoints: document.getElementById("statusPoints"),
            statusSelection: document.getElementById("statusSelection"),
            btnJumpPreviewEnd: document.getElementById("btnJumpPreviewEnd"),
            btnResetCamera: document.getElementById("btnResetCamera"),
            btnFullscreen: document.getElementById("btnFullscreen"),
            kotlinOut: document.getElementById("kotlinOut"),
            settingsMask: document.getElementById("settingsMask"),
            settingsModal: document.getElementById("settingsModal"),
            btnCloseSettings: document.getElementById("btnCloseSettings"),
            inpParamStep: document.getElementById("inpParamStep"),
            inpPointSize: document.getElementById("inpPointSize"),
            themeSelect: document.getElementById("themeSelect"),
            chkAxes: document.getElementById("chkAxes"),
            chkGrid: document.getElementById("chkGrid"),
            chkRealtimeCode2: document.getElementById("chkRealtimeCode2"),
            btnOpenHotkeys: document.getElementById("btnOpenHotkeys"),
            btnExportSettings: document.getElementById("btnExportSettings"),
            btnImportSettings: document.getElementById("btnImportSettings"),
            fileSettings: document.getElementById("fileSettings"),
            hkMask: document.getElementById("hkMask"),
            hkModal: document.getElementById("hkModal"),
            hkSearch: document.getElementById("hkSearch"),
            hkHint: document.getElementById("hkHint"),
            hkList: document.getElementById("hkList"),
            btnCloseHotkeys: document.getElementById("btnCloseHotkeys"),
            btnCloseHotkeys2: document.getElementById("btnCloseHotkeys2"),
            btnHotkeysReset: document.getElementById("btnHotkeysReset"),
            builderMask: document.getElementById("builderMask"),
            builderModal: document.getElementById("builderModal"),
            builderFrame: document.getElementById("builderFrame"),
            btnReloadBuilderFrame: document.getElementById("btnReloadBuilderFrame"),
            btnPullBuilderState: document.getElementById("btnPullBuilderState"),
            btnPullBuilderState2: document.getElementById("btnPullBuilderState2"),
            btnCloseBuilderModal: document.getElementById("btnCloseBuilderModal"),
            btnCloseBuilderModal2: document.getElementById("btnCloseBuilderModal2"),
            bezierMask: document.getElementById("bezierMask"),
            bezierModal: document.getElementById("bezierModal"),
            bezierFrame: document.getElementById("bezierFrame"),
            btnCloseBezierModal: document.getElementById("btnCloseBezierModal"),
            btnCloseBezierModal2: document.getElementById("btnCloseBezierModal2"),
            btnApplyBezierModal: document.getElementById("btnApplyBezierModal")
        };
    }
    bindEvents() {
        const d = this.dom;
        d.btnPageEditor.addEventListener("click", () => this.switchPage("editor"));
        d.btnPageCode.addEventListener("click", () => this.switchPage("code"));
        d.btnNewProject?.addEventListener("click", () => this.handleNewProjectClick());
        d.btnAddCard.addEventListener("click", () => this.addCard());
        d.btnAddCard2.addEventListener("click", () => this.addCard());
        d.btnUndo.addEventListener("click", () => this.undo());
        d.btnRedo.addEventListener("click", () => this.redo());
        d.btnSettings.addEventListener("click", () => this.showSettings());
        d.btnHotkeys.addEventListener("click", () => this.showHotkeys());
        d.btnImportProject.addEventListener("click", () => d.fileProject.click());
        d.btnExportProject.addEventListener("click", () => this.exportProject());
        d.fileProject.addEventListener("change", () => this.importProjectFromFile());
        d.btnLeftTabProject?.addEventListener("click", () => this.switchLeftTab("project"));
        d.btnLeftTabCards?.addEventListener("click", () => this.switchLeftTab("cards"));
        if (d.chkRealtimeCode) d.chkRealtimeCode.addEventListener("change", () => this.setRealtimeCode(d.chkRealtimeCode.checked));
        d.btnGenerateCode.addEventListener("click", () => this.generateCodeAndRender(true));
        d.btnGenerateCode2.addEventListener("click", () => this.generateCodeAndRender(true));
        d.btnCopyCode.addEventListener("click", () => this.copyCode());
        d.btnCopyCode2.addEventListener("click", () => this.copyCode());
        d.btnDownloadCode.addEventListener("click", () => this.downloadCode());

        d.projectSection.addEventListener("click", (e) => this.onProjectClick(e));
        d.projectSection.addEventListener("input", (e) => this.onProjectInput(e));
        d.projectSection.addEventListener("change", (e) => this.onProjectChange(e));

        d.cardsRoot.addEventListener("click", (e) => this.onCardClick(e));
        d.cardsRoot.addEventListener("input", (e) => this.onCardInput(e));
        d.cardsRoot.addEventListener("change", (e) => this.onCardChange(e));
        d.cardsRoot.addEventListener("focusin", (e) => this.onCardFocusIn(e), true);

        d.btnResetCamera.addEventListener("click", () => this.resetCamera());
        d.btnFullscreen.addEventListener("click", () => this.toggleFullscreen());
        d.btnPausePreview?.addEventListener("click", () => this.togglePreviewPause());
        if (d.btnReplayPreview) d.btnReplayPreview.addEventListener("click", () => this.replayPreview());
        if (d.btnJumpPreviewEnd) d.btnJumpPreviewEnd.addEventListener("click", () => this.jumpPreviewToPreFade());

        d.settingsMask.addEventListener("click", () => this.hideSettings());
        d.btnCloseSettings.addEventListener("click", () => this.hideSettings());
        d.inpParamStep.addEventListener("input", () => {
            this.state.settings.paramStep = Math.max(0.000001, num(d.inpParamStep.value));
            this.scheduleSave();
        });
        d.inpPointSize.addEventListener("input", () => {
            this.state.settings.pointSize = Math.max(0.001, num(d.inpPointSize.value));
            if (this.pointsMat) this.pointsMat.size = this.state.settings.pointSize;
            this.scheduleSave();
        });
        d.themeSelect.addEventListener("change", () => {
            this.state.settings.theme = String(d.themeSelect.value || "dark-1");
            this.applyTheme();
            this.scheduleSave();
        });
        d.chkAxes.addEventListener("change", () => {
            this.state.settings.showAxes = !!d.chkAxes.checked;
            if (this.axes) this.axes.visible = this.state.settings.showAxes;
            this.scheduleSave();
        });
        d.chkGrid.addEventListener("change", () => {
            this.state.settings.showGrid = !!d.chkGrid.checked;
            if (this.grid) this.grid.visible = this.state.settings.showGrid;
            this.scheduleSave();
        });
        d.chkRealtimeCode2.addEventListener("change", () => this.setRealtimeCode(d.chkRealtimeCode2.checked));
        d.btnOpenHotkeys.addEventListener("click", () => {
            this.hideSettings();
            this.showHotkeys();
        });
        d.btnExportSettings.addEventListener("click", () => this.exportSettings());
        d.btnImportSettings.addEventListener("click", () => d.fileSettings.click());
        d.fileSettings.addEventListener("change", () => this.importSettingsFromFile());

        d.hkMask.addEventListener("click", () => this.hideHotkeys());
        d.btnCloseHotkeys.addEventListener("click", () => this.hideHotkeys());
        d.btnCloseHotkeys2.addEventListener("click", () => this.hideHotkeys());
        d.hkSearch.addEventListener("input", () => this.renderHotkeysList());
        d.hkList.addEventListener("click", (e) => this.onHotkeyListClick(e));
        d.btnHotkeysReset.addEventListener("click", () => this.resetHotkeys());

        d.builderMask.addEventListener("click", () => this.hideBuilderModal());
        d.btnCloseBuilderModal.addEventListener("click", () => this.hideBuilderModal());
        d.btnCloseBuilderModal2.addEventListener("click", () => this.hideBuilderModal());
        d.btnReloadBuilderFrame.addEventListener("click", () => this.reloadBuilderFrame());
        d.btnPullBuilderState.addEventListener("click", () => this.pullBuilderStateAndClose());
        d.btnPullBuilderState2.addEventListener("click", () => this.pullBuilderStateAndClose());
        d.bezierMask?.addEventListener("click", () => this.closeBezierTool());
        d.btnCloseBezierModal?.addEventListener("click", () => this.closeBezierTool());
        d.btnCloseBezierModal2?.addEventListener("click", () => this.closeBezierTool());
        d.btnApplyBezierModal?.addEventListener("click", () => this.applyBezierToolAndClose());

        document.addEventListener("focusin", (e) => this.onExprFocusIn(e), true);
        document.addEventListener("input", (e) => this.onExprInput(e), true);
        document.addEventListener("keydown", (e) => this.onExprKeydown(e), true);
        document.addEventListener("mousedown", (e) => this.onExprMouseDown(e), true);

        document.addEventListener("focusin", (e) => {
            const el = e.target;
            if (!el) return;
            const tag = String(el.tagName || "").toUpperCase();
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
                if ((el.dataset?.varField === "name" && el.dataset?.varIdx !== undefined)
                    || (el.dataset?.constField === "name" && el.dataset?.constIdx !== undefined)) {
                    el.dataset.prevSymbolName = String(el.value || "");
                }
                if (!this.armedHistorySnapshot) this.armedHistorySnapshot = deepClone(this.state);
            }
        }, true);

        window.addEventListener("keydown", (e) => this.onKeydown(e), true);
        window.addEventListener("resize", () => this.onResize());
        window.addEventListener("blur", () => this.autoPausePreviewByPageState());
        window.addEventListener("focus", () => this.autoResumePreviewByPageState());
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") this.autoPausePreviewByPageState();
            if (document.visibilityState === "visible") this.autoResumePreviewByPageState();
        });
        document.addEventListener("fullscreenchange", () => this.syncFullscreenUi());
        window.addEventListener("message", (e) => {
            if (e?.data?.type === "cpb-builder-return") this.pullBuilderStateAndClose();
        });
    }

    initThree() {
        const host = this.dom.threeHost;
        const width = Math.max(2, host.clientWidth || 2);
        const height = Math.max(2, host.clientHeight || 2);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 5000);
        this.camera.position.set(16, 11, 16);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(width, height);
        host.innerHTML = "";
        host.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.rotateSpeed = 0.8;
        this.controls.panSpeed = 0.8;
        this.controls.zoomSpeed = 0.95;
        this.controls.mouseButtons = {
            LEFT: -1,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.PAN
        };
        this.controls.target.set(0, 0, 0);
        this.controls.update();

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dir = new THREE.DirectionalLight(0xffffff, 0.7);
        dir.position.set(6, 8, 10);
        this.scene.add(dir);

        this.axes = new THREE.AxesHelper(6);
        this.grid = new THREE.GridHelper(200, 200, 0x2b405c, 0x2b405c);
        this.grid.position.y = -0.001;
        this.scene.add(this.axes);
        this.scene.add(this.grid);

        this.pointsGeom = new THREE.BufferGeometry();
        this.pointsMat = new THREE.PointsMaterial({
            size: this.state.settings.pointSize,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true
        });
        this.pointsMat.onBeforeCompile = (shader) => {
            shader.vertexShader = `attribute float aSize;\nattribute float aAlpha;\nvarying float vAlpha;\n${shader.vertexShader}`;
            shader.vertexShader = shader.vertexShader.replace(
                /gl_PointSize\s*=\s*size\s*;/g,
                "gl_PointSize = size * max(aSize, 0.05);\n    vAlpha = clamp(aAlpha, 0.0, 1.0);"
            );
            shader.fragmentShader = `varying float vAlpha;\n${shader.fragmentShader}`;
            shader.fragmentShader = shader.fragmentShader.replace(
                /vec4\s+diffuseColor\s*=\s*vec4\(\s*diffuse\s*,\s*opacity\s*\)\s*;/g,
                "vec4 diffuseColor = vec4( diffuse, opacity * clamp(vAlpha, 0.0, 1.0) );"
            );
        };
        this.pointsMat.customProgramCacheKey = () => "cb_points_size_alpha_v2";
        this.pointsMesh = new THREE.Points(this.pointsGeom, this.pointsMat);
        this.pointsMesh.frustumCulled = false;
        this.scene.add(this.pointsMesh);

        this.applyTheme();
        this.axes.visible = this.state.settings.showAxes;
        this.grid.visible = this.state.settings.showGrid;

        this.bindPreviewSelectionEvents();

        const animate = () => {
            requestAnimationFrame(animate);
            this.controls.update();
            if (!this.previewPaused) this.updatePreviewAnimation();
            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }

    bindPreviewSelectionEvents() {
        const canvas = this.renderer?.domElement;
        if (!canvas) return;
        canvas.addEventListener("contextmenu", (e) => e.preventDefault());
        canvas.addEventListener("pointerdown", (e) => this.onPreviewPointerDown(e), true);
        canvas.addEventListener("pointermove", (e) => this.onPreviewPointerMove(e), true);
        canvas.addEventListener("pointerup", (e) => this.onPreviewPointerUp(e), true);
        canvas.addEventListener("pointercancel", (e) => this.onPreviewPointerUp(e), true);
    }

    applySettingsToDom() {
        const s = this.state.settings;
        this.dom.inpParamStep.value = String(s.paramStep);
        this.dom.inpPointSize.value = String(s.pointSize);
        this.dom.themeSelect.value = s.theme;
        this.dom.chkAxes.checked = !!s.showAxes;
        this.dom.chkGrid.checked = !!s.showGrid;
        if (this.dom.chkRealtimeCode) this.dom.chkRealtimeCode.checked = !!s.realtimeCode;
        this.dom.chkRealtimeCode2.checked = !!s.realtimeCode;
        this.switchLeftTab(String(s.leftPanelTab || "project"), { skipSave: true });
        this.applySplitSizesFromSettings();
        this.applyTheme();
    }

    switchLeftTab(tab, opts = {}) {
        const next = tab === "cards" ? "cards" : "project";
        this.state.settings.leftPanelTab = next;
        this.dom.leftPageProject?.classList.toggle("hidden", next !== "project");
        this.dom.leftPageCards?.classList.toggle("hidden", next !== "cards");
        this.dom.btnLeftTabProject?.classList.toggle("primary", next === "project");
        this.dom.btnLeftTabCards?.classList.toggle("primary", next === "cards");
        if (!opts.skipSave) this.scheduleSave();
        this.onResize();
    }

    applyTheme() {
        const theme = this.state.settings.theme || "dark-1";
        document.body.setAttribute("data-theme", theme);
        if (this.dom?.themeSelect && this.dom.themeSelect.value !== theme) this.dom.themeSelect.value = theme;

        if (this.grid && this.scene) {
            const gridColor = getComputedStyle(document.body).getPropertyValue("--line2").trim() || "#2b405c";
            this.scene.remove(this.grid);
            this.grid.geometry.dispose();
            if (Array.isArray(this.grid.material)) {
                this.grid.material.forEach((m) => m.dispose && m.dispose());
            } else if (this.grid.material && this.grid.material.dispose) {
                this.grid.material.dispose();
            }
            this.grid = new THREE.GridHelper(200, 200, gridColor, gridColor);
            this.grid.position.y = -0.001;
            this.grid.visible = this.state.settings.showGrid;
            this.scene.add(this.grid);
        }
        if (this.axes) this.axes.visible = this.state.settings.showAxes;
        this.rebuildPreview();
    }

    switchPage(page) {
        const isCode = page === "code";
        this.dom.pageEditor.classList.toggle("hidden", isCode);
        this.dom.pageCode.classList.toggle("hidden", !isCode);
        this.dom.btnPageEditor.classList.toggle("primary", !isCode);
        this.dom.btnPageCode.classList.toggle("primary", isCode);
        if (!isCode) this.onResize();
    }

    showSettings() {
        this.dom.settingsModal.classList.remove("hidden");
        this.dom.settingsMask.classList.remove("hidden");
    }

    hideSettings() {
        this.dom.settingsModal.classList.add("hidden");
        this.dom.settingsMask.classList.add("hidden");
    }

    showHotkeys() {
        this.dom.hkSearch.value = "";
        this.renderHotkeysList();
        this.dom.hkModal.classList.remove("hidden");
        this.dom.hkMask.classList.remove("hidden");
        this.dom.hkSearch.focus();
    }

    hideHotkeys() {
        this.hotkeyCaptureActionId = null;
        this.dom.hkHint.textContent = "点击“设置”后按下按键（Esc 取消，Backspace 清空）。";
        this.dom.hkModal.classList.add("hidden");
        this.dom.hkMask.classList.add("hidden");
    }

    renderHotkeysList() {
        const q = String(this.dom.hkSearch.value || "").trim().toLowerCase();
        const section = document.createElement("div");
        section.className = "hk-section";
        section.innerHTML = `<div class="hk-section-title">动作快捷键</div>`;

        for (const def of HOTKEY_ACTION_DEFS) {
            const key = this.state.hotkeys.actions[def.id] || "";
            const hay = `${def.title} ${def.desc} ${hotkeyToHuman(key)}`.toLowerCase();
            if (q && !hay.includes(q)) continue;
            const row = document.createElement("div");
            row.className = "hk-row";
            row.innerHTML = `
                <div class="hk-name">
                    <div class="t">${esc(def.title)}</div>
                    <div class="d">${esc(def.desc)}</div>
                </div>
                <div class="hk-key ${key ? "" : "empty"}">${esc(hotkeyToHuman(key) || "未设置")}</div>
                <div class="preview-actions">
                    <button class="btn small primary" data-act="set-hk" data-hk-id="${def.id}">设置</button>
                    <button class="btn small" data-act="clear-hk" data-hk-id="${def.id}">清空</button>
                </div>
            `;
            section.appendChild(row);
        }
        this.dom.hkList.innerHTML = "";
        this.dom.hkList.appendChild(section);
    }

    onHotkeyListClick(e) {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        const id = btn.dataset.hkId;
        if (!id) return;
        if (act === "set-hk") {
            this.hotkeyCaptureActionId = id;
            const def = HOTKEY_ACTION_DEFS.find((it) => it.id === id);
            this.dom.hkHint.textContent = `正在设置：${def ? def.title : id}（Esc 取消，Backspace 清空）`;
            return;
        }
        if (act === "clear-hk") {
            this.pushHistory();
            this.state.hotkeys.actions[id] = "";
            this.renderHotkeysList();
            this.scheduleSave();
        }
    }

    resetHotkeys() {
        if (!confirm("确定恢复默认快捷键？")) return;
        this.pushHistory();
        this.state.hotkeys = deepClone(DEFAULT_HOTKEYS);
        this.renderHotkeysList();
        this.scheduleSave();
        this.showToast("已恢复默认快捷键", "success");
    }

    setRealtimeCode(v) {
        this.state.settings.realtimeCode = !!v;
        if (this.dom.chkRealtimeCode) this.dom.chkRealtimeCode.checked = !!v;
        this.dom.chkRealtimeCode2.checked = !!v;
        if (v) this.generateCodeAndRender(true);
        this.scheduleSave();
    }

    readExportedSignature() {
        try {
            return String(localStorage.getItem(EXPORTED_SIG_KEY) || "");
        } catch {
            return "";
        }
    }

    writeExportedSignature(sig) {
        const next = String(sig || "");
        this.lastExportedStateSig = next;
        try {
            if (!next) localStorage.removeItem(EXPORTED_SIG_KEY);
            else localStorage.setItem(EXPORTED_SIG_KEY, next);
        } catch {
        }
    }

    captureUserPreferences(stateLike = null) {
        const source = stateLike || this.state || {};
        return {
            settings: deepClone(source.settings || {}),
            hotkeys: deepClone(source.hotkeys || {})
        };
    }

    applyUserPreferences(stateLike, prefLike = null) {
        const next = normalizeStateShape(stateLike || {});
        const pref = prefLike || this.captureUserPreferences();
        if (pref?.settings && typeof pref.settings === "object") {
            next.settings = deepClone(pref.settings);
        }
        if (pref?.hotkeys && typeof pref.hotkeys === "object") {
            next.hotkeys = deepClone(pref.hotkeys);
        }
        return normalizeStateShape(next);
    }

    extractProjectState(stateLike = null) {
        const normalized = normalizeStateShape(deepClone(stateLike || this.state || {}));
        const out = deepClone(normalized);
        delete out.settings;
        delete out.hotkeys;
        return out;
    }

    computeStateSignature(stateLike = null) {
        const target = this.extractProjectState(stateLike || this.state);
        try {
            return JSON.stringify(target || {});
        } catch {
            return String(Date.now());
        }
    }

    isProjectDirtyForExport() {
        const cur = this.computeStateSignature(this.state);
        return !this.lastExportedStateSig || this.lastExportedStateSig !== cur;
    }

    refreshPauseButtonUi() {
        if (!this.dom?.btnPausePreview) return;
        this.dom.btnPausePreview.textContent = this.previewPaused ? "播放" : "暂停";
        this.dom.btnPausePreview.classList.toggle("primary", !!this.previewPaused);
    }

    setPreviewPaused(paused, opts = {}) {
        this.previewPaused = !!paused;
        if (!this.previewPaused && !opts.keepTimeline) {
            this.previewAnimStart = performance.now();
            this.previewPerfLastTs = 0;
        }
        this.refreshPauseButtonUi();
    }

    togglePreviewPause() {
        if (this.previewPaused) {
            this.previewAutoPaused = false;
            this.previewWasPlayingBeforeAutoPause = false;
            this.setPreviewPaused(false);
            return;
        }
        this.setPreviewPaused(true, { keepTimeline: true });
    }

    autoPausePreviewByPageState() {
        if (this.previewPaused) return;
        this.previewWasPlayingBeforeAutoPause = true;
        this.previewAutoPaused = true;
        this.setPreviewPaused(true, { keepTimeline: true });
    }

    autoResumePreviewByPageState() {
        if (!this.previewAutoPaused) return;
        if (this.previewWasPlayingBeforeAutoPause) {
            this.previewAutoPaused = false;
            this.previewWasPlayingBeforeAutoPause = false;
            this.setPreviewPaused(false);
            this.replayPreview();
            return;
        }
        this.previewAutoPaused = false;
        this.previewWasPlayingBeforeAutoPause = false;
    }

    async handleNewProjectClick() {
        const dirty = this.isProjectDirtyForExport();
        if (dirty) {
            const saveFirst = confirm("当前项目尚未导出为 JSON，是否先导出？");
            if (saveFirst) {
                const result = await this.exportProject({ silent: true });
                if (!result?.ok) {
                    if (result?.canceled) this.showToast("已取消新建项目", "info");
                    else this.showToast("导出失败，未新建项目", "error");
                    return;
                }
            } else {
                const discard = confirm("未导出的修改将丢失，确定新建项目吗？");
                if (!discard) return;
            }
        }

        this.pushHistory();
        const prefs = this.captureUserPreferences(this.state);
        this.state = this.applyUserPreferences(createDefaultState(), prefs);
        this.state.projectName = "NewComposition";
        this.state.globalVars = [];
        this.state.globalConsts = [];
        if (!Array.isArray(this.state.cards) || !this.state.cards.length) {
            this.state.cards = [createDefaultCard(0)];
        }
        const firstCard = this.state.cards[0];
        if (firstCard) {
            firstCard.particleInit = [];
            firstCard.controllerVars = [];
            firstCard.controllerActions = [];
            firstCard.controllerInitScript = "";
            firstCard.controllerTickScript = "";
        }
        this.state = normalizeStateShape(this.state);
        if (this.exprRuntime?.invalidateCache) this.exprRuntime.invalidateCache();
        this.undoStack = [];
        this.redoStack = [];
        this.armedHistorySnapshot = null;
        this.focusedCardId = this.state.cards[0]?.id || null;
        this.selectedCardIds = new Set(this.focusedCardId ? [this.focusedCardId] : []);
        this.writeExportedSignature("");
        this.previewAutoPaused = false;
        this.previewWasPlayingBeforeAutoPause = false;
        this.setPreviewPaused(false);
        this.applySettingsToDom();
        this.renderProjectSection();
        this.renderCards();
        this.rebuildPreview();
        this.generateCodeAndRender(true);
        this.scheduleSave();
        this.showToast("已新建项目", "success");
    }

    onProjectClick(e) {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        const idx = int(btn.dataset.idx);
        if (act === "open-project-bezier-tool") {
            this.openBezierTool("project");
            return;
        }
        if (act === "apply-project-axis-manual") {
            this.pushHistory();
            this.state.compositionAxisExpr = formatVectorLiteral(
                this.state.compositionAxisManualCtor,
                this.state.compositionAxisManualX,
                this.state.compositionAxisManualY,
                this.state.compositionAxisManualZ
            );
            this.state.compositionAxisPreset = "";
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: true });
            return;
        }
        if (act === "apply-display-manual-to") {
            const item = this.state.displayActions[idx];
            if (!item) return;
            this.pushHistory();
            item.toExpr = formatVectorLiteral(item.toManualCtor, item.toManualX, item.toManualY, item.toManualZ);
            item.toPreset = "";
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: true });
            return;
        }
        this.pushHistory();
        switch (act) {
            case "add-global-var":
                this.state.globalVars.push(normalizeGlobalVar({ name: `value${this.state.globalVars.length + 1}`, type: "Double", value: "0.0", codec: true, mutable: true }));
                break;
            case "remove-global-var":
                if (idx >= 0 && idx < this.state.globalVars.length) this.state.globalVars.splice(idx, 1);
                break;
            case "add-global-const":
                this.state.globalConsts.push(normalizeGlobalConst({ name: `const${this.state.globalConsts.length + 1}`, type: "Int", value: "0" }));
                break;
            case "remove-global-const":
                if (idx >= 0 && idx < this.state.globalConsts.length) this.state.globalConsts.splice(idx, 1);
                break;
            case "add-comp-animate":
                this.state.compositionAnimates.push(normalizeAnimate({ count: 1, condition: "age > 1" }));
                break;
            case "remove-comp-animate":
                if (idx >= 0 && idx < this.state.compositionAnimates.length) this.state.compositionAnimates.splice(idx, 1);
                break;
            case "add-display-action":
                this.state.displayActions.push(normalizeDisplayAction({}));
                break;
            case "remove-display-action":
                if (idx >= 0 && idx < this.state.displayActions.length) this.state.displayActions.splice(idx, 1);
                break;
            default:
                return;
        }
        this.afterStructureMutate({ rerenderProject: true, rerenderCards: false, rebuildPreview: false });
    }

    onProjectInput(e) {
        const t = e.target;
        if (!t) return;
        if (t.dataset.pf) {
            this.applyProjectFieldInput(t.dataset.pf, t);
            this.afterValueMutate({ rebuildPreview: false });
            return;
        }
        if (t.dataset.projectScaleField) {
            this.applyProjectScaleField(t.dataset.projectScaleField, t);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: t.dataset.projectScaleField === "type" });
            return;
        }
        if (t.dataset.axisField) {
            this.applyProjectAxisField(t.dataset.axisField, t);
            const rerender = ["axisPreset", "axisManualCtor"].includes(t.dataset.axisField);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: rerender });
            return;
        }
        if (t.dataset.varVecIdx !== undefined) {
            const item = this.state.globalVars[int(t.dataset.varVecIdx)];
            if (!item) return;
            this.updateGlobalVarVectorValue(item, t.dataset.varVecAxis, t.value);
            this.syncGlobalVarInlineInputs(t.dataset.varVecIdx, item);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: false });
            return;
        }
        if (t.dataset.varColorIdx !== undefined) {
            const item = this.state.globalVars[int(t.dataset.varColorIdx)];
            if (!item) return;
            this.updateGlobalVarColorValue(item, t.value);
            this.syncGlobalVarInlineInputs(t.dataset.varColorIdx, item);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: false });
            return;
        }
        if (t.dataset.varIdx !== undefined) {
            const item = this.state.globalVars[int(t.dataset.varIdx)];
            if (!item) return;
            this.applyObjectField(item, t.dataset.varField, t);
            if (t.dataset.varField === "type") {
                this.ensureGlobalVarValueShape(item);
            }
            const field = String(t.dataset.varField || "");
            const rebuildPreview = ["name", "type", "value"].includes(field);
            this.afterValueMutate({ rebuildPreview, rerenderCards: field === "name" || field === "type" });
            return;
        }
        if (t.dataset.constIdx !== undefined) {
            const item = this.state.globalConsts[int(t.dataset.constIdx)];
            if (!item) return;
            this.applyObjectField(item, t.dataset.constField, t);
            const field = String(t.dataset.constField || "");
            const rebuildPreview = ["name", "type", "value"].includes(field);
            this.afterValueMutate({ rebuildPreview, rerenderCards: field === "name" || field === "type" });
            return;
        }
        if (t.dataset.compAnimateIdx !== undefined) {
            const item = this.state.compositionAnimates[int(t.dataset.compAnimateIdx)];
            if (!item) return;
            this.applyAnimateField(item, t.dataset.compAnimateField, t);
            this.afterValueMutate({ rebuildPreview: false });
            return;
        }
        if (t.dataset.displayIdx !== undefined) {
            const item = this.state.displayActions[int(t.dataset.displayIdx)];
            if (!item) return;
            this.applyDisplayActionField(item, t.dataset.displayField, t);
            if (["type", "angleMode", "toPreset"].includes(t.dataset.displayField)) {
                this.afterStructureMutate({ rerenderProject: true, rerenderCards: false, rebuildPreview: true });
            } else {
                this.afterValueMutate({ rebuildPreview: true });
            }
        }
    }

    onProjectChange(e) {
        if (this.armedHistorySnapshot) {
            this.pushHistory(this.armedHistorySnapshot);
            this.armedHistorySnapshot = null;
        }
        const t = e.target;
        if (!t) return;
        if (this.commitGlobalSymbolNameOnBlur(t)) return;
        if (t.dataset.projectScaleField) {
            // Fallback for environments where <select> only emits "change".
            this.applyProjectScaleField(t.dataset.projectScaleField, t);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: t.dataset.projectScaleField === "type" });
            return;
        }
        if (t.dataset.axisField) {
            this.applyProjectAxisField(t.dataset.axisField, t);
            const rerender = ["axisPreset", "axisManualCtor"].includes(t.dataset.axisField);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: rerender });
            return;
        }
        if (t.dataset.pf === "compositionType") {
            this.applyProjectFieldInput("compositionType", t);
            this.renderProjectSection();
            this.generateCodeAndRender(this.state.settings.realtimeCode);
            this.scheduleSave();
            return;
        }
        if (t.matches("select,input[type='checkbox']")) {
            // Fallback: some controls only dispatch "change", not "input".
            this.onProjectInput(e);
            this.renderProjectSection();
        }
    }

    applyProjectFieldInput(field, target) {
        if (field === "projectName") {
            this.state.projectName = String(target.value || "");
            return;
        }
        if (field === "compositionType") {
            this.state.compositionType = target.value === "sequenced" ? "sequenced" : "particle";
            return;
        }
        if (field === "disabledInterval") {
            this.state.disabledInterval = Math.max(0, int(target.value || 0));
        }
    }

    findDuplicateGlobalSymbolName(name, scopeKind = "", scopeIndex = -1) {
        const pick = String(name || "").trim();
        if (!pick) return null;
        for (let i = 0; i < this.state.globalVars.length; i++) {
            if (scopeKind === "var" && i === scopeIndex) continue;
            if (String(this.state.globalVars[i]?.name || "").trim() === pick) {
                return { kind: "var", index: i };
            }
        }
        for (let i = 0; i < this.state.globalConsts.length; i++) {
            if (scopeKind === "const" && i === scopeIndex) continue;
            if (String(this.state.globalConsts[i]?.name || "").trim() === pick) {
                return { kind: "const", index: i };
            }
        }
        return null;
    }

    makeUniqueGlobalSymbolName(baseName, scopeKind = "", scopeIndex = -1) {
        const seed = normalizeKotlinSymbolName(baseName, scopeKind === "const" ? "constant" : "value");
        let out = seed;
        let i = 2;
        while (this.findDuplicateGlobalSymbolName(out, scopeKind, scopeIndex)) {
            out = `${seed}_${i}`;
            i += 1;
            if (i > 999) break;
        }
        return out;
    }

    commitGlobalSymbolNameOnBlur(target) {
        const isVar = target?.dataset?.varField === "name" && target?.dataset?.varIdx !== undefined;
        const isConst = target?.dataset?.constField === "name" && target?.dataset?.constIdx !== undefined;
        if (!isVar && !isConst) return false;

        const kind = isVar ? "var" : "const";
        const index = int(isVar ? target.dataset.varIdx : target.dataset.constIdx);
        const list = isVar ? this.state.globalVars : this.state.globalConsts;
        const item = list[index];
        if (!item) return false;

        const fallback = kind === "const" ? "constant" : "value";
        const before = String(target.dataset.prevSymbolName || item.name || "");
        const beforeNorm = normalizeKotlinSymbolName(before, fallback);
        const raw = String(item.name || target.value || "");
        const normalized = normalizeKotlinSymbolName(raw, fallback);

        const duplicate = this.findDuplicateGlobalSymbolName(normalized, kind, index);
        if (duplicate) {
            const restore = this.findDuplicateGlobalSymbolName(beforeNorm, kind, index)
                ? this.makeUniqueGlobalSymbolName(beforeNorm, kind, index)
                : beforeNorm;
            item.name = restore;
            target.value = restore;
            target.dataset.prevSymbolName = restore;
            this.showToast(`名称“${normalized}”已存在，已拒绝重复命名`, "error");
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: false, rerenderCards: true });
            return true;
        }

        if (normalized !== raw || !isKotlinIdentifier(raw)) {
            item.name = normalized;
            target.value = normalized;
            target.dataset.prevSymbolName = normalized;
            this.showToast("名称已按 Kotlin 标识符规则规范化", "info");
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: false, rerenderCards: true });
            return true;
        }

        target.dataset.prevSymbolName = normalized;
        return false;
    }

    syncProjectAxisManualFromExpr() {
        const expr = String(this.state.compositionAxisExpr || this.state.compositionAxisPreset || "RelativeLocation.yAxis()");
        const vec = this.exprRuntime.parseVecLikeValue(expr);
        this.state.compositionAxisManualCtor = normalizeVectorCtor(parseCtorInLiteral(expr, this.state.compositionAxisManualCtor || "RelativeLocation"));
        this.state.compositionAxisManualX = num(vec.x);
        this.state.compositionAxisManualY = num(vec.y);
        this.state.compositionAxisManualZ = num(vec.z);
    }

    applyProjectAxisField(field, target) {
        if (field === "axisPreset") {
            this.state.compositionAxisPreset = String(target.value || "");
            if (this.state.compositionAxisPreset) {
                this.state.compositionAxisExpr = this.state.compositionAxisPreset;
                this.syncProjectAxisManualFromExpr();
            }
            return;
        }
        if (field === "axisExpr") {
            this.state.compositionAxisExpr = String(target.value || "");
            this.state.compositionAxisPreset = "";
            this.syncProjectAxisManualFromExpr();
            return;
        }
        if (field === "axisManualCtor") {
            this.state.compositionAxisManualCtor = normalizeVectorCtor(target.value || "RelativeLocation");
            this.state.compositionAxisExpr = formatVectorLiteral(
                this.state.compositionAxisManualCtor,
                this.state.compositionAxisManualX,
                this.state.compositionAxisManualY,
                this.state.compositionAxisManualZ
            );
            this.state.compositionAxisPreset = "";
            return;
        }
        if (field === "axisManualX" || field === "axisManualY" || field === "axisManualZ") {
            if (field === "axisManualX") this.state.compositionAxisManualX = num(target.value);
            else if (field === "axisManualY") this.state.compositionAxisManualY = num(target.value);
            else this.state.compositionAxisManualZ = num(target.value);
            this.state.compositionAxisExpr = formatVectorLiteral(
                this.state.compositionAxisManualCtor,
                this.state.compositionAxisManualX,
                this.state.compositionAxisManualY,
                this.state.compositionAxisManualZ
            );
            this.state.compositionAxisPreset = "";
        }
    }

    applyProjectScaleField(field, target) {
        const scale = Object.assign({}, normalizeScaleHelperConfig(this.state.projectScale, { type: "none" }));
        this.state.projectScale = scale;
        if (field === "type") {
            const next = String(target.value || "none");
            scale.type = SCALE_HELPER_TYPES.includes(next) ? next : "none";
            return;
        }
        if (field === "reversedOnDisable") {
            scale.reversedOnDisable = !!target.checked;
            return;
        }
        if (field === "tick") {
            scale.tick = Math.max(1, int(target.value || 1));
            return;
        }
        if (["min", "max", "c1x", "c1y", "c1z", "c2x", "c2y", "c2z"].includes(field)) {
            scale[field] = num(target.value);
        }
    }

    syncCardShapeAxisManualFromExpr(card) {
        if (!card) return;
        const expr = String(card.shapeAxisExpr || card.shapeAxisPreset || "RelativeLocation.yAxis()");
        const vec = this.exprRuntime.parseVecLikeValue(expr);
        card.shapeAxisManualCtor = normalizeVectorCtor(parseCtorInLiteral(expr, card.shapeAxisManualCtor || "RelativeLocation"));
        card.shapeAxisManualX = num(vec.x);
        card.shapeAxisManualY = num(vec.y);
        card.shapeAxisManualZ = num(vec.z);
    }

    applyCardShapeAxisField(card, field, target) {
        if (!card) return;
        if (field === "axisPreset") {
            card.shapeAxisPreset = String(target.value || "");
            if (card.shapeAxisPreset) {
                card.shapeAxisExpr = card.shapeAxisPreset;
                this.syncCardShapeAxisManualFromExpr(card);
            }
            return;
        }
        if (field === "axisExpr") {
            card.shapeAxisExpr = String(target.value || "");
            card.shapeAxisPreset = "";
            this.syncCardShapeAxisManualFromExpr(card);
            return;
        }
        if (field === "axisManualCtor") {
            card.shapeAxisManualCtor = normalizeVectorCtor(target.value || "RelativeLocation");
            card.shapeAxisExpr = formatVectorLiteral(
                card.shapeAxisManualCtor,
                card.shapeAxisManualX,
                card.shapeAxisManualY,
                card.shapeAxisManualZ
            );
            card.shapeAxisPreset = "";
            return;
        }
        if (field === "axisManualX" || field === "axisManualY" || field === "axisManualZ") {
            if (field === "axisManualX") card.shapeAxisManualX = num(target.value);
            else if (field === "axisManualY") card.shapeAxisManualY = num(target.value);
            else card.shapeAxisManualZ = num(target.value);
            card.shapeAxisExpr = formatVectorLiteral(
                card.shapeAxisManualCtor,
                card.shapeAxisManualX,
                card.shapeAxisManualY,
                card.shapeAxisManualZ
            );
            card.shapeAxisPreset = "";
        }
    }

    syncCardShapeChildAxisManualFromExpr(card) {
        if (!card) return;
        const expr = String(card.shapeChildAxisExpr || card.shapeChildAxisPreset || "RelativeLocation.yAxis()");
        const vec = this.exprRuntime.parseVecLikeValue(expr);
        card.shapeChildAxisManualCtor = normalizeVectorCtor(parseCtorInLiteral(expr, card.shapeChildAxisManualCtor || "RelativeLocation"));
        card.shapeChildAxisManualX = num(vec.x);
        card.shapeChildAxisManualY = num(vec.y);
        card.shapeChildAxisManualZ = num(vec.z);
    }

    applyCardShapeChildAxisField(card, field, target) {
        if (!card) return;
        if (field === "axisPreset") {
            card.shapeChildAxisPreset = String(target.value || "");
            if (card.shapeChildAxisPreset) {
                card.shapeChildAxisExpr = card.shapeChildAxisPreset;
                this.syncCardShapeChildAxisManualFromExpr(card);
            }
            return;
        }
        if (field === "axisExpr") {
            card.shapeChildAxisExpr = String(target.value || "");
            card.shapeChildAxisPreset = "";
            this.syncCardShapeChildAxisManualFromExpr(card);
            return;
        }
        if (field === "axisManualCtor") {
            card.shapeChildAxisManualCtor = normalizeVectorCtor(target.value || "RelativeLocation");
            card.shapeChildAxisExpr = formatVectorLiteral(
                card.shapeChildAxisManualCtor,
                card.shapeChildAxisManualX,
                card.shapeChildAxisManualY,
                card.shapeChildAxisManualZ
            );
            card.shapeChildAxisPreset = "";
            return;
        }
        if (field === "axisManualX" || field === "axisManualY" || field === "axisManualZ") {
            if (field === "axisManualX") card.shapeChildAxisManualX = num(target.value);
            else if (field === "axisManualY") card.shapeChildAxisManualY = num(target.value);
            else card.shapeChildAxisManualZ = num(target.value);
            card.shapeChildAxisExpr = formatVectorLiteral(
                card.shapeChildAxisManualCtor,
                card.shapeChildAxisManualX,
                card.shapeChildAxisManualY,
                card.shapeChildAxisManualZ
            );
            card.shapeChildAxisPreset = "";
        }
    }

    applyCardScaleField(card, field, target) {
        if (!card) return;
        const scale = Object.assign({}, normalizeScaleHelperConfig(card.shapeScale, { type: "none" }));
        card.shapeScale = scale;
        if (field === "type") {
            const next = String(target.value || "none");
            scale.type = SCALE_HELPER_TYPES.includes(next) ? next : "none";
            return;
        }
        if (field === "reversedOnDisable") {
            scale.reversedOnDisable = !!target.checked;
            return;
        }
        if (field === "tick") {
            scale.tick = Math.max(1, int(target.value || 1));
            return;
        }
        if (["min", "max", "c1x", "c1y", "c1z", "c2x", "c2y", "c2z"].includes(field)) {
            scale[field] = num(target.value);
        }
    }

    applyCardShapeChildScaleField(card, field, target) {
        if (!card) return;
        const scale = Object.assign({}, normalizeScaleHelperConfig(card.shapeChildScale, { type: "none" }));
        card.shapeChildScale = scale;
        if (field === "type") {
            const next = String(target.value || "none");
            scale.type = SCALE_HELPER_TYPES.includes(next) ? next : "none";
            return;
        }
        if (field === "reversedOnDisable") {
            scale.reversedOnDisable = !!target.checked;
            return;
        }
        if (field === "tick") {
            scale.tick = Math.max(1, int(target.value || 1));
            return;
        }
        if (["min", "max", "c1x", "c1y", "c1z", "c2x", "c2y", "c2z"].includes(field)) {
            scale[field] = num(target.value);
        }
    }

    getRootShapeChildLevel(card) {
        if (!card) return normalizeShapeNestedLevel({});
        return normalizeShapeNestedLevel({
            collapsed: !!card.shapeChildCollapsed,
            type: card.shapeChildType,
            effectClass: card.shapeChildEffectClass,
            bindMode: card.shapeChildBindMode,
            point: card.shapeChildPoint,
            builderState: card.shapeChildBuilderState,
            axisPreset: card.shapeChildAxisPreset,
            axisExpr: card.shapeChildAxisExpr,
            axisManualCtor: card.shapeChildAxisManualCtor,
            axisManualX: card.shapeChildAxisManualX,
            axisManualY: card.shapeChildAxisManualY,
            axisManualZ: card.shapeChildAxisManualZ,
            displayActions: card.shapeChildDisplayActions,
            scale: card.shapeChildScale,
            growthAnimates: card.shapeChildGrowthAnimates
        }, 0);
    }

    setRootShapeChildLevel(card, levelRaw) {
        if (!card) return;
        const level = normalizeShapeNestedLevel(levelRaw, 0);
        card.shapeChildCollapsed = !!level.collapsed;
        card.shapeChildType = level.type;
        card.shapeChildEffectClass = level.effectClass;
        card.shapeChildBindMode = level.bindMode;
        card.shapeChildPoint = { x: num(level.point?.x), y: num(level.point?.y), z: num(level.point?.z) };
        card.shapeChildBuilderState = normalizeBuilderState(level.builderState);
        card.shapeChildAxisPreset = String(level.axisPreset || "");
        card.shapeChildAxisExpr = String(level.axisExpr || "");
        card.shapeChildAxisManualCtor = normalizeVectorCtor(level.axisManualCtor || "RelativeLocation");
        card.shapeChildAxisManualX = num(level.axisManualX);
        card.shapeChildAxisManualY = num(level.axisManualY);
        card.shapeChildAxisManualZ = num(level.axisManualZ);
        card.shapeChildDisplayActions = (level.displayActions || []).map((a) => normalizeDisplayAction(a));
        card.shapeChildScale = normalizeScaleHelperConfig(level.scale, { type: "none" });
        card.shapeChildGrowthAnimates = (level.growthAnimates || []).map((a) => normalizeAnimate(a));
    }

    getNestedShapeLevel(card, levelIdx, create = false) {
        if (!card) return null;
        const idx = int(levelIdx);
        if (idx <= 0) return this.getRootShapeChildLevel(card);
        if (!Array.isArray(card.shapeChildLevels)) card.shapeChildLevels = [];
        if (create) {
            while (card.shapeChildLevels.length < idx) {
                card.shapeChildLevels.push(normalizeShapeNestedLevel({}, card.shapeChildLevels.length));
            }
        }
        const hit = card.shapeChildLevels[idx - 1];
        return hit ? normalizeShapeNestedLevel(hit, idx - 1) : null;
    }

    setNestedShapeLevel(card, levelIdx, levelRaw) {
        if (!card) return;
        const idx = int(levelIdx);
        if (idx <= 0) {
            this.setRootShapeChildLevel(card, levelRaw);
            return;
        }
        if (!Array.isArray(card.shapeChildLevels)) card.shapeChildLevels = [];
        while (card.shapeChildLevels.length < idx) {
            card.shapeChildLevels.push(normalizeShapeNestedLevel({}, card.shapeChildLevels.length));
        }
        card.shapeChildLevels[idx - 1] = normalizeShapeNestedLevel(levelRaw, idx - 1);
    }

    addNestedShapeLevel(card, parentLevelIdx = 0) {
        if (!card) return;
        const parentIdx = Math.max(0, int(parentLevelIdx));
        const keep = Math.max(0, parentIdx);
        if (!Array.isArray(card.shapeChildLevels)) card.shapeChildLevels = [];
        card.shapeChildLevels = card.shapeChildLevels.slice(0, keep);
        card.shapeChildLevels.push(normalizeShapeNestedLevel({}, keep));
    }

    removeNestedShapeLevel(card, levelIdx = 1) {
        if (!card) return;
        const idx = int(levelIdx);
        if (idx <= 0) return;
        if (!Array.isArray(card.shapeChildLevels)) card.shapeChildLevels = [];
        if (idx - 1 < card.shapeChildLevels.length) {
            card.shapeChildLevels = card.shapeChildLevels.slice(0, Math.max(0, idx - 1));
        }
    }

    pruneNestedShapeLevels(card) {
        if (!card || !Array.isArray(card.shapeChildLevels)) return;
        const kept = [];
        let parentType = String(card.shapeChildType || "single");
        for (let i = 0; i < card.shapeChildLevels.length; i++) {
            if (parentType === "single") break;
            const lv = normalizeShapeNestedLevel(card.shapeChildLevels[i], i);
            kept.push(lv);
            parentType = lv.type;
        }
        card.shapeChildLevels = kept;
    }

    getShapeChildChain(card) {
        if (!card) return [];
        this.pruneNestedShapeLevels(card);
        const root = this.getRootShapeChildLevel(card);
        const out = [root];
        for (let i = 0; i < (card.shapeChildLevels || []).length; i++) {
            const lv = normalizeShapeNestedLevel(card.shapeChildLevels[i], i);
            out.push(lv);
            if (lv.type === "single") break;
        }
        return out;
    }

    syncNestedLevelAxisManualFromExpr(level) {
        if (!level) return;
        const expr = String(level.axisExpr || level.axisPreset || "RelativeLocation.yAxis()");
        const vec = this.exprRuntime.parseVecLikeValue(expr);
        level.axisManualCtor = normalizeVectorCtor(parseCtorInLiteral(expr, level.axisManualCtor || "RelativeLocation"));
        level.axisManualX = num(vec.x);
        level.axisManualY = num(vec.y);
        level.axisManualZ = num(vec.z);
    }

    applyNestedLevelAxisField(level, field, target) {
        if (!level) return;
        if (field === "axisPreset") {
            level.axisPreset = String(target.value || "");
            if (level.axisPreset) {
                level.axisExpr = level.axisPreset;
                this.syncNestedLevelAxisManualFromExpr(level);
            }
            return;
        }
        if (field === "axisExpr") {
            level.axisExpr = String(target.value || "");
            level.axisPreset = "";
            this.syncNestedLevelAxisManualFromExpr(level);
            return;
        }
        if (field === "axisManualCtor") {
            level.axisManualCtor = normalizeVectorCtor(target.value || "RelativeLocation");
            level.axisExpr = formatVectorLiteral(level.axisManualCtor, level.axisManualX, level.axisManualY, level.axisManualZ);
            level.axisPreset = "";
            return;
        }
        if (field === "axisManualX" || field === "axisManualY" || field === "axisManualZ") {
            if (field === "axisManualX") level.axisManualX = num(target.value);
            else if (field === "axisManualY") level.axisManualY = num(target.value);
            else level.axisManualZ = num(target.value);
            level.axisExpr = formatVectorLiteral(level.axisManualCtor, level.axisManualX, level.axisManualY, level.axisManualZ);
            level.axisPreset = "";
        }
    }

    applyNestedLevelScaleField(level, field, target) {
        if (!level) return;
        const scale = Object.assign({}, normalizeScaleHelperConfig(level.scale, { type: "none" }));
        level.scale = scale;
        if (field === "type") {
            const next = String(target.value || "none");
            scale.type = SCALE_HELPER_TYPES.includes(next) ? next : "none";
            return;
        }
        if (field === "reversedOnDisable") {
            scale.reversedOnDisable = !!target.checked;
            return;
        }
        if (field === "tick") {
            scale.tick = Math.max(1, int(target.value || 1));
            return;
        }
        if (["min", "max", "c1x", "c1y", "c1z", "c2x", "c2y", "c2z"].includes(field)) {
            scale[field] = num(target.value);
        }
    }

    onCardClick(e) {
        const btn = e.target.closest("button[data-act]");
        if (btn) {
            const act = btn.dataset.act;
            const cardId = btn.dataset.cardId || null;
            const idx = int(btn.dataset.idx);
            const levelIdx = int(btn.dataset.shapeLevelIdx);
            if (act === "select-card") {
                this.selectCardById(cardId, e.ctrlKey || e.metaKey);
                return;
            }
            if (act === "toggle-fold") {
                this.toggleCardFold(cardId);
                this.renderCards();
                this.scheduleSave();
                return;
            }
            if (act === "toggle-section-fold") {
                this.toggleCardSectionFold(cardId, btn.dataset.sectionKey || "");
                this.renderCards();
                this.scheduleSave();
                return;
            }
            if (act === "toggle-shape-child-fold") {
                const card = this.getCardById(cardId);
                if (!card) return;
                card.shapeChildCollapsed = !card.shapeChildCollapsed;
                this.renderCards();
                this.scheduleSave();
                return;
            }
            if (act === "toggle-shape-level-fold") {
                const card = this.getCardById(cardId);
                if (!card) return;
                const level = this.getNestedShapeLevel(card, levelIdx, true);
                if (!level) return;
                level.collapsed = !level.collapsed;
                this.setNestedShapeLevel(card, levelIdx, level);
                this.renderCards();
                this.scheduleSave();
                return;
            }
            if (act === "collapse-all-sections") {
                this.setCardAllSectionsCollapsed(cardId, true);
                this.renderCards();
                this.scheduleSave();
                return;
            }
            if (act === "expand-all-sections") {
                this.setCardAllSectionsCollapsed(cardId, false);
                this.renderCards();
                this.scheduleSave();
                return;
            }
            if (act === "apply-card-manual-to") {
                const card = this.getCardById(cardId);
                if (!card) return;
                this.pushHistory();
                card.rotateToExpr = formatVectorLiteral(card.rotateToManualCtor, card.rotateToManualX, card.rotateToManualY, card.rotateToManualZ);
                card.rotateToPreset = "";
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "apply-shape-axis-manual") {
                const card = this.getCardById(cardId);
                if (!card) return;
                this.pushHistory();
                card.shapeAxisExpr = formatVectorLiteral(card.shapeAxisManualCtor, card.shapeAxisManualX, card.shapeAxisManualY, card.shapeAxisManualZ);
                card.shapeAxisPreset = "";
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "apply-shape-display-manual-to") {
                const card = this.getCardById(cardId);
                if (!card) return;
                const item = card.shapeDisplayActions[int(btn.dataset.shapeDisplayIdx)];
                if (!item) return;
                this.pushHistory();
                item.toExpr = formatVectorLiteral(item.toManualCtor, item.toManualX, item.toManualY, item.toManualZ);
                item.toPreset = "";
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "apply-shape-child-axis-manual") {
                const card = this.getCardById(cardId);
                if (!card) return;
                this.pushHistory();
                card.shapeChildAxisExpr = formatVectorLiteral(
                    card.shapeChildAxisManualCtor,
                    card.shapeChildAxisManualX,
                    card.shapeChildAxisManualY,
                    card.shapeChildAxisManualZ
                );
                card.shapeChildAxisPreset = "";
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "apply-shape-child-display-manual-to") {
                const card = this.getCardById(cardId);
                if (!card) return;
                const item = card.shapeChildDisplayActions[int(btn.dataset.shapeChildDisplayIdx)];
                if (!item) return;
                this.pushHistory();
                item.toExpr = formatVectorLiteral(item.toManualCtor, item.toManualX, item.toManualY, item.toManualZ);
                item.toPreset = "";
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "apply-shape-level-axis-manual") {
                const card = this.getCardById(cardId);
                if (!card) return;
                const level = this.getNestedShapeLevel(card, levelIdx, true);
                if (!level) return;
                this.pushHistory();
                level.axisExpr = formatVectorLiteral(level.axisManualCtor, level.axisManualX, level.axisManualY, level.axisManualZ);
                level.axisPreset = "";
                this.setNestedShapeLevel(card, levelIdx, level);
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "apply-shape-level-display-manual-to") {
                const card = this.getCardById(cardId);
                if (!card) return;
                const level = this.getNestedShapeLevel(card, levelIdx, true);
                if (!level) return;
                const item = level.displayActions[int(btn.dataset.shapeLevelDisplayIdx)];
                if (!item) return;
                this.pushHistory();
                item.toExpr = formatVectorLiteral(item.toManualCtor, item.toManualX, item.toManualY, item.toManualZ);
                item.toPreset = "";
                this.setNestedShapeLevel(card, levelIdx, level);
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "open-card-bezier-tool") {
                this.openBezierTool("card", cardId);
                return;
            }
            if (act === "open-child-bezier-tool") {
                this.openBezierTool("shape_child", cardId);
                return;
            }
            if (act === "open-shape-level-bezier-tool") {
                this.openBezierTool("shape_level", cardId, levelIdx);
                return;
            }
            const skipHistory = act === "open-builder-editor"
                || act === "open-shape-builder-editor"
                || act === "open-shape-child-builder-editor"
                || act === "open-shape-level-builder-editor"
                || act === "import-builder-json"
                || act === "import-shape-builder-json"
                || act === "import-shape-child-builder-json"
                || act === "import-shape-level-builder-json"
                || act === "export-builder-json"
                || act === "export-shape-builder-json"
                || act === "export-shape-child-builder-json"
                || act === "export-shape-level-builder-json";
            if (!skipHistory) this.pushHistory();
            switch (act) {
                case "delete-card":
                    this.deleteCardById(cardId);
                    break;
                case "duplicate-card":
                    this.duplicateCardById(cardId);
                    break;
                case "move-card-up":
                    this.moveCard(cardId, -1);
                    break;
                case "move-card-down":
                    this.moveCard(cardId, 1);
                    break;
                case "add-pinit":
                    this.addParticleInit(cardId);
                    break;
                case "remove-pinit":
                    this.removeParticleInit(cardId, idx);
                    break;
                case "add-cvar":
                    this.addControllerVar(cardId);
                    break;
                case "remove-cvar":
                    this.removeControllerVar(cardId, idx);
                    break;
                case "add-caction": {
                    const card = this.getCardById(cardId);
                    if (card) card.controllerActions.push(normalizeControllerAction({ type: "tick_js", script: "" }));
                    break;
                }
                case "remove-caction": {
                    const card = this.getCardById(cardId);
                    if (card && idx >= 0 && idx < card.controllerActions.length) card.controllerActions.splice(idx, 1);
                    break;
                }
                case "add-growth-animate":
                    this.addCardAnimate(cardId, "growthAnimates");
                    break;
                case "remove-growth-animate":
                    this.removeCardAnimate(cardId, "growthAnimates", idx);
                    break;
                case "add-shape-display-action": {
                    const card = this.getCardById(cardId);
                    if (card) card.shapeDisplayActions.push(normalizeDisplayAction({}));
                    break;
                }
                case "remove-shape-display-action": {
                    const card = this.getCardById(cardId);
                    if (card && idx >= 0 && idx < card.shapeDisplayActions.length) card.shapeDisplayActions.splice(idx, 1);
                    break;
                }
                case "add-shape-child-display-action": {
                    const card = this.getCardById(cardId);
                    if (card) card.shapeChildDisplayActions.push(normalizeDisplayAction({}));
                    break;
                }
                case "remove-shape-child-display-action": {
                    const card = this.getCardById(cardId);
                    if (card && idx >= 0 && idx < card.shapeChildDisplayActions.length) card.shapeChildDisplayActions.splice(idx, 1);
                    break;
                }
                case "add-shape-child-growth-animate":
                    this.addCardAnimate(cardId, "shapeChildGrowthAnimates");
                    break;
                case "remove-shape-child-growth-animate":
                    this.removeCardAnimate(cardId, "shapeChildGrowthAnimates", idx);
                    break;
                case "add-shape-child-level": {
                    const card = this.getCardById(cardId);
                    if (card) this.addNestedShapeLevel(card, levelIdx);
                    break;
                }
                case "remove-shape-child-level": {
                    const card = this.getCardById(cardId);
                    if (card) this.removeNestedShapeLevel(card, levelIdx);
                    break;
                }
                case "add-shape-level-display-action": {
                    const card = this.getCardById(cardId);
                    const level = this.getNestedShapeLevel(card, levelIdx, true);
                    if (level) {
                        level.displayActions.push(normalizeDisplayAction({}));
                        this.setNestedShapeLevel(card, levelIdx, level);
                    }
                    break;
                }
                case "remove-shape-level-display-action": {
                    const card = this.getCardById(cardId);
                    const level = this.getNestedShapeLevel(card, levelIdx, true);
                    if (level && idx >= 0 && idx < level.displayActions.length) {
                        level.displayActions.splice(idx, 1);
                        this.setNestedShapeLevel(card, levelIdx, level);
                    }
                    break;
                }
                case "add-shape-level-growth-animate": {
                    const card = this.getCardById(cardId);
                    const level = this.getNestedShapeLevel(card, levelIdx, true);
                    if (level) {
                        if (!Array.isArray(level.growthAnimates)) level.growthAnimates = [];
                        level.growthAnimates.push(normalizeAnimate({ count: 1, condition: "age > 1" }));
                        this.setNestedShapeLevel(card, levelIdx, level);
                    }
                    break;
                }
                case "remove-shape-level-growth-animate": {
                    const card = this.getCardById(cardId);
                    const level = this.getNestedShapeLevel(card, levelIdx, true);
                    if (level && idx >= 0 && idx < level.growthAnimates.length) {
                        level.growthAnimates.splice(idx, 1);
                        this.setNestedShapeLevel(card, levelIdx, level);
                    }
                    break;
                }
                case "add-seq-animate":
                    this.addCardAnimate(cardId, "sequencedAnimates");
                    break;
                case "remove-seq-animate":
                    this.removeCardAnimate(cardId, "sequencedAnimates", idx);
                    break;
                case "open-builder-editor":
                    this.openBuilderEditor(cardId);
                    return;
                case "open-shape-builder-editor":
                    this.openBuilderEditor(cardId, "shape");
                    return;
                case "open-shape-child-builder-editor":
                    this.openBuilderEditor(cardId, "shape_child");
                    return;
                case "open-shape-level-builder-editor":
                    this.openBuilderEditor(cardId, `shape_level:${levelIdx}`);
                    return;
                case "import-builder-json":
                    this.importBuilderJson(cardId);
                    return;
                case "import-shape-builder-json":
                    this.importBuilderJson(cardId, "shape");
                    return;
                case "import-shape-child-builder-json":
                    this.importBuilderJson(cardId, "shape_child");
                    return;
                case "import-shape-level-builder-json":
                    this.importBuilderJson(cardId, `shape_level:${levelIdx}`);
                    return;
                case "export-builder-json":
                    this.exportBuilderJson(cardId);
                    return;
                case "export-shape-builder-json":
                    this.exportBuilderJson(cardId, "shape");
                    return;
                case "export-shape-child-builder-json":
                    this.exportBuilderJson(cardId, "shape_child");
                    return;
                case "export-shape-level-builder-json":
                    this.exportBuilderJson(cardId, `shape_level:${levelIdx}`);
                    return;
                case "clear-builder":
                    this.clearBuilder(cardId);
                    break;
                case "clear-shape-builder":
                    this.clearBuilder(cardId, "shape");
                    break;
                case "clear-shape-child-builder":
                    this.clearBuilder(cardId, "shape_child");
                    break;
                case "clear-shape-level-builder":
                    this.clearBuilder(cardId, `shape_level:${levelIdx}`);
                    break;
                default:
                    return;
            }
            const card = this.getCardById(cardId);
            if (card) this.pruneNestedShapeLevels(card);
            this.afterStructureMutate({ rerenderProject: false, rerenderCards: true, rebuildPreview: true });
            return;
        }

        const head = e.target.closest(".card-head[data-card-id]");
        if (head) {
            this.selectCardById(head.dataset.cardId, e.ctrlKey || e.metaKey);
        }
    }

    onCardInput(e) {
        const t = e.target;
        if (!t) return;
        const cardId = t.dataset.cardId;
        if (!cardId) return;
        const card = this.getCardById(cardId);
        if (!card) return;

        if (t.dataset.cardField) {
            this.applyObjectField(card, t.dataset.cardField, t);
            if (t.dataset.cardField === "rotateToPreset") {
                card.rotateToExpr = card.rotateToPreset || card.rotateToExpr;
                const vec = this.exprRuntime.parseVecLikeValue(card.rotateToExpr || "");
                card.rotateToManualCtor = normalizeVectorCtor(parseCtorInLiteral(card.rotateToExpr || "", card.rotateToManualCtor || "RelativeLocation"));
                card.rotateToManualX = num(vec.x);
                card.rotateToManualY = num(vec.y);
                card.rotateToManualZ = num(vec.z);
            }
            if (t.dataset.cardField === "rotateToExpr") {
                const vec = this.exprRuntime.parseVecLikeValue(card.rotateToExpr || "");
                card.rotateToManualCtor = normalizeVectorCtor(parseCtorInLiteral(card.rotateToExpr || "", card.rotateToManualCtor || "RelativeLocation"));
                card.rotateToManualX = num(vec.x);
                card.rotateToManualY = num(vec.y);
                card.rotateToManualZ = num(vec.z);
                card.rotateToPreset = "";
            }
            if (t.dataset.cardField === "rotateToManualCtor") {
                card.rotateToManualCtor = normalizeVectorCtor(card.rotateToManualCtor || "RelativeLocation");
                card.rotateToExpr = formatVectorLiteral(card.rotateToManualCtor, card.rotateToManualX, card.rotateToManualY, card.rotateToManualZ);
                card.rotateToPreset = "";
            }
            if (["rotateToManualX", "rotateToManualY", "rotateToManualZ"].includes(t.dataset.cardField)) {
                card.rotateToExpr = formatVectorLiteral(card.rotateToManualCtor, card.rotateToManualX, card.rotateToManualY, card.rotateToManualZ);
                card.rotateToPreset = "";
            }
            if (t.dataset.cardField === "rotateAnglePreset") {
                card.rotateAnglePreset = String(card.rotateAnglePreset || "");
                card.rotateAngleExpr = card.rotateAnglePreset;
            }
            if (["bindMode", "dataType", "rotateAngleMode", "rotateToPreset", "rotateToManualCtor"].includes(t.dataset.cardField)) {
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
                return;
            }
            this.afterValueMutate({ rebuildPreview: true });
            return;
        }

        if (t.dataset.cardShapeAxisField) {
            this.applyCardShapeAxisField(card, t.dataset.cardShapeAxisField, t);
            const rerender = ["axisPreset", "axisManualCtor"].includes(t.dataset.cardShapeAxisField);
            this.afterValueMutate({ rerenderCards: rerender, rebuildPreview: true });
            return;
        }

        if (t.dataset.cardShapeField) {
            const field = String(t.dataset.cardShapeField || "");
            if (field === "bindMode") {
                card.shapeBindMode = t.value === "builder" ? "builder" : "point";
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
                return;
            }
            if (field === "pointX" || field === "pointY" || field === "pointZ") {
                if (field === "pointX") card.shapePoint.x = num(t.value);
                if (field === "pointY") card.shapePoint.y = num(t.value);
                if (field === "pointZ") card.shapePoint.z = num(t.value);
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
        }

        if (t.dataset.cardShapeChildField) {
            const field = String(t.dataset.cardShapeChildField || "");
            if (field === "shapeChildType") {
                card.shapeChildType = ["single", "particle_shape", "sequenced_shape"].includes(String(t.value || "")) ? String(t.value) : "single";
                if (card.shapeChildType === "single") {
                    card.shapeChildCollapsed = false;
                    card.shapeChildLevels = [];
                } else if (!Array.isArray(card.shapeChildLevels) || !card.shapeChildLevels.length) {
                    card.shapeChildLevels = [normalizeShapeNestedLevel({ type: "single" }, 0)];
                }
                this.pruneNestedShapeLevels(card);
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
                return;
            }
            if (field === "bindMode") {
                card.shapeChildBindMode = t.value === "builder" ? "builder" : "point";
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
                return;
            }
            if (field === "pointX" || field === "pointY" || field === "pointZ") {
                if (field === "pointX") card.shapeChildPoint.x = num(t.value);
                if (field === "pointY") card.shapeChildPoint.y = num(t.value);
                if (field === "pointZ") card.shapeChildPoint.z = num(t.value);
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
            if (field === "shapeChildEffectClass") {
                card.shapeChildEffectClass = String(t.value || DEFAULT_EFFECT_CLASS);
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
        }

        if (t.dataset.shapeLevelIdx !== undefined) {
            const levelIdx = int(t.dataset.shapeLevelIdx);
            const field = String(t.dataset.shapeLevelField || "");
            const level = this.getNestedShapeLevel(card, levelIdx, true);
            if (!level) return;
            if (field === "type") {
                level.type = ["single", "particle_shape", "sequenced_shape"].includes(String(t.value || "")) ? String(t.value) : "single";
                this.setNestedShapeLevel(card, levelIdx, level);
                if (level.type === "single") {
                    this.removeNestedShapeLevel(card, levelIdx + 1);
                } else {
                    const next = this.getNestedShapeLevel(card, levelIdx + 1, true);
                    if (next) {
                        next.type = ["single", "particle_shape", "sequenced_shape"].includes(String(next.type || "")) ? String(next.type) : "single";
                        this.setNestedShapeLevel(card, levelIdx + 1, next);
                    }
                }
                this.pruneNestedShapeLevels(card);
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
                return;
            }
            if (field === "bindMode") {
                level.bindMode = t.value === "builder" ? "builder" : "point";
                this.setNestedShapeLevel(card, levelIdx, level);
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
                return;
            }
            if (field === "pointX" || field === "pointY" || field === "pointZ") {
                if (field === "pointX") level.point.x = num(t.value);
                if (field === "pointY") level.point.y = num(t.value);
                if (field === "pointZ") level.point.z = num(t.value);
                this.setNestedShapeLevel(card, levelIdx, level);
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
            if (field === "effectClass") {
                level.effectClass = String(t.value || DEFAULT_EFFECT_CLASS);
                this.setNestedShapeLevel(card, levelIdx, level);
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
        }

        if (t.dataset.shapeLevelAxisField) {
            const levelIdx = int(t.dataset.shapeLevelIdx);
            const level = this.getNestedShapeLevel(card, levelIdx, true);
            if (!level) return;
            this.applyNestedLevelAxisField(level, t.dataset.shapeLevelAxisField, t);
            this.setNestedShapeLevel(card, levelIdx, level);
            const rerender = ["axisPreset", "axisManualCtor"].includes(t.dataset.shapeLevelAxisField);
            this.afterValueMutate({ rerenderCards: rerender, rebuildPreview: true });
            return;
        }

        if (t.dataset.shapeLevelScaleField) {
            const levelIdx = int(t.dataset.shapeLevelIdx);
            const level = this.getNestedShapeLevel(card, levelIdx, true);
            if (!level) return;
            this.applyNestedLevelScaleField(level, t.dataset.shapeLevelScaleField, t);
            this.setNestedShapeLevel(card, levelIdx, level);
            this.afterValueMutate({ rerenderCards: t.dataset.shapeLevelScaleField === "type", rebuildPreview: true });
            return;
        }

        if (t.dataset.shapeLevelDisplayIdx !== undefined) {
            const levelIdx = int(t.dataset.shapeLevelIdx);
            const level = this.getNestedShapeLevel(card, levelIdx, true);
            if (!level) return;
            const item = level.displayActions[int(t.dataset.shapeLevelDisplayIdx)];
            if (!item) return;
            this.applyDisplayActionField(item, t.dataset.shapeLevelDisplayField, t);
            this.setNestedShapeLevel(card, levelIdx, level);
            if (["type", "angleMode", "toPreset"].includes(t.dataset.shapeLevelDisplayField)) {
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
            } else {
                this.afterValueMutate({ rebuildPreview: true });
            }
            return;
        }

        if (t.dataset.cardShapeChildAxisField) {
            this.applyCardShapeChildAxisField(card, t.dataset.cardShapeChildAxisField, t);
            const rerender = ["axisPreset", "axisManualCtor"].includes(t.dataset.cardShapeChildAxisField);
            this.afterValueMutate({ rerenderCards: rerender, rebuildPreview: true });
            return;
        }

        if (t.dataset.cardShapeChildScaleField) {
            this.applyCardShapeChildScaleField(card, t.dataset.cardShapeChildScaleField, t);
            this.afterValueMutate({ rerenderCards: t.dataset.cardShapeChildScaleField === "type", rebuildPreview: true });
            return;
        }

        if (t.dataset.cardShapeChildDisplayIdx !== undefined) {
            const item = card.shapeChildDisplayActions[int(t.dataset.cardShapeChildDisplayIdx)];
            if (!item) return;
            this.applyDisplayActionField(item, t.dataset.cardShapeChildDisplayField, t);
            if (["type", "angleMode", "toPreset"].includes(t.dataset.cardShapeChildDisplayField)) {
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
            } else {
                this.afterValueMutate({ rebuildPreview: true });
            }
            return;
        }

        if (t.dataset.cardScaleField) {
            this.applyCardScaleField(card, t.dataset.cardScaleField, t);
            this.afterValueMutate({ rerenderCards: t.dataset.cardScaleField === "type", rebuildPreview: true });
            return;
        }

        if (t.dataset.cardShapeDisplayIdx !== undefined) {
            const item = card.shapeDisplayActions[int(t.dataset.cardShapeDisplayIdx)];
            if (!item) return;
            this.applyDisplayActionField(item, t.dataset.cardShapeDisplayField, t);
            if (["type", "angleMode", "toPreset"].includes(t.dataset.cardShapeDisplayField)) {
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
            } else {
                this.afterValueMutate({ rebuildPreview: true });
            }
            return;
        }

        if (t.dataset.cardPointField) {
            this.applyObjectField(card.point, t.dataset.cardPointField, t);
            this.afterValueMutate({ rebuildPreview: true });
            return;
        }

        if (t.dataset.pinitIdx !== undefined) {
            const item = card.particleInit[int(t.dataset.pinitIdx)];
            if (!item) return;
            const field = String(t.dataset.pinitField || "");
            if (field === "target") {
                const prevTarget = String(item.target || "");
                const prevDefault = this.getParticleInitDefaultExprByTarget(prevTarget);
                const hadPreset = !!String(item.exprPreset || "").trim();
                item.target = String(t.value || "size");
                let nextExpr = String(item.expr || "").trim();
                if (!hadPreset) {
                    if (!nextExpr || nextExpr === prevDefault) {
                        nextExpr = this.getParticleInitDefaultExprByTarget(item.target);
                    }
                }
                let nextPreset = this.resolveParticleInitPresetExpr(nextExpr, item.target);
                if (hadPreset && !nextPreset) {
                    nextExpr = this.getParticleInitDefaultExprByTarget(item.target);
                    nextPreset = this.resolveParticleInitPresetExpr(nextExpr, item.target);
                }
                item.expr = nextExpr;
                item.exprPreset = nextPreset;
                this.afterValueMutate({ rebuildPreview: true, rerenderCards: true });
                return;
            }
            if (field === "exprPreset") {
                const prevPreset = String(item.exprPreset || "").trim();
                item.exprPreset = String(t.value || "");
                if (item.exprPreset) item.expr = item.exprPreset;
                else if (!String(item.expr || "").trim() || String(item.expr || "").trim() === prevPreset) {
                    item.expr = this.getParticleInitDefaultExprByTarget(item.target);
                }
                this.afterValueMutate({ rebuildPreview: true, rerenderCards: true });
                return;
            }
            if (field === "expr") {
                item.expr = String(t.value || "");
                item.exprPreset = this.resolveParticleInitPresetExpr(item.expr, item.target);
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
            this.applyObjectField(item, field, t);
            this.afterValueMutate({ rebuildPreview: true });
            return;
        }

        if (t.dataset.cvarIdx !== undefined) {
            const item = card.controllerVars[int(t.dataset.cvarIdx)];
            if (!item) return;
            this.applyObjectField(item, t.dataset.cvarField, t);
            this.afterValueMutate({ rebuildPreview: false });
            return;
        }

        if (t.dataset.cactIdx !== undefined) {
            const item = card.controllerActions[int(t.dataset.cactIdx)];
            if (!item) return;
            this.applyObjectField(item, t.dataset.cactField, t);
            this.afterValueMutate({ rebuildPreview: true, rerenderCards: t.dataset.cactField === "type" });
            return;
        }

        if (t.dataset.cardAnimateIdx !== undefined) {
            const idx = int(t.dataset.cardAnimateIdx);
            const key = t.dataset.cardAnimateType;
            if (!key) return;
            if (String(key).startsWith("shapeLevelGrowth:")) {
                const levelIdx = int(String(key).split(":")[1]);
                const level = this.getNestedShapeLevel(card, levelIdx, true);
                if (!level || !Array.isArray(level.growthAnimates)) return;
                const item = level.growthAnimates[idx];
                if (!item) return;
                this.applyAnimateField(item, t.dataset.cardAnimateField, t);
                this.setNestedShapeLevel(card, levelIdx, level);
                this.afterValueMutate({ rebuildPreview: false });
                return;
            }
            if (!["growthAnimates", "sequencedAnimates", "shapeChildGrowthAnimates"].includes(key)) return;
            const item = card[key] && card[key][idx];
            if (!item) return;
            this.applyAnimateField(item, t.dataset.cardAnimateField, t);
            this.afterValueMutate({ rebuildPreview: false });
        }
    }

    onCardChange(e) {
        if (this.armedHistorySnapshot) {
            this.pushHistory(this.armedHistorySnapshot);
            this.armedHistorySnapshot = null;
        }
        const t = e?.target;
        if (!t || !t.matches) return;
        if (!t.matches("select,input[type='checkbox']")) return;
        // Fallback: some card controls (especially <select>) only emit "change".
        this.onCardInput(e);
    }

    onCardFocusIn(e) {
        const target = e?.target;
        if (!target || !target.closest) return;
        const subgroup = target.closest(".subgroup.collapsed[data-card-id][data-section-key]");
        if (!subgroup) return;
        const cardId = String(subgroup.dataset.cardId || "");
        const sectionKey = String(subgroup.dataset.sectionKey || "");
        const card = this.getCardById(cardId);
        if (!card) return;
        this.setCardSectionCollapsed(card, sectionKey, false);
        this.renderCards();
        this.scheduleSave();
    }

    applyObjectField(obj, field, target) {
        if (!obj || !field) return;
        if (target.type === "checkbox") {
            obj[field] = !!target.checked;
            return;
        }
        if (target.type === "number") {
            obj[field] = num(target.value);
            return;
        }
        obj[field] = String(target.value ?? "");
    }

    applyAnimateField(item, field, target) {
        if (!item) return;
        if (field === "count") {
            item.count = Math.max(1, int(target.value || 1));
            return;
        }
        if (field === "condition") item.condition = String(target.value || "true");
    }

    applyDisplayActionField(item, field, target) {
        if (!item) return;
        if (field === "type") {
            item.type = DISPLAY_ACTION_TYPES.some((it) => it.id === target.value) ? target.value : "rotateToWithAngle";
            if (!item.toExpr) item.toExpr = "RelativeLocation.yAxis()";
            if (!item.toPreset) item.toPreset = "RelativeLocation.yAxis()";
            if (!item.angleExpr) item.angleExpr = "speed / 180 * PI";
            if (!item.angleExprPreset) item.angleExprPreset = item.angleExpr;
            return;
        }
        if (field === "toPreset") {
            item.toPreset = String(target.value || "");
            item.toExpr = item.toPreset || item.toExpr;
            const vec = this.exprRuntime.parseVecLikeValue(item.toExpr || "");
            item.toManualCtor = normalizeVectorCtor(parseCtorInLiteral(item.toExpr || "", item.toManualCtor || "RelativeLocation"));
            item.toManualX = num(vec.x);
            item.toManualY = num(vec.y);
            item.toManualZ = num(vec.z);
            return;
        }
        if (field === "toExpr") {
            item.toExpr = String(target.value || "");
            item.toPreset = "";
            const vec = this.exprRuntime.parseVecLikeValue(item.toExpr || "");
            item.toManualCtor = normalizeVectorCtor(parseCtorInLiteral(item.toExpr || "", item.toManualCtor || "RelativeLocation"));
            item.toManualX = num(vec.x);
            item.toManualY = num(vec.y);
            item.toManualZ = num(vec.z);
            return;
        }
        if (field === "toManualCtor") {
            item.toManualCtor = normalizeVectorCtor(target.value || "RelativeLocation");
            item.toExpr = formatVectorLiteral(item.toManualCtor, item.toManualX, item.toManualY, item.toManualZ);
            item.toPreset = "";
            return;
        }
        if (field === "toManualX" || field === "toManualY" || field === "toManualZ") {
            item[field] = num(target.value);
            item.toExpr = formatVectorLiteral(item.toManualCtor, item.toManualX, item.toManualY, item.toManualZ);
            item.toPreset = "";
            return;
        }
        if (field === "angleMode") {
            item.angleMode = target.value === "expr" ? "expr" : "numeric";
            return;
        }
        if (field === "angleValue") {
            item.angleValue = num(target.value);
            return;
        }
        if (field === "angleUnit") {
            item.angleUnit = normalizeAngleUnit(target.value);
            return;
        }
        if (field === "angleExpr") {
            item.angleExpr = String(target.value || "");
            return;
        }
        if (field === "angleExprPreset") {
            item.angleExprPreset = String(target.value || "");
            item.angleExpr = item.angleExprPreset;
            return;
        }
        if (field === "expression") {
            item.expression = String(target.value || "");
        }
    }

    countBuilderNodes(nodes) {
        const list = Array.isArray(nodes) ? nodes : [];
        let count = 0;
        const walk = (arr) => {
            for (const n of arr) {
                if (!n) continue;
                count += 1;
                if (Array.isArray(n.children) && n.children.length) walk(n.children);
            }
        };
        walk(list);
        return count;
    }

    evaluateBuilderPoints(builderState) {
        const old = builderEvalState;
        try {
            builderEvalState = normalizeBuilderState(builderState);
            const nodes = builderEvalState?.root?.children || [];
            return evalBuilderWithMeta(nodes, this.resolveCompositionAxisDirection());
        } catch (e) {
            console.warn("evaluateBuilderPoints failed:", e);
            return { points: [], segments: new Map() };
        } finally {
            builderEvalState = old;
        }
    }

    getCardById(cardId) {
        if (!cardId) return null;
        return this.state.cards.find((c) => c.id === cardId) || null;
    }

    getCardIndexById(cardId) {
        return this.state.cards.findIndex((c) => c.id === cardId);
    }

    ensureSelectionValid() {
        const ids = new Set(this.state.cards.map((c) => c.id));
        const next = new Set();
        for (const id of this.selectedCardIds) {
            if (ids.has(id)) next.add(id);
        }
        this.selectedCardIds = next;
        if (!this.focusedCardId || !ids.has(this.focusedCardId)) {
            this.focusedCardId = this.state.cards[0]?.id || null;
        }
        if (!this.selectedCardIds.size && this.focusedCardId) {
            this.selectedCardIds.add(this.focusedCardId);
        }
    }

    getFocusedCard() {
        return this.getCardById(this.focusedCardId);
    }

    selectCardById(cardId, append = false) {
        const card = this.getCardById(cardId);
        if (!card) return;
        if (card.folded) card.folded = false;
        if (this.isCardAllSectionsCollapsed(card)) {
            this.setCardAllSectionsCollapsed(card.id, false);
        }
        if (!append) this.selectedCardIds.clear();
        if (append && this.selectedCardIds.has(card.id) && this.selectedCardIds.size > 1) {
            this.selectedCardIds.delete(card.id);
        } else {
            this.selectedCardIds.add(card.id);
            this.focusedCardId = card.id;
        }
        this.ensureSelectionValid();
        this.renderCards();
        this.updatePreviewGeometry(this.previewPoints, this.previewOwners);
        this.updateSelectionStatus();
    }

    selectCards(cardIds, append = false) {
        if (!append) this.selectedCardIds.clear();
        const ordered = [];
        for (const c of this.state.cards) {
            if (cardIds.includes(c.id)) ordered.push(c.id);
        }
        for (const id of ordered) this.selectedCardIds.add(id);
        if (ordered.length) this.focusedCardId = ordered[0];
        this.ensureSelectionValid();
        this.renderCards();
        this.updatePreviewGeometry(this.previewPoints, this.previewOwners);
        this.updateSelectionStatus();
    }

    updateSelectionStatus() {
        const selected = this.state.cards.filter((c) => this.selectedCardIds.has(c.id));
        if (!selected.length) {
            this.dom.statusSelection.textContent = "选中卡片: 无";
            return;
        }
        const names = selected.slice(0, 3).map((c) => c.name || "未命名");
        const tail = selected.length > 3 ? ` +${selected.length - 3}` : "";
        this.dom.statusSelection.textContent = `选中卡片: ${names.join(", ")}${tail}`;
    }

    addCard() {
        this.pushHistory();
        const card = createDefaultCard(this.state.cards.length);
        this.state.cards.push(card);
        this.focusedCardId = card.id;
        this.selectedCardIds = new Set([card.id]);
        this.afterStructureMutate({ rerenderProject: false, rerenderCards: true, rebuildPreview: true });
    }

    deleteSelectedCards() {
        if (!this.selectedCardIds.size) return;
        this.pushHistory();
        this.state.cards = this.state.cards.filter((c) => !this.selectedCardIds.has(c.id));
        if (!this.state.cards.length) this.state.cards.push(createDefaultCard(0));
        this.focusedCardId = this.state.cards[0].id;
        this.selectedCardIds = new Set([this.focusedCardId]);
        this.afterStructureMutate({ rerenderProject: false, rerenderCards: true, rebuildPreview: true });
    }

    deleteCardById(cardId) {
        const idx = this.getCardIndexById(cardId);
        if (idx < 0) return;
        this.state.cards.splice(idx, 1);
        if (!this.state.cards.length) this.state.cards.push(createDefaultCard(0));
        const fallback = this.state.cards[Math.max(0, idx - 1)] || this.state.cards[0];
        this.focusedCardId = fallback?.id || null;
        this.selectedCardIds = new Set(this.focusedCardId ? [this.focusedCardId] : []);
    }

    duplicateCardById(cardId) {
        const idx = this.getCardIndexById(cardId);
        if (idx < 0) return;
        const source = this.state.cards[idx];
        const cloned = normalizeCard(deepClone(source), idx + 1);
        cloned.id = uid();
        cloned.name = `${source.name || "卡片"} 副本`;
        cloned.particleInit = cloned.particleInit.map((it) => ({ ...it, id: uid() }));
        cloned.controllerVars = cloned.controllerVars.map((it) => ({ ...it, id: uid() }));
        cloned.controllerActions = cloned.controllerActions.map((it) => ({ ...it, id: uid() }));
        cloned.growthAnimates = cloned.growthAnimates.map((it) => ({ ...it, id: uid() }));
        cloned.sequencedAnimates = cloned.sequencedAnimates.map((it) => ({ ...it, id: uid() }));
        cloned.shapeDisplayActions = (cloned.shapeDisplayActions || []).map((it) => ({ ...it, id: uid() }));
        cloned.shapeChildDisplayActions = (cloned.shapeChildDisplayActions || []).map((it) => ({ ...it, id: uid() }));
        cloned.shapeChildGrowthAnimates = (cloned.shapeChildGrowthAnimates || []).map((it) => ({ ...it, id: uid() }));
        cloned.shapeChildLevels = (cloned.shapeChildLevels || []).map((lv, i) => {
            const level = normalizeShapeNestedLevel(lv, i);
            level.id = uid();
            level.displayActions = (level.displayActions || []).map((it) => ({ ...it, id: uid() }));
            level.growthAnimates = (level.growthAnimates || []).map((it) => ({ ...it, id: uid() }));
            return level;
        });
        this.state.cards.splice(idx + 1, 0, cloned);
        this.focusedCardId = cloned.id;
        this.selectedCardIds = new Set([cloned.id]);
    }

    moveCard(cardId, dir) {
        const idx = this.getCardIndexById(cardId);
        if (idx < 0) return;
        const target = clamp(idx + int(dir), 0, this.state.cards.length - 1);
        if (target === idx) return;
        const [card] = this.state.cards.splice(idx, 1);
        this.state.cards.splice(target, 0, card);
    }

    toggleCardFold(cardId) {
        const card = this.getCardById(cardId);
        if (!card) return;
        card.folded = !card.folded;
    }

    isCardSectionCollapsed(card, sectionKey) {
        if (!card || !sectionKey) return false;
        const key = String(sectionKey || "");
        if (!CARD_SECTION_KEYS.includes(key)) return false;
        card.sectionCollapse = normalizeCardSectionCollapse(card.sectionCollapse);
        return !!card.sectionCollapse[key];
    }

    setCardSectionCollapsed(card, sectionKey, collapsed) {
        if (!card || !sectionKey) return;
        const key = String(sectionKey || "");
        if (!CARD_SECTION_KEYS.includes(key)) return;
        card.sectionCollapse = normalizeCardSectionCollapse(card.sectionCollapse);
        card.sectionCollapse[key] = !!collapsed;
    }

    toggleCardSectionFold(cardId, sectionKey) {
        const card = this.getCardById(cardId);
        if (!card) return;
        this.setCardSectionCollapsed(card, sectionKey, !this.isCardSectionCollapsed(card, sectionKey));
    }

    setCardAllSectionsCollapsed(cardId, collapsed) {
        const card = this.getCardById(cardId);
        if (!card) return;
        card.sectionCollapse = normalizeCardSectionCollapse(card.sectionCollapse);
        for (const key of CARD_SECTION_KEYS) card.sectionCollapse[key] = !!collapsed;
    }

    isCardAllSectionsCollapsed(card) {
        if (!card) return false;
        card.sectionCollapse = normalizeCardSectionCollapse(card.sectionCollapse);
        return CARD_SECTION_KEYS.every((key) => !!card.sectionCollapse[key]);
    }

    addParticleInit(cardId) {
        const card = this.getCardById(cardId);
        if (!card) return;
        const target = "size";
        card.particleInit.push({
            id: uid(),
            target,
            expr: this.getParticleInitDefaultExprByTarget(target),
            exprPreset: ""
        });
    }

    removeParticleInit(cardId, idx) {
        const card = this.getCardById(cardId);
        if (!card) return;
        if (idx >= 0 && idx < card.particleInit.length) card.particleInit.splice(idx, 1);
    }

    addControllerVar(cardId) {
        const card = this.getCardById(cardId);
        if (!card) return;
        card.controllerVars.push({ id: uid(), name: "tick", type: "Boolean", expr: "true" });
    }

    removeControllerVar(cardId, idx) {
        const card = this.getCardById(cardId);
        if (!card) return;
        if (idx >= 0 && idx < card.controllerVars.length) card.controllerVars.splice(idx, 1);
    }

    addCardAnimate(cardId, key) {
        const card = this.getCardById(cardId);
        if (!card || !Array.isArray(card[key])) return;
        card[key].push(normalizeAnimate({ count: 1, condition: "age > 1" }));
    }

    removeCardAnimate(cardId, key, idx) {
        const card = this.getCardById(cardId);
        if (!card || !Array.isArray(card[key])) return;
        if (idx >= 0 && idx < card[key].length) card[key].splice(idx, 1);
    }

    clearBuilder(cardId, target = "root") {
        const card = this.getCardById(cardId);
        if (!card) return;
        const normalizedTarget = normalizeBuilderTarget(target);
        if (/^shape_level:\d+$/.test(normalizedTarget)) {
            const levelIdx = int(normalizedTarget.split(":")[1]);
            const level = this.getNestedShapeLevel(card, levelIdx, true);
            if (!level) return;
            level.bindMode = "builder";
            level.builderState = createDefaultBuilderState();
            this.setNestedShapeLevel(card, levelIdx, level);
            return;
        }
        if (normalizedTarget === "shape") {
            card.shapeBuilderState = createDefaultBuilderState();
            card.shapeBindMode = "builder";
            return;
        }
        if (normalizedTarget === "shape_child") {
            card.shapeChildBuilderState = createDefaultBuilderState();
            card.shapeChildBindMode = "builder";
            return;
        }
        card.builderState = createDefaultBuilderState();
        card.builderKotlinOverride = "";
    }

    pushHistory(snapshot = null) {
        const snap = normalizeStateShape(snapshot ? deepClone(snapshot) : deepClone(this.state));
        const snapJson = JSON.stringify(snap);
        const lastJson = this.undoStack.length ? JSON.stringify(this.undoStack[this.undoStack.length - 1]) : "";
        if (snapJson === lastJson) return;
        this.undoStack.push(snap);
        if (this.undoStack.length > 120) this.undoStack.shift();
        this.redoStack.length = 0;
    }

    undo() {
        if (!this.undoStack.length) return;
        this.redoStack.push(deepClone(this.state));
        const prev = this.undoStack.pop();
        this.state = normalizeStateShape(prev);
        this.applySettingsToDom();
        this.ensureSelectionValid();
        this.renderProjectSection();
        this.renderCards();
        this.rebuildPreview();
        this.generateCodeAndRender(true);
        this.scheduleSave();
    }

    redo() {
        if (!this.redoStack.length) return;
        this.undoStack.push(deepClone(this.state));
        const next = this.redoStack.pop();
        this.state = normalizeStateShape(next);
        this.applySettingsToDom();
        this.ensureSelectionValid();
        this.renderProjectSection();
        this.renderCards();
        this.rebuildPreview();
        this.generateCodeAndRender(true);
        this.scheduleSave();
    }

    afterStructureMutate(opts = {}) {
        this.state = normalizeStateShape(this.state);
        if (this.exprRuntime?.invalidateCache) this.exprRuntime.invalidateCache();
        this.ensureSelectionValid();
        const rerenderProject = opts.rerenderProject !== false;
        const rerenderCards = opts.rerenderCards !== false;
        const rebuildPreview = opts.rebuildPreview !== false;
        if (rerenderProject) this.renderProjectSection();
        if (rerenderCards) this.renderCards();
        if (rebuildPreview) this.rebuildPreview();
        this.generateCodeAndRender(this.state.settings.realtimeCode);
        this.writeBuilderCompositionContext();
        this.scheduleSave();
    }

    afterValueMutate(opts = {}) {
        if (this.exprRuntime?.invalidateCache) this.exprRuntime.invalidateCache();
        this.ensureSelectionValid();
        if (opts.rerenderProject) this.renderProjectSection();
        if (opts.rerenderCards) this.renderCards();
        if (opts.rebuildPreview !== false) this.rebuildPreview();
        this.generateCodeAndRender(this.state.settings.realtimeCode);
        this.writeBuilderCompositionContext();
        this.scheduleSave();
    }

    scheduleSave() {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.saveStateNow(), 220);
    }

    saveStateNow() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
            this.writeBuilderCompositionContext();
        } catch (e) {
            console.warn("save state failed:", e);
        }
    }

    writeBuilderCompositionContext() {
        try {
            localStorage.setItem(CPB_COMP_CONTEXT_KEY, JSON.stringify({
                ts: Date.now(),
                projectName: String(this.state.projectName || "NewComposition"),
                globalVars: (this.state.globalVars || []).map((it) => ({
                    name: String(it?.name || ""),
                    type: String(it?.type || ""),
                    value: String(it?.value ?? "")
                })),
                globalConsts: (this.state.globalConsts || []).map((it) => ({
                    name: String(it?.name || ""),
                    type: String(it?.type || ""),
                    value: String(it?.value ?? "")
                })),
                numericMap: this.getBuilderNumericContextMap()
            }));
        } catch {
        }
    }

    async saveTextWithPicker({ filename, text, mime = "text/plain", description = "文件", extensions = [] }) {
        const content = String(text || "");
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename || "download.txt",
                    types: [{
                        description: description || "文件",
                        accept: { [mime]: Array.isArray(extensions) && extensions.length ? extensions : [".txt"] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(content);
                await writable.close();
                return { ok: true, canceled: false, byPicker: true };
            } catch (e) {
                if (e && e.name === "AbortError") return { ok: false, canceled: true, byPicker: true };
                console.warn("showSaveFilePicker failed:", e);
            }
        }
        try {
            downloadText(filename, content, mime);
            return { ok: true, canceled: false, byPicker: false };
        } catch (e) {
            return { ok: false, canceled: false, error: e, byPicker: false };
        }
    }

    async exportProject(opts = {}) {
        const filename = `${sanitizeFileBase(this.state.projectName || "composition_builder") || "composition_builder"}.composition.json`;
        const projectState = this.extractProjectState(this.state);
        const result = await this.saveTextWithPicker({
            filename,
            text: JSON.stringify(projectState, null, 2),
            mime: "application/json",
            description: "Composition Builder 项目",
            extensions: [".json"]
        });
        if (result.ok) {
            this.writeExportedSignature(this.computeStateSignature(projectState));
            if (!opts.silent) this.showToast("项目已导出", "success");
        } else if (result.canceled) {
            if (!opts.silent) this.showToast("已取消导出", "info");
        } else if (!opts.silent) {
            this.showToast(`导出失败: ${result.error?.message || result.error || "未知错误"}`, "error");
        }
        return result;
    }

    async importProjectFromFile() {
        const file = this.dom.fileProject.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            this.pushHistory();
            const prefs = this.captureUserPreferences(this.state);
            const projectRaw = parsed?.state || parsed;
            const projectState = this.extractProjectState(projectRaw);
            this.state = this.applyUserPreferences(projectState, prefs);
            if (this.exprRuntime?.invalidateCache) this.exprRuntime.invalidateCache();
            this.writeExportedSignature(this.computeStateSignature(projectState));
            this.applySettingsToDom();
            this.ensureSelectionValid();
            this.renderProjectSection();
            this.renderCards();
            this.rebuildPreview();
            this.generateCodeAndRender(true);
            this.scheduleSave();
            this.showToast("项目导入成功", "success");
        } catch (e) {
            this.showToast(`导入失败: ${e?.message || e}`, "error");
        } finally {
            this.dom.fileProject.value = "";
        }
    }

    async exportSettings() {
        const out = {
            settings: deepClone(this.state.settings),
            hotkeys: deepClone(this.state.hotkeys),
            ts: Date.now()
        };
        const result = await this.saveTextWithPicker({
            filename: "composition_builder.settings.json",
            text: JSON.stringify(out, null, 2),
            mime: "application/json",
            description: "Composition Builder 设置",
            extensions: [".json"]
        });
        if (result.ok) this.showToast("设置已导出", "success");
        else if (result.canceled) this.showToast("已取消导出", "info");
        else this.showToast(`设置导出失败: ${result.error?.message || result.error || "未知错误"}`, "error");
    }

    async importSettingsFromFile() {
        const file = this.dom.fileSettings.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const obj = JSON.parse(text) || {};
            this.pushHistory();
            if (obj.settings && typeof obj.settings === "object") {
                this.state.settings = Object.assign({}, this.state.settings, obj.settings);
            } else if (!obj.hotkeys) {
                this.state.settings = Object.assign({}, this.state.settings, obj);
            }
            if (obj.hotkeys && obj.hotkeys.actions) {
                this.state.hotkeys.actions = Object.assign({}, this.state.hotkeys.actions, obj.hotkeys.actions);
            }
            this.state = normalizeStateShape(this.state);
            this.applySettingsToDom();
            this.renderProjectSection();
            this.renderCards();
            this.rebuildPreview();
            this.generateCodeAndRender(this.state.settings.realtimeCode);
            this.scheduleSave();
            this.showToast("设置已导入", "success");
        } catch (e) {
            this.showToast(`设置导入失败: ${e?.message || e}`, "error");
        } finally {
            this.dom.fileSettings.value = "";
        }
    }

    vectorCtorForVarType(typeName) {
        const type = String(typeName || "").trim();
        if (type === "Vec3") return "Vec3";
        if (type === "RelativeLocation") return "RelativeLocation";
        if (type === "Vector3f") return "Vector3f";
        return "RelativeLocation";
    }

    ensureGlobalVarValueShape(item) {
        if (!item) return;
        if (!isVectorLiteralType(item.type)) return;
        const parsed = this.exprRuntime.parseVecLikeValue(item.value || "");
        const ctor = this.vectorCtorForVarType(item.type);
        item.value = formatVectorLiteral(ctor, parsed.x, parsed.y, parsed.z);
    }

    updateGlobalVarVectorValue(item, axis, value) {
        if (!item || !isVectorLiteralType(item.type)) return;
        const parsed = this.exprRuntime.parseVecLikeValue(item.value || "");
        const next = {
            x: num(parsed.x),
            y: num(parsed.y),
            z: num(parsed.z)
        };
        if (axis === "x" || axis === "y" || axis === "z") next[axis] = num(value);
        const ctor = this.vectorCtorForVarType(item.type);
        item.value = formatVectorLiteral(ctor, next.x, next.y, next.z);
    }

    updateGlobalVarColorValue(item, hex) {
        if (!item || String(item.type || "").trim() !== "Vector3f") return;
        const c = hexToVector01(hex);
        item.value = formatVectorLiteral("Vector3f", c.x, c.y, c.z);
    }

    syncGlobalVarInlineInputs(varIdx, item) {
        const idx = int(varIdx);
        if (idx < 0 || !item || !this.dom?.projectSection) return;
        const root = this.dom.projectSection;
        const valueInput = root.querySelector(`input[data-var-idx="${idx}"][data-var-field="value"]`);
        if (valueInput && document.activeElement !== valueInput) {
            valueInput.value = String(item.value || "");
        }
        if (!isVectorLiteralType(item.type)) return;
        const parsed = this.exprRuntime.parseVecLikeValue(item.value || "");
        for (const axis of ["x", "y", "z"]) {
            const axisInput = root.querySelector(`input[data-var-vec-idx="${idx}"][data-var-vec-axis="${axis}"]`);
            if (axisInput && document.activeElement !== axisInput) {
                axisInput.value = formatNumberCompact(parsed[axis]);
            }
        }
        if (String(item.type || "").trim() === "Vector3f") {
            const colorInput = root.querySelector(`input[data-var-color-idx="${idx}"]`);
            if (colorInput && document.activeElement !== colorInput) {
                colorInput.value = vectorToHex01(parsed.x, parsed.y, parsed.z);
            }
        }
    }

    renderGlobalVarRow(v, i) {
        const typeOptions = GLOBAL_VAR_TYPES
            .map((t) => `<option value="${esc(t)}" ${v.type === t ? "selected" : ""}>${esc(t)}</option>`)
            .join("");

        const actionRow = `
            <div class="row-actions">
                <label class="chk"><input type="checkbox" data-var-idx="${i}" data-var-field="codec" ${v.codec ? "checked" : ""}/>Codec</label>
                <label class="chk"><input type="checkbox" data-var-idx="${i}" data-var-field="mutable" ${v.mutable ? "checked" : ""}/>var</label>
                <button class="btn small" data-act="remove-global-var" data-idx="${i}">删除</button>
            </div>
        `;

        if (!isVectorLiteralType(v.type)) {
            return `
                <div class="kv-row grid-var">
                    <div class="grid2">
                        <input class="input" data-var-idx="${i}" data-var-field="name" value="${esc(v.name)}" placeholder="变量名"/>
                        <select class="input" data-var-idx="${i}" data-var-field="type">${typeOptions}</select>
                    </div>
                    <input class="input" data-var-idx="${i}" data-var-field="value" value="${esc(v.value)}" placeholder="默认值"/>
                    ${actionRow}
                </div>
            `;
        }

        const parsed = this.exprRuntime.parseVecLikeValue(v.value || "");
        const ctor = this.vectorCtorForVarType(v.type);
        const colorHex = vectorToHex01(parsed.x, parsed.y, parsed.z);
        const vectorInputs = `
            <div class="vector-inputs">
                <div class="vector-ctor-label">${esc(ctor)}</div>
                <input class="input" type="number" step="${this.state.settings.paramStep}" data-var-vec-idx="${i}" data-var-vec-axis="x" value="${esc(formatNumberCompact(parsed.x))}" placeholder="x"/>
                <input class="input" type="number" step="${this.state.settings.paramStep}" data-var-vec-idx="${i}" data-var-vec-axis="y" value="${esc(formatNumberCompact(parsed.y))}" placeholder="y"/>
                <input class="input" type="number" step="${this.state.settings.paramStep}" data-var-vec-idx="${i}" data-var-vec-axis="z" value="${esc(formatNumberCompact(parsed.z))}" placeholder="z"/>
                ${String(v.type || "").trim() === "Vector3f"
                    ? `<input class="input vector-color" type="color" data-var-color-idx="${i}" value="${esc(colorHex)}" title="打开调色盘"/>`
                    : `<div></div>`}
            </div>
        `;

        return `
            <div class="kv-row grid-var grid-var-vector">
                <div class="grid2">
                    <input class="input" data-var-idx="${i}" data-var-field="name" value="${esc(v.name)}" placeholder="变量名"/>
                    <select class="input" data-var-idx="${i}" data-var-field="type">${typeOptions}</select>
                </div>
                <input class="input mono" data-var-idx="${i}" data-var-field="value" value="${esc(v.value)}" placeholder="默认值"/>
                ${vectorInputs}
                ${actionRow}
            </div>
        `;
    }

    renderProjectSection() {
        const s = this.state;
        const seq = s.compositionType === "sequenced";
        const typeOptions = GLOBAL_VAR_TYPES.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
        const varRows = s.globalVars.map((v, i) => this.renderGlobalVarRow(v, i)).join("");
        const axisPresetOptions = this.getRelativeTargetPresetOptionsHtml(s.compositionAxisPreset || s.compositionAxisExpr);
        const constRows = s.globalConsts.map((v, i) => `
            <div class="kv-row grid-const">
                <input class="input" data-const-idx="${i}" data-const-field="name" value="${esc(v.name)}" placeholder="常量名"/>
                <select class="input" data-const-idx="${i}" data-const-field="type">${typeOptions.replace(`value="${esc(v.type)}"`, `value="${esc(v.type)}" selected`)}</select>
                <input class="input" data-const-idx="${i}" data-const-field="value" value="${esc(v.value)}" placeholder="值"/>
                <button class="btn small" data-act="remove-global-const" data-idx="${i}">删除</button>
            </div>
        `).join("");
        const compAnimRows = s.compositionAnimates.map((a, i) => `
            <div class="kv-row grid-animate">
                <input class="input" type="number" min="1" step="1" data-comp-animate-idx="${i}" data-comp-animate-field="count" value="${esc(String(a.count))}"/>
                <input class="input expr-input" data-comp-animate-idx="${i}" data-comp-animate-field="condition" value="${esc(a.condition)}" placeholder="条件表达式"/>
                <button class="btn small" data-act="remove-comp-animate" data-idx="${i}">删除</button>
            </div>
        `).join("");
        const displayRows = s.displayActions.map((a, i) => this.renderDisplayActionRow(a, i)).join("");

        this.dom.projectSection.innerHTML = `
            <div class="section-block">
                <div class="section-title">项目设置</div>
                <div class="grid2">
                    <label class="field">
                        <span>项目名字</span>
                        <input class="input" data-pf="projectName" value="${esc(s.projectName)}" placeholder="NewComposition"/>
                    </label>
                    <label class="field">
                        <span>类型</span>
                        <select class="input" data-pf="compositionType">
                            <option value="particle" ${s.compositionType === "particle" ? "selected" : ""}>ParticleComposition</option>
                            <option value="sequenced" ${s.compositionType === "sequenced" ? "selected" : ""}>SequencedParticleComposition</option>
                        </select>
                    </label>
                    <label class="field">
                        <span>消散延迟 (tick)</span>
                        <input class="input" type="number" min="0" step="1" data-pf="disabledInterval" value="${esc(String(s.disabledInterval))}"/>
                    </label>
                </div>
                <div class="subgroup">
                    <div class="subgroup-title">生成前 Axis</div>
                    <div class="grid2">
                        <label class="field">
                            <span>axis 预设</span>
                            <select class="input expr-input" data-axis-field="axisPreset">${axisPresetOptions}</select>
                        </label>
                        <label class="field">
                            <span>axis 输入</span>
                            <input class="input expr-input" data-axis-field="axisExpr" value="${esc(s.compositionAxisExpr || "")}" placeholder="axis 表达式"/>
                        </label>
                    </div>
                    <div class="grid5 vector-inputs">
                        <select class="input vector-ctor" data-axis-field="axisManualCtor">
                            ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${s.compositionAxisManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                        </select>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" data-axis-field="axisManualX" value="${esc(formatNumberCompact(s.compositionAxisManualX))}" placeholder="x"/>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" data-axis-field="axisManualY" value="${esc(formatNumberCompact(s.compositionAxisManualY))}" placeholder="y"/>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" data-axis-field="axisManualZ" value="${esc(formatNumberCompact(s.compositionAxisManualZ))}" placeholder="z"/>
                        <button class="btn small primary" data-act="apply-project-axis-manual">套用手动输入</button>
                    </div>
                </div>
                ${this.renderScaleHelperEditor({
                    scope: "project",
                    scale: s.projectScale
                })}
            </div>

            <div class="section-block">
                <div class="section-title">全局变量</div>
                <div class="list-tools">
                    <button class="btn small primary" data-act="add-global-var">添加变量</button>
                    <div class="mini-note">变量可在表达式里直接使用</div>
                </div>
                <div class="kv-list">${varRows}</div>
            </div>

            <div class="section-block">
                <div class="section-title">全局非同步常量</div>
                <div class="list-tools">
                    <button class="btn small primary" data-act="add-global-const">添加常量</button>
                </div>
                <div class="kv-list">${constRows}</div>
            </div>

            ${seq ? `
            <div class="section-block">
                <div class="section-title">生长动画（SequencedParticleComposition）</div>
                <div class="list-tools">
                    <button class="btn small primary" data-act="add-comp-animate">添加生长动画</button>
                    <div class="mini-note">仅 SequencedParticleComposition 生效</div>
                </div>
                <div class="kv-list">${compAnimRows}</div>
            </div>` : ""}

            <div class="section-block">
                <div class="section-title">Display 行为</div>
                <div class="list-tools">
                    <button class="btn small primary" data-act="add-display-action">添加 display action</button>
                </div>
                <div class="kv-list">${displayRows}</div>
            </div>
        `;
        this.refreshCodeEditors();
    }

    renderDisplayActionRow(action, idx) {
        const a = normalizeDisplayAction(action);
        const typeOptions = DISPLAY_ACTION_TYPES.map((it) => `<option value="${it.id}" ${a.type === it.id ? "selected" : ""}>${esc(it.title)}</option>`).join("");
        const presetOptions = this.getRelativeTargetPresetOptionsHtml(a.toPreset);
        const angleControl = this.renderAngleControl({
            scope: "display",
            idx,
            mode: a.angleMode,
            value: a.angleValue,
            unit: a.angleUnit,
            expr: a.angleExpr
        });

        let body = "";
        if (a.type === "rotateTo") {
            body = `
                <div class="grid2">
                    <label class="field">
                        <span>to 预设</span>
                        <select class="input expr-input" data-display-idx="${idx}" data-display-field="toPreset">${presetOptions}</select>
                    </label>
                    <label class="field">
                        <span>to 输入</span>
                        <input class="input expr-input" data-display-idx="${idx}" data-display-field="toExpr" value="${esc(a.toExpr)}" placeholder="to 表达式"/>
                    </label>
                </div>
                <div class="grid5 vector-inputs">
                    <select class="input vector-ctor" data-display-idx="${idx}" data-display-field="toManualCtor">
                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${a.toManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                    </select>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="toManualX" value="${esc(formatNumberCompact(a.toManualX))}" placeholder="x"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="toManualY" value="${esc(formatNumberCompact(a.toManualY))}" placeholder="y"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="toManualZ" value="${esc(formatNumberCompact(a.toManualZ))}" placeholder="z"/>
                    <button class="btn small primary" data-act="apply-display-manual-to" data-idx="${idx}">套用手动输入</button>
                </div>
            `;
        } else if (a.type === "rotateAsAxis") {
            body = `${angleControl}`;
        } else if (a.type === "rotateToWithAngle") {
            body = `
                <div class="grid2">
                    <label class="field">
                        <span>to 预设</span>
                        <select class="input expr-input" data-display-idx="${idx}" data-display-field="toPreset">${presetOptions}</select>
                    </label>
                    <label class="field">
                        <span>to 输入</span>
                        <input class="input expr-input" data-display-idx="${idx}" data-display-field="toExpr" value="${esc(a.toExpr)}" placeholder="to 表达式"/>
                    </label>
                </div>
                <div class="grid5 vector-inputs">
                    <select class="input vector-ctor" data-display-idx="${idx}" data-display-field="toManualCtor">
                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${a.toManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                    </select>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="toManualX" value="${esc(formatNumberCompact(a.toManualX))}" placeholder="x"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="toManualY" value="${esc(formatNumberCompact(a.toManualY))}" placeholder="y"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="toManualZ" value="${esc(formatNumberCompact(a.toManualZ))}" placeholder="z"/>
                    <button class="btn small primary" data-act="apply-display-manual-to" data-idx="${idx}">套用手动输入</button>
                </div>
                ${angleControl}
            `;
        } else {
            body = `
                <textarea class="input script-area expr-input" data-code-editor="js" data-code-title="display 表达式" data-display-idx="${idx}" data-display-field="expression" placeholder="可调用 rotateTo(...) / rotateAsAxis(...) / rotateToWithAngle(...)">${esc(a.expression || "")}</textarea>
                <div class="mini-note">表达式支持代码提示（Ctrl+Space），可使用 addSingle()/addMultiple(n)</div>
            `;
        }

        return `
            <div class="kv-row display-row">
                <div class="grid2">
                    <select class="input" data-display-idx="${idx}" data-display-field="type">${typeOptions}</select>
                    <div class="preview-actions"><button class="btn small" data-act="remove-display-action" data-idx="${idx}">删除</button></div>
                </div>
                ${body}
            </div>
        `;
    }

    renderShapeDisplayActionRow(cardId, action, idx) {
        const a = normalizeDisplayAction(action);
        const typeOptions = DISPLAY_ACTION_TYPES.map((it) => `<option value="${it.id}" ${a.type === it.id ? "selected" : ""}>${esc(it.title)}</option>`).join("");
        const presetOptions = this.getRelativeTargetPresetOptionsHtml(a.toPreset);
        const angleControl = this.renderAngleControl({
            scope: "shape_display",
            cardId,
            idx,
            mode: a.angleMode,
            value: a.angleValue,
            unit: a.angleUnit,
            expr: a.angleExpr
        });

        let body = "";
        if (a.type === "rotateTo") {
            body = `
                <div class="grid2">
                    <label class="field">
                        <span>to 预设</span>
                        <select class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toPreset">${presetOptions}</select>
                    </label>
                    <label class="field">
                        <span>to 输入</span>
                        <input class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toExpr" value="${esc(a.toExpr)}" placeholder="to 表达式"/>
                    </label>
                </div>
                <div class="grid5 vector-inputs">
                    <select class="input vector-ctor" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualCtor">
                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${a.toManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                    </select>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualX" value="${esc(formatNumberCompact(a.toManualX))}" placeholder="x"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualY" value="${esc(formatNumberCompact(a.toManualY))}" placeholder="y"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualZ" value="${esc(formatNumberCompact(a.toManualZ))}" placeholder="z"/>
                    <button class="btn small primary" data-act="apply-shape-display-manual-to" data-card-id="${esc(cardId)}" data-shape-display-idx="${idx}">套用手动输入</button>
                </div>
            `;
        } else if (a.type === "rotateAsAxis") {
            body = `${angleControl}`;
        } else if (a.type === "rotateToWithAngle") {
            body = `
                <div class="grid2">
                    <label class="field">
                        <span>to 预设</span>
                        <select class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toPreset">${presetOptions}</select>
                    </label>
                    <label class="field">
                        <span>to 输入</span>
                        <input class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toExpr" value="${esc(a.toExpr)}" placeholder="to 表达式"/>
                    </label>
                </div>
                <div class="grid5 vector-inputs">
                    <select class="input vector-ctor" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualCtor">
                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${a.toManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                    </select>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualX" value="${esc(formatNumberCompact(a.toManualX))}" placeholder="x"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualY" value="${esc(formatNumberCompact(a.toManualY))}" placeholder="y"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualZ" value="${esc(formatNumberCompact(a.toManualZ))}" placeholder="z"/>
                    <button class="btn small primary" data-act="apply-shape-display-manual-to" data-card-id="${esc(cardId)}" data-shape-display-idx="${idx}">套用手动输入</button>
                </div>
                ${angleControl}
            `;
        } else {
            body = `
                <textarea class="input script-area expr-input" data-code-editor="js" data-code-title="shape display 表达式" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="expression" placeholder="可调用 rotateTo(...) / rotateAsAxis(...) / rotateToWithAngle(...)">${esc(a.expression || "")}</textarea>
                <div class="mini-note">表达式支持代码提示（Ctrl+Space），可使用 addSingle()/addMultiple(n)</div>
            `;
        }

        return `
            <div class="kv-row display-row">
                <div class="grid2">
                    <select class="input" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="type">${typeOptions}</select>
                    <div class="preview-actions"><button class="btn small" data-act="remove-shape-display-action" data-card-id="${esc(cardId)}" data-idx="${idx}">删除</button></div>
                </div>
                ${body}
            </div>
        `;
    }

    renderShapeChildDisplayActionRow(cardId, action, idx) {
        const a = normalizeDisplayAction(action);
        const typeOptions = DISPLAY_ACTION_TYPES.map((it) => `<option value="${it.id}" ${a.type === it.id ? "selected" : ""}>${esc(it.title)}</option>`).join("");
        const presetOptions = this.getRelativeTargetPresetOptionsHtml(a.toPreset);
        const angleControl = this.renderAngleControl({
            scope: "shape_display",
            cardId,
            idx,
            mode: a.angleMode,
            value: a.angleValue,
            unit: a.angleUnit,
            expr: a.angleExpr
        })
            .replaceAll("data-card-shape-display-idx", "data-card-shape-child-display-idx")
            .replaceAll("data-card-shape-display-field", "data-card-shape-child-display-field");

        let body = "";
        if (a.type === "rotateTo") {
            body = `
                <div class="grid2">
                    <label class="field">
                        <span>to 预设</span>
                        <select class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toPreset">${presetOptions}</select>
                    </label>
                    <label class="field">
                        <span>to 输入</span>
                        <input class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toExpr" value="${esc(a.toExpr)}" placeholder="to 表达式"/>
                    </label>
                </div>
                <div class="grid5 vector-inputs">
                    <select class="input vector-ctor" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualCtor">
                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${a.toManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                    </select>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualX" value="${esc(formatNumberCompact(a.toManualX))}" placeholder="x"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualY" value="${esc(formatNumberCompact(a.toManualY))}" placeholder="y"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualZ" value="${esc(formatNumberCompact(a.toManualZ))}" placeholder="z"/>
                    <button class="btn small primary" data-act="apply-shape-child-display-manual-to" data-card-id="${esc(cardId)}" data-shape-child-display-idx="${idx}">套用手动输入</button>
                </div>
            `;
        } else if (a.type === "rotateAsAxis") {
            body = `${angleControl}`;
        } else if (a.type === "rotateToWithAngle") {
            body = `
                <div class="grid2">
                    <label class="field">
                        <span>to 预设</span>
                        <select class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toPreset">${presetOptions}</select>
                    </label>
                    <label class="field">
                        <span>to 输入</span>
                        <input class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toExpr" value="${esc(a.toExpr)}" placeholder="to 表达式"/>
                    </label>
                </div>
                <div class="grid5 vector-inputs">
                    <select class="input vector-ctor" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualCtor">
                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${a.toManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                    </select>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualX" value="${esc(formatNumberCompact(a.toManualX))}" placeholder="x"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualY" value="${esc(formatNumberCompact(a.toManualY))}" placeholder="y"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualZ" value="${esc(formatNumberCompact(a.toManualZ))}" placeholder="z"/>
                    <button class="btn small primary" data-act="apply-shape-child-display-manual-to" data-card-id="${esc(cardId)}" data-shape-child-display-idx="${idx}">套用手动输入</button>
                </div>
                ${angleControl}
            `;
        } else {
            body = `
                <textarea class="input script-area expr-input" data-code-editor="js" data-code-title="子点 shape display 表达式" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="expression" placeholder="可调用 rotateTo(...) / rotateAsAxis(...) / rotateToWithAngle(...)">${esc(a.expression || "")}</textarea>
                <div class="mini-note">表达式支持代码提示（Ctrl+Space），可使用 addSingle()/addMultiple(n)</div>
            `;
        }

        return `
            <div class="kv-row display-row">
                <div class="grid2">
                    <select class="input" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="type">${typeOptions}</select>
                    <div class="preview-actions"><button class="btn small" data-act="remove-shape-child-display-action" data-card-id="${esc(cardId)}" data-idx="${idx}">删除</button></div>
                </div>
                ${body}
            </div>
        `;
    }

    renderShapeLevelDisplayActionRow(cardId, levelIdx, action, idx) {
        const cid = esc(cardId);
        let html = this.renderShapeDisplayActionRow(cardId, action, idx);
        html = html
            .replaceAll(`data-card-id="${cid}"`, `data-card-id="${cid}" data-shape-level-idx="${levelIdx}"`)
            .replaceAll("data-card-shape-display-idx", "data-shape-level-display-idx")
            .replaceAll("data-card-shape-display-field", "data-shape-level-display-field")
            .replaceAll("remove-shape-display-action", "remove-shape-level-display-action")
            .replaceAll("apply-shape-display-manual-to", "apply-shape-level-display-manual-to")
            .replaceAll("data-shape-display-idx", "data-shape-level-display-idx");
        return html;
    }

    renderNestedShapeLevelBlock(card, levelRaw, levelIdx) {
        const level = normalizeShapeNestedLevel(levelRaw, levelIdx - 1);
        const collapsed = !!level.collapsed;
        const foldIcon = collapsed ? "▶" : "▼";
        const childType = level.type;
        const bindMode = level.bindMode === "builder" ? "builder" : "point";
        const builderStats = this.evaluateBuilderPoints(level.builderState);
        const builderNodeCount = this.countBuilderNodes(level.builderState?.root?.children || []);
        const builderPointCount = (builderStats.points || []).length;
        const growthBlock = childType === "sequenced_shape"
            ? this.renderCardAnimates(
                card.id,
                `shapeLevelGrowth:${levelIdx}`,
                level.growthAnimates,
                `嵌套层 ${levelIdx + 1} 生长动画`,
                "add-shape-level-growth-animate",
                "remove-shape-level-growth-animate",
                { embedOnly: true }
            ).replaceAll(`data-card-id="${card.id}"`, `data-card-id="${card.id}" data-shape-level-idx="${levelIdx}"`)
            : "";
        const effectHtml = this.getEffectOptionsHtml(level.effectClass || card.singleEffectClass || DEFAULT_EFFECT_CLASS);
        return `
            <div class="subgroup subgroup-tight nested-shape-level ${collapsed ? "collapsed" : ""}" data-shape-level="${levelIdx}">
                <div class="subgroup-head">
                    <button class="iconbtn subgroup-toggle" data-act="toggle-shape-level-fold" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}" title="${collapsed ? "展开" : "折叠"}">${foldIcon}</button>
                    <div class="subgroup-title">嵌套层 ${levelIdx + 1}</div>
                </div>
                <div class="subgroup-body">
                    <div class="grid2">
                        <label class="field">
                            <span>子点类型</span>
                            <select class="input" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}" data-shape-level-field="type">
                                <option value="single" ${childType === "single" ? "selected" : ""}>single</option>
                                <option value="particle_shape" ${childType === "particle_shape" ? "selected" : ""}>ParticleShapeComposition</option>
                                <option value="sequenced_shape" ${childType === "sequenced_shape" ? "selected" : ""}>SequencedParticleShapeComposition</option>
                            </select>
                        </label>
                        ${childType === "single"
                            ? `<label class="field">
                                <span>子点 Effect</span>
                                <select class="input" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}" data-shape-level-field="effectClass">${effectHtml}</select>
                            </label>`
                            : `<div class="mini-note">非 single 可继续嵌套</div>`}
                    </div>
                    ${childType === "single" ? `
                        <div class="mini-note">Single 详细参数（沿用当前卡片）</div>
                        <div class="list-tools">
                            <button class="btn small primary" data-act="add-pinit" data-card-id="${card.id}">添加 init</button>
                        </div>
                        <div class="kv-list">
                            ${this.renderParticleInitRows(card)}
                        </div>
                        <div class="list-tools">
                            <button class="btn small primary" data-act="add-cvar" data-card-id="${card.id}">添加局部变量</button>
                            <button class="btn small primary" data-act="add-caction" data-card-id="${card.id}">添加 tick action</button>
                        </div>
                        <div class="kv-list">
                            ${card.controllerVars.map((it, cIdx) => `
                                <div class="kv-row grid-var">
                                    <input class="input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="name" value="${esc(it.name)}" placeholder="name"/>
                                    <select class="input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="type">
                                        ${CONTROLLER_VAR_TYPES.map((tp) => `<option value="${esc(tp)}" ${it.type === tp ? "selected" : ""}>${esc(tp)}</option>`).join("")}
                                    </select>
                                    <input class="input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="expr" value="${esc(it.expr)}" placeholder="初值"/>
                                    <div></div><div></div>
                                    <button class="btn small" data-act="remove-cvar" data-card-id="${card.id}" data-idx="${cIdx}">删除</button>
                                </div>
                            `).join("")}
                        </div>
                        <div class="kv-list">
                            ${(card.controllerActions || []).map((a, aIdx) => this.renderControllerActionRow(card.id, a, aIdx)).join("")}
                        </div>
                    ` : `
                        <div class="mini-note">子点来源</div>
                        <div class="grid2">
                            <label class="field">
                                <span>子点基础选项</span>
                                <select class="input" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}" data-shape-level-field="bindMode">
                                    <option value="point" ${bindMode === "point" ? "selected" : ""}>point</option>
                                    <option value="builder" ${bindMode === "builder" ? "selected" : ""}>PointsBuilder</option>
                                </select>
                            </label>
                        </div>
                        ${bindMode === "point" ? `
                            <div class="grid3">
                                <label class="field"><span>X</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}" data-shape-level-field="pointX" value="${esc(formatNumberCompact(level.point?.x))}"/></label>
                                <label class="field"><span>Y</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}" data-shape-level-field="pointY" value="${esc(formatNumberCompact(level.point?.y))}"/></label>
                                <label class="field"><span>Z</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}" data-shape-level-field="pointZ" value="${esc(formatNumberCompact(level.point?.z))}"/></label>
                            </div>
                        ` : `
                            <div class="kv-list">
                                <div class="kv-row display-row">
                                    <div class="builder-actions">
                                        <button class="btn small primary" data-act="open-shape-level-builder-editor" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}">编辑嵌套层 Builder</button>
                                        <button class="btn small" data-act="import-shape-level-builder-json" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}">导入 JSON</button>
                                        <button class="btn small" data-act="export-shape-level-builder-json" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}">导出 JSON</button>
                                        <button class="btn small" data-act="clear-shape-level-builder" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}">清空</button>
                                    </div>
                                </div>
                                <div class="kv-row display-row">
                                    <div class="builder-meta">节点 ${builderNodeCount} / 预览点 ${builderPointCount}</div>
                                </div>
                            </div>
                        `}
                        <div class="mini-note">子点 Axis</div>
                        <div class="grid2">
                            <label class="field">
                                <span>axis 预设</span>
                                <select class="input expr-input" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}" data-shape-level-axis-field="axisPreset">${this.getRelativeTargetPresetOptionsHtml(level.axisPreset || level.axisExpr)}</select>
                            </label>
                            <label class="field">
                                <span>axis 输入</span>
                                <input class="input expr-input" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}" data-shape-level-axis-field="axisExpr" value="${esc(level.axisExpr || "")}" placeholder="axis 表达式"/>
                            </label>
                        </div>
                        <div class="grid5 vector-inputs">
                            <select class="input vector-ctor" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}" data-shape-level-axis-field="axisManualCtor">
                                ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${level.axisManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                            </select>
                            <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}" data-shape-level-axis-field="axisManualX" value="${esc(formatNumberCompact(level.axisManualX))}" placeholder="x"/>
                            <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}" data-shape-level-axis-field="axisManualY" value="${esc(formatNumberCompact(level.axisManualY))}" placeholder="y"/>
                            <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}" data-shape-level-axis-field="axisManualZ" value="${esc(formatNumberCompact(level.axisManualZ))}" placeholder="z"/>
                            <button class="btn small primary" data-act="apply-shape-level-axis-manual" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}">套用手动输入</button>
                        </div>
                        <div class="mini-note">子点 Display 行为</div>
                        <div class="list-tools">
                            <button class="btn small primary" data-act="add-shape-level-display-action" data-card-id="${card.id}" data-shape-level-idx="${levelIdx}">添加子点 display action</button>
                        </div>
                        <div class="kv-list">
                            ${(level.displayActions || []).map((a, aIdx) => this.renderShapeLevelDisplayActionRow(card.id, levelIdx, a, aIdx)).join("")}
                        </div>
                        <div class="mini-note">缩放助手-嵌套${levelIdx + 1}（可选）</div>
                        ${this.renderScaleHelperEditor({
                            scope: "shape_level",
                            cardId: card.id,
                            levelIdx,
                            scale: level.scale,
                            helperName: `缩放助手-嵌套${levelIdx + 1}`,
                            embedOnly: true
                        })}
                        ${growthBlock}
                    `}
                </div>
            </div>
        `;
    }

    renderNestedShapeLevels(card) {
        if (!card) return "";
        this.pruneNestedShapeLevels(card);
        const blocks = [];
        let parentType = String(card.shapeChildType || "single");
        for (let i = 0; i < (card.shapeChildLevels || []).length; i++) {
            if (parentType === "single") break;
            const level = normalizeShapeNestedLevel(card.shapeChildLevels[i], i);
            const levelIdx = i + 1;
            blocks.push(this.renderNestedShapeLevelBlock(card, level, levelIdx));
            parentType = level.type;
        }
        return blocks.join("");
    }

    renderScaleHelperEditor(opts = {}) {
        const scope = opts.scope === "card"
            ? "card"
            : (opts.scope === "shape_child"
                ? "shape_child"
                : (opts.scope === "shape_level" ? "shape_level" : "project"));
        const cardId = String(opts.cardId || "");
        const levelIdx = Math.max(0, int(opts.levelIdx));
        const embedOnly = !!opts.embedOnly;
        const title = String(opts.title || "缩放助手（可选）");
        const helperName = String(opts.helperName || "缩放助手");
        const sectionKeyAttr = opts.sectionKey ? ` data-section-key="${esc(String(opts.sectionKey))}"` : "";
        const scale = normalizeScaleHelperConfig(opts.scale, { type: "none" });
        const fieldAttr = scope === "project"
            ? "data-project-scale-field"
            : (scope === "card"
                ? "data-card-scale-field"
                : (scope === "shape_child" ? "data-card-shape-child-scale-field" : "data-shape-level-scale-field"));
        const cardAttr = scope === "project"
            ? ""
            : `data-card-id="${esc(cardId)}"${scope === "shape_level" ? ` data-shape-level-idx="${levelIdx}"` : ""}`;
        const openBezierAct = scope === "project"
            ? "open-project-bezier-tool"
            : (scope === "shape_child"
                ? "open-child-bezier-tool"
                : (scope === "shape_level" ? "open-shape-level-bezier-tool" : "open-card-bezier-tool"));
        const typeSelect = `
            <label class="field">
                <span>${esc(helperName)}</span>
                <select class="input" ${cardAttr} ${fieldAttr}="type">
                    <option value="none" ${scale.type === "none" ? "selected" : ""}>不使用</option>
                    <option value="linear" ${scale.type === "linear" ? "selected" : ""}>loadScaleValue</option>
                    <option value="bezier" ${scale.type === "bezier" ? "selected" : ""}>loadScaleHelperBezierValue</option>
                </select>
            </label>
        `;
        if (scale.type === "none") {
            const body = `
                <div class="grid2">
                    ${typeSelect}
                    <div class="mini-note">仅可添加一个缩放助手</div>
                </div>
            `;
            if (embedOnly) return body;
            return `
                <div class="subgroup"${sectionKeyAttr}>
                    <div class="subgroup-title">${esc(title)}</div>
                    ${body}
                </div>
            `;
        }
        const bezierRows = scale.type === "bezier" ? `
            <div class="grid2">
                <label class="field">
                    <span>起始曲柄 RelativeLocation(x,y,z)</span>
                    <div class="grid3">
                        <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="c1x" value="${esc(formatNumberCompact(scale.c1x))}" placeholder="x"/>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="c1y" value="${esc(formatNumberCompact(scale.c1y))}" placeholder="y"/>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="c1z" value="${esc(formatNumberCompact(scale.c1z))}" placeholder="z"/>
                    </div>
                </label>
                <label class="field">
                    <span>结束曲柄 RelativeLocation(x,y,z)</span>
                    <div class="grid3">
                        <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="c2x" value="${esc(formatNumberCompact(scale.c2x))}" placeholder="x"/>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="c2y" value="${esc(formatNumberCompact(scale.c2y))}" placeholder="y"/>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="c2z" value="${esc(formatNumberCompact(scale.c2z))}" placeholder="z"/>
                    </div>
                </label>
            </div>
            <div class="list-tools">
                <button class="btn small" data-act="${openBezierAct}" ${cardAttr}>打开 Bezier 工具</button>
            </div>
        ` : "";
        const body = `
            <div class="grid2">
                ${typeSelect}
                <label class="chk">
                    <input type="checkbox" ${cardAttr} ${fieldAttr}="reversedOnDisable" ${scale.reversedOnDisable ? "checked" : ""}/>
                    <span>消散时回缩</span>
                </label>
            </div>
            <div class="grid3">
                <label class="field">
                    <span>起始缩放</span>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="min" value="${esc(formatNumberCompact(scale.min))}"/>
                </label>
                <label class="field">
                    <span>结束缩放</span>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="max" value="${esc(formatNumberCompact(scale.max))}"/>
                </label>
                <label class="field">
                    <span>缩放时间 (tick)</span>
                    <input class="input" type="number" min="1" step="1" ${cardAttr} ${fieldAttr}="tick" value="${esc(String(scale.tick))}"/>
                </label>
            </div>
            ${bezierRows}
        `;
        if (embedOnly) return body;
        return `
            <div class="subgroup"${sectionKeyAttr}>
                <div class="subgroup-title">${esc(title)}</div>
                ${body}
            </div>
        `;
    }

    renderAngleControl(opts = {}) {
        const scope = opts.scope === "card" ? "card" : (opts.scope === "shape_display" ? "shape_display" : "display");
        const idx = int(opts.idx);
        const mode = opts.mode === "expr" ? "expr" : "numeric";
        const value = Number.isFinite(Number(opts.value)) ? num(opts.value) : 0;
        const unit = normalizeAngleUnit(opts.unit);
        const expr = String(opts.expr || "");

        if (scope === "display") {
            return `
                <div class="angle-control">
                    <div class="grid2">
                    <select class="input" data-display-idx="${idx}" data-display-field="angleMode">
                            <option value="numeric" ${mode === "numeric" ? "selected" : ""}>角度输入</option>
                            <option value="expr" ${mode === "expr" ? "selected" : ""}>表达式</option>
                        </select>
                    ${mode === "expr"
                            ? `<div class="grid2">
                                <select class="input expr-input" data-display-idx="${idx}" data-display-field="angleExprPreset">${this.getAngleExprPresetOptionsHtml(expr)}</select>
                                <input class="input expr-input" data-display-idx="${idx}" data-display-field="angleExpr" value="${esc(expr)}" placeholder="angle 表达式"/>
                            </div>`
                            : `<div class="angle-control-main">
                                <input class="input angle-value" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="angleValue" value="${esc(formatAngleValue(value))}"/>
                                <select class="input angle-unit" data-display-idx="${idx}" data-display-field="angleUnit">
                                    <option value="deg" ${unit === "deg" ? "selected" : ""}>度</option>
                                    <option value="rad" ${unit === "rad" ? "selected" : ""}>弧度</option>
                                </select>
                            </div>`}
                    </div>
                </div>
            `;
        }

        if (scope === "shape_display") {
            return `
                <div class="angle-control">
                    <div class="grid2">
                        <select class="input" data-card-id="${esc(opts.cardId || "")}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="angleMode">
                            <option value="numeric" ${mode === "numeric" ? "selected" : ""}>角度输入</option>
                            <option value="expr" ${mode === "expr" ? "selected" : ""}>表达式</option>
                        </select>
                        ${mode === "expr"
                            ? `<div class="grid2">
                                <select class="input expr-input" data-card-id="${esc(opts.cardId || "")}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="angleExprPreset">${this.getAngleExprPresetOptionsHtml(expr)}</select>
                                <input class="input expr-input" data-card-id="${esc(opts.cardId || "")}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="angleExpr" value="${esc(expr)}" placeholder="angle 表达式"/>
                            </div>`
                            : `<div class="angle-control-main">
                                <input class="input angle-value" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(opts.cardId || "")}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="angleValue" value="${esc(formatAngleValue(value))}"/>
                                <select class="input angle-unit" data-card-id="${esc(opts.cardId || "")}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="angleUnit">
                                    <option value="deg" ${unit === "deg" ? "selected" : ""}>度</option>
                                    <option value="rad" ${unit === "rad" ? "selected" : ""}>弧度</option>
                                </select>
                            </div>`}
                    </div>
                </div>
            `;
        }

        return `
            <div class="angle-control">
                <div class="grid2">
                    <select class="input" data-card-id="${esc(opts.cardId || "")}" data-card-field="rotateAngleMode">
                        <option value="numeric" ${mode === "numeric" ? "selected" : ""}>角度输入</option>
                        <option value="expr" ${mode === "expr" ? "selected" : ""}>表达式</option>
                    </select>
                    ${mode === "expr"
                        ? `<div class="grid2">
                            <select class="input expr-input" data-card-id="${esc(opts.cardId || "")}" data-card-field="rotateAnglePreset">${this.getAngleExprPresetOptionsHtml(expr)}</select>
                            <input class="input expr-input" data-card-id="${esc(opts.cardId || "")}" data-card-field="rotateAngleExpr" value="${esc(expr)}" placeholder="angle 表达式"/>
                        </div>`
                        : `<div class="angle-control-main">
                            <input class="input angle-value" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(opts.cardId || "")}" data-card-field="rotateAngleValue" value="${esc(formatAngleValue(value))}"/>
                            <select class="input angle-unit" data-card-id="${esc(opts.cardId || "")}" data-card-field="rotateAngleUnit">
                                <option value="deg" ${unit === "deg" ? "selected" : ""}>度</option>
                                <option value="rad" ${unit === "rad" ? "selected" : ""}>弧度</option>
                            </select>
                        </div>`}
                </div>
            </div>
        `;
    }

    getRelativeTargetPresetOptionsHtml(selectedExpr = "") {
        const presets = this.getRelativeTargetPresets();
        const pick = String(selectedExpr || "").trim();
        const hasPick = !!pick && presets.some((p) => p.expr === pick);
        const rows = [`<option value="" ${hasPick ? "" : "selected"}>选择预设或全局变量</option>`];
        for (const p of presets) {
            rows.push(`<option value="${esc(p.expr)}" ${p.expr === pick ? "selected" : ""}>${esc(p.label)}</option>`);
        }
        return rows.join("");
    }

    getRelativeTargetPresets() {
        const out = [
            { label: "RelativeLocation.yAxis()", expr: "RelativeLocation.yAxis()" },
            { label: "RelativeLocation(0,1,0)", expr: "RelativeLocation(0.0, 1.0, 0.0)" }
        ];
        for (const v of this.state.globalVars) {
            const name = String(v.name || "").trim();
            if (!name) continue;
            const type = String(v.type || "").trim();
            if (type === "Vec3") out.push({ label: `${name}.asRelative()`, expr: `${name}.asRelative()` });
            if (type === "RelativeLocation") out.push({ label: `${name}`, expr: `${name}` });
        }
        return out;
    }

    getAngleExprPresetOptionsHtml(selectedExpr = "") {
        const selected = String(selectedExpr || "").trim();
        const presets = ["speed / 180 * PI", "PI / 180", "0.01", "0.05", "PI * 0.1"];
        for (const g of this.state.globalVars) {
            const name = String(g.name || "").trim();
            const type = String(g.type || "").trim();
            if (!name) continue;
            if (["Int", "Long", "Float", "Double"].includes(type)) {
                presets.push(name);
                presets.push(`${name} / 180 * PI`);
            }
        }
        const uniq = Array.from(new Set(presets.filter(Boolean)));
        if (selected && !uniq.includes(selected)) uniq.unshift(selected);
        return uniq.map((expr) => `<option value="${esc(expr)}" ${expr === selected ? "selected" : ""}>${esc(expr)}</option>`).join("");
    }

    getParticleInitTargetOptionsHtml(selectedTarget = "") {
        const selected = String(selectedTarget || "").trim() || "size";
        const rows = [];
        if (!PARTICLE_INIT_TARGET_OPTIONS.includes(selected)) {
            rows.push({ value: selected, label: `${selected} (自定义)` });
        }
        for (const target of PARTICLE_INIT_TARGET_OPTIONS) {
            rows.push({ value: target, label: this.getParticleInitTargetLabel(target) });
        }
        return rows.map((row) => `<option value="${esc(row.value)}" ${row.value === selected ? "selected" : ""}>${esc(row.label)}</option>`).join("");
    }

    getParticleInitTargetLabel(targetRaw = "") {
        const target = String(targetRaw || "").trim();
        if (target === "size" || target === "particleSize") return `${target} (粒子尺寸)`;
        if (target === "particleAlpha" || target === "alpha") return `${target} (透明度)`;
        if (target === "currentAge" || target === "age") return `${target} (年龄)`;
        if (target === "textureSheet") return "textureSheet (贴图序号)";
        if (target === "color" || target === "particleColor") return `${target} (颜色 Vec3)`;
        return target;
    }

    isParticleInitVectorTarget(targetRaw = "") {
        const target = String(targetRaw || "").trim().toLowerCase();
        return target === "color" || target === "particlecolor" || target === "particle.particlecolor";
    }

    getParticleInitDefaultExprByTarget(targetRaw = "") {
        const target = String(targetRaw || "").trim().toLowerCase();
        if (target === "size" || target === "particlesize" || target === "particle.particlesize") return "0.2";
        if (target === "alpha" || target === "particlealpha" || target === "particle.particlealpha") return "1.0";
        if (target === "currentage" || target === "age") return "0";
        if (target === "texturesheet") return "0";
        if (target === "color" || target === "particlecolor" || target === "particle.particlecolor") return "Vec3(0.0, 0.0, 0.0)";
        return "0";
    }

    getParticleInitValuePresetOptionsHtml(selectedExpr = "", targetRaw = "") {
        const selected = String(selectedExpr || "").trim();
        const useVector = this.isParticleInitVectorTarget(targetRaw);
        const projectClass = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const rows = [{ value: "", label: "手动输入常量" }];
        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            const type = String(g?.type || "").trim();
            if (!name) continue;
            const isVector = type === "Vec3" || type === "RelativeLocation" || type === "Vector3f";
            const isNumeric = type === "Int" || type === "Long" || type === "Float" || type === "Double";
            if (useVector && !isVector) continue;
            if (!useVector && !isNumeric) continue;
            rows.push({
                value: `this@${projectClass}.${name}`,
                label: `${name}（全局变量 ${type}）`
            });
        }
        if (!useVector) {
            for (const c of (this.state.globalConsts || [])) {
                const name = String(c?.name || "").trim();
                if (!name) continue;
                rows.push({ value: name, label: `${name}（全局常量）` });
            }
        }
        const uniq = [];
        const used = new Set();
        for (const it of rows) {
            const key = String(it.value || "");
            if (used.has(key)) continue;
            used.add(key);
            uniq.push(it);
        }
        if (selected && !used.has(selected)) {
            uniq.unshift({ value: selected, label: `${selected}（当前值）` });
        }
        return uniq.map((it) => {
            const val = String(it.value || "");
            const active = selected ? (val === selected) : (!val);
            return `<option value="${esc(val)}" ${active ? "selected" : ""}>${esc(it.label)}</option>`;
        }).join("");
    }

    resolveParticleInitPresetExpr(exprRaw = "", targetRaw = "") {
        const expr = String(exprRaw || "").trim();
        if (!expr) return "";
        const useVector = this.isParticleInitVectorTarget(targetRaw);
        const projectClass = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const classRef = expr.match(/^this@[A-Za-z_][A-Za-z0-9_]*\.([A-Za-z_][A-Za-z0-9_]*)$/);
        if (classRef) {
            const name = classRef[1];
            for (const g of (this.state.globalVars || [])) {
                if (String(g?.name || "").trim() !== name) continue;
                const type = String(g?.type || "").trim();
                const isVector = type === "Vec3" || type === "RelativeLocation" || type === "Vector3f";
                const isNumeric = type === "Int" || type === "Long" || type === "Float" || type === "Double";
                if (useVector ? isVector : isNumeric) {
                    return `this@${projectClass}.${name}`;
                }
                return "";
            }
            return "";
        }
        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            if (!name) continue;
            const type = String(g?.type || "").trim();
            const isVector = type === "Vec3" || type === "RelativeLocation" || type === "Vector3f";
            const isNumeric = type === "Int" || type === "Long" || type === "Float" || type === "Double";
            if (useVector ? !isVector : !isNumeric) continue;
            const expected = `this@${projectClass}.${name}`;
            if (expr === expected) return expected;
        }
        if (useVector) return "";
        for (const c of (this.state.globalConsts || [])) {
            const name = String(c?.name || "").trim();
            if (!name) continue;
            if (expr === name) return expr;
        }
        return "";
    }

    renderParticleInitRows(card) {
        const list = Array.isArray(card?.particleInit) ? card.particleInit : [];
        return list.map((it, pIdx) => {
            const targetOptions = this.getParticleInitTargetOptionsHtml(it.target);
            const presetSelected = String(it.exprPreset || "").trim() || this.resolveParticleInitPresetExpr(it.expr || "", it.target);
            const valuePresetOptions = this.getParticleInitValuePresetOptionsHtml(presetSelected, it.target);
            const manualVisible = !presetSelected;
            const manualPlaceholder = this.getParticleInitDefaultExprByTarget(it.target);
            return `
                <div class="kv-row grid-pinit">
                    <select class="input" data-card-id="${card.id}" data-pinit-idx="${pIdx}" data-pinit-field="target">${targetOptions}</select>
                    <div class="pinit-value ${manualVisible ? "" : "preset-only"}">
                        <select class="input expr-input" data-card-id="${card.id}" data-pinit-idx="${pIdx}" data-pinit-field="exprPreset">${valuePresetOptions}</select>
                        <input class="input expr-input mono ${manualVisible ? "" : "pinit-manual-hidden"}" data-card-id="${card.id}" data-pinit-idx="${pIdx}" data-pinit-field="expr" value="${esc(it.expr || "")}" placeholder="${esc(manualPlaceholder)}"/>
                    </div>
                    <button class="btn small" data-act="remove-pinit" data-card-id="${card.id}" data-idx="${pIdx}">删除</button>
                </div>
            `;
        }).join("");
    }

    renderCards() {
        this.ensureSelectionValid();
        this.dom.cardsRoot.innerHTML = this.state.cards.map((card, idx) => this.renderCardHtml(card, idx)).join("");
        this.decorateCardSubgroups();
        this.refreshCodeEditors();
        this.updateSelectionStatus();
    }

    inferSectionKeyFromTitle(title, fallback = "base") {
        const text = String(title || "").trim();
        if (!text) return fallback;
        if (text === "基础") return "base";
        if (text === "Point" || text === "PointsBuilder") return "source";
        if (text === "Single: Particle Init") return "single_particle_init";
        if (text === "Single: Controller Init") return "single_controller_init";
        if (text === "Shape 点设置") return "shape_base";
        if (text === "子点类型参数") return "shape_child_params";
        if (text === "形状 Axis") return "shape_axis";
        if (text === "形状 Display 行为") return "shape_display";
        if (text.includes("缩放助手")) return "shape_scale";
        if (text.includes("生长动画")) return "growth";
        return fallback;
    }

    decorateCardSubgroups() {
        const cards = this.dom.cardsRoot?.querySelectorAll?.(".card[data-card-id]") || [];
        for (const cardEl of cards) {
            const cardId = String(cardEl.dataset.cardId || "");
            const card = this.getCardById(cardId);
            if (!card) continue;
            card.sectionCollapse = normalizeCardSectionCollapse(card.sectionCollapse);
            const groups = cardEl.querySelectorAll(".card-body > .subgroup");
            let idx = 0;
            for (const group of groups) {
                group.dataset.cardId = cardId;
                let titleEl = group.querySelector(":scope > .subgroup-title");
                if (!titleEl) {
                    titleEl = Array.from(group.children).find((n) => n?.classList?.contains("subgroup-title")) || null;
                }
                if (!titleEl) continue;
                const fallback = CARD_SECTION_KEYS[Math.min(idx, CARD_SECTION_KEYS.length - 1)] || "base";
                let sectionKey = String(group.dataset.sectionKey || "").trim();
                if (!CARD_SECTION_KEYS.includes(sectionKey)) {
                    sectionKey = this.inferSectionKeyFromTitle(titleEl.textContent, fallback);
                }
                if (!CARD_SECTION_KEYS.includes(sectionKey)) sectionKey = fallback;
                group.dataset.sectionKey = sectionKey;
                const collapsed = this.isCardSectionCollapsed(card, sectionKey);
                group.classList.toggle("collapsed", collapsed);

                const bodyNodes = Array.from(group.children).filter((n) => n !== titleEl);
                const head = document.createElement("div");
                head.className = "subgroup-head";
                const toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = "iconbtn subgroup-toggle";
                toggle.dataset.act = "toggle-section-fold";
                toggle.dataset.cardId = cardId;
                toggle.dataset.sectionKey = sectionKey;
                toggle.textContent = collapsed ? "▶" : "▼";
                toggle.title = collapsed ? "展开" : "折叠";
                const titleWrap = document.createElement("div");
                titleWrap.className = "subgroup-title";
                titleWrap.textContent = String(titleEl.textContent || "");
                head.appendChild(toggle);
                head.appendChild(titleWrap);

                const body = document.createElement("div");
                body.className = "subgroup-body";
                for (const node of bodyNodes) body.appendChild(node);

                group.innerHTML = "";
                group.appendChild(head);
                group.appendChild(body);
                idx += 1;
            }
        }
    }

    renderCardHtml(card, idx) {
        const selected = this.selectedCardIds.has(card.id);
        const fold = card.folded ? "▶" : "▼";
        const builderStats = this.evaluateBuilderPoints(card.builderState);
        const builderNodeCount = this.countBuilderNodes(card.builderState?.root?.children || []);
        const builderPointCount = (builderStats.points || []).length;
        const effectOptions = card.dataType === "single" ? this.getEffectOptionsHtml(card.singleEffectClass) : "";
        const shapeBindMode = card.shapeBindMode === "builder" ? "builder" : "point";

        return `
            <section class="card ${selected ? "selected" : ""}" data-card-id="${card.id}">
                <header class="card-head" data-card-id="${card.id}">
                    <div class="card-head-left">
                        <button class="iconbtn" data-act="toggle-fold" data-card-id="${card.id}" title="折叠">${fold}</button>
                        <div class="card-name">${esc(card.name || `卡片 ${idx + 1}`)}</div>
                    </div>
                    <div class="card-head-actions">
                        <button class="btn small" data-act="collapse-all-sections" data-card-id="${card.id}" title="折叠全部分区">折叠所有</button>
                        <button class="btn small" data-act="expand-all-sections" data-card-id="${card.id}" title="展开全部分区">展开所有</button>
                        <button class="iconbtn" data-act="move-card-up" data-card-id="${card.id}" title="上移">↑</button>
                        <button class="iconbtn" data-act="move-card-down" data-card-id="${card.id}" title="下移">↓</button>
                        <button class="iconbtn" data-act="duplicate-card" data-card-id="${card.id}" title="复制">⧉</button>
                        <button class="iconbtn" data-act="delete-card" data-card-id="${card.id}" title="删除">🗑</button>
                    </div>
                </header>
                ${card.folded ? "" : `
                    <div class="card-body">
                        <div class="subgroup" data-section-key="base">
                            <div class="subgroup-title">基础</div>
                            <div class="grid2">
                                <label class="field">
                                    <span>绑定方式</span>
                                    <select class="input" data-card-id="${card.id}" data-card-field="bindMode">
                                        <option value="builder" ${card.bindMode === "builder" ? "selected" : ""}>PointsBuilder</option>
                                        <option value="point" ${card.bindMode === "point" ? "selected" : ""}>Point</option>
                                    </select>
                                </label>
                                <label class="field">
                                    <span>点类型</span>
                                    <select class="input" data-card-id="${card.id}" data-card-field="dataType">
                                        <option value="single" ${card.dataType === "single" ? "selected" : ""}>single</option>
                                        <option value="particle_shape" ${card.dataType === "particle_shape" ? "selected" : ""}>ParticleShapeComposition</option>
                                        <option value="sequenced_shape" ${card.dataType === "sequenced_shape" ? "selected" : ""}>SequencedParticleShapeComposition</option>
                                    </select>
                                </label>
                                ${card.dataType === "single" ? `<label class="field">
                                    <span>Effect</span>
                                    <select class="input" data-card-id="${card.id}" data-card-field="singleEffectClass">${effectOptions}</select>
                                </label>` : ""}
                            </div>
                        </div>

                        ${card.bindMode === "point" ? `
                            <div class="subgroup" data-section-key="source">
                                <div class="subgroup-title">Point</div>
                                <div class="grid3">
                                    <label class="field"><span>X</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-point-field="x" value="${esc(String(card.point.x))}"/></label>
                                    <label class="field"><span>Y</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-point-field="y" value="${esc(String(card.point.y))}"/></label>
                                    <label class="field"><span>Z</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-point-field="z" value="${esc(String(card.point.z))}"/></label>
                                </div>
                            </div>
                        ` : `
                            <div class="subgroup" data-section-key="source">
                                <div class="subgroup-title">PointsBuilder</div>
                                <div class="kv-list">
                                    <div class="kv-row display-row">
                                        <div class="builder-actions">
                                            <button class="btn small primary" data-act="open-builder-editor" data-card-id="${card.id}">编辑 Builder</button>
                                            <button class="btn small" data-act="import-builder-json" data-card-id="${card.id}">导入 JSON</button>
                                            <button class="btn small" data-act="export-builder-json" data-card-id="${card.id}">导出 JSON</button>
                                            <button class="btn small" data-act="clear-builder" data-card-id="${card.id}">清空</button>
                                        </div>
                                    </div>
                                    <div class="kv-row display-row">
                                        <div class="builder-meta">节点 ${builderNodeCount} / 预览点 ${builderPointCount}</div>
                                    </div>
                                </div>
                            </div>
                        `}

                        ${card.dataType === "single" ? `
                            <div class="subgroup" data-section-key="single_particle_init">
                                <div class="subgroup-title">Single: Particle Init</div>
                                <div class="list-tools">
                                    <button class="btn small primary" data-act="add-pinit" data-card-id="${card.id}">添加 init</button>
                                </div>
                                <div class="kv-list">
                                    ${this.renderParticleInitRows(card)}
                                </div>
                            </div>

                            <div class="subgroup" data-section-key="single_controller_init">
                                <div class="subgroup-title">Single: Controller Init</div>
                                <div class="list-tools">
                                    <button class="btn small primary" data-act="add-cvar" data-card-id="${card.id}">添加局部变量</button>
                                    <button class="btn small primary" data-act="add-caction" data-card-id="${card.id}">添加 tick action</button>
                                </div>
                                <div class="kv-list">
                                    ${card.controllerVars.map((it, cIdx) => `
                                        <div class="kv-row grid-var">
                                            <input class="input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="name" value="${esc(it.name)}" placeholder="name"/>
                                            <select class="input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="type">
                                                ${CONTROLLER_VAR_TYPES.map((tp) => `<option value="${esc(tp)}" ${it.type === tp ? "selected" : ""}>${esc(tp)}</option>`).join("")}
                                            </select>
                                            <input class="input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="expr" value="${esc(it.expr)}" placeholder="初值"/>
                                            <div></div><div></div>
                                            <button class="btn small" data-act="remove-cvar" data-card-id="${card.id}" data-idx="${cIdx}">删除</button>
                                        </div>
                                    `).join("")}
                                </div>
                                <div class="kv-list">
                                    ${(card.controllerActions || []).map((a, aIdx) => this.renderControllerActionRow(card.id, a, aIdx)).join("")}
                                </div>
                            </div>
                        ` : `
                            <div class="subgroup" data-section-key="shape_axis">
                                <div class="subgroup-title">形状 Axis</div>
                                <div class="grid2">
                                    <label class="field">
                                        <span>axis 预设</span>
                                        <select class="input expr-input" data-card-id="${card.id}" data-card-shape-axis-field="axisPreset">${this.getRelativeTargetPresetOptionsHtml(card.shapeAxisPreset || card.shapeAxisExpr)}</select>
                                    </label>
                                    <label class="field">
                                        <span>axis 输入</span>
                                        <input class="input expr-input" data-card-id="${card.id}" data-card-shape-axis-field="axisExpr" value="${esc(card.shapeAxisExpr || "")}" placeholder="axis 表达式"/>
                                    </label>
                                </div>
                                <div class="grid5 vector-inputs">
                                    <select class="input vector-ctor" data-card-id="${card.id}" data-card-shape-axis-field="axisManualCtor">
                                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${card.shapeAxisManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                                    </select>
                                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-shape-axis-field="axisManualX" value="${esc(formatNumberCompact(card.shapeAxisManualX))}" placeholder="x"/>
                                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-shape-axis-field="axisManualY" value="${esc(formatNumberCompact(card.shapeAxisManualY))}" placeholder="y"/>
                                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-shape-axis-field="axisManualZ" value="${esc(formatNumberCompact(card.shapeAxisManualZ))}" placeholder="z"/>
                                    <button class="btn small primary" data-act="apply-shape-axis-manual" data-card-id="${card.id}">套用手动输入</button>
                                </div>
                            </div>

                            <div class="subgroup" data-section-key="shape_display">
                                <div class="subgroup-title">形状 Display 行为</div>
                                <div class="list-tools">
                                    <button class="btn small primary" data-act="add-shape-display-action" data-card-id="${card.id}">添加 display action</button>
                                </div>
                                <div class="kv-list">
                                    ${(card.shapeDisplayActions || []).map((a, aIdx) => this.renderShapeDisplayActionRow(card.id, a, aIdx)).join("")}
                                </div>
                            </div>
                            ${this.renderShapeChildParamsSection(card, shapeBindMode)}

                            ${this.renderScaleHelperEditor({
                                scope: "card",
                                cardId: card.id,
                                scale: card.shapeScale,
                                helperName: "缩放助手-卡片",
                                sectionKey: "shape_scale"
                            })}
                        `}

                        ${card.dataType === "sequenced_shape"
                            ? this.renderCardAnimates(card.id, "growthAnimates", card.growthAnimates, "生长动画", "add-growth-animate", "remove-growth-animate", { sectionKey: "growth" })
                            : ""}
                    </div>
                `}
            </section>
        `;
    }

    renderShapeChildParamsSection(card, shapeBindMode = "point") {
        if (!card) return "";
        const normalizedShapeBindMode = shapeBindMode === "builder" ? "builder" : "point";
        const shapeBuilderStats = this.evaluateBuilderPoints(card.shapeBuilderState);
        const shapeBuilderNodeCount = this.countBuilderNodes(card.shapeBuilderState?.root?.children || []);
        const shapeBuilderPointCount = (shapeBuilderStats.points || []).length;
        const childType = ["single", "particle_shape", "sequenced_shape"].includes(String(card.shapeChildType || ""))
            ? String(card.shapeChildType)
            : "single";
        const shapeBaseBlock = `
            <div class="mini-note">Shape 点设置</div>
            <div class="grid2">
                <label class="field">
                    <span>子点来源</span>
                    <select class="input" data-card-id="${card.id}" data-card-shape-field="bindMode">
                        <option value="point" ${normalizedShapeBindMode === "point" ? "selected" : ""}>point</option>
                        <option value="builder" ${normalizedShapeBindMode === "builder" ? "selected" : ""}>PointsBuilder</option>
                    </select>
                </label>
            </div>
            ${normalizedShapeBindMode === "point" ? `
                <div class="grid3">
                    <label class="field"><span>X</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-shape-field="pointX" value="${esc(formatNumberCompact(card.shapePoint?.x))}"/></label>
                    <label class="field"><span>Y</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-shape-field="pointY" value="${esc(formatNumberCompact(card.shapePoint?.y))}"/></label>
                    <label class="field"><span>Z</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-shape-field="pointZ" value="${esc(formatNumberCompact(card.shapePoint?.z))}"/></label>
                </div>
            ` : `
                <div class="kv-list">
                    <div class="kv-row display-row">
                        <div class="builder-actions">
                            <button class="btn small primary" data-act="open-shape-builder-editor" data-card-id="${card.id}">编辑 Shape Builder</button>
                            <button class="btn small" data-act="import-shape-builder-json" data-card-id="${card.id}">导入 JSON</button>
                            <button class="btn small" data-act="export-shape-builder-json" data-card-id="${card.id}">导出 JSON</button>
                            <button class="btn small" data-act="clear-shape-builder" data-card-id="${card.id}">清空</button>
                        </div>
                    </div>
                    <div class="kv-row display-row">
                        <div class="builder-meta">节点 ${shapeBuilderNodeCount} / 预览点 ${shapeBuilderPointCount}</div>
                    </div>
                </div>
            `}
        `;
        const typeSelector = `
            <div class="grid2">
                <label class="field">
                    <span>子点类型</span>
                    <select class="input" data-card-id="${card.id}" data-card-shape-child-field="shapeChildType">
                        <option value="single" ${childType === "single" ? "selected" : ""}>single</option>
                        <option value="particle_shape" ${childType === "particle_shape" ? "selected" : ""}>ParticleShapeComposition</option>
                        <option value="sequenced_shape" ${childType === "sequenced_shape" ? "selected" : ""}>SequencedParticleShapeComposition</option>
                    </select>
                </label>
                ${childType === "single"
                    ? `<label class="field">
                        <span>子点 Effect</span>
                        <select class="input" data-card-id="${card.id}" data-card-shape-child-field="shapeChildEffectClass">${this.getEffectOptionsHtml(card.shapeChildEffectClass || card.singleEffectClass)}</select>
                    </label>`
                    : `<div class="mini-note">非 single 子点可继续配置子点来源与子点行为</div>`}
            </div>
        `;

        if (childType === "single") {
            return `
                <div class="subgroup subgroup-tight" data-section-key="shape_child_params">
                    <div class="subgroup-title">子点类型参数</div>
                    ${shapeBaseBlock}
                    ${typeSelector}
                    <div class="mini-note">Single: Particle Init</div>
                    <div class="list-tools">
                        <button class="btn small primary" data-act="add-pinit" data-card-id="${card.id}">添加 init</button>
                    </div>
                    <div class="kv-list">
                        ${this.renderParticleInitRows(card)}
                    </div>
                    <div class="mini-note">Single: Controller Init</div>
                    <div class="list-tools">
                        <button class="btn small primary" data-act="add-cvar" data-card-id="${card.id}">添加局部变量</button>
                        <button class="btn small primary" data-act="add-caction" data-card-id="${card.id}">添加 tick action</button>
                    </div>
                    <div class="kv-list">
                        ${card.controllerVars.map((it, cIdx) => `
                            <div class="kv-row grid-var">
                                <input class="input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="name" value="${esc(it.name)}" placeholder="name"/>
                                <select class="input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="type">
                                    ${CONTROLLER_VAR_TYPES.map((tp) => `<option value="${esc(tp)}" ${it.type === tp ? "selected" : ""}>${esc(tp)}</option>`).join("")}
                                </select>
                                <input class="input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="expr" value="${esc(it.expr)}" placeholder="初值"/>
                                <div></div><div></div>
                                <button class="btn small" data-act="remove-cvar" data-card-id="${card.id}" data-idx="${cIdx}">删除</button>
                            </div>
                        `).join("")}
                    </div>
                    <div class="kv-list">
                        ${(card.controllerActions || []).map((a, aIdx) => this.renderControllerActionRow(card.id, a, aIdx)).join("")}
                    </div>
                </div>
            `;
        }

        const childBindMode = card.shapeChildBindMode === "builder" ? "builder" : "point";
        const childBuilderStats = this.evaluateBuilderPoints(card.shapeChildBuilderState);
        const childBuilderNodeCount = this.countBuilderNodes(card.shapeChildBuilderState?.root?.children || []);
        const childBuilderPointCount = (childBuilderStats.points || []).length;

        const growthBlock = childType === "sequenced_shape"
            ? this.renderCardAnimates(
                card.id,
                "shapeChildGrowthAnimates",
                card.shapeChildGrowthAnimates,
                "子点生长动画",
                "add-shape-child-growth-animate",
                "remove-shape-child-growth-animate",
                { embedOnly: true }
            )
            : "";
        const childCollapsed = !!card.shapeChildCollapsed;
        const childFoldIcon = childCollapsed ? "▶" : "▼";
        const nestedBlocks = this.renderNestedShapeLevels(card);

        return `
            <div class="subgroup subgroup-tight" data-section-key="shape_child_params">
                <div class="subgroup-title">子点类型参数</div>
                ${shapeBaseBlock}
                ${typeSelector}
                <div class="subgroup subgroup-tight nested-shape-level ${childCollapsed ? "collapsed" : ""}" data-shape-level="0">
                    <div class="subgroup-head">
                        <button class="iconbtn subgroup-toggle" data-act="toggle-shape-child-fold" data-card-id="${card.id}" title="${childCollapsed ? "展开" : "折叠"}">${childFoldIcon}</button>
                        <div class="subgroup-title">嵌套层 1</div>
                    </div>
                    <div class="subgroup-body">
                        <div class="mini-note">子点来源</div>
                        <div class="grid2">
                            <label class="field">
                                <span>子点基础选项</span>
                                <select class="input" data-card-id="${card.id}" data-card-shape-child-field="bindMode">
                                    <option value="point" ${childBindMode === "point" ? "selected" : ""}>point</option>
                                    <option value="builder" ${childBindMode === "builder" ? "selected" : ""}>PointsBuilder</option>
                                </select>
                            </label>
                        </div>
                        ${childBindMode === "point" ? `
                            <div class="grid3">
                                <label class="field"><span>X</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-shape-child-field="pointX" value="${esc(formatNumberCompact(card.shapeChildPoint?.x))}"/></label>
                                <label class="field"><span>Y</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-shape-child-field="pointY" value="${esc(formatNumberCompact(card.shapeChildPoint?.y))}"/></label>
                                <label class="field"><span>Z</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-shape-child-field="pointZ" value="${esc(formatNumberCompact(card.shapeChildPoint?.z))}"/></label>
                            </div>
                        ` : `
                            <div class="kv-list">
                                <div class="kv-row display-row">
                                    <div class="builder-actions">
                                        <button class="btn small primary" data-act="open-shape-child-builder-editor" data-card-id="${card.id}">编辑子点 Builder</button>
                                        <button class="btn small" data-act="import-shape-child-builder-json" data-card-id="${card.id}">导入 JSON</button>
                                        <button class="btn small" data-act="export-shape-child-builder-json" data-card-id="${card.id}">导出 JSON</button>
                                        <button class="btn small" data-act="clear-shape-child-builder" data-card-id="${card.id}">清空</button>
                                    </div>
                                </div>
                                <div class="kv-row display-row">
                                    <div class="builder-meta">节点 ${childBuilderNodeCount} / 预览点 ${childBuilderPointCount}</div>
                                </div>
                            </div>
                        `}
                        <div class="mini-note">子点 Axis</div>
                        <div class="grid2">
                            <label class="field">
                                <span>child axis 预设</span>
                                <select class="input expr-input" data-card-id="${card.id}" data-card-shape-child-axis-field="axisPreset">${this.getRelativeTargetPresetOptionsHtml(card.shapeChildAxisPreset || card.shapeChildAxisExpr)}</select>
                            </label>
                            <label class="field">
                                <span>child axis 输入</span>
                                <input class="input expr-input" data-card-id="${card.id}" data-card-shape-child-axis-field="axisExpr" value="${esc(card.shapeChildAxisExpr || "")}" placeholder="axis 表达式"/>
                            </label>
                        </div>
                        <div class="grid5 vector-inputs">
                            <select class="input vector-ctor" data-card-id="${card.id}" data-card-shape-child-axis-field="axisManualCtor">
                                ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${card.shapeChildAxisManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                            </select>
                            <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-shape-child-axis-field="axisManualX" value="${esc(formatNumberCompact(card.shapeChildAxisManualX))}" placeholder="x"/>
                            <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-shape-child-axis-field="axisManualY" value="${esc(formatNumberCompact(card.shapeChildAxisManualY))}" placeholder="y"/>
                            <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-shape-child-axis-field="axisManualZ" value="${esc(formatNumberCompact(card.shapeChildAxisManualZ))}" placeholder="z"/>
                            <button class="btn small primary" data-act="apply-shape-child-axis-manual" data-card-id="${card.id}">套用手动输入</button>
                        </div>
                        <div class="mini-note">子点 Display 行为</div>
                        <div class="list-tools">
                            <button class="btn small primary" data-act="add-shape-child-display-action" data-card-id="${card.id}">添加子点 display action</button>
                        </div>
                        <div class="kv-list">
                            ${(card.shapeChildDisplayActions || []).map((a, aIdx) => this.renderShapeChildDisplayActionRow(card.id, a, aIdx)).join("")}
                        </div>
                        <div class="mini-note">缩放助手-嵌套1（可选）</div>
                        ${this.renderScaleHelperEditor({
                            scope: "shape_child",
                            cardId: card.id,
                            scale: card.shapeChildScale,
                            helperName: "缩放助手-嵌套1",
                            embedOnly: true
                        })}
                        ${growthBlock}
                    </div>
                </div>
                ${(card.shapeChildLevels || []).length ? `<div class="mini-note">已配置嵌套层 ${(card.shapeChildLevels || []).length}</div>` : ""}
                ${nestedBlocks}
            </div>
        `;
    }

    renderControllerActionRow(cardId, action, idx) {
        const item = normalizeControllerAction(action);
        const typeOptions = CONTROLLER_ACTION_TYPES
            .map((it) => `<option value="${esc(it.id)}" ${item.type === it.id ? "selected" : ""}>${esc(it.title)}</option>`)
            .join("");
        return `
            <div class="kv-row display-row">
                <div class="grid2">
                    <select class="input" data-card-id="${esc(cardId)}" data-cact-idx="${idx}" data-cact-field="type">${typeOptions}</select>
                    <div class="preview-actions"><button class="btn small" data-act="remove-caction" data-card-id="${esc(cardId)}" data-idx="${idx}">删除</button></div>
                </div>
                <textarea class="input script-area expr-input" data-code-editor="js" data-code-title="tick action (JS)" data-card-id="${esc(cardId)}" data-cact-idx="${idx}" data-cact-field="script" placeholder="if (...) { ... }&#10;addSingle() / addMultiple(2)">${esc(item.script || "")}</textarea>
            </div>
        `;
    }

    renderCardAnimates(cardId, key, list, label, addAct, removeAct, opts = {}) {
        const sectionKeyAttr = opts.sectionKey ? ` data-section-key="${esc(String(opts.sectionKey))}"` : "";
        const embedOnly = !!opts.embedOnly;
        const rows = (list || []).map((a, idx) => `
            <div class="kv-row grid-animate">
                <input class="input" type="number" min="1" step="1" data-card-id="${cardId}" data-card-animate-type="${key}" data-card-animate-idx="${idx}" data-card-animate-field="count" value="${esc(String(a.count))}"/>
                <input class="input expr-input" data-card-id="${cardId}" data-card-animate-type="${key}" data-card-animate-idx="${idx}" data-card-animate-field="condition" value="${esc(a.condition)}" placeholder="条件表达式"/>
                <button class="btn small" data-act="${removeAct}" data-card-id="${cardId}" data-idx="${idx}">删除</button>
            </div>
        `).join("");
        const body = `
            <div class="list-tools"><button class="btn small primary" data-act="${addAct}" data-card-id="${cardId}">添加</button></div>
            <div class="kv-list">${rows}</div>
        `;
        if (embedOnly) {
            return `
                <div class="mini-note">${esc(label)}</div>
                ${body}
            `;
        }
        return `
            <div class="subgroup"${sectionKeyAttr}>
                <div class="subgroup-title">${esc(label)}</div>
                ${body}
            </div>
        `;
    }

    getEffectOptionsHtml(selected) {
        const opts = Array.from(new Set([...EFFECT_CLASS_OPTIONS, String(selected || "").trim()].filter(Boolean)));
        return opts.map((it) => `<option value="${esc(it)}" ${it === selected ? "selected" : ""}>${esc(it)}</option>`).join("");
    }

    rebuildPreview() {
        this.previewCycleCache = null;
        this.previewExprCountCache.clear();
        this.previewExprPrefixCache.clear();
        this.previewCondFnCache.clear();
        this.previewNumericFnCache.clear();
        this.previewRuntimeGlobals = null;
        this.previewRuntimeAppliedTick = -1;
        const points = [];
        const owners = [];
        const birthOffsets = [];
        const ownerLocalIndex = [];
        const ownerPointCount = [];
        const anchorBases = [];
        const localBases = [];
        const anchorRefs = [];
        const localRefs = [];
        const levelBases = [];
        const levelRefs = [];
        const useLocalOpsList = [];
        const appendFlatPoints = (cardId, pointList) => {
            const src = Array.isArray(pointList) ? pointList : [];
            const len = Math.max(1, src.length);
            for (let idx = 0; idx < src.length; idx++) {
                const p = src[idx];
                const v = U.v(num(p?.x), num(p?.y), num(p?.z));
                points.push(v);
                owners.push(cardId);
                birthOffsets.push(0);
                ownerLocalIndex.push(idx);
                ownerPointCount.push(len);
                anchorBases.push(v);
                localBases.push(U.v(0, 0, 0));
                anchorRefs.push(idx);
                localRefs.push(0);
                levelBases.push([]);
                levelRefs.push([]);
                useLocalOpsList.push(false);
            }
        };
        const appendShapePoints = (cardId, anchors, locals) => {
            const anchorList = Array.isArray(anchors) ? anchors : [];
            const localList = Array.isArray(locals) ? locals : [];
            if (!anchorList.length || !localList.length) return;
            const ownerTotal = anchorList.length * localList.length;
            let ownerIdx = 0;
            for (let ai = 0; ai < anchorList.length; ai++) {
                const a = U.v(num(anchorList[ai]?.x), num(anchorList[ai]?.y), num(anchorList[ai]?.z));
                for (let li = 0; li < localList.length; li++) {
                    const tuple = localList[li] || {};
                    const tupleSum = tuple.sum || tuple.local || tuple;
                    const l = U.v(num(tupleSum?.x), num(tupleSum?.y), num(tupleSum?.z));
                    const tupleLevels = Array.isArray(tuple.levels) ? tuple.levels : [];
                    points.push(U.v(a.x + l.x, a.y + l.y, a.z + l.z));
                    owners.push(cardId);
                    birthOffsets.push(0);
                    ownerLocalIndex.push(ownerIdx++);
                    ownerPointCount.push(ownerTotal);
                    anchorBases.push(a);
                    localBases.push(l);
                    anchorRefs.push(ai);
                    localRefs.push(li);
                    levelBases.push(tupleLevels.map((it) => U.v(num(it?.vec?.x), num(it?.vec?.y), num(it?.vec?.z))));
                    levelRefs.push(tupleLevels.map((it) => int(it?.ref || 0)));
                    useLocalOpsList.push(true);
                }
            }
        };
        for (const card of this.state.cards) {
            const basePoints = [];
            if (card.bindMode === "point") {
                basePoints.push(U.v(card.point.x, card.point.y, card.point.z));
            } else {
                const built = this.evaluateBuilderPoints(card.builderState);
                for (const p of (built.points || [])) {
                    basePoints.push(U.v(p.x, p.y, p.z));
                }
            }

            if (card.dataType !== "single" && basePoints.length) {
                const locals = this.buildShapeLocalTuplesForPreview(card);
                if (locals.length) {
                    appendShapePoints(card.id, basePoints, locals);
                }
                continue;
            }

            if (basePoints.length) {
                appendFlatPoints(card.id, basePoints);
            }
        }
        this.previewBasePoints = points.map((p) => U.clone(p));
        this.previewPoints = points.map((p) => U.clone(p));
        this.previewOwners = owners;
        this.previewBirthOffsets = birthOffsets;
        this.previewOwnerLocalIndex = ownerLocalIndex;
        this.previewOwnerPointCount = ownerPointCount;
        this.previewAnchorBase = anchorBases;
        this.previewLocalBase = localBases;
        this.previewAnchorRef = anchorRefs;
        this.previewLocalRef = localRefs;
        this.previewLevelBases = levelBases;
        this.previewLevelRefs = levelRefs;
        this.previewUseLocalOps = useLocalOpsList;
        this.previewAnimStart = performance.now();
        this.updatePreviewGeometry(points, owners);
    }

    updatePreviewGeometry(points, owners) {
        if (!this.pointsGeom) return;
        const count = points.length;
        const posAttr = this.pointsGeom.getAttribute("position");
        const colAttr = this.pointsGeom.getAttribute("color");
        const sizeAttr = this.pointsGeom.getAttribute("aSize");
        const alphaAttr = this.pointsGeom.getAttribute("aAlpha");
        if (!posAttr || posAttr.array.length !== count * 3) {
            this.pointsGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        }
        if (!colAttr || colAttr.array.length !== count * 3) {
            this.pointsGeom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        }
        if (!sizeAttr || sizeAttr.array.length !== count) {
            this.pointsGeom.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(count), 1));
        }
        if (!alphaAttr || alphaAttr.array.length !== count) {
            this.pointsGeom.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(count), 1));
        }
        const positions = this.pointsGeom.getAttribute("position").array;
        const colors = this.pointsGeom.getAttribute("color").array;
        const sizes = this.pointsGeom.getAttribute("aSize").array;
        const alphas = this.pointsGeom.getAttribute("aAlpha").array;
        this.previewVisibleMask = new Array(count).fill(true);
        this.previewSizeFactors = new Array(count).fill(1);
        this.previewAlphaFactors = new Array(count).fill(1);
        const visualCache = new Map();
        const colorFactorCache = new Map();
        for (let i = 0; i < count; i++) {
            const p = points[i];
            positions[i * 3 + 0] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;
            const owner = owners[i];
            let visual = visualCache.get(owner);
            if (!visual) {
                visual = this.resolveCardPreviewVisual(owner);
                visualCache.set(owner, visual);
            }
            const rgb = visual.color;
            let k = colorFactorCache.get(owner);
            if (k === undefined) {
                k = this.getCardColorFactor(owner);
                colorFactorCache.set(owner, k);
            }
            colors[i * 3 + 0] = rgb[0] * k;
            colors[i * 3 + 1] = rgb[1] * k;
            colors[i * 3 + 2] = rgb[2] * k;
            sizes[i] = Math.max(0.05, num(visual.size));
            alphas[i] = clamp(num(visual.alpha), 0, 1);
            this.previewSizeFactors[i] = Math.max(0.05, num(visual.size));
            this.previewAlphaFactors[i] = clamp(num(visual.alpha), 0, 1);
        }
        this.pointsGeom.attributes.position.needsUpdate = true;
        this.pointsGeom.attributes.color.needsUpdate = true;
        this.pointsGeom.attributes.aSize.needsUpdate = true;
        this.pointsGeom.attributes.aAlpha.needsUpdate = true;
        this.pointsGeom.computeBoundingSphere();
        if (this.pointsMat) this.pointsMat.size = this.state.settings.pointSize;
        const statusText = `点数: ${count}/${this.previewBasePoints.length || count}`;
        if (this.lastPointsStatusText !== statusText) {
            this.lastPointsStatusText = statusText;
            this.dom.statusPoints.textContent = statusText;
        }
        this.updateSelectionStatus();
    }

    updatePreviewAnimation() {
        if (!this.pointsGeom || !this.previewBasePoints.length) return;
        const now = performance.now();
        const totalCount = this.previewBasePoints.length;
        const minInterval = totalCount >= 50000 ? 16 : 0;
        if (minInterval > 0 && (now - this.previewPerfLastTs) < minInterval) return;
        this.previewPerfLastTs = now;
        const elapsedTick = (now - this.previewAnimStart) / 50;
        const cycleCfg = this.previewCycleCache || (this.previewCycleCache = this.getPreviewCycleConfig());
        const cycleAppear = cycleCfg.appear;
        const cycleLive = cycleCfg.live;
        const cycleFade = cycleCfg.fade;
        const cycleTotal = cycleCfg.total;
        const globalCycleAge = ((elapsedTick % cycleTotal) + cycleTotal) % cycleTotal;
        const positions = this.pointsGeom.getAttribute("position")?.array;
        const colors = this.pointsGeom.getAttribute("color")?.array;
        const sizes = this.pointsGeom.getAttribute("aSize")?.array;
        const alphas = this.pointsGeom.getAttribute("aAlpha")?.array;
        if (!positions || !colors || !sizes || !alphas) return;
        const skipExprPerPoint = totalCount >= 50000;
        const runtimeActions = this.buildPreviewRuntimeActions(elapsedTick, this.state.displayActions || [], {
            skipExpression: skipExprPerPoint,
            scope: "display"
        });
        const globalAxis = this.resolveCompositionAxisDirection();
        const tickStep = Math.max(0, Math.floor(elapsedTick));
        if (!this.previewRuntimeGlobals || tickStep < this.previewRuntimeAppliedTick) {
            this.previewRuntimeGlobals = this.buildPreviewRuntimeGlobals(0, 0, 0);
            this.previewRuntimeAppliedTick = -1;
        }
        const frameRuntimeGlobals = this.previewRuntimeGlobals;
        for (let t = this.previewRuntimeAppliedTick + 1; t <= tickStep; t++) {
            this.applyExpressionGlobalsOnce(runtimeActions, t, t, frameRuntimeGlobals, globalAxis);
        }
        if (tickStep > this.previewRuntimeAppliedTick) this.previewRuntimeAppliedTick = tickStep;
        const ownerCache = new Map();
        const anchorCache = new Map();
        const localCache = new Map();
        const colorFactorCache = new Map();

        let visible = 0;
        for (let i = 0; i < this.previewBasePoints.length; i++) {
            const base = this.previewBasePoints[i];
            const owner = this.previewOwners[i];
            const localIndex = int(this.previewOwnerLocalIndex[i] || 0);
            const ownerCount = int(this.previewOwnerPointCount[i] || 1);
            const anchorBase = this.previewAnchorBase[i] || base;
            const localBase = this.previewLocalBase[i] || U.v(0, 0, 0);
            const anchorRef = int(this.previewAnchorRef[i] || 0);
            const localRef = int(this.previewLocalRef[i] || 0);
            const useLocalOps = !!this.previewUseLocalOps[i];
            const birthOffset = num(this.previewBirthOffsets[i] || 0);
            const birthKey = int(birthOffset * 1000);
            let byBirth = ownerCache.get(owner);
            if (!byBirth) {
                byBirth = new Map();
                ownerCache.set(owner, byBirth);
            }
            let cached = byBirth.get(birthKey);
            if (!cached) {
                const age = ((elapsedTick - birthOffset) % cycleTotal + cycleTotal) % cycleTotal;
                const card = this.getCardById(owner);
                let shapeRuntimeLevels = [];
                if (card) {
                    if (card.dataType !== "single") {
                        shapeRuntimeLevels = this.getShapeRuntimeLevelsForPreview(card, elapsedTick, skipExprPerPoint);
                        for (const lv of shapeRuntimeLevels) {
                            this.applyExpressionGlobalsOnce(lv.actions, elapsedTick, age, frameRuntimeGlobals, lv.axis || globalAxis);
                        }
                    }
                }
                const visual = this.resolveCardPreviewVisual(owner, {
                    runtimeVars: frameRuntimeGlobals,
                    elapsedTick,
                    ageTick: age,
                    pointIndex: 0
                });
                const visibleLimit = this.evaluateGrowthVisibleLimit(
                    owner,
                    ownerCount,
                    age,
                    globalCycleAge,
                    elapsedTick,
                    runtimeActions,
                    shapeRuntimeLevels[0]?.actions || [],
                    cycleCfg
                );
                cached = {
                    ownerCount,
                    age,
                    shapeRuntimeLevels,
                    cardRuntimeHasExpression: shapeRuntimeLevels.some((lv) => !!lv.hasExpression),
                    cardHasShapeOps: !!(card && card.dataType !== "single"),
                    visibleLimit,
                    visual
                };
                byBirth.set(birthKey, cached);
            }

            const isVisible = localIndex < clamp(int(cached.visibleLimit), 0, Math.max(1, ownerCount));
            this.previewVisibleMask[i] = !!isVisible;
            if (isVisible) visible++;

            let ownerAnchorCache = anchorCache.get(owner);
            if (!ownerAnchorCache) {
                ownerAnchorCache = new Map();
                anchorCache.set(owner, ownerAnchorCache);
            }
            let anchorsByBirth = ownerAnchorCache.get(birthKey);
            if (!anchorsByBirth) {
                anchorsByBirth = [];
                ownerAnchorCache.set(birthKey, anchorsByBirth);
            }
            let anchor = anchorsByBirth[anchorRef];
            if (!anchor) {
                const globalScale = this.resolveScaleFactor(this.state.projectScale, cached.age, cycleCfg);
                anchor = this.applyScaleFactorToPoint(anchorBase, globalScale);
                anchor = this.applyRuntimeActionsToPoint(anchor, runtimeActions, elapsedTick, cached.age, anchorRef, globalAxis, {
                    skipExpression: skipExprPerPoint,
                    runtimeVars: frameRuntimeGlobals,
                    persistExpressionVars: false
                });
                anchorsByBirth[anchorRef] = anchor;
            }

            let px = anchor.x;
            let py = anchor.y;
            let pz = anchor.z;
            if (useLocalOps && cached.cardHasShapeOps) {
                let local = null;
                const localCacheable = !cached.cardRuntimeHasExpression;
                let ownerLocalCache = localCache.get(owner);
                if (!ownerLocalCache) {
                    ownerLocalCache = new Map();
                    localCache.set(owner, ownerLocalCache);
                }
                let localsByBirth = ownerLocalCache.get(birthKey);
                if (!localsByBirth) {
                    localsByBirth = [];
                    ownerLocalCache.set(birthKey, localsByBirth);
                }
                if (localCacheable) local = localsByBirth[localRef];
                if (!local) {
                    const levelBaseList = Array.isArray(this.previewLevelBases[i]) && this.previewLevelBases[i].length
                        ? this.previewLevelBases[i]
                        : [localBase];
                    const levelRefList = Array.isArray(this.previewLevelRefs[i]) && this.previewLevelRefs[i].length
                        ? this.previewLevelRefs[i]
                        : [localRef];
                    const runtimeLevels = Array.isArray(cached.shapeRuntimeLevels) ? cached.shapeRuntimeLevels : [];
                    let localSum = U.v(0, 0, 0);
                    for (let lvIdx = 0; lvIdx < levelBaseList.length; lvIdx++) {
                        const lvBase = levelBaseList[lvIdx] || U.v(0, 0, 0);
                        const lvPointRef = int(levelRefList[lvIdx] ?? localRef);
                        const lvRuntime = runtimeLevels[lvIdx] || null;
                        let lvPoint = U.clone(lvBase);
                        if (lvRuntime) {
                            const cardScale = this.resolveScaleFactor(lvRuntime.scale, cached.age, cycleCfg);
                            lvPoint = this.applyScaleFactorToPoint(lvPoint, cardScale);
                            if (lvRuntime.actions && lvRuntime.actions.length) {
                                lvPoint = this.applyRuntimeActionsToPoint(
                                    lvPoint,
                                    lvRuntime.actions,
                                    elapsedTick,
                                    cached.age,
                                    lvPointRef,
                                    lvRuntime.axis || globalAxis,
                                    {
                                        skipExpression: skipExprPerPoint,
                                        runtimeVars: frameRuntimeGlobals,
                                        persistExpressionVars: false
                                    }
                                );
                            }
                        }
                        localSum.x += num(lvPoint.x);
                        localSum.y += num(lvPoint.y);
                        localSum.z += num(lvPoint.z);
                    }
                    local = localSum;
                    if (localCacheable) localsByBirth[localRef] = local;
                }
                px = anchor.x + local.x;
                py = anchor.y + local.y;
                pz = anchor.z + local.z;
            }

            positions[i * 3 + 0] = px;
            positions[i * 3 + 1] = py;
            positions[i * 3 + 2] = pz;
            let pRef = this.previewPoints[i];
            if (!pRef) {
                pRef = U.v(px, py, pz);
                this.previewPoints[i] = pRef;
            } else {
                pRef.x = px;
                pRef.y = py;
                pRef.z = pz;
            }

            const rgb = cached.visual.color;
            let ownerColorFactor = colorFactorCache.get(owner);
            if (ownerColorFactor === undefined) {
                ownerColorFactor = this.getCardColorFactor(owner);
                colorFactorCache.set(owner, ownerColorFactor);
            }
            const k = ownerColorFactor * (isVisible ? 1 : 0);
            colors[i * 3 + 0] = rgb[0] * k;
            colors[i * 3 + 1] = rgb[1] * k;
            colors[i * 3 + 2] = rgb[2] * k;
            sizes[i] = Math.max(0.05, num(cached.visual.size)) * (isVisible ? 1 : 0.01);
            alphas[i] = clamp(num(cached.visual.alpha), 0, 1) * (isVisible ? 1 : 0);
        }

        this.pointsGeom.attributes.position.needsUpdate = true;
        this.pointsGeom.attributes.color.needsUpdate = true;
        this.pointsGeom.attributes.aSize.needsUpdate = true;
        this.pointsGeom.attributes.aAlpha.needsUpdate = true;
        const statusText = `点数: ${visible}/${this.previewBasePoints.length}`;
        if (this.lastPointsStatusText !== statusText) {
            this.lastPointsStatusText = statusText;
            this.dom.statusPoints.textContent = statusText;
        }
    }

    getPreviewCycleConfig() {
        let appear = 16;
        const live = 70;
        let fade = 16;
        const maxOwner = Math.max(1, ...this.previewOwnerPointCount.map((x) => Math.max(1, int(x || 1))));
        const maxCards = Math.max(1, this.state.cards.length);
        let hasExprGrowth = false;
        let maxGrowthTarget = 1;

        const estimateGrowthStepFromScript = (scriptRaw) => {
            const src = String(scriptRaw || "");
            if (!src) return 0;
            let step = (src.match(/addSingle\s*\(/g) || []).length;
            for (const m of src.matchAll(/addMultiple\s*\(\s*([^)]+)\s*\)/g)) {
                step += Math.max(1, int(this.evaluateNumericExpression(m[1] || "1")));
            }
            return Math.max(0, step);
        };

        const eatExprGrowth = (actions, targetCount = maxOwner) => {
            const list = Array.isArray(actions) ? actions : [];
            let step = 0;
            for (const raw of list) {
                const act = normalizeDisplayAction(raw);
                if (act.type !== "expression") continue;
                const src = String(act.expression || "");
                const singleHits = (src.match(/addSingle\s*\(/g) || []).length;
                if (singleHits) {
                    step += singleHits;
                    hasExprGrowth = true;
                }
                for (const m of src.matchAll(/addMultiple\s*\(\s*([^)]+)\s*\)/g)) {
                    step += Math.max(1, int(this.evaluateNumericExpression(m[1] || "1")));
                    hasExprGrowth = true;
                }
            }
            const safeTarget = Math.max(1, int(targetCount || 1));
            if (step > 0) {
                appear = Math.max(appear, Math.ceil(safeTarget / step));
                maxGrowthTarget = Math.max(maxGrowthTarget, safeTarget);
            }
        };

        eatExprGrowth(this.state.displayActions || [], maxCards);
        for (const card of this.state.cards) {
            if (card.dataType !== "single") {
                eatExprGrowth(card.shapeDisplayActions || [], maxOwner);
            } else {
                let step = 0;
                for (const action of (card.controllerActions || [])) {
                    step += estimateGrowthStepFromScript(action?.script || "");
                }
                if (step > 0) {
                    appear = Math.max(appear, Math.ceil(maxOwner / step));
                    hasExprGrowth = true;
                    maxGrowthTarget = Math.max(maxGrowthTarget, maxOwner);
                }
            }
        }
        if (hasExprGrowth) {
            appear = Math.max(appear, maxGrowthTarget);
            fade = Math.max(fade, appear);
        }
        return { appear, live, fade, total: appear + live + fade };
    }

    evaluateGrowthVisibleLimit(ownerCardId, ownerCount, ageTick, globalCycleAge, elapsedTick, globalRuntimeActions = [], cardRuntimeActions = [], cycleCfg = null) {
        const cycle = cycleCfg || this.getPreviewCycleConfig();
        const sequencedRoot = this.state.compositionType === "sequenced";
        let growthAge = num(ageTick);
        const fadeStart = cycle.appear + cycle.live;
        if (growthAge >= fadeStart) {
            growthAge = Math.max(0, cycle.appear - (growthAge - fadeStart));
        } else if (growthAge > cycle.appear) {
            growthAge = cycle.appear;
        }

        const totalCards = Math.max(1, this.state.cards.length);
        const cardIndexRaw = this.getCardIndexById(ownerCardId);
        const cardIndex = cardIndexRaw >= 0 ? cardIndexRaw : 0;
        let rootVisibleCards = Number.POSITIVE_INFINITY;
        let hasRootGrowthSource = false;

        if (sequencedRoot && this.state.compositionAnimates.length) {
            const n = this.computeAnimateVisibleCount(this.state.compositionAnimates, globalCycleAge, elapsedTick, 0);
            rootVisibleCards = Math.min(rootVisibleCards, n);
            hasRootGrowthSource = true;
        }
        const rootExprCount = this.computeExpressionVisibleCount(globalRuntimeActions, totalCards, growthAge);
        if (Number.isFinite(rootExprCount)) {
            rootVisibleCards = Math.min(rootVisibleCards, rootExprCount);
            hasRootGrowthSource = true;
        }
        if (sequencedRoot && !hasRootGrowthSource) return 0;
        if (Number.isFinite(rootVisibleCards)) {
            const cardLimit = clamp(int(rootVisibleCards), 0, totalCards);
            if (cardIndex >= cardLimit) return 0;
        }

        const card = this.getCardById(ownerCardId);
        if (!card) return ownerCount;
        let visibleLimit = Math.max(1, ownerCount);
        let hasLocalGrowthSource = false;

        if (card.dataType === "sequenced_shape") {
            if (card.growthAnimates?.length) {
                const n = this.computeAnimateVisibleCount(card.growthAnimates, growthAge, elapsedTick, 0);
                visibleLimit = Math.min(visibleLimit, n);
                hasLocalGrowthSource = true;
            }
            const cardExprCount = this.computeExpressionVisibleCount(cardRuntimeActions, ownerCount, growthAge);
            if (Number.isFinite(cardExprCount)) {
                visibleLimit = Math.min(visibleLimit, cardExprCount);
                hasLocalGrowthSource = true;
            }
            // 子卡片是 SequencedParticleShapeComposition 且没有任何生长来源时，默认全不显示
            if (!hasLocalGrowthSource) return 0;
        } else if (card.dataType === "single" && Array.isArray(card.controllerActions) && card.controllerActions.length) {
            const controllerExprActions = card.controllerActions
                .map((it) => normalizeControllerAction(it))
                .map((it) => ({ type: "expression", expression: String(it.script || ""), fn: null }));
            const n = this.computeExpressionVisibleCount(controllerExprActions, ownerCount, growthAge);
            if (Number.isFinite(n)) {
                visibleLimit = Math.min(visibleLimit, n);
                hasLocalGrowthSource = true;
            }
        } else {
            const cardExprCount = this.computeExpressionVisibleCount(cardRuntimeActions, ownerCount, growthAge);
            if (Number.isFinite(cardExprCount)) {
                visibleLimit = Math.min(visibleLimit, cardExprCount);
                hasLocalGrowthSource = true;
            }
        }

        if (!Number.isFinite(visibleLimit)) return Math.max(1, ownerCount);
        return clamp(int(visibleLimit), 0, Math.max(1, ownerCount));
    }

    computeExpressionVisibleCount(actionsOrScript, ownerCount, ageTick) {
        const steps = Math.max(0, Math.floor(num(ageTick)));
        const expressionActions = [];
        let sourceSignature = "";
        if (typeof actionsOrScript === "string") {
            const src = String(actionsOrScript || "").trim();
            if (src) {
                expressionActions.push({
                    type: "expression",
                    expression: transpileKotlinThisQualifierToJs(src),
                    expressionRaw: src,
                    fn: null
                });
                sourceSignature = `s:${src}`;
            }
        } else {
            for (const act of (Array.isArray(actionsOrScript) ? actionsOrScript : [])) {
                if (act?.type === "expression" && String(act.expression || "").trim()) expressionActions.push(act);
            }
            sourceSignature = expressionActions.map((act) => String(act.expression || "").trim()).join("\n--\n");
        }
        if (!expressionActions.length) return Number.POSITIVE_INFINITY;
        const growthApiRe = /\baddSingle\s*\(|\baddMultiple\s*\(/;
        const hasGrowthApi = expressionActions.some((act) => growthApiRe.test(String(act.expression || "")));
        if (!hasGrowthApi) return Number.POSITIVE_INFINITY;
        const safeOwnerCount = Math.max(1, int(ownerCount || 1));
        const prefixKey = `${safeOwnerCount}|${sourceSignature}`;
        let prefix = this.previewExprPrefixCache.get(prefixKey);
        if (!prefix) {
            const prepared = [];
            for (const act of expressionActions) {
                const srcRaw = String(act.expressionRaw || act.expression || "").trim();
                const src = transpileKotlinThisQualifierToJs(srcRaw);
                if (!src) continue;
                let fn = null;
                if (this.previewExprFnCache.has(src)) {
                    fn = this.previewExprFnCache.get(src) || null;
                } else {
                    try {
                        fn = new Function(
                            "vars",
                            "point",
                            "rotateTo",
                            "rotateAsAxis",
                            "rotateToWithAngle",
                            "addSingle",
                            "addMultiple",
                            "thisAt",
                            `with(vars){ ${src} }; return point;`
                        );
                    } catch {
                        fn = null;
                    }
                    if (this.previewExprFnCache.size > 1024) this.previewExprFnCache.clear();
                    this.previewExprFnCache.set(src, fn);
                }
                if (typeof fn === "function") prepared.push(fn);
            }
            prefix = { counts: [0], actions: prepared };
            if (this.previewExprPrefixCache.size > 256) this.previewExprPrefixCache.clear();
            this.previewExprPrefixCache.set(prefixKey, prefix);
        }
        const counts = Array.isArray(prefix.counts) ? prefix.counts : [0];
        let visible = Number(counts[counts.length - 1]) || 0;
        const actions = Array.isArray(prefix.actions) ? prefix.actions : [];
        for (let t = counts.length; t <= steps && visible < safeOwnerCount; t++) {
            for (const fn of actions) {
                const thisAt = (this.previewRuntimeGlobals && typeof this.previewRuntimeGlobals === "object")
                    ? this.previewRuntimeGlobals
                    : {};
                const baseVars = this.getExpressionVars(t, t, 0, { includeVectors: true });
                const baseProto = Object.getPrototypeOf(baseVars) || {};
                const vars = Object.assign({}, baseProto, baseVars);
                if (thisAt && typeof thisAt === "object") {
                    for (const [k, v] of Object.entries(thisAt)) vars[k] = v;
                }
                vars.thisAt = thisAt;
                const noop = () => {};
                const addSingle = () => {
                    visible += 1;
                };
                const addMultiple = (n) => {
                    visible += Math.max(1, int(n || 1));
                };
                try {
                    fn(vars, U.v(0, 0, 0), noop, noop, noop, addSingle, addMultiple, thisAt);
                } catch {
                }
                if (visible >= safeOwnerCount) break;
            }
            counts[t] = clamp(visible, 0, safeOwnerCount);
        }
        prefix.counts = counts;
        const result = Number.isFinite(counts[steps]) ? counts[steps] : clamp(visible, 0, safeOwnerCount);
        return result;
    }

    resolveScaleFactor(rawScaleCfg, ageTick, cycleCfg = null) {
        const cfg = normalizeScaleHelperConfig(rawScaleCfg, { type: "none" });
        if (cfg.type === "none") return 1;
        const cycle = cycleCfg || this.getPreviewCycleConfig();
        const age = num(ageTick);
        const fadeStart = cycle.appear + cycle.live;
        const inFade = age >= fadeStart;
        const fadeAge = Math.max(0, age - fadeStart);
        const tickMax = Math.max(1, int(cfg.tick || 1));
        const growTick = Math.min(tickMax, Math.max(0, age));
        let curveTick = growTick;
        if (cfg.reversedOnDisable && inFade) {
            curveTick = Math.max(0, tickMax - Math.min(tickMax, fadeAge));
        }
        return this.evalScaleCurve(cfg, curveTick, tickMax);
    }

    evalScaleCurve(cfg, tickRaw, tickMaxRaw = 1) {
        const tickMax = Math.max(1, num(tickMaxRaw));
        const tick = clamp(num(tickRaw), 0, tickMax);
        if (cfg.type === "bezier") {
            return this.evalScaleBezierValue(cfg, tick, tickMax);
        }
        const t = tick / tickMax;
        return num(cfg.min) + (num(cfg.max) - num(cfg.min)) * t;
    }

    evalScaleBezierValue(cfg, xTickRaw, tickMaxRaw) {
        const tickMax = Math.max(1, num(tickMaxRaw));
        const xTick = clamp(num(xTickRaw), 0, tickMax);
        const p0x = 0;
        const p0y = num(cfg.min);
        let p1xRaw = num(cfg.c1x);
        let p2xRaw = num(cfg.c2x);
        if (Math.abs(p1xRaw) <= 1 && Math.abs(p2xRaw) <= 1) {
            p1xRaw *= tickMax;
            p2xRaw *= tickMax;
        }
        const p1x = clamp(p1xRaw, 0, tickMax);
        const p1y = num(cfg.c1y);
        const p2x = clamp(p2xRaw, 0, tickMax);
        const p2y = num(cfg.c2y);
        const p3x = tickMax;
        const p3y = num(cfg.max);

        const cubic = (a, b, c, d, t) => {
            const inv = 1 - t;
            return inv * inv * inv * a + 3 * inv * inv * t * b + 3 * inv * t * t * c + t * t * t * d;
        };

        if (xTick <= 0) return p0y;
        if (xTick >= tickMax) return p3y;

        let lo = 0;
        let hi = 1;
        let mid = 0.5;
        for (let i = 0; i < 26; i++) {
            mid = (lo + hi) * 0.5;
            const x = cubic(p0x, p1x, p2x, p3x, mid);
            if (x < xTick) lo = mid;
            else hi = mid;
        }
        return cubic(p0y, p1y, p2y, p3y, mid);
    }

    applyScaleFactorToPoint(point, scaleFactor) {
        const s = num(scaleFactor);
        if (Math.abs(s - 1) <= 1e-9) return point;
        return U.v(point.x * s, point.y * s, point.z * s);
    }

    getShapeLeafType(card) {
        if (!card || card.dataType === "single") return "single";
        const chain = this.getShapeChildChain(card);
        if (!chain.length) return "single";
        for (const lv of chain) {
            const t = String(lv?.type || "single");
            if (t === "single") return "single";
        }
        return "single";
    }

    resolveShapeSourcePoints(bindMode, point, builderState) {
        if (bindMode === "builder") {
            const built = this.evaluateBuilderPoints(builderState);
            const pts = [];
            for (const p of (built?.points || [])) {
                pts.push(U.v(num(p?.x), num(p?.y), num(p?.z)));
            }
            return pts;
        }
        return [U.v(num(point?.x), num(point?.y), num(point?.z))];
    }

    combineLocalPointSets(base, extra) {
        const a = Array.isArray(base) ? base : [];
        const b = Array.isArray(extra) ? extra : [];
        if (!a.length || !b.length) return [];
        const out = [];
        for (const p of a) {
            for (const q of b) {
                out.push(U.v(num(p?.x) + num(q?.x), num(p?.y) + num(q?.y), num(p?.z) + num(q?.z)));
            }
        }
        return out;
    }

    buildShapeLocalTuplesForPreview(card) {
        if (!card || card.dataType === "single") return [];
        const rootPoints = this.resolveShapeSourcePoints(card.shapeBindMode, card.shapePoint, card.shapeBuilderState);
        let tuples = rootPoints.map((p, idx) => {
            const vec = U.v(num(p?.x), num(p?.y), num(p?.z));
            return {
                sum: U.clone(vec),
                levels: [{ vec, ref: idx }]
            };
        });
        if (!tuples.length) return [];

        const chain = this.getShapeChildChain(card);
        for (const levelRaw of chain) {
            const level = normalizeShapeNestedLevel(levelRaw);
            if (String(level.type || "single") === "single") break;
            const src = this.resolveShapeSourcePoints(level.bindMode, level.point, level.builderState);
            if (!src.length) return [];
            const next = [];
            for (const tuple of tuples) {
                const baseLevels = Array.isArray(tuple?.levels) ? tuple.levels : [];
                const sumBase = tuple?.sum || U.v(0, 0, 0);
                for (let si = 0; si < src.length; si++) {
                    const sp = src[si];
                    const sv = U.v(num(sp?.x), num(sp?.y), num(sp?.z));
                    const levels = baseLevels.map((lv) => ({ vec: U.v(num(lv?.vec?.x), num(lv?.vec?.y), num(lv?.vec?.z)), ref: int(lv?.ref || 0) }));
                    levels.push({ vec: U.clone(sv), ref: si });
                    next.push({
                        sum: U.v(num(sumBase?.x) + sv.x, num(sumBase?.y) + sv.y, num(sumBase?.z) + sv.z),
                        levels
                    });
                }
            }
            tuples = next;
            if (!tuples.length) break;
        }
        return tuples;
    }

    buildShapeLocalPointsForPreview(card) {
        const tuples = this.buildShapeLocalTuplesForPreview(card);
        return tuples.map((it) => U.v(num(it?.sum?.x), num(it?.sum?.y), num(it?.sum?.z)));
    }

    getShapeRuntimeLevelsForPreview(card, elapsedTick, skipExpression = false) {
        if (!card || card.dataType === "single") return [];
        const levels = [];
        const rootActions = this.buildPreviewRuntimeActions(elapsedTick, card.shapeDisplayActions || [], {
            skipExpression,
            scope: "shape_display",
            cardId: card.id
        });
        levels.push({
            axis: this.resolveRelativeDirection(card.shapeAxisExpr || card.shapeAxisPreset || "RelativeLocation.yAxis()"),
            scale: normalizeScaleHelperConfig(card.shapeScale, { type: "none" }),
            actions: rootActions,
            hasExpression: !!rootActions.__hasExpression
        });
        const chain = this.getShapeChildChain(card);
        for (let i = 0; i < chain.length; i++) {
            const lv = normalizeShapeNestedLevel(chain[i], i);
            if (lv.type === "single") break;
            const actions = this.buildPreviewRuntimeActions(elapsedTick, lv.displayActions || [], {
                skipExpression,
                scope: "shape_level_display",
                cardId: card.id
            });
            levels.push({
                axis: this.resolveRelativeDirection(lv.axisExpr || lv.axisPreset || "RelativeLocation.yAxis()"),
                scale: normalizeScaleHelperConfig(lv.scale, { type: "none" }),
                actions,
                hasExpression: !!actions.__hasExpression
            });
        }
        return levels;
    }

    extractLastAssignedExprInScript(scriptRaw, names = []) {
        const src = String(scriptRaw || "");
        if (!src || !Array.isArray(names) || !names.length) return "";
        let out = "";
        for (const rawName of names) {
            const name = String(rawName || "").trim();
            if (!name) continue;
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(`(?:^|[;\\n])\\s*(?:let\\s+|var\\s+|const\\s+)?${escaped}\\s*=\\s*(?![=])([^;\\n]+)`, "g");
            let m = null;
            while ((m = re.exec(src)) !== null) {
                const expr = String(m[1] || "").trim();
                if (expr) out = expr;
            }
        }
        return out;
    }

    applyControllerScriptVisual(visual, scriptRaw, opts = {}) {
        if (!visual || !scriptRaw) return;
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const runtimeCtx = Object.assign({}, runtimeVars || {});
        const particleColor = U.v(
            clamp(num(visual.color?.[0]), 0, 1),
            clamp(num(visual.color?.[1]), 0, 1),
            clamp(num(visual.color?.[2]), 0, 1)
        );
        runtimeCtx.color = particleColor;
        runtimeCtx.particleColor = particleColor;
        runtimeCtx.size = num(visual.size);
        runtimeCtx.particleSize = num(visual.size);
        runtimeCtx.alpha = num(visual.alpha);
        runtimeCtx.particleAlpha = num(visual.alpha);
        runtimeCtx.currentAge = num(runtimeCtx.currentAge || 0);
        runtimeCtx.textureSheet = num(runtimeCtx.textureSheet || 0);
        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        const readVec = (expr) => this.parseVecLikeValueWithRuntime(expr, runtimeCtx, { elapsedTick, ageTick, pointIndex });
        const readNum = (expr) => this.evaluateNumericExpressionWithRuntime(expr, runtimeCtx, { elapsedTick, ageTick, pointIndex });

        const colorExpr = String(this.extractLastAssignedExprInScript(scriptRaw, [
            "color",
            "this.color",
            "particleColor",
            "this.particleColor",
            "particle.particleColor"
        ]) || "").trim();
        if (colorExpr) {
            const vec = readVec(colorExpr);
            visual.color = [clamp(num(vec.x), 0, 1), clamp(num(vec.y), 0, 1), clamp(num(vec.z), 0, 1)];
        }

        const sizeExpr = String(this.extractLastAssignedExprInScript(scriptRaw, [
            "size",
            "this.size",
            "particleSize",
            "this.particleSize",
            "particle.particleSize"
        ]) || "").trim();
        if (sizeExpr) {
            visual.size = Math.max(0.05, num(readNum(sizeExpr)));
        }

        const alphaExpr = String(this.extractLastAssignedExprInScript(scriptRaw, [
            "alpha",
            "this.alpha",
            "particleAlpha",
            "this.particleAlpha",
            "particle.particleAlpha"
        ]) || "").trim();
        if (alphaExpr) {
            visual.alpha = clamp(num(readNum(alphaExpr)), 0, 1);
        }
    }

    resolveCardPreviewVisual(cardId, opts = {}) {
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        const fallback = { color: this.getCardColorRgb(cardId), size: 0.2, alpha: 1 };
        const card = this.getCardById(cardId);
        if (!card) return fallback;
        const useSingleInit = card.dataType === "single"
            || (card.dataType !== "single" && this.getShapeLeafType(card) === "single");
        if (!useSingleInit) return fallback;
        const visual = { color: [...fallback.color], size: 0.2, alpha: 1 };
        for (const it of (card.particleInit || [])) {
            const target = String(it.target || "").trim().toLowerCase();
            const expr = String(it.expr || "").trim();
            if (!expr) continue;
            if (target === "color" || target === "particlecolor" || target === "particle.particlecolor") {
                const vec = this.parseVecLikeValueWithRuntime(expr, runtimeVars, { elapsedTick, ageTick, pointIndex });
                visual.color = [clamp(num(vec.x), 0, 1), clamp(num(vec.y), 0, 1), clamp(num(vec.z), 0, 1)];
            }
            if (target === "size" || target === "particlesize" || target === "particle.particlesize") {
                visual.size = Math.max(0.05, num(this.evaluateNumericExpressionWithRuntime(expr, runtimeVars, { elapsedTick, ageTick, pointIndex })));
            }
            if (target === "alpha" || target === "particlealpha" || target === "particle.particlealpha") {
                visual.alpha = clamp(num(this.evaluateNumericExpressionWithRuntime(expr, runtimeVars, { elapsedTick, ageTick, pointIndex })), 0, 1);
            }
        }
        for (const action of (card.controllerActions || [])) {
            this.applyControllerScriptVisual(visual, String(action?.script || ""), {
                runtimeVars,
                elapsedTick,
                ageTick,
                pointIndex
            });
        }
        return visual;
    }

    computeAnimateVisibleCount(list, ageTick, tick, index) {
        const arr = Array.isArray(list) ? list.map((it) => normalizeAnimate(it)) : [];
        if (!arr.length) return Number.POSITIVE_INFINITY;
        let count = 0;
        for (const it of arr) {
            if (!this.evaluateAnimateCondition(it.condition, ageTick, tick, index)) continue;
            count += Math.max(1, int(it.count || 1));
        }
        return count;
    }

    evaluateAnimateCondition(exprRaw, ageTick, tick, index) {
        const expr = String(exprRaw || "").trim();
        if (!expr) return true;
        const vars = this.getExpressionVars(tick, ageTick, index);
        let fn = this.previewCondFnCache.get(expr);
        if (fn === undefined) {
            try {
                fn = new Function("vars", `with(vars){ return !!(${expr}); }`);
            } catch {
                fn = null;
            }
            if (this.previewCondFnCache.size > 1024) this.previewCondFnCache.clear();
            this.previewCondFnCache.set(expr, fn);
        }
        if (typeof fn !== "function") return false;
        try {
            return !!fn(vars);
        } catch {
            return false;
        }
    }

    buildPreviewRuntimeActions(elapsedTick, rawActions = null, opts = {}) {
        const skipExpression = !!opts.skipExpression;
        const cardId = String(opts.cardId || "");
        const out = [];
        let hasExpression = false;
        const source = Array.isArray(rawActions) ? rawActions : (this.state.displayActions || []);
        for (const action of source) {
            const a = normalizeDisplayAction(action);
            if (a.type === "rotateTo") {
                out.push({ type: a.type, to: this.resolveRelativeDirection(a.toExpr || a.toPreset) });
                continue;
            }
            if (a.type === "rotateAsAxis") {
                const anglePerTick = this.resolveActionAnglePerTick(a, elapsedTick, elapsedTick, 0);
                const angle = ((anglePerTick * elapsedTick) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                out.push({ type: a.type, angle });
                continue;
            }
            if (a.type === "rotateToWithAngle") {
                const to = this.resolveRelativeDirection(a.toExpr || a.toPreset);
                const anglePerTick = this.resolveActionAnglePerTick(a, elapsedTick, elapsedTick, 0);
                const angle = ((anglePerTick * elapsedTick) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                out.push({ type: a.type, to, angle });
                continue;
            }
            if (a.type === "expression") {
                if (skipExpression) continue;
                const srcRaw = String(a.expression || "").trim();
                const src = transpileKotlinThisQualifierToJs(srcRaw);
                let fn = null;
                if (src) {
                    if (this.previewExprFnCache.has(src)) {
                        fn = this.previewExprFnCache.get(src) || null;
                    } else {
                        try {
                            fn = new Function(
                                "vars",
                                "point",
                                "rotateTo",
                                "rotateAsAxis",
                                "rotateToWithAngle",
                                "addSingle",
                                "addMultiple",
                                "thisAt",
                                `with(vars){ try { ${src} } catch(_e) {} }; return point;`
                            );
                        } catch {
                            fn = null;
                        }
                        if (this.previewExprFnCache.size > 1024) this.previewExprFnCache.clear();
                        this.previewExprFnCache.set(src, fn);
                    }
                    hasExpression = true;
                }
                out.push({ type: a.type, expression: src, expressionRaw: srcRaw, fn });
            }
        }
        out.__hasExpression = hasExpression;
        return out;
    }

    applyRuntimeActionsToPoint(point, runtimeActions, elapsedTick, ageTick, pointIndex, startAxis = null, opts = {}) {
        const list = Array.isArray(runtimeActions) ? runtimeActions : [];
        if (!list.length) return point;
        const skipExpression = !!opts.skipExpression;
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const persistExpressionVars = !!opts.persistExpressionVars;
        if (skipExpression && list.every((a) => a?.type === "expression")) return point;
        let p = U.clone(point);
        let axis = this.parseJsVec(startAxis || this.resolveCompositionAxisDirection());
        for (const a of list) {
            if (a.type === "rotateTo") {
                p = this.rotatePointToDirection(p, a.to, axis);
                axis = a.to;
                continue;
            }
            if (a.type === "rotateAsAxis") {
                p = U.rotateAroundAxis(p, axis, a.angle);
                continue;
            }
            if (a.type === "rotateToWithAngle") {
                p = this.rotatePointToDirection(p, a.to, axis);
                p = U.rotateAroundAxis(p, a.to, a.angle);
                axis = a.to;
                continue;
            }
            if (a.type === "expression") {
                if (skipExpression) continue;
                const res = this.applyExpressionActionToPoint(a, p, elapsedTick, ageTick, pointIndex, axis, {
                    runtimeVars,
                    persistExpressionVars
                });
                p = res.point;
                axis = res.axis;
            }
        }
        return p;
    }

    resolveActionAnglePerTick(action, elapsedTick = 0, ageTick = 0, pointIndex = 0) {
        if (!action) return 0;
        if (action.angleMode === "expr") {
            return num(this.evaluateNumericExpression(action.angleExpr || "0", { elapsedTick, ageTick, pointIndex }));
        }
        return U.angleToRad(num(action.angleValue), normalizeAngleUnit(action.angleUnit));
    }

    resolveCompositionAxisDirection() {
        const expr = String(this.state.compositionAxisExpr || this.state.compositionAxisPreset || "RelativeLocation.yAxis()");
        return this.resolveRelativeDirection(expr);
    }

    resolveRelativeDirection(exprRaw) {
        return this.exprRuntime.resolveRelativeDirection(exprRaw);
    }

    parseVecLikeValue(rawExpr) {
        return this.exprRuntime.parseVecLikeValue(rawExpr);
    }

    buildPreviewRuntimeGlobals(elapsedTick = 0, ageTick = 0, pointIndex = 0) {
        const out = {};
        const assign = (nameRaw, value) => {
            const name = String(nameRaw || "").trim();
            if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return;
            out[name] = value;
        };
        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            if (!name) continue;
            const type = String(g?.type || "").trim();
            const expr = String(g?.value || "");
            if (type === "Vec3" || type === "RelativeLocation" || type === "Vector3f") {
                assign(name, this.parseVecLikeValue(expr));
                continue;
            }
            if (type === "Boolean") {
                assign(name, /^true$/i.test(expr.trim()));
                continue;
            }
            if (type === "Int" || type === "Long" || type === "Float" || type === "Double") {
                assign(name, this.evaluateNumericExpression(expr, { elapsedTick, ageTick, pointIndex, includeVectors: false }));
                continue;
            }
            assign(name, expr);
        }
        for (const c of (this.state.globalConsts || [])) {
            const name = String(c?.name || "").trim();
            if (!name) continue;
            const type = String(c?.type || "").trim();
            const expr = String(c?.value || "0");
            if (type === "Boolean") {
                assign(name, /^true$/i.test(expr.trim()));
            } else {
                assign(name, this.evaluateNumericExpression(expr, { elapsedTick, ageTick, pointIndex, includeVectors: false }));
            }
        }
        return out;
    }

    evaluateNumericExpressionWithRuntime(exprRaw, runtimeVars = null, opts = {}) {
        const srcRaw = String(exprRaw || "").trim();
        if (!srcRaw) return 0;
        const src = transpileKotlinThisQualifierToJs(srcRaw).replace(/(\d+(?:\.\d+)?)[fFdDlL]\b/g, "$1");
        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        const thisAt = (runtimeVars && typeof runtimeVars === "object") ? runtimeVars : {};
        const baseVars = this.getExpressionVars(elapsedTick, ageTick, pointIndex, { includeVectors: true });
        const baseProto = Object.getPrototypeOf(baseVars) || {};
        const vars = Object.assign({}, baseProto, baseVars);
        if (thisAt && typeof thisAt === "object") {
            for (const [k, v] of Object.entries(thisAt)) vars[k] = v;
        }
        vars.thisAt = thisAt;
        let fn = this.previewNumericFnCache.get(src);
        if (fn === undefined) {
            try {
                fn = new Function("vars", "thisAt", `with(vars){ return (${src}); }`);
            } catch {
                fn = null;
            }
            if (this.previewNumericFnCache.size > 2048) this.previewNumericFnCache.clear();
            this.previewNumericFnCache.set(src, fn);
        }
        if (typeof fn !== "function") return 0;
        try {
            const out = fn(vars, vars.thisAt);
            return Number.isFinite(Number(out)) ? Number(out) : 0;
        } catch {
            return 0;
        }
    }

    parseVecLikeValueWithRuntime(rawExpr, runtimeVars = null, opts = {}) {
        const srcRaw = String(rawExpr || "").trim();
        if (!srcRaw) return U.v(0, 0, 0);
        const src = transpileKotlinThisQualifierToJs(srcRaw);
        if (src === "Vec3.ZERO") return U.v(0, 0, 0);
        if (src === "RelativeLocation.yAxis()") return U.v(0, 1, 0);
        if (src.endsWith(".asRelative()")) {
            return this.parseVecLikeValueWithRuntime(src.slice(0, -".asRelative()".length), runtimeVars, opts);
        }
        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(src)) {
            if (runtimeVars && typeof runtimeVars === "object" && runtimeVars[src]) {
                const v = runtimeVars[src];
                if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) {
                    return U.v(v.x, v.y, v.z);
                }
            }
        }
        const thisAtMatch = src.match(/^thisAt\.([A-Za-z_$][A-Za-z0-9_$]*)$/);
        if (thisAtMatch && runtimeVars && typeof runtimeVars === "object") {
            const v = runtimeVars[thisAtMatch[1]];
            if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) {
                return U.v(v.x, v.y, v.z);
            }
        }
        const m = src.match(/(?:Vec3|RelativeLocation|Vector3f)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i);
        if (m) {
            return U.v(
                this.evaluateNumericExpressionWithRuntime(m[1], runtimeVars, { elapsedTick, ageTick, pointIndex }),
                this.evaluateNumericExpressionWithRuntime(m[2], runtimeVars, { elapsedTick, ageTick, pointIndex }),
                this.evaluateNumericExpressionWithRuntime(m[3], runtimeVars, { elapsedTick, ageTick, pointIndex })
            );
        }
        return this.parseVecLikeValue(srcRaw);
    }

    applyExpressionGlobalsOnce(runtimeActions, elapsedTick, ageTick, runtimeVars, startAxis = null) {
        const actions = Array.isArray(runtimeActions) ? runtimeActions : [];
        if (!actions.length || !runtimeVars || typeof runtimeVars !== "object") return;
        let axis = this.parseJsVec(startAxis || this.resolveCompositionAxisDirection());
        for (const action of actions) {
            if (action?.type !== "expression") continue;
            const res = this.applyExpressionActionToPoint(
                action,
                U.v(0, 0, 0),
                elapsedTick,
                ageTick,
                0,
                axis,
                { runtimeVars, persistExpressionVars: true }
            );
            axis = res?.axis || axis;
        }
    }

    rotatePointToDirection(point, toDir, fromAxis = null) {
        const axis = (fromAxis && U.len(fromAxis) > 1e-6) ? U.norm(fromAxis) : this.resolveCompositionAxisDirection();
        const points = [U.clone(point)];
        rotatePointsToPointUpright(points, toDir, axis);
        return points[0] || point;
    }

    applyExpressionActionToPoint(action, point, elapsedTick, ageTick, pointIndex, axisInput = null, opts = {}) {
        const srcRaw = String(action?.expressionRaw || action?.expression || "").trim();
        const src = transpileKotlinThisQualifierToJs(srcRaw);
        const startAxis = this.parseJsVec(axisInput || this.resolveCompositionAxisDirection());
        if (!src) return { point, axis: startAxis };
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const persistExpressionVars = !!opts.persistExpressionVars;
        const thisAt = runtimeVars || {};
        const api = {
            point: U.clone(point),
            axis: U.clone(startAxis),
            rotateTo: (to) => {
                const dir = this.parseJsVec(to);
                api.point = this.rotatePointToDirection(api.point, dir, api.axis);
                api.axis = dir;
            },
            rotateAsAxis: (angle) => {
                const accum = Math.max(0, num(elapsedTick));
                const rot = (((num(angle) * accum) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                api.point = U.rotateAroundAxis(api.point, api.axis, rot);
            },
            rotateToWithAngle: (to, angle) => {
                const accum = Math.max(0, num(elapsedTick));
                const dir = this.parseJsVec(to);
                api.point = this.rotatePointToDirection(api.point, dir, api.axis);
                const rot = (((num(angle) * accum) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                api.point = U.rotateAroundAxis(api.point, dir, rot);
                api.axis = dir;
            },
            // 预览中 addSingle/addMultiple 不改变几何，仅保证表达式兼容
            addSingle: () => {},
            addMultiple: () => {}
        };
        const baseVars = this.getExpressionVars(elapsedTick, ageTick, pointIndex, { includeVectors: true });
        const baseProto = Object.getPrototypeOf(baseVars) || {};
        const vars = Object.assign({}, baseProto, baseVars);
        if (runtimeVars && typeof runtimeVars === "object") {
            for (const [k, v] of Object.entries(runtimeVars)) vars[k] = v;
        }
        vars.thisAt = thisAt;
        try {
            if (typeof action?.fn === "function") {
                action.fn(
                    vars,
                    api.point,
                    api.rotateTo,
                    api.rotateAsAxis,
                    api.rotateToWithAngle,
                    api.addSingle,
                    api.addMultiple,
                    thisAt
                );
            } else {
                const fn = new Function(
                    "vars",
                    "point",
                    "rotateTo",
                    "rotateAsAxis",
                    "rotateToWithAngle",
                    "addSingle",
                    "addMultiple",
                    "thisAt",
                    `with(vars){ try { ${src} } catch(_e) {} }; return point;`
                );
                fn(
                    vars,
                    api.point,
                    api.rotateTo,
                    api.rotateAsAxis,
                    api.rotateToWithAngle,
                    api.addSingle,
                    api.addMultiple,
                    thisAt
                );
            }
            if (runtimeVars && persistExpressionVars) {
                for (const key of Object.keys(runtimeVars)) {
                    if (Object.prototype.hasOwnProperty.call(vars, key)) {
                        runtimeVars[key] = vars[key];
                    }
                }
            }
            return { point: api.point, axis: api.axis };
        } catch {
            return { point, axis: startAxis };
        }
    }

    parseJsVec(v) {
        if (!v) return U.v(0, 1, 0);
        if (typeof v === "object" && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) {
            return U.norm(U.v(v.x, v.y, v.z));
        }
        return this.resolveRelativeDirection(String(v));
    }

    evaluateNumericExpression(exprRaw, opts = {}) {
        return this.exprRuntime.evaluateNumericExpression(exprRaw, opts);
    }

    getExpressionVars(elapsedTick = 0, ageTick = 0, pointIndex = 0, opts = {}) {
        return this.exprRuntime.getExpressionVars(elapsedTick, ageTick, pointIndex, opts);
    }

    getBuilderNumericContextMap() {
        const map = {};
        const entries = [];
        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            const type = String(g?.type || "").trim();
            if (!name) continue;
            if (!["Int", "Long", "Float", "Double"].includes(type)) continue;
            entries.push({ name, expr: String(g?.value || "0") });
        }
        for (const c of (this.state.globalConsts || [])) {
            const name = String(c?.name || "").trim();
            if (!name) continue;
            entries.push({ name, expr: String(c?.value || "0") });
        }
        map.PI = Math.PI;
        for (let pass = 0; pass < 6; pass++) {
            let changed = false;
            for (const it of entries) {
                const v = evaluateExprWithMap(it.expr, map);
                if (!Number.isFinite(v)) continue;
                if (map[it.name] !== v) {
                    map[it.name] = v;
                    changed = true;
                }
            }
            if (!changed) break;
        }
        delete map.PI;
        return map;
    }

    evaluateNumberLiteral(raw) {
        return this.exprRuntime.evaluateNumberLiteral(raw);
    }

    getCardColorRgb(cardId) {
        const key = String(cardId || "");
        if (this.cardColorCache.has(key)) return this.cardColorCache.get(key);
        const h = ((hashString(key) % 360) + 360) % 360 / 360;
        const c = new THREE.Color().setHSL(h, 0.76, 0.56);
        const out = [c.r, c.g, c.b];
        this.cardColorCache.set(key, out);
        return out;
    }

    getCardColorFactor(cardId) {
        if (!this.selectedCardIds.size) return 1;
        return this.selectedCardIds.has(cardId) ? 1 : 0.23;
    }

    onPreviewPointerDown(e) {
        if (e.button !== 0) return;
        this.selectPointerId = e.pointerId;
        this.selectState = {
            x0: e.clientX,
            y0: e.clientY,
            x1: e.clientX,
            y1: e.clientY,
            moved: false,
            append: !!(e.ctrlKey || e.metaKey)
        };
        this.hideSelectBox();
        try {
            this.renderer.domElement.setPointerCapture(e.pointerId);
        } catch {
        }
    }

    onPreviewPointerMove(e) {
        if (!this.selectState || this.selectPointerId !== e.pointerId) return;
        this.selectState.x1 = e.clientX;
        this.selectState.y1 = e.clientY;
        const dx = Math.abs(this.selectState.x1 - this.selectState.x0);
        const dy = Math.abs(this.selectState.y1 - this.selectState.y0);
        if (dx >= 3 || dy >= 3) this.selectState.moved = true;
        if (this.selectState.moved) {
            this.controls.enabled = false;
            this.applySelectBoxRect(this.getSelectionRectFromState(this.selectState));
        }
    }

    onPreviewPointerUp(e) {
        if (!this.selectState || this.selectPointerId !== e.pointerId) return;
        const sel = this.selectState;
        this.selectState = null;
        this.selectPointerId = null;
        try {
            this.renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
        }
        this.controls.enabled = true;

        if (sel.moved) {
            const rect = this.getSelectionRectFromState(sel);
            this.selectCardsByClientRect(rect, sel.append);
        } else {
            const picked = this.pickCardAtClientPoint(sel.x1, sel.y1);
            if (picked) this.selectCardById(picked, sel.append);
            else if (!sel.append) {
                this.selectedCardIds.clear();
                this.renderCards();
                this.updatePreviewGeometry(this.previewPoints, this.previewOwners);
                this.updateSelectionStatus();
            }
        }
        this.hideSelectBox();
    }

    getSelectionRectFromState(sel) {
        const x = Math.min(sel.x0, sel.x1);
        const y = Math.min(sel.y0, sel.y1);
        const w = Math.abs(sel.x1 - sel.x0);
        const h = Math.abs(sel.y1 - sel.y0);
        return { x, y, w, h };
    }

    applySelectBoxRect(clientRect) {
        const hostRect = this.dom.viewerWrap.getBoundingClientRect();
        const x = clientRect.x - hostRect.left;
        const y = clientRect.y - hostRect.top;
        this.dom.selectBox.style.left = `${x}px`;
        this.dom.selectBox.style.top = `${y}px`;
        this.dom.selectBox.style.width = `${clientRect.w}px`;
        this.dom.selectBox.style.height = `${clientRect.h}px`;
        this.dom.selectBox.classList.remove("hidden");
    }

    hideSelectBox() {
        this.dom.selectBox.classList.add("hidden");
        this.dom.selectBox.style.width = "0px";
        this.dom.selectBox.style.height = "0px";
    }

    pickCardAtClientPoint(clientX, clientY, radiusPx = 11) {
        let bestId = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < this.previewPoints.length; i++) {
            if (this.previewVisibleMask[i] === false) continue;
            const screen = this.worldToClient(this.previewPoints[i]);
            if (!screen) continue;
            const dx = screen.x - clientX;
            const dy = screen.y - clientY;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) {
                bestDist = d2;
                bestId = this.previewOwners[i] || null;
            }
        }
        if (bestDist <= radiusPx * radiusPx) return bestId;
        return null;
    }

    selectCardsByClientRect(clientRect, append = false) {
        const ids = [];
        const x2 = clientRect.x + clientRect.w;
        const y2 = clientRect.y + clientRect.h;
        for (let i = 0; i < this.previewPoints.length; i++) {
            if (this.previewVisibleMask[i] === false) continue;
            const screen = this.worldToClient(this.previewPoints[i]);
            if (!screen) continue;
            if (screen.x >= clientRect.x && screen.x <= x2 && screen.y >= clientRect.y && screen.y <= y2) {
                const id = this.previewOwners[i];
                if (id && !ids.includes(id)) ids.push(id);
            }
        }
        this.selectCards(ids, append);
    }

    worldToClient(p) {
        if (!this.camera || !this.renderer) return null;
        const rect = this.renderer.domElement.getBoundingClientRect();
        const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
        if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return null;
        return {
            x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
            y: rect.top + (-v.y * 0.5 + 0.5) * rect.height
        };
    }

    resetCamera() {
        if (!this.camera || !this.controls) return;
        this.camera.position.set(16, 11, 16);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    toggleFullscreen() {
        const host = this.dom.viewerWrap;
        if (!document.fullscreenElement) {
            host.requestFullscreen?.().catch(() => {});
        } else if (document.fullscreenElement === host) {
            document.exitFullscreen?.().catch(() => {});
        } else {
            document.exitFullscreen?.().catch(() => {});
        }
    }

    syncFullscreenUi() {
        const isFs = document.fullscreenElement === this.dom.viewerWrap;
        this.dom.btnFullscreen.textContent = isFs ? "退出全屏" : "预览全屏";
        this.onResize();
    }

    onResize() {
        this.applySplitSizesFromSettings();
        if (!this.renderer || !this.camera) return;
        const host = this.dom.threeHost;
        const width = Math.max(2, host.clientWidth || 2);
        const height = Math.max(2, host.clientHeight || 2);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    initLayoutSplitters() {
        if (this._splittersBound) return;
        this._splittersBound = true;
        this.applySplitSizesFromSettings();

        const resizer = this.dom.editorResizer;
        const pageEditor = this.dom.pageEditorWrap;
        const leftPanel = this.dom.leftPanel;
        if (resizer && pageEditor && leftPanel) {
            resizer.addEventListener("pointerdown", (ev) => {
                if ((window.innerWidth || 0) <= 1100) return;
                ev.preventDefault();
                const rect = pageEditor.getBoundingClientRect();
                const startX = ev.clientX;
                const startW = leftPanel.getBoundingClientRect().width;
                const minW = 400;
                const maxW = Math.max(minW, Math.min(1200, rect.width - 260));
                try {
                    resizer.setPointerCapture(ev.pointerId);
                } catch {
                }
                const onMove = (e) => {
                    const dx = e.clientX - startX;
                    const w = clamp(startW + dx, minW, maxW);
                    leftPanel.style.flexBasis = `${w}px`;
                    leftPanel.style.width = `${w}px`;
                    this.state.settings.leftPanelWidth = w;
                    this.onResize();
                };
                const onUp = (e) => {
                    try {
                        resizer.releasePointerCapture(e.pointerId);
                    } catch {
                    }
                    resizer.removeEventListener("pointermove", onMove);
                    resizer.removeEventListener("pointerup", onUp);
                    resizer.removeEventListener("pointercancel", onUp);
                    this.scheduleSave();
                };
                resizer.addEventListener("pointermove", onMove);
                resizer.addEventListener("pointerup", onUp);
                resizer.addEventListener("pointercancel", onUp);
            });
        }

        const verticalResizer = this.dom.projectCardsResizer;
        if (verticalResizer) {
            verticalResizer.style.display = "none";
        }
    }

    applySplitSizesFromSettings() {
        const vw = window.innerWidth || 1920;
        const leftPanel = this.dom.leftPanel;
        if (leftPanel) {
            if (vw <= 1100) {
                leftPanel.style.flexBasis = "";
                leftPanel.style.width = "";
            } else {
                const w = clamp(num(this.state.settings.leftPanelWidth || 560), 400, 1200);
                leftPanel.style.flexBasis = `${w}px`;
                leftPanel.style.width = `${w}px`;
            }
        }
    }

    replayPreview() {
        this.previewAnimStart = performance.now();
        this.previewPerfLastTs = 0;
        this.previewCycleCache = null;
        this.previewExprCountCache.clear();
        this.previewExprPrefixCache.clear();
        this.previewCondFnCache.clear();
        this.previewNumericFnCache.clear();
        this.previewRuntimeGlobals = null;
        this.previewRuntimeAppliedTick = -1;
    }

    jumpPreviewToPreFade() {
        const cycle = this.previewCycleCache || (this.previewCycleCache = this.getPreviewCycleConfig());
        const nearFade = Math.max(0, num(cycle.appear + cycle.live - 0.001));
        this.previewAnimStart = performance.now() - nearFade * 50;
        this.previewPerfLastTs = 0;
        this.previewRuntimeGlobals = null;
        this.previewRuntimeAppliedTick = -1;
        if (this.previewPaused) {
            this.updatePreviewAnimation();
            if (this.renderer) this.renderer.render(this.scene, this.camera);
        }
    }

    initExpressionSuggest() {
        const el = document.createElement("div");
        el.className = "expr-suggest hidden";
        document.body.appendChild(el);
        this.exprSuggest.el = el;
        el.addEventListener("mousedown", (e) => e.preventDefault());
        el.addEventListener("click", (e) => {
            const btn = e.target.closest(".expr-suggest-item");
            if (!btn) return;
            const idx = int(btn.dataset.idx);
            this.acceptExprSuggestion(idx);
        });
    }

    onExprFocusIn(e) {
        const input = e.target?.closest?.(".expr-input");
        if (!input) return;
        if (!this.isExprTextInput(input)) return;
        this.exprSuggest.activeInput = input;
        this.openExprSuggest(input, false);
    }

    onExprInput(e) {
        const input = e.target?.closest?.(".expr-input");
        if (!input) return;
        if (!this.isExprTextInput(input)) return;
        if (this.exprSuggest.activeInput !== input) this.exprSuggest.activeInput = input;
        this.openExprSuggest(input, false);
    }

    onExprKeydown(e) {
        const input = e.target?.closest?.(".expr-input");
        if (!input) return;
        if (!this.isExprTextInput(input)) return;
        if (!this.exprSuggest.el) return;
        const isOpen = !this.exprSuggest.el.classList.contains("hidden");
        if ((e.ctrlKey || e.metaKey) && e.code === "Space") {
            e.preventDefault();
            this.openExprSuggest(input, true);
            return;
        }
        if (!isOpen) return;
        if (e.code === "ArrowDown") {
            e.preventDefault();
            this.moveExprSuggest(1);
            return;
        }
        if (e.code === "ArrowUp") {
            e.preventDefault();
            this.moveExprSuggest(-1);
            return;
        }
        if (e.code === "Enter" || e.code === "Tab") {
            e.preventDefault();
            this.acceptExprSuggestion(this.exprSuggest.active);
            return;
        }
        if (e.code === "Escape") {
            e.preventDefault();
            this.closeExprSuggest();
        }
    }

    onExprMouseDown(e) {
        if (!this.exprSuggest.el) return;
        const t = e.target;
        if (t?.closest?.(".expr-suggest")) return;
        if (t?.closest?.(".expr-input") && this.isExprTextInput(t.closest(".expr-input"))) return;
        this.closeExprSuggest();
    }

    isExprTextInput(el) {
        const tag = String(el?.tagName || "").toUpperCase();
        if (el?.dataset?.codeEditor) return false;
        return tag === "INPUT" || tag === "TEXTAREA";
    }

    openExprSuggest(input, force = false) {
        if (!input) return;
        const info = this.getExprTokenAtCursor(input);
        if (!info) {
            this.closeExprSuggest();
            return;
        }
        const all = this.getExprCompletions();
        const token = String(info.token || "").trim();
        if (!force && !token) {
            this.closeExprSuggest();
            return;
        }
        const filtered = all.filter((it) => force || !token || it.toLowerCase().includes(token.toLowerCase())).slice(0, 18);
        if (!filtered.length) {
            this.closeExprSuggest();
            return;
        }
        this.exprSuggest.activeInput = input;
        this.exprSuggest.items = all;
        this.exprSuggest.filtered = filtered;
        this.exprSuggest.token = token;
        this.exprSuggest.range = { start: info.start, end: info.end };
        this.exprSuggest.active = 0;
        this.renderExprSuggest();
    }

    renderExprSuggest() {
        const s = this.exprSuggest;
        if (!s.el || !s.activeInput || !s.filtered.length) return this.closeExprSuggest();
        const html = s.filtered.map((it, i) => `
            <button type="button" class="expr-suggest-item ${i === s.active ? "active" : ""}" data-idx="${i}">
                <span>${esc(String(it || "").replace("$0", ""))}</span>
            </button>
        `).join("");
        s.el.innerHTML = html;
        s.el.classList.remove("hidden");
        const rect = s.activeInput.getBoundingClientRect();
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 720;
        const width = Math.min(420, Math.max(220, rect.width));
        let left = rect.left;
        let top = rect.bottom + 6;
        if (left + width > vw - 10) left = vw - width - 10;
        const panelHeight = 240;
        if (top + panelHeight > vh - 8) top = Math.max(8, rect.top - panelHeight - 8);
        s.el.style.left = `${Math.round(left)}px`;
        s.el.style.top = `${Math.round(top)}px`;
        s.el.style.width = `${Math.round(width)}px`;
    }

    moveExprSuggest(delta) {
        const s = this.exprSuggest;
        if (!s.filtered.length) return;
        const n = s.filtered.length;
        s.active = (s.active + delta + n) % n;
        this.renderExprSuggest();
    }

    acceptExprSuggestion(index) {
        const s = this.exprSuggest;
        const input = s.activeInput;
        if (!input) return;
        const item = s.filtered[int(index)];
        if (!item) return;
        const range = s.range || { start: input.selectionStart || 0, end: input.selectionStart || 0 };
        const text = String(input.value || "");
        const marker = "$0";
        const rawInsert = String(item);
        const markerIdx = rawInsert.indexOf(marker);
        const insert = markerIdx >= 0 ? rawInsert.replace(marker, "") : rawInsert;
        const next = text.slice(0, range.start) + insert + text.slice(range.end);
        const caret = markerIdx >= 0 ? (range.start + markerIdx) : (range.start + insert.length);
        input.value = next;
        input.setSelectionRange?.(caret, caret);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        this.closeExprSuggest();
    }

    closeExprSuggest() {
        const s = this.exprSuggest;
        if (!s.el) return;
        s.el.classList.add("hidden");
        s.el.innerHTML = "";
        s.filtered = [];
        s.range = null;
        s.token = "";
    }

    getExprTokenAtCursor(input) {
        const value = String(input.value || "");
        const pos = int(input.selectionStart ?? value.length);
        const left = value.slice(0, pos);
        const m = left.match(/[A-Za-z_][A-Za-z0-9_.()@]*$/);
        if (!m) return { token: "", start: pos, end: pos };
        const token = m[0];
        return { token, start: pos - token.length, end: pos };
    }

    getExprCompletions() {
        const projectClass = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const base = [
            "age",
            "tick",
            "PI",
            "rotateTo($0)",
            "rotateAsAxis($0)",
            "rotateToWithAngle($0, 0.05)",
            "addSingle()",
            "addMultiple($0)",
            "addPreTickAction { }",
            "setReversedScaleOnCompositionStatus($0)",
            "particle.particleAlpha",
            "particle.particleColor",
            "particle.particleSize",
            "Vec3($0)",
            "RelativeLocation.yAxis()",
            "RelativeLocation($0)",
            "Vector3f($0)"
        ];
        for (const g of this.state.globalVars) {
            const name = String(g.name || "").trim();
            if (!name) continue;
            base.push(name);
            base.push(`this@${projectClass}.${name}`);
            if (String(g.type || "") === "Vec3") base.push(`${name}.asRelative()`);
        }
        for (const c of this.state.globalConsts) {
            const name = String(c.name || "").trim();
            if (name) base.push(name);
        }
        return Array.from(new Set(base));
    }

    getJsValidationAllowedIdentifiers(opts = {}) {
        const allowed = new Set();
        for (const key of JS_LINT_GLOBALS) allowed.add(key);
        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) allowed.add(name);
        }
        for (const c of (this.state.globalConsts || [])) {
            const name = String(c?.name || "").trim();
            if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) allowed.add(name);
        }
        const cardId = String(opts.cardId || "");
        if (cardId) {
            const card = this.getCardById(cardId);
            if (card) {
                for (const v of (card.controllerVars || [])) {
                    const name = String(v?.name || "").trim();
                    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) allowed.add(name);
                }
            }
        }
        return allowed;
    }

    validateJsExpressionSource(source, opts = {}) {
        const srcRaw = String(source || "").trim();
        if (!srcRaw) return { valid: true, message: "" };
        const src = transpileKotlinThisQualifierToJs(srcRaw);
        try {
            new Function(
                "vars",
                "point",
                "particle",
                "rotateTo",
                "rotateAsAxis",
                "rotateToWithAngle",
                "addSingle",
                "addMultiple",
                "addPreTickAction",
                "thisAt",
                `with(vars){ ${src} }; return point;`
            );
        } catch (e) {
            return { valid: false, message: `语法错误: ${String(e?.message || e || "invalid script")}` };
        }
        const allowed = this.getJsValidationAllowedIdentifiers(opts);
        const unknown = findFirstUnknownJsIdentifier(src, allowed);
        if (unknown) {
            return { valid: false, message: `未定义标识符: ${unknown}` };
        }
        return { valid: true, message: "" };
    }

    validateCodeEditorSource(textarea, source) {
        if (!(textarea instanceof HTMLTextAreaElement)) return { valid: true, message: "" };
        const isDisplayExpr = textarea.dataset.displayField === "expression";
        const isShapeDisplayExpr = textarea.dataset.cardShapeDisplayField === "expression";
        const isShapeChildDisplayExpr = textarea.dataset.cardShapeChildDisplayField === "expression";
        const isShapeLevelDisplayExpr = textarea.dataset.shapeLevelDisplayField === "expression";
        const isControllerScript = textarea.dataset.cactField === "script";
        if (!isDisplayExpr && !isShapeDisplayExpr && !isShapeChildDisplayExpr && !isShapeLevelDisplayExpr && !isControllerScript) {
            return { valid: true, message: "" };
        }
        const cardId = String(textarea.dataset.cardId || "");
        const result = this.validateJsExpressionSource(source, { cardId });
        if (result.valid) return result;
        return {
            valid: false,
            message: `表达式存在问题，此表达式不生效。${result.message ? ` ${result.message}` : ""}`
        };
    }

    refreshCodeEditors() {
        const textareas = Array.from(document.querySelectorAll("textarea[data-code-editor]"));
        const alive = new Set(textareas);
        for (const [ta, editor] of this.codeEditors.entries()) {
            if (!alive.has(ta) || !document.body.contains(ta)) {
                try {
                    editor.dispose();
                } catch {
                }
                this.codeEditors.delete(ta);
            }
        }
        for (const ta of textareas) {
            const completions = this.getCodeEditorCompletions(ta);
            const title = String(ta.dataset.codeTitle || "代码编辑");
            const validate = (source) => this.validateCodeEditorSource(ta, source);
            const existing = this.codeEditors.get(ta);
            if (existing) {
                existing.setCompletions(completions);
                existing.setValidator(validate);
                continue;
            }
            const editor = new InlineCodeEditor({
                textarea: ta,
                title,
                completions,
                autoSuggestMin: 1,
                validate
            });
            this.codeEditors.set(ta, editor);
        }
    }

    getCodeEditorCompletions(textarea) {
        const isControllerScript = String(textarea?.dataset?.cactField || "") === "script";
        const projectClass = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const base = isControllerScript
            ? [
                { label: "if (...) { ... }", insertText: "if ($0) {\\n    \\n}", detail: "条件分支", priority: 220 },
                { label: "addSingle()", insertText: "addSingle()", detail: "生长 API", priority: 230 },
                { label: "addMultiple(n)", insertText: "addMultiple($0)", detail: "生长 API", priority: 230 },
                { label: "color = Vector3f()", insertText: "color = Vector3f($0)", detail: "粒子颜色", priority: 255 },
                { label: "size = 0.2", insertText: "size = $0", detail: "粒子尺寸", priority: 255 },
                { label: "particleAlpha = 1.0", insertText: "particleAlpha = $0", detail: "粒子透明度", priority: 255 },
                { label: "currentAge = 0", insertText: "currentAge = $0", detail: "粒子年龄", priority: 250 },
                { label: "textureSheet = 0", insertText: "textureSheet = $0", detail: "贴图序号", priority: 250 },
                { label: "particle.particleColor = Vector3f()", insertText: "particle.particleColor = Vector3f($0)", detail: "粒子颜色", priority: 250 },
                { label: "particle.particleSize = 0.2", insertText: "particle.particleSize = $0", detail: "粒子尺寸", priority: 250 },
                { label: "particle.particleAlpha = 1.0", insertText: "particle.particleAlpha = $0", detail: "粒子透明度", priority: 250 },
                { label: "RelativeLocation(x, y, z)", insertText: "RelativeLocation($0)", detail: "向量构造", priority: 220 },
                { label: "Vec3(x, y, z)", insertText: "Vec3($0)", detail: "向量构造", priority: 220 },
                { label: "Vector3f(x, y, z)", insertText: "Vector3f($0)", detail: "向量构造", priority: 220 },
                { label: "PI", detail: "数学常量", priority: 210 },
                { label: "Math.sin(x)", insertText: "Math.sin($0)", detail: "数学函数", priority: 180 },
                { label: "Math.cos(x)", insertText: "Math.cos($0)", detail: "数学函数", priority: 180 },
                { label: "Math.abs(x)", insertText: "Math.abs($0)", detail: "数学函数", priority: 180 },
                { label: "Math.min(a, b)", insertText: "Math.min($0, )", cursorOffset: 11, detail: "数学函数", priority: 180 },
                { label: "Math.max(a, b)", insertText: "Math.max($0, )", cursorOffset: 11, detail: "数学函数", priority: 180 }
            ]
            : [
                { label: "if (...) { ... }", insertText: "if ($0) {\\n    \\n}", detail: "条件分支", priority: 140 },
                { label: "rotateTo(to)", insertText: "rotateTo($0)", detail: "Display API", priority: 260 },
                { label: "rotateAsAxis(angle)", insertText: "rotateAsAxis($0)", detail: "Display API", priority: 260 },
                { label: "rotateToWithAngle(to, angle)", insertText: "rotateToWithAngle($0, 0.05)", detail: "Display API", priority: 260 },
                { label: "addSingle()", insertText: "addSingle()", detail: "生长 API", priority: 260 },
                { label: "addMultiple(n)", insertText: "addMultiple($0)", detail: "生长 API", priority: 260 },
                { label: "addPreTickAction(() => {})", insertText: "addPreTickAction(() => {\\n    $0\\n})", detail: "控制器 API", priority: 220 },
                { label: "RelativeLocation(x, y, z)", insertText: "RelativeLocation($0)", detail: "向量构造", priority: 225 },
                { label: "Vec3(x, y, z)", insertText: "Vec3($0)", detail: "向量构造", priority: 225 },
                { label: "Vector3f(x, y, z)", insertText: "Vector3f($0)", detail: "向量构造", priority: 225 },
                { label: "RelativeLocation.yAxis()", insertText: "RelativeLocation.yAxis()", detail: "轴向量", priority: 225 },
                { label: "setReversedScaleOnCompositionStatus(comp)", insertText: "setReversedScaleOnCompositionStatus($0)", detail: "Scale API", priority: 215 },
                { label: "particle.particleAlpha", detail: "粒子属性", priority: 240 },
                { label: "particle.particleColor", detail: "粒子属性", priority: 240 },
                { label: "particle.particleSize", detail: "粒子属性", priority: 240 },
                { label: "age", detail: "当前 age", priority: 250 },
                { label: "tick", detail: "当前 tick", priority: 250 },
                { label: "index", detail: "点索引", priority: 250 },
                { label: "PI", detail: "数学常量", priority: 230 },
                { label: "Math.sin(x)", insertText: "Math.sin($0)", detail: "数学函数", priority: 180 },
                { label: "Math.cos(x)", insertText: "Math.cos($0)", detail: "数学函数", priority: 180 },
                { label: "Math.abs(x)", insertText: "Math.abs($0)", detail: "数学函数", priority: 180 },
                { label: "Math.min(a, b)", insertText: "Math.min($0, )", cursorOffset: 11, detail: "数学函数", priority: 180 },
                { label: "Math.max(a, b)", insertText: "Math.max($0, )", cursorOffset: 11, detail: "数学函数", priority: 180 }
            ];

        const vars = [];
        for (const g of this.state.globalVars) {
            const name = String(g.name || "").trim();
            if (!name) continue;
            vars.push({ label: name, detail: "全局变量", priority: 210 });
            vars.push({
                label: `this@${projectClass}.${name}`,
                insertText: `this@${projectClass}.${name}`,
                detail: "全局变量（限定访问）",
                priority: 208
            });
            if (String(g.type || "").trim() === "Vec3") {
                vars.push({ label: `${name}.asRelative()`, detail: "Vec3 -> Relative", priority: 205 });
            }
        }
        if (!isControllerScript) {
            for (const c of this.state.globalConsts) {
                const name = String(c.name || "").trim();
                if (!name) continue;
                vars.push({ label: name, detail: "全局常量", priority: 205 });
            }
        }

        const cardVars = [];
        const cardId = String(textarea.dataset.cardId || "");
        if (!isControllerScript && cardId) {
            const card = this.getCardById(cardId);
            if (card) {
                for (const it of (card.controllerVars || [])) {
                    const name = String(it.name || "").trim();
                    if (!name) continue;
                    cardVars.push({ label: name, detail: "控制器局部变量", priority: 245 });
                }
            }
        }
        return mergeCompletionGroups(base, vars, cardVars);
    }

    onKeydown(e) {
        if (this.hotkeyCaptureActionId) {
            e.preventDefault();
            e.stopPropagation();
            if (e.code === "Escape") {
                this.hotkeyCaptureActionId = null;
                this.dom.hkHint.textContent = "点击“设置”后按下按键（Esc 取消，Backspace 清空）。";
                return;
            }
            if (e.code === "Backspace" || e.code === "Delete") {
                this.state.hotkeys.actions[this.hotkeyCaptureActionId] = "";
                this.hotkeyCaptureActionId = null;
                this.renderHotkeysList();
                this.scheduleSave();
                this.dom.hkHint.textContent = "快捷键已清空。";
                return;
            }
            const hk = eventToHotkey(e);
            if (!hk) return;
            this.state.hotkeys.actions[this.hotkeyCaptureActionId] = hk;
            this.hotkeyCaptureActionId = null;
            this.renderHotkeysList();
            this.scheduleSave();
            this.dom.hkHint.textContent = `已设置为 ${hotkeyToHuman(hk)}`;
            return;
        }

        if (e.key === "Escape" && this.closeAnyModalWithEsc()) {
            e.preventDefault();
            return;
        }
        if (this.isEditableTarget(e.target)) return;
        if (this.isModalOpen()) return;

        const h = this.state.hotkeys.actions || {};
        const hit = (id) => hotkeyMatchEvent(e, h[id] || "");

        if (hit("undo")) {
            e.preventDefault();
            this.undo();
            return;
        }
        if (hit("redo")) {
            e.preventDefault();
            this.redo();
            return;
        }
        if (hit("switchEditor")) {
            e.preventDefault();
            this.switchPage("editor");
            return;
        }
        if (hit("switchCode")) {
            e.preventDefault();
            this.switchPage("code");
            return;
        }
        if (hit("toggleSettings")) {
            e.preventDefault();
            if (this.dom.settingsModal.classList.contains("hidden")) this.showSettings();
            else this.hideSettings();
            return;
        }
        if (hit("toggleHotkeys")) {
            e.preventDefault();
            if (this.dom.hkModal.classList.contains("hidden")) this.showHotkeys();
            else this.hideHotkeys();
            return;
        }
        if (hit("addCard")) {
            e.preventDefault();
            this.addCard();
            return;
        }
        if (hit("deleteCard")) {
            e.preventDefault();
            this.deleteSelectedCards();
            return;
        }
        if (hit("generateCode")) {
            e.preventDefault();
            this.generateCodeAndRender(true);
            return;
        }
        if (hit("copyCode")) {
            e.preventDefault();
            this.copyCode();
            return;
        }
        if (hit("toggleRealtime")) {
            e.preventDefault();
            this.setRealtimeCode(!this.state.settings.realtimeCode);
            return;
        }
        if (hit("fullscreen")) {
            e.preventDefault();
            this.toggleFullscreen();
            return;
        }
        if (hit("openBuilderEditor")) {
            e.preventDefault();
            const card = this.getFocusedCard() || this.state.cards[0];
            if (card) this.openBuilderEditor(card.id);
        }
    }

    closeAnyModalWithEsc() {
        if (!this.dom.builderModal.classList.contains("hidden")) {
            this.hideBuilderModal();
            return true;
        }
        if (!this.dom.hkModal.classList.contains("hidden")) {
            this.hideHotkeys();
            return true;
        }
        if (!this.dom.settingsModal.classList.contains("hidden")) {
            this.hideSettings();
            return true;
        }
        return false;
    }

    isModalOpen() {
        return !this.dom.settingsModal.classList.contains("hidden")
            || !this.dom.hkModal.classList.contains("hidden")
            || !this.dom.builderModal.classList.contains("hidden");
    }

    isEditableTarget(target) {
        const el = target;
        if (!el || !el.closest) return false;
        return !!el.closest("input, textarea, select, [contenteditable='true']");
    }

    openBuilderEditor(cardId, target = "root") {
        const card = this.getCardById(cardId || this.focusedCardId);
        if (!card) return;
        const normalizedTarget = normalizeBuilderTarget(target);
        this.builderModalCardId = card.id;
        this.seedBuilderSandbox(card, normalizedTarget);
        this.saveStateNow();
        const q = new URLSearchParams({
            card: card.id,
            return: "composition_builder.html",
            target: normalizedTarget,
            t: String(Date.now())
        });
        window.location.href = `./composition_pointsbuilder.html?${q.toString()}`;
    }

    consumeBuilderReturnState() {
        let cardId = "";
        let target = "root";
        try {
            cardId = String(localStorage.getItem(CPB_RETURN_CARD_KEY) || "").trim();
            target = normalizeBuilderTarget(localStorage.getItem(CPB_RETURN_TARGET_KEY) || "root");
            if (!cardId) return;
            localStorage.removeItem(CPB_RETURN_CARD_KEY);
            localStorage.removeItem(CPB_RETURN_TARGET_KEY);
        } catch {
            return;
        }
        const card = this.getCardById(cardId) || this.getFocusedCard() || this.state.cards[0];
        const state = this.readBuilderSandboxState();
        if (!card || !state) return;
        this.setCardBuilderState(card, target, state);
        this.focusedCardId = card.id;
        this.selectedCardIds = new Set([card.id]);
        let msg = "已从 PointsBuilder 返回并加载 Builder";
        if (target === "shape") msg = "已返回并加载 Shape Builder";
        if (target === "shape_child") msg = "已返回并加载子点 Builder";
        if (/^shape_level:\d+$/.test(target)) {
            msg = `已返回并加载嵌套层 ${Math.max(2, int(target.split(":")[1]) + 2)} Builder`;
        }
        this.showToast(msg, "success");
    }

    seedBuilderSandbox(card, target = "root") {
        try {
            const builderState = this.resolveCardBuilderState(card, target);
            localStorage.setItem(CPB_STATE_KEY, JSON.stringify({
                state: normalizeBuilderState(builderState),
                ts: Date.now()
            }));
            localStorage.setItem(CPB_PROJECT_KEY, sanitizeFileBase(card.name || this.state.projectName || "Builder"));
            localStorage.setItem(CPB_THEME_KEY, this.state.settings.theme || "dark-1");
            this.writeBuilderCompositionContext();
        } catch (e) {
            console.warn("seed builder sandbox failed:", e);
        }
    }

    resolveCardBuilderState(card, target = "root") {
        if (!card) return createDefaultBuilderState();
        const normalizedTarget = normalizeBuilderTarget(target);
        if (/^shape_level:\d+$/.test(normalizedTarget)) {
            const levelIdx = int(normalizedTarget.split(":")[1]);
            const level = this.getNestedShapeLevel(card, levelIdx, true);
            return normalizeBuilderState(level?.builderState);
        }
        if (normalizedTarget === "shape") return normalizeBuilderState(card.shapeBuilderState);
        if (normalizedTarget === "shape_child") return normalizeBuilderState(card.shapeChildBuilderState);
        return normalizeBuilderState(card.builderState);
    }

    setCardBuilderState(card, target = "root", state = null) {
        if (!card) return;
        const next = normalizeBuilderState(state);
        const normalizedTarget = normalizeBuilderTarget(target);
        if (/^shape_level:\d+$/.test(normalizedTarget)) {
            const levelIdx = int(normalizedTarget.split(":")[1]);
            const level = this.getNestedShapeLevel(card, levelIdx, true);
            if (!level) return;
            level.bindMode = "builder";
            level.builderState = next;
            this.setNestedShapeLevel(card, levelIdx, level);
            return;
        }
        if (normalizedTarget === "shape") {
            card.shapeBindMode = "builder";
            card.shapeBuilderState = next;
            return;
        }
        if (normalizedTarget === "shape_child") {
            card.shapeChildBindMode = "builder";
            card.shapeChildBuilderState = next;
            return;
        }
        card.bindMode = "builder";
        card.builderState = next;
    }

    showBuilderModal() {
        this.dom.builderModal.classList.remove("hidden");
        this.dom.builderMask.classList.remove("hidden");
    }

    hideBuilderModal() {
        this.dom.builderModal.classList.add("hidden");
        this.dom.builderMask.classList.add("hidden");
        this.builderModalCardId = null;
    }

    getBezierToolScaleConfig(scope = "project", cardId = "") {
        const adaptLegacyX = (cfg) => {
            const tick = Math.max(1, int(cfg.tick || 18));
            const x1 = num(cfg.c1x);
            const x2 = num(cfg.c2x);
            if (Math.abs(x1) <= 1 && Math.abs(x2) <= 1) {
                cfg.c1x = x1 * tick;
                cfg.c2x = x2 * tick;
            }
            cfg.tick = tick;
            cfg.c1x = clamp(num(cfg.c1x), 0, tick);
            cfg.c2x = clamp(num(cfg.c2x), 0, tick);
            return cfg;
        };
        if (scope === "card") {
            const card = this.getCardById(cardId);
            if (!card) return normalizeScaleHelperConfig({ type: "bezier" }, { type: "bezier" });
            return adaptLegacyX(normalizeScaleHelperConfig(card.shapeScale, { type: "bezier" }));
        }
        if (scope === "shape_child") {
            const card = this.getCardById(cardId);
            if (!card) return normalizeScaleHelperConfig({ type: "bezier" }, { type: "bezier" });
            return adaptLegacyX(normalizeScaleHelperConfig(card.shapeChildScale, { type: "bezier" }));
        }
        if (scope === "shape_level") {
            const card = this.getCardById(cardId);
            const levelIdx = Math.max(1, int(this.bezierToolTarget?.levelIdx || 1));
            if (!card) return normalizeScaleHelperConfig({ type: "bezier" }, { type: "bezier" });
            const level = this.getNestedShapeLevel(card, levelIdx, true);
            return adaptLegacyX(normalizeScaleHelperConfig(level?.scale, { type: "bezier" }));
        }
        return adaptLegacyX(normalizeScaleHelperConfig(this.state.projectScale, { type: "bezier" }));
    }

    openBezierTool(scope = "project", cardId = "", levelIdx = 0) {
        const normScope = scope === "card"
            ? "card"
            : (scope === "shape_child"
                ? "shape_child"
                : (scope === "shape_level" ? "shape_level" : "project"));
        this.bezierToolTarget = {
            scope: normScope,
            cardId: String(cardId || ""),
            levelIdx: Math.max(0, int(levelIdx || 0))
        };
        const cfg = this.getBezierToolScaleConfig(this.bezierToolTarget.scope, this.bezierToolTarget.cardId);
        if (this.dom.bezierFrame) {
            const q = new URLSearchParams({
                min: String(num(cfg.min)),
                max: String(num(cfg.max)),
                tick: String(Math.max(1, int(cfg.tick || 18))),
                c1x: String(num(cfg.c1x)),
                c1y: String(num(cfg.c1y)),
                c1z: String(num(cfg.c1z)),
                c2x: String(num(cfg.c2x)),
                c2y: String(num(cfg.c2y)),
                c2z: String(num(cfg.c2z))
            });
            this.dom.bezierFrame.src = `./assets/composition_builder/bezier_tool.html?${q.toString()}&t=${Date.now()}`;
        }
        this.dom.bezierModal?.classList.remove("hidden");
        this.dom.bezierMask?.classList.remove("hidden");
    }

    closeBezierTool() {
        this.dom.bezierModal?.classList.add("hidden");
        this.dom.bezierMask?.classList.add("hidden");
    }

    applyBezierToolAndClose() {
        if (this.applyBezierTool()) {
            this.closeBezierTool();
        }
    }

    applyBezierTool() {
        const frame = this.dom.bezierFrame;
        if (!frame) return false;
        let data = null;
        try {
            if (typeof frame.contentWindow?.getBezierConfig === "function") {
                data = frame.contentWindow.getBezierConfig();
            }
        } catch {
            this.showToast("Bezier 工具未就绪", "error");
            return false;
        }
        if (!data || typeof data !== "object") {
            this.showToast("未读取到 Bezier 参数", "error");
            return false;
        }
        const tick = Math.max(1, int(data.tick || 18));
        const minValue = num(data.min);
        const maxValue = num(data.max);
        const c1x = clamp(num(data.c1x), 0, tick);
        const c1y = num(data.c1y);
        const c1z = num(data.c1z);
        const c2x = clamp(num(data.c2x), 0, tick);
        const c2y = num(data.c2y);
        const c2z = num(data.c2z);

        const target = this.bezierToolTarget || { scope: "project", cardId: "" };
        this.pushHistory();
        if (target.scope === "card") {
            const card = this.getCardById(target.cardId);
            if (!card) {
                this.showToast("卡片不存在", "error");
                return false;
            }
            card.shapeScale = normalizeScaleHelperConfig(card.shapeScale, { type: "bezier" });
            card.shapeScale.type = "bezier";
            card.shapeScale.min = minValue;
            card.shapeScale.max = maxValue;
            card.shapeScale.tick = tick;
            card.shapeScale.c1x = c1x;
            card.shapeScale.c1y = c1y;
            card.shapeScale.c1z = c1z;
            card.shapeScale.c2x = c2x;
            card.shapeScale.c2y = c2y;
            card.shapeScale.c2z = c2z;
            this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
            this.showToast("已应用到卡片缩放助手", "success");
            return true;
        }
        if (target.scope === "shape_child") {
            const card = this.getCardById(target.cardId);
            if (!card) {
                this.showToast("卡片不存在", "error");
                return false;
            }
            card.shapeChildScale = normalizeScaleHelperConfig(card.shapeChildScale, { type: "bezier" });
            card.shapeChildScale.type = "bezier";
            card.shapeChildScale.min = minValue;
            card.shapeChildScale.max = maxValue;
            card.shapeChildScale.tick = tick;
            card.shapeChildScale.c1x = c1x;
            card.shapeChildScale.c1y = c1y;
            card.shapeChildScale.c1z = c1z;
            card.shapeChildScale.c2x = c2x;
            card.shapeChildScale.c2y = c2y;
            card.shapeChildScale.c2z = c2z;
            this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
            this.showToast("已应用到缩放助手-嵌套1", "success");
            return true;
        }
        if (target.scope === "shape_level") {
            const card = this.getCardById(target.cardId);
            const levelIdx = Math.max(1, int(target.levelIdx || 1));
            const level = this.getNestedShapeLevel(card, levelIdx, true);
            if (!card || !level) {
                this.showToast("卡片不存在", "error");
                return false;
            }
            level.scale = normalizeScaleHelperConfig(level.scale, { type: "bezier" });
            level.scale.type = "bezier";
            level.scale.min = minValue;
            level.scale.max = maxValue;
            level.scale.tick = tick;
            level.scale.c1x = c1x;
            level.scale.c1y = c1y;
            level.scale.c1z = c1z;
            level.scale.c2x = c2x;
            level.scale.c2y = c2y;
            level.scale.c2z = c2z;
            this.setNestedShapeLevel(card, levelIdx, level);
            this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
            this.showToast(`已应用到缩放助手-嵌套${levelIdx + 1}`, "success");
            return true;
        }
        this.state.projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "bezier" });
        this.state.projectScale.type = "bezier";
        this.state.projectScale.min = minValue;
        this.state.projectScale.max = maxValue;
        this.state.projectScale.tick = tick;
        this.state.projectScale.c1x = c1x;
        this.state.projectScale.c1y = c1y;
        this.state.projectScale.c1z = c1z;
        this.state.projectScale.c2x = c2x;
        this.state.projectScale.c2y = c2y;
        this.state.projectScale.c2z = c2z;
        this.afterValueMutate({ rerenderProject: true, rebuildPreview: true });
        this.showToast("已应用到项目缩放助手", "success");
        return true;
    }

    reloadBuilderFrame() {
        if (!this.builderModalCardId) return;
        const url = `./composition_pointsbuilder.html?card=${encodeURIComponent(this.builderModalCardId)}&target=root&t=${Date.now()}`;
        this.dom.builderFrame.src = url;
    }

    pullBuilderStateAndClose() {
        if (!this.builderModalCardId) return this.hideBuilderModal();
        const card = this.getCardById(this.builderModalCardId);
        if (!card) return this.hideBuilderModal();
        const state = this.readBuilderSandboxState();
        if (!state) {
            this.showToast("未读取到 Builder 数据", "error");
            return;
        }
        this.pushHistory();
        this.setCardBuilderState(card, "root", state);
        this.hideBuilderModal();
        this.afterStructureMutate({ rerenderProject: false, rerenderCards: true, rebuildPreview: true });
        this.showToast("Builder 已读取", "success");
    }

    readBuilderSandboxState() {
        try {
            const raw = localStorage.getItem(CPB_STATE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return normalizeBuilderState(parsed?.state || parsed);
        } catch (e) {
            console.warn("read builder state failed:", e);
            return null;
        }
    }

    importBuilderJson(cardId, target = "root") {
        const card = this.getCardById(cardId || this.focusedCardId);
        if (!card) return;
        const normalizedTarget = normalizeBuilderTarget(target);
        const targetLabel = /^shape_level:\d+$/.test(normalizedTarget)
            ? `嵌套层 ${Math.max(2, int(normalizedTarget.split(":")[1]) + 2)} Builder`
            : (normalizedTarget === "shape" ? "Shape Builder" : (normalizedTarget === "shape_child" ? "子点 Builder" : "Builder"));
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const obj = JSON.parse(text);
                this.pushHistory();
                this.setCardBuilderState(card, normalizedTarget, obj?.state || obj);
                this.afterStructureMutate({ rerenderProject: false, rerenderCards: true, rebuildPreview: true });
                this.showToast(`${targetLabel} JSON 导入成功`, "success");
            } catch (e) {
                this.showToast(`${targetLabel} JSON 导入失败: ${e?.message || e}`, "error");
            }
        };
        input.click();
    }

    async exportBuilderJson(cardId, target = "root") {
        const card = this.getCardById(cardId || this.focusedCardId);
        if (!card) return;
        const normalizedTarget = normalizeBuilderTarget(target);
        const state = this.resolveCardBuilderState(card, normalizedTarget);
        const suffix = /^shape_level:\d+$/.test(normalizedTarget)
            ? `shape_level_${Math.max(1, int(normalizedTarget.split(":")[1]))}_builder`
            : (normalizedTarget === "shape"
                ? "shape_builder"
                : (normalizedTarget === "shape_child" ? "shape_child_builder" : "builder"));
        const targetLabel = /^shape_level:\d+$/.test(normalizedTarget)
            ? `嵌套层 ${Math.max(2, int(normalizedTarget.split(":")[1]) + 2)} Builder`
            : (normalizedTarget === "shape" ? "Shape Builder" : (normalizedTarget === "shape_child" ? "子点 Builder" : "Builder"));
        const name = sanitizeFileBase(card.name || suffix) || suffix;
        const result = await this.saveTextWithPicker({
            filename: `${name}.${suffix}.pointsbuilder.json`,
            text: JSON.stringify(state, null, 2),
            mime: "application/json",
            description: "PointsBuilder JSON",
            extensions: [".json"]
        });
        if (result.ok) this.showToast(`${targetLabel} JSON 已导出`, "success");
        else if (result.canceled) this.showToast("已取消导出", "info");
        else this.showToast(`${targetLabel} JSON 导出失败: ${result.error?.message || result.error || "未知错误"}`, "error");
    }

    showToast(message, type = "info") {
        const msg = String(message || "").trim();
        if (!msg) return;
        let el = document.querySelector(".toast");
        if (!el) {
            el = document.createElement("div");
            el.className = "toast";
            document.body.appendChild(el);
        }
        clearTimeout(this.toastTimer);
        el.textContent = msg;
        el.classList.remove("success", "error", "info", "show");
        el.classList.add(type === "error" ? "error" : (type === "success" ? "success" : "info"));
        requestAnimationFrame(() => el.classList.add("show"));
        this.toastTimer = setTimeout(() => el.classList.remove("show"), 1850);
    }

    renderKotlin(text) {
        const raw = String(text || "");
        const highlighter = globalThis.CodeHighlighter?.highlightKotlin;
        if (typeof highlighter === "function") {
            this.dom.kotlinOut.innerHTML = highlighter(raw);
        } else {
            this.dom.kotlinOut.textContent = raw;
        }
    }

    generateCodeAndRender(force = false) {
        if (!force && !this.state.settings.realtimeCode) return;
        this.currentKotlin = this.generateKotlin();
        this.renderKotlin(this.currentKotlin);
    }

    async copyCode() {
        if (!this.currentKotlin) this.generateCodeAndRender(true);
        const text = this.currentKotlin || "";
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement("textarea");
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                ta.remove();
            }
            this.showToast("代码已复制", "success");
        } catch (e) {
            this.showToast(`复制失败: ${e?.message || e}`, "error");
        }
    }

    async downloadCode() {
        if (!this.currentKotlin) this.generateCodeAndRender(true);
        const cls = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const filename = `${sanitizeFileBase(cls) || "NewComposition"}.kt`;
        const result = await this.saveTextWithPicker({
            filename,
            text: this.currentKotlin || "",
            mime: "text/plain",
            description: "Kotlin 文件",
            extensions: [".kt"]
        });
        if (result.ok) this.showToast("代码已下载", "success");
        else if (result.canceled) this.showToast("已取消下载", "info");
        else this.showToast(`下载失败: ${result.error?.message || result.error || "未知错误"}`, "error");
    }

    generateKotlin() {
        const className = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const sequencedRoot = this.state.compositionType === "sequenced";
        const baseClass = sequencedRoot ? "AutoSequencedParticleComposition" : "AutoParticleComposition";
        const imports = [
            "import cn.coostack.cooparticlesapi.annotations.codec.CodecField",
            "import cn.coostack.cooparticlesapi.annotations.composition.CooAutoRegister",
            "import cn.coostack.cooparticlesapi.network.particle.composition.*",
            "import cn.coostack.cooparticlesapi.particles.ParticleDisplayer",
            "import cn.coostack.cooparticlesapi.particles.impl.*",
            "import cn.coostack.cooparticlesapi.utils.RelativeLocation",
            "import cn.coostack.cooparticlesapi.utils.builder.PointsBuilder",
            "import net.minecraft.world.level.Level",
            "import net.minecraft.world.phys.Vec3",
            "import kotlin.math.PI",
            "import kotlin.random.Random",
            "import java.util.SortedMap",
            "import java.util.TreeMap",
            "import org.joml.Vector3f"
        ];

        const body = [];
        body.push("@CooAutoRegister");
        body.push(`class ${className}(position: Vec3, world: Level? = null) : ${baseClass}(position, world) {`);
        const fields = this.buildClassFields(className);
        if (fields) body.push(fields);
        const initBlock = this.buildInitBlock(className, sequencedRoot);
        if (initBlock) body.push(initBlock);
        body.push(this.buildParticlesMethod(className, sequencedRoot));
        body.push(this.buildOnDisplayMethod(className));
        body.push("}");

        return [...imports, "", ...body].join("\n").replace(/\n{3,}/g, "\n\n");
    }

    buildClassFields(className) {
        const lines = [];
        const used = new Set();
        const uniqueName = (raw, fallback) => {
            let base = sanitizeKotlinIdentifier(raw, fallback);
            if (!base) base = fallback;
            let out = base;
            let i = 2;
            while (used.has(out)) out = `${base}${i++}`;
            used.add(out);
            return out;
        };

        for (const v of this.state.globalVars) {
            const name = uniqueName(v.name, "value");
            const type = String(v.type || "Double").trim() || "Double";
            const rawValue = String(v.value || "").trim();
            const value = rewriteClassQualifier(rawValue || defaultLiteralForKotlinType(type), className);
            if (v.codec) lines.push("    @CodecField");
            lines.push(`    ${v.mutable ? "var" : "val"} ${name}: ${type} = ${value}`);
            lines.push("");
        }
        for (const c of this.state.globalConsts) {
            const name = uniqueName(c.name, "constant");
            const type = String(c.type || "Int").trim() || "Int";
            const rawValue = String(c.value || "").trim();
            const value = rewriteClassQualifier(rawValue || defaultLiteralForKotlinType(type), className);
            lines.push(`    val ${name}: ${type} = ${value}`);
            lines.push("");
        }

        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        if (projectScale.type !== "none") {
            if (projectScale.type === "bezier") {
                lines.push(
                    `    private val scaleHelper = CompositionBezierScaleHelper(${formatNumberCompact(projectScale.min)}, ${formatNumberCompact(projectScale.max)}, ${Math.max(1, int(projectScale.tick))}, ` +
                    `RelativeLocation(${formatNumberCompact(projectScale.c1x)}, ${formatNumberCompact(projectScale.c1y)}, ${formatNumberCompact(projectScale.c1z)}), ` +
                    `RelativeLocation(${formatNumberCompact(projectScale.c2x)}, ${formatNumberCompact(projectScale.c2y)}, ${formatNumberCompact(projectScale.c2z)}))`
                );
            } else {
                lines.push(`    private val scaleHelper = CompositionScaleHelper(${formatNumberCompact(projectScale.min)}, ${formatNumberCompact(projectScale.max)}, ${Math.max(1, int(projectScale.tick))})`);
            }
            lines.push("");
        }

        while (lines.length && lines[lines.length - 1] === "") lines.pop();
        return lines.join("\n");
    }

    buildInitBlock(className, sequencedRoot) {
        const lines = [];
        const axisExpr = rewriteClassQualifier(
            String(this.state.compositionAxisExpr || this.state.compositionAxisPreset || "RelativeLocation.yAxis()"),
            className
        );
        if (axisExpr) lines.push(`        axis = ${axisExpr}`);
        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        if (projectScale.type !== "none") {
            lines.push("        scaleHelper.loadControler(this)");
        }
        const disabled = Math.max(0, int(this.state.disabledInterval || 0));
        if (disabled > 0) lines.push(`        setDisabledInterval(${disabled})`);
        if (sequencedRoot && this.state.compositionAnimates.length) {
            const animates = this.state.compositionAnimates.map((a) => normalizeAnimate(a));
            if (animates.length) {
                const first = animates[0];
                lines.push(`        animate.addAnimate(${Math.max(1, int(first.count))}) { ${rewriteClassQualifier(first.condition || "true", className)} }`);
                for (let i = 1; i < animates.length; i++) {
                    const it = animates[i];
                    lines.push(`            .addAnimate(${Math.max(1, int(it.count))}) { ${rewriteClassQualifier(it.condition || "true", className)} }`);
                }
            }
        }
        if (!lines.length) return "";
        return ["    init {", ...lines, "    }"].join("\n");
    }

    buildParticlesMethod(className, sequencedRoot) {
        const lines = [];
        if (sequencedRoot) {
            lines.push("    override fun getParticleSequenced(): SortedMap<CompositionData, RelativeLocation> {");
            lines.push("        val result: SortedMap<CompositionData, RelativeLocation> = TreeMap()");
            lines.push("        var orderCounter = 0");
        } else {
            lines.push("    override fun getParticles(): Map<CompositionData, RelativeLocation> {");
            lines.push("        val result = LinkedHashMap<CompositionData, RelativeLocation>()");
        }

        for (let i = 0; i < this.state.cards.length; i++) {
            const card = this.state.cards[i];
            lines.push("");
            lines.push(this.emitCardPut(card, className, sequencedRoot, i));
        }

        lines.push("");
        lines.push("        return result");
        lines.push("    }");
        return lines.join("\n");
    }

    emitCardPut(card, className, sequencedRoot, cardIndex = 0) {
        if (card.bindMode === "point") return this.emitCardPutPoint(card, className, sequencedRoot);
        return this.emitCardPutAll(card, className, sequencedRoot);
    }

    emitCardPutAll(card, className, sequencedRoot) {
        const builderExpr = this.emitBuilderExpr(card);
        const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "                ");
        return [
            "        result.putAll(",
            `${indentText(builderExpr, "            ")}`,
            "                .createWithCompositionData { rel ->",
            dataExpr,
            "                }",
            "        )"
        ].join("\n");
    }

    emitCardPutPoint(card, className, sequencedRoot) {
        const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "            ");
        const rel = relExpr(card.point?.x, card.point?.y, card.point?.z);
        return [
            "        result[",
            dataExpr,
            `        ] = ${rel}`
        ].join("\n");
    }

    emitBuilderExpr(card) {
        if (card.bindMode === "point") {
            return `PointsBuilder().addPoint(${relExpr(card.point.x, card.point.y, card.point.z)})`;
        }
        return this.emitBuilderExprFromState(card.builderState);
    }

    emitBuilderExprFromState(builderState) {
        const old = builderEvalState;
        try {
            builderEvalState = normalizeBuilderState(builderState);
            return emitPointsBuilderKotlin();
        } catch (e) {
            console.warn("emit builder kotlin failed:", e);
            return "PointsBuilder()";
        } finally {
            builderEvalState = old;
        }
    }

    emitCompositionDataExpr(card, className, sequencedRoot, indentBase = "                ") {
        const lines = [];
        if (sequencedRoot) lines.push(`${indentBase}CompositionData().apply { order = orderCounter++ }`);
        else lines.push(`${indentBase}CompositionData()`);
        lines.push(`${indentBase}    .setDisplayerSupplier {`);
        if (card.dataType === "single") {
            lines.push(`${indentBase}        ParticleDisplayer.withSingle(${sanitizeKotlinIdentifier(card.singleEffectClass || DEFAULT_EFFECT_CLASS, DEFAULT_EFFECT_CLASS)}(it))`);
        } else if (card.dataType === "particle_shape") {
            lines.push(indentText(this.buildShapeDisplayerExpr(card, className, "particle_shape"), `${indentBase}        `));
        } else {
            lines.push(indentText(this.buildShapeDisplayerExpr(card, className, "sequenced_shape"), `${indentBase}        `));
        }
        lines.push(`${indentBase}    }`);

        if (card.dataType === "single") {
            lines.push(this.buildSingleDataChain(card, className, `${indentBase}    `));
        }
        return lines.join("\n");
    }

    buildSingleDataChain(card, className, indentBase = "                    ") {
        const lines = [];
        if (Array.isArray(card.particleInit) && card.particleInit.length) {
            lines.push(`${indentBase}.addParticleInstanceInit {`);
            for (const it of card.particleInit) {
                const target = sanitizeKotlinIdentifier(it.target || "size", "size");
                const expr = rewriteClassQualifier(String(it.expr || "").trim(), className);
                if (!expr) continue;
                lines.push(`${indentBase}    ${target} = ${expr}`);
            }
            lines.push(`${indentBase}}`);
        }

        const hasTick = Array.isArray(card.controllerVars) && card.controllerVars.length;
        const actions = Array.isArray(card.controllerActions) ? card.controllerActions.map((it) => normalizeControllerAction(it)) : [];
        if (hasTick || actions.length) {
            lines.push(`${indentBase}.addParticleControlerInstanceInit {`);
            for (const v of (card.controllerVars || [])) {
                const vName = sanitizeKotlinIdentifier(v.name || "v", "v");
                const vType = sanitizeKotlinIdentifier(v.type || "Boolean", "Boolean");
                let expr = rewriteClassQualifier(String(v.expr || "").trim(), className);
                if (!expr) expr = defaultLiteralForKotlinType(vType);
                lines.push(`${indentBase}    var ${vName}: ${vType} = ${expr}`);
            }
            for (const action of actions) {
                const script = rewriteClassQualifier(String(action.script || "").trim(), className);
                if (!script) continue;
                lines.push(`${indentBase}    addPreTickAction {`);
                lines.push(translateJsBlockToKotlin(script, `${indentBase}        `));
                lines.push(`${indentBase}    }`);
            }
            lines.push(`${indentBase}}`);
        }
        return lines.join("\n");
    }

    buildShapeDisplayerExpr(card, className, type = "particle_shape") {
        const cls = type === "sequenced_shape" ? "SequencedParticleShapeComposition" : "ParticleShapeComposition";
        const applyFn = type === "sequenced_shape" ? "applyPointRel" : "applyPoint";
        const childType = ["single", "particle_shape", "sequenced_shape"].includes(String(card.shapeChildType || "")) ? String(card.shapeChildType) : "single";
        const axisExpr = rewriteClassQualifier(String(card.shapeAxisExpr || card.shapeAxisPreset || "RelativeLocation.yAxis()"), className);
        const scale = normalizeScaleHelperConfig(card.shapeScale, { type: "none" });
        const shapeBindMode = card.shapeBindMode === "builder" ? "builder" : "point";
        const shapePointExpr = relExpr(card.shapePoint?.x, card.shapePoint?.y, card.shapePoint?.z);
        const shapeBuilderExpr = this.emitBuilderExprFromState(card.shapeBuilderState);
        const childDisplayerExpr = this.buildShapeChildDisplayerExpr(card, className);
        const lines = [];
        lines.push("ParticleDisplayer.withComposition(");
        lines.push(`    ${cls}(it).apply {`);
        if (axisExpr) lines.push(`        axis = ${axisExpr}`);
        if (scale.type === "bezier") {
            lines.push(
                `        loadScaleHelperBezierValue(${formatNumberCompact(scale.min)}, ${formatNumberCompact(scale.max)}, ${Math.max(1, int(scale.tick))}, ` +
                `RelativeLocation(${formatNumberCompact(scale.c1x)}, ${formatNumberCompact(scale.c1y)}, ${formatNumberCompact(scale.c1z)}), ` +
                `RelativeLocation(${formatNumberCompact(scale.c2x)}, ${formatNumberCompact(scale.c2y)}, ${formatNumberCompact(scale.c2z)}))`
            );
        } else if (scale.type === "linear") {
            lines.push(`        loadScaleValue(${formatNumberCompact(scale.min)}, ${formatNumberCompact(scale.max)}, ${Math.max(1, int(scale.tick))})`);
        }
        if (shapeBindMode === "builder") {
            lines.push("        applyBuilder(");
            lines.push(indentText(shapeBuilderExpr, "            "));
            lines.push("        ) {");
            lines.push("            CompositionData()");
            lines.push("                .setDisplayerSupplier {");
            lines.push(indentText(childDisplayerExpr, "                    "));
            lines.push("                }");
            if (childType === "single") {
                const singleChain = this.buildSingleDataChain(card, className, "                ");
                if (singleChain) lines.push(singleChain);
            }
            lines.push("        }");
        } else {
            lines.push(`        ${applyFn}(${shapePointExpr}) {`);
            lines.push("            CompositionData()");
            lines.push("                .setDisplayerSupplier {");
            lines.push(indentText(childDisplayerExpr, "                    "));
            lines.push("                }");
            if (childType === "single") {
                const singleChain = this.buildSingleDataChain(card, className, "                ");
                if (singleChain) lines.push(singleChain);
            }
            lines.push("        }");
        }
        lines.push(this.applyCardCompositionActions(card, className, "        ", type === "sequenced_shape"));
        lines.push("    }");
        lines.push(")");
        return lines.join("\n");
    }

    buildShapeChildDisplayerExpr(card, className) {
        const chain = this.getShapeChildChain(card);
        const buildLevel = (levelIdx = 0) => {
            const level = chain[levelIdx] ? normalizeShapeNestedLevel(chain[levelIdx], levelIdx) : normalizeShapeNestedLevel({});
            if (level.type === "single") {
                const fx = sanitizeKotlinIdentifier(level.effectClass || card.singleEffectClass || DEFAULT_EFFECT_CLASS, DEFAULT_EFFECT_CLASS);
                return `ParticleDisplayer.withSingle(${fx}(it))`;
            }
            const cls = level.type === "sequenced_shape" ? "SequencedParticleShapeComposition" : "ParticleShapeComposition";
            const applyFn = level.type === "sequenced_shape" ? "applyPointRel" : "applyPoint";
            const axisExpr = rewriteClassQualifier(String(level.axisExpr || level.axisPreset || "RelativeLocation.yAxis()"), className);
            const scale = normalizeScaleHelperConfig(level.scale, { type: "none" });
            const bindMode = level.bindMode === "builder" ? "builder" : "point";
            const pointExpr = relExpr(level.point?.x, level.point?.y, level.point?.z);
            const builderExpr = this.emitBuilderExprFromState(level.builderState);
            const nextLevel = chain[levelIdx + 1] ? normalizeShapeNestedLevel(chain[levelIdx + 1], levelIdx + 1) : normalizeShapeNestedLevel({});
            const nextDisplayerExpr = buildLevel(levelIdx + 1);
            const pseudo = {
                id: card.id,
                shapeDisplayActions: level.displayActions || [],
                shapeScale: scale,
                growthAnimates: level.growthAnimates || []
            };
            const lines = [];
            lines.push("ParticleDisplayer.withComposition(");
            lines.push(`    ${cls}(it).apply {`);
            if (axisExpr) lines.push(`        axis = ${axisExpr}`);
            if (scale.type === "bezier") {
                lines.push(
                    `        loadScaleHelperBezierValue(${formatNumberCompact(scale.min)}, ${formatNumberCompact(scale.max)}, ${Math.max(1, int(scale.tick))}, ` +
                    `RelativeLocation(${formatNumberCompact(scale.c1x)}, ${formatNumberCompact(scale.c1y)}, ${formatNumberCompact(scale.c1z)}), ` +
                    `RelativeLocation(${formatNumberCompact(scale.c2x)}, ${formatNumberCompact(scale.c2y)}, ${formatNumberCompact(scale.c2z)}))`
                );
            } else if (scale.type === "linear") {
                lines.push(`        loadScaleValue(${formatNumberCompact(scale.min)}, ${formatNumberCompact(scale.max)}, ${Math.max(1, int(scale.tick))})`);
            }
            if (bindMode === "builder") {
                lines.push("        applyBuilder(");
                lines.push(indentText(builderExpr, "            "));
                lines.push("        ) {");
            } else {
                lines.push(`        ${applyFn}(${pointExpr}) {`);
            }
            lines.push("            CompositionData()");
            lines.push("                .setDisplayerSupplier {");
            lines.push(indentText(nextDisplayerExpr, "                    "));
            lines.push("                }");
            if (nextLevel.type === "single") {
                const singleChain = this.buildSingleDataChain(card, className, "                ");
                if (singleChain) lines.push(singleChain);
            }
            lines.push("        }");
            const actions = this.applyCardCompositionActions(pseudo, className, "        ", level.type === "sequenced_shape");
            if (String(actions || "").trim()) lines.push(actions);
            lines.push("    }");
            lines.push(")");
            return lines.join("\n");
        };
        return buildLevel(0);
    }

    applyCardCompositionActions(card, className, innerIndent = "        ", supportsAnimate = false) {
        const lines = [];
        const displayActions = Array.isArray(card.shapeDisplayActions) && card.shapeDisplayActions.length
            ? card.shapeDisplayActions.map((a) => normalizeDisplayAction(a))
            : [];
        const shapeScale = normalizeScaleHelperConfig(card.shapeScale, { type: "none" });
        const needReverseScale = shapeScale.type !== "none" && shapeScale.reversedOnDisable;
        for (let i = 0; i < displayActions.length; i++) {
            const act = displayActions[i];
            const toExpr = rewriteClassQualifier(String(act.toExpr || act.toPreset || "RelativeLocation.yAxis()"), className);
            const angleExpr = act.angleMode === "expr"
                ? rewriteClassQualifier(String(act.angleExpr || "0.0"), className)
                : U.angleToKotlinRadExpr(num(act.angleValue), normalizeAngleUnit(act.angleUnit));
            lines.push(`${innerIndent}applyDisplayAction {`);
            if (act.type === "rotateTo") {
                lines.push(`${innerIndent}    rotateTo(${toExpr})`);
            } else if (act.type === "rotateAsAxis") {
                lines.push(`${innerIndent}    rotateAsAxis(${angleExpr})`);
            } else if (act.type === "rotateToWithAngle") {
                lines.push(`${innerIndent}    rotateToWithAngle(${toExpr}, ${angleExpr})`);
            } else if (act.type === "expression") {
                const rawExpr = String(act.expression || "").trim();
                const check = this.validateJsExpressionSource(rawExpr, { cardId: card.id });
                const expr = rewriteClassQualifier(rawExpr, className);
                if (expr && check.valid) {
                    lines.push(`${innerIndent}    addPreTickAction {`);
                    lines.push(translateJsBlockToKotlin(expr, `${innerIndent}        `));
                    lines.push(`${innerIndent}    }`);
                }
            }
            if (needReverseScale && i === displayActions.length - 1) {
                const cls = sanitizeKotlinClassName(className);
                lines.push(`${innerIndent}    setReversedScaleOnCompositionStatus(this@${cls})`);
            }
            lines.push(`${innerIndent}}`);
        }
        if (needReverseScale && !displayActions.length) {
            const cls = sanitizeKotlinClassName(className);
            lines.push(`${innerIndent}applyDisplayAction {`);
            lines.push(`${innerIndent}    setReversedScaleOnCompositionStatus(this@${cls})`);
            lines.push(`${innerIndent}}`);
        }
        if (supportsAnimate && card.growthAnimates?.length) {
            const arr = card.growthAnimates.map((a) => normalizeAnimate(a));
            if (arr.length) {
                lines.push(`${innerIndent}animate.addAnimate(${arr[0].count}) { ${rewriteClassQualifier(arr[0].condition, className)} }`);
                for (let i = 1; i < arr.length; i++) {
                    lines.push(`${innerIndent}    .addAnimate(${arr[i].count}) { ${rewriteClassQualifier(arr[i].condition, className)} }`);
                }
            }
        }
        return lines.join("\n");
    }

    buildOnDisplayMethod(className) {
        const actions = this.state.displayActions || [];
        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        const needReverseScale = projectScale.type !== "none" && projectScale.reversedOnDisable;
        if (!actions.length && !needReverseScale) {
            return [
                "    override fun onDisplay() {",
                "    }"
            ].join("\n");
        }
        const lines = [];
        lines.push("    override fun onDisplay() {");
        lines.push("        addPreTickAction {");
        for (const raw of actions) {
            const act = normalizeDisplayAction(raw);
            const toExpr = rewriteClassQualifier(String(act.toExpr || act.toPreset || "RelativeLocation.yAxis()"), className);
            const angleExpr = act.angleMode === "expr"
                ? rewriteClassQualifier(String(act.angleExpr || "0.0"), className)
                : U.angleToKotlinRadExpr(num(act.angleValue), normalizeAngleUnit(act.angleUnit));
            if (act.type === "rotateTo") {
                lines.push(`            rotateTo(${toExpr})`);
            } else if (act.type === "rotateAsAxis") {
                lines.push(`            rotateAsAxis(${angleExpr})`);
            } else if (act.type === "rotateToWithAngle") {
                lines.push(`            rotateToWithAngle(${toExpr}, ${angleExpr})`);
            } else if (act.type === "expression") {
                const rawExpr = String(act.expression || "").trim();
                const check = this.validateJsExpressionSource(rawExpr, { cardId: "" });
                const expr = rewriteClassQualifier(rawExpr, className);
                if (expr && check.valid) lines.push(translateJsBlockToKotlin(expr, "            "));
            }
        }
        if (needReverseScale) {
            const cls = sanitizeKotlinClassName(className);
            lines.push(`            setReversedScaleOnCompositionStatus(this@${cls})`);
        }
        lines.push("        }");
        lines.push("    }");
        return lines.join("\n");
    }
}

function indentText(text, indent = "    ") {
    const src = String(text || "");
    const lines = src.split(/\r?\n/);
    return lines.map((line) => `${indent}${line}`).join("\n");
}

function sanitizeFileBase(name) {
    const raw = String(name || "").trim();
    if (!raw) return "";
    return raw.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60).trim();
}

function downloadText(filename, text, mime = "text/plain") {
    const blob = new Blob([String(text || "")], { type: `${mime};charset=utf-8` });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "download.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 220);
}

function hashString(s) {
    let h = 2166136261;
    const str = String(s || "");
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function rewriteClassQualifier(expr, className) {
    const cls = sanitizeKotlinClassName(className || "TestComposition");
    return String(expr || "").replace(/this@[A-Za-z_][A-Za-z0-9_]*/g, `this@${cls}`);
}

function transpileKotlinThisQualifierToJs(source) {
    return String(source || "").replace(/this@[A-Za-z_][A-Za-z0-9_]*\./g, "thisAt.");
}

function defaultLiteralForKotlinType(typeName) {
    const t = String(typeName || "").trim().toLowerCase();
    if (t === "string") return "\"\"";
    if (t === "boolean") return "false";
    if (t === "float") return "0f";
    if (t === "double") return "0.0";
    if (t === "long") return "0L";
    if (t === "int" || t === "short" || t === "byte") return "0";
    if (t === "vec3") return "Vec3.ZERO";
    if (t === "vector3f") return "Vector3f(0f,0f,0f)";
    if (t === "relativelocation") return "RelativeLocation(0.0, 0.0, 0.0)";
    return "0";
}

function appendFloatSuffixInLine(line) {
    return String(line || "").replace(/(^|[^\w.])(-?\d+\.\d+)(?![fFdD\w])/g, (m, pfx, numStr) => `${pfx}${numStr}f`);
}

function translateJsBlockToKotlin(script, indent = "    ") {
    const raw = String(script || "").replace(/\r\n/g, "\n").trim();
    if (!raw) return `${indent}// no-op`;

    const lines = raw.split("\n").map((line) => line.trimEnd().replace(/;+\s*$/g, ""));
    const out = [];
    for (let line of lines) {
        line = line.replaceAll("===", "==").replaceAll("!==", "!=");
        line = line.replace(/\blet\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, "var $1");
        line = line.replace(/\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, "val $1");
        line = line.replace(/\?\s*([^:]+)\s*:\s*(.+)$/g, (m, a, b) => `? ${a.trim()} : ${b.trim()}`);
        const ternary = line.match(/^(.*?)([A-Za-z0-9_.)\]]+)\s*\?\s*([^:]+)\s*:\s*(.+)$/);
        if (ternary) {
            const left = ternary[1] || "";
            const cond = ternary[2] || "true";
            const yes = ternary[3] || "0";
            const no = ternary[4] || "0";
            line = `${left}if (${cond.trim()}) ${yes.trim()} else ${no.trim()}`;
        }
        line = appendFloatSuffixInLine(line);
        out.push(`${indent}${line}`);
    }
    return out.join("\n");
}

const app = new CompositionBuilderApp();
app.init();
