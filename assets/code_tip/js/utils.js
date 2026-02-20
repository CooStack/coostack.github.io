const idSeed = {
  value: 0
};

export function createId(prefix = "ct") {
  idSeed.value += 1;
  const time = Date.now().toString(36);
  return `${prefix}-${time}-${idSeed.value.toString(36)}`;
}

export function resolveElement(target, label = "element") {
  if (target instanceof HTMLElement) {
    return target;
  }

  if (typeof target === "string") {
    const element = document.querySelector(target);
    if (!element) {
      throw new Error(`CodeTip: cannot find ${label} by selector \"${target}\".`);
    }
    return element;
  }

  throw new Error(`CodeTip: invalid ${label}, expected selector string or HTMLElement.`);
}

export function debounce(fn, wait = 300) {
  let timer = null;

  const wrapped = (...args) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      fn(...args);
    }, wait);
  };

  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return wrapped;
}

export function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null) {
    return [];
  }
  return [value];
}

export function sanitizeFileName(name, fallback = "extra-lib.d.ts") {
  const raw = String(name || fallback);
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.endsWith(".d.ts") ? cleaned : `${cleaned}.d.ts`;
}

export function escapeHtml(value) {
  const text = String(value == null ? "" : value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createDisposableBucket() {
  const entries = [];
  return {
    add(disposable) {
      if (disposable && typeof disposable.dispose === "function") {
        entries.push(disposable);
      }
      return disposable;
    },
    dispose() {
      while (entries.length > 0) {
        const current = entries.pop();
        try {
          current.dispose();
        } catch (error) {
          console.error("CodeTip: dispose failed", error);
        }
      }
    }
  };
}

export function severityText(level) {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "error") {
    return "Error";
  }
  if (normalized === "warning" || normalized === "warn") {
    return "Warning";
  }
  if (normalized === "info") {
    return "Info";
  }
  return "Hint";
}

export function downloadTextFile(fileName, content, mime = "text/plain") {
  const blob = new Blob([String(content == null ? "" : content)], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || "download.txt";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
