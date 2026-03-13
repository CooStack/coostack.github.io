<template>
  <div class="legacy-page-host">
    <iframe :key="frameKey" class="legacy-page-frame" :src="src" :title="title"></iframe>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { deploymentProfile } from '../config/deployment.js';

const props = defineProps({
  page: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  }
});

const route = useRoute();
const router = useRouter();
const frameNonce = ref(0);

function routeHref(name) {
  const href = router.resolve({ name }).href;
  if (href.startsWith('#')) {
    return `${deploymentProfile.appBase}${href}`;
  }
  return href;
}

const src = computed(() => {
  const params = new URLSearchParams();
  Object.entries(route.query || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
      return;
    }
    if (value == null) return;
    params.set(key, String(value));
  });
  params.set('spa_home', routeHref('home'));
  params.set('spa_generator', routeHref('generator'));
  params.set('spa_shader_builder', routeHref('shader-builder'));
  params.set('spa_composition', routeHref('composition'));
  params.set('spa_pointsbuilder', routeHref('pointsbuilder'));
  params.set('spa_composition_pointsbuilder', routeHref('composition-pointsbuilder'));
  params.set('spa_bezier', routeHref('bezier'));
  const search = params.toString();
  return `${deploymentProfile.appBase}legacy/${props.page}${search ? `?${search}` : ''}`;
});

const frameKey = computed(() => `${props.page}:${frameNonce.value}:${src.value}`);

const messageRouteMap = Object.freeze({
  'cpb-builder-return': 'composition',
  'egpb-builder-return': 'generator'
});

function handleLegacyMessage(event) {
  const type = String(event?.data?.type || '').trim();
  const targetName = messageRouteMap[type];
  if (!targetName) return;
  if (route.name === targetName) {
    frameNonce.value += 1;
    return;
  }
  router.push({ name: targetName });
}

onMounted(() => {
  window.addEventListener('message', handleLegacyMessage);
});

onBeforeUnmount(() => {
  window.removeEventListener('message', handleLegacyMessage);
});
</script>

<style scoped>
.legacy-page-host {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  height: 100vh;
  overflow: hidden;
  padding: clamp(8px, 1.1vw, 16px);
  background:
    radial-gradient(1280px 780px at 10% -10%, rgba(143, 167, 184, 0.14), transparent 50%),
    radial-gradient(980px 720px at 88% 0%, rgba(180, 147, 99, 0.12), transparent 56%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 26%),
    #0d1116;
  isolation: isolate;
}

.legacy-page-host::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    linear-gradient(125deg, rgba(255, 255, 255, 0.045), transparent 30%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.015) 0 1px, transparent 1px 60px);
  opacity: 0.14;
}

.legacy-page-frame {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  border: 1px solid rgba(166, 175, 186, 0.18);
  border-radius: 28px;
  background: transparent;
  box-shadow:
    0 24px 80px rgba(2, 6, 23, 0.46),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

@media (max-width: 768px) {
  .legacy-page-host {
    padding: 8px;
  }

  .legacy-page-frame {
    border-radius: 20px;
  }
}
</style>
