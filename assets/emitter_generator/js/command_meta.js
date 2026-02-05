import {
    fmtD,
    fmtB,
    kVec3,
    kSupplierVec3,
    kTrailingLambda,
    chain,
    deepCopy,
} from "./utils.js";

export const COMMAND_META = {
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
            {
                k: "centerMode", t: "select", def: "const", opts: [
                    ["const", "常量 Vec3"],
                    ["expr", "Kotlin 表达式"],
                ]
            },
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
            {
                k: "centerMode", t: "select", def: "const", opts: [
                    ["const", "常量 Vec3"],
                    ["expr", "Kotlin 表达式"],
                ]
            },
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
            {
                k: "centerMode", t: "select", def: "const", opts: [
                    ["const", "常量 Vec3"],
                    ["expr", "Kotlin 表达式"],
                ]
            },
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

export function newCommand(type) {
    const meta = COMMAND_META[type];
    const params = {};
    meta.fields.forEach(f => params[f.k] = f.def);
    return {id: cryptoRandomId(), type, enabled: true, params};
}

export function cryptoRandomId() {
    const a = new Uint32Array(4);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a).map(x => x.toString(16)).join("");
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

export function humanFieldName(k) {
    const cn = FIELD_CN[k];
    return cn ? `${k} (${cn})` : k;
}

export function cloneDefaultCommands() {
    return [
        newCommand("ParticleNoiseCommand"),
        newCommand("ParticleDragCommand"),
    ];
}

export function normalizeCommand(raw) {
    if (!raw || typeof raw !== "object") return null;
    const type = raw.type;
    if (!type || !COMMAND_META[type]) return null;
    const base = newCommand(type);
    if (typeof raw.id === "string" && raw.id.trim().length) base.id = raw.id.trim();
    if (typeof raw.enabled === "boolean") base.enabled = raw.enabled;
    if (raw.params && typeof raw.params === "object") {
        base.params = Object.assign({}, base.params, deepCopy(raw.params));
    }
    return base;
}
