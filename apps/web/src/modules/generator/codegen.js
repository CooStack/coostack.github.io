import { curveToKotlin } from './curves.js';
import { TEXTURE_SHEET_OPTIONS, normalizeGeneratorProject } from './defaults.js';

function safeIdent(raw, fallback = 'GeneratedEmitter') {
  const text = String(raw || '').trim().replace(/[^A-Za-z0-9_]/g, '_');
  if (!text) return fallback;
  return /^[A-Za-z_]/.test(text) ? text : `_${text}`;
}

function safePackage(raw) {
  const text = String(raw || '').trim().replace(/^package\s+/i, '').replace(/;+$/g, '');
  if (!text) return '';
  return text.split('.').map((part) => safeIdent(part, '')).filter(Boolean).join('.');
}

function fmtD(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number(fallback).toFixed(1);
  if (Math.trunc(numeric) === numeric) return `${numeric.toFixed(1)}`;
  return Number(numeric.toFixed(6)).toString();
}

function fmtF(value, fallback = 0) {
  return `${fmtD(value, fallback)}f`;
}

function fmtI(value, fallback = 0) {
  const numeric = Number(value);
  return String(Math.trunc(Number.isFinite(numeric) ? numeric : fallback));
}

function fmtBool(value) {
  return value === true ? 'true' : 'false';
}

function fmtString(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function indent(text, spaces = 4) {
  const pad = ' '.repeat(spaces);
  return String(text || '').split('\n').map((line) => `${pad}${line}`).join('\n');
}

function vec3(value = {}) {
  return `Vec3(${fmtD(value.x)}, ${fmtD(value.y)}, ${fmtD(value.z)})`;
}

function vec3Params(params = {}, prefix = '') {
  return `Vec3(${fmtD(params[`${prefix}X`])}, ${fmtD(params[`${prefix}Y`])}, ${fmtD(params[`${prefix}Z`])})`;
}

function supplierVec3(params = {}, prefix = '') {
  return `java.util.function.Supplier { ${vec3Params(params, prefix)} }`;
}

function rel(value = {}) {
  return `RelativeLocation(${fmtD(value.x)}, ${fmtD(value.y)}, ${fmtD(value.z)})`;
}

function cameraOptionConstant(mode) {
  if (mode === 'axis_billboard') return 'ParticleCameraOption.AXIS_BILLBOARD';
  if (mode === 'none') return 'ParticleCameraOption.ROTATION';
  return 'ParticleCameraOption.BILLBOARD';
}

const textureSheetIds = new Set(TEXTURE_SHEET_OPTIONS.map((item) => item.id));

function textureSheetStatement(sheet) {
  const value = String(sheet || 'PARTICLE_SHEET_TRANSLUCENT').trim();
  if (textureSheetIds.has(value)) {
    return `setTextureSheet(TextureSheetsEnum.${value})`;
  }
  return `setTextureSheet(${fmtString(value)})`;
}

function scaleCurveValues(rawCurve, scale) {
  const curve = JSON.parse(JSON.stringify(rawCurve || {}));
  if (Number.isFinite(Number(curve.defaultValue))) curve.defaultValue = Number(curve.defaultValue) * scale;
  if (Number.isFinite(Number(curve.min))) curve.min = Number(curve.min) * scale;
  if (Number.isFinite(Number(curve.max))) curve.max = Number(curve.max) * scale;
  if (Array.isArray(curve.keyframes)) {
    curve.keyframes.forEach((frame) => {
      if (Number.isFinite(Number(frame.value))) frame.value = Number(frame.value) * scale;
      if (frame.in && Number.isFinite(Number(frame.in.y))) frame.in.y = Number(frame.in.y) * scale;
      if (frame.out && Number.isFinite(Number(frame.out.y))) frame.out.y = Number(frame.out.y) * scale;
    });
  }
  return curve;
}

function degToRad(value) {
  return `(${fmtD(value)} * PI / 180.0).toFloat()`;
}

function curveDegToRad(base, curveName) {
  return `((${fmtD(base)} + ${curveName}.sample(lifeProgress)) * PI / 180.0).toFloat()`;
}

function constantCurve(value, fallback = 0) {
  return `ConstantFloatCurve(${fmtD(value, fallback)})`;
}

function vector3fFromHex(hex) {
  const raw = /^#[0-9a-fA-F]{6}$/.test(String(hex || '')) ? String(hex).slice(1) : 'ffffff';
  const intValue = Number.parseInt(raw, 16);
  return {
    x: ((intValue >> 16) & 255) / 255,
    y: ((intValue >> 8) & 255) / 255,
    z: (intValue & 255) / 255
  };
}

function emitEmitterPointBuilder(card, dataVar) {
  const type = card.emitter.type;
  const offset = card.emitter.offset;
  const lines = [];
  lines.push('PointsBuilder()');
  if (type === 'point') {
    lines.push(`    .addWith { List(${dataVar}.getRandomCount()) { ${rel(offset)} } }`);
    return lines.join('\n');
  }
  if (type === 'box') {
    const box = card.emitter.box;
    lines.push('    .addWith {');
    lines.push('        val rand = Random.Default');
    lines.push('        val locs = arrayListOf<RelativeLocation>()');
    lines.push(`        repeat(${dataVar}.getRandomCount()) {`);
    lines.push(`            var x = (rand.nextDouble() - 0.5) * ${fmtD(box.x)}`);
    lines.push(`            var y = (rand.nextDouble() - 0.5) * ${fmtD(box.y)}`);
    lines.push(`            var z = (rand.nextDouble() - 0.5) * ${fmtD(box.z)}`);
    if (box.surface) {
      lines.push('            when (rand.nextInt(3)) {');
      lines.push(`                0 -> x = (if (rand.nextBoolean()) -0.5 else 0.5) * ${fmtD(box.x)}`);
      lines.push(`                1 -> y = (if (rand.nextBoolean()) -0.5 else 0.5) * ${fmtD(box.y)}`);
      lines.push(`                else -> z = (if (rand.nextBoolean()) -0.5 else 0.5) * ${fmtD(box.z)}`);
      lines.push('            }');
    }
    lines.push(`            locs.add(RelativeLocation(x + ${fmtD(offset.x)}, y + ${fmtD(offset.y)}, z + ${fmtD(offset.z)}))`);
    lines.push('        }');
    lines.push('        locs');
    lines.push('    }');
    return lines.join('\n');
  }
  if (type === 'sphere' || type === 'sphere_surface') {
    const radius = type === 'sphere' ? card.emitter.sphere.r : card.emitter.sphereSurface.r;
    lines.push('    .addWith {');
    lines.push('        val rand = Random.Default');
    lines.push('        val locs = arrayListOf<RelativeLocation>()');
    lines.push(`        repeat(${dataVar}.getRandomCount()) {`);
    lines.push('            val u = rand.nextDouble()');
    lines.push('            val v = rand.nextDouble()');
    lines.push('            val theta = 2.0 * PI * u');
    lines.push('            val phi = acos(2.0 * v - 1.0)');
    lines.push('            val dx = sin(phi) * cos(theta)');
    lines.push('            val dy = cos(phi)');
    lines.push('            val dz = sin(phi) * sin(theta)');
    lines.push(type === 'sphere'
      ? `            val rr = ${fmtD(radius)} * cbrt(rand.nextDouble())`
      : `            val rr = ${fmtD(radius)}`);
    lines.push(`            locs.add(RelativeLocation(dx * rr + ${fmtD(offset.x)}, dy * rr + ${fmtD(offset.y)}, dz * rr + ${fmtD(offset.z)}))`);
    lines.push('        }');
    lines.push('        locs');
    lines.push('    }');
    return lines.join('\n');
  }
  if (type === 'line') {
    lines.push(`    .addLine(${rel(card.emitter.line.dir)}, ${fmtD(card.emitter.line.step)}, ${dataVar}.getRandomCount())`);
    lines.push(`    .pointsOnEach { it.add(${rel(offset)}) }`);
    return lines.join('\n');
  }
  if (type === 'circle') {
    lines.push(`    .addCircle(${fmtD(card.emitter.circle.r)}, ${dataVar}.getRandomCount())`);
    lines.push(`    .rotateTo(${rel(card.emitter.circle.axis)})`);
    lines.push(`    .pointsOnEach { it.add(${rel(offset)}) }`);
    return lines.join('\n');
  }
  if (type === 'ring') {
    lines.push(`    .addDiscreteCircleXZ(${fmtD(card.emitter.ring.r)}, ${dataVar}.getRandomCount(), ${fmtD(card.emitter.ring.thickness)})`);
    lines.push(`    .rotateTo(${rel(card.emitter.ring.axis)})`);
    lines.push(`    .pointsOnEach { it.add(${rel(offset)}) }`);
    return lines.join('\n');
  }
  if (type === 'arc') {
    const arc = card.emitter.arc;
    lines.push(`    .addRadian(${fmtD(arc.r)}, ${dataVar}.getRandomCount(), ${fmtD(arc.start)} * PI / 180.0, ${fmtD(arc.end)} * PI / 180.0, ${fmtD(arc.rotate)} * PI / 180.0)`);
    lines.push(`    .rotateTo(${rel(arc.axis)})`);
    lines.push(`    .pointsOnEach { it.add(${rel(offset)}) }`);
    return lines.join('\n');
  }
  if (type === 'spiral') {
    const spiral = card.emitter.spiral;
    lines.push(`    .addSpiral(${fmtD(spiral.startR)}, ${fmtD(spiral.endR)}, ${fmtD(spiral.height)}, ${dataVar}.getRandomCount().coerceAtLeast(2), ${fmtD(spiral.rotateSpeed)}, ${fmtD(spiral.rBias)}, ${fmtD(spiral.hBias)})`);
    lines.push(`    .rotateTo(${rel(spiral.axis)})`);
    lines.push(`    .pointsOnEach { it.add(${rel(offset)}) }`);
    return lines.join('\n');
  }
  lines.push(`    .addWith { List(${dataVar}.getRandomCount()) { ${rel(offset)} } }`);
  return lines.join('\n');
}

function emitCurveDeclarations(card, index) {
  const n = index + 1;
  const lines = [];
  const prefix = `emitter${n}`;
  lines.push(`private val ${prefix}SizeX = ${curveToKotlin(card.curves.size.x, 1)}`);
  if (!card.curves.size.syncAxes && usesIndependentScale(card)) {
    lines.push(`private val ${prefix}SizeY = ${curveToKotlin(card.curves.size.y, 1)}`);
  }
  if (!card.curves.size.syncAxes && usesDepthScale(card)) {
    lines.push(`private val ${prefix}SizeZ = ${curveToKotlin(card.curves.size.z, 1)}`);
  }
  lines.push(`private val ${prefix}Brightness = ${curveToKotlin(card.curves.brightness, 15)}`);
  lines.push(`private val ${prefix}Opacity = ${curveToKotlin(scaleCurveValues(card.curves.opacity, 0.01), 1)}`);
  lines.push(`private val ${prefix}Roll = ${curveToKotlin(card.curves.rotation.roll, 0)}`);
  if (card.render.billboardMode === 'none' && !card.curves.rotation.syncAxes) {
    lines.push(`private val ${prefix}Yaw = ${curveToKotlin(card.curves.rotation.yaw, 0)}`);
    lines.push(`private val ${prefix}Pitch = ${curveToKotlin(card.curves.rotation.pitch, 0)}`);
  }
  return lines.join('\n');
}

function emitCommandQueueDeclarations(project) {
  const queues = project.commandQueues
    .map((queue, index) => ({ queue, index }))
    .filter(({ queue }) => Array.isArray(queue.commands) && queue.commands.some((command) => command.enabled !== false));
  if (!queues.length) return '';
  const lines = [];
  queues.forEach(({ queue, index }) => {
    lines.push(`private val commandQueue${index + 1} = ParticleCommandQueue()`);
    queue.commands.filter((command) => command.enabled !== false).forEach((command) => {
      lines.push(`    .add(${commandToKotlin(command)}) { _, particle -> particle.currentAge >= ${fmtI(command.tick)} }`);
    });
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

function commandToKotlin(command) {
  const params = command.params || {};
  const p = (key, fallback = 0) => params[key] ?? fallback;
  const enumValue = (key, fallback, allowed) => {
    const value = String(params[key] || fallback);
    return allowed.includes(value) ? value : fallback;
  };

  if (command.type === 'drag') {
    return `ParticleDragCommand(damping = ${fmtD(p('damping', 0.15))}, minSpeed = ${fmtD(p('minSpeed'))}, linear = ${fmtD(p('linear'))})`;
  }
  if (command.type === 'gravity') {
    return 'ParticleGravityCommand(this)';
  }
  if (command.type === 'attraction') {
    return `ParticleAttractionCommand(target = ${supplierVec3(params, 'target')}, strength = ${fmtD(p('strength', 0.8))}, range = ${fmtD(p('range', 8))}, falloffPower = ${fmtD(p('falloffPower', 2))}, minDistance = ${fmtD(p('minDistance', 0.25))})`;
  }
  if (command.type === 'orbit') {
    const mode = enumValue('mode', 'PHYSICAL', ['PHYSICAL', 'SPRING', 'SNAP']);
    return `ParticleOrbitCommand(center = ${supplierVec3(params, 'center')}, axis = ${vec3Params(params, 'axis')}, radius = ${fmtD(p('radius', 3))}, angularSpeed = ${fmtD(p('angularSpeed', 0.35))}, radialCorrect = ${fmtD(p('radialCorrect', 0.25))}, minDistance = ${fmtD(p('minDistance', 0.2))}, mode = OrbitMode.${mode}).maxRadialStep(${fmtD(p('maxRadialStep', 0.5))})`;
  }
  if (command.type === 'noise') {
    return `ParticleNoiseCommand(strength = ${fmtD(p('strength', 0.03))}, frequency = ${fmtD(p('frequency', 0.15))}, speed = ${fmtD(p('speed', 0.12))}, affectY = ${fmtD(p('affectY', 1))}, clampSpeed = ${fmtD(p('clampSpeed', 0.8))}, useLifeCurve = ${fmtBool(params.useLifeCurve !== false)})`;
  }
  if (command.type === 'flow_field') {
    return `ParticleFlowFieldCommand(amplitude = ${fmtD(p('amplitude', 0.15))}, frequency = ${fmtD(p('frequency', 0.25))}, timeScale = ${fmtD(p('timeScale', 0.06))}, phaseOffset = ${fmtD(p('phaseOffset'))}, worldOffset = ${vec3Params(params, 'worldOffset')})`;
  }
  if (command.type === 'vortex') {
    return `ParticleVortexCommand(center = ${supplierVec3(params, 'center')}, axis = ${vec3Params(params, 'axis')}, swirlStrength = ${fmtD(p('swirlStrength', 0.8))}, radialPull = ${fmtD(p('radialPull', 0.35))}, axialLift = ${fmtD(p('axialLift'))}, range = ${fmtD(p('range', 10))}, falloffPower = ${fmtD(p('falloffPower', 2))}, minDistance = ${fmtD(p('minDistance', 0.2))})`;
  }
  if (command.type === 'rotation_force') {
    return `ParticleRotationForceCommand(center = ${supplierVec3(params, 'center')}, axis = ${vec3Params(params, 'axis')}, strength = ${fmtD(p('strength', 0.35))}, range = ${fmtD(p('range', 8))}, falloffPower = ${fmtD(p('falloffPower', 2))})`;
  }
  if (command.type === 'toroidal_circulation') {
    return `ParticleToroidalCirculationCommand(center = ${supplierVec3(params, 'center')}, axis = ${vec3Params(params, 'axis')}, ringRadius = ${fmtD(p('ringRadius', 3))}, radialThickness = ${fmtD(p('radialThickness', 1.2))}, axialThickness = ${fmtD(p('axialThickness', 0.8))}, circulationStrength = ${fmtD(p('circulationStrength', 0.35))}, outwardStrength = ${fmtD(p('outwardStrength'))}, upwardStrength = ${fmtD(p('upwardStrength'))}, followStrength = ${fmtD(p('followStrength', 0.12))}, maxStep = ${fmtD(p('maxStep', 0.6))}, useLifeCurve = ${fmtBool(params.useLifeCurve === true)})`;
  }
  if (command.type === 'distortion') {
    return `ParticleDistortionCommand(center = ${supplierVec3(params, 'center')}, axis = ${vec3Params(params, 'axis')}, radius = ${fmtD(p('radius', 3))}, radialStrength = ${fmtD(p('radialStrength', 0.35))}, axialStrength = ${fmtD(p('axialStrength', 0.25))}, tangentialStrength = ${fmtD(p('tangentialStrength'))}, frequency = ${fmtD(p('frequency', 0.25))}, timeScale = ${fmtD(p('timeScale', 0.1))}, phaseOffset = ${fmtD(p('phaseOffset'))}, followStrength = ${fmtD(p('followStrength', 0.35))}, maxStep = ${fmtD(p('maxStep', 0.6))}, baseAxial = ${fmtD(p('baseAxial'))}, seedOffset = ${fmtI(p('seedOffset'))}, useLifeCurve = ${fmtBool(params.useLifeCurve === true)})`;
  }
  if (command.type === 'inherit_velocity') {
    const mode = enumValue('mode', 'INITIAL', ['INITIAL', 'CURRENT']);
    const space = enumValue('space', 'WORLD', ['WORLD', 'LOCAL']);
    const base = `ParticleInheritVelocityCommand(source = ${supplierVec3(params, 'source')}, mode = ParticleInheritMode.${mode}, multiplier = ${fmtD(p('multiplier', 1))}, axisMask = ${vec3Params(params, 'axisMask')}, overLifetime = ${constantCurve(p('overLifetime', 1), 1)}, damping = ${fmtD(p('damping'))}, maxContributionSpeed = ${fmtD(p('maxContributionSpeed'))}, space = ParticleMotionSpace.${space})`;
    return `${base}.randomizePerParticle(${fmtBool(params.randomizePerParticle === true)}).randomScale(${fmtD(p('randomScaleMin', 1))}, ${fmtD(p('randomScaleMax', 1))}).randomSeedOffset(${fmtI(p('randomSeedOffset'))})`;
  }
  if (command.type === 'lifetime_motion') {
    const forceSpace = enumValue('forceSpace', 'WORLD', ['WORLD', 'LOCAL']);
    const velocitySpace = enumValue('velocitySpace', 'WORLD', ['WORLD', 'LOCAL']);
    const velocityMode = enumValue('velocityMode', 'ADD', ['ADD', 'OVERRIDE', 'MULTIPLY']);
    const base = `ParticleLifetimeMotionCommand(forceX = ${constantCurve(p('forceX'))}, forceY = ${constantCurve(p('forceY'))}, forceZ = ${constantCurve(p('forceZ'))}, velocityX = ${constantCurve(p('velocityX'))}, velocityY = ${constantCurve(p('velocityY'))}, velocityZ = ${constantCurve(p('velocityZ'))}, forceSpace = ParticleMotionSpace.${forceSpace}, velocitySpace = ParticleMotionSpace.${velocitySpace}, velocityMode = ParticleLifetimeVelocityMode.${velocityMode})`;
    return `${base}.randomizePerParticle(${fmtBool(params.randomizePerParticle === true)}).randomScale(${fmtD(p('randomScaleMin', 1))}, ${fmtD(p('randomScaleMax', 1))}).randomSeedOffset(${fmtI(p('randomSeedOffset'))}).maxVelocityDeltaPerTick(${fmtD(p('maxVelocityDeltaPerTick'))})`;
  }
  if (command.type === 'velocity_scale') {
    return `ParticleCommand { data, _ -> data.velocity = Vec3(data.velocity.x * ${fmtD(p('scaleX', 1))}, data.velocity.y * ${fmtD(p('scaleY', 1))}, data.velocity.z * ${fmtD(p('scaleZ', 1))}) }`;
  }
  return `ParticleCommand { data, _ -> data.velocity = data.velocity.add(${fmtD(p('deltaX'))}, ${fmtD(p('deltaY'))}, ${fmtD(p('deltaZ'))}) }`;
}

function emitCommandQueueApplication(project) {
  const queues = project.commandQueues
    .map((queue, index) => ({ queue, index }))
    .filter(({ queue }) => Array.isArray(queue.commands) && queue.commands.some((command) => command.enabled !== false));
  if (!queues.length) return [];
  const lines = [];
  queues.forEach(({ queue, index }) => {
    const signs = Array.isArray(queue.signs) ? queue.signs : [];
    const condition = signs.length ? `data.sign in setOf(${signs.map((value) => fmtI(value)).join(', ')})` : 'true';
    lines.push(`        if (${condition}) commandQueue${index + 1}.applyVelocity(data, this)`);
  });
  return lines;
}

function resolveGlobalGravity(project) {
  for (const queue of project.commandQueues || []) {
    for (const command of queue.commands || []) {
      if (command.enabled !== false && command.type === 'gravity') {
        return Number(command.params?.gravity ?? 0.04);
      }
    }
  }
  return null;
}

function emitEmitterBlock(card, index) {
  const n = index + 1;
  const templateVar = `template${n}`;
  const dataVar = `data${n}`;
  const color = vector3fFromHex(card.particle.colorStart);
  const lines = [];
  lines.push(`// 发射器 #${n}: ${card.name}`);
  lines.push(`if (${buildEmitterActiveExpr(card)}) {`);
  lines.push(`    val ${dataVar} = SimpleRandomParticleData().apply {`);
  lines.push(`        minAge = ${fmtI(card.particle.lifeMin)}`);
  lines.push(`        maxAge = ${fmtI(card.particle.lifeMax)}`);
  lines.push(`        minCount = ${fmtI(card.particle.countMin)}`);
  lines.push(`        maxCount = ${fmtI(card.particle.countMax)}`);
  lines.push(`        minSize = ${fmtD(card.particle.sizeMin)}`);
  lines.push(`        maxSize = ${fmtD(card.particle.sizeMax)}`);
  lines.push(`        minSpeed = ${fmtD(card.particle.speedMin)}`);
  lines.push(`        maxSpeed = ${fmtD(card.particle.speedMax)}`);
  lines.push('    }');
  lines.push(`    val ${templateVar} = ControlableParticleData().apply {`);
  lines.push(`        velocity = ${vec3(card.particle.velocity)}`);
  lines.push(`        uniformSize = ${usesIndependentScale(card) ? 'false' : 'true'}`);
  lines.push(`        weightSize = ${fmtF(card.render.baseScale.x)}`);
  lines.push(`        heightSize = ${fmtF(usesIndependentScale(card) ? card.render.baseScale.y : card.render.baseScale.x)}`);
  if (usesDepthScale(card)) {
    lines.push(`        depthSize = ${fmtF(card.render.baseScale.z)}`);
  }
  lines.push(`        visibleRange = ${fmtF(card.particle.visibleRange)}`);
  lines.push(`        color = Vector3f(${fmtF(color.x)}, ${fmtF(color.y)}, ${fmtF(color.z)})`);
  lines.push(`        alpha = ${fmtF(Number(card.render.alpha || 0) / 100)}`);
  lines.push(`        light = ${fmtI(card.render.light)}`);
  lines.push(`        ${textureSheetStatement(card.render.textureSheet)}`);
  lines.push(`        cameraOption = ${cameraOptionConstant(card.render.billboardMode)}`);
  if (card.render.billboardMode === 'axis_billboard') {
    lines.push(`        axis = ${vec3(card.render.axis)}`);
  }
  lines.push(`        roll = ${degToRad(card.render.roll)}`);
  if (card.render.billboardMode === 'none') {
    lines.push(`        yaw = ${degToRad(card.render.yaw)}`);
    lines.push(`        pitch = ${degToRad(card.render.pitch)}`);
  }
  lines.push(`        speedLimit = ${fmtD(card.render.speedLimit)}`);
  lines.push(`        sign = ${fmtI(card.render.sign)}`);
  lines.push(`        effect = ${safeIdent(card.render.effectClass, 'ControlableEndRodEffect')}(uuid)`);
  lines.push('    }');
  lines.push('    res.addAll(');
  lines.push(indent(emitEmitterPointBuilder(card, dataVar), 8));
  lines.push('            .createWithoutClone()');
  lines.push('            .map { rel ->');
  lines.push(`                val speed = ${dataVar}.getRandomSpeed()`);
  lines.push(`                val particleSize = ${dataVar}.getRandomSize()`);
  lines.push(`                val velocityJitter = Vec3((Random.nextDouble() * 2.0 - 1.0) * ${fmtD(card.particle.velocityRandom.x)}, (Random.nextDouble() * 2.0 - 1.0) * ${fmtD(card.particle.velocityRandom.y)}, (Random.nextDouble() * 2.0 - 1.0) * ${fmtD(card.particle.velocityRandom.z)})`);
  if (card.particle.velocityMode === 'spawn_relative') {
    lines.push('                val dir = rel.toVector().add(velocityJitter)');
    lines.push('                val velocity = if (dir.lengthSqr() < 1e-8) Vec3.ZERO else dir.normalize().scale(speed)');
  } else {
    lines.push(`                val baseDir = ${vec3(card.particle.velocity)}.add(velocityJitter)`);
    lines.push('                val velocity = if (baseDir.lengthSqr() < 1e-8) Vec3.ZERO else baseDir.normalize().scale(speed)');
  }
  lines.push(`                ${templateVar}.clone().apply {`);
  lines.push(`                    maxAge = ${dataVar}.getRandomParticleMaxAge()`);
  if (usesIndependentScale(card)) {
    lines.push('                    uniformSize = false');
    lines.push(`                    weightSize = (particleSize * ${fmtD(card.render.baseScale.x)}).toFloat()`);
    lines.push(`                    heightSize = (particleSize * ${fmtD(card.render.baseScale.y)}).toFloat()`);
    if (usesDepthScale(card)) {
      lines.push(`                    depthSize = (particleSize * ${fmtD(card.render.baseScale.z)}).toFloat()`);
    }
  } else {
    lines.push(`                    size = (particleSize * ${fmtD(card.render.baseScale.x)}).toFloat()`);
  }
  lines.push('                    this.velocity = velocity');
  lines.push('                } to rel');
  lines.push('            }');
  lines.push('    )');
  lines.push('}');
  return lines.join('\n');
}

function usesIndependentScale(card) {
  return card.render.scaleMode === 'xyz';
}

function usesDepthScale(card) {
  return usesIndependentScale(card) && card.render.billboardMode === 'none';
}

function buildEmitterActiveExpr(card) {
  const start = fmtI(card.emission.startTick);
  const end = Number(card.emission.endTick);
  const base = end < 0 ? `tick >= ${start}` : `tick >= ${start} && tick <= ${fmtI(end)}`;
  if (card.emission.mode === 'once') return `tick == ${start}`;
  if (card.emission.mode === 'burst') return `(${base}) && ((tick - ${start}) % ${fmtI(card.emission.burstInterval, 1)} == 0)`;
  return base;
}

function emitLifecycleAction(project) {
  const enabled = project.emitters.filter((card) => card.enabled !== false);
  const lines = [];
  lines.push('override fun singleParticleAction(');
  lines.push('    controler: ParticleControler,');
  lines.push('    data: ControlableParticleData,');
  lines.push('    spawnPos: RelativeLocation,');
  lines.push('    spawnWorld: Level,');
  lines.push('    particleLerpProgress: Float,');
  lines.push('    posLerpProgress: Float');
  lines.push(') {');
  lines.push('    controler.addPreTickAction {');
  lines.push('        val lifeProgress = if (this.lifetime <= 0) 1.0 else (this.currentAge.toDouble() / this.lifetime.toDouble()).coerceIn(0.0, 1.0)');
  lines.push(...emitCommandQueueApplication(project));
  lines.push('        when (data.sign) {');
  enabled.forEach((card, index) => {
    const n = index + 1;
    const prefix = `emitter${n}`;
    const start = vector3fFromHex(card.particle.colorStart);
    const end = vector3fFromHex(card.particle.colorEnd);
    lines.push(`            ${fmtI(card.render.sign)} -> {`);
    if (card.particle.colorOverLifeEnabled) {
      lines.push('                val cp = lifeProgress.toFloat()');
      lines.push(`                this.color = Vector3f(${fmtF(start.x)} + (${fmtF(end.x)} - ${fmtF(start.x)}) * cp, ${fmtF(start.y)} + (${fmtF(end.y)} - ${fmtF(start.y)}) * cp, ${fmtF(start.z)} + (${fmtF(end.z)} - ${fmtF(start.z)}) * cp)`);
    }
    if (usesIndependentScale(card)) {
      lines.push('                this.uniformSize = false');
      lines.push(`                this.weightSize = (data.weightSize * ${prefix}SizeX.sample(lifeProgress)).toFloat()`);
      const sizeYCurve = card.curves.size.syncAxes ? `${prefix}SizeX` : `${prefix}SizeY`;
      lines.push(`                this.heightSize = (data.heightSize * ${sizeYCurve}.sample(lifeProgress)).toFloat()`);
      if (usesDepthScale(card)) {
        const sizeZCurve = card.curves.size.syncAxes ? `${prefix}SizeX` : `${prefix}SizeZ`;
        lines.push(`                this.depthSize = (data.depthSize * ${sizeZCurve}.sample(lifeProgress)).toFloat()`);
      }
    } else {
      lines.push('                this.uniformSize = true');
      lines.push(`                this.size = (data.size * ${prefix}SizeX.sample(lifeProgress)).toFloat()`);
    }
    lines.push(`                this.alpha = (${prefix}Opacity.sample(lifeProgress)).toFloat().coerceIn(0f, 1f)`);
    lines.push(`                this.light = ${prefix}Brightness.sample(lifeProgress).toInt().coerceIn(-1, 15)`);
    lines.push(`                this.roll = ${curveDegToRad(card.render.roll, `${prefix}Roll`)}`);
    if (card.render.billboardMode === 'none') {
      const yawCurve = card.curves.rotation.syncAxes ? `${prefix}Roll` : `${prefix}Yaw`;
      const pitchCurve = card.curves.rotation.syncAxes ? `${prefix}Roll` : `${prefix}Pitch`;
      lines.push(`                this.yaw = ${curveDegToRad(card.render.yaw, yawCurve)}`);
      lines.push(`                this.pitch = ${curveDegToRad(card.render.pitch, pitchCurve)}`);
    }
    lines.push('            }');
  });
  lines.push('        }');
  lines.push('    }');
  lines.push('}');
  return lines.join('\n');
}

export function generateEmitterScript(project) {
  return generateEmitterKotlin(project);
}

export function generateEmitterKotlin(rawProject) {
  const project = normalizeGeneratorProject(rawProject);
  const className = safeIdent(project.kotlin.className, 'GeneratedEmitter');
  const packageName = safePackage(project.kotlin.packageName);
  const baseClass = safeIdent(project.kotlin.baseClass, 'AutoParticleEmitters');
  const lines = [];
  if (packageName) {
    lines.push(`package ${packageName}`);
    lines.push('');
  }
  lines.push('import cn.coostack.cooparticlesapi.annotations.CooAutoRegister');
  lines.push('import cn.coostack.cooparticlesapi.network.particle.emitters.*');
  lines.push('import cn.coostack.cooparticlesapi.network.particle.emitters.command.*');
  lines.push('import cn.coostack.cooparticlesapi.network.particle.emitters.command.curve.*');
  lines.push('import cn.coostack.cooparticlesapi.particles.ParticleCameraOption');
  lines.push('import cn.coostack.cooparticlesapi.particles.control.ParticleControler');
  lines.push('import cn.coostack.cooparticlesapi.particles.impl.*');
  lines.push('import cn.coostack.cooparticlesapi.supports.TextureSheetsEnum');
  lines.push('import cn.coostack.cooparticlesapi.utils.RelativeLocation');
  lines.push('import cn.coostack.cooparticlesapi.utils.builder.PointsBuilder');
  lines.push('import net.minecraft.world.level.Level');
  lines.push('import net.minecraft.world.phys.Vec3');
  lines.push('import org.joml.Vector3f');
  lines.push('import kotlin.math.*');
  lines.push('import kotlin.random.Random');
  lines.push('');
  lines.push('@CooAutoRegister');
  lines.push(`class ${className}(pos: Vec3, world: Level?) : ${baseClass}(pos, world) {`);
  project.emitters.filter((card) => card.enabled !== false).forEach((card, index) => {
    lines.push(indent(emitCurveDeclarations(card, index), 4));
    lines.push('');
  });
  const commandQueues = emitCommandQueueDeclarations(project);
  if (commandQueues) {
    lines.push(indent(commandQueues, 4));
    lines.push('');
  }
  lines.push('    init {');
  const gravity = resolveGlobalGravity(project);
  if (gravity !== null) {
    lines.push(`        gravity = ${fmtD(gravity, 0.04)}`);
  }
  if (project.rootLifecycle.mode === 'once') {
    lines.push('        delay = 1');
    lines.push('        maxTick = 1');
  } else if (project.rootLifecycle.mode === 'interval_n_tick') {
    lines.push(`        delay = ${fmtI(project.rootLifecycle.intervalTick)}`);
    lines.push(`        maxTick = ${fmtI(project.rootLifecycle.maxTick)}`);
  } else {
    lines.push(`        delay = ${fmtI(project.rootLifecycle.intervalTick)}`);
    lines.push('        maxTick = -1');
  }
  lines.push('    }');
  lines.push('');
  lines.push('    override fun genParticles(lerpProgress: Float): List<Pair<ControlableParticleData, RelativeLocation>> {');
  lines.push('        val res = mutableListOf<Pair<ControlableParticleData, RelativeLocation>>()');
  lines.push('');
  project.emitters.filter((card) => card.enabled !== false).forEach((card, index) => {
    lines.push(indent(emitEmitterBlock(card, index), 8));
    lines.push('');
  });
  lines.push('        return res');
  lines.push('    }');
  lines.push('');
  lines.push(indent(emitLifecycleAction(project), 4));
  lines.push('}');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
