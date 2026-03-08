import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import { deploymentProfile } from '../config/deployment.js';
import HomePage from '../pages/HomePage.vue';
import PointsBuilderPage from '../pages/PointsBuilderPage.vue';
import CompositionBuilderPage from '../pages/CompositionBuilderPage.vue';
import CompositionPointsBuilderPage from '../pages/CompositionPointsBuilderPage.vue';
import ShaderBuilderPage from '../pages/ShaderBuilderPage.vue';
import GeneratorPage from '../pages/GeneratorPage.vue';
import BezierToolPage from '../pages/BezierToolPage.vue';

const routes = [
  { path: '/', name: 'home', component: HomePage, meta: { title: '个人主页 · 粒子导航', fullBleed: true } },
  { path: '/pointsbuilder', name: 'pointsbuilder', component: PointsBuilderPage, meta: { title: '粒子样式生成器', fullBleed: true } },
  { path: '/composition', name: 'composition', component: CompositionBuilderPage, meta: { title: 'Composition 构建器', fullBleed: true } },
  { path: '/composition-pointsbuilder', name: 'composition-pointsbuilder', component: CompositionPointsBuilderPage, meta: { title: 'Composition 专用 PointsBuilder', fullBleed: true } },
  { path: '/shader-builder', name: 'shader-builder', component: ShaderBuilderPage, meta: { title: 'RendererAPI 着色器构建器', fullBleed: true } },
  { path: '/generator', name: 'generator', component: GeneratorPage, meta: { title: '粒子发射器可视化', fullBleed: true } },
  { path: '/bezier', name: 'bezier', component: BezierToolPage, meta: { title: 'Bezier 工具', fullBleed: true } }
];

const history = deploymentProfile.usesHashRouter
  ? createWebHashHistory(deploymentProfile.appBase)
  : createWebHistory(deploymentProfile.appBase);

const router = createRouter({
  history,
  routes
});

router.afterEach((to) => {
  if (typeof document !== 'undefined') {
    document.title = to.meta?.title || '个人主页 · 粒子导航';
  }
});

export default router;
