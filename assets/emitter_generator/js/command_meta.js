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

    ParticleDistortionCommand: {
        title: "Distortion 扭曲环",
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
            {k: "centerExpr", t: "text", def: "Vec3.ZERO"},

            {k: "axisX", t: "number", step: 0.01, def: 0.0},
            {k: "axisY", t: "number", step: 0.01, def: 1.0},
            {k: "axisZ", t: "number", step: 0.01, def: 0.0},

            {k: "radius", t: "number", step: 0.01, def: 3.0},
            {k: "radialStrength", t: "number", step: 0.01, def: 0.35},
            {k: "axialStrength", t: "number", step: 0.01, def: 0.25},
            {k: "tangentialStrength", t: "number", step: 0.01, def: 0.0},
            {k: "frequency", t: "number", step: 0.01, def: 0.25},
            {k: "timeScale", t: "number", step: 0.01, def: 0.1},
            {k: "phaseOffset", t: "number", step: 0.01, def: 0.0},
            {k: "followStrength", t: "number", step: 0.01, def: 0.35},
            {k: "maxStep", t: "number", step: 0.01, def: 0.6},
            {k: "baseAxial", t: "number", step: 0.01, def: 0.0},
            {k: "seedOffset", t: "number", step: 1, def: 0},
            {k: "useLifeCurve", t: "bool", def: false},
        ],
        toKotlin: (c) => {
            const p = c.params;
            const centerLine = (p.centerMode === "expr")
                ? `.center${kTrailingLambda(p.centerExpr, "Vec3.ZERO")}`
                : `.center(${kSupplierVec3(p.centerX, p.centerY, p.centerZ)})`;

            return chain([
                `ParticleDistortionCommand()`,
                centerLine,
                `.axis(${kVec3(p.axisX, p.axisY, p.axisZ)})`,
                `.radius(${fmtD(p.radius)})`,
                `.radialStrength(${fmtD(p.radialStrength)})`,
                `.axialStrength(${fmtD(p.axialStrength)})`,
                `.tangentialStrength(${fmtD(p.tangentialStrength)})`,
                `.frequency(${fmtD(p.frequency)})`,
                `.timeScale(${fmtD(p.timeScale)})`,
                `.phaseOffset(${fmtD(p.phaseOffset)})`,
                `.followStrength(${fmtD(p.followStrength)})`,
                `.maxStep(${fmtD(p.maxStep)})`,
                `.baseAxial(${fmtD(p.baseAxial)})`,
                `.seedOffset(${Math.trunc(Number(p.seedOffset) || 0)})`,
                `.useLifeCurve(${fmtB(p.useLifeCurve)})`,
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

const TIP_CENTER_MODE = "中心来源：常量 Vec3 或 Kotlin 表达式（Supplier）。";
const TIP_CENTER_X = "中心坐标 X（centerMode=常量时生效）。";
const TIP_CENTER_Y = "中心坐标 Y（centerMode=常量时生效）。";
const TIP_CENTER_Z = "中心坐标 Z（centerMode=常量时生效）。";
const TIP_CENTER_EXPR = "Kotlin 表达式（返回 Vec3），用于动态中心。";
const TIP_TARGET_MODE = "目标来源：常量 Vec3 或 Kotlin 表达式（Supplier）。";
const TIP_TARGET_X = "目标坐标 X（targetMode=常量时生效）。";
const TIP_TARGET_Y = "目标坐标 Y（targetMode=常量时生效）。";
const TIP_TARGET_Z = "目标坐标 Z（targetMode=常量时生效）。";
const TIP_TARGET_EXPR = "Kotlin 表达式（返回 Vec3），用于动态目标。";
const TIP_AXIS_X = "轴向量 X 分量（会 normalize）。";
const TIP_AXIS_Y = "轴向量 Y 分量（会 normalize）。";
const TIP_AXIS_Z = "轴向量 Z 分量（会 normalize）。";
const TIP_WORLD_OFFSET_X = "世界坐标偏移 X（让流场在不同位置不完全一致）。";
const TIP_WORLD_OFFSET_Y = "世界坐标偏移 Y（让流场在不同位置不完全一致）。";
const TIP_WORLD_OFFSET_Z = "世界坐标偏移 Z（让流场在不同位置不完全一致）。";

const COMMAND_TIPS = {
    ParticleNoiseCommand: {
        strength: "噪声加速度强度（每 tick 叠加到 velocity 的幅度）。值越大扰动越猛，越小越细微。",
        frequency: "空间频率（噪声随空间变化的密度）。越大更细碎更抖；越小更平滑。",
        speed: "时间滚动速度（噪声随时间变化快慢）。越大变化更快；越小更缓慢。",
        affectY: "Y 轴影响比例（垂直扰动缩放）。越大上下翻滚明显，越小更贴地。",
        clampSpeed: "速度上限（限制最终速度，防止噪声累加失控）。",
        useLifeCurve: "是否按生命周期衰减/调制扰动强度。",
    },
    ParticleDragCommand: {
        damping: "阻尼强度（每 tick 速度衰减比例）。0=不阻尼，越大减速越快。",
        linear: "额外线性阻力（每 tick 再缩小一次速度）。建议保持 0，除非需要低速更粘。",
        minSpeed: "最小速度阈值（<=0 不启用）。低于阈值直接归零，避免抖动。",
    },
    ParticleFlowFieldCommand: {
        amplitude: "振幅（每 tick 速度增量幅度）。",
        frequency: "空间频率（纹理密度）。越大更细碎，越小更平滑。",
        timeScale: "时间缩放（流场随时间变化速度）。0=静态。",
        phaseOffset: "相位偏移（错开不同发射器的流场相位）。",
        worldOffsetX: TIP_WORLD_OFFSET_X,
        worldOffsetY: TIP_WORLD_OFFSET_Y,
        worldOffsetZ: TIP_WORLD_OFFSET_Z,
    },
    ParticleAttractionCommand: {
        targetMode: TIP_TARGET_MODE,
        targetX: TIP_TARGET_X,
        targetY: TIP_TARGET_Y,
        targetZ: TIP_TARGET_Z,
        targetExpr: TIP_TARGET_EXPR,
        strength: "强度（>0 吸引，<0 排斥）。",
        range: "有效范围（距离越远衰减越大）。",
        falloffPower: "衰减幂次（1=线性，2=更接近平方反比）。",
        minDistance: "最小距离钳制，避免距离过小导致爆炸/NaN。",
    },
    ParticleOrbitCommand: {
        centerMode: TIP_CENTER_MODE,
        centerX: TIP_CENTER_X,
        centerY: TIP_CENTER_Y,
        centerZ: TIP_CENTER_Z,
        centerExpr: TIP_CENTER_EXPR,
        axisX: TIP_AXIS_X,
        axisY: TIP_AXIS_Y,
        axisZ: TIP_AXIS_Z,
        radius: "目标轨道半径。",
        angularSpeed: "角速度强度（每 tick 切向速度增量）。",
        radialCorrect: "径向纠正强度（拉回目标半径）。",
        minDistance: "最小距离钳制，避免靠近中心时数值异常。",
        mode: "轨道模式：PHYSICAL / SPRING / SNAP。",
        maxRadialStep: "每 tick 最大径向修正量（PHYSICAL/SPRING 有效）。",
    },
    ParticleVortexCommand: {
        centerMode: TIP_CENTER_MODE,
        centerX: TIP_CENTER_X,
        centerY: TIP_CENTER_Y,
        centerZ: TIP_CENTER_Z,
        centerExpr: TIP_CENTER_EXPR,
        axisX: TIP_AXIS_X,
        axisY: TIP_AXIS_Y,
        axisZ: TIP_AXIS_Z,
        swirlStrength: "切向旋转强度（每 tick 切向速度增量）。",
        radialPull: "径向吸入强度（朝轴线收拢）。",
        axialLift: "轴向升降强度（沿轴上升/下降）。",
        range: "衰减范围（>0）。",
        falloffPower: "衰减幂次（1=线性，2=更强衰减）。",
        minDistance: "最小距离钳制，避免 r=0 抖动/爆炸。",
    },
    ParticleRotationForceCommand: {
        centerMode: TIP_CENTER_MODE,
        centerX: TIP_CENTER_X,
        centerY: TIP_CENTER_Y,
        centerZ: TIP_CENTER_Z,
        centerExpr: TIP_CENTER_EXPR,
        axisX: TIP_AXIS_X,
        axisY: TIP_AXIS_Y,
        axisZ: TIP_AXIS_Z,
        strength: "旋转强度（每 tick 切向速度增量）。",
        range: "衰减范围（>0）。",
        falloffPower: "衰减幂次。",
    },
    ParticleDistortionCommand: {
        centerMode: TIP_CENTER_MODE,
        centerX: TIP_CENTER_X,
        centerY: TIP_CENTER_Y,
        centerZ: TIP_CENTER_Z,
        centerExpr: TIP_CENTER_EXPR,
        axisX: TIP_AXIS_X,
        axisY: TIP_AXIS_Y,
        axisZ: TIP_AXIS_Z,
        radius: "基础半径（未扭曲前的目标环半径）。",
        radialStrength: "径向扭曲强度（沿半径方向噪声幅度）。",
        axialStrength: "轴向扭曲强度（沿轴线方向起伏）。",
        tangentialStrength: "切向扭曲强度（沿环方向滑移）。",
        frequency: "空间频率（噪声随位置变化密度）。",
        timeScale: "时间变化速度（噪声滚动快慢）。",
        phaseOffset: "相位偏移（错开不同发射器的噪声起点）。",
        followStrength: "跟随强度（被拉回扭曲环的力度）。",
        maxStep: "每 tick 最大修正步长（限制过猛拉回）。",
        baseAxial: "基础轴向偏移（整体沿轴线抬高/降低）。",
        seedOffset: "噪声种子偏移（同效果的不同随机外观）。",
        useLifeCurve: "是否按生命周期衰减扭曲强度。",
    },
    ParticleGravityCommand: {
        emitterRef: "Emitter 引用名（ClassParticleEmitters），用于读取 gravity。",
    },
};

for (const [type, tips] of Object.entries(COMMAND_TIPS)) {
    const meta = COMMAND_META[type];
    if (!meta || !Array.isArray(meta.fields)) continue;
    for (const field of meta.fields) {
        if (field.tip) continue;
        const tip = tips ? tips[field.k] : "";
        if (tip) field.tip = tip;
    }
}

export function newCommand(type) {
    const meta = COMMAND_META[type];
    const params = {};
    meta.fields.forEach(f => params[f.k] = f.def);
    // signs: 生效标识列表（为空表示对所有粒子生效）
    return {id: cryptoRandomId(), type, enabled: true, params, signs: [], ui: { collapsed: false }};
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
    radialStrength: "径向扭曲强度",
    axialStrength: "轴向扭曲强度",
    tangentialStrength: "切向扭曲强度",
    followStrength: "跟随强度",
    maxStep: "最大步长",
    baseAxial: "轴向基准",
    seedOffset: "噪声种子偏移",
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
    if (raw.ui && typeof raw.ui === "object") {
        base.ui = Object.assign({}, base.ui, deepCopy(raw.ui));
    }

    // 生效标识（兼容旧字段名）
    const rawSigns = raw.signs ?? raw.effectSigns ?? raw.applySigns;
    if (Array.isArray(rawSigns)) {
        const out = [];
        const seen = new Set();
        for (const it of rawSigns) {
            const n = Number(it);
            if (!Number.isFinite(n)) continue;
            const v = Math.trunc(n);
            if (seen.has(v)) continue;
            seen.add(v);
            out.push(v);
        }
        base.signs = out;
    }
    return base;
}
