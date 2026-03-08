import { clamp as sharedClamp, safeNum as sharedSafeNum } from "../../src/js/shared/number.js";
import { escapeHtml as sharedEscapeHtml } from "../../src/js/shared/string.js";
import { deepAssign as sharedDeepAssign, deepCopy as sharedDeepCopy } from "../../src/js/shared/object.js";

export const clamp = sharedClamp;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const safeNum = sharedSafeNum;

export function isNumericLiteral(v) {
    const s = String(v ?? "").trim();
    if (!s) return false;
    const n = Number(s);
    return Number.isFinite(n);
}

export function sanitizeKNumExpr(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) return s;
    return "";
}

export const fmtD = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) {
        const expr = sanitizeKNumExpr(n);
        return expr ? `(${expr}).toDouble()` : "0.0";
    }
    let s = (Math.round(num * 1000000) / 1000000).toString();
    if (!s.includes(".")) s += ".0";
    return s;
};

export const fmtB = (b) => (b ? "true" : "false");

export const kVec3 = (x, y, z) => `Vec3(${fmtD(x)}, ${fmtD(y)}, ${fmtD(z)})`;
export const kSupplierVec3 = (x, y, z) => `Supplier { ${kVec3(x, y, z)} }`;

export const kTrailingLambda = (expr, fallback = "this.pos") => {
    const raw = (expr ?? "").trim();
    let s = raw.length ? raw : fallback;
    s = s.trim();
    if (s.startsWith("{") && s.endsWith("}")) {
        s = s.substring(1, s.length - 1).trim();
    }
    return `{${s}}`;
};

export function chain(lines) {
    if (!lines.length) return "";
    const head = lines[0];
    const tail = lines.slice(1).map(x => `    ${x}`);
    return [head, ...tail].join("\n");
}

export function indent(s, spaces) {
    const pad = " ".repeat(spaces);
    return s.split("\n").map((line, i) => (i === 0 ? line : pad + line)).join("\n");
}

export const escapeHtml = sharedEscapeHtml;
export const deepCopy = sharedDeepCopy;
export const deepAssign = sharedDeepAssign;

export function countDecimalsFromString(value) {
    const text = String(value ?? "").trim().toLowerCase();
    if (!text) return 0;
    const parts = text.split("e-");
    if (parts.length === 2) {
        const exp = parseInt(parts[1], 10);
        if (Number.isFinite(exp)) return exp;
    }
    const dot = text.indexOf(".");
    if (dot < 0) return 0;
    return Math.max(0, text.length - dot - 1);
}
