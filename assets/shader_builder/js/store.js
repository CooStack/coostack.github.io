import {
    DEFAULT_MODEL_FRAGMENT,
    DEFAULT_MODEL_VERTEX,
    DEFAULT_POST_FRAGMENT,
    DEFAULT_POST_VERTEX,
    DEFAULT_SETTINGS,
    createDefaultModelParams,
    createDefaultPostParams
} from "./constants.js";
import { deepClone, uid } from "./utils.js";

export const GRAPH_INPUT_ID = "__input__";
export const GRAPH_OUTPUT_ID = "__output__";

export function sanitizeNodeNameForPath(name) {
    const raw = String(name || "").trim();
    const safe = raw.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return safe || "pass";
}

export function normalizeNodePathTemplate(template, fallback = "core/post/{name}.fsh") {
    const raw = String(template || "").trim().replaceAll("\\", "/");
    const source = raw || fallback;
    const parts = source.split("/").map((part) => {
        const p = String(part || "").trim();
        if (!p) return "";
        const tokenized = p.replaceAll("{name}", "__NODE_NAME__");
        return tokenized.replace(/[^a-zA-Z0-9_.\-]/g, "_").replaceAll("__NODE_NAME__", "{name}");
    }).filter(Boolean);
    const joined = parts.join("/");
    return joined || fallback;
}

export function resolveNodeFragmentPath(name, template = "core/post/{name}.fsh") {
    const safeName = sanitizeNodeNameForPath(name);
    let tmpl = normalizeNodePathTemplate(template);
    if (!tmpl.includes("{name}")) {
        tmpl = `${tmpl.replace(/\.fsh$/i, "").replace(/\/+$/g, "")}/{name}.fsh`;
    }
    let path = tmpl.replaceAll("{name}", safeName);
    if (!/\.fsh$/i.test(path)) path += ".fsh";
    return path;
}

export function createDefaultPostNode(index = 0) {
    const name = `Pass_${index + 1}`;
    const fragmentPathTemplate = "core/post/{name}.fsh";
    return {
        id: uid("pipe"),
        name,
        type: "simple",
        x: 220 + index * 220,
        y: 80 + (index % 3) * 110,
        vertexSource: DEFAULT_POST_VERTEX,
        fragmentSource: DEFAULT_POST_FRAGMENT,
        vertexPath: "pipe/vertexes/screen.vsh",
        fragmentPathTemplate,
        fragmentPath: resolveNodeFragmentPath(name, fragmentPathTemplate),
        params: createDefaultPostParams(),
        inputs: 1,
        outputs: 1,
        textureUnit: 1,
        filter: "GL33.GL_LINEAR",
        iterations: 4,
        useMipmap: false
    };
}

export function createDefaultState() {
    const firstNode = createDefaultPostNode(0);
    return {
        version: 1,
        projectName: "shader-workbench",
        settings: deepClone(DEFAULT_SETTINGS),
        model: {
            primitive: "sphere",
            uploadedModelName: "",
            enablePost: true,
            shader: {
                vertexPath: "core/vertex/point.vsh",
                fragmentPath: "core/fragment/color.fsh",
                vertexSource: DEFAULT_MODEL_VERTEX,
                fragmentSource: DEFAULT_MODEL_FRAGMENT,
                params: createDefaultModelParams()
            }
        },
        textures: [],
        post: {
            nodes: [firstNode],
            links: [
                { id: uid("link"), fromNode: GRAPH_INPUT_ID, fromSlot: 0, toNode: firstNode.id, toSlot: 0 },
                { id: uid("link"), fromNode: firstNode.id, fromSlot: 0, toNode: GRAPH_OUTPUT_ID, toSlot: 0 }
            ]
        },
        selectedNodeId: firstNode.id
    };
}

function normalizePostGraphState(state) {
    if (!state || typeof state !== "object") return;
    if (!state.post || typeof state.post !== "object") state.post = {};
    if (!Array.isArray(state.post.nodes)) state.post.nodes = [];
    if (!Array.isArray(state.post.links)) state.post.links = [];

    const nodes = state.post.nodes;
    const nodeIds = new Set(nodes.map((n) => String(n?.id || "")).filter(Boolean));
    const dedup = new Set();
    const links = [];

    for (const link of state.post.links) {
        const fromNode = String(link?.fromNode || "");
        const toNode = String(link?.toNode || "");
        if (!fromNode || !toNode) continue;

        const fromValid = fromNode === GRAPH_INPUT_ID || nodeIds.has(fromNode);
        const toValid = toNode === GRAPH_OUTPUT_ID || nodeIds.has(toNode);
        if (!fromValid || !toValid) continue;

        const fromSlot = Math.max(0, Math.round(Number(link?.fromSlot || 0)));
        const toSlot = Math.max(0, Math.round(Number(link?.toSlot || 0)));
        const key = `${fromNode}:${fromSlot}->${toNode}:${toSlot}`;
        if (dedup.has(key)) continue;
        dedup.add(key);
        links.push({
            id: String(link?.id || uid("link")),
            fromNode,
            fromSlot,
            toNode,
            toSlot
        });
    }

    if (!nodes.length) {
        const hasDirect = links.some((l) => l.fromNode === GRAPH_INPUT_ID && l.toNode === GRAPH_OUTPUT_ID);
        state.post.links = hasDirect ? links : [{
            id: uid("link"),
            fromNode: GRAPH_INPUT_ID,
            fromSlot: 0,
            toNode: GRAPH_OUTPUT_ID,
            toSlot: 0
        }];
        state.selectedNodeId = null;
        return;
    }

    state.post.links = links;
}

export function createStore(initialState = createDefaultState()) {
    let state = deepClone(initialState);
    const listeners = new Set();
    const undoStack = [];
    const redoStack = [];
    const HISTORY_LIMIT = 120;

    function getState() {
        return state;
    }

    function setState(nextState, meta = {}) {
        normalizePostGraphState(nextState);
        state = nextState;
        for (const listener of listeners) {
            try {
                listener(state, meta);
            } catch (err) {
                console.error("store listener error", err);
            }
        }
    }

    function pushHistorySnapshot(snapshot) {
        undoStack.push(snapshot);
        if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    }

    function commit(nextState, meta = {}) {
        if (meta.clearHistory) {
            undoStack.length = 0;
            redoStack.length = 0;
        }
        if (!meta.skipHistory) {
            pushHistorySnapshot(deepClone(state));
            redoStack.length = 0;
        }
        setState(nextState, meta);
    }

    function patch(mutator, meta = {}) {
        const draft = deepClone(state);
        mutator(draft);
        commit(draft, meta);
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    function reset(nextInitial = createDefaultState(), meta = { reason: "reset" }) {
        commit(deepClone(nextInitial), meta);
    }

    function canUndo() {
        return undoStack.length > 0;
    }

    function canRedo() {
        return redoStack.length > 0;
    }

    function undo(meta = { reason: "undo" }) {
        if (!undoStack.length) return false;
        const prev = undoStack.pop();
        redoStack.push(deepClone(state));
        setState(prev, Object.assign({}, meta, { skipHistory: true }));
        return true;
    }

    function redo(meta = { reason: "redo" }) {
        if (!redoStack.length) return false;
        const next = redoStack.pop();
        undoStack.push(deepClone(state));
        setState(next, Object.assign({}, meta, { skipHistory: true }));
        return true;
    }

    function clearHistory() {
        undoStack.length = 0;
        redoStack.length = 0;
    }

    return {
        getState,
        setState,
        patch,
        subscribe,
        reset,
        canUndo,
        canRedo,
        undo,
        redo,
        clearHistory
    };
}

export function findPostNode(state, nodeId) {
    return state.post.nodes.find((n) => n.id === nodeId) || null;
}

export function removeNodeAndLinks(state, nodeId) {
    state.post.nodes = state.post.nodes.filter((n) => n.id !== nodeId);
    state.post.links = state.post.links.filter((l) => l.fromNode !== nodeId && l.toNode !== nodeId);
    if (state.selectedNodeId === nodeId) state.selectedNodeId = null;
}

export function ensureSelectedNode(state) {
    if (state.selectedNodeId && state.post.nodes.some((n) => n.id === state.selectedNodeId)) return;
    state.selectedNodeId = state.post.nodes[0]?.id || null;
}

export function createParamTemplate() {
    return {
        id: uid("param"),
        name: "uParam",
        type: "float",
        value: "1.0",
        valueSource: "value",
        valueExpr: "uTime",
        sourceType: "value",
        textureId: "",
        connection: ""
    };
}
