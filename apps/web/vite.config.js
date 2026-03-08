import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

function normalizeBase(rawBase = '/') {
  const text = String(rawBase || '/').trim();
  if (!text || text === '/') return '/';
  const withLeading = text.startsWith('/') ? text : `/${text}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const deployTarget = String(env.VITE_DEPLOY_TARGET || 'local').trim();
  const defaultBase = deployTarget === 'github-pages' && env.GITHUB_REPOSITORY
    ? `/${env.GITHUB_REPOSITORY.split('/')[1] || ''}/`
    : '/';

  return {
    base: normalizeBase(env.VITE_APP_BASE || defaultBase),
    plugins: [vue()],
    server: {
      host: '0.0.0.0',
      port: 5173
    }
  };
});
