export const TOOLS = [
  {
    id: 'index',
    title: '工具首页',
    description: '统一入口，展示所有重写后的 Vue 工具。',
    route: '/'
  },
  {
    id: 'pointsbuilder',
    title: 'PointsBuilder',
    description: '粒子点构建器，支持节点式编辑、预览、Kotlin 生成。',
    route: '/pointsbuilder'
  },
  {
    id: 'composition',
    title: 'Composition Builder',
    description: '运动图形卡片编排器，支持组合动画和 Builder 绑定。',
    route: '/composition'
  },
  {
    id: 'composition-pointsbuilder',
    title: 'Composition PointsBuilder',
    description: '给 composition 使用的独立 builder 工作区。',
    route: '/composition-pointsbuilder'
  },
  {
    id: 'shader-builder',
    title: 'Shader Builder',
    description: '模型着色器 + 后处理节点编辑器。',
    route: '/shader-builder'
  },
  {
    id: 'generator',
    title: 'Generator',
    description: '粒子脚本参数生成器。',
    route: '/generator'
  },
  {
    id: 'bezier',
    title: 'Bezier Tool',
    description: '曲线工具，给缩放和时间轴做插值。',
    route: '/bezier'
  }
];

export const TEMPLATES = {
  pointsbuilder: [
    { id: 'ring', name: '环形点阵', payload: { nodes: [{ kind: 'circle', radius: 3, count: 24 }] } },
    { id: 'spiral', name: '螺旋光轨', payload: { nodes: [{ kind: 'spiral', radius: 3, height: 6, turns: 4, count: 80 }] } }
  ],
  composition: [
    { id: 'burst', name: '爆发动画', payload: { cards: [{ name: 'Burst', bindMode: 'point', point: { x: 0, y: 0, z: 0 } }] } },
    { id: 'orbital', name: '轨道组合', payload: { cards: [{ name: 'Orbit', bindMode: 'builder' }] } }
  ],
  'shader-builder': [
    { id: 'flat-color', name: '纯色模型', payload: { model: { primitive: 'sphere' } } },
    { id: 'blur-stack', name: '双通道后处理', payload: { post: { nodeNames: ['Bloom', 'ToneMap'] } } }
  ],
  generator: [
    { id: 'pulse', name: '脉冲发射', payload: { count: 24, speed: 0.3, spread: 0.25 } }
  ],
  bezier: [
    { id: 'ease-out', name: 'Ease Out', payload: { p1: { x: 0.2, y: 0.8 }, p2: { x: 0.3, y: 1 } } }
  ]
};

export function listTools() {
  return TOOLS;
}

export function listTemplates(tool) {
  return TEMPLATES[tool] || [];
}
