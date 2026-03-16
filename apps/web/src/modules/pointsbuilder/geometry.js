const EPSILON = 1e-9;
const TAU = Math.PI * 2;

export function v(x = 0, y = 0, z = 0) {
  return { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 };
}

export function clone(point) {
  return v(point?.x, point?.y, point?.z);
}

export function add(a, b) {
  return v((a?.x || 0) + (b?.x || 0), (a?.y || 0) + (b?.y || 0), (a?.z || 0) + (b?.z || 0));
}

export function sub(a, b) {
  return v((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0), (a?.z || 0) - (b?.z || 0));
}

export function mul(point, scalar) {
  return v((point?.x || 0) * scalar, (point?.y || 0) * scalar, (point?.z || 0) * scalar);
}

export function dot(a, b) {
  return (a?.x || 0) * (b?.x || 0) + (a?.y || 0) * (b?.y || 0) + (a?.z || 0) * (b?.z || 0);
}

export function cross(a, b) {
  return v(
    (a?.y || 0) * (b?.z || 0) - (a?.z || 0) * (b?.y || 0),
    (a?.z || 0) * (b?.x || 0) - (a?.x || 0) * (b?.z || 0),
    (a?.x || 0) * (b?.y || 0) - (a?.y || 0) * (b?.x || 0)
  );
}

export function len(point) {
  return Math.sqrt(dot(point, point));
}

export function normalize(point, fallback = v(0, 1, 0)) {
  const length = len(point);
  if (length < EPSILON) return clone(fallback);
  return v(point.x / length, point.y / length, point.z / length);
}

export function num(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function int(value, fallback = 0) {
  return Math.round(num(value, fallback));
}

export function fmt(value) {
  const next = num(value, 0);
  const normalized = Math.abs(next) < EPSILON ? 0 : next;
  const fixed = normalized.toFixed(6).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return fixed === '-0' ? '0' : fixed;
}

export function relExpr(x, y, z) {
  return `RelativeLocation(${fmt(num(x))}, ${fmt(num(y))}, ${fmt(num(z))})`;
}

export function angleToRad(value, unit = 'deg') {
  const source = num(value);
  if (unit === 'rad') return source;
  return (source * Math.PI) / 180;
}

export function angleToDeg(value, unit = 'deg') {
  const source = num(value);
  if (unit === 'rad') return (source * 180) / Math.PI;
  return source;
}

export function getLineLocations(start, end, count) {
  const total = Math.max(1, int(count, 1));
  if (total === 1) return [clone(start)];
  return Array.from({ length: total }, (_, index) => {
    const ratio = index / (total - 1);
    return v(
      start.x + (end.x - start.x) * ratio,
      start.y + (end.y - start.y) * ratio,
      start.z + (end.z - start.z) * ratio
    );
  });
}

export function fillTriangle(p1, p2, p3, sampler = 3) {
  const density = Math.max(1, int(sampler, 3));
  const points = [];
  for (let i = 0; i <= density; i += 1) {
    for (let j = 0; j <= density - i; j += 1) {
      const a = i / density;
      const b = j / density;
      const c = 1 - a - b;
      points.push(v(
        p1.x * c + p2.x * a + p3.x * b,
        p1.y * c + p2.y * a + p3.y * b,
        p1.z * c + p2.z * a + p3.z * b
      ));
    }
  }
  return points;
}

export function getCircleXZ(radius, count) {
  const total = Math.max(3, int(count, 3));
  const r = num(radius, 1);
  return Array.from({ length: total }, (_, index) => {
    const angle = (index / total) * TAU;
    return v(Math.cos(angle) * r, 0, Math.sin(angle) * r);
  });
}

export function getPolygonInCircleVertices(sideCount, radius) {
  const total = Math.max(3, int(sideCount, 3));
  const r = num(radius, 1);
  return Array.from({ length: total }, (_, index) => {
    const angle = (index / total) * TAU;
    return v(Math.cos(angle) * r, 0, Math.sin(angle) * r);
  });
}

export function getPolygonInCircleLocations(sideCount, count, radius) {
  const vertices = getPolygonInCircleVertices(sideCount, radius);
  const perEdge = Math.max(2, int(count, 2));
  const points = [];
  vertices.forEach((start, index) => {
    const end = vertices[(index + 1) % vertices.length];
    const linePoints = getLineLocations(start, end, perEdge);
    if (index < vertices.length - 1) {
      points.push(...linePoints.slice(0, -1));
      return;
    }
    points.push(...linePoints);
  });
  return points;
}

export function cubicBezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  const u3 = u2 * u;
  const t3 = t2 * t;
  return v(
    u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
    u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
    u3 * p0.z + 3 * u2 * t * p1.z + 3 * u * t2 * p2.z + t3 * p3.z
  );
}

export function buildCubicBezier(p0, p1, p2, p3, count) {
  const total = Math.max(2, int(count, 2));
  return Array.from({ length: total }, (_, index) => {
    const t = total === 1 ? 1 : index / (total - 1);
    return cubicBezierPoint(t, p0, p1, p2, p3);
  });
}

export function quadToCubic(p0, p1, p2) {
  return {
    c1: add(p0, mul(sub(p1, p0), 2 / 3)),
    c2: add(p2, mul(sub(p1, p2), 2 / 3))
  };
}

export function generateBezierCurve(startOrTarget, endOrStartHandle, startHandleOrEndHandle, endHandleOrCount, maybeCount) {
  if (maybeCount !== undefined) {
    const start = clone(startOrTarget);
    const end = clone(endOrStartHandle);
    const startHandle = add(start, startHandleOrEndHandle);
    const endHandle = add(end, endHandleOrCount);
    return buildCubicBezier(start, startHandle, endHandle, end, maybeCount);
  }

  const target = clone(startOrTarget);
  const startHandle = clone(endOrStartHandle);
  const endHandle = clone(startHandleOrEndHandle);
  const origin = v(0, 0, 0);
  return buildCubicBezier(origin, startHandle, add(target, endHandle), target, endHandleOrCount);
}

function rotateVectorAroundAxis(point, axis, angle) {
  const unit = normalize(axis, v(0, 1, 0));
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const term1 = mul(point, cosine);
  const term2 = mul(cross(unit, point), sine);
  const term3 = mul(unit, dot(unit, point) * (1 - cosine));
  return add(add(term1, term2), term3);
}

function getPerpendicularAxis(source) {
  const normalized = normalize(source, v(0, 1, 0));
  const fallback = Math.abs(normalized.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
  return normalize(cross(normalized, fallback), v(0, 0, 1));
}

export function rotatePointsToPointUpright(points, targetPoint, axis = v(0, 1, 0)) {
  const from = normalize(axis, v(0, 1, 0));
  const to = normalize(targetPoint, from);
  const rotationAxis = cross(from, to);
  const rotationLength = len(rotationAxis);
  const alignment = Math.max(-1, Math.min(1, dot(from, to)));

  if (rotationLength < EPSILON) {
    if (alignment > 0.999999) return points;
    const fallbackAxis = getPerpendicularAxis(from);
    return points.map((point) => rotateVectorAroundAxis(point, fallbackAxis, Math.PI));
  }

  const angle = Math.acos(alignment);
  return points.map((point) => rotateVectorAroundAxis(point, rotationAxis, angle));
}

export function buildFourierSeries(terms = [], count = 360, scale = 1) {
  const total = Math.max(2, int(count, 2));
  const factor = num(scale, 1);
  return Array.from({ length: total }, (_, index) => {
    const ratio = index / (total - 1);
    const theta = ratio * TAU;
    let x = 0;
    let z = 0;

    terms.forEach((term) => {
      const radius = num(term?.r, 0);
      const omega = num(term?.w, 1);
      const startAngle = angleToRad(term?.startAngle, term?.startAngleUnit);
      x += radius * Math.cos(theta * omega + startAngle);
      z += radius * Math.sin(theta * omega + startAngle);
    });

    return v(x * factor, 0, z * factor);
  });
}
