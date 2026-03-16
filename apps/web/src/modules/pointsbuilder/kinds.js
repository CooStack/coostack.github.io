import {
  v,
  num,
  int,
  fmt,
  relExpr,
  getLineLocations,
  fillTriangle,
  getCircleXZ,
  getPolygonInCircleLocations,
  quadToCubic,
  buildCubicBezier,
  generateBezierCurve,
  buildFourierSeries
} from './geometry.js';

function numberField(key, label, options = {}) {
  return {
    key,
    label,
    type: 'number',
    step: options.step ?? 0.1,
    min: options.min,
    max: options.max,
    placeholder: options.placeholder || ''
  };
}

function toggleField(key, label) {
  return {
    key,
    label,
    type: 'checkbox'
  };
}

function selectField(key, label, options = []) {
  return {
    key,
    label,
    type: 'select',
    options
  };
}

const ANGLE_UNIT_OPTIONS = [
  { label: '角度', value: 'deg' },
  { label: '弧度', value: 'rad' }
];

const KOTLIN_MODE_OPTIONS = [
  { label: 'it.add(x, y, z)', value: 'direct3' },
  { label: 'it.add(RelativeLocation)', value: 'newRel' },
  { label: '预声明变量', value: 'valRel' }
];

export const BUILDER_CONTAINER_KINDS = new Set(['add_builder', 'add_with']);

export const FOURIER_TERM_FIELDS = [
  numberField('r', '半径', { step: 0.1 }),
  numberField('w', '频率', { step: 0.1 }),
  numberField('startAngle', '起始角', { step: 1 }),
  selectField('startAngleUnit', '角度单位', ANGLE_UNIT_OPTIONS)
];

export const POINTS_NODE_KINDS = {
  add_point: {
    title: '单点',
    group: '基础',
    description: '添加一个点。',
    defaultParams: { x: 0, y: 0, z: 0 },
    fields: [numberField('x', 'X'), numberField('y', 'Y'), numberField('z', 'Z')],
    apply(ctx, node) {
      ctx.points.push(v(num(node.params.x), num(node.params.y), num(node.params.z)));
    },
    kotlin(node) {
      return `.addPoint(${relExpr(node.params.x, node.params.y, node.params.z)})`;
    }
  },
  add_line: {
    title: '线段',
    group: '基础',
    description: '添加线段采样点。',
    defaultParams: { sx: 0, sy: 0, sz: 0, ex: 3, ey: 0, ez: 3, count: 30 },
    fields: [
      numberField('sx', '起点 X'),
      numberField('sy', '起点 Y'),
      numberField('sz', '起点 Z'),
      numberField('ex', '终点 X'),
      numberField('ey', '终点 Y'),
      numberField('ez', '终点 Z'),
      numberField('count', '点数', { step: 1, min: 2 })
    ],
    apply(ctx, node) {
      const start = v(num(node.params.sx), num(node.params.sy), num(node.params.sz));
      const end = v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
      ctx.points.push(...getLineLocations(start, end, Math.max(2, int(node.params.count, 30))));
    },
    kotlin(node) {
      return `.addLine(${relExpr(node.params.sx, node.params.sy, node.params.sz)}, ${relExpr(node.params.ex, node.params.ey, node.params.ez)}, ${Math.max(2, int(node.params.count, 30))})`;
    }
  },
  add_fill_triangle: {
    title: '三角填充',
    group: '基础',
    description: '根据三个顶点填充三角形。',
    defaultParams: {
      p1x: 0, p1y: 0, p1z: 0,
      p2x: 3, p2y: 0, p2z: 0,
      p3x: 0, p3y: 0, p3z: 3,
      sampler: 3
    },
    fields: [
      numberField('p1x', 'P1 X'), numberField('p1y', 'P1 Y'), numberField('p1z', 'P1 Z'),
      numberField('p2x', 'P2 X'), numberField('p2y', 'P2 Y'), numberField('p2z', 'P2 Z'),
      numberField('p3x', 'P3 X'), numberField('p3y', 'P3 Y'), numberField('p3z', 'P3 Z'),
      numberField('sampler', '采样密度', { step: 1, min: 1 })
    ],
    apply(ctx, node) {
      const p1 = v(num(node.params.p1x), num(node.params.p1y), num(node.params.p1z));
      const p2 = v(num(node.params.p2x), num(node.params.p2y), num(node.params.p2z));
      const p3 = v(num(node.params.p3x), num(node.params.p3y), num(node.params.p3z));
      ctx.points.push(...fillTriangle(p1, p2, p3, node.params.sampler));
    },
    kotlin(node) {
      return `.addFillTriangle(${relExpr(node.params.p1x, node.params.p1y, node.params.p1z)}, ${relExpr(node.params.p2x, node.params.p2y, node.params.p2z)}, ${relExpr(node.params.p3x, node.params.p3y, node.params.p3z)}, ${fmt(num(node.params.sampler, 3))})`;
    }
  },
  add_circle: {
    title: '圆环 XZ',
    group: '基础',
    description: '添加 XZ 平面的圆周点。',
    defaultParams: { r: 2, count: 120 },
    fields: [numberField('r', '半径', { min: 0.1 }), numberField('count', '点数', { step: 1, min: 3 })],
    apply(ctx, node) {
      ctx.points.push(...getCircleXZ(num(node.params.r, 2), Math.max(3, int(node.params.count, 120))));
    },
    kotlin(node) {
      return `.addCircle(${fmt(num(node.params.r, 2))}, ${Math.max(3, int(node.params.count, 120))})`;
    }
  },
  add_polygon: {
    title: '正多边形边点',
    group: '形状',
    description: '按照外接圆生成多边形边点。',
    defaultParams: { r: 2, sideCount: 5, count: 30 },
    fields: [
      numberField('r', '半径', { min: 0.1 }),
      numberField('sideCount', '边数', { step: 1, min: 3 }),
      numberField('count', '每边点数', { step: 1, min: 2 })
    ],
    apply(ctx, node) {
      ctx.points.push(...getPolygonInCircleLocations(int(node.params.sideCount, 5), int(node.params.count, 30), num(node.params.r, 2)));
    },
    kotlin(node) {
      return `.addPolygonInCircle(${Math.max(3, int(node.params.sideCount, 5))}, ${Math.max(2, int(node.params.count, 30))}, ${fmt(num(node.params.r, 2))})`;
    }
  },
  add_polygon_in_circle: {
    title: '内接多边形边点',
    group: '形状',
    description: '兼容旧版 addPolygonInCircle。',
    defaultParams: { n: 5, edgeCount: 30, r: 2 },
    fields: [
      numberField('n', '边数', { step: 1, min: 3 }),
      numberField('edgeCount', '每边点数', { step: 1, min: 2 }),
      numberField('r', '半径', { min: 0.1 })
    ],
    apply(ctx, node) {
      ctx.points.push(...getPolygonInCircleLocations(int(node.params.n, 5), int(node.params.edgeCount, 30), num(node.params.r, 2)));
    },
    kotlin(node) {
      return `.addPolygonInCircle(${Math.max(3, int(node.params.n, 5))}, ${Math.max(2, int(node.params.edgeCount, 30))}, ${fmt(num(node.params.r, 2))})`;
    }
  },
  add_bezier: {
    title: '三点贝塞尔',
    group: '曲线',
    description: '通过三点生成二次贝塞尔曲线。',
    defaultParams: {
      p1x: 0, p1y: 0, p1z: 0,
      p2x: 2, p2y: 2, p2z: 0,
      p3x: 4, p3y: 0, p3z: 0,
      count: 80
    },
    fields: [
      numberField('p1x', '起点 X'), numberField('p1y', '起点 Y'), numberField('p1z', '起点 Z'),
      numberField('p2x', '控制点 X'), numberField('p2y', '控制点 Y'), numberField('p2z', '控制点 Z'),
      numberField('p3x', '终点 X'), numberField('p3y', '终点 Y'), numberField('p3z', '终点 Z'),
      numberField('count', '点数', { step: 1, min: 2 })
    ],
    apply(ctx, node) {
      const p0 = v(num(node.params.p1x), num(node.params.p1y), num(node.params.p1z));
      const p1 = v(num(node.params.p2x), num(node.params.p2y), num(node.params.p2z));
      const p2 = v(num(node.params.p3x), num(node.params.p3y), num(node.params.p3z));
      const cubic = quadToCubic(p0, p1, p2);
      ctx.points.push(...buildCubicBezier(p0, cubic.c1, cubic.c2, p2, Math.max(2, int(node.params.count, 80))));
    },
    kotlin(node) {
      const p0 = v(num(node.params.p1x), num(node.params.p1y), num(node.params.p1z));
      const p1 = v(num(node.params.p2x), num(node.params.p2y), num(node.params.p2z));
      const p2 = v(num(node.params.p3x), num(node.params.p3y), num(node.params.p3z));
      const cubic = quadToCubic(p0, p1, p2);
      const target = v(p2.x - p0.x, p2.y - p0.y, p2.z - p0.z);
      const startHandle = v(cubic.c1.x - p0.x, cubic.c1.y - p0.y, cubic.c1.z - p0.z);
      const endHandle = v(cubic.c2.x - p2.x, cubic.c2.y - p2.y, cubic.c2.z - p2.z);
      return `.addWith { generateBezierCurve(${relExpr(target.x, target.y, target.z)}, ${relExpr(startHandle.x, startHandle.y, startHandle.z)}, ${relExpr(endHandle.x, endHandle.y, endHandle.z)}, ${Math.max(2, int(node.params.count, 80))}).onEach { it.add(${relExpr(p0.x, p0.y, p0.z)}) } }`;
    }
  },
  add_bezier_4: {
    title: '四点贝塞尔',
    group: '曲线',
    description: '通过四点生成三次贝塞尔曲线。',
    defaultParams: {
      p1x: 0, p1y: 0, p1z: 0,
      p2x: 2, p2y: 2, p2z: 0,
      p3x: 4, p3y: -2, p3z: 0,
      p4x: 6, p4y: 0, p4z: 0,
      count: 80
    },
    fields: [
      numberField('p1x', 'P1 X'), numberField('p1y', 'P1 Y'), numberField('p1z', 'P1 Z'),
      numberField('p2x', 'P2 X'), numberField('p2y', 'P2 Y'), numberField('p2z', 'P2 Z'),
      numberField('p3x', 'P3 X'), numberField('p3y', 'P3 Y'), numberField('p3z', 'P3 Z'),
      numberField('p4x', 'P4 X'), numberField('p4y', 'P4 Y'), numberField('p4z', 'P4 Z'),
      numberField('count', '点数', { step: 1, min: 2 })
    ],
    apply(ctx, node) {
      const p0 = v(num(node.params.p1x), num(node.params.p1y), num(node.params.p1z));
      const p1 = v(num(node.params.p2x), num(node.params.p2y), num(node.params.p2z));
      const p2 = v(num(node.params.p3x), num(node.params.p3y), num(node.params.p3z));
      const p3 = v(num(node.params.p4x), num(node.params.p4y), num(node.params.p4z));
      ctx.points.push(...buildCubicBezier(p0, p1, p2, p3, Math.max(2, int(node.params.count, 80))));
    },
    kotlin(node) {
      const p0 = v(num(node.params.p1x), num(node.params.p1y), num(node.params.p1z));
      const c1 = v(num(node.params.p2x), num(node.params.p2y), num(node.params.p2z));
      const c2 = v(num(node.params.p3x), num(node.params.p3y), num(node.params.p3z));
      const p3 = v(num(node.params.p4x), num(node.params.p4y), num(node.params.p4z));
      const target = v(p3.x - p0.x, p3.y - p0.y, p3.z - p0.z);
      const startHandle = v(c1.x - p0.x, c1.y - p0.y, c1.z - p0.z);
      const endHandle = v(c2.x - p3.x, c2.y - p3.y, c2.z - p3.z);
      return `.addWith { generateBezierCurve(${relExpr(target.x, target.y, target.z)}, ${relExpr(startHandle.x, startHandle.y, startHandle.z)}, ${relExpr(endHandle.x, endHandle.y, endHandle.z)}, ${Math.max(2, int(node.params.count, 80))}).onEach { it.add(${relExpr(p0.x, p0.y, p0.z)}) } }`;
    }
  },
  add_bezier_curve: {
    title: 'Bezier Curve',
    group: '曲线',
    description: '使用起点/终点与相对手柄生成三维三次贝塞尔曲线。',
    defaultParams: {
      sx: 0, sy: 0, sz: 0,
      ex: 5, ey: 0, ez: 0,
      shx: 2, shy: 2, shz: 0,
      ehx: -2, ehy: 2, ehz: 0,
      count: 80
    },
    fields: [
      numberField('sx', '起点 X'), numberField('sy', '起点 Y'), numberField('sz', '起点 Z'),
      numberField('ex', '终点 X'), numberField('ey', '终点 Y'), numberField('ez', '终点 Z'),
      numberField('shx', '起始手柄 X'), numberField('shy', '起始手柄 Y'), numberField('shz', '起始手柄 Z'),
      numberField('ehx', '结束手柄 X'), numberField('ehy', '结束手柄 Y'), numberField('ehz', '结束手柄 Z'),
      numberField('count', '点数', { step: 1, min: 2 })
    ],
    apply(ctx, node) {
      const start = v(num(node.params.sx), num(node.params.sy), num(node.params.sz));
      const end = v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
      const startHandle = v(num(node.params.shx), num(node.params.shy), num(node.params.shz));
      const endHandle = v(num(node.params.ehx), num(node.params.ehy), num(node.params.ehz));
      ctx.points.push(...generateBezierCurve(start, end, startHandle, endHandle, Math.max(2, int(node.params.count, 80))));
    },
    kotlin(node) {
      return `.addBezierCurve(${relExpr(node.params.sx, node.params.sy, node.params.sz)}, ${relExpr(node.params.ex, node.params.ey, node.params.ez)}, ${relExpr(node.params.shx, node.params.shy, node.params.shz)}, ${relExpr(node.params.ehx, node.params.ehy, node.params.ehz)}, ${Math.max(2, int(node.params.count, 80))})`;
    }
  },
  points_on_each_offset: {
    title: '整体偏移',
    group: '变换',
    description: '对已有点执行 pointsOnEach 偏移。',
    defaultParams: { offX: 0.2, offY: 0, offZ: 0, kotlinMode: 'direct3' },
    fields: [
      numberField('offX', '偏移 X'),
      numberField('offY', '偏移 Y'),
      numberField('offZ', '偏移 Z'),
      selectField('kotlinMode', 'Kotlin 输出', KOTLIN_MODE_OPTIONS)
    ],
    apply(ctx, node) {
      const dx = num(node.params.offX);
      const dy = num(node.params.offY);
      const dz = num(node.params.offZ);
      ctx.points = ctx.points.map((point) => ({ x: point.x + dx, y: point.y + dy, z: point.z + dz }));
    },
    kotlin(node, emitCtx) {
      const dx = fmt(num(node.params.offX));
      const dy = fmt(num(node.params.offY));
      const dz = fmt(num(node.params.offZ));
      const mode = node.params.kotlinMode;
      if (mode === 'newRel') return `.pointsOnEach { it.add(RelativeLocation(${dx}, ${dy}, ${dz})) }`;
      if (mode === 'valRel') {
        const variableName = `rel_${node.id.slice(0, 6)}`;
        emitCtx.decls.push(`val ${variableName} = RelativeLocation(${dx}, ${dy}, ${dz})`);
        return `.pointsOnEach { it.add(${variableName}) }`;
      }
      return `.pointsOnEach { it.add(${dx}, ${dy}, ${dz}) }`;
    }
  },
  add_builder: {
    title: '子 Builder',
    group: '容器',
    description: '拼接一个带偏移的子 Builder。',
    defaultParams: { ox: 0, oy: 0, oz: 0, folded: false },
    supportsChildren: true,
    fields: [numberField('ox', '偏移 X'), numberField('oy', '偏移 Y'), numberField('oz', '偏移 Z')],
    kotlin(node, emitCtx, indent, emitNodesKotlinLines) {
      const lines = [];
      lines.push(`${indent}.addBuilder(${relExpr(node.params.ox, node.params.oy, node.params.oz)},`);
      lines.push(`${indent}  PointsBuilder()`);
      lines.push(...emitNodesKotlinLines(node.children || [], `${indent}    `, emitCtx));
      lines.push(`${indent}  )`);
      return lines;
    }
  },
  add_with: {
    title: '旋转重复',
    group: '容器',
    description: '围绕多边形顶点重复子 Builder。',
    defaultParams: {
      r: 3,
      c: 6,
      rotateToCenter: true,
      rotateReverse: false,
      rotateOffsetEnabled: false,
      rox: 0,
      roy: 0,
      roz: 0
    },
    supportsChildren: true,
    fields: [
      numberField('r', '半径', { min: 0.1 }),
      numberField('c', '数量', { step: 1, min: 1 }),
      toggleField('rotateToCenter', '朝向中心'),
      toggleField('rotateReverse', '朝向反转'),
      toggleField('rotateOffsetEnabled', '启用朝向偏移'),
      numberField('rox', '朝向偏移 X'),
      numberField('roy', '朝向偏移 Y'),
      numberField('roz', '朝向偏移 Z')
    ],
    kotlin(node, emitCtx, indent, emitNodesKotlinLines) {
      const lines = [];
      const radius = fmt(num(node.params.r, 3));
      const count = Math.max(1, int(node.params.c, 6));
      const rotateToCenter = Boolean(node.params.rotateToCenter);
      const rotateReverse = Boolean(node.params.rotateReverse);
      const rotateOffsetEnabled = Boolean(node.params.rotateOffsetEnabled);
      const rox = fmt(num(node.params.rox));
      const roy = fmt(num(node.params.roy));
      const roz = fmt(num(node.params.roz));

      lines.push(`${indent}.addWith {`);
      lines.push(`${indent}  val res = arrayListOf<RelativeLocation>()`);
      lines.push(`${indent}  getPolygonInCircleVertices(${count}, ${radius})`);
      lines.push(`${indent}        .forEach { it ->`);
      lines.push(`${indent}            val p = PointsBuilder()`);
      lines.push(...emitNodesKotlinLines(node.children || [], `${indent}              `, emitCtx));
      if (rotateToCenter) {
        if (rotateOffsetEnabled) {
          if (rotateReverse) {
            lines.push(`${indent}            p.rotateTo(it.clone().add(${rox}, ${roy}, ${roz}))`);
          } else {
            lines.push(`${indent}            p.rotateTo((-it).add(${rox}, ${roy}, ${roz}))`);
          }
        } else {
          lines.push(`${indent}            p.rotateTo(${rotateReverse ? 'it' : '-it'})`);
        }
      }
      lines.push(`${indent}            res.addAll(p`);
      lines.push(`${indent}                    .pointsOnEach { rel -> rel.add(it) }`);
      lines.push(`${indent}                    .createWithoutClone()`);
      lines.push(`${indent}            )`);
      lines.push(`${indent}        }`);
      lines.push(`${indent}  res`);
      lines.push(`${indent}}`);
      return lines;
    }
  },
  add_fourier_series: {
    title: '傅里叶级数',
    group: '高级',
    description: '根据项列表生成傅里叶曲线。',
    defaultParams: { count: 360, scale: 1, folded: false },
    supportsTerms: true,
    fields: [
      numberField('count', '点数', { step: 1, min: 2 }),
      numberField('scale', '缩放', { step: 0.1, min: 0.1 })
    ],
    apply(ctx, node) {
      ctx.points.push(...buildFourierSeries(node.terms || [], Math.max(2, int(node.params.count, 360)), num(node.params.scale, 1)));
    },
    kotlin(node, emitCtx, indent) {
      const lines = [];
      lines.push(`${indent}.addFourierSeries(`);
      lines.push(`${indent}  FourierSeriesBuilder()`);
      lines.push(`${indent}    .count(${Math.max(2, int(node.params.count, 360))})`);
      lines.push(`${indent}    .scale(${fmt(num(node.params.scale, 1))})`);
      (node.terms || []).forEach((term) => {
        lines.push(`${indent}    .addFourier(${fmt(num(term.r, 1))}, ${fmt(num(term.w, 1))}, ${fmt(num(term.startAngle, 0))})`);
      });
      lines.push(`${indent}  )`);
      return lines;
    }
  },
  clear: {
    title: '清空',
    group: '高级',
    description: '清空当前累计点集。',
    defaultParams: {},
    fields: [],
    apply(ctx) {
      ctx.points = [];
    },
    kotlin() {
      return '.clear()';
    }
  }
};

export const POINTS_NODE_KIND_OPTIONS = Object.entries(POINTS_NODE_KINDS)
  .filter(([, item]) => item.hidden !== true)
  .map(([value, item]) => ({
    value,
    label: `${item.group} / ${item.title}`
  }));

export function getNodeKindDefinition(kind) {
  return POINTS_NODE_KINDS[kind] || null;
}

export function getNodeField(kind, key) {
  return (POINTS_NODE_KINDS[kind]?.fields || []).find((field) => field.key === key) || null;
}
