export const ANGLE_OFFSET_EASE_OPTIONS = [
    { id: "linear", title: "Eases.linear" },
    { id: "outCubic", title: "Eases.outCubic" },
    { id: "inOutSine", title: "Eases.inOutSine" },
    { id: "outExpo", title: "Eases.outExpo" },
    { id: "inCubic", title: "Eases.inCubic" },
    { id: "inOutCubic", title: "Eases.inOutCubic" },
    { id: "outQuad", title: "Eases.outQuad" },
    { id: "outBack", title: "Eases.outBack" },
    { id: "outElastic", title: "Eases.outElastic" },
    { id: "outBounce", title: "Eases.outBounce" }
];

export function normalizeAngleUnit(unit) {
    return unit === "rad" ? "rad" : "deg";
}

export function normalizeAngleOffsetEaseName(raw) {
    const name = String(raw || "").trim();
    if (!name) return "outCubic";
    return ANGLE_OFFSET_EASE_OPTIONS.some((it) => it.id === name) ? name : "outCubic";
}

export function normalizeAngleOffsetFieldName(rawField) {
    const key = String(rawField || "").trim();
    if (!key) return "";
    const map = {
        enabled: "angleOffsetEnabled",
        count: "angleOffsetCount",
        glowTick: "angleOffsetGlowTick",
        ease: "angleOffsetEase",
        reverseOnDisable: "angleOffsetReverseOnDisable",
        angleMode: "angleOffsetAngleMode",
        angleValue: "angleOffsetAngleValue",
        angleUnit: "angleOffsetAngleUnit",
        angleExpr: "angleOffsetAngleExpr",
        anglePreset: "angleOffsetAnglePreset"
    };
    return map[key] || key;
}

export function formatAngleValue(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "0";
    if (Math.abs(n) < 1e-9) return "0";
    return `${Number(n.toFixed(6))}`;
}
