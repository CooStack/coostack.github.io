import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import './assets/styles/base.css';
import './assets/styles/theme.css';
import './assets/styles/layout.css';
import './assets/styles/minecraft.css';

createApp(App).use(router).mount('#app');
