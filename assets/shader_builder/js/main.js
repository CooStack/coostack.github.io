import {
    MC_COMPAT,
    STORAGE_KEYS
} from "./constants.js";
import {
    createDefaultPostNode,
    createDefaultState,
    createParamTemplate,
    createStore,
    ensureSelectedNode,
    findPostNode,
    GRAPH_INPUT_ID,
    GRAPH_OUTPUT_ID,
    normalizeNodePathTemplate,
    removeNodeAndLinks,
    resolveNodeFragmentPath,
} from "./store.js";
import { GraphEditor } from "./graph.js";
import { initSettingsSystem } from "./settings.js";
import { initHotkeysSystem } from "./hotkeys.js";
import { generateModelKotlin, generatePostKotlin } from "./codegen.js";
import {
    exportProjectJson,
    exportSettingsJson,
    importProjectFromFile,
    importSettingsFromFile,
    normalizeProjectPayload
} from "./io.js";
import {
    debounce,
    downloadText,
    escapeHtml,
    loadJson,
    sanitizeProjectName,
    saveJson,
    shouldIgnoreHotkeysForTarget,
    uid
} from "./utils.js";
import {
    BASE_GLSL_COMPLETIONS,
    buildUniformCompletions,
    mergeCompletionGroups,
    ShaderCodeEditor
} from "./editors.js";

function $(id) {
    return document.getElementById(id);
}

const els = {
    btnPageModel: $("btnPageModel"),
    btnPagePost: $("btnPagePost"),
    btnBackToPost: $("btnBackToPost"),
    btnUndo: $("btnUndo"),
    btnRedo: $("btnRedo"),
    btnExportAll: $("btnExportAll"),
    btnAddPass: $("btnAddPass"),
    btnGenerate: $("btnGenerate"),
    btnGenTargetModel: $("btnGenTargetModel"),
    btnGenTargetPost: $("btnGenTargetPost"),
    btnGenTargetAll: $("btnGenTargetAll"),
    btnSettings: $("btnSettings"),
    btnFullscreen: $("btnFullscreen"),
    btnResetCamera: $("btnResetCamera"),
    btnExportProject: $("btnExportProject"),
    btnImportProject: $("btnImportProject"),
    fileProject: $("fileProject"),
    btnResetProject: $("btnResetProject"),
    inpProjectName: $("inpProjectName"),

    selPrimitive: $("selPrimitive"),
    btnUploadModel: $("btnUploadModel"),
    fileModel: $("fileModel"),
    modelFileName: $("modelFileName"),
    chkEnablePost: $("chkEnablePost"),

    btnUploadTexture: $("btnUploadTexture"),
    fileTexture: $("fileTexture"),
    textureList: $("textureList"),

    btnAutoLayout: $("btnAutoLayout"),
    btnClearLinks: $("btnClearLinks"),
    postGraphCard: $("postGraphCard"),
    graphCanvasWrap: $("graphCanvasWrap"),
    graphLines: $("graphLines"),
    graphCanvas: $("graphCanvas"),
    resizerLeft: document.querySelector(".resizer-left"),
    resizerRight: document.querySelector(".resizer-right"),
    layout: document.querySelector(".layout"),
    panelLeft: document.querySelector(".panel.left"),
    panelRight: document.querySelector(".panel.right"),

    statusShader: $("statusShader"),
    statusPipeline: $("statusPipeline"),
    statusCompat: $("statusCompat"),
    threeHost: $("threeHost"),
    viewer: document.querySelector(".viewer"),
    viewerHud: document.querySelector(".viewer-hud"),

    inpModelVertexPath: $("inpModelVertexPath"),
    inpModelFragmentPath: $("inpModelFragmentPath"),
    btnUploadModelVertex: $("btnUploadModelVertex"),
    btnUploadModelFragment: $("btnUploadModelFragment"),
    fileModelVertex: $("fileModelVertex"),
    fileModelFragment: $("fileModelFragment"),
    txtModelVertex: $("txtModelVertex"),
    txtModelFragment: $("txtModelFragment"),
    btnAddModelParam: $("btnAddModelParam"),
    modelParamList: $("modelParamList"),
    btnApplyModelShader: $("btnApplyModelShader"),
    btnExportModelVertex: $("btnExportModelVertex"),
    btnExportModelFragment: $("btnExportModelFragment"),

    nodeEditorEmpty: $("nodeEditorEmpty"),
    nodeEditor: $("nodeEditor"),
    inpNodeName: $("inpNodeName"),
    selNodeType: $("selNodeType"),
    inpNodeFragmentPath: $("inpNodeFragmentPath"),
    btnUploadNodeFragment: $("btnUploadNodeFragment"),
    fileNodeFragment: $("fileNodeFragment"),
    txtNodeFragment: $("txtNodeFragment"),
    btnAddNodeParam: $("btnAddNodeParam"),
    nodeParamList: $("nodeParamList"),
    inpNodeInputs: $("inpNodeInputs"),
    inpNodeOutputs: $("inpNodeOutputs"),
    inpNodeTextureUnit: $("inpNodeTextureUnit"),
    selNodeFilter: $("selNodeFilter"),
    inpNodeIterations: $("inpNodeIterations"),
    chkNodeMipmap: $("chkNodeMipmap"),
    btnApplyNodeShader: $("btnApplyNodeShader"),
    btnExportNodeFragment: $("btnExportNodeFragment"),
    btnDeleteNode: $("btnDeleteNode"),
    nodeShaderSection: $("nodeShaderSection"),
    nodeShaderActions: $("nodeShaderActions"),

    kotlinBody: $("kotlinBody"),
    kotlinModelBlock: $("kotlinModelBlock"),
    kotlinPostBlock: $("kotlinPostBlock"),
    btnToggleKotlin: $("btnToggleKotlin"),
    modelKotlinOut: $("modelKotlinOut"),
    postKotlinOut: $("postKotlinOut"),
    btnCopyModelKotlin: $("btnCopyModelKotlin"),
    btnDownloadModelKotlin: $("btnDownloadModelKotlin"),
    btnCopyPostKotlin: $("btnCopyPostKotlin"),
    btnDownloadPostKotlin: $("btnDownloadPostKotlin"),

    settingsModal: $("settingsModal"),
    settingsMask: $("settingsMask"),
    btnCloseSettings: $("btnCloseSettings"),
    btnOpenHotkeys: $("btnOpenHotkeys"),
    btnExportSettings: $("btnExportSettings"),
    btnImportSettings: $("btnImportSettings"),
    fileSettings: $("fileSettings"),
    themeSelect: $("themeSelect"),
    inpParamStep: $("inpParamStep"),
    inpCameraFov: $("inpCameraFov"),
    chkAxes: $("chkAxes"),
    chkGrid: $("chkGrid"),
    chkRealtimeCompile: $("chkRealtimeCompile"),
    chkRealtimeCode: $("chkRealtimeCode"),

    hotkeyModal: $("hotkeyModal"),
    hotkeyMask: $("hotkeyMask"),
    hotkeyList: $("hotkeyList"),
    hotkeyHint: $("hotkeyHint"),
    hotkeySearch: $("hotkeySearch"),
    btnCloseHotkeys: $("btnCloseHotkeys"),
    btnCloseHotkeys2: $("btnCloseHotkeys2"),
    btnResetHotkeys: $("btnResetHotkeys")
};

function setInputValue(el, value) {
    if (!el) return;
    const text = String(value ?? "");
    if (document.activeElement === el) return;
    if (el.value !== text) el.value = text;
}

function setChecked(el, value) {
    if (!el) return;
    el.checked = !!value;
}

function fileNameFromPath(path, fallback) {
    const raw = String(path || "").trim();
    if (!raw) return fallback;
    const parts = raw.split("/");
    const name = parts[parts.length - 1] || fallback;
    return name;
}

function normalizeResourcePath(path, fallback) {
    const raw = String(path || "").trim().replaceAll("\\", "/");
    const cleaned = raw
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => part.replace(/[^a-zA-Z0-9_.-]/g, "_"))
        .join("/");
    return cleaned || fallback;
}

function ensureExt(path, ext) {
    const p = String(path || "");
    if (!p) return ext.startsWith(".") ? `file${ext}` : `file.${ext}`;
    if (p.includes(".")) return p;
    return ext.startsWith(".") ? `${p}${ext}` : `${p}.${ext}`;
}

function resolveNodePathByInput(inputPath, nodeName) {
    const raw = String(inputPath || "").trim();
    const fallbackTemplate = "core/post/{name}.fsh";

    if (!raw) {
        const template = fallbackTemplate;
        return {
            fragmentPathTemplate: template,
            fragmentPath: resolveNodeFragmentPath(nodeName, template)
        };
    }

    if (raw.includes("{name}")) {
        const template = normalizeNodePathTemplate(raw, fallbackTemplate);
        return {
            fragmentPathTemplate: template,
            fragmentPath: resolveNodeFragmentPath(nodeName, template)
        };
    }

    return {
        fragmentPathTemplate: "",
        fragmentPath: ensureExt(normalizeResourcePath(raw, resolveNodeFragmentPath(nodeName, fallbackTemplate)), ".fsh")
    };
}

function normalizeNodeNumber(value, fallback = 1, min = 1, max = 8) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

const GLSL_UNIFORM_TYPE_MAP = Object.freeze({
    float: "float",
    int: "int",
    bool: "bool",
    vec2: "vec2",
    vec3: "vec3",
    texture: "sampler2D"
});

function isValidGlslIdentifier(name) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name || "").trim());
}

function glslUniformTypeForParam(type) {
    const t = String(type || "float").toLowerCase();
    return GLSL_UNIFORM_TYPE_MAP[t] || "float";
}

function collectUniformDeclsFromParams(params = []) {
    const list = [];
    const used = new Set();
    for (const p of params || []) {
        const name = String(p?.name || "").trim();
        if (!isValidGlslIdentifier(name) || used.has(name)) continue;
        used.add(name);
        const glslType = glslUniformTypeForParam(p?.type);
        list.push({
            name,
            decl: `uniform ${glslType} ${name};`
        });
    }
    return list;
}

function findUniformInsertIndex(lines) {
    let idx = 0;
    while (idx < lines.length) {
        const t = String(lines[idx] || "").trim();
        if (!t) {
            idx += 1;
            continue;
        }
        if (t.startsWith("#version") || /^precision\b/i.test(t) || t.startsWith("//")) {
            idx += 1;
            continue;
        }
        break;
    }
    while (idx < lines.length) {
        const t = String(lines[idx] || "").trim();
        if (!t || /^uniform\b/i.test(t)) {
            idx += 1;
            continue;
        }
        break;
    }
    return idx;
}

function syncUniformDeclarationsInSource(source, params = []) {
    const text = String(source || "");
    const desired = collectUniformDeclsFromParams(params);
    if (!desired.length) return text;

    const desiredByName = new Map(desired.map((it) => [it.name, it.decl]));
    const lines = text.split(/\r?\n/);
    const seen = new Set();
    const removeIdx = [];

    for (let i = 0; i < lines.length; i += 1) {
        const line = String(lines[i] || "");
        const m = /^\s*uniform\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/.exec(line);
        if (!m) continue;
        const name = String(m[2] || "");
        const wanted = desiredByName.get(name);
        if (!wanted) continue;
        if (seen.has(name)) {
            removeIdx.push(i);
            continue;
        }
        seen.add(name);
        if (line.trim() !== wanted) lines[i] = wanted;
    }

    for (let i = removeIdx.length - 1; i >= 0; i -= 1) {
        lines.splice(removeIdx[i], 1);
    }

    const missing = desired.filter((it) => !seen.has(it.name)).map((it) => it.decl);
    if (missing.length) {
        const insertAt = findUniformInsertIndex(lines);
        lines.splice(insertAt, 0, ...missing);
    }

    return lines.join("\n");
}

function syncModelShaderUniformDecls(draft) {
    if (!draft?.model?.shader) return;
    const shader = draft.model.shader;
    shader.fragmentSource = syncUniformDeclarationsInSource(shader.fragmentSource, shader.params || []);
}

function syncNodeShaderUniformDecls(node) {
    if (!node) return;
    node.fragmentSource = syncUniformDeclarationsInSource(node.fragmentSource, node.params || []);
}

const KOTLIN_KEYWORDS = new Set([
    "package", "import", "class", "object", "companion", "interface", "fun", "val", "var",
    "if", "else", "when", "for", "while", "do", "return", "override", "private", "protected",
    "public", "internal", "open", "abstract", "sealed", "data", "enum", "inline", "noinline",
    "crossinline", "suspend", "operator", "infix", "tailrec", "where", "is", "in", "as",
    "true", "false", "null", "this", "super", "by", "init", "try", "catch", "finally"
]);

const KOTLIN_TYPES = new Set([
    "Unit", "Any", "Nothing", "String", "Char", "Boolean", "Byte", "Short", "Int", "Long",
    "Float", "Double", "List", "MutableList", "Map", "MutableMap", "Set", "MutableSet", "Array"
]);

const KOTLIN_TOKEN_RE = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?[fFlL]?\b|\b[A-Za-z_][A-Za-z0-9_]*\b/g;

function classifyKotlinToken(token) {
    if (!token) return "kt-id";
    if (token.startsWith("//") || token.startsWith("/*")) return "kt-comment";
    if (token.startsWith("\"") || token.startsWith("'")) return "kt-string";
    if (/^\d/.test(token)) return "kt-num";
    if (KOTLIN_TYPES.has(token)) return "kt-type";
    if (KOTLIN_KEYWORDS.has(token)) return "kt-key";
    if (/^[A-Z][A-Za-z0-9_]*$/.test(token)) return "kt-type";
    return "kt-id";
}

function highlightKotlin(source) {
    const text = String(source || "");
    let out = "";
    let last = 0;
    for (const match of text.matchAll(KOTLIN_TOKEN_RE)) {
        const token = match[0] || "";
        const idx = match.index || 0;
        out += escapeHtml(text.slice(last, idx));
        out += `<span class="${classifyKotlinToken(token)}">${escapeHtml(token)}</span>`;
        last = idx + token.length;
    }
    out += escapeHtml(text.slice(last));
    if (text.endsWith("\n")) out += "\n";
    return out;
}

function createToastHost() {
    const host = document.createElement("div");
    host.className = "toast-host";
    document.body.appendChild(host);
    return host;
}

const toastHost = createToastHost();

function showToast(message, type = "ok", duration = 2200) {
    const item = document.createElement("div");
    item.className = `toast ${type === "err" ? "err" : "ok"}`;
    item.textContent = String(message || "");
    toastHost.appendChild(item);
    setTimeout(() => {
        item.remove();
    }, duration);
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
        reader.readAsDataURL(file);
    });
}

function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function sanitizeTextureResourceFileName(name, fallback = "texture.png") {
    const raw = String(name || "").trim().replaceAll("\\", "/");
    const last = raw.split("/").filter(Boolean).pop() || fallback;
    const safe = last.replace(/[^a-zA-Z0-9_.-]/g, "_");
    if (!safe) return fallback;
    if (safe.includes(".")) return safe;
    return `${safe}.png`;
}

function textureResourcePathFromName(name) {
    const file = sanitizeTextureResourceFileName(name, "texture.png");
    return `core/textures/${file}`;
}

function decodeDataUrlPayload(dataUrl) {
    const raw = String(dataUrl || "");
    const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i.exec(raw);
    if (!match) return null;
    const mime = String(match[1] || "application/octet-stream").toLowerCase();
    const isBase64 = !!match[2];
    const payload = String(match[3] || "");

    try {
        if (isBase64) {
            const binary = atob(payload);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i) & 0xff;
            }
            return { mime, bytes };
        }
        const text = decodeURIComponent(payload.replaceAll("+", "%20"));
        return { mime, bytes: new TextEncoder().encode(text) };
    } catch {
        return null;
    }
}

function createLink(fromNode, fromSlot, toNode, toSlot) {
    return {
        id: uid("link"),
        fromNode,
        fromSlot: Number(fromSlot || 0),
        toNode,
        toSlot: Number(toSlot || 0)
    };
}

function linkEquals(a, b) {
    return String(a.fromNode) === String(b.fromNode)
        && Number(a.fromSlot || 0) === Number(b.fromSlot || 0)
        && String(a.toNode) === String(b.toNode)
        && Number(a.toSlot || 0) === Number(b.toSlot || 0);
}

function pushUniqueLink(list, link) {
    if (list.some((it) => linkEquals(it, link))) return;
    list.push(link);
}

function wouldCreateCycle(state, fromNode, toNode) {
    if (!fromNode || !toNode) return false;
    if (fromNode === GRAPH_INPUT_ID || toNode === GRAPH_OUTPUT_ID) return false;
    if (fromNode === toNode) return true;

    const links = Array.isArray(state?.post?.links) ? state.post.links : [];
    const adjacency = new Map();

    for (const link of links) {
        const from = String(link?.fromNode || "");
        const to = String(link?.toNode || "");
        if (!from || !to) continue;
        if (from === GRAPH_OUTPUT_ID || to === GRAPH_INPUT_ID) continue;
        if (!adjacency.has(from)) adjacency.set(from, []);
        adjacency.get(from).push(to);
    }

    const stack = [toNode];
    const visited = new Set();

    while (stack.length) {
        const cur = stack.pop();
        if (!cur || visited.has(cur)) continue;
        visited.add(cur);
        if (cur === fromNode) return true;
        for (const next of adjacency.get(cur) || []) {
            if (!visited.has(next)) stack.push(next);
        }
    }

    return false;
}

function createStateFromStorage() {
    const saved = loadJson(STORAGE_KEYS.project, null);
    return normalizeProjectPayload(saved);
}

const store = createStore(createStateFromStorage());

let lastShaderStatus = "着色器：就绪";
let lastPipelineStatus = "后处理链：0 个卡片";

function setStatus(partial = {}) {
    if (partial.shader) lastShaderStatus = partial.shader;
    if (partial.pipeline) lastPipelineStatus = partial.pipeline;
    if (els.statusShader) els.statusShader.textContent = lastShaderStatus;
    if (els.statusPipeline) els.statusPipeline.textContent = lastPipelineStatus;
}

function createRendererFallback() {
    return {
        isFallbackRenderer: true,
        setPrimitive() {},
        applySettings() {},
        resize() {},
        resetCamera() {},
        toggleFullscreen() {},
        syncFromState() {},
        async loadModelFile() {
            throw new Error("渲染预览未就绪，暂时无法导入模型。");
        }
    };
}

if (els.statusCompat) {
    els.statusCompat.textContent = `MC ${MC_COMPAT.mcVersion}: ${MC_COMPAT.openGL} / ${MC_COMPAT.glsl} | 坐标轴：${MC_COMPAT.axis}`;
}

let renderer = createRendererFallback();

const graphEditor = new GraphEditor({
    wrapEl: els.graphCanvasWrap,
    canvasEl: els.graphCanvas,
    linesEl: els.graphLines,
    store,
    callbacks: {
        onSelectNode(nodeId) {
            store.patch((draft) => {
                draft.selectedNodeId = nodeId;
            }, { reason: "node-select" });
        },
        onOpenNodeEditor(nodeId) {
            store.patch((draft) => {
                draft.selectedNodeId = nodeId;
            }, { reason: "node-open-editor" });
            applyWorkspacePage("card");
        },
        onPatchNode(nodeId, mutator, meta = {}) {
            if (typeof mutator !== "function") return;
            store.patch((draft) => {
                const node = findPostNode(draft, nodeId);
                if (!node) return;
                mutator(node, draft);
                syncNodeShaderUniformDecls(node);
            }, Object.assign({
                reason: "node-inline-edit",
                forceCompile: true,
                forceKotlin: true
            }, meta || {}));
        },
        onAddNode() {
            addPostNode();
        },
        onDeleteNode(nodeId) {
            store.patch((draft) => {
                removeNodeAndLinks(draft, nodeId);
                ensureSelectedNode(draft);
            }, { reason: "node-delete", forceCompile: true, forceKotlin: true });
            showToast("已删除后处理卡片", "ok");
        },
        onDeleteNodes(nodeIds = []) {
            const ids = Array.from(new Set((nodeIds || []).map((id) => String(id || "")).filter(Boolean)));
            if (!ids.length) return;
            store.patch((draft) => {
                for (const id of ids) {
                    removeNodeAndLinks(draft, id);
                }
                ensureSelectedNode(draft);
            }, { reason: "node-delete-many", forceCompile: true, forceKotlin: true });
            showToast(`已删除 ${ids.length} 个卡片`, "ok");
        },
        onMoveNode(nodeId, x, y) {
            store.patch((draft) => {
                const node = findPostNode(draft, nodeId);
                if (!node) return;
                node.x = Math.round(x);
                node.y = Math.round(y);
            }, { reason: "node-move", forceKotlin: true });
        },
        onMoveNodes(moves = []) {
            const list = Array.isArray(moves) ? moves : [];
            if (!list.length) return;
            store.patch((draft) => {
                for (const item of list) {
                    const node = findPostNode(draft, String(item?.id || ""));
                    if (!node) continue;
                    node.x = Math.round(Number(item?.x || node.x || 0));
                    node.y = Math.round(Number(item?.y || node.y || 0));
                }
            }, { reason: "node-move-many", forceKotlin: true });
        },
        onCreateLink(link) {
            const state = store.getState();
            const fromNode = String(link?.fromNode || "");
            const toNode = String(link?.toNode || "");
            const fromSlot = Number(link?.fromSlot || 0);
            const toSlot = Number(link?.toSlot || 0);

            if (!fromNode || !toNode) return;
            if (toNode === GRAPH_INPUT_ID) {
                showToast("输入系统节点不能作为连接终点", "err");
                return;
            }
            if (fromNode === GRAPH_OUTPUT_ID) {
                showToast("输出系统节点不能作为连接起点", "err");
                return;
            }
            if (fromNode === toNode) {
                showToast("不支持自连接", "err");
                return;
            }
            if (wouldCreateCycle(state, fromNode, toNode)) {
                showToast("该连接会形成环，已阻止", "err");
                return;
            }

            store.patch((draft) => {
                draft.post.links = (draft.post.links || []).filter((l) => {
                    const sameTarget = String(l.toNode) === toNode && Number(l.toSlot || 0) === toSlot;
                    return !sameTarget;
                });
                pushUniqueLink(draft.post.links, createLink(fromNode, fromSlot, toNode, toSlot));
            }, { reason: "link-create", forceCompile: true, forceKotlin: true });
        },
        onDeleteLink(linkId, opts = {}) {
            store.patch((draft) => {
                draft.post.links = (draft.post.links || []).filter((l) => l.id !== linkId);
            }, { reason: "link-delete", forceCompile: true, forceKotlin: true });
            if (!opts?.silent) showToast("连线已删除", "ok");
        },
        onDeleteLinks(linkIds = []) {
            const ids = new Set((linkIds || []).map((id) => String(id || "")).filter(Boolean));
            if (!ids.size) return;
            store.patch((draft) => {
                draft.post.links = (draft.post.links || []).filter((l) => !ids.has(String(l?.id || "")));
            }, { reason: "link-delete-many", forceCompile: true, forceKotlin: true });
            showToast(`已删除 ${ids.size} 条连线`, "ok");
        }
    }
});

async function bootRenderer() {
    try {
        const mod = await import("./renderer.js");
        const RendererCtor = mod?.ShaderWorkbenchRenderer;
        if (typeof RendererCtor !== "function") {
            throw new Error("渲染模块缺少 ShaderWorkbenchRenderer");
        }

        renderer = new RendererCtor({
            hostEl: els.threeHost,
            onStatus: (partial) => setStatus(partial)
        });

        const state = store.getState();
        renderer.setPrimitive(state.model?.primitive || "sphere");
        renderer.applySettings(state.settings || {});
        renderer.syncFromState(state);
    } catch (err) {
        console.error("renderer boot failed", err);
        setStatus({
            shader: "着色器：渲染器不可用",
            pipeline: "后处理链：预览已禁用"
        });
        showToast("Three.js 加载失败，已切换到仅编辑模式。", "err", 4200);
    }
}

const modelVertexEditor = new ShaderCodeEditor({
    textarea: els.txtModelVertex,
    title: "模型顶点 GLSL",
    onChange(value) {
        store.patch((draft) => {
            draft.model.shader.vertexSource = value;
        }, { reason: "model-vertex-source", silentUI: true, forceKotlin: true });
    }
});

const modelFragmentEditor = new ShaderCodeEditor({
    textarea: els.txtModelFragment,
    title: "模型片元 GLSL",
    onChange(value) {
        store.patch((draft) => {
            draft.model.shader.fragmentSource = value;
        }, { reason: "model-fragment-source", silentUI: true, forceKotlin: true });
    }
});

const nodeFragmentEditor = new ShaderCodeEditor({
    textarea: els.txtNodeFragment,
    title: "后处理片元 GLSL",
    onChange(value) {
        store.patch((draft) => {
            const node = findPostNode(draft, draft.selectedNodeId);
            if (!node) return;
            node.fragmentSource = value;
        }, { reason: "node-fragment-source", silentUI: true, forceKotlin: true });
    }
});

let hotkeySystem = null;
let hasCustomModelLoaded = false;
let modelKotlinCache = "";
let postKotlinCache = "";
let kotlinCollapsed = true;
let syncRendererDebounced = () => syncRendererNow();
const PAGE_STORAGE_KEY = "sb_workspace_page_v1";
const CARD_PREVIEW_POS_KEY = "sb_card_preview_pos_v1";
const KOTLIN_TARGET_STORAGE_KEY = "sb_kotlin_target_v1";
let workspacePage = normalizeWorkspacePage(localStorage.getItem(PAGE_STORAGE_KEY), { allowCard: false });
let cardPreviewPos = loadJson(CARD_PREVIEW_POS_KEY, null);
let kotlinGenerateTarget = normalizeKotlinGenerateTarget(localStorage.getItem(KOTLIN_TARGET_STORAGE_KEY) || "all");

function normalizeCardPreviewPos(raw) {
    if (!raw || typeof raw !== "object") return null;
    const x = Number(raw.x);
    const y = Number(raw.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.round(x), y: Math.round(y) };
}

cardPreviewPos = normalizeCardPreviewPos(cardPreviewPos);

function normalizeWorkspacePage(page, { allowCard = true } = {}) {
    const p = String(page || "").toLowerCase();
    if (p === "post" || p === "model") return p;
    if (p === "card") return allowCard ? "card" : "post";
    return "model";
}

function isFloatingPreviewPage(page = workspacePage) {
    return page === "card" || page === "post";
}

function normalizeKotlinGenerateTarget(target) {
    const t = String(target || "").toLowerCase();
    if (t === "model" || t === "post" || t === "all") return t;
    return "all";
}

function suggestKotlinTargetByWorkspace(page = workspacePage) {
    if (page === "model") return "model";
    if (page === "post" || page === "card") return "post";
    return normalizeKotlinGenerateTarget(kotlinGenerateTarget);
}

function applyKotlinGenerateTarget(target, { save = true } = {}) {
    kotlinGenerateTarget = normalizeKotlinGenerateTarget(target);
    const btnMap = {
        model: els.btnGenTargetModel,
        post: els.btnGenTargetPost,
        all: els.btnGenTargetAll
    };
    for (const [key, btn] of Object.entries(btnMap)) {
        if (!(btn instanceof HTMLElement)) continue;
        const active = key === kotlinGenerateTarget;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
    if (els.kotlinModelBlock) {
        const showModel = kotlinGenerateTarget === "all" || kotlinGenerateTarget === "model";
        els.kotlinModelBlock.classList.toggle("hidden", !showModel);
    }
    if (els.kotlinPostBlock) {
        const showPost = kotlinGenerateTarget === "all" || kotlinGenerateTarget === "post";
        els.kotlinPostBlock.classList.toggle("hidden", !showPost);
    }
    if (save) localStorage.setItem(KOTLIN_TARGET_STORAGE_KEY, kotlinGenerateTarget);
}

function refreshResizableCards() {
    const cards = [
        $("modelShaderCard"),
        $("nodeEditorCard"),
        $("kotlinCard"),
        $("postGraphCard")
    ].filter((el) => el instanceof HTMLElement && !el.classList.contains("hidden"));

    for (const el of cards) el.classList.remove("card-resizable");
    const visible = cards.filter((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
    });
    if (visible.length <= 1) return;
    for (const el of visible) el.classList.add("card-resizable");
}

function clampCardPreviewPos(pos) {
    if (!pos || !els.viewer) return null;
    const rect = els.viewer.getBoundingClientRect();
    const w = Math.max(180, Math.round(rect.width || 420));
    const h = Math.max(120, Math.round(rect.height || 240));
    const pad = 8;
    const x = Math.max(pad, Math.min(Math.round(pos.x), Math.max(pad, window.innerWidth - w - pad)));
    const y = Math.max(pad, Math.min(Math.round(pos.y), Math.max(pad, window.innerHeight - h - pad)));
    return { x, y };
}

function applyCardPreviewPosition() {
    if (!els.viewer) return;

    if (!isFloatingPreviewPage(workspacePage)) {
        els.viewer.style.removeProperty("left");
        els.viewer.style.removeProperty("top");
        els.viewer.style.removeProperty("right");
        els.viewer.style.removeProperty("bottom");
        return;
    }

    const safe = clampCardPreviewPos(cardPreviewPos);
    if (!safe) {
        els.viewer.style.removeProperty("left");
        els.viewer.style.removeProperty("top");
        els.viewer.style.removeProperty("right");
        els.viewer.style.removeProperty("bottom");
        return;
    }

    cardPreviewPos = safe;
    els.viewer.style.left = `${safe.x}px`;
    els.viewer.style.top = `${safe.y}px`;
    els.viewer.style.right = "auto";
    els.viewer.style.bottom = "auto";
}

function applyWorkspacePage(page, { save = true } = {}) {
    workspacePage = normalizeWorkspacePage(page, { allowCard: true });
    document.body.setAttribute("data-workspace-page", workspacePage);
    if (save) {
        const persistedPage = workspacePage === "card" ? "post" : workspacePage;
        localStorage.setItem(PAGE_STORAGE_KEY, persistedPage);
    }

    if (workspacePage === "post" || workspacePage === "card") {
        const state = store.getState();
        if (!findPostNode(state, state.selectedNodeId) && (state.post?.nodes || []).length) {
            store.patch((draft) => {
                ensureSelectedNode(draft);
            }, { reason: "node-select-fallback", skipHistory: true });
        }
    }

    if (els.btnPageModel) {
        els.btnPageModel.classList.toggle("active", workspacePage === "model");
    }
    if (els.btnPagePost) {
        els.btnPagePost.classList.toggle("active", workspacePage === "post" || workspacePage === "card");
    }
    if (els.btnBackToPost) {
        els.btnBackToPost.classList.toggle("hidden", workspacePage !== "card");
    }

    if (els.btnAddPass) {
        els.btnAddPass.disabled = workspacePage !== "post";
    }

    const workspaceTarget = suggestKotlinTargetByWorkspace(workspacePage);
    if (workspaceTarget !== kotlinGenerateTarget) {
        applyKotlinGenerateTarget(workspaceTarget);
    }

    applyCardPreviewPosition();
    refreshResizableCards();
    graphEditor.render();
    requestAnimationFrame(() => graphEditor.render());
}

const settingsSystem = initSettingsSystem({
    store,
    els,
    onOpenHotkeys: () => {
        hotkeySystem?.open();
    },
    onSettingsApplied: (settings) => {
        renderer.applySettings(settings);
        refreshKotlin(false);
        requestRendererSync({ force: false });
    }
});

function toggleSettings() {
    const hidden = !!els.settingsModal?.classList.contains("hidden");
    if (hidden) settingsSystem.show();
    else settingsSystem.hide();
}

function refreshUndoRedoButtons() {
    if (els.btnUndo) els.btnUndo.disabled = !store.canUndo();
    if (els.btnRedo) els.btnRedo.disabled = !store.canRedo();
}

function performUndo() {
    const ok = store.undo({
        reason: "undo",
        forceCompile: true,
        forceCompileNow: true,
        forceKotlin: true
    });
    if (!ok) return false;
    showToast("已撤回", "ok", 1200);
    return true;
}

function performRedo() {
    const ok = store.redo({
        reason: "redo",
        forceCompile: true,
        forceCompileNow: true,
        forceKotlin: true
    });
    if (!ok) return false;
    showToast("已重做", "ok", 1200);
    return true;
}

function addPostNode() {
    store.patch((draft) => {
        const node = createDefaultPostNode((draft.post.nodes || []).length);
        const selected = findPostNode(draft, draft.selectedNodeId);

        if (selected) {
            node.x = Number(selected.x || 220) + 230;
            node.y = Number(selected.y || 80);
        }

        draft.post.nodes.push(node);
        draft.selectedNodeId = node.id;
    }, { reason: "node-add", forceCompile: true, forceKotlin: true });
}

function deleteSelectedNode() {
    if (graphEditor && typeof graphEditor.hasAnySelection === "function" && graphEditor.hasAnySelection()) {
        graphEditor.deleteSelection();
        return;
    }
    const state = store.getState();
    const nodeId = state.selectedNodeId;
    if (!nodeId) return;
    store.patch((draft) => {
        removeNodeAndLinks(draft, nodeId);
        ensureSelectedNode(draft);
    }, { reason: "node-delete", forceCompile: true, forceKotlin: true });
}

function refreshEditorCompletions(state) {
    const modelUniforms = buildUniformCompletions(state?.model?.shader?.params || []);
    const node = findPostNode(state, state.selectedNodeId);
    const nodeUniforms = buildUniformCompletions(node?.params || []);

    const modelCompletions = mergeCompletionGroups(BASE_GLSL_COMPLETIONS, modelUniforms, [
        { label: "vUv", insertText: "vUv", detail: "全局变量：插值 UV", priority: 220 },
        { label: "vNormal", insertText: "vNormal", detail: "全局变量：插值法线", priority: 220 },
        { label: "vWorldPos", insertText: "vWorldPos", detail: "全局变量：插值世界坐标", priority: 220 },
        { label: "position", insertText: "position", detail: "全局变量：顶点属性", priority: 220 },
        { label: "normal", insertText: "normal", detail: "全局变量：顶点属性", priority: 220 },
        { label: "uv", insertText: "uv", detail: "全局变量：顶点属性", priority: 220 }
    ]);

    const postCompletions = mergeCompletionGroups(BASE_GLSL_COMPLETIONS, nodeUniforms, [
        { label: "tDiffuse", insertText: "tDiffuse", detail: "全局变量：后处理输入纹理", priority: 220 },
        { label: "vUv", insertText: "vUv", detail: "全局变量：插值 UV", priority: 220 }
    ]);

    modelVertexEditor.setCompletions(modelCompletions);
    modelFragmentEditor.setCompletions(modelCompletions);
    nodeFragmentEditor.setCompletions(postCompletions);
}

function renderTextureList(state) {
    const host = els.textureList;
    if (!host) return;
    host.innerHTML = "";

    const textures = Array.isArray(state?.textures) ? state.textures : [];
    if (!textures.length) {
        const empty = document.createElement("div");
        empty.className = "hint";
        empty.style.padding = "10px";
        empty.textContent = "暂无纹理，可上传 PNG/JPG 后在参数中引用。";
        host.appendChild(empty);
        return;
    }

    for (const tex of textures) {
        const row = document.createElement("div");
        row.className = "list-item";

        const meta = document.createElement("div");
        meta.className = "meta";

        const inpName = document.createElement("input");
        inpName.className = "input";
        inpName.value = String(tex.name || "");
        inpName.placeholder = "纹理名称";
        inpName.addEventListener("change", () => {
            const nextName = String(inpName.value || "").trim() || `texture_${tex.id}`;
            store.patch((draft) => {
                const target = (draft.textures || []).find((t) => t.id === tex.id);
                if (!target) return;
                target.name = nextName;
            }, { reason: "texture-rename", forceKotlin: true });
        });

        const idHint = document.createElement("div");
        idHint.className = "hint";
        idHint.textContent = `编号: ${tex.id}`;

        meta.appendChild(inpName);
        meta.appendChild(idHint);

        const actions = document.createElement("div");
        actions.className = "field-inline";

        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "btn small danger";
        btnDel.textContent = "删除";
        btnDel.addEventListener("click", () => {
            store.patch((draft) => {
                draft.textures = (draft.textures || []).filter((t) => t.id !== tex.id);
                const clearRef = (params) => {
                    for (const p of params || []) {
                        if (p?.type === "texture" && p?.textureId === tex.id) p.textureId = "";
                    }
                };
                clearRef(draft.model?.shader?.params);
                for (const n of draft.post?.nodes || []) clearRef(n.params);
            }, { reason: "texture-delete", forceCompile: true, forceKotlin: true });
        });

        actions.appendChild(btnDel);
        row.appendChild(meta);
        row.appendChild(actions);
        host.appendChild(row);
    }
}

function createTypeSelect(current) {
    const sel = document.createElement("select");
    sel.className = "input";
    const options = ["float", "int", "bool", "vec2", "vec3", "texture"];
    for (const t of options) {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if (t === current) opt.selected = true;
        sel.appendChild(opt);
    }
    return sel;
}

function createSourceSelect(current) {
    const sel = document.createElement("select");
    sel.className = "input";
    const options = [
        { value: "value", label: "数值" },
        { value: "upload", label: "上传纹理" },
        { value: "connection", label: "纹理连接" }
    ];
    for (const item of options) {
        const opt = document.createElement("option");
        opt.value = item.value;
        opt.textContent = item.label;
        if (item.value === current) opt.selected = true;
        sel.appendChild(opt);
    }
    return sel;
}

function createValueSourceSelect(current) {
    const sel = document.createElement("select");
    sel.className = "input";
    const options = [
        { value: "value", label: "常量" },
        { value: "uniform", label: "变量" }
    ];
    for (const item of options) {
        const opt = document.createElement("option");
        opt.value = item.value;
        opt.textContent = item.label;
        if (item.value === current) opt.selected = true;
        sel.appendChild(opt);
    }
    return sel;
}

const UNIFORM_EXPR_PRESETS = [
    "uTime",
    "tickDelta",
    "partialTicks",
    "uResolution",
    "uMouse",
    "Math.sin(uTime)",
    "Math.cos(uTime)",
    "org.joml.Vector2f(uTime, uTime)",
    "org.joml.Vector3f(1f, 1f, 1f)"
];
const UNIFORM_SYMBOL_PRESETS = new Set([
    "uTime",
    "tickDelta",
    "partialTicks",
    "uResolution",
    "uMouse"
]);

let uniformExprDatalistReady = false;
let uniformValueDatalistReady = false;

function ensureUniformExprDatalist() {
    const id = "sb_uniform_expr_suggestions";
    if (uniformExprDatalistReady && document.getElementById(id)) return id;
    let list = document.getElementById(id);
    if (!(list instanceof HTMLDataListElement)) {
        list = document.createElement("datalist");
        list.id = id;
        document.body.appendChild(list);
    }
    list.innerHTML = "";
    for (const expr of UNIFORM_EXPR_PRESETS) {
        const opt = document.createElement("option");
        opt.value = expr;
        list.appendChild(opt);
    }
    uniformExprDatalistReady = true;
    return id;
}

function ensureUniformValueDatalist() {
    const id = "sb_uniform_value_suggestions";
    if (uniformValueDatalistReady && document.getElementById(id)) return id;
    let list = document.getElementById(id);
    if (!(list instanceof HTMLDataListElement)) {
        list = document.createElement("datalist");
        list.id = id;
        document.body.appendChild(list);
    }
    list.innerHTML = "";
    for (const expr of UNIFORM_SYMBOL_PRESETS) {
        const opt = document.createElement("option");
        opt.value = expr;
        list.appendChild(opt);
    }
    uniformValueDatalistReady = true;
    return id;
}

function defaultUniformExprByType(type) {
    const t = String(type || "float").toLowerCase();
    if (t === "vec2") return "org.joml.Vector2f(uTime, uTime)";
    if (t === "vec3") return "org.joml.Vector3f(1f, 1f, 1f)";
    if (t === "int") return "0";
    if (t === "bool") return "true";
    return "uTime";
}

function shouldTreatAsUniformExpr(raw, type) {
    const value = String(raw || "").trim();
    if (!value) return false;
    if (UNIFORM_SYMBOL_PRESETS.has(value)) return true;
    if (String(type || "").toLowerCase() === "bool" && /^(true|false)$/i.test(value)) return false;
    if (/^[+\-]?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?$/.test(value)) return false;
    return /[A-Za-z_]/.test(value);
}

function renderParamList({ container, params, textures, step, onPatch, onDelete }) {
    if (!container) return;
    container.innerHTML = "";

    const normalizeParamType = (raw) => String(raw || "float").toLowerCase();
    const placeholderForType = (type) => {
        const t = normalizeParamType(type);
        if (t === "vec3") return "x,y,z";
        if (t === "vec2") return "x,y";
        if (t === "bool") return "true/false";
        if (t === "texture") return "采样槽位";
        return `步长 ${step}`;
    };

    for (let i = 0; i < params.length; i++) {
        const p = params[i] || {};
        const type = normalizeParamType(p.type);
        const isTextureType = type === "texture";

        const item = document.createElement("div");
        item.className = "param-item";

        const rowMain = document.createElement("div");
        rowMain.className = "param-row";

        const inpName = document.createElement("input");
        inpName.className = "input";
        inpName.placeholder = "参数名";
        inpName.value = String(p.name || "");

        const selType = createTypeSelect(type);

        const btnDelete = document.createElement("button");
        btnDelete.type = "button";
        btnDelete.className = "btn small danger";
        btnDelete.textContent = "删";

        rowMain.appendChild(inpName);
        rowMain.appendChild(selType);

        if (isTextureType) {
            rowMain.style.gridTemplateColumns = "1fr 1fr auto";
            rowMain.appendChild(btnDelete);
            item.appendChild(rowMain);

            const rowTex = document.createElement("div");
            rowTex.className = "param-row";
            rowTex.style.gridTemplateColumns = "1fr 2fr";

            const selSource = createSourceSelect(String(p.sourceType || "value"));
            const sourceInputHost = document.createElement("div");
            sourceInputHost.style.display = "grid";
            sourceInputHost.style.gridTemplateColumns = "1fr";

            const inpSlot = document.createElement("input");
            inpSlot.className = "input";
            inpSlot.placeholder = "采样槽位";
            inpSlot.value = String(p.value ?? "0");

            const selTexture = document.createElement("select");
            selTexture.className = "input";
            const noneOpt = document.createElement("option");
            noneOpt.value = "";
            noneOpt.textContent = "选择纹理";
            selTexture.appendChild(noneOpt);
            for (const tex of textures) {
                const opt = document.createElement("option");
                opt.value = tex.id;
                opt.textContent = `${tex.name} (${tex.id})`;
                if (tex.id === p.textureId) opt.selected = true;
                selTexture.appendChild(opt);
            }

            const inpConn = document.createElement("input");
            inpConn.className = "input";
            inpConn.placeholder = "连接来源，例如 bloom:0";
            inpConn.value = String(p.connection || "");

            const updateTextureVis = () => {
                const sourceType = String(selSource.value || "value");
                inpSlot.classList.toggle("hidden", sourceType !== "value");
                selTexture.classList.toggle("hidden", sourceType !== "upload");
                inpConn.classList.toggle("hidden", sourceType !== "connection");
            };
            updateTextureVis();

            sourceInputHost.appendChild(inpSlot);
            sourceInputHost.appendChild(selTexture);
            sourceInputHost.appendChild(inpConn);
            rowTex.appendChild(selSource);
            rowTex.appendChild(sourceInputHost);
            item.appendChild(rowTex);

            selSource.addEventListener("change", () => {
                updateTextureVis();
                onPatch(i, (param) => {
                    const sourceType = String(selSource.value || "value");
                    param.sourceType = sourceType;
                    if (sourceType === "value") {
                        param.textureId = "";
                        param.connection = "";
                    } else if (sourceType === "upload") {
                        param.connection = "";
                    } else if (sourceType === "connection") {
                        param.textureId = "";
                    }
                });
            });

            inpSlot.addEventListener("change", () => {
                onPatch(i, (param) => {
                    const next = String(inpSlot.value || "").trim();
                    param.value = next || "0";
                });
            });

            selTexture.addEventListener("change", () => {
                onPatch(i, (param) => {
                    param.textureId = selTexture.value;
                });
            });

            inpConn.addEventListener("change", () => {
                onPatch(i, (param) => {
                    param.connection = inpConn.value.trim();
                });
            });
        } else {
            const inpValue = document.createElement("input");
            inpValue.className = "input";
            inpValue.value = String(p.value ?? "");
            inpValue.setAttribute("list", ensureUniformValueDatalist());
            inpValue.placeholder = placeholderForType(type);

            rowMain.appendChild(inpValue);
            rowMain.appendChild(btnDelete);
            item.appendChild(rowMain);

            const rowValueSource = document.createElement("div");
            rowValueSource.className = "param-row";
            rowValueSource.style.gridTemplateColumns = "1fr 2fr";

            const selValueSource = createValueSourceSelect(String(p.valueSource || "value"));
            const inpExpr = document.createElement("input");
            inpExpr.className = "input";
            inpExpr.placeholder = `变量表达式，例如 ${defaultUniformExprByType(type)}`;
            inpExpr.value = String(p.valueExpr || "");
            inpExpr.setAttribute("list", ensureUniformExprDatalist());

            const updateMode = () => {
                const useExpr = selValueSource.value === "uniform";
                rowMain.style.gridTemplateColumns = useExpr ? "1fr 1fr auto" : "1fr 1fr 1fr auto";
                rowValueSource.style.gridTemplateColumns = useExpr ? "1fr 2fr" : "1fr";
                inpValue.classList.toggle("hidden", useExpr);
                inpExpr.classList.toggle("hidden", !useExpr);
                inpExpr.disabled = !useExpr;
                inpValue.disabled = useExpr;
                if (useExpr && !inpExpr.value.trim()) inpExpr.value = defaultUniformExprByType(type);
            };
            updateMode();

            rowValueSource.appendChild(selValueSource);
            rowValueSource.appendChild(inpExpr);
            item.appendChild(rowValueSource);

            selValueSource.addEventListener("change", () => {
                updateMode();
                onPatch(i, (param) => {
                    param.valueSource = selValueSource.value;
                    if (param.valueSource === "uniform" && !String(param.valueExpr || "").trim()) {
                        param.valueExpr = defaultUniformExprByType(type);
                    }
                });
            });

            inpExpr.addEventListener("change", () => {
                onPatch(i, (param) => {
                    param.valueExpr = inpExpr.value.trim();
                });
            });

            inpValue.addEventListener("change", () => {
                onPatch(i, (param) => {
                    const next = inpValue.value.trim();
                    param.value = next;
                    if (shouldTreatAsUniformExpr(next, param.type)) {
                        param.valueSource = "uniform";
                        param.valueExpr = next;
                    }
                });
            });
        }

        inpName.addEventListener("change", () => {
            onPatch(i, (param) => {
                param.name = inpName.value.trim();
            });
        });

        selType.addEventListener("change", () => {
            onPatch(i, (param) => {
                const nextType = normalizeParamType(selType.value);
                param.type = nextType;
                if (nextType !== "texture") {
                    param.sourceType = "value";
                    param.textureId = "";
                    param.connection = "";
                    param.valueSource = param.valueSource || "value";
                    if (param.valueSource === "uniform" && !String(param.valueExpr || "").trim()) {
                        param.valueExpr = defaultUniformExprByType(nextType);
                    } else {
                        param.valueExpr = String(param.valueExpr || "");
                    }
                } else {
                    param.sourceType = param.sourceType || "value";
                    param.valueSource = "value";
                    param.valueExpr = "";
                    if (!String(param.value || "").trim()) param.value = "0";
                }
            });
        });

        btnDelete.addEventListener("click", () => onDelete(i));

        container.appendChild(item);
    }
}

function renderModelParamList(state) {
    renderParamList({
        container: els.modelParamList,
        params: state.model?.shader?.params || [],
        textures: state.textures || [],
        step: state.settings?.paramStep || 0.1,
        onPatch(index, mutator) {
            store.patch((draft) => {
                const p = draft.model?.shader?.params?.[index];
                if (!p) return;
                mutator(p);
                syncModelShaderUniformDecls(draft);
            }, { reason: "model-param-change", forceCompile: true, forceKotlin: true });
        },
        onDelete(index) {
            store.patch((draft) => {
                draft.model.shader.params.splice(index, 1);
                syncModelShaderUniformDecls(draft);
            }, { reason: "model-param-delete", forceCompile: true, forceKotlin: true });
        }
    });
}

function renderNodeParamList(state, node) {
    renderParamList({
        container: els.nodeParamList,
        params: node?.params || [],
        textures: state.textures || [],
        step: state.settings?.paramStep || 0.1,
        onPatch(index, mutator) {
            store.patch((draft) => {
                const n = findPostNode(draft, draft.selectedNodeId);
                if (!n || !Array.isArray(n.params)) return;
                const p = n.params[index];
                if (!p) return;
                mutator(p);
                syncNodeShaderUniformDecls(n);
            }, { reason: "node-param-change", forceCompile: true, forceKotlin: true });
        },
        onDelete(index) {
            store.patch((draft) => {
                const n = findPostNode(draft, draft.selectedNodeId);
                if (!n) return;
                n.params.splice(index, 1);
                syncNodeShaderUniformDecls(n);
            }, { reason: "node-param-delete", forceCompile: true, forceKotlin: true });
        }
    });
}

function refreshNodeEditorPanel(state) {
    const node = findPostNode(state, state.selectedNodeId);

    if (!node) {
        if (els.nodeEditorEmpty) {
            els.nodeEditorEmpty.innerHTML = "";

            const info = document.createElement("div");
            info.textContent = "当前没有可编辑的后处理卡片，请先在左侧添加一个卡片。";

            const quickAdd = document.createElement("button");
            quickAdd.type = "button";
            quickAdd.className = "btn small";
            quickAdd.style.marginTop = "8px";
            quickAdd.textContent = "创建后处理卡片";
            quickAdd.addEventListener("click", () => addPostNode());

            els.nodeEditorEmpty.appendChild(info);
            els.nodeEditorEmpty.appendChild(quickAdd);
        }
        els.nodeEditorEmpty?.classList.remove("hidden");
        els.nodeEditor?.classList.add("hidden");
        nodeFragmentEditor.setValue("", { silent: true });
        return;
    }

    if (els.nodeEditorEmpty && !els.nodeEditorEmpty.dataset.defaultText) {
        els.nodeEditorEmpty.dataset.defaultText = "在左侧后处理图中选择一个卡片进行编辑。";
    }
    if (els.nodeEditorEmpty?.dataset.defaultText) {
        els.nodeEditorEmpty.textContent = els.nodeEditorEmpty.dataset.defaultText;
    }

    els.nodeEditorEmpty?.classList.add("hidden");
    els.nodeEditor?.classList.remove("hidden");

    setInputValue(els.inpNodeName, node.name || "");
    setInputValue(els.inpNodeFragmentPath, node.fragmentPath || "");
    setInputValue(els.inpNodeInputs, normalizeNodeNumber(node.inputs, 1, 1, 8));
    setInputValue(els.inpNodeOutputs, normalizeNodeNumber(node.outputs, 1, 1, 8));
    setInputValue(els.inpNodeTextureUnit, Number(node.textureUnit || 1));
    setInputValue(els.inpNodeIterations, Number(node.iterations || 1));

    if (els.selNodeType && els.selNodeType.value !== String(node.type || "simple")) {
        els.selNodeType.value = String(node.type || "simple");
    }
    if (els.selNodeFilter && els.selNodeFilter.value !== String(node.filter || "GL33.GL_LINEAR")) {
        els.selNodeFilter.value = String(node.filter || "GL33.GL_LINEAR");
    }
    setChecked(els.chkNodeMipmap, !!node.useMipmap);

    nodeFragmentEditor.setValue(String(node.fragmentSource || ""), { silent: true });

    renderNodeParamList(state, node);
}

function refreshModelEditorPanel(state) {
    setInputValue(els.inpModelVertexPath, state.model?.shader?.vertexPath || "");
    setInputValue(els.inpModelFragmentPath, state.model?.shader?.fragmentPath || "");
    modelVertexEditor.setValue(String(state.model?.shader?.vertexSource || ""), { silent: true });
    modelFragmentEditor.setValue(String(state.model?.shader?.fragmentSource || ""), { silent: true });
    renderModelParamList(state);
}

function refreshTopPanel(state) {
    setInputValue(els.inpProjectName, state.projectName || "shader-workbench");
    if (els.selPrimitive && els.selPrimitive.value !== String(state.model?.primitive || "sphere")) {
        els.selPrimitive.value = String(state.model?.primitive || "sphere");
    }
    setChecked(els.chkEnablePost, !!state.model?.enablePost);

    if (els.modelFileName) {
        if (hasCustomModelLoaded && state.model?.uploadedModelName) {
            els.modelFileName.textContent = `当前模型：${state.model.uploadedModelName}`;
        } else if (state.model?.uploadedModelName) {
            els.modelFileName.textContent = `模型记录：${state.model.uploadedModelName}（刷新后需重新上传）`;
        } else {
            els.modelFileName.textContent = "当前模型：默认球体";
        }
    }
}

function refreshKotlin(force, target = "all") {
    const state = store.getState();
    if (!force && !state.settings?.realtimeCode) return;
    const safeTarget = normalizeKotlinGenerateTarget(target);
    if (safeTarget === "all" || safeTarget === "model") {
        modelKotlinCache = generateModelKotlin(state);
        if (els.modelKotlinOut) els.modelKotlinOut.innerHTML = highlightKotlin(modelKotlinCache);
    }
    if (safeTarget === "all" || safeTarget === "post") {
        postKotlinCache = generatePostKotlin(state);
        if (els.postKotlinOut) els.postKotlinOut.innerHTML = highlightKotlin(postKotlinCache);
    }
}

function applyKotlinCollapsedState() {
    if (els.kotlinBody) els.kotlinBody.classList.toggle("hidden", kotlinCollapsed);
    if (els.btnToggleKotlin) els.btnToggleKotlin.textContent = kotlinCollapsed ? "显示" : "隐藏";
}

function generateKotlinNow(target = kotlinGenerateTarget) {
    const safeTarget = normalizeKotlinGenerateTarget(target);
    refreshKotlin(true, safeTarget);
    if (safeTarget === "model") {
        showToast("模型 Kotlin 已重新生成", "ok");
    } else if (safeTarget === "post") {
        showToast("后处理 Kotlin 已重新生成", "ok");
    } else {
        showToast("模型 + 后处理 Kotlin 已重新生成", "ok");
    }
}

function syncRendererNow() {
    try {
        renderer.syncFromState(store.getState());
    } catch (err) {
        console.error(err);
        setStatus({ shader: "着色器：编译错误" });
        showToast(`渲染更新失败: ${err?.message || err}`, "err", 3400);
    }
}

syncRendererDebounced = debounce(syncRendererNow, 120);

function requestRendererSync({ force = false, now = false } = {}) {
    const state = store.getState();
    if (!force && !state.settings?.realtimeCompile) return;
    if (now || force) {
        syncRendererNow();
    } else {
        syncRendererDebounced();
    }
}

const saveProjectDebounced = debounce(() => {
    const payload = normalizeProjectPayload(store.getState());
    saveJson(STORAGE_KEYS.project, payload);
}, 180);

function applyStateToUI(state, meta = {}) {
    refreshTopPanel(state);

    if (!meta.silentUI) {
        refreshModelEditorPanel(state);
        refreshNodeEditorPanel(state);
        refreshEditorCompletions(state);
        renderTextureList(state);
        graphEditor.render();
    }

    refreshKotlin(!!meta.forceKotlin);
    refreshUndoRedoButtons();
}

store.subscribe((state, meta = {}) => {
    applyStateToUI(state, meta);
    saveProjectDebounced();
    requestRendererSync({ force: !!meta.forceCompile, now: !!meta.forceCompileNow });
});

function bindProjectEvents() {
    els.btnExportAll?.addEventListener("click", async () => {
        try {
            await exportAllBundle();
            showToast("一键导出完成", "ok");
        } catch (err) {
            console.error(err);
            showToast(`一键导出失败: ${err?.message || err}`, "err");
        }
    });

    els.inpProjectName?.addEventListener("change", () => {
        const value = sanitizeProjectName(els.inpProjectName.value);
        store.patch((draft) => {
            draft.projectName = value;
        }, { reason: "project-name" });
    });

    els.btnExportProject?.addEventListener("click", () => {
        exportProjectJson(store.getState());
    });

    els.btnImportProject?.addEventListener("click", () => {
        els.fileProject?.click();
    });

    els.fileProject?.addEventListener("change", async () => {
        const file = els.fileProject.files?.[0];
        els.fileProject.value = "";
        if (!file) return;
        try {
            const payload = await importProjectFromFile(file);
            hasCustomModelLoaded = false;
            renderer.setPrimitive(payload.model?.primitive || "sphere");
            store.reset(payload, { reason: "project-import", forceCompile: true, forceCompileNow: true, forceKotlin: true, clearHistory: true });
            settingsSystem.applySettings(payload.settings || {});
            showToast("项目已导入", "ok");
        } catch (err) {
            console.error(err);
            showToast(`导入失败: ${err?.message || err}`, "err", 3400);
        }
    });

    els.btnResetProject?.addEventListener("click", () => {
        const ok = confirm("确认重置当前项目？未导出的改动会丢失。");
        if (!ok) return;
        const next = createDefaultState();
        hasCustomModelLoaded = false;
        renderer.setPrimitive(next.model.primitive);
        store.reset(next, { reason: "project-reset", forceCompile: true, forceCompileNow: true, forceKotlin: true, clearHistory: true });
        settingsSystem.applySettings(next.settings || {});
        showToast("已重置项目", "ok");
    });
}

function bindModelEvents() {
    els.selPrimitive?.addEventListener("change", () => {
        const primitive = String(els.selPrimitive.value || "sphere");
        hasCustomModelLoaded = false;
        renderer.setPrimitive(primitive);
        store.patch((draft) => {
            draft.model.primitive = primitive;
            draft.model.uploadedModelName = "";
        }, { reason: "model-primitive", forceCompile: true, forceCompileNow: true, forceKotlin: true });
    });

    els.chkEnablePost?.addEventListener("change", () => {
        const enabled = !!els.chkEnablePost.checked;
        store.patch((draft) => {
            draft.model.enablePost = enabled;
        }, { reason: "model-enable-post", forceCompile: true, forceCompileNow: true, forceKotlin: true });
    });

    els.btnUploadModel?.addEventListener("click", () => {
        els.fileModel?.click();
    });

    els.fileModel?.addEventListener("change", async () => {
        const file = els.fileModel.files?.[0];
        els.fileModel.value = "";
        if (!file) return;
        try {
            const name = await renderer.loadModelFile(file);
            hasCustomModelLoaded = true;
            store.patch((draft) => {
                draft.model.uploadedModelName = name;
            }, { reason: "model-upload", forceCompile: true, forceCompileNow: true, forceKotlin: true });
            showToast(`模型已加载 ${name}`, "ok");
        } catch (err) {
            console.error(err);
            showToast(`模型加载失败: ${err?.message || err}`, "err", 3500);
        }
    });

    els.inpModelVertexPath?.addEventListener("change", () => {
        store.patch((draft) => {
            draft.model.shader.vertexPath = String(els.inpModelVertexPath.value || "").trim();
        }, { reason: "model-vertex-path", forceKotlin: true });
    });

    els.inpModelFragmentPath?.addEventListener("change", () => {
        store.patch((draft) => {
            draft.model.shader.fragmentPath = String(els.inpModelFragmentPath.value || "").trim();
        }, { reason: "model-fragment-path", forceKotlin: true });
    });

    els.btnUploadModelVertex?.addEventListener("click", () => {
        els.fileModelVertex?.click();
    });

    els.btnUploadModelFragment?.addEventListener("click", () => {
        els.fileModelFragment?.click();
    });

    els.fileModelVertex?.addEventListener("change", async () => {
        const file = els.fileModelVertex.files?.[0];
        els.fileModelVertex.value = "";
        if (!file) return;
        const source = await file.text();
        const guessedPath = file.name.endsWith(".vsh") ? file.name : `${file.name}.vsh`;
        store.patch((draft) => {
            draft.model.shader.vertexSource = source;
            if (!draft.model.shader.vertexPath) draft.model.shader.vertexPath = guessedPath;
        }, { reason: "model-vertex-upload", forceCompile: true, forceCompileNow: true, forceKotlin: true });
        showToast("顶点着色器已导入", "ok");
    });

    els.fileModelFragment?.addEventListener("change", async () => {
        const file = els.fileModelFragment.files?.[0];
        els.fileModelFragment.value = "";
        if (!file) return;
        const source = await file.text();
        const guessedPath = file.name.endsWith(".fsh") ? file.name : `${file.name}.fsh`;
        store.patch((draft) => {
            draft.model.shader.fragmentSource = source;
            if (!draft.model.shader.fragmentPath) draft.model.shader.fragmentPath = guessedPath;
        }, { reason: "model-fragment-upload", forceCompile: true, forceCompileNow: true, forceKotlin: true });
        showToast("片元着色器已导入", "ok");
    });

    els.btnAddModelParam?.addEventListener("click", () => {
        store.patch((draft) => {
            const p = createParamTemplate();
            p.name = `uParam${(draft.model.shader.params.length || 0) + 1}`;
            draft.model.shader.params.push(p);
            syncModelShaderUniformDecls(draft);
        }, { reason: "model-param-add", forceCompile: true, forceKotlin: true });
    });

    els.btnApplyModelShader?.addEventListener("click", () => {
        store.patch((draft) => {
            syncModelShaderUniformDecls(draft);
        }, { reason: "model-uniform-sync", skipHistory: true, forceCompile: true, forceKotlin: true });
        requestRendererSync({ force: true, now: true });
        showToast("模型着色器已应用", "ok");
    });

    els.btnExportModelVertex?.addEventListener("click", () => {
        const state = store.getState();
        const name = fileNameFromPath(state.model.shader.vertexPath, "model.vsh");
        downloadText(name, String(state.model.shader.vertexSource || ""));
    });

    els.btnExportModelFragment?.addEventListener("click", () => {
        const state = store.getState();
        const name = fileNameFromPath(state.model.shader.fragmentPath, "model.fsh");
        downloadText(name, String(state.model.shader.fragmentSource || ""));
    });
}

function bindTextureEvents() {
    els.btnUploadTexture?.addEventListener("click", () => {
        els.fileTexture?.click();
    });

    els.fileTexture?.addEventListener("change", async () => {
        const file = els.fileTexture.files?.[0];
        els.fileTexture.value = "";
        if (!file) return;
        try {
            const dataUrl = await readFileAsDataURL(file);
            store.patch((draft) => {
                draft.textures.push({
                    id: uid("tex"),
                    name: file.name,
                    dataUrl
                });
            }, { reason: "texture-upload", forceCompile: true, forceKotlin: true });
            showToast(`纹理已导入 ${file.name}`, "ok");
        } catch (err) {
            console.error(err);
            showToast(`纹理导入失败: ${err?.message || err}`, "err");
        }
    });
}

function bindNodeEvents() {
    const patchSelectedNode = (mutator, meta = {}) => {
        store.patch((draft) => {
            const node = findPostNode(draft, draft.selectedNodeId);
            if (!node) return;
            mutator(node, draft);
        }, meta);
    };

    els.inpNodeName?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            const prevName = String(node.name || "");
            const nextName = String(els.inpNodeName.value || "").trim() || prevName || "Pass";
            node.name = nextName;
            if (node.fragmentPathTemplate) {
                node.fragmentPath = resolveNodeFragmentPath(nextName, node.fragmentPathTemplate);
            }
        }, { reason: "node-name", forceKotlin: true });
    });

    els.selNodeType?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            node.type = String(els.selNodeType.value || "simple");
        }, { reason: "node-type", forceCompile: true, forceKotlin: true });
    });

    els.inpNodeFragmentPath?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            const resolved = resolveNodePathByInput(els.inpNodeFragmentPath.value, node.name || "Pass");
            node.fragmentPathTemplate = resolved.fragmentPathTemplate;
            node.fragmentPath = resolved.fragmentPath;
        }, { reason: "node-fragment-path", forceKotlin: true });
    });

    els.inpNodeInputs?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            node.inputs = normalizeNodeNumber(els.inpNodeInputs.value, 1, 1, 8);
        }, { reason: "node-inputs", forceCompile: true, forceKotlin: true });
    });

    els.inpNodeOutputs?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            node.outputs = normalizeNodeNumber(els.inpNodeOutputs.value, 1, 1, 8);
        }, { reason: "node-outputs", forceCompile: true, forceKotlin: true });
    });

    els.inpNodeTextureUnit?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            node.textureUnit = Math.max(0, Number(els.inpNodeTextureUnit.value || 0));
        }, { reason: "node-tex-unit", forceCompile: true, forceKotlin: true });
    });

    els.selNodeFilter?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            node.filter = String(els.selNodeFilter.value || "GL33.GL_LINEAR");
        }, { reason: "node-filter", forceCompile: true, forceKotlin: true });
    });

    els.inpNodeIterations?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            node.iterations = Math.max(1, Math.round(Number(els.inpNodeIterations.value || 1)));
        }, { reason: "node-iterations", forceCompile: true, forceKotlin: true });
    });

    els.chkNodeMipmap?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            node.useMipmap = !!els.chkNodeMipmap.checked;
        }, { reason: "node-mipmap", forceCompile: true, forceKotlin: true });
    });

    els.btnUploadNodeFragment?.addEventListener("click", () => {
        els.fileNodeFragment?.click();
    });

    els.fileNodeFragment?.addEventListener("change", async () => {
        const file = els.fileNodeFragment.files?.[0];
        els.fileNodeFragment.value = "";
        if (!file) return;
        const text = await file.text();
        patchSelectedNode((node) => {
            node.fragmentSource = text;
            if (!node.fragmentPath) {
                const resolved = resolveNodePathByInput(file.name, node.name || "Pass");
                node.fragmentPathTemplate = resolved.fragmentPathTemplate;
                node.fragmentPath = resolved.fragmentPath;
            }
        }, { reason: "node-fragment-upload", forceCompile: true, forceCompileNow: true, forceKotlin: true });
        showToast("卡片片元已导入", "ok");
    });

    els.btnAddNodeParam?.addEventListener("click", () => {
        patchSelectedNode((node) => {
            const p = createParamTemplate();
            p.name = `uParam${(node.params.length || 0) + 1}`;
            node.params.push(p);
            syncNodeShaderUniformDecls(node);
        }, { reason: "node-param-add", forceCompile: true, forceKotlin: true });
    });

    els.btnApplyNodeShader?.addEventListener("click", () => {
        patchSelectedNode((node) => {
            syncNodeShaderUniformDecls(node);
        }, { reason: "node-uniform-sync", skipHistory: true, forceCompile: true, forceKotlin: true });
        requestRendererSync({ force: true, now: true });
        showToast("后处理卡片已应用", "ok");
    });

    els.btnExportNodeFragment?.addEventListener("click", () => {
        const state = store.getState();
        const node = findPostNode(state, state.selectedNodeId);
        if (!node) return;
        const name = fileNameFromPath(node.fragmentPath, `${node.name || "post"}.fsh`);
        downloadText(name, String(node.fragmentSource || ""));
    });

    els.btnDeleteNode?.addEventListener("click", () => {
        deleteSelectedNode();
    });
}

function bindPipelineEvents() {
    els.btnAddPass?.addEventListener("click", () => {
        addPostNode();
    });

    els.btnAutoLayout?.addEventListener("click", () => {
        graphEditor.autoLayout();
        showToast("已自动布局", "ok");
    });

    els.btnClearLinks?.addEventListener("click", () => {
        store.patch((draft) => {
            draft.post.links = [];
        }, { reason: "clear-links", forceCompile: true, forceKotlin: true });
        showToast("已清空连线", "ok");
    });

}

function bindKotlinEvents() {
    const copyText = async (text, okText) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast(okText, "ok");
        } catch {
            showToast("复制失败，请手动复制", "err");
        }
    };

    applyKotlinCollapsedState();
    applyKotlinGenerateTarget(kotlinGenerateTarget, { save: false });

    els.btnGenTargetModel?.addEventListener("click", () => applyKotlinGenerateTarget("model"));
    els.btnGenTargetPost?.addEventListener("click", () => applyKotlinGenerateTarget("post"));
    els.btnGenTargetAll?.addEventListener("click", () => applyKotlinGenerateTarget("all"));

    els.btnGenerate?.addEventListener("click", () => {
        generateKotlinNow(kotlinGenerateTarget);
    });

    els.btnCopyModelKotlin?.addEventListener("click", () => {
        const text = generateModelKotlin(store.getState());
        modelKotlinCache = text;
        if (els.modelKotlinOut) els.modelKotlinOut.innerHTML = highlightKotlin(text);
        copyText(text, "模型 Kotlin 已复制");
    });

    els.btnCopyPostKotlin?.addEventListener("click", () => {
        const text = generatePostKotlin(store.getState());
        postKotlinCache = text;
        if (els.postKotlinOut) els.postKotlinOut.innerHTML = highlightKotlin(text);
        copyText(text, "后处理 Kotlin 已复制");
    });

    els.btnDownloadModelKotlin?.addEventListener("click", () => {
        const state = store.getState();
        const text = generateModelKotlin(state);
        modelKotlinCache = text;
        if (els.modelKotlinOut) els.modelKotlinOut.innerHTML = highlightKotlin(text);
        const file = `${sanitizeProjectName(state.projectName || "shader-workbench")}_model_kotlin.txt`;
        downloadText(file, text);
    });

    els.btnDownloadPostKotlin?.addEventListener("click", () => {
        const state = store.getState();
        const text = generatePostKotlin(state);
        postKotlinCache = text;
        if (els.postKotlinOut) els.postKotlinOut.innerHTML = highlightKotlin(text);
        const file = `${sanitizeProjectName(state.projectName || "shader-workbench")}_post_kotlin.txt`;
        downloadText(file, text);
    });

    els.btnToggleKotlin?.addEventListener("click", () => {
        kotlinCollapsed = !kotlinCollapsed;
        applyKotlinCollapsedState();
    });
}

function bindPreviewEvents() {
    els.btnFullscreen?.addEventListener("click", () => {
        renderer.toggleFullscreen();
    });

    els.btnResetCamera?.addEventListener("click", () => {
        renderer.resetCamera();
    });
}

function bindCardPreviewDrag() {
    if (!els.viewer || !els.viewerHud) return;

    let dragState = null;

    const beginDrag = (ev) => {
        if (!(ev instanceof PointerEvent)) return;
        if (ev.button !== 0) return;
        if (!isFloatingPreviewPage(workspacePage)) return;
        const target = ev.target;
        if (target instanceof HTMLElement && target.closest("button, input, select, textarea, a")) return;

        const rect = els.viewer.getBoundingClientRect();
        const initial = clampCardPreviewPos(cardPreviewPos) || {
            x: Math.round(rect.left),
            y: Math.round(rect.top)
        };

        cardPreviewPos = initial;
        els.viewer.style.left = `${initial.x}px`;
        els.viewer.style.top = `${initial.y}px`;
        els.viewer.style.right = "auto";
        els.viewer.style.bottom = "auto";

        dragState = {
            offsetX: ev.clientX - rect.left,
            offsetY: ev.clientY - rect.top
        };
        document.body.classList.add("card-preview-dragging");
        ev.preventDefault();
    };

    const onMove = (ev) => {
        if (!dragState || !isFloatingPreviewPage(workspacePage)) return;
        const next = clampCardPreviewPos({
            x: ev.clientX - dragState.offsetX,
            y: ev.clientY - dragState.offsetY
        });
        if (!next) return;
        cardPreviewPos = next;
        els.viewer.style.left = `${next.x}px`;
        els.viewer.style.top = `${next.y}px`;
        els.viewer.style.right = "auto";
        els.viewer.style.bottom = "auto";
    };

    const endDrag = () => {
        if (!dragState) return;
        dragState = null;
        document.body.classList.remove("card-preview-dragging");
        if (cardPreviewPos) saveJson(CARD_PREVIEW_POS_KEY, cardPreviewPos);
    };

    els.viewerHud.addEventListener("pointerdown", beginDrag);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("resize", () => {
        if (!isFloatingPreviewPage(workspacePage)) return;
        const next = clampCardPreviewPos(cardPreviewPos);
        if (!next) return;
        cardPreviewPos = next;
        applyCardPreviewPosition();
        saveJson(CARD_PREVIEW_POS_KEY, cardPreviewPos);
    });
}

function bindSettingsImportExport() {
    settingsSystem.exportSettingsButton?.addEventListener("click", () => {
        exportSettingsJson(store.getState().settings, hotkeySystem?.getHotkeys() || null);
    });

    settingsSystem.importSettingsButton?.addEventListener("click", () => {
        settingsSystem.importSettingsFileInput?.click();
    });

    settingsSystem.importSettingsFileInput?.addEventListener("change", async () => {
        const file = settingsSystem.importSettingsFileInput.files?.[0];
        settingsSystem.importSettingsFileInput.value = "";
        if (!file) return;
        try {
            const payload = await importSettingsFromFile(file);
            if (payload.settings) settingsSystem.applySettings(payload.settings);
            if (payload.hotkeys) hotkeySystem?.applyHotkeys(payload.hotkeys);
            showToast("设置已导入", "ok");
        } catch (err) {
            console.error(err);
            showToast(`设置导入失败: ${err?.message || err}`, "err", 3400);
        }
    });
}

async function exportAllBundle() {
    const JSZipCtor = globalThis.JSZip;
    if (!JSZipCtor) {
        showToast("JSZip 未加载，无法一键导出", "err");
        return;
    }

    const state = store.getState();
    const zip = new JSZipCtor();

    const modelVertexPath = ensureExt(
        normalizeResourcePath(state.model?.shader?.vertexPath, "core/vertex/model.vsh"),
        ".vsh"
    );
    const modelFragmentPath = ensureExt(
        normalizeResourcePath(state.model?.shader?.fragmentPath, "core/fragment/model.fsh"),
        ".fsh"
    );
    zip.file(modelVertexPath, String(state.model?.shader?.vertexSource || ""));
    zip.file(modelFragmentPath, String(state.model?.shader?.fragmentSource || ""));

    for (const node of state.post?.nodes || []) {
        const safeName = String(node.name || "post").replace(/[^a-zA-Z0-9_.-]/g, "_");
        const fPath = ensureExt(
            normalizeResourcePath(node.fragmentPath, `core/post/${safeName}.fsh`),
            ".fsh"
        );
        zip.file(fPath, String(node.fragmentSource || ""));
    }

    const exportedTextures = [];
    for (const tex of state.textures || []) {
        const dataUrl = String(tex?.dataUrl || "");
        if (!dataUrl) continue;
        const decoded = decodeDataUrlPayload(dataUrl);
        if (!decoded?.bytes?.length) continue;
        const texPath = ensureExt(
            normalizeResourcePath(textureResourcePathFromName(tex?.name), `core/textures/${String(tex?.id || "texture")}.png`),
            ".png"
        );
        zip.file(texPath, decoded.bytes);
        exportedTextures.push({
            id: String(tex?.id || ""),
            name: String(tex?.name || ""),
            path: texPath,
            mime: decoded.mime
        });
    }

    const modelText = generateModelKotlin(state);
    const postText = generatePostKotlin(state);
    modelKotlinCache = modelText;
    postKotlinCache = postText;
    zip.file("kotlin/model_kotlin.txt", modelText);
    zip.file("kotlin/post_kotlin.txt", postText);
    zip.file("kotlin/combined_kotlin.txt", `${modelText}\n\n${postText}`);

    const manifest = {
        projectName: state.projectName || "shader-workbench",
        exportedAt: new Date().toISOString(),
        modelVertexPath,
        modelFragmentPath,
        postNodes: (state.post?.nodes || []).map((n) => ({
            name: n.name,
            fragmentPath: n.fragmentPath
        })),
        textures: exportedTextures
    };
    zip.file("export_manifest.json", JSON.stringify(manifest, null, 2));

    const blob = await zip.generateAsync({ type: "blob" });
    const zipName = `${sanitizeProjectName(state.projectName || "shader-workbench")}_bundle.zip`;
    downloadBlob(zipName, blob);
}

function bindLayoutResizers() {
    const layout = els.layout;
    const leftPanel = els.panelLeft;
    const rightPanel = els.panelRight;
    const rzLeft = els.resizerLeft;
    const rzRight = els.resizerRight;
    if (!layout || !leftPanel || !rightPanel || !rzLeft || !rzRight) return;

    const minLeft = 280;
    const maxLeft = 680;
    const minRight = 320;
    const maxRight = 820;

    const startDrag = (side, ev) => {
        if (!(ev instanceof PointerEvent)) return;
        if (ev.button !== 0) return;
        const startX = ev.clientX;
        const startLeft = leftPanel.getBoundingClientRect().width;
        const startRight = rightPanel.getBoundingClientRect().width;

        const move = (mv) => {
            const dx = mv.clientX - startX;
            if (side === "left") {
                const next = Math.max(minLeft, Math.min(maxLeft, startLeft + dx));
                layout.style.setProperty("--sb-left-w", `${Math.round(next)}px`);
            } else {
                const next = Math.max(minRight, Math.min(maxRight, startRight - dx));
                layout.style.setProperty("--sb-right-w", `${Math.round(next)}px`);
            }
            renderer.resize();
            graphEditor.render();
        };

        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            document.body.classList.remove("is-resizing");
        };

        document.body.classList.add("is-resizing");
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up, { once: true });
        ev.preventDefault();
    };

    rzLeft.addEventListener("pointerdown", (ev) => startDrag("left", ev));
    rzRight.addEventListener("pointerdown", (ev) => startDrag("right", ev));
}

function bindTopActions() {
    bindLayoutResizers();
    els.btnUndo?.addEventListener("click", () => performUndo());
    els.btnRedo?.addEventListener("click", () => performRedo());
    els.btnPageModel?.addEventListener("click", () => applyWorkspacePage("model"));
    els.btnPagePost?.addEventListener("click", () => {
        if (workspacePage === "card") return;
        applyWorkspacePage("post");
    });
    els.btnBackToPost?.addEventListener("click", () => applyWorkspacePage("post"));
    document.addEventListener("keydown", (ev) => {
        const isMod = ev.ctrlKey || ev.metaKey;
        const editing = shouldIgnoreHotkeysForTarget(ev.target);
        if (isMod && !editing && !ev.altKey) {
            const undoKey = ev.code === "KeyZ" && !ev.shiftKey;
            const redoKey = ev.code === "KeyY" || (ev.code === "KeyZ" && ev.shiftKey);
            if (undoKey) {
                ev.preventDefault();
                performUndo();
                return;
            }
            if (redoKey) {
                ev.preventDefault();
                performRedo();
                return;
            }
        }

        const settingsOpen = !!(els.settingsModal && !els.settingsModal.classList.contains("hidden"));
        const hotkeyOpen = !!(els.hotkeyModal && !els.hotkeyModal.classList.contains("hidden"));
        const anyModalOpen = settingsOpen || hotkeyOpen;
        if (!anyModalOpen && !editing && !isMod && !ev.altKey && (ev.code === "Delete" || ev.code === "Backspace")) {
            ev.preventDefault();
            deleteSelectedNode();
            return;
        }

    });
    bindProjectEvents();
    bindModelEvents();
    bindTextureEvents();
    bindNodeEvents();
    bindPipelineEvents();
    bindKotlinEvents();
    bindPreviewEvents();
    bindCardPreviewDrag();
    bindSettingsImportExport();
}

function handleHotkeyAction(actionId) {
    switch (actionId) {
        case "addPass":
            addPostNode();
            break;
        case "generateKotlin":
            generateKotlinNow(kotlinGenerateTarget);
            break;
        case "toggleSettings":
            toggleSettings();
            break;
        case "toggleFullscreen":
            renderer.toggleFullscreen();
            break;
        case "resetCamera":
            renderer.resetCamera();
            break;
        case "exportProject":
            exportProjectJson(store.getState());
            break;
        case "importProject":
            els.fileProject?.click();
            break;
        case "deleteSelectedNode":
            deleteSelectedNode();
            break;
        default:
            break;
    }
}

hotkeySystem = initHotkeysSystem({
    els,
    onAction: handleHotkeyAction,
    onCycleTheme: (dir) => settingsSystem.cycleTheme(dir),
    onModalStateChange: () => {}
});

function init() {
    bindTopActions();
    applyWorkspacePage(workspacePage, { save: false });

    const state = store.getState();
    hasCustomModelLoaded = false;

    renderer.setPrimitive(state.model?.primitive || "sphere");
    settingsSystem.applySettings(state.settings || {});

    applyStateToUI(state, { forceKotlin: true });
    requestRendererSync({ force: true, now: true });
    void bootRenderer();
}

init();
