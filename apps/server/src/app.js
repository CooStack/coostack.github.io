import fs from 'node:fs';
import cors from 'cors';
import express from 'express';
import { WEB_DIST_ROOT, WEB_INDEX_FILE } from './config/paths.js';
import apiRoutes from './routes/index.js';

function canServeWebApp() {
  return fs.existsSync(WEB_INDEX_FILE);
}

export function createApp() {
  const app = express();
  const servesWebApp = canServeWebApp();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', apiRoutes);

  if (servesWebApp) {
    app.use(express.static(WEB_DIST_ROOT));
    app.get('*', (request, response, next) => {
      if (request.path === '/api' || request.path.startsWith('/api/')) {
        next();
        return;
      }
      response.sendFile(WEB_INDEX_FILE);
    });
  } else {
    app.get('/', (_request, response) => {
      response.status(503).json({
        message: '前端尚未构建，请先执行 npm run build:web。'
      });
    });
  }

  app.use((error, _request, response, _next) => {
    response.status(500).json({
      message: error?.message || '服务器内部错误'
    });
  });

  return app;
}
