import { Router } from 'express';
import { buildKotlinExport } from '../services/export.service.js';

const router = Router();

router.post('/kotlin', (request, response) => {
  const item = buildKotlinExport(request.body || {});
  response.json(item);
});

export default router;
