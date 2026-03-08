<template>
  <div class="app-shell" :class="shellClasses">
    <main class="app-shell-main" :class="mainClasses">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const embedded = computed(() => String(route.query.embedded || '') === '1');
const fullBleed = computed(() => route.meta?.fullBleed === true);

const shellClasses = computed(() => ({
  'app-shell--embedded': embedded.value,
  'app-shell--fullbleed': fullBleed.value
}));

const mainClasses = computed(() => ({
  'app-shell-main--embedded': embedded.value,
  'app-shell-main--fullbleed': fullBleed.value
}));
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-shell-main {
  min-height: 100vh;
}

.app-shell--fullbleed {
  padding: 0;
}

.app-shell-main--fullbleed {
  min-height: 100vh;
}

.app-shell--embedded,
.app-shell-main--embedded {
  min-height: 100%;
}
</style>
