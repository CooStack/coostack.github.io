<template>
  <div class="legacy-page-host">
    <iframe class="legacy-page-frame" :src="src" :title="title"></iframe>
  </div>
</template>

<script setup>
import { computed } from 'vue';
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

function routeHref(name) {
  return router.resolve({ name }).href;
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
