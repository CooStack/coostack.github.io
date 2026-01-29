(() => {
    // ---------- utils ----------
    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
    const lerp = (a, b, t) => a + (b - a) * t;
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const vec3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const safeNum = (v, def = 0) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    };
    const fmtD = (n) => {
        if (!Number.isFinite(n)) return "0.0";
        let s = (Math.round(n * 1000000) / 1000000).toString();
        if (!s.includes(".")) s += ".0";
        return s;
    };
    const fmtB = (b) => (b ? "true" : "false");

    const kVec3 = (x, y, z) => `Vec3(${fmtD(x)}, ${fmtD(y)}, ${fmtD(z)})`;
    const kSupplierVec3 = (x, y, z) => `Supplier { ${kVec3(x, y, z)} }`;

    // ---------- command templates ----------
    const COMMAND_META = {
        ParticleNoiseCommand: {
            title: "Noise 噪声扰动",
            fields: [
                {k: "strength", t: "number", step: 0.001, def: 0.05},
                {k: "frequency", t: "number", step: 0.001, def: 0.01},
                {k: "speed", t: "number", step: 0.001, def: 0.05},
                {k: "affectY", t: "number", step: 0.01, def: 1.0},
                {k: "clampSpeed", t: "number", step: 0.01, def: 15.0},
                {k: "useLifeCurve", t: "bool", def: true},
            ],
            toKotlin: (c) => chain([
                `ParticleNoiseCommand()`,
                `.strength(${fmtD(c.params.strength)})`,
                `.frequency(${fmtD(c.params.frequency)})`,
                `.speed(${fmtD(c.params.speed)})`,
                `.affectY(${fmtD(c.params.affectY)})`,
                `.clampSpeed(${fmtD(c.params.clampSpeed)})`,
                `.useLifeCurve(${fmtB(c.params.useLifeCurve)})`,
            ]),
        },

        ParticleDragCommand: {
            title: "Drag 空气阻力",
            fields: [
                {k: "damping", t: "number", step: 0.01, def: 0.8},
                {k: "linear", t: "number", step: 0.001, def: 0.005},
                {k: "minSpeed", t: "number", step: 0.001, def: 0.01},
            ],
            toKotlin: (c) => chain([
                `ParticleDragCommand()`,
                `.damping(${fmtD(c.params.damping)})`,
                `.linear(${fmtD(c.params.linear)})`,
                `.minSpeed(${fmtD(c.params.minSpeed)})`,
            ]),
        },

        ParticleFlowFieldCommand: {
            title: "FlowField 流场",
            fields: [
                {k: "amplitude", t: "number", step: 0.01, def: 0.15},
                {k: "frequency", t: "number", step: 0.01, def: 0.25},
                {k: "timeScale", t: "number", step: 0.01, def: 0.06},
                {k: "phaseOffset", t: "number", step: 0.01, def: 0.0},
                {k: "worldOffsetX", t: "number", step: 0.01, def: 0.0},
                {k: "worldOffsetY", t: "number", step: 0.01, def: 0.0},
                {k: "worldOffsetZ", t: "number", step: 0.01, def: 0.0},
            ],
            toKotlin: (c) => chain([
                `ParticleFlowFieldCommand()`,
                `.amplitude(${fmtD(c.params.amplitude)})`,
                `.frequency(${fmtD(c.params.frequency)})`,
                `.timeScale(${fmtD(c.params.timeScale)})`,
                `.phaseOffset(${fmtD(c.params.phaseOffset)})`,
                `.worldOffset(${kVec3(c.params.worldOffsetX, c.params.worldOffsetY, c.params.worldOffsetZ)})`,
            ]),
        },

        ParticleAttractionCommand: {
            title: "Attraction 吸引/排斥",
            fields: [
                {
                    k: "targetMode", t: "select", def: "const", opts: [
                        ["const", "常量 Vec3"],
                        ["expr", "Kotlin 表达式"],
                    ]
                },
                {k: "targetX", t: "number", step: 0.01, def: 0.0},
                {k: "targetY", t: "number", step: 0.01, def: 0.0},
                {k: "targetZ", t: "number", step: 0.01, def: 0.0},
                {k: "targetExpr", t: "text", def: "{ this.pos }"},

                {k: "strength", t: "number", step: 0.01, def: 0.8},
                {k: "range", t: "number", step: 0.01, def: 8.0},
                {k: "falloffPower", t: "number", step: 0.01, def: 2.0},
                {k: "minDistance", t: "number", step: 0.01, def: 0.25},
            ],
            toKotlin: (c) => {
                const p = c.params;
                const target = (p.targetMode === "expr")
                    ? (p.targetExpr || "{ this.pos }")
                    : kSupplierVec3(p.targetX, p.targetY, p.targetZ);

                return chain([
                    `ParticleAttractionCommand()`,
                    `.target(${target})`,
                    `.strength(${fmtD(p.strength)})`,
                    `.range(${fmtD(p.range)})`,
                    `.falloffPower(${fmtD(p.falloffPower)})`,
                    `.minDistance(${fmtD(p.minDistance)})`,
                ]);
            },
        },

        ParticleOrbitCommand: {
            title: "Orbit 轨道",
            fields: [
                {k: "centerMode", t: "select", def: "const", opts: [["const", "常量 Vec3"], ["expr", "Kotlin 表达式"]]},
                {k: "centerX", t: "number", step: 0.01, def: 0.0},
                {k: "centerY", t: "number", step: 0.01, def: 0.0},
                {k: "centerZ", t: "number", step: 0.01, def: 0.0},
                {k: "centerExpr", t: "text", def: "{ this.pos }"},

                {k: "axisX", t: "number", step: 0.01, def: 0.0},
                {k: "axisY", t: "number", step: 0.01, def: 1.0},
                {k: "axisZ", t: "number", step: 0.01, def: 0.0},

                {k: "radius", t: "number", step: 0.01, def: 3.0},
                {k: "angularSpeed", t: "number", step: 0.01, def: 0.35},
                {k: "radialCorrect", t: "number", step: 0.01, def: 0.25},
                {k: "minDistance", t: "number", step: 0.01, def: 0.2},
                {
                    k: "mode", t: "select", def: "PHYSICAL", opts: [
                        ["PHYSICAL", "PHYSICAL"],
                        ["SPRING", "SPRING"],
                        ["SNAP", "SNAP"],
                    ]
                },
                {k: "maxRadialStep", t: "number", step: 0.01, def: 0.5},
            ],
            toKotlin: (c) => {
                const p = c.params;
                const center = (p.centerMode === "expr")
                    ? (p.centerExpr || "{ this.pos }")
                    : kSupplierVec3(p.centerX, p.centerY, p.centerZ);

                return chain([
                    `ParticleOrbitCommand()`,
                    `.center(${center})`,
                    `.axis(${kVec3(p.axisX, p.axisY, p.axisZ)})`,
                    `.radius(${fmtD(p.radius)})`,
                    `.angularSpeed(${fmtD(p.angularSpeed)})`,
                    `.radialCorrect(${fmtD(p.radialCorrect)})`,
                    `.minDistance(${fmtD(p.minDistance)})`,
                    `.mode(OrbitMode.${p.mode})`,
                    `.maxRadialStep(${fmtD(p.maxRadialStep)})`,
                ]);
            },
        },

        ParticleVortexCommand: {
            title: "Vortex 漩涡（吸入 center）",
            fields: [
                {k: "centerMode", t: "select", def: "const", opts: [["const", "常量 Vec3"], ["expr", "Kotlin 表达式"]]},
                {k: "centerX", t: "number", step: 0.01, def: 0.0},
                {k: "centerY", t: "number", step: 0.01, def: 0.0},
                {k: "centerZ", t: "number", step: 0.01, def: 0.0},
                {k: "centerExpr", t: "text", def: "{ this.pos }"},

                {k: "axisX", t: "number", step: 0.01, def: 0.0},
                {k: "axisY", t: "number", step: 0.01, def: 1.0},
                {k: "axisZ", t: "number", step: 0.01, def: 0.0},

                {k: "swirlStrength", t: "number", step: 0.01, def: 0.8},
                {k: "radialPull", t: "number", step: 0.01, def: 0.35},
                {k: "axialLift", t: "number", step: 0.01, def: 0.0},

                {k: "range", t: "number", step: 0.01, def: 10.0},
                {k: "falloffPower", t: "number", step: 0.01, def: 2.0},
                {k: "minDistance", t: "number", step: 0.01, def: 0.2},
            ],
            toKotlin: (c) => {
                const p = c.params;
                const center = (p.centerMode === "expr")
                    ? (p.centerExpr || "{ this.pos }")
                    : kSupplierVec3(p.centerX, p.centerY, p.centerZ);

                return chain([
                    `ParticleVortexCommand()`,
                    `.center(${center})`,
                    `.axis(${kVec3(p.axisX, p.axisY, p.axisZ)})`,
                    `.swirlStrength(${fmtD(p.swirlStrength)})`,
                    `.radialPull(${fmtD(p.radialPull)})`,
                    `.axialLift(${fmtD(p.axialLift)})`,
                    `.range(${fmtD(p.range)})`,
                    `.falloffPower(${fmtD(p.falloffPower)})`,
                    `.minDistance(${fmtD(p.minDistance)})`,
                ]);
            },
        },

        ParticleRotationForceCommand: {
            title: "RotationForce 切向旋转力",
            fields: [
                {k: "centerMode", t: "select", def: "const", opts: [["const", "常量 Vec3"], ["expr", "Kotlin 表达式"]]},
                {k: "centerX", t: "number", step: 0.01, def: 0.0},
                {k: "centerY", t: "number", step: 0.01, def: 0.0},
                {k: "centerZ", t: "number", step: 0.01, def: 0.0},
                {k: "centerExpr", t: "text", def: "{ this.pos }"},

                {k: "axisX", t: "number", step: 0.01, def: 0.0},
                {k: "axisY", t: "number", step: 0.01, def: 1.0},
                {k: "axisZ", t: "number", step: 0.01, def: 0.0},

                {k: "strength", t: "number", step: 0.01, def: 0.35},
                {k: "range", t: "number", step: 0.01, def: 8.0},
                {k: "falloffPower", t: "number", step: 0.01, def: 2.0},
            ],
            toKotlin: (c) => {
                const p = c.params;
                const center = (p.centerMode === "expr")
                    ? (p.centerExpr || "{ this.pos }")
                    : kSupplierVec3(p.centerX, p.centerY, p.centerZ);

                return chain([
                    `ParticleRotationForceCommand()`,
                    `.center(${center})`,
                    `.axis(${kVec3(p.axisX, p.axisY, p.axisZ)})`,
                    `.strength(${fmtD(p.strength)})`,
                    `.range(${fmtD(p.range)})`,
                    `.falloffPower(${fmtD(p.falloffPower)})`,
                ]);
            },
        },

        ParticleGravityCommand: {
            title: "Gravity 重力(物理)",
            fields: [{k: "emitterRef", t: "text", def: ""}],
            toKotlin: (c, ctx) => {
                const ref = (c.params.emitterRef && c.params.emitterRef.trim().length)
                    ? c.params.emitterRef.trim()
                    : ctx.kRefName;
                return `ParticleGravityCommand(${ref})`;
            },
        },
    };

    function chain(lines) {
        if (!lines.length) return "";
        const head = lines[0];
        const tail = lines.slice(1).map(x => `    ${x}`);
        return [head, ...tail].join("\n");
    }

    function newCommand(type) {
        const meta = COMMAND_META[type];
        const params = {};
        meta.fields.forEach(f => params[f.k] = f.def);
        return {id: cryptoRandomId(), type, enabled: true, params};
    }

    function cryptoRandomId() {
        const a = new Uint32Array(4);
        (window.crypto || window.msCrypto).getRandomValues(a);
        return Array.from(a).map(x => x.toString(16)).join("");
    }

    // ---------- app state ----------
    const state = {
        commands: [],
        playing: true,
        ticksPerSecond: 20,
        fullscreen: false,
        emitter: {
            type: "point",
            offset: {x: 0, y: 0, z: 0},
            box: {x: 2, y: 1, z: 2, density: 0.0, surface: false},
            sphere: {r: 2},
            sphereSurface: {r: 2},
            ring: {r: 2.5, thickness: 0.15, axis: {x: 0, y: 1, z: 0}},
        },
        particle: {
            lifeMin: 40,
            lifeMax: 120,
            sizeMin: 0.08,
            sizeMax: 0.18,
            countMin: 2,
            countMax: 6,
            vel: {x: 0, y: 0.15, z: 0},
            velSpeed: 1.0,
            visibleRange: 128,
            colorStart: "#4df3ff",
            colorEnd: "#d04dff",
        },
        kotlin: {varName: "command", kRefName: "emitter"}
    };

    // ---------- Minimal Orbit Controls (pointer events) ----------
    function createMiniOrbit(camera, dom) {
        const ctl = {
            target: new THREE.Vector3(0, 0, 0),
            distance: 18,
            azimuth: Math.PI * 0.75,
            polar: Math.PI * 0.33,
            rotateSpeed: 0.005,
            panSpeed: 1.0,
            zoomSpeed: 0.0012,
            minDistance: 3.0,
            maxDistance: 360,
            minPolar: 0.05,
            maxPolar: Math.PI - 0.05,

            _active: false,
            _mode: 0, // 0 rotate, 1 pan
            _pid: -1,
            _lx: 0,
            _ly: 0,

            update() {
                const p = clamp(this.polar, this.minPolar, this.maxPolar);
                const a = this.azimuth;

                const sinP = Math.sin(p), cosP = Math.cos(p);
                const sinA = Math.sin(a), cosA = Math.cos(a);

                const x = this.target.x + this.distance * sinP * cosA;
                const y = this.target.y + this.distance * cosP;
                const z = this.target.z + this.distance * sinP * sinA;

                camera.position.set(x, y, z);
                camera.lookAt(this.target);
            }
        };

        function getSize() {
            const r = dom.getBoundingClientRect();
            return {w: Math.max(1, r.width), h: Math.max(1, r.height)};
        }

        dom.addEventListener("contextmenu", (e) => e.preventDefault(), {passive: false});

        dom.addEventListener("pointerdown", (e) => {
            dom.setPointerCapture(e.pointerId);
            ctl._active = true;
            ctl._pid = e.pointerId;
            ctl._lx = e.clientX;
            ctl._ly = e.clientY;

            // right button => pan
            // e.button: 0 left, 2 right
            ctl._mode = (e.button === 2) ? 1 : 0;
        });

        dom.addEventListener("pointerup", (e) => {
            if (ctl._pid === e.pointerId) {
                ctl._active = false;
                ctl._pid = -1;
            }
        });

        dom.addEventListener("pointercancel", () => {
            ctl._active = false;
            ctl._pid = -1;
        });

        dom.addEventListener("pointermove", (e) => {
            if (!ctl._active || ctl._pid !== e.pointerId) return;

            const dx = e.clientX - ctl._lx;
            const dy = e.clientY - ctl._ly;
            ctl._lx = e.clientX;
            ctl._ly = e.clientY;

            const {w, h} = getSize();

            if (ctl._mode === 0) {
                // 方向修正：水平拖动反过来（你说右拖应逆时针）
                ctl.azimuth += dx * ctl.rotateSpeed;
                ctl.polar -= dy * ctl.rotateSpeed;
            } else {
                // pan in camera plane
                const offset = vec3(0, 0, 0).subVectors(camera.position, ctl.target);
                const dist = offset.length();
                const panScale = dist * 0.9;

                const right = vec3(0, 0, 0).crossVectors(offset, camera.up).normalize(); // right
                const up = vec3(0, 0, 0).copy(camera.up).normalize();

                const sx = (dx / w) * panScale * ctl.panSpeed;
                const sy = (dy / h) * panScale * ctl.panSpeed;

                ctl.target.addScaledVector(right, sx);
                ctl.target.addScaledVector(up, sy);
            }
        });

        dom.addEventListener("wheel", (e) => {
            e.preventDefault();
            const delta = e.deltaY;
            ctl.distance *= (1 + delta * ctl.zoomSpeed);
            ctl.distance = clamp(ctl.distance, ctl.minDistance, ctl.maxDistance);
        }, {passive: false});

        return ctl;
    }

    // ---------- three.js preview ----------
    let renderer, scene, camera, controls;
    let points, pointsGeo, pointsMat;
    const MAX_POINTS = 65536;
    const sim = {
        tickAcc: 0,
        lastTime: performance.now(),
        particles: [],
        initNoise(seed = 1337) {
            this.noiseSeed = seed | 0;
        }
    };

    function makePointShaderMaterial() {
        return new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            uniforms: {
                uViewportY: {value: 600.0}, // ✅会在 resize 时更新
            },
            vertexShader: `
        attribute float size;   // 世界单位半径/直径都行，看你怎么定义
        attribute vec3 aColor;
        varying vec3 vColor;

        // 传入：renderer.domElement.height (或 getDrawingBufferSize().y)
        // 推荐：height * devicePixelRatio
        uniform float uViewportY;

        void main() {
          vColor = aColor;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

          // three.js: 透视相机 projectionMatrix[2][3] ≈ -1，正交相机 ≈ 0
          float perspFlag = step(0.5, abs(projectionMatrix[2][3])); // 透视=1，正交=0（近似判断）

          // 像素换算：pxPerWorldAtZ1 = (viewportH/2) * cot(fov/2)
          float pxPerWorldAtZ1 = 0.5 * uViewportY * projectionMatrix[1][1];

          // 透视：随距离衰减；正交：不衰减（等价于除以 1）
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
          // gl_PointCoord: [0..1]
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);

          // 圆形软边：d<0.5 内部，>0.5 外部
          float alpha = 1.0 - smoothstep(0.45, 0.5, d);

          // 可选：把圆外直接裁掉，减少边缘锯齿/过度 blending
          // if (d > 0.5) discard;

          gl_FragColor = vec4(vColor, alpha);
        }
      `
        });
    }

    function initThree() {
        const el = document.getElementById("viewport");
        const w = el.clientWidth, h = el.clientHeight;

        renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        el.innerHTML = "";
        el.appendChild(renderer.domElement);

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(90, w / h, 0.01, 500);

        controls = createMiniOrbit(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.distance = 9;
        controls.azimuth = Math.PI * 0.75;
        controls.polar = Math.PI * 0.33;
        controls.update();

        const GRID_SIZE = 512;          // 总宽度
        const GRID_DIV = 512;           // 每格 1 单位（可改 128 变更细）
        const grid = new THREE.GridHelper(GRID_SIZE, GRID_DIV, 0x233044, 0x1a2434);
        grid.position.y = -0.001;
        // scene.add(grid);
        grid.scale.z = -1;
        const axes = new THREE.AxesHelper(64);
        scene.add(axes);
        axes.scale.z = -1;

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
        const el = document.getElementById("viewport");
        const ww = el.clientWidth, hh = el.clientHeight;
        if (!renderer || !camera) return;
        renderer.setSize(ww, hh);
        camera.aspect = ww / hh;
        camera.updateProjectionMatrix();
        if (pointsMat && pointsMat.uniforms && pointsMat.uniforms.uViewportY) {
            // 用绘制缓冲区高度（考虑 DPR），保证透视换算正确
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
        const pArr = sim.particles;
        const posAttr = pointsGeo.getAttribute("position");
        const colAttr = pointsGeo.getAttribute("aColor");
        const sizeAttr = pointsGeo.getAttribute("size");
        const alpha = clamp(sim.tickAcc, 0, 1); // ✅渲染插值系数（0=上一tick，1=这一tick）

        /* 然后在写 position 的地方，把 p.pos.x/y/z 改成下面这样： */

        const n = Math.min(pArr.length, MAX_POINTS);
        for (let i = 0; i < n; i++) {
            const p = pArr[i];

            const ix = lerp(p.prevPos.x, p.pos.x, alpha);
            const iy = lerp(p.prevPos.y, p.pos.y, alpha);
            const iz = lerp(p.prevPos.z, p.pos.z, alpha);

            posAttr.array[i * 3 + 0] = ix;
            posAttr.array[i * 3 + 1] = iy;
            posAttr.array[i * 3 + 2] = iz;

            const t = clamp(p.age / Math.max(1, p.life), 0, 1);
            const c0 = hexToRgb01(state.particle.colorStart);
            const c1 = hexToRgb01(state.particle.colorEnd);
            const c = lerp3(c0, c1, t);
            colAttr.array[i * 3 + 0] = c.r;
            colAttr.array[i * 3 + 1] = c.g;
            colAttr.array[i * 3 + 2] = c.b;
            // const sMin = Math.max(0.0001, state.particle.sizeMin);
            // const sMax = Math.max(sMin + 0.0001, state.particle.sizeMax);

            // // p.size 在 [sMin, sMax] => tSize in [0,1]
            // const tSize = clamp((p.size - sMin) / (sMax - sMin), 0, 1);

            // // 映射到屏幕点大小（像素），范围你可以按需要调
            // const px = lerp(6.0, 40.0, tSize);
            // sizeAttr.array[i] = px;
            // // 大小随机（可见效果）：映射到点渲染尺寸
            // // p.size 大致为 0.05~0.2 => 映射到 8~28
            // const px = clamp(p.size * 140.0, 6.0, 40.0);
            // sizeAttr.array[i] = px;
            sizeAttr.array[i] = p.size;
        }

        pointsGeo.setDrawRange(0, n);
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;

        $("#statChip").text(`Particles: ${pArr.length}`);
    }

    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();
        const dt = (now - sim.lastTime) / 1000;
        sim.lastTime = now;

        if (state.playing) stepSim(dt);
        if (controls) controls.update();
        updatePointsBuffer();
        renderer.render(scene, camera);
    }

    // ---------- simulation ----------
    function stepSim(dtSeconds) {
        const tps = Math.max(1, state.ticksPerSecond);
        sim.tickAcc += dtSeconds * tps;
        while (sim.tickAcc >= 1.0) {
            sim.tickAcc -= 1.0;
            tickOnce();
        }
    }

    function tickOnce() {

        // spawn
        const cnt = randInt(state.particle.countMin, state.particle.countMax);
        for (let i = 0; i < cnt; i++) {
            if (sim.particles.length >= MAX_POINTS) break;
            sim.particles.push(makeParticle());
        }

        // for test emitters
        // if (sim.particles.length < 1){
        //   let pos = vec3(0,0,1);
        //   let vdir = vec3(0,0,1);
        //   let life = 20
        //   let size = 1
        //   sim.particles.push( {
        //     pos,
        //     vel: vdir, // ✅blocks/sec
        //     age: 0,
        //     life,
        //     size,
        //     seed: (Math.random() * 1e9) | 0
        //   })
        // }


        // update
        const cmds = state.commands.filter(c => c.enabled);
        for (let i = sim.particles.length - 1; i >= 0; i--) {
            const p = sim.particles[i];
            p.age++;

            for (const c of cmds) applyCommandJS(c, p, 1);
            p.prevPos = p.pos;
            p.pos = p.pos.clone().add(p.vel);
            if (p.age >= p.life) sim.particles.splice(i, 1);
        }
    }

    function makeParticle() {
        const pos = sampleEmitterPosition();
        const life = randInt(state.particle.lifeMin, state.particle.lifeMax);
        const size = rand(state.particle.sizeMin, state.particle.sizeMax);

        const vdir = vec3(state.particle.vel.x, state.particle.vel.y, state.particle.vel.z);
        if (vdir.lengthSq() < 1e-10) vdir.set(0, 0, 0);
        else vdir.normalize().multiplyScalar(Math.max(0, state.particle.velSpeed));

        return {
            pos,
            prevPos: pos.clone(),
            vel: vdir, // ✅blocks/sec
            age: 0,
            life,
            size,
            seed: (Math.random() * 1e9) | 0
        };
    }

    function sampleEmitterPosition() {
        const t = state.emitter.type;
        const off = vec3(
            state.emitter.offset?.x || 0,
            state.emitter.offset?.y || 0,
            state.emitter.offset?.z || 0
        );
        if (t === "point") return vec3(0, 0, 0).add(off);

        if (t === "box") {
            const bx = state.emitter.box.x, by = state.emitter.box.y, bz = state.emitter.box.z;
            const surface = !!state.emitter.box.surface;
            const density = clamp(state.emitter.box.density, 0, 1);

            function biased(u) {
                if (density <= 0) return u;
                const s = Math.sign(u);
                const a = Math.abs(u);
                const pow = lerp(1.0, 4.0, density);
                return s * Math.pow(a, pow);
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
            return vec3(x, y, z).add(off);
        }

        if (t === "sphere") {
            const r = Math.max(0.001, state.emitter.sphere.r);
            // 体积球：rr = r * cbrt(rand)
            const u = Math.random();
            const v = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);
            const dir = vec3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );
            const rr = r * Math.cbrt(Math.random());
            return dir.multiplyScalar(rr).add(off);
        }

        if (t === "sphere_surface") {
            const r = Math.max(0.001, state.emitter.sphereSurface.r);
            // 球面：rr = r
            const u = Math.random();
            const v = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);
            const dir = vec3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );
            return dir.multiplyScalar(r).add(off);
        }

        // ring
        const rr = Math.max(0.001, state.emitter.ring.r);
        const th = Math.max(0, state.emitter.ring.thickness);
        const a = rand(0, Math.PI * 2);
        let x = Math.cos(a) * rr;
        let z = Math.sin(a) * rr;
        let y = 0;

        if (th > 0) {
            const j = vec3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
            if (j.lengthSq() > 1e-8) j.normalize().multiplyScalar(rand(0, th));
            x += j.x;
            y += j.y;
            z += j.z;
        }

        const ax = vec3(state.emitter.ring.axis.x, state.emitter.ring.axis.y, state.emitter.ring.axis.z);
        if (ax.lengthSq() < 1e-8) return vec3(x, y, z);
        ax.normalize();

        const up = vec3(0, 1, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(up, ax);
        return vec3(x, y, z).applyQuaternion(q).add(off);
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

    // Kotlin: var n = ix*374761393 + iy*668265263 + iz*2147483647 + seed*374761
    // n = (n xor (n ushr 13)) * 1274126177
    // n = n xor (n ushr 16)
    // return ((n and 0x7fffffff) / 2147483647.0)
    function hash3K(ix, iy, iz, seed) {
        let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647) + Math.imul(seed, 374761)) | 0;
        n = Math.imul((n ^ (n >>> 13)) | 0, 1274126177) | 0;
        n = (n ^ (n >>> 16)) | 0;
        // 转 0..1
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

        return lerpK(nxy0, nxy1, w); // 0..1
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
        // axisUnit: 已归一化
        const up = (Math.abs(axisUnit.y) < 0.99) ? vec3(0, 1, 0) : vec3(1, 0, 0);
        const p = up.clone().cross(axisUnit);
        if (p.lengthSq() < 1e-12) return vec3(1, 0, 0);
        return p.normalize(); // 一定与 axisUnit 垂直
    }

    function applyCommandJS(cmd, particle, dt) {
        const p = cmd.params;

        switch (cmd.type) {
            case "ParticleNoiseCommand": {
                const t01 = (particle.life > 0) ? (particle.age / particle.life) : 0.0;

                // Kotlin: seed = particle.controlUUID.hashCode()
                // 预览里用粒子自身稳定 seed（生成时固定即可）
                const seed = (particle.seed | 0);

                const strength = safeNum(p.strength, 0.03);
                const frequency = safeNum(p.frequency, 0.15);
                const speed = safeNum(p.speed, 0.12);
                const affectY = safeNum(p.affectY, 1.0);
                const clampSpeed = Math.max(0.0001, safeNum(p.clampSpeed, 0.8));
                const useLifeCurve = !!p.useLifeCurve;

                // Kotlin: time = age * speed
                const time = particle.age * speed;

                // Kotlin: p = (pos * frequency).add(time, time*0.7, time*1.3)
                const samplePos = vec3(particle.pos.x, particle.pos.y, particle.pos.z)
                    .multiplyScalar(frequency)
                    .add(vec3(time, time * 0.7, time * 1.3));

                // Kotlin: n = noiseVec3(p, seed)
                const n = noiseVec3K(samplePos, seed);

                // Kotlin: amp = strength * (1 - t) if useLifeCurve
                let amp = strength;
                if (useLifeCurve) amp *= (1.0 - clamp(t01, 0, 1));

                // Kotlin: dv = Vec3(n.x, n.y*affectY, n.z) * amp
                const dv = vec3(n.x, n.y * affectY, n.z).multiplyScalar(amp);

                // v = v0 + dv
                particle.vel.add(dv);

                // clamp speed
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
                const amplitude   = safeNum(p.amplitude, 0.15);
                const frequency   = safeNum(p.frequency, 0.25);
                const timeScale   = safeNum(p.timeScale, 0.06);
                const phaseOffset = safeNum(p.phaseOffset, 0.0);

                const ox = safeNum(p.worldOffsetX, 0.0);
                const oy = safeNum(p.worldOffsetY, 0.0);
                const oz = safeNum(p.worldOffsetZ, 0.0);

                // 对齐 Kotlin：val p = particle.loc.add(worldOffset)
                const samplePos = vec3(
                    particle.pos.x + ox,
                    particle.pos.y + oy,
                    particle.pos.z + oz
                );

                // 对齐 Kotlin：val t = (particle.currentAge * timeScale) + phaseOffset
                const t = (particle.age * timeScale) + phaseOffset;

                // 对齐 Kotlin 的 analytic flow field
                const fx =
                    Math.sin((samplePos.y + t) * frequency) +
                    Math.cos((samplePos.z - t) * frequency);

                const fy =
                    Math.sin((samplePos.z + t) * frequency) +
                    Math.cos((samplePos.x + t) * frequency);

                const fz =
                    Math.sin((samplePos.x - t) * frequency) +
                    Math.cos((samplePos.y - t) * frequency);

                // normalize-ish & amplitude
                const scale = 0.5;
                const dv = vec3(fx * scale, fy * scale, fz * scale)
                    .multiplyScalar(amplitude);

                // ✅和 Kotlin 一致：data.velocity = data.velocity.add(dv)
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

                const dir = vec3(tx, ty, tz).sub(particle.pos);
                const rawDist = dir.length();
                if (rawDist < 1e-9) break;

                const dist = Math.max(rawDist, minDistance);
                const falloff = inversePowerFalloff(dist, range, falloffPower);

                // a = dirNorm * strength * falloff
                const a = dir.multiplyScalar(1.0 / dist).multiplyScalar(strength * falloff);
                particle.vel.add(a);
                break;
            }

            case "ParticleOrbitCommand": {
                const cx = Number(p.centerX) || 0, cy = Number(p.centerY) || 0, cz = Number(p.centerZ) || 0;

                const ax = Number(p.axisX) || 0, ay = Number(p.axisY) || 1, az = Number(p.axisZ) || 0;
                const axis = vec3(ax, ay, az);
                const axisLen = axis.length();
                if (axisLen < 1e-9) break;
                axis.multiplyScalar(1.0 / axisLen);

                const radius = Number(p.radius) || 0;
                const angularSpeed = Number(p.angularSpeed) || 0;
                const radialCorrect = Number(p.radialCorrect) || 0;
                const minDistance = Math.max(1e-6, Number(p.minDistance) || 0.2);
                const maxRadialStep = Number(p.maxRadialStep) || 0.5;
                const mode = (p.mode || "PHYSICAL");

                const center = vec3(cx, cy, cz);

                const r = particle.pos.clone().sub(center);
                const axial = axis.clone().multiplyScalar(r.dot(axis));
                const radialVec = r.clone().sub(axial);

                const radialDist0 = radialVec.length();

                // ✅靠近 center / 退化：给一个稳定的径向方向（保证后续 tang 不会为 0）
                const radialN = (radialDist0 < 1e-6)
                    ? anyPerpToAxis(axis)                      // 垂直于轴的任意方向
                    : radialVec.multiplyScalar(1.0 / Math.max(radialDist0, minDistance));

                const radialDist = Math.max(radialDist0, minDistance);

                let tang = axis.clone().cross(radialN);
                const tLen = tang.length();
                if (tLen < 1e-9) tang = anyPerpToAxis(axis); // ✅再兜底一次
                else tang.multiplyScalar(1.0 / tLen);

                const dvTan = tang.multiplyScalar(-angularSpeed);
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

                const ax = Number(p.axisX) || 0, ay = Number(p.axisY) || 1, az = Number(p.axisZ) || 0;
                const axis = vec3(ax, ay, az);
                const axisLen = axis.length();
                if (axisLen < 1e-9) break;
                axis.multiplyScalar(1.0 / axisLen);

                const swirlStrength = Number(p.swirlStrength) || 0;
                const radialPull = Number(p.radialPull) || 0;     // 正值=吸入
                const axialLift = Number(p.axialLift) || 0;

                const range = Number(p.range) || 1;
                const falloffPower = Number(p.falloffPower) || 1;
                const minDistance = Math.max(1e-6, Number(p.minDistance) || 0.2);

                const center = vec3(cx, cy, cz);

                // inward：完整指向中心向量，并用它的距离做 falloff（和 MC 更一致）
                const toCenter = center.clone().sub(particle.pos);
                const d0 = toCenter.length();
                if (d0 < 1e-9) break;
                const d = Math.max(d0, minDistance);
                const falloff = inversePowerFalloff(d, range, falloffPower);

                const inward = toCenter.multiplyScalar(1.0 / d); // 指向中心（单位向量）

                // 把 inward 投影到“垂直于 axis 的平面”作为径向，保证 swirl 真正在圆周切向旋转
                const axialComp = axis.clone().multiplyScalar(inward.dot(axis));
                let radial = inward.clone().sub(axialComp); // 平面径向（仍指向中心）
                const rLen = radial.length();
                if (rLen < 1e-9) radial = anyPerpToAxis(axis);
                else radial.multiplyScalar(1.0 / rLen);

                // 切向：radial × axis（注意顺序！这会决定顺/逆时针；MC 是向内旋转，你这里用 radial×axis）
                let tang = radial.clone().cross(axis);
                const tLen = tang.length();
                if (tLen < 1e-9) tang = anyPerpToAxis(axis);
                else tang.multiplyScalar(1.0 / tLen);

                const dv = vec3(0, 0, 0)
                    .add(tang.multiplyScalar(-swirlStrength * falloff))      // 旋转
                    .add(inward.multiplyScalar(radialPull * falloff))       // 吸入
                    .add(axis.clone().multiplyScalar(axialLift * falloff)); // 轴向

                particle.vel.add(dv);
                break;
            }


            case "ParticleRotationForceCommand": {
                const cx = Number(p.centerX) || 0, cy = Number(p.centerY) || 0, cz = Number(p.centerZ) || 0;

                const ax0 = Number(p.axisX) || 0, ay0 = Number(p.axisY) || 1, az0 = Number(p.axisZ) || 0;
                const ax = vec3(ax0, ay0, az0);
                const axLen = ax.length();
                if (axLen < 1e-9) break;
                ax.multiplyScalar(1.0 / axLen); // axis.normalize()

                const strength = Number(p.strength) || 0;
                const range = Number(p.range) || 1;
                const falloffPower = Number(p.falloffPower) || 1;

                // r = pos - center
                const r = particle.pos.clone().sub(vec3(cx, cy, cz));
                const dist = r.length();
                if (dist < 1e-9) break;

                // t = axis x r
                let t = ax.clone().cross(r);
                const tLen = t.length();
                if (tLen < 1e-9) break;
                t.multiplyScalar(1.0 / tLen);

                const falloff = inversePowerFalloff(dist, range, falloffPower);
                const dv = t.multiplyScalar(strength * falloff);

                particle.vel.add(dv);
                break;
            }

            /* =================== Gravity =================== */
            case "ParticleGravityCommand": {
                // MC 粒子重力通常是 velY -= 0.04 per tick
                // 换成 blocks/sec^2：a = 0.8 ，每 tick dv = a*dt = 0.8*(1/20)=0.04
                const g = 0.8; // blocks/sec^2
                particle.vel.y -= g * dt;

                // 0.98 per tick => 指数缩放（dt 固定时等价）
                particle.vel.multiplyScalar(Math.pow(0.98, dt * 20.0));
                break;
            }

            default:
                break;
        }
    }

    function clearParticles() {
        sim.particles.length = 0;
    }

    // ---------- UI ----------
    function setEmitterSection() {
        const t = $("#emitterType").val();
        $(".emitSection").removeClass("active");
        if (t === "point") $("#emitPoint").addClass("active");
        if (t === "box") $("#emitBox").addClass("active");
        if (t === "sphere") $("#emitSphere").addClass("active");
        if (t === "sphere_surface") $("#emitSphereSurface").addClass("active");
        if (t === "ring") $("#emitRing").addClass("active");
    }

    function readBaseForm() {
        state.emitter.type = $("#emitterType").val();
        state.emitter.offset.x = safeNum($("#emitOffX").val(), 0);
        state.emitter.offset.y = safeNum($("#emitOffY").val(), 0);
        state.emitter.offset.z = safeNum($("#emitOffZ").val(), 0);
        state.ticksPerSecond = safeNum($("#ticksPerSecond").val(), 20);

        state.particle.lifeMin = Math.max(1, safeNum($("#lifeMin").val(), 40));
        state.particle.lifeMax = Math.max(state.particle.lifeMin, safeNum($("#lifeMax").val(), 120));
        state.particle.sizeMin = Math.max(0.001, safeNum($("#sizeMin").val(), 0.8));
        state.particle.sizeMax = Math.max(state.particle.sizeMin, safeNum($("#sizeMax").val(), 0.9));
        state.particle.countMin = Math.max(0, safeNum($("#countMin").val(), 2));
        state.particle.countMax = Math.max(state.particle.countMin, safeNum($("#countMax").val(), 6));
        state.particle.vel.x = safeNum($("#velX").val(), 0);
        state.particle.vel.y = safeNum($("#velY").val(), 0.15);
        state.particle.vel.z = safeNum($("#velZ").val(), 0);
        state.particle.velSpeed = Math.max(0, safeNum($("#velSpeed").val(), 1.0));
        state.particle.visibleRange = Math.max(1, safeNum($("#visibleRange").val(), 128));

        state.emitter.box.x = Math.max(0.001, safeNum($("#boxX").val(), 2.0));
        state.emitter.box.y = Math.max(0.001, safeNum($("#boxY").val(), 1.0));
        state.emitter.box.z = Math.max(0.001, safeNum($("#boxZ").val(), 2.0));
        state.emitter.box.density = clamp(safeNum($("#boxDensity").val(), 0.0), 0, 1);
        state.emitter.box.surface = $("#boxSurface").val() === "1";

        state.emitter.sphere.r = Math.max(0.001, safeNum($("#sphereR").val(), 2.0));
        state.emitter.sphereSurface.r = Math.max(0.001, safeNum($("#sphereSurfR").val(), 2.0));

        state.emitter.ring.r = Math.max(0.001, safeNum($("#ringR").val(), 2.5));
        state.emitter.ring.thickness = Math.max(0, safeNum($("#ringThickness").val(), 0.15));
        state.emitter.ring.axis.x = safeNum($("#ringAx").val(), 0);
        state.emitter.ring.axis.y = safeNum($("#ringAy").val(), 1);
        state.emitter.ring.axis.z = safeNum($("#ringAz").val(), 0);

        state.kotlin.varName = ($("#kVarName").val() || "command").trim() || "command";
        state.kotlin.kRefName = ($("#kRefName").val() || "emitter").trim() || "emitter";
        state.particle.colorStart = ($("#colStart").val() || "#4df3ff").trim();
        state.particle.colorEnd = ($("#colEnd").val() || "#d04dff").trim();
    }

    function humanFieldName(k) {
        const map = {
            strength: "strength",
            frequency: "frequency",
            speed: "speed",
            affectY: "affectY",
            clampSpeed: "clampSpeed",
            useLifeCurve: "useLifeCurve",
            damping: "damping",
            linear: "linear",
            minSpeed: "minSpeed",
            amplitude: "amplitude",
            timeScale: "timeScale",
            phaseOffset: "phaseOffset",
            worldOffsetX: "worldOffset.x",
            worldOffsetY: "worldOffset.y",
            worldOffsetZ: "worldOffset.z",
            targetMode: "target 模式",
            targetX: "target.x",
            targetY: "target.y",
            targetZ: "target.z",
            targetExpr: "target 表达式",
            centerMode: "center 模式",
            centerX: "center.x",
            centerY: "center.y",
            centerZ: "center.z",
            centerExpr: "center 表达式",
            axisX: "axis.x",
            axisY: "axis.y",
            axisZ: "axis.z",
            radius: "radius",
            angularSpeed: "angularSpeed",
            radialCorrect: "radialCorrect",
            minDistance: "minDistance",
            mode: "mode",
            maxRadialStep: "maxRadialStep",
            swirlStrength: "swirlStrength",
            radialPull: "radialPull（向 center 吸入）",
            axialLift: "axialLift",
            range: "range",
            falloffPower: "falloffPower",
            emitterRef: "emitter 引用(空=默认)",
        };
        return map[k] || k;
    }

    function escapeHtml(s) {
        return s.replace(/[&<>"']/g, (m) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
        }[m]));
    }

    function renderCommandList() {
        const $list = $("#cmdList");
        $list.empty();

        for (const c of state.commands) {
            const meta = COMMAND_META[c.type];
            const $card = $(`
        <div class="cmdCard" data-id="${c.id}">
          <div class="cmdHead">
            <div class="dragHandle">≡</div>
            <div class="cmdTitle">${meta.title}</div>
            <div class="cmdToggles">
              <label class="switch"><input type="checkbox" class="cmdEnabled" ${c.enabled ? "checked" : ""}/> 启用</label>
            </div>
            <div class="cmdBtns">
              <button class="iconBtn btnDup" title="复制">⎘</button>
              <button class="iconBtn btnDel" title="删除">🗑</button>
            </div>
          </div>
          <div class="cmdBody">
            <div class="cmdGrid"></div>
          </div>
        </div>
      `);

            const $grid = $card.find(".cmdGrid");
            meta.fields.forEach(f => {
                const val = c.params[f.k];

                if (f.t === "bool") {
                    const $f = $(`
            <div class="field">
              <label>${humanFieldName(f.k)}</label>
              <select class="cmdInput" data-key="${f.k}">
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </div>
          `);
                    $f.find("select").val(val ? "true" : "false");
                    $grid.append($f);
                } else if (f.t === "select") {
                    const opts = (f.opts || []).map(o => `<option value="${o[0]}">${o[1]}</option>`).join("");
                    const $f = $(`
            <div class="field">
              <label>${humanFieldName(f.k)}</label>
              <select class="cmdInput" data-key="${f.k}">${opts}</select>
            </div>
          `);
                    $f.find("select").val(val);
                    $grid.append($f);
                } else if (f.t === "text") {
                    const $f = $(`
            <div class="field">
              <label>${humanFieldName(f.k)}</label>
              <input class="cmdInput" data-key="${f.k}" type="text" value="${escapeHtml(String(val ?? ""))}"/>
            </div>
          `);
                    $grid.append($f);
                } else {
                    const step = (f.step != null) ? `step="${f.step}"` : "";
                    const $f = $(`
            <div class="field">
              <label>${humanFieldName(f.k)}</label>
              <input class="cmdInput" data-key="${f.k}" type="number" ${step} value="${val}"/>
            </div>
          `);
                    $grid.append($f);
                }
            });

            const $help = $(`<div class="small">Kotlin 会生成：<code>.add( ${c.type}() ... )</code></div>`);
            $card.append($help);

            $list.append($card);
        }

        $(".cmdEnabled").off("change").on("change", function () {
            const id = $(this).closest(".cmdCard").data("id");
            const cmd = state.commands.find(x => x.id === id);
            cmd.enabled = $(this).is(":checked");
            autoGenKotlin();
        });

        $(".cmdInput").off("input change").on("input change", function () {
            const $card = $(this).closest(".cmdCard");
            const id = $card.data("id");
            const key = $(this).data("key");
            const cmd = state.commands.find(x => x.id === id);
            const meta = COMMAND_META[cmd.type];
            const field = meta.fields.find(f => f.k === key);

            let v;
            if (field.t === "bool") v = ($(this).val() === "true");
            else if (field.t === "select") v = $(this).val();
            else if (field.t === "text") v = $(this).val();
            else v = safeNum($(this).val(), field.def);

            cmd.params[key] = v;
            autoGenKotlin();
        });

        $(".btnDel").off("click").on("click", function () {
            const id = $(this).closest(".cmdCard").data("id");
            state.commands = state.commands.filter(x => x.id !== id);
            renderCommandList();
            autoGenKotlin();
        });

        $(".btnDup").off("click").on("click", function () {
            const id = $(this).closest(".cmdCard").data("id");
            const cmd = state.commands.find(x => x.id === id);
            const copy = JSON.parse(JSON.stringify(cmd));
            copy.id = cryptoRandomId();
            state.commands.push(copy);
            renderCommandList();
            autoGenKotlin();
        });

        if (!renderCommandList._sortable) {
            renderCommandList._sortable = new Sortable(document.getElementById("cmdList"), {
                handle: ".dragHandle",
                animation: 150,
                onEnd: () => {
                    const ids = $("#cmdList .cmdCard").map((_, el) => $(el).data("id")).get();
                    state.commands = ids.map(id => state.commands.find(x => x.id === id)).filter(Boolean);
                    autoGenKotlin();
                }
            });
        }
    }

    // ---------- Kotlin generation ----------
    function genKotlin() {
        readBaseForm();
        const varName = state.kotlin.varName || "command";
        const ctx = {kRefName: state.kotlin.kRefName || "emitter"};

        const enabledCmds = state.commands.filter(c => c.enabled);

        let out = `val ${varName} = ParticleCommandQueue()`;
        if (enabledCmds.length === 0) return out;

        for (const c of enabledCmds) {
            const meta = COMMAND_META[c.type];
            const body = meta.toKotlin(c, ctx);

            if (body.includes("\n")) {
                out += `\n    .add(\n        ${indent(body, 8).trimStart()}\n    )`;
            } else {
                out += `\n    .add( ${body} )`;
            }
        }
        return out;
    }

    function indent(s, spaces) {
        const pad = " ".repeat(spaces);
        return s.split("\n").map((line, i) => (i === 0 ? line : pad + line)).join("\n");
    }

    function autoGenKotlin() {
        $("#kotlinOut").val(genKotlin());
    }

    async function copyKotlin() {
        const ta = document.getElementById("kotlinOut");
        const text = ta.value || "";
        try {
            await navigator.clipboard.writeText(text);
            toast("已复制到剪贴板");
            return;
        } catch (_) {
        }
        ta.focus();
        ta.select();
        try {
            document.execCommand("copy");
            toast("已复制到剪贴板");
        } catch (e) {
            toast("复制失败（file:// 可能限制），请手动复制");
        }
    }

    // ---------- toast ----------
    let toastTimer = null;

    function toast(msg) {
        let $t = $("#_toast");
        if (!$t.length) {
            $t = $(`<div id="_toast" style="
        position:fixed; left:50%; bottom:18px; transform:translateX(-50%);
        padding:10px 14px; border-radius:999px;
        border:1px solid rgba(28,42,63,.95);
        background:rgba(8,12,18,.85); color:rgba(230,238,252,.95);
        box-shadow:0 12px 26px rgba(0,0,0,.35); z-index:99999;
        font-size:12px; backdrop-filter: blur(8px);
      "></div>`);
            $("body").append($t);
        }
        $t.text(msg).css("opacity", "1");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => $t.css("opacity", "0"), 1400);
    }

    // ---------- fullscreen ----------
    function setFullscreen(on) {
        state.fullscreen = !!on;
        const $wrap = $("#viewportWrap");
        if (state.fullscreen) {
            $wrap.addClass("isFull");
            $("#btnExitFull").show();
        } else {
            $wrap.removeClass("isFull");
            $("#btnExitFull").hide();
        }
        // next frame resize
        requestAnimationFrame(() => resizeRenderer());
    }

    // ---------- bind events ----------
    function bindEvents() {
        $("#emitterType").on("change", () => {
            setEmitterSection();
            readBaseForm();
        });
        $("#ticksPerSecond,#lifeMin,#lifeMax,#sizeMin,#sizeMax,#countMin,#countMax,#velX,#velY,#velZ,#velSpeed,#visibleRange,#colStart,#colEnd,#kVarName,#kRefName,#emitOffX,#emitOffY,#emitOffZ")
            .on("input change", () => {
                readBaseForm();
            });
        $("#boxX,#boxY,#boxZ,#boxDensity,#boxSurface,#sphereR,#sphereSurfR,#ringR,#ringThickness,#ringAx,#ringAy,#ringAz")
            .on("input change", () => {
                readBaseForm();
            });

        $("#btnPlay").on("click", () => {
            state.playing = true;
            toast("预览：播放");
        });
        $("#btnPause").on("click", () => {
            state.playing = false;
            toast("预览：暂停");
        });
        $("#btnClear").on("click", () => {
            clearParticles();
            toast("已清空");
        });

        $("#btnAddCmd").on("click", () => {
            const type = $("#addCommandType").val();
            state.commands.push(newCommand(type));
            renderCommandList();
            autoGenKotlin();
        });

        $("#btnGen").on("click", () => {
            autoGenKotlin();
            toast("已生成 Kotlin");
        });
        $("#btnCopy").on("click", () => {
            autoGenKotlin();
            copyKotlin();
        });

        $("#btnFull, #btnFullTop").on("click", () => setFullscreen(true));
        $("#btnExitFull").on("click", () => setFullscreen(false));

        // ESC 退出全屏
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && state.fullscreen) setFullscreen(false);
        });
    }

    function applyTheme(isLight) {
        $("body").toggleClass("theme-light", !!isLight);
        const lightNow = $("body").hasClass("theme-light");
        // 按钮文案：暗色默认（🌙 暗色），切到亮色显示 ☀ 亮色
        $("#btnTheme").text(lightNow ? "☀ 亮色" : "🌙 暗色");
        $("#btnTheme").attr("title", lightNow ? "切换到暗色主题" : "切换到亮色主题");
    }

    function initThemeToggle() {
        // 默认暗色：localStorage 没值时就是 false
        const saved = localStorage.getItem("pe_theme");
        const isLight = saved === "light";
        applyTheme(isLight);

        $("#btnTheme").on("click", () => {
            const nextIsLight = !$("body").hasClass("theme-light");
            applyTheme(nextIsLight);
            localStorage.setItem("pe_theme", nextIsLight ? "light" : "dark");
        });
    }

    function boot() {
        state.commands.push(newCommand("ParticleNoiseCommand"));
        state.commands.push(newCommand("ParticleDragCommand"));

        setEmitterSection();
        renderCommandList();
        autoGenKotlin();


        initThree();
        animate();
        initThemeToggle();
    }

    $(document).ready(() => {
        bindEvents();
        boot();
    });
})();