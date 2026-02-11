export function uid(prefix = "id") {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
        return `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    }
    return `${prefix}_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16).slice(-6)}`;
}

export function deepClone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

export function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

export function debounce(fn, delay = 200) {
    let timer = 0;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

export async function readFileAsText(file) {
    return await file.text();
}

export function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

export function sanitizeProjectName(name) {
    const n = (name || "shader-workbench").trim();
    return n.replace(/[^a-zA-Z0-9_\-.\u4e00-\u9fa5]/g, "_").slice(0, 64) || "shader-workbench";
}

export function boolFromString(v, fallback = false) {
    if (typeof v === "boolean") return v;
    if (typeof v !== "string") return fallback;
    const t = v.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(t)) return true;
    if (["false", "0", "no", "off"].includes(t)) return false;
    return fallback;
}

export function parseVec(text, dim) {
    if (typeof text !== "string") return null;
    const parts = text.split(",").map((s) => Number(s.trim()));
    if (parts.length !== dim || parts.some((n) => !Number.isFinite(n))) return null;
    return parts;
}

export function normalizeHotkey(hk) {
    if (!hk || typeof hk !== "string") return "";
    const parts = hk.split("+").map((s) => s.trim()).filter(Boolean);
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

export function eventToHotkey(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push("Mod");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");

    const code = e.code || "";
    const isMod = ["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(code);
    if (code && !isMod) parts.push(code);
    return normalizeHotkey(parts.join("+"));
}

export function hotkeyToHuman(hk) {
    hk = normalizeHotkey(hk);
    if (!hk) return "未设置";
    return hk.split("+").map((part) => {
        if (part === "Mod") return "Ctrl/Cmd";
        if (part === "Shift") return "Shift";
        if (part === "Alt") return "Alt";
        if (part.startsWith("Key")) return part.slice(3).toUpperCase();
        if (part.startsWith("Digit")) return part.slice(5);
        if (part === "Backspace") return "Backspace";
        if (part === "Delete") return "Delete";
        if (part === "Space") return "Space";
        if (part === "Escape") return "Esc";
        return part;
    }).join("+");
}

export function hotkeyMatchEvent(e, hk) {
    return eventToHotkey(e) === normalizeHotkey(hk);
}

export function shouldIgnoreHotkeysForTarget(target) {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tag = (target.tagName || "").toUpperCase();
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
        const type = (target.getAttribute("type") || "text").toLowerCase();
        if (["checkbox", "button", "submit"].includes(type)) return false;
        return true;
    }
    if (target.isContentEditable) return true;
    return false;
}

export function saveJson(storageKey, payload) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(payload));
        return true;
    } catch (err) {
        console.warn(`saveJson ${storageKey} failed`, err);
        return false;
    }
}

export function loadJson(storageKey, fallback = null) {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (err) {
        console.warn(`loadJson ${storageKey} failed`, err);
        return fallback;
    }
}
