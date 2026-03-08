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

function evaluateAddBuilder(node, evaluateChildren) {
  const child = evaluateChildren(node.children || []);
  const offset = v(num(node.params?.ox), num(node.params?.oy), num(node.params?.oz));
  return {
    points: child.points.map((point) => add(point, offset)),
    segments: child.segments
  };
}

function evaluateAddWith(node, evaluateChildren) {
  const radius = num(node.params?.r, 3);
  const count = Math.max(1, int(node.params?.c, 6));
  const rotateToCenter = Boolean(node.params?.rotateToCenter);
  const rotateReverse = Boolean(node.params?.rotateReverse);
  const rotateOffsetEnabled = Boolean(node.params?.rotateOffsetEnabled);
  const rotateOffset = v(num(node.params?.rox), num(node.params?.roy), num(node.params?.roz));
  const vertices = getPolygonInCircleVertices(count, radius);
  const points = [];

  vertices.forEach((vertex) => {
    const child = evaluateChildren(node.children || []);
    let childPoints = child.points.map((point) => clone(point));

    if (rotateToCenter) {
      const targetPoint = rotateOffsetEnabled ? rotateOffset : v(0, 0, 0);
      const rotateTarget = rotateReverse ? add(targetPoint, vertex) : v(targetPoint.x - vertex.x, targetPoint.y - vertex.y, targetPoint.z - vertex.z);
      childPoints = rotatePointsToPointUpright(childPoints, rotateTarget, child.axis || v(0, 1, 0));
    }

    childPoints.forEach((point) => {
      points.push(add(point, vertex));
    });
  });

  return {
    points,
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
    axis: clone(initialAxis)
  };
  const segments = new Map();

  function evaluateChildren(children) {
    return evalBuilderWithMeta(children, v(0, 1, 0));
  }

  function evalList(list, targetContext, baseOffset) {
    (list || []).forEach((node) => {
      if (!node) return;
      const beforeLength = targetContext.points.length;

      if (BUILDER_CONTAINER_KINDS.has(node.kind)) {
        const childResult = node.kind === 'add_builder'
          ? evaluateAddBuilder(node, evaluateChildren)
          : evaluateAddWith(node, evaluateChildren);

        targetContext.points.push(...childResult.points);
        if (targetContext.points.length > beforeLength) {
          segments.set(node.id, {
            start: beforeLength + baseOffset,
            end: targetContext.points.length + baseOffset
          });
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
