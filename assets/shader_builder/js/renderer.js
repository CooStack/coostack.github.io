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
    code = code.replace(/^\s*layout\s*\(\s*location\s*=\s*\d+\s*\)\s*out\s+vec4\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, (_, name) => {
        outNames.push(String(name || ""));
        return "";
    });
    code = code.replace(/^\s*out\s+vec4\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, (_, name) => {
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
    code = code.replace(/^\s*layout\s*\(\s*location\s*=\s*\d+\s*\)\s*out\s+vec4\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, (_, name) => {
        outNames.push(String(name || ""));
        return "";
    });
    code = code.replace(/^\s*out\s+vec4\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, (_, name) => {
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

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.target.set(0, 0, 0);
        // Match pointsbuilder interaction:
        // left mouse: disabled, middle: rotate, right: pan.
        this.controls.mouseButtons.LEFT = null;
        this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;

        this.axesHelper = new THREE.AxesHelper(8);
        this.gridHelper = new THREE.GridHelper(40, 40, 0x405060, 0x263341);
        this.scene.add(this.axesHelper);
        this.scene.add(this.gridHelper);

        this.scene.add(new THREE.HemisphereLight(0xb3d4ff, 0x0f141d, 0.9));
        const dir = new THREE.DirectionalLight(0xffffff, 1.15);
        dir.position.set(4, 9, 5);
        this.scene.add(dir);

        this.modelRoot = new THREE.Group();
        this.scene.add(this.modelRoot);

        this.clock = new THREE.Clock();
        this.time = 0;

        this.fallbackTexture = createWhiteTexture();
        this.textureCache = new Map();

        this.modelObject = null;
        this.modelMaterial = null;
        this.composer = null;
        this.renderPass = null;
        this.passStates = [];
        this.useComposer = false;
        this.noOutputPreview = false;

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.hostEl);

        this.setPrimitive("sphere");
        this.resize();

        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    dispose() {
        this.resizeObserver.disconnect();
        this.controls.dispose();
        this.renderer.dispose();
        this.fallbackTexture.dispose();
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

    applySettings(settings) {
        this.axesHelper.visible = !!settings?.showAxes;
        this.gridHelper.visible = !!settings?.showGrid;
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

    createShaderPassFromNode(node) {
        if (String(node?.type || "").toLowerCase() === "texture") {
            return this.createTextureNodePass(node);
        }

        const useGlsl3 = !!this.renderer?.capabilities?.isWebGL2;
        const fragmentSource = adaptPostFragmentForPreview(node?.fragmentSource || "", { useGlsl3 });
        const uniforms = this.buildUniformMap(node.params || [], true);

        const samplerUniformNames = collectSamplerUniformNames(node?.fragmentSource || "");
        const uploadedTextureUniforms = new Set();
        const inputSamplerUniforms = [];
        const addInputSampler = (name) => {
            const n = String(name || "").trim();
            if (!n) return;
            if (uploadedTextureUniforms.has(n)) return;
            if (!inputSamplerUniforms.includes(n)) inputSamplerUniforms.push(n);
        };

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
        }

        for (const uniformName of samplerUniformNames) {
            addInputSampler(uniformName);
        }
        if (!uploadedTextureUniforms.has("tDiffuse")) addInputSampler("tDiffuse");
        if (!uploadedTextureUniforms.has("tex")) addInputSampler("tex");
        if (!uploadedTextureUniforms.has("samp")) addInputSampler("samp");

        for (const uniformName of inputSamplerUniforms) {
            if (!uniforms[uniformName]) {
                uniforms[uniformName] = { value: null };
            }
        }

        let primaryInputUniform = "tDiffuse";
        if (uploadedTextureUniforms.has(primaryInputUniform)) {
            primaryInputUniform = "";
        }

        if (samplerUniformNames.includes("tDiffuse") && !uploadedTextureUniforms.has("tDiffuse")) {
            primaryInputUniform = "tDiffuse";
        } else {
            for (const name of samplerUniformNames) {
                if (uploadedTextureUniforms.has(name)) continue;
                if (inputSamplerUniforms.includes(name)) {
                    primaryInputUniform = name;
                    break;
                }
            }
            if (!primaryInputUniform && inputSamplerUniforms.length) {
                primaryInputUniform = inputSamplerUniforms[0];
            }
            if (!primaryInputUniform) {
                primaryInputUniform = "tDiffuse";
            }
        }

        const shader = {
            uniforms,
            vertexShader: useGlsl3 ? PREVIEW_POST_VERTEX_GLSL3 : PREVIEW_POST_VERTEX_GLSL1,
            fragmentShader: fragmentSource
        };
        if (useGlsl3) shader.glslVersion = THREE.GLSL3;

        const pass = new ShaderPass(shader);
        if (primaryInputUniform && pass.uniforms?.[primaryInputUniform]) {
            pass.textureID = primaryInputUniform;
        }

        const inputUniformTargets = inputSamplerUniforms.filter((name) => !!pass.uniforms?.[name]);
        if (inputUniformTargets.length) {
            pass.__inputUniformTargets = inputUniformTargets;
            pass.__inputUniformAliases = inputUniformTargets.filter((name) => name !== pass.textureID);
            const originalRender = pass.render.bind(pass);
            pass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
                const readTexture = readBuffer?.texture || pass.uniforms?.[pass.textureID]?.value || null;
                for (const uniformName of pass.__inputUniformTargets || []) {
                    if (!pass.uniforms?.[uniformName]) continue;
                    pass.uniforms[uniformName].value = readTexture;
                }
                return originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
            };
        }

        return pass;
    }

    createTextureNodePass(node) {
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
                ? `in vec2 vUv;\nuniform sampler2D tDiffuse;\nout vec4 FragColor;\nvoid main(){ FragColor = texture(tDiffuse, vUv); }`
                : `varying vec2 vUv;\nuniform sampler2D tDiffuse;\nvoid main(){ gl_FragColor = texture2D(tDiffuse, vUv); }`
        };
        if (useGlsl3) shader.glslVersion = THREE.GLSL3;
        return new ShaderPass(shader);
    }

    applyPostPipeline(state) {
        const enabled = !!state?.model?.enablePost;
        const graphResolved = resolveChain(state);
        const chain = graphResolved.chain;

        this.composer = new EffectComposer(this.renderer);
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);
        this.passStates = [];
        this.noOutputPreview = false;

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
            for (let i = 0; i < repeat; i++) {
                const pass = this.createShaderPassFromNode(node);
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

    updateDynamicUniforms() {
        this.time += this.clock.getDelta();

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
        this.updateDynamicUniforms();

        if (this.noOutputPreview) {
            this.renderer.setRenderTarget(null);
            this.renderer.setClearColor(0x000000, 1);
            this.renderer.clear(true, true, true);
            return;
        }

        if (this.useComposer && this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }
}
