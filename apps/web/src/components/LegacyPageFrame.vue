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
  width: 100%;
  min-height: 100vh;
  height: 100vh;
  overflow: hidden;
  background: #0e1218;
}

.legacy-page-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
}
</style>
