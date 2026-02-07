import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clamp, lerp, rand, randInt, safeNum } from "./utils.js";

export function initPreview(ctx = {}) {
    const {
        getState,
        viewportEl,
        statEl,
    } = ctx;

    let renderer, scene, camera, controls;
    let points, pointsGeo, pointsMat;
    let axesHelper, gridHelper;
    let pointScale = 1.0;

    const MAX_POINTS = 65536;
    const sim = {
        tickAcc: 0,
        lastTime: performance.now(),
        particles: [],
        emitRuntime: new Map(), // emitterId -> { burstTick:number, emittedOnce:boolean }
    };


    function getEmittersFromState(state) {
        const arr = Array.isArray(state?.emitters) ? state.emitters : null;
        if (arr && arr.length) return arr;
        // legacy fallback (older schema: state.emitter/state.emission/state.particle)
        if (state && state.emitter && state.particle) {
            return [{
                id: "legacy_emitter",
                emission: state.emission || { mode: "continuous", burstInterval: 0.5 },
                emitter: state.emitter,
                particle: state.particle,
            }];
        }
        return [];
    }

    function ensureEmitterRuntime(emitters) {
        const alive = new Set();
        for (const c of emitters || []) {
            const id = c && c.id != null ? String(c.id) : null;
            if (!id) continue;
            alive.add(id);
            if (!sim.emitRuntime.has(id)) {
                sim.emitRuntime.set(id, { burstTick: 1e9, emittedOnce: false });
            }
        }
        for (const id of Array.from(sim.emitRuntime.keys())) {
            if (!alive.has(id)) sim.emitRuntime.delete(id);
        }
    }

    const shouldIgnoreArrowPan = (typeof ctx.shouldIgnoreArrowPan === "function")
        ? ctx.shouldIgnoreArrowPan
        : () => {
            const ae = document.activeElement;
            if (!ae) return false;
            const tag = (ae.tagName || "").toUpperCase();
            if (tag === "INPUT" || tag === "TEXTAREA") return true;
            return !!ae.isContentEditable;
        };
    const panKeyState = {ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false};
    const PAN_KEY_SPEED = 0.0025;
    const DEG_TO_RAD = Math.PI / 180;
    const _panDir = new THREE.Vector3();
    const _panRight = new THREE.Vector3();
    const _panUp = new THREE.Vector3();
    const _panMove = new THREE.Vector3();

    function isArrowKey(code) {
        return code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight";
    }

    function applyArrowPan() {
        if (!controls || !camera) return;
        if (!panKeyState.ArrowUp && !panKeyState.ArrowDown && !panKeyState.ArrowLeft && !panKeyState.ArrowRight) return;
        const dist = camera.position.distanceTo(controls.target);
        const step = Math.max(0.0001, dist * PAN_KEY_SPEED) * (controls.panSpeed || 1);
        camera.getWorldDirection(_panDir);
        _panRight.crossVectors(_panDir, camera.up).normalize();
        _panUp.copy(camera.up).normalize();
        _panMove.set(0, 0, 0);
        if (panKeyState.ArrowLeft) _panMove.addScaledVector(_panRight, -step);
        if (panKeyState.ArrowRight) _panMove.addScaledVector(_panRight, step);
        if (panKeyState.ArrowUp) _panMove.addScaledVector(_panUp, step);
        if (panKeyState.ArrowDown) _panMove.addScaledVector(_panUp, -step);
        if (_panMove.lengthSq() > 0) {
            controls.target.add(_panMove);
            camera.position.add(_panMove);
        }
    }

    function bindArrowPan() {
        window.addEventListener("keydown", (e) => {
            if (!isArrowKey(e.code) || shouldIgnoreArrowPan()) return;
            e.preventDefault();
            panKeyState[e.code] = true;
        }, true);
        window.addEventListener("keyup", (e) => {
            if (!isArrowKey(e.code)) return;
            panKeyState[e.code] = false;
        }, true);
        window.addEventListener("blur", () => {
            panKeyState.ArrowUp = false;
            panKeyState.ArrowDown = false;
            panKeyState.ArrowLeft = false;
            panKeyState.ArrowRight = false;
        });
    }

    function makePointShaderMaterial() {
        return new THREE.ShaderMaterial({
            transparent: false,
            depthWrite: true,
            depthTest: true,
            uniforms: {
                uViewportY: {value: 600.0},
            },
            vertexShader: `
        attribute float size;
        attribute vec3 aColor;
        varying vec3 vColor;
        uniform float uViewportY;

        void main() {
          vColor = aColor;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float perspFlag = step(0.5, abs(projectionMatrix[2][3]));
          float pxPerWorldAtZ1 = 0.5 * uViewportY * projectionMatrix[1][1];

          float z = max(0.001, -mvPosition.z);
          float atten = mix(1.0, 1.0 / z, perspFlag);

          float s = size * pxPerWorldAtZ1 * atten;

          gl_PointSize = clamp(s, 1.0, 64.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
            fragmentShader: `
            varying vec3 vColor;

            void main() {
              vec2 uv = gl_PointCoord - vec2(0.5);
              float d = length(uv);
              if (d > 0.5) discard;
              gl_FragColor = vec4(vColor, 1.0);
            }
          `
        });
    }

    function initThree() {
        const el = viewportEl || document.getElementById("viewport");
        const w = el.clientWidth, h = el.clientHeight;

        renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        el.innerHTML = "";
        el.appendChild(renderer.domElement);

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(55, w / h, 0.01, 5000);
        camera.position.set(10, 10, 10);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.mouseButtons.LEFT = null;
        controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
        controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
        controls.target.set(0, 0, 0);
        controls.update();
        renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
        bindArrowPan();

        const GRID_SIZE = 512;
        const GRID_DIV = 512;
        gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIV, 0x233044, 0x1a2434);
        gridHelper.position.y = -0.01;
        scene.add(gridHelper);

        axesHelper = new THREE.AxesHelper(64);
        scene.add(axesHelper);

        pointsGeo = new THREE.BufferGeometry();
        const pos = new Float32Array(MAX_POINTS * 3);
        const col = new Float32Array(MAX_POINTS * 3);
        const siz = new Float32Array(MAX_POINTS);
        pointsGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        pointsGeo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
        pointsGeo.setAttribute("size", new THREE.BufferAttribute(siz, 1));
        pointsGeo.setDrawRange(0, 0);

        pointsMat = makePointShaderMaterial();
        points = new THREE.Points(pointsGeo, pointsMat);
        points.frustumCulled = false;
        scene.add(points);

        window.addEventListener("resize", () => resizeRenderer());
        resizeRenderer();
    }

    function resizeRenderer() {
        const el = viewportEl || document.getElementById("viewport");
        const ww = el.clientWidth, hh = el.clientHeight;
        if (!renderer || !camera) return;
        renderer.setSize(ww, hh);
        camera.aspect = ww / hh;
        camera.updateProjectionMatrix();
        if (pointsMat && pointsMat.uniforms && pointsMat.uniforms.uViewportY) {
            pointsMat.uniforms.uViewportY.value = renderer.domElement.height;
        }
    }

    function hexToRgb01(hex) {
        const h = (hex || "").replace("#", "").trim();
        if (h.length !== 6) return {r: 1, g: 1, b: 1};
        const n = parseInt(h, 16);
        const r = ((n >> 16) & 255) / 255;
        const g = ((n >> 8) & 255) / 255;
        const b = (n & 255) / 255;
        return {r, g, b};
    }

    function lerp3(a, b, t) {
        return {r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t)};
    }

    function updatePointsBuffer() {
        const state = getState();
        const pArr = sim.particles;
        const posAttr = pointsGeo.getAttribute("position");
        const colAttr = pointsGeo.getAttribute("aColor");
        const sizeAttr = pointsGeo.getAttribute("size");
        const alpha = clamp(sim.tickAcc, 0, 1);

        const n = Math.min(pArr.length, MAX_POINTS);

        const white = {r: 1, g: 1, b: 1};

        for (let i = 0; i < n; i++) {
            const p = pArr[i];

            const ix = lerp(p.prevPos.x, p.pos.x, alpha);
            const iy = lerp(p.prevPos.y, p.pos.y, alpha);
            const iz = lerp(p.prevPos.z, p.pos.z, alpha);

            posAttr.array[i * 3 + 0] = ix;
            posAttr.array[i * 3 + 1] = iy;
            posAttr.array[i * 3 + 2] = iz;

            const t = clamp(p.age / Math.max(1, p.life), 0, 1);
            const c = lerp3(p.c0 || white, p.c1 || white, t);
            colAttr.array[i * 3 + 0] = c.r;
            colAttr.array[i * 3 + 1] = c.g;
            colAttr.array[i * 3 + 2] = c.b;

            sizeAttr.array[i] = p.size * pointScale;
        }

        pointsGeo.setDrawRange(0, n);
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;

        if (statEl) statEl.textContent = `Particles: ${pArr.length}`;
        else {
            const el = document.getElementById("statChip");
            if (el) el.textContent = `Particles: ${pArr.length}`;
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();
        const dt = (now - sim.lastTime) / 1000;
        sim.lastTime = now;

        const state = getState();
        if (state.playing) stepSim(dt);
        applyArrowPan();
        if (controls) controls.update();
        updatePointsBuffer();
        renderer.render(scene, camera);
    }

    function stepSim(dtSeconds) {
        const state = getState();
        const tps = Math.max(1, state.ticksPerSecond);
        sim.tickAcc += dtSeconds * tps;
        while (sim.tickAcc >= 1.0) {
            sim.tickAcc -= 1.0;
            tickOnce();
        }
    }

        function tickOnce() {
        const state = getState();
        const emitters = getEmittersFromState(state);
        ensureEmitterRuntime(emitters);

        const tps = Math.max(1, Number(state.ticksPerSecond) || 20);

        const spawnFor = (card) => {
            const pp = (card && card.particle) ? card.particle : {};
            const minC = Math.max(0, Math.trunc(Number(pp.countMin) || 0));
            const maxC = Math.max(minC, Math.trunc(Number(pp.countMax) || 0));
            const cnt = randInt(minC, maxC);
            for (let i = 0; i < cnt; i++) {
                if (sim.particles.length >= MAX_POINTS) break;
                sim.particles.push(makeParticle(card));
            }
        };

        for (const card of emitters) {
            const id = card && card.id != null ? String(card.id) : null;
            if (!id) continue;
            const mode = (card.emission && card.emission.mode) || "continuous";
            const rt = sim.emitRuntime.get(id);
            if (!rt) continue;

            if (mode === "once") {
                if (!rt.emittedOnce) {
                    spawnFor(card);
                    rt.emittedOnce = true;
                }
            } else if (mode === "burst") {
                const intervalSec = Math.max(0.01, safeNum(card.emission?.burstInterval, 0.5));
                const intervalTicks = Math.max(1, Math.round(intervalSec * tps));
                if (rt.burstTick >= intervalTicks) {
                    spawnFor(card);
                    rt.burstTick = 0;
                }
                rt.burstTick += 1;
            } else {
                spawnFor(card);
            }
        }

        const cmds = (state.commands || []).filter(c => c && c.enabled);
        for (let i = sim.particles.length - 1; i >= 0; i--) {
            const p = sim.particles[i];
            p.age++;

            for (const c of cmds) {
                const signs = c && c.signs;
                if (Array.isArray(signs) && signs.length) {
                    const ps = Math.trunc(Number(p.sign) || 0);
                    let ok = false;
                    for (const s of signs) {
                        if (Math.trunc(Number(s)) === ps) { ok = true; break; }
                    }
                    if (!ok) continue;
                }
                applyCommandJS(c, p, 1);
            }
            p.prevPos = p.pos;
            p.pos = p.pos.clone().add(p.vel);
            if (p.age >= p.life) sim.particles.splice(i, 1);
        }
    }

        function makeParticle(card) {
        const pp = (card && card.particle) ? card.particle : {};
        const pos = sampleEmitterPosition(card);

        const lifeMin = Math.max(1, Math.trunc(Number(pp.lifeMin) || 40));
        const lifeMax = Math.max(lifeMin, Math.trunc(Number(pp.lifeMax) || 120));
        const life = randInt(lifeMin, lifeMax);

        const sizeMin = Math.max(0.001, Number(pp.sizeMin) || 0.08);
        const sizeMax = Math.max(sizeMin, Number(pp.sizeMax) || 0.18);
        const size = rand(sizeMin, sizeMax);

        const v0 = pp.vel || {};
        const vdir = new THREE.Vector3(Number(v0.x) || 0, Number(v0.y) || 0, Number(v0.z) || 0);
        if (vdir.lengthSq() < 1e-10) vdir.set(0, 0, 0);
        else {
            const minSpeed = Math.max(0, Number(pp.velSpeedMin) || 0);
            const maxSpeed = Math.max(minSpeed, Number(pp.velSpeedMax) || minSpeed);
            const speed = rand(minSpeed, maxSpeed);
            vdir.normalize().multiplyScalar(speed);
        }

        const c0 = hexToRgb01(pp.colorStart || "#ffffff");
        const c1 = hexToRgb01(pp.colorEnd || "#ffffff");

        return {
            pos,
            prevPos: pos.clone(),
            vel: vdir,
            age: 0,
            life,
            size,
            c0,
            c1,
            sign: Math.trunc(Number(card?.template?.sign) || 0),
            seed: (Math.random() * 1e9) | 0,
        };
    }

    function rotateToAxis(vec, axis) {
        const ax = axis.clone();
        if (ax.lengthSq() < 1e-8) return vec;
        ax.normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(up, ax);
        return vec.applyQuaternion(q);
    }

        function sampleEmitterPosition(card) {
        const e = (card && card.emitter) ? card.emitter : {};
        const pp = (card && card.particle) ? card.particle : {};
        const t = e.type || "point";
        const off = new THREE.Vector3(
            Number(e.offset?.x) || 0,
            Number(e.offset?.y) || 0,
            Number(e.offset?.z) || 0
        );
        if (t === "point") return new THREE.Vector3(0, 0, 0).add(off);

        if (t === "box") {
            const bx = Number(e.box?.x) || 1;
            const by = Number(e.box?.y) || 1;
            const bz = Number(e.box?.z) || 1;
            const surface = !!e.box?.surface;
            const density = clamp(Number(e.box?.density) || 0, 0, 1);

            function biased(u) {
                if (density <= 0) return u;
                const s = Math.sign(u) || 1;
                const a = Math.abs(u);
                const pw = lerp(1.0, 4.0, density);
                return s * Math.pow(a, pw);
            }

            let x = biased(rand(-0.5, 0.5)) * bx;
            let y = biased(rand(-0.5, 0.5)) * by;
            let z = biased(rand(-0.5, 0.5)) * bz;

            if (surface) {
                const axis = randInt(0, 2);
                if (axis === 0) x = (Math.random() < 0.5 ? -0.5 : 0.5) * bx;
                if (axis === 1) y = (Math.random() < 0.5 ? -0.5 : 0.5) * by;
                if (axis === 2) z = (Math.random() < 0.5 ? -0.5 : 0.5) * bz;
            }
            return new THREE.Vector3(x, y, z).add(off);
        }

        if (t === "sphere") {
            const r = Math.max(0.001, Number(e.sphere?.r) || 1);
            const u = Math.random();
            const v = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);
            const dir = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );
            const rr = r * Math.cbrt(Math.random());
            return dir.multiplyScalar(rr).add(off);
        }

        if (t === "sphere_surface") {
            const r = Math.max(0.001, Number(e.sphereSurface?.r) || 1);
            const u = Math.random();
            const v = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);
            const dir = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );
            return dir.multiplyScalar(r).add(off);
        }

        if (t === "line") {
            const d = e.line?.dir || {x: 1, y: 0, z: 0};
            const dir = new THREE.Vector3(Number(d.x) || 0, Number(d.y) || 0, Number(d.z) || 0);
            const step = Math.max(0.0001, Number(e.line?.step) || 0.25);
            const count = Math.max(1, Math.trunc(Number(pp.countMax) || 1));
            if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
            dir.normalize();
            const idx = randInt(0, Math.max(0, count - 1));
            return dir.multiplyScalar(step * idx).add(off);
        }

        if (t === "circle") {
            const r = Math.max(0.001, Number(e.circle?.r) || 1);
            const a = rand(0, Math.PI * 2);
            const vec = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
            const ax0 = e.circle?.axis || {x: 0, y: 1, z: 0};
            const axis = new THREE.Vector3(safeNum(ax0.x, 0), safeNum(ax0.y, 1), safeNum(ax0.z, 0));
            return rotateToAxis(vec, axis).add(off);
        }

        if (t === "arc") {
            const r = Math.max(0.001, Number(e.arc?.r) || 1);
            let a0 = safeNum(e.arc?.start, 0) * DEG_TO_RAD;
            let a1 = safeNum(e.arc?.end, 0) * DEG_TO_RAD;
            if (a1 < a0) [a0, a1] = [a1, a0];
            const rot = safeNum(e.arc?.rotate, 0) * DEG_TO_RAD;
            const a = rand(a0, a1) + rot;
            const vec = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
            const ax0 = e.arc?.axis || {x: 0, y: 1, z: 0};
            const axis = new THREE.Vector3(safeNum(ax0.x, 0), safeNum(ax0.y, 1), safeNum(ax0.z, 0));
            return rotateToAxis(vec, axis).add(off);
        }

        if (t === "spiral") {
            const s = e.spiral || {};
            const count = Math.max(2, Math.trunc(Number(pp.countMax) || 2));
            const idx = randInt(0, count - 1);
            const process = idx / Math.max(1, count - 1);
            const rBias = Math.pow(process, Math.max(0.01, Number(s.rBias) || 1.0));
            const hBias = Math.pow(process, Math.max(0.01, Number(s.hBias) || 1.0));
            const radius = lerp(Number(s.startR) || 0.5, Number(s.endR) || 2.5, rBias);
            const height = lerp(0, Number(s.height) || 2.0, hBias);
            const angle = idx * (Number(s.rotateSpeed) || 0);
            const vec = new THREE.Vector3(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
            const ax0 = s.axis || {x: 0, y: 1, z: 0};
            const axis = new THREE.Vector3(safeNum(ax0.x, 0), safeNum(ax0.y, 1), safeNum(ax0.z, 0));
            return rotateToAxis(vec, axis).add(off);
        }

        // ring fallback
        const rr = Math.max(0.001, Number(e.ring?.r) || 1);
        const th = Math.max(0, Number(e.ring?.thickness) || 0);
        const a = rand(0, Math.PI * 2);
        let x = Math.cos(a) * rr;
        let z = Math.sin(a) * rr;
        let y = 0;

        if (th > 0) {
            const j = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
            if (j.lengthSq() > 1e-8) j.normalize().multiplyScalar(rand(0, th));
            x += j.x;
            y += j.y;
            z += j.z;
        }

        const ax0 = e.ring?.axis || {x: 0, y: 1, z: 0};
        const axis = new THREE.Vector3(safeNum(ax0.x, 0), safeNum(ax0.y, 1), safeNum(ax0.z, 0));
        return rotateToAxis(new THREE.Vector3(x, y, z), axis).add(off);
    }

    function expDampFactor(damping, dt) {
        return Math.exp(-Math.max(0, damping) * dt);
    }

    function fadeK(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    function lerpK(a, b, t) {
        return a + (b - a) * t;
    }

    function hash3K(ix, iy, iz, seed) {
        let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647) + Math.imul(seed, 374761)) | 0;
        n = Math.imul((n ^ (n >>> 13)) | 0, 1274126177) | 0;
        n = (n ^ (n >>> 16)) | 0;
        return ((n & 0x7fffffff) / 2147483647.0);
    }

    function valueNoise3K(p, seed) {
        const x0 = Math.floor(p.x) | 0;
        const y0 = Math.floor(p.y) | 0;
        const z0 = Math.floor(p.z) | 0;

        const fx = p.x - x0;
        const fy = p.y - y0;
        const fz = p.z - z0;

        const u = fadeK(fx);
        const v = fadeK(fy);
        const w = fadeK(fz);

        const h = (dx, dy, dz) => hash3K((x0 + dx), (y0 + dy), (z0 + dz), seed);

        const n000 = h(0, 0, 0);
        const n100 = h(1, 0, 0);
        const n010 = h(0, 1, 0);
        const n110 = h(1, 1, 0);
        const n001 = h(0, 0, 1);
        const n101 = h(1, 0, 1);
        const n011 = h(0, 1, 1);
        const n111 = h(1, 1, 1);

        const nx00 = lerpK(n000, n100, u);
        const nx10 = lerpK(n010, n110, u);
        const nx01 = lerpK(n001, n101, u);
        const nx11 = lerpK(n011, n111, u);

        const nxy0 = lerpK(nx00, nx10, v);
        const nxy1 = lerpK(nx01, nx11, v);

        return lerpK(nxy0, nxy1, w);
    }

    function noiseVec3K(pos, seed) {
        const nx = valueNoise3K(pos, (seed + 11)) * 2 - 1;
        const ny = valueNoise3K(pos, (seed + 23)) * 2 - 1;
        const nz = valueNoise3K(pos, (seed + 37)) * 2 - 1;
        const v = new THREE.Vector3(nx, ny, nz);
        if (v.lengthSq() < 1e-9) return new THREE.Vector3(0, 0, 0);
        return v.normalize();
    }

    function inversePowerFalloff(dist, range, power) {
        const r = Math.max(1e-6, Number(range) || 1e-6);
        const p = Math.max(1.0, Number(power) || 1.0);
        const x = dist / r;
        return 1.0 / (1.0 + Math.pow(x, p));
    }

    function anyPerpToAxis(axisUnit) {
        const up = (Math.abs(axisUnit.y) < 0.99) ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const p = up.clone().cross(axisUnit);
        if (p.lengthSq() < 1e-12) return new THREE.Vector3(1, 0, 0);
        return p.normalize();
    }

    function applyCommandJS(cmd, particle, dt) {
        const p = cmd.params;

        switch (cmd.type) {
            case "ParticleNoiseCommand": {
                const t01 = (particle.life > 0) ? (particle.age / particle.life) : 0.0;
                const seed = (particle.seed | 0);

                const strength = safeNum(p.strength, 0.03);
                const frequency = safeNum(p.frequency, 0.15);
                const speed = safeNum(p.speed, 0.12);
                const affectY = safeNum(p.affectY, 1.0);
                const clampSpeed = Math.max(0.0001, safeNum(p.clampSpeed, 0.8));
                const useLifeCurve = !!p.useLifeCurve;

                const time = particle.age * speed;
                const samplePos = new THREE.Vector3(particle.pos.x, particle.pos.y, particle.pos.z)
                    .multiplyScalar(frequency)
                    .add(new THREE.Vector3(time, time * 0.7, time * 1.3));

                const n = noiseVec3K(samplePos, seed);

                let amp = strength;
                if (useLifeCurve) amp *= (1.0 - clamp(t01, 0, 1));

                const dv = new THREE.Vector3(n.x, n.y * affectY, n.z).multiplyScalar(amp);

                particle.vel.add(dv);

                const sp2 = particle.vel.lengthSq();
                const max2 = clampSpeed * clampSpeed;
                if (sp2 > max2) {
                    particle.vel.normalize().multiplyScalar(clampSpeed);
                }
                break;
            }

            case "ParticleDragCommand": {
                const damping = safeNum(p.damping, 0.15);
                const minSpeed = safeNum(p.minSpeed, 0.0);
                const linear = safeNum(p.linear, 0.0);

                const sp = particle.vel.length();
                if (minSpeed > 0 && sp <= minSpeed) {
                    particle.vel.set(0, 0, 0);
                    break;
                }
                particle.vel.multiplyScalar(expDampFactor(damping, 1.0));
                if (linear > 0) particle.vel.multiplyScalar(clamp(1.0 - linear, 0, 1));
                break;
            }

            case "ParticleFlowFieldCommand": {
                const amplitude = safeNum(p.amplitude, 0.15);
                const frequency = safeNum(p.frequency, 0.25);
                const timeScale = safeNum(p.timeScale, 0.06);
                const phaseOffset = safeNum(p.phaseOffset, 0.0);

                const ox = safeNum(p.worldOffsetX, 0.0);
                const oy = safeNum(p.worldOffsetY, 0.0);
                const oz = safeNum(p.worldOffsetZ, 0.0);

                const samplePos = new THREE.Vector3(
                    particle.pos.x + ox,
                    particle.pos.y + oy,
                    particle.pos.z + oz
                );

                const t = (particle.age * timeScale) + phaseOffset;

                const fx =
                    Math.sin((samplePos.y + t) * frequency) +
                    Math.cos((samplePos.z - t) * frequency);

                const fy =
                    Math.sin((samplePos.z + t) * frequency) +
                    Math.cos((samplePos.x + t) * frequency);

                const fz =
                    Math.sin((samplePos.x - t) * frequency) +
                    Math.cos((samplePos.y - t) * frequency);

                const scale = 0.5;
                const dv = new THREE.Vector3(fx * scale, fy * scale, fz * scale)
                    .multiplyScalar(amplitude);

                particle.vel.add(dv);
                break;
            }

            case "ParticleAttractionCommand": {
                const tx = Number(p.targetX) || 0;
                const ty = Number(p.targetY) || 0;
                const tz = Number(p.targetZ) || 0;

                const strength = Number(p.strength) || 0;
                const range = Number(p.range) || 1;
                const falloffPower = Number(p.falloffPower) || 2;
                const minDistance = Math.max(1e-6, Number(p.minDistance) || 0.25);

                const dir = new THREE.Vector3(tx, ty, tz).sub(particle.pos);
                const rawDist = dir.length();
                if (rawDist < 1e-9) break;

                const dist = Math.max(rawDist, minDistance);
                const falloff = inversePowerFalloff(dist, range, falloffPower);

                const a = dir.multiplyScalar(1.0 / dist).multiplyScalar(strength * falloff);
                particle.vel.add(a);
                break;
            }

            case "ParticleOrbitCommand": {
                const cx = Number(p.centerX) || 0, cy = Number(p.centerY) || 0, cz = Number(p.centerZ) || 0;

                const ax = Number(p.axisX) || 0, ay = Number(p.axisY) || 1, az = Number(p.axisZ) || 0;
                const axis = new THREE.Vector3(ax, ay, az);
                const axisLen = axis.length();
                if (axisLen < 1e-9) break;
                axis.multiplyScalar(1.0 / axisLen);

                const radius = Number(p.radius) || 0;
                const angularSpeed = Number(p.angularSpeed) || 0;
                const radialCorrect = Number(p.radialCorrect) || 0;
                const minDistance = Math.max(1e-6, Number(p.minDistance) || 0.2);
                const maxRadialStep = Number(p.maxRadialStep) || 0.5;
                const mode = (p.mode || "PHYSICAL");

                const center = new THREE.Vector3(cx, cy, cz);

                const r = particle.pos.clone().sub(center);
                const axial = axis.clone().multiplyScalar(r.dot(axis));
                const radialVec = r.clone().sub(axial);

                const radialDist0 = radialVec.length();

                const radialN = (radialDist0 < 1e-6)
                    ? anyPerpToAxis(axis)
                    : radialVec.multiplyScalar(1.0 / Math.max(radialDist0, minDistance));

                const radialDist = Math.max(radialDist0, minDistance);

                let tang = axis.clone().cross(radialN);
                const tLen = tang.length();
                if (tLen < 1e-9) tang = anyPerpToAxis(axis);
                else tang.multiplyScalar(1.0 / tLen);

                const dvTan = tang.multiplyScalar(angularSpeed);
                const err = radialDist - radius;

                if (mode === "SNAP") {
                    const targetPos = center.clone().add(axial).add(radialN.clone().multiplyScalar(radius));
                    const snapVec = targetPos.sub(particle.pos);
                    particle.vel.add(dvTan).add(snapVec.multiplyScalar(radialCorrect));
                } else {
                    const raw = (-err) * radialCorrect;
                    const step = clamp(raw, -maxRadialStep, maxRadialStep);
                    const dvRad = radialN.clone().multiplyScalar(step);
                    particle.vel.add(dvTan).add(dvRad);
                }
                break;
            }

            case "ParticleVortexCommand": {
                const cx = Number(p.centerX) || 0, cy = Number(p.centerY) || 0, cz = Number(p.centerZ) || 0;

                const ax0 = Number(p.axisX) || 0, ay0 = Number(p.axisY) || 1, az0 = Number(p.axisZ) || 0;
                const axis = new THREE.Vector3(ax0, ay0, az0);
                const axisLen = axis.length();
                if (axisLen < 1e-9) break;
                axis.multiplyScalar(1.0 / axisLen);

                const swirlStrength = Number(p.swirlStrength) || 0;
                const radialPull = Number(p.radialPull) || 0;
                const axialLift = Number(p.axialLift) || 0;

                const range = Number(p.range) || 1;
                const falloffPower = Number(p.falloffPower) || 1;
                const minDistance = Math.max(1e-6, Number(p.minDistance) || 0.2);

                const center = new THREE.Vector3(cx, cy, cz);

                const r = particle.pos.clone().sub(center);
                const dist0 = r.length();
                if (dist0 < 1e-9) break;

                const dist = Math.max(dist0, minDistance);
                const falloff = inversePowerFalloff(dist, range, falloffPower);

                const tang = axis.clone().cross(r);
                const tLen = tang.length();
                if (tLen < 1e-9) break;
                tang.multiplyScalar(1.0 / tLen);

                const inward = r.multiplyScalar(-1.0 / dist);

                const dv = new THREE.Vector3(0, 0, 0)
                    .add(tang.multiplyScalar(swirlStrength * falloff))
                    .add(inward.multiplyScalar(radialPull * falloff))
                    .add(axis.clone().multiplyScalar(axialLift * falloff));

                particle.vel.add(dv);
                break;
            }

            case "ParticleRotationForceCommand": {
                const cx = Number(p.centerX) || 0, cy = Number(p.centerY) || 0, cz = Number(p.centerZ) || 0;

                const ax0 = Number(p.axisX) || 0, ay0 = Number(p.axisY) || 1, az0 = Number(p.axisZ) || 0;
                const ax = new THREE.Vector3(ax0, ay0, az0);
                const axLen = ax.length();
                if (axLen < 1e-9) break;
                ax.multiplyScalar(1.0 / axLen);

                const strength = Number(p.strength) || 0;
                const range = Number(p.range) || 1;
                const falloffPower = Number(p.falloffPower) || 1;

                const r = particle.pos.clone().sub(new THREE.Vector3(cx, cy, cz));
                const dist = r.length();
                if (dist < 1e-9) break;

                let t = ax.clone().cross(r);
                const tLen = t.length();
                if (tLen < 1e-9) break;
                t.multiplyScalar(1.0 / tLen);

                const falloff = inversePowerFalloff(dist, range, falloffPower);
                const dv = t.multiplyScalar(strength * falloff);

                particle.vel.add(dv);
                break;
            }

            case "ParticleDistortionCommand": {
                const cx = Number(p.centerX) || 0;
                const cy = Number(p.centerY) || 0;
                const cz = Number(p.centerZ) || 0;

                const ax0 = Number(p.axisX) || 0;
                const ay0 = Number(p.axisY) || 1;
                const az0 = Number(p.axisZ) || 0;
                const axis = new THREE.Vector3(ax0, ay0, az0);
                const axisLen = axis.length();
                if (axisLen < 1e-9) {
                    axis.set(0, 1, 0);
                } else {
                    axis.multiplyScalar(1.0 / axisLen);
                }

                const radius = Number(p.radius) || 0;
                const radialStrength = Number(p.radialStrength) || 0;
                const axialStrength = Number(p.axialStrength) || 0;
                const tangentialStrength = Number(p.tangentialStrength) || 0;
                const frequency = Number(p.frequency) || 0;
                const timeScale = Number(p.timeScale) || 0;
                const phaseOffset = Number(p.phaseOffset) || 0;
                const followStrength = Number(p.followStrength) || 0;
                const maxStep = Number(p.maxStep) || 0;
                const baseAxial = Number(p.baseAxial) || 0;
                const seedOffset = Math.trunc(Number(p.seedOffset) || 0);
                const useLifeCurve = !!p.useLifeCurve;

                const center = new THREE.Vector3(cx, cy, cz);
                const r = particle.pos.clone().sub(center);
                const axialComp = axis.clone().multiplyScalar(r.dot(axis));
                let radial = r.clone().sub(axialComp);
                let radialLen = radial.length();
                if (radialLen < 1e-9) {
                    radial = anyPerpToAxis(axis);
                    radialLen = 1.0;
                } else {
                    radial.multiplyScalar(1.0 / radialLen);
                }

                let tangent = axis.clone().cross(radial);
                const tLen = tangent.length();
                if (tLen < 1e-9) tangent = anyPerpToAxis(axis);
                else tangent.multiplyScalar(1.0 / tLen);

                const lifeT = (particle.life > 0) ? (particle.age / particle.life) : 0.0;
                const lifeMul = useLifeCurve ? clamp(1.0 - lifeT, 0, 1) : 1.0;

                const time = particle.age * timeScale + phaseOffset;
                const local = particle.pos.clone().sub(center);
                const samplePos = local.multiplyScalar(frequency)
                    .add(new THREE.Vector3(time, time * 0.7, time * 1.3));
                const seed = (particle.seed | 0) + seedOffset;

                const nr = valueNoise3K(samplePos, seed + 11) * 2 - 1;
                const na = valueNoise3K(samplePos, seed + 23) * 2 - 1;
                const nt = valueNoise3K(samplePos, seed + 37) * 2 - 1;

                const targetRadius = Math.max(0.0, radius + nr * radialStrength * lifeMul);
                const targetAxial = baseAxial + na * axialStrength * lifeMul;
                const targetTangential = nt * tangentialStrength * lifeMul;

                const targetPos = center.clone()
                    .add(axis.clone().multiplyScalar(targetAxial))
                    .add(radial.clone().multiplyScalar(targetRadius))
                    .add(tangent.clone().multiplyScalar(targetTangential));

                let dv = targetPos.sub(particle.pos).multiplyScalar(followStrength);
                const dvLen = dv.length();
                if (maxStep > 0.0 && dvLen > maxStep) {
                    dv.multiplyScalar(maxStep / dvLen);
                }
                particle.vel.add(dv);
                break;
            }

            case "ParticleGravityCommand": {
                const g = 0.8;
                particle.vel.y -= g * dt;
                particle.vel.multiplyScalar(Math.pow(0.98, dt * 20.0));
                break;
            }

            default:
                break;
        }
    }

    function clearParticles(resetEmit = true) {
        sim.particles.length = 0;
        if (resetEmit) resetEmission();
    }

        function resetEmission() {
        const state = getState();
        const emitters = getEmittersFromState(state);
        ensureEmitterRuntime(emitters);
        for (const rt of sim.emitRuntime.values()) {
            rt.emittedOnce = false;
            rt.burstTick = 1e9;
        }
    }

    function setShowAxes(show) {
        if (axesHelper) axesHelper.visible = !!show;
    }

    function setShowGrid(show) {
        if (gridHelper) gridHelper.visible = !!show;
    }

    function setPointScale(next) {
        const v = Number(next);
        pointScale = Number.isFinite(v) && v > 0 ? v : 1.0;
    }

    function resetTime() {
        sim.lastTime = performance.now();
    }

    initThree();
    animate();

    return {
        resizeRenderer,
        clearParticles,
        resetEmission,
        setShowAxes,
        setShowGrid,
        setPointScale,
        resetTime,
    };
}
