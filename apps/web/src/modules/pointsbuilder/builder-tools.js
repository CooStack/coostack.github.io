import {
  v,
  clone,
  add,
  num,
  int,
  fmt,
  relExpr,
  getPolygonInCircleVertices,
  rotatePointsToPointUpright
} from './geometry.js';
import { POINTS_NODE_KINDS, BUILDER_CONTAINER_KINDS } from './kinds.js';
import { getProjectNodes } from './node-helpers.js';

function clonePointWithOffset(point, offset = v(0, 0, 0)) {
  return {
    ...point,
    x: num(point?.x) + num(offset?.x),
    y: num(point?.y) + num(offset?.y),
    z: num(point?.z) + num(offset?.z)
  };
}

function buildPointOwnerByIndex(totalCount, segments) {
  const owners = new Array(totalCount || 0);
  if (!(segments instanceof Map)) return owners;
  for (const [id, segment] of segments.entries()) {
    if (!segment) continue;
    const start = Math.max(0, segment.start | 0);
    const end = Math.min(owners.length, segment.end | 0);
    for (let index = start; index < end; index += 1) owners[index] = id;
  }
  return owners;
}

function evaluateAddBuilder(node, evaluateChildren) {
  const child = evaluateChildren(node.children || []);
  const offset = v(num(node.params?.ox), num(node.params?.oy), num(node.params?.oz));
  return {
    points: (child.points || []).map((point) => clonePointWithOffset(point, offset)),
    previewPoints: Array.isArray(child.previewPoints)
      ? child.previewPoints.map((point) => clonePointWithOffset(point, offset))
      : [],
    segments: child.segments instanceof Map ? child.segments : new Map()
  };
}

function evaluateAddWith(node, evaluateChildren) {
  const child = evaluateChildren(node.children || []);
  const childPoints = Array.isArray(child.points) ? child.points : [];
  const offset = v(num(node.params?.ox), num(node.params?.oy), num(node.params?.oz));
  const radius = num(node.params?.r, 3);
  const count = Math.max(1, int(node.params?.c, 6));
  const rotateToCenter = Boolean(node.params?.rotateToCenter);
  const rotateReverse = Boolean(node.params?.rotateReverse);
  const rotateOffsetEnabled = Boolean(node.params?.rotateOffsetEnabled);
  const rotateOffset = v(num(node.params?.rox), num(node.params?.roy), num(node.params?.roz));
  const vertices = getPolygonInCircleVertices(count, radius) || [];
  const points = [];
  const previewPoints = [];

  if (node.params?.previewBeforeOffsetEnabled && childPoints.length) {
    const previewOwners = buildPointOwnerByIndex(childPoints.length, child.segments);
    for (let index = 0; index < childPoints.length; index += 1) {
      const point = childPoints[index];
      previewPoints.push({
        x: num(point?.x) + offset.x,
        y: num(point?.y) + offset.y,
        z: num(point?.z) + offset.z,
        nodeId: previewOwners[index] || null,
        previewParentId: node.id || null,
        previewSource: 'add_with'
      });
    }
  }

  for (const vertex of vertices) {
    const repeatedPoints = childPoints.map((point) => clone(point));
    if (rotateToCenter && repeatedPoints.length) {
      const targetPoint = rotateOffsetEnabled ? rotateOffset : v(0, 0, 0);
      const rotateTarget = rotateReverse
        ? add(targetPoint, vertex)
        : v(targetPoint.x - vertex.x, targetPoint.y - vertex.y, targetPoint.z - vertex.z);
      rotatePointsToPointUpright(repeatedPoints, rotateTarget, child.axis || v(0, 1, 0));
    }
    for (const point of repeatedPoints) {
      points.push({
        x: num(point?.x) + num(vertex?.x) + offset.x,
        y: num(point?.y) + num(vertex?.y) + offset.y,
        z: num(point?.z) + num(vertex?.z) + offset.z
      });
    }
  }

  return {
    points,
    previewPoints,
    segments: new Map()
  };
}

function emitNodeKotlinLines(node, emitCtx, indent, emitNodesKotlinLines) {
  const definition = POINTS_NODE_KINDS[node.kind];
  if (!definition?.kotlin) return [];
  const result = definition.kotlin(node, emitCtx, indent, emitNodesKotlinLines);
  if (Array.isArray(result)) return result;
  if (!result) return [];
  return [`${indent}${result}`];
}

export function evalBuilderWithMeta(nodes, initialAxis = v(0, 1, 0)) {
  const context = {
    points: [],
    axis: clone(initialAxis),
    previewPoints: []
  };
  const segments = new Map();

  function evaluateChildren(children) {
    return evalBuilderWithMeta(children, v(0, 1, 0));
  }

  function appendPreviewPoints(targetContext, previewPoints) {
    if (!Array.isArray(previewPoints) || !previewPoints.length) return;
    if (!Array.isArray(targetContext.previewPoints)) targetContext.previewPoints = [];
    targetContext.previewPoints.push(...previewPoints.map((point) => ({ ...point })));
  }

  function evalList(list, targetContext, baseOffset) {
    (list || []).forEach((node) => {
      if (!node) return;
      const beforeLength = targetContext.points.length;

      if (BUILDER_CONTAINER_KINDS.has(node.kind)) {
        const childResult = node.kind === 'add_builder'
          ? evaluateAddBuilder(node, evaluateChildren)
          : evaluateAddWith(node, evaluateChildren);

        targetContext.points.push(...(childResult.points || []));
        appendPreviewPoints(targetContext, childResult.previewPoints);

        if (targetContext.points.length > beforeLength) {
          segments.set(node.id, {
            start: beforeLength + baseOffset,
            end: targetContext.points.length + baseOffset
          });
        }

        if (node.kind === 'add_builder' && childResult.segments instanceof Map) {
          for (const [id, segment] of childResult.segments.entries()) {
            if (!segment) continue;
            segments.set(id, {
              start: segment.start + beforeLength + baseOffset,
              end: segment.end + beforeLength + baseOffset
            });
          }
        }
        return;
      }

      const definition = POINTS_NODE_KINDS[node.kind];
      if (!definition?.apply) return;
      definition.apply(targetContext, node);
      if (targetContext.points.length > beforeLength) {
        segments.set(node.id, {
          start: beforeLength + baseOffset,
          end: targetContext.points.length + baseOffset
        });
      }
    });
  }

  evalList(nodes || [], context, 0);
  return {
    points: context.points,
    axis: context.axis,
    previewPoints: context.previewPoints,
    segments
  };
}

export function evalBuilder(nodes, initialAxis = v(0, 1, 0)) {
  return evalBuilderWithMeta(nodes, initialAxis).points;
}

export function emitNodesKotlinLines(nodes, indent = '  ', emitCtx = { decls: [] }) {
  const lines = [];
  (nodes || []).forEach((node) => {
    lines.push(...emitNodeKotlinLines(node, emitCtx, indent, emitNodesKotlinLines));
  });
  return lines;
}

export function emitKotlin(project) {
  const emitCtx = { decls: [] };
  const nodes = getProjectNodes(project);
  const endMode = project?.kotlinEndMode || 'builder';
  const lines = ['PointsBuilder()', ...emitNodesKotlinLines(nodes, '  ', emitCtx)];

  if (endMode === 'list') {
    lines.push('  .createWithoutClone()');
  } else if (endMode === 'clone') {
    lines.push('  .create()');
  }

  const expression = lines.join('\n');
  if (!emitCtx.decls.length) return expression;

  return [
    'run {',
    ...emitCtx.decls.map((line) => `  ${line}`),
    `  ${expression.replace(/\n/g, '\n  ')}`,
    '}'
  ].join('\n');
}

export const builderFormatters = {
  fmt,
  relExpr
};
