const TAU = Math.PI * 2;

function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    if (n <= 0) return 0;
    if (n >= 1) return 1;
    return n;
}

function outBounce(t) {
    const x = clamp01(t);
    const n1 = 7.5625;
    const d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) {
        const p = x - 1.5 / d1;
        return n1 * p * p + 0.75;
    }
    if (x < 2.5 / d1) {
        const p = x - 2.25 / d1;
        return n1 * p * p + 0.9375;
    }
    const p = x - 2.625 / d1;
    return n1 * p * p + 0.984375;
}

const EASES = {
    linear: (t) => clamp01(t),
    outCubic: (t) => {
        const x = clamp01(t);
        const inv = 1 - x;
        return 1 - inv * inv * inv;
    },
    inOutSine: (t) => {
        const x = clamp01(t);
        return (1 - Math.cos(Math.PI * x)) / 2;
    },
    outExpo: (t) => {
        const x = clamp01(t);
        if (x >= 1) return 1;
        return 1 - Math.pow(2, -10 * x);
    },
    inCubic: (t) => {
        const x = clamp01(t);
        return x * x * x;
    },
    inOutCubic: (t) => {
        const x = clamp01(t);
        if (x < 0.5) return 4 * x * x * x;
        return 1 - Math.pow(-2 * x + 2, 3) / 2;
    },
    outQuad: (t) => {
        const x = clamp01(t);
        return 1 - (1 - x) * (1 - x);
    },
    outBack: (t) => {
        const x = clamp01(t);
        const overshoot = 1.70158;
        const c3 = overshoot + 1;
        const p = x - 1;
        return 1 + c3 * p * p * p + overshoot * p * p;
    },
    outElastic: (t) => {
        const x = clamp01(t);
        if (x === 0 || x === 1) return x;
        const period = TAU / 3;
        const shift = 0.75;
        return Math.pow(2, -10 * x) * Math.sin((x * 10 - shift) * period) + 1;
    },
    outBounce
};

function resolveEase(name) {
    const key = String(name || "").trim();
    return EASES[key] || EASES.outCubic;
}

export function computeAngleAnimatorAngle(options = {}) {
    const targetAngle = Number(options.targetAngle);
    const target = Number.isFinite(targetAngle) ? targetAngle : 0;
    if (Math.abs(target) < 1e-12) return 0;

    const glowTickRaw = Number(options.glowTick);
    const glowTick = Number.isFinite(glowTickRaw) && glowTickRaw > 0 ? glowTickRaw : 1;
    const ease = resolveEase(options.easeName);

    const ageTickRaw = Number(options.ageTick);
    const ageTick = Number.isFinite(ageTickRaw) ? Math.max(0, ageTickRaw) : 0;
    const elapsedTickRaw = Number(options.elapsedTick);
    const elapsedTick = Number.isFinite(elapsedTickRaw) ? Math.max(0, elapsedTickRaw) : ageTick;

    const status = (options.status && typeof options.status === "object") ? options.status : null;
    const reverseOnDisable = options.reverseOnDisable === true;
    const isDisable = status ? Number(status.displayStatus) === 2 : false;
    const dissolveStart = status ? Number(status.__dissolveStartTick) : NaN;

    if (reverseOnDisable && isDisable && Number.isFinite(dissolveStart)) {
        const fadeTick = Math.max(0, elapsedTick - dissolveStart);
        const t = clamp01(fadeTick / glowTick);
        return target * ease(1 - t);
    }

    const t = clamp01(ageTick / glowTick);
    return target * ease(t);
}
