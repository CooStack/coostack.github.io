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
  --mc-frame-line: #56313e;
  --mc-frame-shadow: #3a2330;
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  height: 100vh;
  overflow: hidden;
  padding: clamp(8px, 1.1vw, 16px);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.2), transparent 34%),
    url('../assets/textures/skybox.svg'),
    linear-gradient(180deg, #83c8f2 0%, #bfe6fb 54%, #f7dbe1 100%);
  background-repeat: no-repeat;
  background-size: auto, cover, auto;
  image-rendering: pixelated;
  isolation: isolate;
}

.legacy-page-host::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, transparent 0 68%, rgba(239, 158, 190, 0.16) 68% 100%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0 8px, transparent 8px 16px);
  opacity: 0.34;
}

.legacy-page-frame {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  border: 4px solid var(--mc-frame-line);
  border-radius: 0;
  background:
    url('../assets/textures/sakura-planks.svg'),
    #8d5361;
  background-size: 48px 48px, auto;
  box-shadow: 0 6px 0 var(--mc-frame-shadow), 0 16px 28px rgba(69, 38, 49, 0.34);
}

@media (max-width: 768px) {
  .legacy-page-host {
    padding: 8px;
  }

  .legacy-page-frame {
    border-radius: 0;
  }
}
</style>
