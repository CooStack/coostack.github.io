import { COMMAND_META } from "./command_meta.js";
import { fmtD, indent, kSupplierVec3, kVec3 } from "./utils.js";

function safeIdent(raw, fallback) {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  // very light sanitize for Kotlin identifier
  const t = s.replace(/[^A-Za-z0-9_]/g, "_");
  return t.length ? t : fallback;
}

function fmtF(n) {
  // Kotlin Float literal
  return `${fmtD(n)}f`;
}

function fmtI(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return String(Math.trunc(x));
}

function fmtHex(hex) {
  const s = String(hex ?? "#ffffff").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  return "#ffffff";
}

function buildEmitterDataApplyLines(card) {
  const p = card?.particle || {};
  const lines = [];

  // These names are intentionally close to UI字段；如果你的 API 不同，手动改成对应的 setter。
  lines.push(`lifeMin = ${fmtI(p.lifeMin)}`);
  lines.push(`lifeMax = ${fmtI(p.lifeMax)}`);
  lines.push(`sizeMin = ${fmtF(p.sizeMin)}`);
  lines.push(`sizeMax = ${fmtF(p.sizeMax)}`);
  lines.push(`countMin = ${fmtI(p.countMin)}`);
  lines.push(`countMax = ${fmtI(p.countMax)}`);

  const v = p.vel || {};
  lines.push(`vel = ${kSupplierVec3(v.x || 0, v.y || 0, v.z || 0)}`);
  lines.push(`velSpeedMin = ${fmtD(p.velSpeedMin ?? 0)}`);
  lines.push(`velSpeedMax = ${fmtD(p.velSpeedMax ?? 0)}`);
  lines.push(`visibleRange = ${fmtI(p.visibleRange)}`);
  lines.push(`colorStart = "${fmtHex(p.colorStart)}"`);
  lines.push(`colorEnd = "${fmtHex(p.colorEnd)}"`);
  return lines;
}

function buildEmitterLocationsBlock(card, dataName) {
  const e = card?.emitter || {};
  const t = String(e.type || "point");
  const off = e.offset || { x: 0, y: 0, z: 0 };
  const ox = Number(off.x) || 0;
  const oy = Number(off.y) || 0;
  const oz = Number(off.z) || 0;

  const lines = [];
  lines.push(`val locs = arrayListOf<RelativeLocation>()`);
  lines.push(`repeat(${dataName}.getRandomCount()) { i ->`);

  // Helpers are assumed to exist in outer scope of emitter lambda:
  // - randD(min,max)
  // - randI(min,max)
  // - lerp(a,b,t)
  // - rotateToAxis(x,y,z, ax,ay,az) => RelativeLocation

  if (t === "point") {
    lines.push(`  locs.add(RelativeLocation(${fmtD(ox)}, ${fmtD(oy)}, ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "box") {
    const box = e.box || {};
    const bx = Number(box.x) || 1;
    const by = Number(box.y) || 1;
    const bz = Number(box.z) || 1;
    const density = Math.min(1, Math.max(0, Number(box.density) || 0));
    const surface = !!box.surface;
    lines.push(`  val bx = ${fmtD(bx)}`);
    lines.push(`  val by = ${fmtD(by)}`);
    lines.push(`  val bz = ${fmtD(bz)}`);
    lines.push(`  val density = ${fmtD(density)}`);
    lines.push(`  val surface = ${surface ? "true" : "false"}`);
    lines.push(`  fun biased(u0: Double): Double {`);
    lines.push(`    if (density <= 0.0) return u0`);
    lines.push(`    val s = if (u0 < 0.0) -1.0 else 1.0`);
    lines.push(`    val a = abs(u0)`);
    lines.push(`    val pw = lerp(1.0, 4.0, density)`);
    lines.push(`    return s * a.pow(pw)`);
    lines.push(`  }`);
    lines.push(`  var x = biased(randD(-0.5, 0.5)) * bx`);
    lines.push(`  var y = biased(randD(-0.5, 0.5)) * by`);
    lines.push(`  var z = biased(randD(-0.5, 0.5)) * bz`);
    lines.push(`  if (surface) {`);
    lines.push(`    when (randI(0, 2)) {`);
    lines.push(`      0 -> x = (if (randD(0.0, 1.0) < 0.5) -0.5 else 0.5) * bx`);
    lines.push(`      1 -> y = (if (randD(0.0, 1.0) < 0.5) -0.5 else 0.5) * by`);
    lines.push(`      2 -> z = (if (randD(0.0, 1.0) < 0.5) -0.5 else 0.5) * bz`);
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`  locs.add(RelativeLocation(x + ${fmtD(ox)}, y + ${fmtD(oy)}, z + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "sphere") {
    const sph = e.sphere || {};
    const r = Math.max(0.001, Number(sph.r) || 1);
    lines.push(`  val r = ${fmtD(r)}`);
    lines.push(`  val u = randD(0.0, 1.0)`);
    lines.push(`  val v = randD(0.0, 1.0)`);
    lines.push(`  val theta = 2.0 * PI * u`);
    lines.push(`  val phi = acos(2.0 * v - 1.0)`);
    lines.push(`  val dx = sin(phi) * cos(theta)`);
    lines.push(`  val dy = cos(phi)`);
    lines.push(`  val dz = sin(phi) * sin(theta)`);
    lines.push(`  val rr = r * cbrt(randD(0.0, 1.0))`);
    lines.push(`  locs.add(RelativeLocation(dx * rr + ${fmtD(ox)}, dy * rr + ${fmtD(oy)}, dz * rr + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "sphere_surface") {
    const sph = e.sphereSurface || {};
    const r = Math.max(0.001, Number(sph.r) || 1);
    lines.push(`  val r = ${fmtD(r)}`);
    lines.push(`  val u = randD(0.0, 1.0)`);
    lines.push(`  val v = randD(0.0, 1.0)`);
    lines.push(`  val theta = 2.0 * PI * u`);
    lines.push(`  val phi = acos(2.0 * v - 1.0)`);
    lines.push(`  val dx = sin(phi) * cos(theta)`);
    lines.push(`  val dy = cos(phi)`);
    lines.push(`  val dz = sin(phi) * sin(theta)`);
    lines.push(`  locs.add(RelativeLocation(dx * r + ${fmtD(ox)}, dy * r + ${fmtD(oy)}, dz * r + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "line") {
    const l = e.line || {};
    const dir = l.dir || { x: 1, y: 0, z: 0 };
    const step = Math.max(0.0001, Number(l.step) || 0.25);
    lines.push(`  var dx = ${fmtD(dir.x || 1)}`);
    lines.push(`  var dy = ${fmtD(dir.y || 0)}`);
    lines.push(`  var dz = ${fmtD(dir.z || 0)}`);
    lines.push(`  val step = ${fmtD(step)}`);
    lines.push(`  val len = sqrt(dx*dx + dy*dy + dz*dz)`);
    lines.push(`  if (len < 1e-9) { dx = 1.0; dy = 0.0; dz = 0.0 } else { dx /= len; dy /= len; dz /= len }`);
    lines.push(`  val t = i.toDouble()`);
    lines.push(`  locs.add(RelativeLocation(dx * step * t + ${fmtD(ox)}, dy * step * t + ${fmtD(oy)}, dz * step * t + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "circle") {
    const c = e.circle || {};
    const r = Math.max(0.001, Number(c.r) || 1);
    const ax = c.axis || { x: 0, y: 1, z: 0 };
    lines.push(`  val r = ${fmtD(r)}`);
    lines.push(`  val a = randD(0.0, 2.0 * PI)`);
    lines.push(`  val x = cos(a) * r`);
    lines.push(`  val z = sin(a) * r`);
    lines.push(`  val rot = rotateToAxis(x, 0.0, z, ${fmtD(ax.x || 0)}, ${fmtD(ax.y ?? 1)}, ${fmtD(ax.z || 0)})`);
    lines.push(`  locs.add(RelativeLocation(rot.x + ${fmtD(ox)}, rot.y + ${fmtD(oy)}, rot.z + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "arc") {
    const a = e.arc || {};
    const r = Math.max(0.001, Number(a.r) || 1);
    const start = Number(a.start) || 0;
    const end = Number(a.end) || 0;
    const rotate = Number(a.rotate) || 0;
    const ax = a.axis || { x: 0, y: 1, z: 0 };
    // normalize for generation
    const s0 = Math.min(start, end);
    const s1 = Math.max(start, end);
    lines.push(`  val r = ${fmtD(r)}`);
    lines.push(`  val a0 = ${fmtD(s0)} * PI / 180.0`);
    lines.push(`  val a1 = ${fmtD(s1)} * PI / 180.0`);
    lines.push(`  val rotDeg = ${fmtD(rotate)} * PI / 180.0`);
    lines.push(`  val ang = randD(a0, a1) + rotDeg`);
    lines.push(`  val x = cos(ang) * r`);
    lines.push(`  val z = sin(ang) * r`);
    lines.push(`  val rot = rotateToAxis(x, 0.0, z, ${fmtD(ax.x || 0)}, ${fmtD(ax.y ?? 1)}, ${fmtD(ax.z || 0)})`);
    lines.push(`  locs.add(RelativeLocation(rot.x + ${fmtD(ox)}, rot.y + ${fmtD(oy)}, rot.z + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "spiral") {
    const s = e.spiral || {};
    const startR = Math.max(0.001, Number(s.startR) || 0.6);
    const endR = Math.max(0.001, Number(s.endR) || 2.8);
    const height = Number(s.height) || 3;
    const rotateSpeed = Number(s.rotateSpeed) || 0.6;
    const rBias = Math.max(0.01, Number(s.rBias) || 1);
    const hBias = Math.max(0.01, Number(s.hBias) || 1);
    const ax = s.axis || { x: 0, y: 1, z: 0 };
    lines.push(`  val startR = ${fmtD(startR)}`);
    lines.push(`  val endR = ${fmtD(endR)}`);
    lines.push(`  val height = ${fmtD(height)}`);
    lines.push(`  val rotateSpeed = ${fmtD(rotateSpeed)}`);
    lines.push(`  val rBias = ${fmtD(rBias)}`);
    lines.push(`  val hBias = ${fmtD(hBias)}`);
    lines.push(`  val count = max(2, ${dataName}.getRandomCount())`);
    lines.push(`  val idx = i % count`);
    lines.push(`  val process = idx.toDouble() / max(1, count - 1).toDouble()`);
    lines.push(`  val rb = process.pow(rBias)`);
    lines.push(`  val hb = process.pow(hBias)`);
    lines.push(`  val rr = lerp(startR, endR, rb)`);
    lines.push(`  val ang = rotateSpeed * idx.toDouble()`);
    lines.push(`  val x = cos(ang) * rr`);
    lines.push(`  val y = hb * height`);
    lines.push(`  val z = sin(ang) * rr`);
    lines.push(`  val rot = rotateToAxis(x, y, z, ${fmtD(ax.x || 0)}, ${fmtD(ax.y ?? 1)}, ${fmtD(ax.z || 0)})`);
    lines.push(`  locs.add(RelativeLocation(rot.x + ${fmtD(ox)}, rot.y + ${fmtD(oy)}, rot.z + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "ring") {
    const r0 = e.ring || {};
    const rr = Math.max(0.001, Number(r0.r) || 1);
    const th = Math.max(0, Number(r0.thickness) || 0);
    const ax = r0.axis || { x: 0, y: 1, z: 0 };
    lines.push(`  val r = ${fmtD(rr)}`);
    lines.push(`  val th = ${fmtD(th)}`);
    lines.push(`  val a = randD(0.0, 2.0 * PI)`);
    lines.push(`  val rr2 = r + (randD(-0.5, 0.5) * th)`);
    lines.push(`  val x = cos(a) * rr2`);
    lines.push(`  val z = sin(a) * rr2`);
    lines.push(`  val rot = rotateToAxis(x, 0.0, z, ${fmtD(ax.x || 0)}, ${fmtD(ax.y ?? 1)}, ${fmtD(ax.z || 0)})`);
    lines.push(`  locs.add(RelativeLocation(rot.x + ${fmtD(ox)}, rot.y + ${fmtD(oy)}, rot.z + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  // fallback
  lines.push(`  locs.add(RelativeLocation(${fmtD(ox)}, ${fmtD(oy)}, ${fmtD(oz)}))`);
  lines.push(`}`);
  return lines;
}

export function genCommandKotlin(state) {
  const cmds = (state?.commands || []).filter((c) => !!c);
  const varName = safeIdent(state?.kotlin?.varName, "command");

  const uniqSigns = (arr) => {
    if (!Array.isArray(arr)) return [];
    const out = [];
    const seen = new Set();
    for (const it of arr) {
      const n = Number(it);
      if (!Number.isFinite(n)) continue;
      const v = Math.trunc(n);
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  };

  const signPredicate = (signs) => {
    const s = uniqSigns(signs);
    if (!s.length) return "";
    if (s.length === 1) return `data.sign == ${fmtI(s[0])}`;
    return `data.sign in setOf(${s.map((x) => fmtI(x)).join(", ")})`;
  };

  const lines = [];
  lines.push(`val ${varName} = ParticleCommandQueue()`);
  for (const c of cmds) {
    const meta = COMMAND_META[c.type];
    if (!meta || typeof meta.toKotlin !== "function") continue;
    const kotlin = meta.toKotlin(c);
    const pred = signPredicate(c.signs);
    let block = `.add(\n${indent(kotlin, 4)}\n)`;
    if (pred) {
      block += ` { data, particle ->\n${indent(pred, 4)}\n}`;
    }
    lines.push(indent(block, 4));
  }
  return lines.join("\n");
}

export function genEmitterKotlin(state, settings = {}) {
  const rawEmitters = Array.isArray(state?.emitters) ? state.emitters : [];
  const emitters = rawEmitters.filter(c => c && c.enabled !== false);

  if (!emitters.length) return "";

  // Kotlin 变量命名：
  // - 每个发射器卡片可在 vars.template / vars.data 指定
  // - 留空则自动命名为 templateN / dataN（N=卡片序号）
  // - externalTemplate/externalData 会输出到类作用域；即使导入了冲突数据，这里也会兜底去重
  const varCache = new Map();

  function baseVar(card, index, kind) {
    const raw = String(card?.vars?.[kind] ?? "").trim();
    const fallback = (kind === "template") ? `template${index + 1}` : `data${index + 1}`;
    return safeIdent(raw || fallback, fallback);
  }

  const extUsed = new Set();
  const extResolved = new Map(); // id -> { template, data }

  function uniqueExt(name) {
    let n = String(name || "").trim() || "v";
    let i = 2;
    while (extUsed.has(n)) {
      n = `${name}_${i}`;
      i += 1;
    }
    extUsed.add(n);
    return n;
  }

  for (let i = 0; i < emitters.length; i++) {
    const card = emitters[i];
    const id = String(card?.id ?? i);
    const t0 = baseVar(card, i, "template");
    const d0 = baseVar(card, i, "data");
    const r = { template: t0, data: d0 };
    if (card?.externalTemplate) r.template = uniqueExt(t0);
    if (card?.externalData) r.data = uniqueExt(d0);
    extResolved.set(id, r);
  }

  function cardVar(card, index, kind) {
    const id = String(card?.id ?? index);
    const cacheKey = `${id}_${kind}`;
    if (varCache.has(cacheKey)) return varCache.get(cacheKey);

    let name = baseVar(card, index, kind);
    const r = extResolved.get(id);
    if (r) {
      if (kind === "template" && card?.externalTemplate) name = r.template;
      if (kind === "data" && card?.externalData) name = r.data;
    }
    varCache.set(cacheKey, name);
    return name;
  }

  const tps = Math.max(1, Math.trunc(Number(state?.ticksPerSecond) || 20));

  const modeOf = (c) => String(c?.emission?.mode || "continuous");
  const hasPersistent = emitters.some(c => modeOf(c) !== "once");
  const allOnce = emitters.every(c => modeOf(c) === "once");
  const anyBurst = emitters.some(c => modeOf(c) === "burst");

  const fmtRel = (x, y, z) => `RelativeLocation(${fmtD(x)}, ${fmtD(y)}, ${fmtD(z)})`;

  const hexToRgb01 = (hex) => {
    const h = fmtHex(hex);
    const r = parseInt(h.slice(1, 3), 16) / 255;
    const g = parseInt(h.slice(3, 5), 16) / 255;
    const b = parseInt(h.slice(5, 7), 16) / 255;
    return { r, g, b };
  };

  const isNonZeroVec = (v) => {
    const x = Number(v?.x) || 0;
    const y = Number(v?.y) || 0;
    const z = Number(v?.z) || 0;
    return (x * x + y * y + z * z) > 1e-12;
  };
function buildBaseTemplateAssignLines(card) {
  const p = card?.particle || {};
  const t = card?.template || {};
  const v = p.vel || {};
  const vx = Number(v.x) || 0;
  const vy = Number(v.y) || 0;
  const vz = Number(v.z) || 0;

  const lines = [];
  // 基础模板参数（外放模板参数时不写，交给外部配置）
  lines.push(`velocity = ${kVec3(vx, vy, vz)}`);
  lines.push(`visibleRange = ${fmtF(p.visibleRange ?? 128)}`);
  const { r, g, b } = hexToRgb01(p.colorStart);
  lines.push(`color = Vector3f(${fmtF(r)}, ${fmtF(g)}, ${fmtF(b)})`);

  // 高级模板参数
  lines.push(`alpha = ${fmtF(t.alpha ?? 1.0)}`);
  lines.push(`light = ${fmtI(t.light ?? 15)}`);
  const face = (t.faceToCamera !== false);
  lines.push(`faceToCamera = ${face ? "true" : "false"}`);
  if (!face) {
    lines.push(`yaw = ${fmtF(t.yaw ?? 0.0)}`);
    lines.push(`pitch = ${fmtF(t.pitch ?? 0.0)}`);
    lines.push(`roll = ${fmtF(t.roll ?? 0.0)}`);
  }
  lines.push(`speedLimit = ${fmtD(t.speedLimit ?? 32.0)}`);
  lines.push(`sign = ${fmtI(t.sign ?? 0)}`);
  return lines;
}

function buildLocalDataApplyLines(card) {
  const p = card?.particle || {};
  const lines = [];
  // SimpleRandomParticleData.kt API 映射（与你提供的源码一致）
  lines.push(`minAge = ${fmtI(p.lifeMin)}`);
  lines.push(`maxAge = ${fmtI(p.lifeMax)}`);
  lines.push(`minCount = ${fmtI(p.countMin)}`);
  lines.push(`maxCount = ${fmtI(p.countMax)}`);
  lines.push(`minSize = ${fmtD(p.sizeMin)}`);
  lines.push(`maxSize = ${fmtD(p.sizeMax)}`);
  lines.push(`minSpeed = ${fmtD(p.velSpeedMin ?? 0)}`);
  lines.push(`maxSpeed = ${fmtD(p.velSpeedMax ?? 0)}`);
  return lines;
}

  function pushPBChain(lines, baseIndent, card, dataVar) {
    const e = card?.emitter || {};
    const type = String(e.type || "point");

    const off = e.offset || { x: 0, y: 0, z: 0 };
    const ox = Number(off.x) || 0;
    const oy = Number(off.y) || 0;
    const oz = Number(off.z) || 0;
    const hasOffset = (ox * ox + oy * oy + oz * oz) > 1e-12;
    const offsetStr = fmtRel(ox, oy, oz);

    const countExpr = `${dataVar}.getRandomCount()`;

    const pad = (n) => " ".repeat(n);

    lines.push(pad(baseIndent) + "PointsBuilder()");

    const chainIndent = baseIndent + 4;

    const addChainLine = (s) => lines.push(pad(chainIndent) + s);

    if (type === "point") {
      addChainLine(".addWith {");
      lines.push(pad(chainIndent + 4) + `val locs = arrayListOf<RelativeLocation>()`);
      lines.push(pad(chainIndent + 4) + `val count = ${countExpr}`);
      lines.push(pad(chainIndent + 4) + `repeat(count) {`);
      lines.push(pad(chainIndent + 8) + `locs.add(${fmtRel(ox, oy, oz)})`);
      lines.push(pad(chainIndent + 4) + `}`);
      lines.push(pad(chainIndent + 4) + `locs`);
      lines.push(pad(chainIndent) + `}`);
      // point 已经把 offset 直接编码进点里，不再 pointsOnEach
    } else if (type === "line") {
      const l = e.line || {};
      const d = l.dir || { x: 0, y: 1, z: 0 };
      const dx = Number(d.x) || 0;
      const dy = Number(d.y) || 1;
      const dz = Number(d.z) || 0;
      const step = Number(l.step) || 0.2;
      addChainLine(`.addLine(${fmtRel(dx, dy, dz)}, ${fmtD(step)}, ${countExpr})`);
      if (hasOffset) addChainLine(`.pointsOnEach { it.add(${offsetStr}) }`);
    } else if (type === "circle") {
      const c = e.circle || {};
      const r = Math.max(0.001, Number(c.r) || 1);
      addChainLine(`.addCircle(${fmtD(r)}, ${countExpr})`);

      const axis = c.axis || { x: 0, y: 1, z: 0 };
      if (isNonZeroVec(axis)) {
        addChainLine(`.rotateTo(${fmtRel(axis.x, axis.y, axis.z)})`);
      }
      if (hasOffset) addChainLine(`.pointsOnEach { it.add(${offsetStr}) }`);
    } else if (type === "ring") {
      const r0 = e.ring || {};
      const r = Math.max(0.001, Number(r0.r) || 1);
      const th = Math.max(0, Number(r0.thickness) || 0);
      addChainLine(`.addDiscreteCircleXZ(${fmtD(r)}, ${countExpr}, ${fmtD(th)})`);

      const axis = r0.axis || { x: 0, y: 1, z: 0 };
      if (isNonZeroVec(axis)) {
        addChainLine(`.rotateTo(${fmtRel(axis.x, axis.y, axis.z)})`);
      }
      if (hasOffset) addChainLine(`.pointsOnEach { it.add(${offsetStr}) }`);
    } else if (type === "arc") {
      const a = e.arc || {};
      const r = Math.max(0.001, Number(a.r) || 1);
      const s0 = Number(a.start) || 0;
      const s1 = Number(a.end) || 180;
      const start = Math.min(s0, s1);
      const end = Math.max(s0, s1);
      const rotate = Number(a.rotate) || 0;
      const unit = String(a.unit || "deg");
      const toRad = (v) => (unit === "rad") ? fmtD(v) : `${fmtD(v)} * Math.PI / 180.0`;

      if (a.center) {
        const extent = Math.abs(end - start);
        const mid = (start + end) / 2.0;
        addChainLine(
          `.addRadianCenter(${fmtD(r)}, ${countExpr}, ${toRad(extent)}, ${toRad(mid + rotate)})`
        );
      } else {
        addChainLine(
          `.addRadian(${fmtD(r)}, ${countExpr}, ${toRad(start)}, ${toRad(end)}, ${toRad(rotate)})`
        );
      }

      const axis = a.axis || { x: 0, y: 1, z: 0 };
      if (isNonZeroVec(axis)) {
        addChainLine(`.rotateTo(${fmtRel(axis.x, axis.y, axis.z)})`);
      }
      if (hasOffset) addChainLine(`.pointsOnEach { it.add(${offsetStr}) }`);
    } else if (type === "spiral") {
      const sp = e.spiral || {};
      const startR = Math.max(0.001, Number(sp.startR) || 0.5);
      const endR = Math.max(0.001, Number(sp.endR) || 1.5);
      const height = Number(sp.height) || 2.0;
      const rotateSpeed = Number(sp.rotateSpeed) || 0.4;
      const radiusBias = Math.max(0.01, Number(sp.radiusBias) || 1.0);
      const heightBias = Math.max(0.01, Number(sp.heightBias) || 1.0);

      addChainLine(
        `.addSpiral(${fmtD(startR)}, ${fmtD(endR)}, ${fmtD(height)}, (${countExpr}).coerceAtLeast(2), ${fmtD(rotateSpeed)}, ${fmtD(radiusBias)}, ${fmtD(heightBias)})`
      );

      const axis = sp.axis || { x: 0, y: 1, z: 0 };
      if (isNonZeroVec(axis)) {
        addChainLine(`.rotateTo(${fmtRel(axis.x, axis.y, axis.z)})`);
      }
      if (hasOffset) addChainLine(`.pointsOnEach { it.add(${offsetStr}) }`);
    } else if (type === "sphere" || type === "sphere_surface") {
      const sph = e.sphere || {};
      const r = Math.max(0.001, Number(sph.r) || 1);

      addChainLine(".addWith {");
      lines.push(pad(chainIndent + 4) + `val rand = kotlin.random.Random.Default`);
      lines.push(pad(chainIndent + 4) + `val locs = arrayListOf<RelativeLocation>()`);
      lines.push(pad(chainIndent + 4) + `val count = ${countExpr}`);
      lines.push(pad(chainIndent + 4) + `repeat(count) {`);
      lines.push(pad(chainIndent + 8) + `val u = rand.nextDouble()`);
      lines.push(pad(chainIndent + 8) + `val v = rand.nextDouble()`);
      lines.push(pad(chainIndent + 8) + `val theta = 2.0 * Math.PI * u`);
      lines.push(pad(chainIndent + 8) + `val phi = Math.acos(2.0 * v - 1.0)`);
      lines.push(pad(chainIndent + 8) + `val dx = Math.sin(phi) * Math.cos(theta)`);
      lines.push(pad(chainIndent + 8) + `val dy = Math.cos(phi)`);
      lines.push(pad(chainIndent + 8) + `val dz = Math.sin(phi) * Math.sin(theta)`);
      if (type === "sphere") {
        lines.push(pad(chainIndent + 8) + `val rr = ${fmtD(r)} * Math.cbrt(rand.nextDouble())`);
      } else {
        lines.push(pad(chainIndent + 8) + `val rr = ${fmtD(r)}`);
      }
      lines.push(pad(chainIndent + 8) + `locs.add(RelativeLocation(dx * rr + ${fmtD(ox)}, dy * rr + ${fmtD(oy)}, dz * rr + ${fmtD(oz)}))`);
      lines.push(pad(chainIndent + 4) + `}`);
      lines.push(pad(chainIndent + 4) + `locs`);
      lines.push(pad(chainIndent) + `}`);
      // sphere 已经编码 offset，不再 pointsOnEach
    } else if (type === "box") {
      const b = e.box || {};
      const bx = Number(b.x) || 2;
      const by = Number(b.y) || 1;
      const bz = Number(b.z) || 2;
      const density = Math.max(0, Math.min(1, Number(b.density) || 0));
      const surface = !!b.surface;

      addChainLine(".addWith {");
      lines.push(pad(chainIndent + 4) + `val rand = kotlin.random.Random.Default`);
      lines.push(pad(chainIndent + 4) + `val locs = arrayListOf<RelativeLocation>()`);
      lines.push(pad(chainIndent + 4) + `val count = ${countExpr}`);
      lines.push(pad(chainIndent + 4) + `val density = ${fmtD(density)}`);
      lines.push(pad(chainIndent + 4) + `val surface = ${surface ? "true" : "false"}`);
      lines.push(pad(chainIndent + 4) + `val pw = 1.0 + 3.0 * density`);
      lines.push(pad(chainIndent + 4) + `repeat(count) {`);
      lines.push(pad(chainIndent + 8) + `val u0x = rand.nextDouble() - 0.5`);
      lines.push(pad(chainIndent + 8) + `var x = (if (u0x < 0.0) -1.0 else 1.0) * Math.pow(Math.abs(u0x), pw) * ${fmtD(bx)}`);
      lines.push(pad(chainIndent + 8) + `val u0y = rand.nextDouble() - 0.5`);
      lines.push(pad(chainIndent + 8) + `var y = (if (u0y < 0.0) -1.0 else 1.0) * Math.pow(Math.abs(u0y), pw) * ${fmtD(by)}`);
      lines.push(pad(chainIndent + 8) + `val u0z = rand.nextDouble() - 0.5`);
      lines.push(pad(chainIndent + 8) + `var z = (if (u0z < 0.0) -1.0 else 1.0) * Math.pow(Math.abs(u0z), pw) * ${fmtD(bz)}`);
      lines.push(pad(chainIndent + 8) + `if (surface) {`);
      lines.push(pad(chainIndent + 12) + `when (rand.nextInt(3)) {`);
      lines.push(pad(chainIndent + 16) + `0 -> x = (if (rand.nextDouble() < 0.5) -0.5 else 0.5) * ${fmtD(bx)}`);
      lines.push(pad(chainIndent + 16) + `1 -> y = (if (rand.nextDouble() < 0.5) -0.5 else 0.5) * ${fmtD(by)}`);
      lines.push(pad(chainIndent + 16) + `2 -> z = (if (rand.nextDouble() < 0.5) -0.5 else 0.5) * ${fmtD(bz)}`);
      lines.push(pad(chainIndent + 12) + `}`);
      lines.push(pad(chainIndent + 8) + `}`);
      lines.push(pad(chainIndent + 8) + `locs.add(RelativeLocation(x + ${fmtD(ox)}, y + ${fmtD(oy)}, z + ${fmtD(oz)}))`);
      lines.push(pad(chainIndent + 4) + `}`);
      lines.push(pad(chainIndent + 4) + `locs`);
      lines.push(pad(chainIndent) + `}`);
    } else {
      // fallback
      addChainLine(`.addPoint(${fmtRel(ox, oy, oz)})`);
    }
  }

  const out = [];
  const push = (s = "") => out.push(s);

  // 外置 var 参数（启用外放时输出；参数默认值通过 .apply 写入）
  emitters.forEach((card, i) => {
    const tVar = cardVar(card, i, "template");
    const dVar = cardVar(card, i, "data");

    if (card.externalTemplate) {
      push("@CodecField");
      push(`var ${tVar} = ControlableParticleData().apply {`);
      buildBaseTemplateAssignLines(card).forEach((line) => push(`    ${line}`));
      push("}");
      push("");
    }
    if (card.externalData) {
      push("@CodecField");
      push(`var ${dVar} = SimpleRandomParticleData().apply {`);
      buildLocalDataApplyLines(card).forEach((line) => push(`    ${line}`));
      push("}");
      push("");
    }
  });

  // 只有一次性发射的情况下才设置 maxTick = 1
  if (allOnce) {
    push("init {");
    push("    maxTick = 1");
    push("}");
    push("");
  }

  push("override fun genParticles(lerpProgress: Float): List<Pair<ControlableParticleData, RelativeLocation>> {");
  push("    val res = mutableListOf<Pair<ControlableParticleData, RelativeLocation>>()");
  push("");

  if (anyBurst) {
    push("    val tickSec = 0.05");
    push("");
  }

  emitters.forEach((card, i) => {
    const n = i + 1;
    const label = String(card.label || `Emitter ${n}`);
    const mode = modeOf(card);

    const tVar = cardVar(card, i, "template");
    const dVar = cardVar(card, i, "data");

    push(`    // 发射器 ${n}：${label}`);

    // wrapper
    let openLines = [];
    let closeLines = [];
    let innerIndent = 4;

    if (mode === "once" && hasPersistent) {
      openLines.push(`    if (tick == 1) {`);
      closeLines.push(`    }`);
      innerIndent = 8;
    } else if (mode === "burst") {
      const interval = Math.max(0.05, Number(card?.emission?.burstInterval) || 0.5);
      const intervalVar = `intervalTicks${n}`;
      openLines.push(`    val ${intervalVar} = Math.round(${fmtD(interval)} / tickSec).toInt().coerceAtLeast(1)`);
      openLines.push(`    if ((tick - 1) % ${intervalVar} == 0) {`);
      closeLines.push(`    }`);
      innerIndent = 8;
    }

    openLines.forEach(l => push(l));

    const pad = " ".repeat(innerIndent);
    const pad2 = " ".repeat(innerIndent + 4);

    // 每个卡片用 run { } 做作用域隔离，避免局部变量名互相冲突
    push(`${pad}run {`);

    // local data
    if (!card.externalData) {
      push(`${pad2}val ${dVar} = SimpleRandomParticleData().apply {`);
      buildLocalDataApplyLines(card).forEach(line => push(`${pad2}    ${line}`));
      push(`${pad2}}`);
      push("");
    }

    // local template
    if (!card.externalTemplate) {
      push(`${pad2}val ${tVar} = ControlableParticleData().apply {`);
      buildBaseTemplateAssignLines(card).forEach(line => push(`${pad2}    ${line}`));
      push(`${pad2}}`);
      push("");
    }

    // res.addAll block
    push(`${pad2}res.addAll(`);

    const pbLines = [];
    // build PointsBuilder chain without indentation; we'll indent here
    pushPBChain(pbLines, innerIndent + 8, card, dVar);

    // append createWithoutClone + map
    const chainIndent = innerIndent + 12;
    const mapIndent = innerIndent + 12;
    pbLines.push(" ".repeat(chainIndent) + ".createWithoutClone()");
    pbLines.push(" ".repeat(mapIndent) + ".map {");
    pbLines.push(" ".repeat(mapIndent + 4) + `${tVar}.clone().apply {`);
    pbLines.push(" ".repeat(mapIndent + 8) + `maxAge = ${dVar}.getRandomParticleMaxAge()`);
    pbLines.push(" ".repeat(mapIndent + 8) + `size = ${dVar}.getRandomSize().toFloat()`);
    pbLines.push(" ".repeat(mapIndent + 8) + `speed = ${dVar}.getRandomSpeed()`);
    pbLines.push(" ".repeat(mapIndent + 4) + `} to it`);
    pbLines.push(" ".repeat(mapIndent) + `}`);

    pbLines.forEach(l => push(l));

    push(`${pad2})`);
    push("");

    push(`${pad}}`);
    push("");

    closeLines.forEach(l => push(l));
    if (closeLines.length) push("");
  });

  push("    return res");
  push("}");

  return out.join("\n");
}
