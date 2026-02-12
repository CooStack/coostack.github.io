import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { GRAPH_INPUT_ID, GRAPH_OUTPUT_ID } from "./store.js";
import { boolFromString, parseVec } from "./utils.js";

const DYNAMIC_UNIFORM_NAMES = new Set(["uTime", "CameraPos"]);
const PREVIEW_CONTROL_MODE_DEFAULT = "default";
const PREVIEW_CONTROL_MODE_TOUCH = "touch";
const TOUCH_WHEEL_ROTATE_FACTOR = 0.2;

function createPrimitiveGeometry(type) {
    switch (type) {
        case "box":
            return new THREE.BoxGeometry(7, 7, 7, 20, 20, 20);
        case "torus":
            return new THREE.TorusGeometry(4, 1.2, 28, 96);
        case "torusKnot":
            return new THREE.TorusKnotGeometry(3.2, 1.1, 140, 18);
        case "plane":
            return new THREE.PlaneGeometry(10, 10, 100, 100);
        case "sphere":
        default:
            return new THREE.SphereGeometry(5, 80, 80);
    }
}

function normalizeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function normalizePreviewControlMode(mode) {
    const v = String(mode || PREVIEW_CONTROL_MODE_DEFAULT).toLowerCase();
    return v === PREVIEW_CONTROL_MODE_TOUCH ? PREVIEW_CONTROL_MODE_TOUCH : PREVIEW_CONTROL_MODE_DEFAULT;
}

function parseSamplerSlot(value, fallback = 0) {
    const n = Number.parseInt(String(value ?? fallback), 10);
    if (!Number.isFinite(n)) return Math.max(0, Math.round(Number(fallback) || 0));
    return Math.max(0, n);
}

function createWhiteTexture() {
    const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    tex.needsUpdate = true;
    return tex;
}

const PREVIEW_POST_VERTEX_GLSL1 = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`.trim();

const PREVIEW_POST_VERTEX_GLSL3 = `
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`.trim();

function adaptTextureSizeMathForPreview(source) {
    let code = String(source || "");
    // GLSL 3.30 textureSize(sampler2D, lod) returns ivec2.
    // Cast to vec2 in common texel-size math to avoid int/float mismatch.
    code = code.replace(
        /(\b(?:\d+(?:\.\d+)?|\.\d+)\b)\s*\/\s*textureSize\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([^)]+?)\s*\)/g,
        "$1 / vec2(textureSize($2, $3))"
    );
    code = code.replace(
        /(\bvec2\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*)textureSize\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([^)]+?)\s*\)/g,
        "$1vec2(textureSize($2, $3))"
    );
    return code;
}

function collectSamplerUniformNames(source) {
    const text = String(source || "")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, "");
    const names = [];
    const seen = new Set();
    const re = /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?sampler2D\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]+\])?\s*;/g;
    let match = re.exec(text);
    while (match) {
        const name = String(match[1] || "").trim();
        if (name && !seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
        match = re.exec(text);
    }
    return names;
}

function adaptPostFragmentForPreview(source, { useGlsl3 = false } = {}) {
    let code = String(source || "");
    code = code.replace(/\r\n/g, "\n");
    // Convert common MC fragment styles into a stable preview form.
    code = code.replace(/^\s*#version[^\n]*\n?/gm, "");
    const outNames = [];
    code = code.replace(/^\s*layout\s*\(\s*location\s*=\s*\d+\s*\)\s*out\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, (_, name) => {
        outNames.push(String(name || ""));
        return "";
    });
    code = code.replace(/^\s*out\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, (_, name) => {
        outNames.push(String(name || ""));
        return "";
    });

    if (useGlsl3) {
        code = code.replace(/^\s*(in|out)\s+vec2\s+screen_uv\s*;\s*$/gm, "");
        code = code.replace(/^\s*(in|out)\s+vec2\s+vUv\s*;\s*$/gm, "");
        code = code.replace(/^\s*varying\s+vec2\s+screen_uv\s*;\s*$/gm, "");
        code = code.replace(/^\s*varying\s+vec2\s+vUv\s*;\s*$/gm, "");
    } else {
        // ShaderPass GLSL1 preview compatibility path.
        code = code.replace(/^\s*(in|out)\s+vec2\s+screen_uv\s*;\s*$/gm, "");
        code = code.replace(/^\s*(in|out)\s+vec2\s+vUv\s*;\s*$/gm, "");
        code = code.replace(/^\s*varying\s+vec2\s+screen_uv\s*;\s*$/gm, "");
        code = code.replace(/^\s*varying\s+vec2\s+vUv\s*;\s*$/gm, "");
    }

    code = code.replace(/^\s*uniform\s+sampler2D\s+tex\s*;\s*$/gm, "uniform sampler2D tDiffuse;");
    code = code.replace(/\bscreen_uv\b/g, "vUv");
    code = code.replace(/\btex\b/g, "tDiffuse");

    // ShaderMaterial(GLSL3) already injects its own fragment output.
    // Fold custom out variables back to gl_FragColor to avoid MRT location conflicts.
    for (const name of outNames) {
        if (!name || name === "gl_FragColor") continue;
        code = code.replace(new RegExp(`\\b${name}\\b`, "g"), "gl_FragColor");
    }

    if (useGlsl3) {
        code = code.replace(/\btexture2D\s*\(/g, "texture(");
    } else {
        code = code.replace(/\btexture\s*\(/g, "texture2D(");
    }
    code = adaptTextureSizeMathForPreview(code);

    if (!/\buniform\b[^\n;]*\btDiffuse\b[^\n;]*;/.test(code)) {
        code = `uniform sampler2D tDiffuse;\n${code}`;
    }

    if (useGlsl3) {
        if (!/\bin\b[^\n;]*\bvUv\b[^\n;]*;/.test(code)) {
            code = `in vec2 vUv;\n${code}`;
        }
    } else if (!/\bvarying\b[^\n;]*\bvUv\b[^\n;]*;/.test(code)) {
        code = `varying vec2 vUv;\n${code}`;
    }

    return code;
}

function adaptModelVertexForPreview(source) {
    let code = String(source || "");
    code = code.replace(/\r\n/g, "\n");
    code = code.replace(/^\s*#version[^\n]*\n?/gm, "");
    code = code.replace(/^\s*layout\s*\(\s*location\s*=\s*\d+\s*\)\s*in\s+[A-Za-z0-9_]+\s+(pos|position|normal|uv)\s*;\s*$/gm, "");
    code = code.replace(/^\s*(attribute|in)\s+[A-Za-z0-9_]+\s+(pos|position|normal|uv)\s*;\s*$/gm, "");
    code = code.replace(/^\s*layout\s*\(\s*location\s*=\s*\d+\s*\)\s*in\s+[A-Za-z0-9_]+\s+(aPos|aNormal|aUv)\s*;\s*$/gm, "");
    code = code.replace(/^\s*(attribute|in)\s+[A-Za-z0-9_]+\s+(aPos|aNormal|aUv)\s*;\s*$/gm, "");
    code = code.replace(/^\s*out\s+([A-Za-z0-9_]+)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, "varying $1 $2;");
    code = code.replace(/\bpos\b/g, "position");
    code = code.replace(/\baPos\b/g, "position");
    code = code.replace(/\baNormal\b/g, "normal");
    code = code.replace(/\baUv\b/g, "uv");
    return code;
}

function adaptModelFragmentForPreview(source) {
    let code = String(source || "");
    code = code.replace(/\r\n/g, "\n");
    code = code.replace(/^\s*#version[^\n]*\n?/gm, "");
    const outNames = [];
    code = code.replace(/^\s*layout\s*\(\s*location\s*=\s*\d+\s*\)\s*out\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, (_, name) => {
        outNames.push(String(name || ""));
        return "";
    });
    code = code.replace(/^\s*out\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, (_, name) => {
        outNames.push(String(name || ""));
        return "";
    });
    code = code.replace(/^\s*in\s+([A-Za-z0-9_]+)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, "varying $1 $2;");
    for (const name of outNames) {
        if (!name || name === "gl_FragColor") continue;
        code = code.replace(new RegExp(`\\b${name}\\b`, "g"), "gl_FragColor");
    }
    code = code.replace(/\btexture\s*\(/g, "texture2D(");
    code = adaptTextureSizeMathForPreview(code);
    return code;
}

function resolveChain(state) {
    const links = Array.isArray(state?.post?.links) ? state.post.links : [];
    const nodeMap = new Map((state?.post?.nodes || []).map((n) => [String(n.id || ""), n]));
    const adjacency = new Map();
    const reverse = new Map();
    const indegree = new Map();
    for (const nodeId of nodeMap.keys()) {
        indegree.set(nodeId, 0);
        reverse.set(nodeId, []);
    }
    reverse.set(GRAPH_OUTPUT_ID, []);

    for (const link of links) {
        const fromNode = String(link?.fromNode || "");
        const toNode = String(link?.toNode || "");
        if (!fromNode || !toNode) continue;

        if (!adjacency.has(fromNode)) adjacency.set(fromNode, []);
        adjacency.get(fromNode).push(link);

        if (!reverse.has(toNode)) reverse.set(toNode, []);
        reverse.get(toNode).push(link);

        if (nodeMap.has(toNode) && fromNode !== GRAPH_INPUT_ID) {
            indegree.set(toNode, (indegree.get(toNode) || 0) + 1);
        }
    }

    for (const arr of adjacency.values()) {
        arr.sort((a, b) => Number(a.fromSlot || 0) - Number(b.fromSlot || 0));
    }

    // Reachable post nodes from input and whether output is reachable from input chain.
    const reachable = new Set();
    let hasOutputConnection = false;
    const bfs = [GRAPH_INPUT_ID];

    // Source-style nodes (e.g. texture node) may have zero inputs and should be
    // considered reachable even without links from system input.
    for (const [nodeId, node] of nodeMap.entries()) {
        const inputCount = Number(node?.inputs ?? 1);
        if (Number.isFinite(inputCount) && inputCount <= 0 && !reachable.has(nodeId)) {
            reachable.add(nodeId);
            bfs.push(nodeId);
        }
    }

    for (let i = 0; i < bfs.length; i++) {
        const cur = bfs[i];
        for (const edge of adjacency.get(cur) || []) {
            const toNode = String(edge.toNode || "");
            if (!toNode) continue;
            if (toNode === GRAPH_OUTPUT_ID) {
                hasOutputConnection = true;
                continue;
            }
            if (!nodeMap.has(toNode) || reachable.has(toNode)) continue;
            reachable.add(toNode);
            bfs.push(toNode);
        }
    }

    // Keep only nodes that can eventually reach Output.
    const canReachOutput = new Set();
    const bfsBack = [GRAPH_OUTPUT_ID];
    for (let i = 0; i < bfsBack.length; i += 1) {
        const cur = bfsBack[i];
        for (const edge of reverse.get(cur) || []) {
            const fromNode = String(edge.fromNode || "");
            if (!nodeMap.has(fromNode) || canReachOutput.has(fromNode)) continue;
            canReachOutput.add(fromNode);
            bfsBack.push(fromNode);
        }
    }

    const active = new Set([...reachable].filter((id) => canReachOutput.has(id)));
    if (!active.size) {
        return {
            chain: [],
            hasOutputConnection
        };
    }

    for (const nodeId of active) {
        let n = 0;
        for (const edge of reverse.get(nodeId) || []) {
            const fromNode = String(edge.fromNode || "");
            if (fromNode === GRAPH_INPUT_ID || active.has(fromNode)) n += 1;
        }
        indegree.set(nodeId, n);
    }

    const queue = [];
    for (const nodeId of active) {
        if ((indegree.get(nodeId) || 0) === 0) queue.push(nodeId);
    }

    const order = [];
    while (queue.length) {
        const cur = queue.shift();
        if (!cur) continue;
        order.push(cur);
        for (const edge of adjacency.get(cur) || []) {
            const toNode = String(edge.toNode || "");
            if (!active.has(toNode)) continue;
            const next = (indegree.get(toNode) || 0) - 1;
            indegree.set(toNode, next);
            if (next === 0) queue.push(toNode);
        }
    }

    // Fallback for cyclic graphs: append unprocessed active nodes.
    if (order.length < active.size) {
        for (const nodeId of active) {
            if (!order.includes(nodeId)) order.push(nodeId);
        }
    }

    return {
        chain: order.map((id) => nodeMap.get(id)).filter(Boolean),
        hasOutputConnection
    };
}

export class ShaderWorkbenchRenderer {
    constructor({ hostEl, onStatus = () => {} }) {
        this.hostEl = hostEl;
        this.onStatus = onStatus;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b1017);

        this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 2000);
        this.camera.position.set(12, 9, 12);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.setSize(10, 10, false);

        this.hostEl.appendChild(this.renderer.domElement);
        this.renderer.domElement.addEventListener("contextmenu", (ev) => ev.preventDefault());
        this.renderer.domElement.tabIndex = 0;
        this.renderer.domElement.setAttribute("aria-label", "Shader preview canvas");

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.target.set(0, 0, 0);

        this.previewControlMode = PREVIEW_CONTROL_MODE_DEFAULT;
        this.applyPreviewControlMode(PREVIEW_CONTROL_MODE_DEFAULT);

        this.worldRoot = new THREE.Group();
        this.helperRoot = new THREE.Group();
        this.scene.add(this.worldRoot);
        this.scene.add(this.helperRoot);

        this.axesHelper = new THREE.AxesHelper(8);
        this.gridHelper = new THREE.GridHelper(40, 40, 0x405060, 0x263341);
        this.helperRoot.add(this.axesHelper);
        this.helperRoot.add(this.gridHelper);

        this.worldRoot.add(new THREE.HemisphereLight(0xb3d4ff, 0x0f141d, 0.9));
        const dir = new THREE.DirectionalLight(0xffffff, 1.15);
        dir.position.set(4, 9, 5);
        this.worldRoot.add(dir);

        this.modelRoot = new THREE.Group();
        this.worldRoot.add(this.modelRoot);

        this.clock = new THREE.Clock();
        this.time = 0;

        this.fallbackTexture = createWhiteTexture();
        this.textureCache = new Map();
        this.worldDepthMaterial = new THREE.MeshDepthMaterial();
        this.worldDepthMaterial.depthTest = true;
        this.worldDepthMaterial.depthWrite = true;
        this.worldDepthMaterial.colorWrite = false;

        this.modelObject = null;
        this.modelMaterial = null;
        this.composer = null;
        this.renderPass = null;
        this.passStates = [];
        this.useComposer = false;
        this.noOutputPreview = false;
        this.systemInputTexture = null;
        this.nodeOutputTextures = new Map();
        this.helpersIndependentRender = true;

        this.keyPanState = {
            left: false,
            right: false,
            up: false,
            down: false
        };
        this.panMove = new THREE.Vector3();
        this.panRight = new THREE.Vector3();
        this.panUp = new THREE.Vector3();
        this.onCanvasPointerdown = () => {
            try {
                this.renderer.domElement.focus({ preventScroll: true });
            } catch {
                this.renderer.domElement.focus();
            }
        };
        this.onCanvasKeydown = (ev) => {
            if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
            let handled = true;
            if (ev.code === "ArrowLeft") this.keyPanState.left = true;
            else if (ev.code === "ArrowRight") this.keyPanState.right = true;
            else if (ev.code === "ArrowUp") this.keyPanState.up = true;
            else if (ev.code === "ArrowDown") this.keyPanState.down = true;
            else handled = false;

            if (handled) {
                ev.preventDefault();
                ev.stopPropagation();
            }
        };
        this.onCanvasKeyup = (ev) => {
            let handled = true;
            if (ev.code === "ArrowLeft") this.keyPanState.left = false;
            else if (ev.code === "ArrowRight") this.keyPanState.right = false;
            else if (ev.code === "ArrowUp") this.keyPanState.up = false;
            else if (ev.code === "ArrowDown") this.keyPanState.down = false;
            else handled = false;

            if (handled) {
                ev.preventDefault();
                ev.stopPropagation();
            }
        };
        this.onCanvasBlur = () => this.clearPanKeys();
        this.onWindowBlur = () => this.clearPanKeys();
        this.onCanvasWheel = (ev) => {
            if (this.previewControlMode !== PREVIEW_CONTROL_MODE_TOUCH) return;
            if (ev.ctrlKey || ev.metaKey) return;

            ev.preventDefault();
            ev.stopImmediatePropagation();

            try {
                this.renderer.domElement.focus({ preventScroll: true });
            } catch {
                this.renderer.domElement.focus();
            }

            let dx = Number(ev.deltaX) || 0;
            let dy = Number(ev.deltaY) || 0;
            if (ev.deltaMode === 1) {
                dx *= 16;
                dy *= 16;
            } else if (ev.deltaMode === 2) {
                const h = Math.max(1, this.renderer.domElement.clientHeight || 1);
                dx *= h;
                dy *= h;
            }

            const h = Math.max(1, this.renderer.domElement.clientHeight || 1);
            const rotateUnit = (2 * Math.PI / h) * (Number(this.controls.rotateSpeed) || 1) * TOUCH_WHEEL_ROTATE_FACTOR;
            if (Math.abs(dy) > 0.0001) this.controls._rotateUp(dy * rotateUnit);
            if (Math.abs(dx) > 0.0001) this.controls._rotateLeft(dx * rotateUnit);
            this.controls.update();
        };
        this.wheelListenerOptions = { passive: false, capture: true };
        this.renderer.domElement.addEventListener("pointerdown", this.onCanvasPointerdown);
        this.renderer.domElement.addEventListener("keydown", this.onCanvasKeydown);
        this.renderer.domElement.addEventListener("keyup", this.onCanvasKeyup);
        this.renderer.domElement.addEventListener("wheel", this.onCanvasWheel, this.wheelListenerOptions);
        this.renderer.domElement.addEventListener("blur", this.onCanvasBlur);
        window.addEventListener("blur", this.onWindowBlur);

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.hostEl);

        this.setPrimitive("sphere");
        this.resize();

        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    dispose() {
        this.resizeObserver.disconnect();
        this.renderer.domElement.removeEventListener("pointerdown", this.onCanvasPointerdown);
        this.renderer.domElement.removeEventListener("keydown", this.onCanvasKeydown);
        this.renderer.domElement.removeEventListener("keyup", this.onCanvasKeyup);
        this.renderer.domElement.removeEventListener("wheel", this.onCanvasWheel, this.wheelListenerOptions);
        this.renderer.domElement.removeEventListener("blur", this.onCanvasBlur);
        window.removeEventListener("blur", this.onWindowBlur);
        this.controls.dispose();
        this.renderer.dispose();
        this.fallbackTexture.dispose();
        this.worldDepthMaterial.dispose();
        for (const item of this.textureCache.values()) {
            item.texture?.dispose();
        }
        this.textureCache.clear();
    }

    resize() {
        const rect = this.hostEl.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h, false);
        this.composer?.setSize(w, h);
    }

    resetCamera() {
        this.camera.position.set(12, 9, 12);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.hostEl.requestFullscreen?.();
            return;
        }
        document.exitFullscreen?.();
    }

    applyPreviewControlMode(mode) {
        const finalMode = normalizePreviewControlMode(mode);
        this.previewControlMode = finalMode;
        this.controls.mouseButtons.LEFT = finalMode === PREVIEW_CONTROL_MODE_TOUCH
            ? THREE.MOUSE.DOLLY
            : null;
        this.controls.mouseButtons.MIDDLE = finalMode === PREVIEW_CONTROL_MODE_TOUCH
            ? null
            : THREE.MOUSE.ROTATE;
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    }

    applySettings(settings) {
        this.axesHelper.visible = !!settings?.showAxes;
        this.gridHelper.visible = !!settings?.showGrid;
        this.helpersIndependentRender = !!settings?.helpersIndependentRender;
        this.applyPreviewControlMode(settings?.previewControlMode);
        const fov = normalizeNumber(settings?.cameraFov, 60);
        if (Math.abs(this.camera.fov - fov) > 0.0001) {
            this.camera.fov = fov;
            this.camera.updateProjectionMatrix();
        }
    }

    setPrimitive(primitive) {
        const geometry = createPrimitiveGeometry(primitive);
        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({
                color: 0x88ccff,
                roughness: 0.3,
                metalness: 0.0,
                side: THREE.DoubleSide
            })
        );
        this.replaceModel(mesh);
    }

    replaceModel(object3d) {
        if (this.modelObject) {
            this.modelRoot.remove(this.modelObject);
            this.disposeModel(this.modelObject);
        }
        this.modelObject = object3d;
        this.modelRoot.add(object3d);
        this.centerAndScaleModel(object3d);
        if (this.modelMaterial) this.applyMaterialToModel(this.modelMaterial);
    }

    disposeModel(object) {
        object.traverse?.((child) => {
            if (child.isMesh) {
                child.geometry?.dispose?.();
                const mat = child.material;
                if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
                else mat?.dispose?.();
            }
        });
    }

    centerAndScaleModel(object) {
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const maxEdge = Math.max(size.x, size.y, size.z, 0.001);
        const scale = 10 / maxEdge;
        object.scale.setScalar(scale);

        const box2 = new THREE.Box3().setFromObject(object);
        const center = box2.getCenter(new THREE.Vector3());
        object.position.sub(center);
    }

    applyMaterialToModel(material) {
        if (!this.modelObject) return;
        this.modelObject.traverse((child) => {
            if (child.isMesh) child.material = material;
        });
    }

    async loadModelFile(file) {
        const name = String(file?.name || "");
        const ext = name.split(".").pop()?.toLowerCase() || "";

        if (ext === "obj") {
            const text = await file.text();
            const loader = new OBJLoader();
            const obj = loader.parse(text);
            this.replaceModel(obj);
            return name;
        }

        if (ext === "glb" || ext === "gltf") {
            const buf = await file.arrayBuffer();
            const loader = new GLTFLoader();
            const scene = await new Promise((resolve, reject) => {
                loader.parse(buf, "", (gltf) => resolve(gltf.scene), (err) => reject(err));
            });
            this.replaceModel(scene);
            return name;
        }

        throw new Error("暂不支持该模型格式，请使用 .glb .gltf .obj");
    }

    rebuildTextureCache(textures) {
        const incoming = new Map((textures || []).map((t) => [t.id, t]));

        for (const id of Array.from(this.textureCache.keys())) {
            if (!incoming.has(id)) {
                const old = this.textureCache.get(id);
                old?.texture?.dispose?.();
                this.textureCache.delete(id);
            }
        }

        const loader = new THREE.TextureLoader();
        for (const texDef of incoming.values()) {
            const existing = this.textureCache.get(texDef.id);
            if (existing && existing.source === texDef.dataUrl) continue;

            const texture = loader.load(texDef.dataUrl || "", () => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.colorSpace = THREE.SRGBColorSpace;
            });
            this.textureCache.set(texDef.id, {
                source: texDef.dataUrl,
                texture
            });
        }
    }

    paramToUniform(param) {
        const type = String(param?.type || "float").toLowerCase();
        const value = param?.value ?? "";
        const useExpr = String(param?.valueSource || "value").toLowerCase() === "uniform";
        const expr = String(param?.valueExpr || "").trim();

        // Built-in dynamic uniform expression for preview.
        if (type === "vec3" && useExpr && expr === "CameraPos") {
            return { value: this.camera.position };
        }

        if (type === "int") return { value: Math.round(normalizeNumber(value, 0)) };
        if (type === "bool") return { value: boolFromString(value, false) };
        if (type === "vec2") {
            const vec = parseVec(String(value), 2) || [0, 0];
            return { value: new THREE.Vector2(vec[0], vec[1]) };
        }
        if (type === "vec3") {
            const vec = parseVec(String(value), 3) || [1, 1, 1];
            return { value: new THREE.Vector3(vec[0], vec[1], vec[2]) };
        }
        if (type === "texture") {
            let tex = this.fallbackTexture;
            if (param?.sourceType === "upload" && param?.textureId) {
                tex = this.textureCache.get(param.textureId)?.texture || this.fallbackTexture;
            }
            // connection 类型目前作为构建信息保留，预览阶段回落到上传纹理或白图。
            return { value: tex };
        }
        return { value: normalizeNumber(value, 0) };
    }

    buildUniformMap(params, includeTime = true) {
        const uniforms = {};
        if (includeTime) uniforms.uTime = { value: this.time };
        for (const param of params || []) {
            const name = String(param?.name || "").trim();
            if (!name) continue;
            if (DYNAMIC_UNIFORM_NAMES.has(name)) continue;
            uniforms[name] = this.paramToUniform(param);
        }
        if (!uniforms.CameraPos) uniforms.CameraPos = { value: this.camera.position };
        return uniforms;
    }

    applyModelShader(modelState) {
        if (!modelState?.shader) return;
        const shader = modelState.shader;

        const uniforms = this.buildUniformMap(shader.params || [], true);
        if (!uniforms.uColor) uniforms.uColor = { value: new THREE.Vector3(0.3, 0.8, 1.0) };
        if (!uniforms.uWaveAmp) uniforms.uWaveAmp = { value: 0.15 };
        if (!uniforms.projMat) uniforms.projMat = { value: new THREE.Matrix4() };
        if (!uniforms.viewMat) uniforms.viewMat = { value: new THREE.Matrix4() };
        if (!uniforms.transMat) uniforms.transMat = { value: new THREE.Matrix4() };

        const previewVertex = adaptModelVertexForPreview(shader.vertexSource);
        const previewFragment = adaptModelFragmentForPreview(shader.fragmentSource);

        const material = new THREE.ShaderMaterial({
            vertexShader: previewVertex,
            fragmentShader: previewFragment,
            uniforms,
            side: THREE.DoubleSide,
            transparent: true
        });

        this.modelMaterial = material;
        this.applyMaterialToModel(material);
        this.onStatus({ shader: "着色器：模型已更新" });
    }

    createShaderPassFromNode(node, incomingLinks = []) {
        if (String(node?.type || "").toLowerCase() === "texture") {
            return this.createTextureNodePass(node, incomingLinks);
        }

        const useGlsl3 = !!this.renderer?.capabilities?.isWebGL2;
        const fragmentSource = adaptPostFragmentForPreview(node?.fragmentSource || "", { useGlsl3 });
        const uniforms = this.buildUniformMap(node.params || [], true);

        const incomingBySlot = new Map();
        for (const link of incomingLinks || []) {
            const slot = Math.max(0, Math.round(Number(link?.toSlot || 0)));
            if (!incomingBySlot.has(slot)) incomingBySlot.set(slot, link);
        }
        const mapLinkToBinding = (link) => {
            if (!link || typeof link !== "object") return null;
            const fromNode = String(link?.fromNode || "");
            if (!fromNode) return null;
            if (fromNode === GRAPH_INPUT_ID) return { kind: "graphInput" };
            return {
                kind: "nodeOutput",
                nodeId: fromNode,
                slot: Math.max(0, Math.round(Number(link?.fromSlot || 0)))
            };
        };

        const samplerUniformNames = collectSamplerUniformNames(node?.fragmentSource || "");
        const uploadedTextureUniforms = new Set();
        const inputSamplerUniforms = [];
        const inputBindings = new Map();
        const addInputSampler = (name) => {
            const n = String(name || "").trim();
            if (!n) return;
            if (uploadedTextureUniforms.has(n)) return;
            if (!inputSamplerUniforms.includes(n)) inputSamplerUniforms.push(n);
        };

        let nextFallbackSlot = 0;
        for (const param of node?.params || []) {
            if (String(param?.type || "").toLowerCase() !== "texture") continue;
            const uniformName = String(param?.name || "").trim();
            if (!uniformName) continue;
            const sourceType = String(param?.sourceType || "value").toLowerCase();
            if (sourceType === "upload") {
                uploadedTextureUniforms.add(uniformName);
                continue;
            }

            addInputSampler(uniformName);
            let binding = null;
            if (sourceType === "value") {
                const slot = parseSamplerSlot(param?.value, nextFallbackSlot);
                nextFallbackSlot = Math.max(nextFallbackSlot, slot + 1);
                binding = mapLinkToBinding(incomingBySlot.get(slot));
            } else if (sourceType === "connection") {
                // "connection" may be stored either in param.connection (legacy text field)
                // or directly in param.value as input slot index (current simplified UI).
                const rawConn = String(param?.connection || "").trim();
                const rawSlot = /^\d+$/.test(rawConn)
                    ? rawConn
                    : String(param?.value ?? "").trim();
                const slot = parseSamplerSlot(rawSlot, nextFallbackSlot);
                nextFallbackSlot = Math.max(nextFallbackSlot, slot + 1);
                binding = mapLinkToBinding(incomingBySlot.get(slot));
            }
            inputBindings.set(uniformName, binding || { kind: "readBuffer" });
        }

        for (const uniformName of samplerUniformNames) {
            addInputSampler(uniformName);
        }
        if (!uploadedTextureUniforms.has("tDiffuse")) addInputSampler("tDiffuse");
        if (!uploadedTextureUniforms.has("tex")) addInputSampler("tex");
        if (!uploadedTextureUniforms.has("samp")) addInputSampler("samp");

        for (const uniformName of inputSamplerUniforms) {
            if (!uniforms[uniformName]) uniforms[uniformName] = { value: null };
            if (inputBindings.has(uniformName)) continue;
            const aliasSlot = uniformName === "tDiffuse" || uniformName === "tex" || uniformName === "samp"
                ? 0
                : nextFallbackSlot++;
            const binding = mapLinkToBinding(incomingBySlot.get(aliasSlot));
            inputBindings.set(uniformName, binding || { kind: "readBuffer" });
        }

        const shader = {
            uniforms,
            vertexShader: useGlsl3 ? PREVIEW_POST_VERTEX_GLSL3 : PREVIEW_POST_VERTEX_GLSL1,
            fragmentShader: fragmentSource
        };
        if (useGlsl3) shader.glslVersion = THREE.GLSL3;

        const pass = new ShaderPass(shader);
        let primaryInputUniform = "";
        for (const uniformName of inputSamplerUniforms) {
            if (!pass.uniforms?.[uniformName]) continue;
            const binding = inputBindings.get(uniformName);
            if (binding?.kind === "readBuffer") {
                primaryInputUniform = uniformName;
                break;
            }
        }
        pass.textureID = primaryInputUniform && pass.uniforms?.[primaryInputUniform]
            ? primaryInputUniform
            : "__sb_no_input__";

        const inputUniformTargets = inputSamplerUniforms.filter((name) => !!pass.uniforms?.[name]);
        pass.__inputUniformTargets = inputUniformTargets;
        pass.__inputUniformBindings = Object.fromEntries(
            inputUniformTargets.map((name) => [name, inputBindings.get(name) || { kind: "readBuffer" }])
        );

        const nodeId = String(node?.id || "");
        const originalRender = pass.render.bind(pass);
        pass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
            const readTexture = readBuffer?.texture || null;
            if (!this.systemInputTexture && readTexture) {
                this.systemInputTexture = readTexture;
            }

            for (const uniformName of pass.__inputUniformTargets || []) {
                if (!pass.uniforms?.[uniformName]) continue;
                const binding = pass.__inputUniformBindings?.[uniformName] || { kind: "readBuffer" };
                let tex = readTexture;
                if (binding?.kind === "graphInput") {
                    tex = this.systemInputTexture || readTexture;
                } else if (binding?.kind === "nodeOutput") {
                    tex = this.nodeOutputTextures.get(String(binding.nodeId || "")) || readTexture;
                }
                if (!tex) continue;
                pass.uniforms[uniformName].value = tex;
            }

            const result = originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
            if (nodeId && writeBuffer?.texture) {
                this.nodeOutputTextures.set(nodeId, writeBuffer.texture);
            }
            return result;
        };

        return pass;
    }

    createTextureNodePass(node, incomingLinks = []) {
        const useGlsl3 = !!this.renderer?.capabilities?.isWebGL2;
        const textureParam = (node?.params || []).find((param) => String(param?.type || "").toLowerCase() === "texture");
        const sourceType = String(textureParam?.sourceType || "value").toLowerCase();
        const tDiffuseUniform = textureParam && sourceType === "upload"
            ? this.paramToUniform(textureParam)
            : { value: null };
        const shader = {
            uniforms: {
                tDiffuse: tDiffuseUniform
            },
            vertexShader: useGlsl3 ? PREVIEW_POST_VERTEX_GLSL3 : PREVIEW_POST_VERTEX_GLSL1,
            fragmentShader: useGlsl3
                ? `in vec2 vUv;\nuniform sampler2D tDiffuse;\nvoid main(){ gl_FragColor = texture(tDiffuse, vUv); }`
                : `varying vec2 vUv;\nuniform sampler2D tDiffuse;\nvoid main(){ gl_FragColor = texture2D(tDiffuse, vUv); }`
        };
        if (useGlsl3) shader.glslVersion = THREE.GLSL3;

        const pass = new ShaderPass(shader);
        pass.textureID = sourceType === "upload" ? "__sb_no_input__" : "tDiffuse";

        const incomingBySlot = new Map();
        for (const link of incomingLinks || []) {
            const slot = Math.max(0, Math.round(Number(link?.toSlot || 0)));
            if (!incomingBySlot.has(slot)) incomingBySlot.set(slot, link);
        }
        const mapLinkToBinding = (link) => {
            if (!link || typeof link !== "object") return null;
            const fromNode = String(link?.fromNode || "");
            if (!fromNode) return null;
            if (fromNode === GRAPH_INPUT_ID) return { kind: "graphInput" };
            return {
                kind: "nodeOutput",
                nodeId: fromNode,
                slot: Math.max(0, Math.round(Number(link?.fromSlot || 0)))
            };
        };
        const slot = parseSamplerSlot(textureParam?.value, 0);
        const runtimeBinding = sourceType === "upload"
            ? { kind: "upload" }
            : (mapLinkToBinding(incomingBySlot.get(slot)) || { kind: "readBuffer" });

        const nodeId = String(node?.id || "");
        const originalRender = pass.render.bind(pass);
        pass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
            const readTexture = readBuffer?.texture || null;
            if (!this.systemInputTexture && readTexture) {
                this.systemInputTexture = readTexture;
            }

            if (sourceType !== "upload" && pass.uniforms?.tDiffuse) {
                let tex = readTexture;
                if (runtimeBinding?.kind === "graphInput") {
                    tex = this.systemInputTexture || readTexture;
                } else if (runtimeBinding?.kind === "nodeOutput") {
                    tex = this.nodeOutputTextures.get(String(runtimeBinding.nodeId || "")) || readTexture;
                }
                if (tex) pass.uniforms.tDiffuse.value = tex;
            }

            const result = originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
            if (nodeId && writeBuffer?.texture) {
                this.nodeOutputTextures.set(nodeId, writeBuffer.texture);
            }
            return result;
        };

        return pass;
    }

    applyPostPipeline(state) {
        const enabled = !!state?.model?.enablePost;
        const graphResolved = resolveChain(state);
        const chain = graphResolved.chain;
        const chainNodeIds = new Set(chain.map((n) => String(n?.id || "")).filter(Boolean));
        const incomingLinksByNode = new Map();
        for (const link of state?.post?.links || []) {
            const toNode = String(link?.toNode || "");
            if (!toNode || !chainNodeIds.has(toNode)) continue;
            if (!incomingLinksByNode.has(toNode)) incomingLinksByNode.set(toNode, []);
            incomingLinksByNode.get(toNode).push(link);
        }
        for (const links of incomingLinksByNode.values()) {
            links.sort((a, b) => Number(a?.toSlot || 0) - Number(b?.toSlot || 0));
        }

        this.composer = new EffectComposer(this.renderer);
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);
        this.passStates = [];
        this.noOutputPreview = false;
        this.systemInputTexture = null;
        this.nodeOutputTextures.clear();

        if (!enabled) {
            this.useComposer = false;
            this.onStatus({ pipeline: "后处理链：0 个卡片" });
            return;
        }

        if (!graphResolved.hasOutputConnection) {
            this.useComposer = false;
            this.noOutputPreview = true;
            this.onStatus({ pipeline: "后处理链：无输出（输出节点未连接）" });
            return;
        }

        if (!chain.length) {
            this.useComposer = false;
            this.onStatus({ pipeline: "后处理链：0 个卡片" });
            return;
        }

        for (const node of chain) {
            const repeat = node.type === "pingpong" ? Math.max(1, Math.round(normalizeNumber(node.iterations, 1))) : 1;
            const incomingLinks = incomingLinksByNode.get(String(node?.id || "")) || [];
            for (let i = 0; i < repeat; i++) {
                const pass = this.createShaderPassFromNode(node, incomingLinks);
                this.composer.addPass(pass);
                this.passStates.push({ nodeId: node.id, pass });
            }
        }

        this.useComposer = this.passStates.length > 0;
        this.onStatus({ pipeline: `后处理链：${this.passStates.length} 个卡片` });
    }

    syncFromState(state) {
        this.rebuildTextureCache(state?.textures || []);
        this.applySettings(state?.settings || {});
        this.applyModelShader(state?.model || {});
        this.applyPostPipeline(state || {});
    }

    clearPanKeys() {
        this.keyPanState.left = false;
        this.keyPanState.right = false;
        this.keyPanState.up = false;
        this.keyPanState.down = false;
    }

    applyKeyboardPan(deltaSeconds = 0) {
        const x = (this.keyPanState.right ? 1 : 0) - (this.keyPanState.left ? 1 : 0);
        const y = (this.keyPanState.up ? 1 : 0) - (this.keyPanState.down ? 1 : 0);
        if (!x && !y) return;

        const delta = Math.max(0, Number(deltaSeconds) || 0);
        if (delta <= 0) return;

        const distance = this.camera.position.distanceTo(this.controls.target);
        const speed = Math.max(0.5, distance * 1.6);
        const step = speed * delta;
        const len = Math.hypot(x, y) || 1;

        this.panMove.set(0, 0, 0);
        this.panRight.setFromMatrixColumn(this.camera.matrix, 0).normalize();
        this.panUp.setFromMatrixColumn(this.camera.matrix, 1).normalize();
        this.panMove.addScaledVector(this.panRight, (x / len) * step);
        this.panMove.addScaledVector(this.panUp, (y / len) * step);

        this.camera.position.add(this.panMove);
        this.controls.target.add(this.panMove);
    }

    hasVisibleHelpers() {
        return !!(this.axesHelper.visible || this.gridHelper.visible);
    }

    renderMainFrame() {
        if (this.useComposer && this.composer) {
            this.systemInputTexture = null;
            this.nodeOutputTextures.clear();
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    renderWorldDepthPrepass() {
        const prevAutoClear = this.renderer.autoClear;
        const prevBackground = this.scene.background;
        const prevOverrideMaterial = this.scene.overrideMaterial;

        this.renderer.autoClear = false;
        this.scene.background = null;
        this.scene.overrideMaterial = this.worldDepthMaterial;
        try {
            this.renderer.clearDepth();
            this.renderer.render(this.scene, this.camera);
        } finally {
            this.scene.overrideMaterial = prevOverrideMaterial;
            this.scene.background = prevBackground;
            this.renderer.autoClear = prevAutoClear;
        }
    }

    renderHelperOverlay() {
        if (!this.hasVisibleHelpers()) return;
        const prevWorldVisible = this.worldRoot.visible;
        const prevAutoClear = this.renderer.autoClear;
        const prevBackground = this.scene.background;
        this.worldRoot.visible = false;
        this.renderer.autoClear = false;
        this.scene.background = null;
        try {
            this.renderer.render(this.scene, this.camera);
        } finally {
            this.scene.background = prevBackground;
            this.renderer.autoClear = prevAutoClear;
            this.worldRoot.visible = prevWorldVisible;
        }
    }

    updateDynamicUniforms(deltaSeconds = 0) {
        this.time += Math.max(0, Number(deltaSeconds) || 0);

        const modelUniforms = this.modelMaterial?.uniforms;
        if (modelUniforms?.uTime) {
            modelUniforms.uTime.value = this.time;
        }
        if (modelUniforms?.CameraPos?.value?.copy) {
            modelUniforms.CameraPos.value.copy(this.camera.position);
        } else if (modelUniforms?.CameraPos) {
            modelUniforms.CameraPos.value = this.camera.position;
        }
        if (modelUniforms?.projMat?.value?.copy) {
            modelUniforms.projMat.value.copy(this.camera.projectionMatrix);
        }
        if (modelUniforms?.viewMat?.value?.copy) {
            modelUniforms.viewMat.value.copy(this.camera.matrixWorldInverse);
        }
        if (modelUniforms?.transMat?.value?.copy) {
            if (this.modelObject) {
                this.modelObject.updateMatrixWorld(true);
                modelUniforms.transMat.value.copy(this.modelObject.matrixWorld);
            } else {
                modelUniforms.transMat.value.identity();
            }
        }

        for (const ps of this.passStates) {
            const uni = ps.pass?.uniforms;
            if (uni?.uTime) uni.uTime.value = this.time;
            if (uni?.CameraPos?.value?.copy) {
                uni.CameraPos.value.copy(this.camera.position);
            } else if (uni?.CameraPos) {
                uni.CameraPos.value = this.camera.position;
            }
            const primary = String(ps.pass?.textureID || "tDiffuse");
            const primaryValue = uni?.[primary]?.value;
            if (Array.isArray(ps.pass?.__inputUniformAliases) && primaryValue) {
                for (const alias of ps.pass.__inputUniformAliases) {
                    if (!uni?.[alias]) continue;
                    uni[alias].value = primaryValue;
                }
            }
        }
    }

    loop() {
        requestAnimationFrame(this.loop);
        this.controls.update();
        const delta = this.clock.getDelta();
        this.applyKeyboardPan(delta);
        this.updateDynamicUniforms(delta);

        if (this.noOutputPreview) {
            this.renderer.setRenderTarget(null);
            this.renderer.setClearColor(0x000000, 1);
            this.renderer.clear(true, true, true);
            if (this.helpersIndependentRender) {
                this.renderHelperOverlay();
            }
            return;
        }

        if (this.helpersIndependentRender && this.hasVisibleHelpers()) {
            const prevHelpersVisible = this.helperRoot.visible;
            this.helperRoot.visible = false;
            try {
                this.renderMainFrame();
                if (this.useComposer && this.composer) {
                    // Rebuild default framebuffer depth with world only, keep current color.
                    this.renderWorldDepthPrepass();
                }
            } finally {
                this.helperRoot.visible = prevHelpersVisible;
            }
            this.renderHelperOverlay();
        } else {
            this.renderMainFrame();
        }
    }
}
