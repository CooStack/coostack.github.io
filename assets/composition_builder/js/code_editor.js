function escHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

const JS_KEYWORDS = new Set([
    "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "return",
    "let", "const", "var", "true", "false", "null", "undefined", "new", "this", "typeof", "instanceof",
    "try", "catch", "finally", "throw", "class", "extends", "super", "import", "from", "export", "as"
]);

const JS_BUILTINS = new Set([
    "Math", "PI", "Random", "Number", "String", "Boolean", "Object", "Array",
    "rotateTo", "rotateAsAxis", "rotateToWithAngle", "addSingle", "addMultiple", "addPreTickAction"
]);

const TOKEN_RE = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b/g;

function classifyToken(token) {
    if (!token) return "tok-id";
    if (token.startsWith("//") || token.startsWith("/*")) return "tok-comment";
    if (token.startsWith("\"") || token.startsWith("'")) return "tok-string";
    if (/^\d/.test(token)) return "tok-num";
    if (JS_KEYWORDS.has(token)) return "tok-key";
    if (JS_BUILTINS.has(token)) return "tok-builtin";
    return "tok-id";
}

function highlightJs(source) {
    const text = String(source || "");
    let out = "";
    let last = 0;
    for (const match of text.matchAll(TOKEN_RE)) {
        const token = match[0] || "";
        const idx = match.index || 0;
        out += escHtml(text.slice(last, idx));
        out += `<span class="${classifyToken(token)}">${escHtml(token)}</span>`;
        last = idx + token.length;
    }
    out += escHtml(text.slice(last));
    if (text.endsWith("\n")) out += "\n";
    return out;
}

function defaultTokenRange(text, caret) {
    const src = String(text || "");
    const at = Math.max(0, Math.min(Number(caret) || 0, src.length));
    let start = at;
    while (start > 0 && /[A-Za-z0-9_.$@]/.test(src[start - 1])) start -= 1;
    let end = at;
    while (end < src.length && /[A-Za-z0-9_.$@]/.test(src[end])) end += 1;
    return { start, end, token: src.slice(start, at) };
}

function splitSuggestionLabel(label, token) {
    const src = String(label || "");
    const key = String(token || "");
    if (!key) return { before: src, match: "", after: "" };
    const idx = src.toLowerCase().indexOf(key.toLowerCase());
    if (idx < 0) return { before: src, match: "", after: "" };
    return {
        before: src.slice(0, idx),
        match: src.slice(idx, idx + key.length),
        after: src.slice(idx + key.length)
    };
}

function toCompletionObjects(items) {
    const arr = Array.isArray(items) ? items : [];
    return arr
        .map((it) => {
            if (!it) return null;
            if (typeof it === "string") return { label: it, insertText: it, detail: "", priority: 100, cursorOffset: null };
            const label = String(it.label || it.insertText || "").trim();
            if (!label) return null;
            return {
                label,
                insertText: String(it.insertText || label),
                detail: String(it.detail || ""),
                priority: Number.isFinite(Number(it.priority)) ? Number(it.priority) : 100,
                cursorOffset: (typeof it.cursorOffset === "number" && Number.isFinite(it.cursorOffset)) ? it.cursorOffset : null
            };
        })
        .filter(Boolean);
}

export function mergeCompletionGroups(...groups) {
    const map = new Map();
    for (const group of groups) {
        for (const it of toCompletionObjects(group)) {
            const key = String(it.label || "");
            const prev = map.get(key);
            if (!prev || (Number(it.priority) || 0) > (Number(prev.priority) || 0)) map.set(key, it);
        }
    }
    return Array.from(map.values());
}

export class InlineCodeEditor {
    constructor(options = {}) {
        const {
            textarea,
            title = "代码编辑",
            onChange = () => {},
            completions = [],
            autoSuggestMin = 1,
            validate = null
        } = options;

        if (!(textarea instanceof HTMLTextAreaElement)) {
            throw new Error("InlineCodeEditor requires a textarea");
        }

        this.textarea = textarea;
        this.title = String(title || "代码编辑");
        this.onChange = onChange;
        this.autoSuggestMin = Math.max(0, Number(autoSuggestMin) || 0);
        this.completions = mergeCompletionGroups(completions);
        this.validate = (typeof validate === "function") ? validate : null;
        this.filteredSuggest = [];
        this.suggestActive = -1;
        this.suggestRange = { start: 0, end: 0, token: "" };
        this.localHistory = [];
        this.localHistoryIndex = -1;
        this.isApplyingLocalHistory = false;

        this.buildDOM();
        this.bindEvents();
        this.renderHighlight();
        this.runValidation();
        this.pushLocalHistory(true);
    }

    buildDOM() {
        const field = this.textarea.closest(".field") || this.textarea.parentElement;
        const hostParent = this.textarea.parentElement;
        const hostNext = this.textarea.nextSibling;

        this.shellEl = document.createElement("div");
        this.shellEl.className = "editor-shell";

        this.toolbarEl = document.createElement("div");
        this.toolbarEl.className = "editor-toolbar";

        const titleEl = document.createElement("div");
        titleEl.className = "editor-title";
        titleEl.textContent = this.title;

        const rightEl = document.createElement("div");
        rightEl.className = "editor-toolbar-right";

        const hintEl = document.createElement("div");
        hintEl.className = "editor-hint";
        hintEl.textContent = "Ctrl+/ 注释 | Ctrl+Space 提示";

        rightEl.appendChild(hintEl);
        this.toolbarEl.appendChild(titleEl);
        this.toolbarEl.appendChild(rightEl);

        this.bodyEl = document.createElement("div");
        this.bodyEl.className = "editor-body";

        this.errorEl = document.createElement("div");
        this.errorEl.className = "editor-error hidden";

        this.highlightEl = document.createElement("pre");
        this.highlightEl.className = "editor-highlight";
        this.highlightEl.setAttribute("aria-hidden", "true");

        this.suggestEl = document.createElement("div");
        this.suggestEl.className = "editor-suggest hidden";

        this.textarea.classList.add("editor-textarea");
        this.textarea.spellcheck = false;
        this.textarea.wrap = "off";

        this.bodyEl.appendChild(this.highlightEl);
        this.bodyEl.appendChild(this.textarea);
        this.shellEl.appendChild(this.toolbarEl);
        this.shellEl.appendChild(this.errorEl);
        this.shellEl.appendChild(this.bodyEl);
        this.shellEl.appendChild(this.suggestEl);

        if (field) {
            const labelSpan = field.querySelector(":scope > span");
            if (labelSpan) labelSpan.remove();
            field.classList.add("editor-field");
        }

        if (hostParent) {
            hostParent.insertBefore(this.shellEl, hostNext || null);
        } else if (field) {
            field.appendChild(this.shellEl);
        }
    }

    bindEvents() {
        this.onInputHandler = () => {
            this.renderHighlight();
            this.syncScroll();
            this.onChange(this.textarea.value);
            if (!this.isApplyingLocalHistory) this.pushLocalHistory();
            this.runValidation();
            this.tryAutoSuggest();
        };

        this.onScrollHandler = () => this.syncScroll();

        this.onBlurHandler = () => setTimeout(() => this.closeSuggest(), 120);

        this.onKeydownHandler = (ev) => {
            const suggestOpen = !this.suggestEl.classList.contains("hidden");
            const isMod = ev.ctrlKey || ev.metaKey;
            if (isMod && !ev.altKey && ev.code === "KeyZ") {
                ev.preventDefault();
                if (ev.shiftKey) this.redoLocalHistory();
                else this.undoLocalHistory();
                return;
            }
            if (isMod && !ev.altKey && ev.code === "KeyX" && (this.textarea.selectionStart || 0) === (this.textarea.selectionEnd || 0)) {
                ev.preventDefault();
                this.cutCurrentLine();
                return;
            }
            if (isMod && !ev.altKey && (ev.code === "Slash" || ev.code === "NumpadDivide")) {
                ev.preventDefault();
                this.toggleLineComment();
                return;
            }
            if (isMod && ev.code === "Space") {
                ev.preventDefault();
                this.openSuggest(true);
                return;
            }

            if (suggestOpen) {
                if (ev.code === "ArrowDown") {
                    ev.preventDefault();
                    this.moveSuggestActive(1);
                    return;
                }
                if (ev.code === "ArrowUp") {
                    ev.preventDefault();
                    this.moveSuggestActive(-1);
                    return;
                }
                if (ev.code === "Escape") {
                    ev.preventDefault();
                    this.closeSuggest();
                    return;
                }
                if (ev.code === "Enter") {
                    ev.preventDefault();
                    if (ev.shiftKey) {
                        this.closeSuggest();
                        this.insertNewLineWithIndent();
                    } else {
                        this.commitActiveSuggest();
                    }
                    return;
                }
                if (ev.code === "Tab") {
                    ev.preventDefault();
                    this.commitActiveSuggest();
                    return;
                }
            }

            if (!isMod && this.handleAutoPair(ev)) return;

            if (!isMod && ev.code === "Tab") {
                ev.preventDefault();
                this.insertIndent(ev.shiftKey ? -1 : 1);
                return;
            }
            if (!isMod && ev.code === "Enter") {
                ev.preventDefault();
                this.insertNewLineWithIndent();
                return;
            }
        };

        this.onClickSuggestHandler = (ev) => {
            const btn = ev.target instanceof HTMLElement ? ev.target.closest("button[data-idx]") : null;
            if (!btn) return;
            const idx = Number(btn.dataset.idx);
            if (!Number.isFinite(idx)) return;
            this.suggestActive = idx;
            this.commitActiveSuggest();
        };

        this.textarea.addEventListener("input", this.onInputHandler);
        this.textarea.addEventListener("scroll", this.onScrollHandler);
        this.textarea.addEventListener("blur", this.onBlurHandler);
        this.textarea.addEventListener("keydown", this.onKeydownHandler);
        this.suggestEl.addEventListener("mousedown", (ev) => ev.preventDefault());
        this.suggestEl.addEventListener("click", this.onClickSuggestHandler);
    }

    dispose() {
        this.textarea.removeEventListener("input", this.onInputHandler);
        this.textarea.removeEventListener("scroll", this.onScrollHandler);
        this.textarea.removeEventListener("blur", this.onBlurHandler);
        this.textarea.removeEventListener("keydown", this.onKeydownHandler);
        this.suggestEl.removeEventListener("click", this.onClickSuggestHandler);
    }

    setCompletions(items) {
        this.completions = mergeCompletionGroups(items);
        if (!this.suggestEl.classList.contains("hidden")) this.openSuggest(true);
    }

    setValidator(validate) {
        this.validate = (typeof validate === "function") ? validate : null;
        this.runValidation();
    }

    renderHighlight() {
        this.highlightEl.innerHTML = highlightJs(this.textarea.value);
    }

    runValidation() {
        if (typeof this.validate !== "function") {
            this.shellEl.classList.remove("editor-invalid");
            this.errorEl.classList.add("hidden");
            this.errorEl.textContent = "";
            return true;
        }
        let result = null;
        try {
            result = this.validate(String(this.textarea.value || ""));
        } catch (e) {
            result = { valid: false, message: String(e?.message || e || "表达式存在问题") };
        }
        const isValid = !(result && (result.valid === false || result.ok === false || result.error));
        const message = isValid ? "" : String(result?.message || result?.error || "表达式存在问题，此表达式不生效");
        this.shellEl.classList.toggle("editor-invalid", !isValid);
        this.errorEl.classList.toggle("hidden", isValid);
        this.errorEl.textContent = message;
        return isValid;
    }

    syncScroll() {
        this.highlightEl.scrollTop = this.textarea.scrollTop;
        this.highlightEl.scrollLeft = this.textarea.scrollLeft;
        this.positionSuggest();
    }

    currentTokenRange() {
        return defaultTokenRange(this.textarea.value, this.textarea.selectionStart || 0);
    }

    openSuggest(manual = false) {
        const range = this.currentTokenRange();
        this.suggestRange = range;
        const token = String(range.token || "");

        if (!token && !manual) {
            this.closeSuggest();
            return;
        }

        let list = Array.isArray(this.completions) ? [...this.completions] : [];
        if (token) {
            const t = token.toLowerCase();
            list = list.filter((it) => String(it.label || "").toLowerCase().includes(t));
        }
        list.sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
        list = list.slice(0, 12);

        if (!list.length) {
            this.closeSuggest();
            return;
        }

        this.filteredSuggest = list;
        this.suggestActive = 0;
        this.renderSuggestList();
        this.suggestEl.classList.remove("hidden");
        this.positionSuggest();
    }

    tryAutoSuggest() {
        const token = String(this.currentTokenRange().token || "");
        if (token.length < this.autoSuggestMin) {
            this.closeSuggest();
            return;
        }
        this.openSuggest(false);
    }

    closeSuggest() {
        this.suggestEl.classList.add("hidden");
        this.suggestEl.innerHTML = "";
        this.filteredSuggest = [];
        this.suggestActive = -1;
    }

    moveSuggestActive(delta) {
        if (!this.filteredSuggest.length) return;
        const n = this.filteredSuggest.length;
        this.suggestActive = (this.suggestActive + delta + n) % n;
        this.renderSuggestList();
        this.positionSuggest();
    }

    commitActiveSuggest() {
        if (!this.filteredSuggest.length) return;
        const idx = Math.max(0, Math.min(this.suggestActive, this.filteredSuggest.length - 1));
        const item = this.filteredSuggest[idx];
        const marker = "$0";
        const rawInsertText = String(item?.insertText || item?.label || "");
        let insertText = rawInsertText;
        let localCursorOffset = null;
        const markerIdx = rawInsertText.indexOf(marker);
        if (markerIdx >= 0) {
            insertText = rawInsertText.replace(marker, "");
            localCursorOffset = markerIdx;
        } else if (typeof item?.cursorOffset === "number" && Number.isFinite(item.cursorOffset)) {
            localCursorOffset = item.cursorOffset;
        }
        if (!insertText) return;
        const snapRange = this.suggestRange || { start: 0, end: 0, token: "" };
        const current = this.currentTokenRange();
        const caretNow = Math.max(0, Number(this.textarea.selectionStart) || 0);
        let start = Math.max(0, Number(snapRange.start) || 0);
        let end = Math.max(start, Number(snapRange.end) || start);
        if (caretNow >= current.start && caretNow <= current.end) {
            start = current.start;
            end = current.end;
        }

        // 纯变量/标识符补全统一把光标放在补全文本末尾。
        const isIdentifierLike = /^[A-Za-z_$][A-Za-z0-9_.$@]*$/.test(insertText);
        if (isIdentifierLike && !Number.isFinite(localCursorOffset)) {
            localCursorOffset = insertText.length;
        }

        this.snapshotBeforeEdit();
        this.textarea.setRangeText(insertText, start, end, "end");
        let finalCaret = start + insertText.length;
        if (Number.isFinite(localCursorOffset)) {
            const caret = Math.max(start, Math.min(start + Number(localCursorOffset), start + insertText.length));
            finalCaret = caret;
        }
        this.forceCaret(finalCaret);
        this.emitProgrammaticInputChange(finalCaret);
        this.closeSuggest();
        this.textarea.focus();
    }

    positionSuggest() {
        if (this.suggestEl.classList.contains("hidden")) return;
        const bodyRect = this.bodyEl.getBoundingClientRect();
        this.suggestEl.style.left = "10px";
        this.suggestEl.style.top = `${Math.max(10, Math.min(120, bodyRect.height - 160))}px`;
    }

    renderSuggestList() {
        const token = String(this.suggestRange.token || "");
        const head = token
            ? `<div class="editor-suggest-head"><span class="editor-suggest-input">${escHtml(token)}</span></div>`
            : "";
        const list = this.filteredSuggest.map((it, idx) => {
            const active = idx === this.suggestActive ? " active" : "";
            const parts = splitSuggestionLabel(it.label || "", token);
            const label = `${escHtml(parts.before)}<span class="editor-suggest-match">${escHtml(parts.match)}</span><span class="editor-suggest-tail">${escHtml(parts.after)}</span>`;
            const detail = escHtml(it.detail || "");
            return `<button type="button" class="editor-suggest-item${active}" data-idx="${idx}"><span class="editor-suggest-label">${label}</span><small>${detail}</small></button>`;
        }).join("");
        this.suggestEl.innerHTML = `${head}${list}`;
    }

    pushLocalHistory(force = false) {
        const value = String(this.textarea.value || "");
        const start = Math.max(0, Number(this.textarea.selectionStart) || 0);
        const end = Math.max(start, Number(this.textarea.selectionEnd) || start);
        const snap = { value, start, end };
        const prev = this.localHistory[this.localHistoryIndex];
        if (!force && prev && prev.value === snap.value && prev.start === snap.start && prev.end === snap.end) return;
        if (this.localHistoryIndex < this.localHistory.length - 1) {
            this.localHistory.splice(this.localHistoryIndex + 1);
        }
        this.localHistory.push(snap);
        if (this.localHistory.length > 400) {
            const drop = this.localHistory.length - 400;
            this.localHistory.splice(0, drop);
        }
        this.localHistoryIndex = this.localHistory.length - 1;
    }

    undoLocalHistory() {
        if (this.localHistoryIndex <= 0) return false;
        this.localHistoryIndex -= 1;
        this.applyLocalHistorySnapshot(this.localHistory[this.localHistoryIndex]);
        return true;
    }

    redoLocalHistory() {
        if (this.localHistoryIndex >= this.localHistory.length - 1) return false;
        this.localHistoryIndex += 1;
        this.applyLocalHistorySnapshot(this.localHistory[this.localHistoryIndex]);
        return true;
    }

    applyLocalHistorySnapshot(snap) {
        if (!snap) return;
        const text = String(snap.value || "");
        const start = Math.max(0, Math.min(Number(snap.start) || 0, text.length));
        const end = Math.max(start, Math.min(Number(snap.end) || start, text.length));
        this.isApplyingLocalHistory = true;
        try {
            this.textarea.value = text;
            this.textarea.setSelectionRange(start, end);
            this.renderHighlight();
            this.syncScroll();
            this.closeSuggest();
            this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
            this.textarea.dispatchEvent(new Event("change", { bubbles: true }));
        } finally {
            this.isApplyingLocalHistory = false;
        }
    }

    emitProgrammaticInputChange(caret = null) {
        this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
        this.textarea.dispatchEvent(new Event("change", { bubbles: true }));
        if (typeof caret === "number" && Number.isFinite(caret)) this.forceCaret(caret);
    }

    forceCaret(caret) {
        const pos = Math.max(0, Math.min(Number(caret) || 0, String(this.textarea.value || "").length));
        try {
            this.textarea.focus();
            this.textarea.setSelectionRange(pos, pos);
        } catch {
        }
    }

    writeClipboardText(text) {
        const value = String(text || "");
        if (!value) return;
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(value).catch(() => this.writeClipboardTextFallback(value));
            return;
        }
        this.writeClipboardTextFallback(value);
    }

    writeClipboardTextFallback(text) {
        try {
            const ta = document.createElement("textarea");
            ta.value = String(text || "");
            ta.setAttribute("readonly", "true");
            ta.style.position = "fixed";
            ta.style.left = "-99999px";
            ta.style.top = "-99999px";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand("copy");
            ta.remove();
        } catch {
        }
    }

    cutCurrentLine() {
        const text = String(this.textarea.value || "");
        const start = this.textarea.selectionStart || 0;
        const end = this.textarea.selectionEnd || start;
        if (start !== end) return false;
        const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        let lineEnd = text.indexOf("\n", start);
        if (lineEnd < 0) lineEnd = text.length;
        else lineEnd += 1;
        const cut = text.slice(lineStart, lineEnd);
        if (!cut) return false;
        this.snapshotBeforeEdit();
        this.writeClipboardText(cut);
        this.textarea.setRangeText("", lineStart, lineEnd, "start");
        this.textarea.setSelectionRange(lineStart, lineStart);
        this.emitProgrammaticInputChange();
        return true;
    }

    snapshotBeforeEdit() {
        if (this.isApplyingLocalHistory) return;
        this.pushLocalHistory();
    }

    toggleLineComment() {
        const text = String(this.textarea.value || "");
        const start = this.textarea.selectionStart || 0;
        const end = this.textarea.selectionEnd || start;
        const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        const lineEndRaw = text.indexOf("\n", end);
        const lineEnd = lineEndRaw < 0 ? text.length : lineEndRaw;
        const block = text.slice(lineStart, lineEnd);
        const lines = block.split("\n");
        const allCommented = lines.every((line) => /^\s*\/\//.test(line));
        const mapped = lines.map((line) => allCommented ? line.replace(/^(\s*)\/\//, "$1") : line.replace(/^(\s*)/, "$1//"));
        this.snapshotBeforeEdit();
        this.textarea.setRangeText(mapped.join("\n"), lineStart, lineEnd, "select");
        this.emitProgrammaticInputChange();
    }

    insertIndent(direction = 1) {
        const start = this.textarea.selectionStart || 0;
        const end = this.textarea.selectionEnd || start;
        const text = this.textarea.value;
        const unit = "    ";
        this.snapshotBeforeEdit();
        if (start === end) {
            if (direction >= 0) {
                this.textarea.setRangeText(unit, start, end, "end");
            } else {
                const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
                const before = text.slice(lineStart, start);
                if (before.endsWith(unit)) this.textarea.setRangeText("", start - unit.length, start, "end");
            }
        } else {
            const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
            const lineEndRaw = text.indexOf("\n", end);
            const lineEnd = lineEndRaw < 0 ? text.length : lineEndRaw;
            const block = text.slice(lineStart, lineEnd);
            const mapped = block.split("\n").map((line) => direction >= 0 ? `${unit}${line}` : line.replace(/^ {1,4}/, "")).join("\n");
            this.textarea.setRangeText(mapped, lineStart, lineEnd, "select");
        }
        this.emitProgrammaticInputChange();
    }

    insertNewLineWithIndent() {
        const start = this.textarea.selectionStart || 0;
        const end = this.textarea.selectionEnd || start;
        const text = this.textarea.value;
        const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        const linePrefix = text.slice(lineStart, start);
        const baseIndent = (linePrefix.match(/^[ \t]*/) || [""])[0];
        this.snapshotBeforeEdit();
        this.textarea.setRangeText(`\n${baseIndent}`, start, end, "end");
        this.emitProgrammaticInputChange();
    }

    handleAutoPair(ev) {
        if (ev.altKey || ev.ctrlKey || ev.metaKey) return false;
        const openPairs = {
            "(": ")",
            "[": "]",
            "{": "}",
            "\"": "\"",
            "'": "'"
        };
        const closePairs = new Set(Object.values(openPairs));
        const key = String(ev.key || "");
        const text = String(this.textarea.value || "");
        const start = this.textarea.selectionStart || 0;
        const end = this.textarea.selectionEnd || start;
        const hasSelection = end > start;
        const applyChange = () => this.emitProgrammaticInputChange();

        if (key in openPairs) {
            ev.preventDefault();
            const close = openPairs[key];
            this.snapshotBeforeEdit();
            if (hasSelection) {
                const selected = text.slice(start, end);
                this.textarea.setRangeText(`${key}${selected}${close}`, start, end, "end");
                this.textarea.setSelectionRange(start + 1, end + 1);
            } else if ((key === "\"" || key === "'") && text[start] === key) {
                this.textarea.setSelectionRange(start + 1, start + 1);
            } else {
                this.textarea.setRangeText(`${key}${close}`, start, end, "end");
                this.textarea.setSelectionRange(start + 1, start + 1);
            }
            applyChange();
            return true;
        }

        if (!hasSelection && closePairs.has(key) && text[start] === key) {
            ev.preventDefault();
            this.textarea.setSelectionRange(start + 1, start + 1);
            return true;
        }

        if (ev.code === "Backspace" && !hasSelection && start > 0 && start < text.length) {
            const prev = text[start - 1];
            const next = text[start];
            if (openPairs[prev] === next) {
                ev.preventDefault();
                this.snapshotBeforeEdit();
                this.textarea.setRangeText("", start - 1, start + 1, "end");
                this.textarea.setSelectionRange(start - 1, start - 1);
                applyChange();
                return true;
            }
        }

        return false;
    }
}
