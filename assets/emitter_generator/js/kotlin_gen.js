import { COMMAND_META } from "./command_meta.js";
import { fmtD, indent } from "./utils.js";

function fmtInt(n, fallback = 0) {
    const v = Number(n);
    if (!Number.isFinite(v)) return String(fallback);
    return String(Math.round(v));
}

function fmtFloatF(n, fallback = 0) {
    const v = Number(n);
    const base = Number.isFinite(v) ? v : fallback;
    if (Number.isFinite(base) && Math.abs(base - Math.round(base)) < 1e-6) {
        return `${Math.round(base)}f`;
    }
    return `${fmtD(base)}f`;
}

function normalizeName(name, fallback) {
    const raw = String(name || "").trim();
    if (!raw) return fallback;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return fallback;
    return raw;
}

function fmtPiFromDeg(deg) {
    const v = Number(deg);
    if (!Number.isFinite(v) || Math.abs(v) < 1e-9) return "0.0";
    const sign = v < 0 ? "-" : "";
    const ratio = Math.abs(v) / 180.0;
    if (Math.abs(ratio - 1.0) < 1e-6) return sign ? "-PI" : "PI";
    return `${sign}${fmtD(ratio)} * PI`;
}

function buildEmitterBuilderLines(state, dataName) {
    const t = state.emitter.type;
    const lines = [];

    if (t === "point") {
        lines.push(".addWith {");
        lines.push("    val res = arrayListOf<RelativeLocation>()");
        lines.push(`    repeat(${dataName}.getRandomCount()) {`);
        lines.push("        res.add(RelativeLocation(0.0, 0.0, 0.0))");
        lines.push("    }");
        lines.push("    res");
        lines.push("}");
        return lines;
    }

    if (t === "box") {
        const b = state.emitter.box || {};
        lines.push(".addWith {");
        lines.push("    val res = arrayListOf<RelativeLocation>()");
        lines.push(`    val bx = ${fmtD(b.x ?? 0)}`);
        lines.push(`    val by = ${fmtD(b.y ?? 0)}`);
        lines.push(`    val bz = ${fmtD(b.z ?? 0)}`);
        lines.push(`    val density = ${fmtD(b.density ?? 0)}`);
        lines.push(`    val surface = ${b.surface ? "true" : "false"}`);
        lines.push("    val rand = kotlin.random.Random.Default");
        lines.push("    fun biased(u: Double): Double {");
        lines.push("        if (density <= 0.0) return u");
        lines.push("        val s = if (u < 0.0) -1.0 else 1.0");
        lines.push("        val a = kotlin.math.abs(u)");
        lines.push("        val pow = 1.0 + (4.0 - 1.0) * density");
        lines.push("        return s * Math.pow(a, pow)");
        lines.push("    }");
        lines.push(`    repeat(${dataName}.getRandomCount()) {`);
        lines.push("        var x = biased(rand.nextDouble(-0.5, 0.5)) * bx");
        lines.push("        var y = biased(rand.nextDouble(-0.5, 0.5)) * by");
        lines.push("        var z = biased(rand.nextDouble(-0.5, 0.5)) * bz");
        lines.push("        if (surface) {");
        lines.push("            when (rand.nextInt(0, 3)) {");
        lines.push("                0 -> x = (if (rand.nextBoolean()) -0.5 else 0.5) * bx");
        lines.push("                1 -> y = (if (rand.nextBoolean()) -0.5 else 0.5) * by");
        lines.push("                else -> z = (if (rand.nextBoolean()) -0.5 else 0.5) * bz");
        lines.push("            }");
        lines.push("        }");
        lines.push("        res.add(RelativeLocation(x, y, z))");
        lines.push("    }");
        lines.push("    res");
        lines.push("}");
        return lines;
    }

    if (t === "sphere") {
        const r = state.emitter.sphere?.r ?? 0;
        lines.push(".addWith {");
        lines.push("    val res = arrayListOf<RelativeLocation>()");
        lines.push(`    val r = ${fmtD(r)}`);
        lines.push("    val rand = kotlin.random.Random.Default");
        lines.push(`    repeat(${dataName}.getRandomCount()) {`);
        lines.push("        val u = rand.nextDouble()");
        lines.push("        val v = rand.nextDouble()");
        lines.push("        val theta = 2.0 * Math.PI * u");
        lines.push("        val phi = Math.acos(2.0 * v - 1.0)");
        lines.push("        val rr = r * Math.cbrt(rand.nextDouble())");
        lines.push("        val x = Math.sin(phi) * Math.cos(theta) * rr");
        lines.push("        val y = Math.cos(phi) * rr");
        lines.push("        val z = Math.sin(phi) * Math.sin(theta) * rr");
        lines.push("        res.add(RelativeLocation(x, y, z))");
        lines.push("    }");
        lines.push("    res");
        lines.push("}");
        return lines;
    }

    if (t === "sphere_surface") {
        const r = state.emitter.sphereSurface?.r ?? 0;
        lines.push(".addWith {");
        lines.push("    val res = arrayListOf<RelativeLocation>()");
        lines.push(`    val r = ${fmtD(r)}`);
        lines.push("    val rand = kotlin.random.Random.Default");
        lines.push(`    repeat(${dataName}.getRandomCount()) {`);
        lines.push("        val u = rand.nextDouble()");
        lines.push("        val v = rand.nextDouble()");
        lines.push("        val theta = 2.0 * Math.PI * u");
        lines.push("        val phi = Math.acos(2.0 * v - 1.0)");
        lines.push("        val x = Math.sin(phi) * Math.cos(theta) * r");
        lines.push("        val y = Math.cos(phi) * r");
        lines.push("        val z = Math.sin(phi) * Math.sin(theta) * r");
        lines.push("        res.add(RelativeLocation(x, y, z))");
        lines.push("    }");
        lines.push("    res");
        lines.push("}");
        return lines;
    }

    if (t === "line") {
        const dir = state.emitter.line?.dir || {x: 1, y: 0, z: 0};
        const step = state.emitter.line?.step ?? 0.2;
        lines.push(`.addLine(RelativeLocation(${fmtD(dir.x)}, ${fmtD(dir.y)}, ${fmtD(dir.z)}), ${fmtD(step)}, ${dataName}.getRandomCount())`);
        return lines;
    }

    if (t === "circle") {
        const r = state.emitter.circle?.r ?? 0;
        lines.push(`.addCircle(${fmtD(r)}, ${dataName}.getRandomCount())`);
        lines.push(".rotateTo(axis)");
        lines.push(".axis(axis)");
        return lines;
    }

    if (t === "arc") {
        const arc = state.emitter.arc || {};
        const start = fmtPiFromDeg(arc.start ?? 0);
        const end = fmtPiFromDeg(arc.end ?? 0);
        const rotate = fmtPiFromDeg(arc.rotate ?? 0);
        lines.push(`.addRadian(${fmtD(arc.r ?? 0)}, ${dataName}.getRandomCount(), ${start}, ${end}, ${rotate})`);
        lines.push(".rotateTo(axis)");
        lines.push(".axis(axis)");
        return lines;
    }

    if (t === "spiral") {
        const s = state.emitter.spiral || {};
        lines.push(`.addSpiral(${fmtD(s.startR ?? 0)}, ${fmtD(s.endR ?? 0)}, ${fmtD(s.height ?? 0)}, ${dataName}.getRandomCount(), ${fmtD(s.rotateSpeed ?? 0)}, ${fmtD(s.rBias ?? 1)}, ${fmtD(s.hBias ?? 1)})`);
        lines.push(".rotateTo(axis)");
        lines.push(".axis(axis)");
        return lines;
    }

    const ring = state.emitter.ring || {};
    lines.push(`.addDiscreteCircleXZ(${fmtD(ring.r ?? 0)}, ${dataName}.getRandomCount(), ${fmtD(ring.thickness ?? 0)})`);
    lines.push(".rotateTo(axis)");
    lines.push(".axis(axis)");
    return lines;
}

export function genCommandKotlin(state) {
    const varName = (state.kotlin.varName || "command").trim() || "command";
    const ctx = {kRefName: (state.kotlin.kRefName || "emitter").trim() || "emitter"};

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

export function genEmitterKotlin(state, settings = {}) {
    const templateName = normalizeName(
        (state.kotlin && state.kotlin.templateName) || settings.templateName,
        "template"
    );
    const dataName = normalizeName(
        (state.kotlin && state.kotlin.emitterDataName) || settings.emitterDataName,
        "emitterData"
    );

    const p = state.particle;
    const off = state.emitter.offset || {x: 0, y: 0, z: 0};

    const lines = [];
    lines.push("@CodecField");
    lines.push(`var ${dataName} = SimpleRandomParticleData()`);
    lines.push("    .apply {");
    lines.push(`        minSize = ${fmtD(p.sizeMin)}`);
    lines.push(`        maxSize = ${fmtD(p.sizeMax)}`);
    lines.push(`        minCount = ${fmtInt(p.countMin)}`);
    lines.push(`        maxCount = ${fmtInt(p.countMax)}`);
    lines.push(`        minSpeed = ${fmtD(p.velSpeedMin)}`);
    lines.push(`        maxSpeed = ${fmtD(p.velSpeedMax)}`);
    lines.push(`        minAge = ${fmtInt(p.lifeMin)}`);
    lines.push(`        maxAge = ${fmtInt(p.lifeMax)}`);
    lines.push("    }");
    lines.push("");

    if (state.emission?.mode === "once") {
        lines.push("init { maxTick = 1 }");
        lines.push("");
    }

    lines.push("override fun genParticles(lerpProgress: Float): List<Pair<ControlableParticleData, RelativeLocation>> {");
    lines.push(`    val offset = RelativeLocation(${fmtD(off.x)}, ${fmtD(off.y)}, ${fmtD(off.z)})`);
    if (["ring", "circle", "arc", "spiral"].includes(state.emitter.type)) {
        const ax =
            state.emitter.type === "circle" ? (state.emitter.circle?.axis || {x: 0, y: 1, z: 0}) :
            state.emitter.type === "arc" ? (state.emitter.arc?.axis || {x: 0, y: 1, z: 0}) :
            state.emitter.type === "spiral" ? (state.emitter.spiral?.axis || {x: 0, y: 1, z: 0}) :
            (state.emitter.ring?.axis || {x: 0, y: 1, z: 0});
        lines.push(`    val axis = RelativeLocation(${fmtD(ax.x)}, ${fmtD(ax.y)}, ${fmtD(ax.z)})`);
    }
    lines.push("    return PointsBuilder()");
    const chainLines = buildEmitterBuilderLines(state, dataName);
    chainLines.forEach((line) => lines.push(`        ${line}`));
    lines.push("        .createWithoutClone().map {");
    const v = p.vel || {x: 0, y: 0, z: 0};
    lines.push(`            ${templateName}.clone().apply {`);
    lines.push(`                this.velocity = Vec3d(${fmtD(v.x)}, ${fmtD(v.y)}, ${fmtD(v.z)}) * ${dataName}.getRandomSpeed()`);
    lines.push(`                this.maxAge = ${dataName}.getRandomParticleMaxAge()`);
    lines.push(`                this.size = ${dataName}.getRandomSize()`);
    lines.push(`                this.visibleRange = ${fmtFloatF(p.visibleRange, 128)}`);
    lines.push("            } to it.add(offset)");
    lines.push("        }");
    lines.push("}");

    return lines.join("\n");
}
