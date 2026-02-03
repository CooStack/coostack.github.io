import * as THREE from 'three';
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

const kTrailingLambda = (expr, fallback = "this.pos") => {
    const raw = (expr ?? "").trim();
    let s = raw.length ? raw : fallback;
    s = s.trim();
    if (s.startsWith("{") && s.endsWith("}")) {
        s = s.substring(1, s.length - 1).trim();
    }
    return `{${s}}`;
};


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
                {k: "targetExpr", t: "text", def: "this.pos"},

                {k: "strength", t: "number", step: 0.01, def: 0.8},
                {k: "range", t: "number", step: 0.01, def: 8.0},
                {k: "falloffPower", t: "number", step: 0.01, def: 2.0},
                {k: "minDistance", t: "number", step: 0.01, def: 0.25},
            ],
            toKotlin: (c) => {
                const p = c.params;
                const targetLine = (p.targetMode === "expr")
                    ? `.target${kTrailingLambda(p.targetExpr, "this.pos")}`
                    : `.target(${kSupplierVec3(p.targetX, p.targetY, p.targetZ)})`;

                return chain([
                    `ParticleAttractionCommand()`,
                    targetLine,
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
                {k: "centerExpr", t: "text", def: "this.pos"},

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
                const centerLine = (p.centerMode === "expr")
                    ? `.center${kTrailingLambda(p.centerExpr, "this.pos")}`
                    : `.center(${kSupplierVec3(p.centerX, p.centerY, p.centerZ)})`;

                return chain([
                    `ParticleOrbitCommand()`,
                    centerLine,
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
                {k: "centerExpr", t: "text", def: "this.pos"},

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
                const centerLine = (p.centerMode === "expr")
                    ? `.center${kTrailingLambda(p.centerExpr, "this.pos")}`
                    : `.center(${kSupplierVec3(p.centerX, p.centerY, p.centerZ)})`;

                return chain([
                    `ParticleVortexCommand()`,
                    centerLine,
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
                {k: "centerExpr", t: "text", def: "this.pos"},

                {k: "axisX", t: "number", step: 0.01, def: 0.0},
                {k: "axisY", t: "number", step: 0.01, def: 1.0},
                {k: "axisZ", t: "number", step: 0.01, def: 0.0},

                {k: "strength", t: "number", step: 0.01, def: 0.35},
                {k: "range", t: "number", step: 0.01, def: 8.0},
                {k: "falloffPower", t: "number", step: 0.01, def: 2.0},
            ],
            toKotlin: (c) => {
                const p = c.params;
                const centerLine = (p.centerMode === "expr")
                    ? `.center${kTrailingLambda(p.centerExpr, "this.pos")}`
                    : `.center(${kSupplierVec3(p.centerX, p.centerY, p.centerZ)})`;

                return chain([
                    `ParticleRotationForceCommand()`,
                    centerLine,
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
        autoPaused: false,
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


    // ---------- persistence & card undo/redo ----------
    const STORAGE_KEY = "pe_state_v2";
    const HISTORY_MAX = 80;

    const deepCopy = (o) => JSON.parse(JSON.stringify(o));

    // 默认状态快照（用于一键恢复）
    const DEFAULT_BASE_STATE = deepCopy(state);
    function makeDefaultCommands(){
        return [newCommand("ParticleNoiseCommand"), newCommand("ParticleDragCommand")];
    }

    function buildPersistPayload() {
        // 只保存与编辑器相关的数据（不保存 Three/运行时）
        return {
            version: 2,
            savedAt: new Date().toISOString(),
            state: {
                commands: deepCopy(state.commands),
                ticksPerSecond: state.ticksPerSecond,
                emitter: deepCopy(state.emitter),
                particle: deepCopy(state.particle),
                kotlin: deepCopy(state.kotlin),
            }
        };
    }

    let saveTimer = 0;
    function saveNow() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPersistPayload()));
        } catch (_) {
            // ignore quota / private mode
        }
    }

    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 200);
    }

    function deepAssign(dst, src) {
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

    function normalizeCommand(raw) {
        if (!raw || typeof raw !== "object") return null;
        const type = raw.type;
        if (!type || !COMMAND_META[type]) return null;
        const base = newCommand(type);
        if (typeof raw.id === "string" && raw.id.trim().length) base.id = raw.id.trim();
        if (typeof raw.enabled === "boolean") base.enabled = raw.enabled;
        if (raw.params && typeof raw.params === "object") deepAssign(base.params, raw.params);
        return base;
    }

    function applyLoadedState(s) {
        if (!s || typeof s !== "object") return false;

        if (typeof s.ticksPerSecond === "number") state.ticksPerSecond = s.ticksPerSecond;
        if (s.emitter) deepAssign(state.emitter, s.emitter);
        if (s.particle) deepAssign(state.particle, s.particle);
        if (s.kotlin) deepAssign(state.kotlin, s.kotlin);

        const cmds = Array.isArray(s.commands) ? s.commands : [];
        const norm = cmds.map(normalizeCommand).filter(Boolean);
        state.commands = norm;

        if (!state.commands.length) {
            state.commands.push(newCommand("ParticleNoiseCommand"));
            state.commands.push(newCommand("ParticleDragCommand"));
        }
        return true;
    }

    function loadPersisted() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const obj = JSON.parse(raw);
            if (obj && typeof obj === "object") {
                if (obj.state) return applyLoadedState(obj.state);
                return applyLoadedState(obj);
            }
        } catch (_) {
            // ignore
        }
        return false;
    }

    function applyStateToForm() {
        // 基础
        $("#emitterType").val(state.emitter.type);
        setEmitterSection();
        $("#ticksPerSecond").val(state.ticksPerSecond);

        // 偏移
        $("#emitOffX").val(state.emitter.offset.x);
        $("#emitOffY").val(state.emitter.offset.y);
        $("#emitOffZ").val(state.emitter.offset.z);

        // 粒子
        $("#lifeMin").val(state.particle.lifeMin);
        $("#lifeMax").val(state.particle.lifeMax);
        $("#sizeMin").val(state.particle.sizeMin);
        $("#sizeMax").val(state.particle.sizeMax);
        $("#countMin").val(state.particle.countMin);
        $("#countMax").val(state.particle.countMax);
        $("#velX").val(state.particle.vel.x);
        $("#velY").val(state.particle.vel.y);
        $("#velZ").val(state.particle.vel.z);
        $("#velSpeed").val(state.particle.velSpeed);
        $("#visibleRange").val(state.particle.visibleRange);
        $("#colStart").val(state.particle.colorStart);
        $("#colEnd").val(state.particle.colorEnd);

        // emitter params
        $("#boxX").val(state.emitter.box.x);
        $("#boxY").val(state.emitter.box.y);
        $("#boxZ").val(state.emitter.box.z);
        $("#boxDensity").val(state.emitter.box.density);
        $("#boxSurface").val(state.emitter.box.surface ? "1" : "0");

        $("#sphereR").val(state.emitter.sphere.r);
        $("#sphereSurfR").val(state.emitter.sphereSurface.r);

        $("#ringR").val(state.emitter.ring.r);
        $("#ringThickness").val(state.emitter.ring.thickness);
        $("#ringAx").val(state.emitter.ring.axis.x);
        $("#ringAy").val(state.emitter.ring.axis.y);
        $("#ringAz").val(state.emitter.ring.axis.z);

        // kotlin
        $("#kVarName").val(state.kotlin.varName);
        $("#kRefName").val(state.kotlin.kRefName);
    }

    const cardHistory = {
        undo: [],
        redo: [],
        init() {
            this.undo = [deepCopy(state.commands)];
            this.redo = [];
        },
        push() {
            const snap = deepCopy(state.commands);
            const last = this.undo[this.undo.length - 1];
            if (JSON.stringify(last) === JSON.stringify(snap)) return;
            this.undo.push(snap);
            if (this.undo.length > HISTORY_MAX) this.undo.shift();
            this.redo = [];
        },
        undoOnce() {
            if (this.undo.length <= 1) return false;
            const cur = this.undo.pop();
            this.redo.push(cur);
            state.commands = deepCopy(this.undo[this.undo.length - 1]);
            renderCommandList();
            autoGenKotlin();
            scheduleSave();
            toast("已撤回");
            return true;
        },
        redoOnce() {
            if (!this.redo.length) return false;
            const next = this.redo.pop();
            this.undo.push(deepCopy(next));
            state.commands = deepCopy(next);
            renderCommandList();
            autoGenKotlin();
            scheduleSave();
            toast("已重做");
            return true;
        }
    };

    let histTimer = 0;
    function scheduleHistoryPush() {
        clearTimeout(histTimer);
        histTimer = setTimeout(() => cardHistory.push(), 250);
    }

    async function exportStateJson() {
        try {
            readBaseForm();
            const payload = buildPersistPayload();
            const json = JSON.stringify(payload, null, 2);
            const suggestedName = `particle_emitter_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({
                    suggestedName,
                    types: [{
                        description: "JSON",
                        accept: {"application/json": [".json"]}
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(json);
                await writable.close();
                toast("\u4fdd\u5b58\u6210\u529f", "success");
                return;
            }

            // fallback: download
            const blob = new Blob([json], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = suggestedName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast("\u4fdd\u5b58\u6210\u529f", "success");
        } catch (e) {
            if (e && e.name === "AbortError") {
                toast("\u53d6\u6d88\u4fdd\u5b58", "error");
                return;
            }
            console.error(e);
            toast(`\u4fdd\u5b58\u5931\u8d25\uff1a${e.message || e}`, "error");
        }
    }

    function importStateFromText(text) {
        let obj;
        try {
            obj = JSON.parse(text);
        } catch (e) {
            toast(`\u5bfc\u5165\u5931\u8d25-\u683c\u5f0f\u9519\u8bef(${e.message || e})`, "error");
            return;
        }

        const s = (obj && typeof obj === "object" && obj.state) ? obj.state : obj;
        const ok = applyLoadedState(s);
        if (!ok) {
            toast("\u5bfc\u5165\u5931\u8d25-\u683c\u5f0f\u9519\u8bef(\u5185\u5bb9\u4e0d\u652f\u6301)", "error");
            return;
        }

        applyStateToForm();
        renderCommandList();
        autoGenKotlin();
        cardHistory.init();
        scheduleSave();
        toast("\u5bfc\u5165\u6210\u529f", "success");
    }

    async function importStateJson() {
        try {
            if (window.showOpenFilePicker) {
                const [handle] = await window.showOpenFilePicker({
                    multiple: false,
                    types: [{
                        description: "JSON",
                        accept: {"application/json": [".json"]}
                    }]
                });
                const file = await handle.getFile();
                const text = await file.text();
                importStateFromText(text);
                return;
            }

            // fallback: hidden input
            const $f = $("#importFile");
            // one-shot change handler
            $f.off("change._import");
            $f.on("change._import", async function () {
                try {
                    const file = (this.files && this.files[0]) ? this.files[0] : null;
                    // reset value so selecting the same file again still triggers change
                    this.value = "";
                    if (!file) return;
                    const text = await file.text();
                    importStateFromText(text);
                } catch (err) {
                    console.error(err);
                    toast(`\u5bfc\u5165\u5931\u8d25-\u683c\u5f0f\u9519\u8bef(${err.message || err})`, "error");
                } finally {
                    $f.off("change._import");
                }
            });
            $f.val("");
            $f.trigger("click");
        } catch (e) {
            if (e && e.name === "AbortError") {
                toast("\u53d6\u6d88\u5bfc\u5165", "error");
                return;
            }
            console.error(e);
            toast(`\u5bfc\u5165\u5931\u8d25-\u683c\u5f0f\u9519\u8bef(${e.message || e})`, "error");
        }
    }

    async function resetAllToDefault() {
        const ok = await confirmBox({
            title: "恢复默认设置",
            message: "这将把默认卡片（命令列表）和默认发射器/粒子参数全部恢复为初始值，并覆盖浏览器保存的上一次编辑结果。\n\n确认继续？",
            okText: "恢复默认",
            cancelText: "取消",
            okDanger: true,
        });
        if (!ok) return;

        // 退出全屏（如果在全屏）
        if (state.fullscreen) setFullscreen(false);

        // 恢复基础参数
        state.playing = DEFAULT_BASE_STATE.playing;
        state.ticksPerSecond = DEFAULT_BASE_STATE.ticksPerSecond;
        state.fullscreen = false;
        state.emitter = deepCopy(DEFAULT_BASE_STATE.emitter);
        state.particle = deepCopy(DEFAULT_BASE_STATE.particle);
        state.kotlin = deepCopy(DEFAULT_BASE_STATE.kotlin);

        // 恢复默认卡片
        state.commands = makeDefaultCommands();

        // 应用到 UI
        applyStateToForm();
        setEmitterSection();
        renderCommandList();
        autoGenKotlin();

        // 重置撤回/重做栈
        cardHistory.init();

        // 清空预览粒子
        clearParticles();

        scheduleSave();
        toast("已恢复默认");
    }


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
                const axis = vec3(ax0, ay0, az0);
                const axisLen = axis.length();
                if (axisLen < 1e-9) break;
                axis.multiplyScalar(1.0 / axisLen);

                const swirlStrength = Number(p.swirlStrength) || 0;
                const radialPull = Number(p.radialPull) || 0;   // 正值=吸向 center
                const axialLift = Number(p.axialLift) || 0;

                const range = Number(p.range) || 1;
                const falloffPower = Number(p.falloffPower) || 1;
                const minDistance = Math.max(1e-6, Number(p.minDistance) || 0.2);

                const center = vec3(cx, cy, cz);

                // r: from center -> particle
                const r = particle.pos.clone().sub(center);
                const dist0 = r.length();
                if (dist0 < 1e-9) break;

                const dist = Math.max(dist0, minDistance);
                const falloff = inversePowerFalloff(dist, range, falloffPower);

                // tangential: axis × r
                const tang = axis.clone().cross(r);
                const tLen = tang.length();
                if (tLen < 1e-9) break;
                tang.multiplyScalar(1.0 / tLen);

                // inward: particle -> center
                const inward = r.multiplyScalar(-1.0 / dist);

                const dv = vec3(0, 0, 0)
                    .add(tang.multiplyScalar(swirlStrength * falloff))     // 旋转
                    .add(inward.multiplyScalar(radialPull * falloff))      // 吸入
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

    const FIELD_CN = {
        strength: "强度",
        frequency: "频率",
        speed: "速度",
        affectY: "影响Y轴",
        clampSpeed: "速度上限",
        useLifeCurve: "使用生命曲线",
        damping: "阻尼",
        linear: "线性阻力",
        minSpeed: "最小速度",
        amplitude: "振幅",
        timeScale: "时间缩放",
        phaseOffset: "相位偏移",
        worldOffsetX: "世界偏移X",
        worldOffsetY: "世界偏移Y",
        worldOffsetZ: "世界偏移Z",
        targetMode: "目标模式",
        targetX: "目标X",
        targetY: "目标Y",
        targetZ: "目标Z",
        targetExpr: "目标表达式",
        centerMode: "中心模式",
        centerX: "中心X",
        centerY: "中心Y",
        centerZ: "中心Z",
        centerExpr: "中心表达式",
        axisX: "轴X",
        axisY: "轴Y",
        axisZ: "轴Z",
        radius: "半径",
        angularSpeed: "角速度",
        radialCorrect: "径向修正",
        minDistance: "最小距离",
        mode: "模式",
        maxRadialStep: "最大径向步长",
        swirlStrength: "旋转强度",
        radialPull: "径向吸引",
        axialLift: "轴向提升",
        range: "范围",
        falloffPower: "衰减指数",
        emitterRef: "发射器引用",
    };

    function humanFieldName(k) {
        const cn = FIELD_CN[k];
        return cn ? `${k} (${cn})` : k;
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
            scheduleHistoryPush();
            scheduleSave();
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
            scheduleHistoryPush();
            scheduleSave();
            autoGenKotlin();
        });

        $(".btnDel").off("click").on("click", function () {
            const id = $(this).closest(".cmdCard").data("id");
            state.commands = state.commands.filter(x => x.id !== id);
            cardHistory.push();
            scheduleSave();
            renderCommandList();
            autoGenKotlin();
        });

        $(".btnDup").off("click").on("click", function () {
            const id = $(this).closest(".cmdCard").data("id");
            const cmd = state.commands.find(x => x.id === id);
            const copy = JSON.parse(JSON.stringify(cmd));
            copy.id = cryptoRandomId();
            state.commands.push(copy);
            cardHistory.push();
            scheduleSave();
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
                    cardHistory.push();
                    scheduleSave();
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

    function toast(msg, type = "info") {
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

        const colors = {
            info: {
                bg: "rgba(8,12,18,.85)",
                border: "rgba(28,42,63,.95)",
                color: "rgba(230,238,252,.95)",
            },
            success: {
                bg: "rgba(60,190,120,.75)",
                border: "rgba(60,190,120,.95)",
                color: "#f4fff8",
            },
            error: {
                bg: "rgba(255,92,92,.75)",
                border: "rgba(255,92,92,.95)",
                color: "#fff1f1",
            },
        };
        const c = colors[type] || colors.info;
        $t.text(msg).css({
            opacity: "1",
            background: c.bg,
            borderColor: c.border,
            color: c.color,
        });
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => $t.css("opacity", "0"), 1400);
    }

    // ---------- pretty confirm (no native confirm/alert) ----------

    function confirmBox({
        title = "确认",
        message = "确定要继续吗？",
        okText = "确定",
        cancelText = "取消",
        okDanger = true,
    } = {}) {
        return new Promise((resolve) => {
            const $mask = $(
                `<div id="_confirmMask" style="
                    position:fixed; inset:0; z-index:100000;
                    background:rgba(0,0,0,.55);
                    display:flex; align-items:center; justify-content:center;
                    backdrop-filter: blur(10px);
                "></div>`
            );

            const okCls = okDanger ? "danger" : "primary";
            const $card = $(
                `<div style="
                    width:min(520px, calc(100vw - 24px));
                    border-radius:16px;
                    border:1px solid rgba(255,255,255,.12);
                    background: linear-gradient(180deg, rgba(16,24,38,.98), rgba(16,24,38,.86));
                    box-shadow: 0 20px 60px rgba(0,0,0,.55);
                    padding:14px;
                ">
                    <div style="font-weight:900; margin-bottom:8px;">${escapeHtml(title)}</div>
                    <div style="color:var(--muted); line-height:1.6; white-space:pre-wrap;">${escapeHtml(message)}</div>
                    <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px;">
                        <button class="btn" id="_confirmCancel">${escapeHtml(cancelText)}</button>
                        <button class="btn ${okCls}" id="_confirmOk">${escapeHtml(okText)}</button>
                    </div>
                </div>`
            );

            function close(ret) {
                $(document).off("keydown._confirm");
                $mask.remove();
                resolve(ret);
            }

            $mask.on("click", (e) => {
                if (e.target === $mask[0]) close(false);
            });
            $card.find("#_confirmCancel").on("click", () => close(false));
            $card.find("#_confirmOk").on("click", () => close(true));
            $(document).on("keydown._confirm", (e) => {
                if (e.key === "Escape") close(false);
            });

            $mask.append($card);
            $("body").append($mask);
        });
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
                scheduleSave();
            });
        $("#boxX,#boxY,#boxZ,#boxDensity,#boxSurface,#sphereR,#sphereSurfR,#ringR,#ringThickness,#ringAx,#ringAy,#ringAz")
            .on("input change", () => {
                readBaseForm();
                scheduleSave();
            });

        $("#btnPlay").on("click", () => {
            state.playing = true;
            state.autoPaused = false;
            toast("预览：播放");
        });
        $("#btnPause").on("click", () => {
            state.playing = false;
            state.autoPaused = false;
            toast("预览：暂停");
        });
        $("#btnClear").on("click", () => {
            clearParticles();
            toast("已清空");
        });

        $("#btnAddCmd").on("click", () => {
            const type = $("#addCommandType").val();
            state.commands.push(newCommand(type));
            cardHistory.push();
            scheduleSave();
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

        

        $("#btnExportJson").on("click", () => exportStateJson());
        $("#btnImportJson").on("click", () => importStateJson());
        $("#btnResetAll").on("click", () => resetAllToDefault());

        $("#btnImportJson").on("change", async function () {
            const file = this.files && this.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                importStateFromText(text);
            } catch (e) {
                console.error(e);
                toast("导入失败");
            }
        });
$("#btnFull, #btnFullTop").on("click", () => setFullscreen(true));
        $("#btnExitFull").on("click", () => setFullscreen(false));

        // 快捷键：撤回/重做（不在输入框时） + ESC 退出全屏
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && state.fullscreen) {
                setFullscreen(false);
                return;
            }

            const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
            const mod = isMac ? e.metaKey : e.ctrlKey;
            const key = (e.key || "").toLowerCase();

            if (mod && key === "s" && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                exportStateJson();
                return;
            }

            const el = document.activeElement;
            const isEditable = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName));
            if (isEditable) return;

            if (!mod) return;

            const k = (e.key || "").toLowerCase();
            if (k === "z" && !e.shiftKey) {
                e.preventDefault();
                cardHistory.undoOnce();
            } else if (k === "y" || (k === "z" && e.shiftKey)) {
                e.preventDefault();
                cardHistory.redoOnce();
            }
        });

        // 离开窗口/切到后台自动暂停，返回时如果之前在播放则继续
        const autoPause = () => {
            if (state.playing) {
                state.playing = false;
                state.autoPaused = true;
            }
        };
        const autoResume = () => {
            if (state.autoPaused) {
                state.playing = true;
                state.autoPaused = false;
                sim.lastTime = performance.now();
            }
        };
        window.addEventListener("blur", autoPause);
        window.addEventListener("focus", autoResume);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") autoPause();
            if (document.visibilityState === "visible") autoResume();
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
        const loaded = loadPersisted();
        if (!loaded) {
            state.commands.push(newCommand("ParticleNoiseCommand"));
            state.commands.push(newCommand("ParticleDragCommand"));
        }

        applyStateToForm();
        setEmitterSection();
        renderCommandList();
        autoGenKotlin();
        cardHistory.init();
        scheduleSave();

        initThree();
        animate();
        initThemeToggle();
    }

    $(document).ready(() => {
        bindEvents();
        boot();
    });
})();
