import cors from 'cors';
import express from 'express';
import apiRoutes from './routes/index.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', apiRoutes);
  app.use((error, _request, response, _next) => {
    response.status(500).json({
      message: error?.message || '服务器内部错误'
    });
  });
  return app;
}
