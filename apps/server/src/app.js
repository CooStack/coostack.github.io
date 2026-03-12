import fs from 'node:fs';
import cors from 'cors';
import express from 'express';
import { WEB_DIST_ROOT, WEB_INDEX_FILE } from './config/paths.js';
import apiRoutes from './routes/index.js';

const WEB_BUILD_MISSING_MESSAGE = '前端尚未构建，请先执行 npm run build:web。';

function canServeWebApp() {
  return fs.existsSync(WEB_INDEX_FILE);
}

export function createApp() {
  const app = express();
  const serveWebStatic = express.static(WEB_DIST_ROOT);

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', apiRoutes);
  app.use((request, response, next) => {
    if (!canServeWebApp()) {
      next();
      return;
    }
    serveWebStatic(request, response, next);
  });
  app.get('*', (request, response, next) => {
    if (request.path === '/api' || request.path.startsWith('/api/')) {
      next();
      return;
    }
    if (!canServeWebApp()) {
      response.status(503).json({
        message: WEB_BUILD_MISSING_MESSAGE
      });
      return;
    }
    response.sendFile(WEB_INDEX_FILE, (error) => {
      if (!error) {
        return;
      }
      if (error.code === 'ENOENT' && !response.headersSent) {
        response.status(503).json({
          message: WEB_BUILD_MISSING_MESSAGE
        });
        return;
      }
      next(error);
    });
  });

  app.use((error, _request, response, _next) => {
    response.status(500).json({
      message: error?.message || '服务器内部错误'
    });
  });

  return app;
}
