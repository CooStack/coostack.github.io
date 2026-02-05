export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));

export const safeNum = (v, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
};

export const fmtD = (n) => {
    if (!Number.isFinite(n)) return "0.0";
    let s = (Math.round(n * 1000000) / 1000000).toString();
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

export function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[m]);
}

export const deepCopy = (o) => JSON.parse(JSON.stringify(o));

export function deepAssign(dst, src) {
    if (!src || typeof src !== "object") return;
    for (const k of Object.keys(src)) {
        const v = src[k];
        if (v && typeof v === "object" && !Array.isArray(v)) {
            if (!dst[k] || typeof dst[k] !== "object") dst[k] = {};
            deepAssign(dst[k], v);
        } else {
            dst[k] = v;
        }
    }
}

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
