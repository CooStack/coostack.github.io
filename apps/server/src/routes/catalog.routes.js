import { Router } from 'express';
import { listTemplates, listTools } from '../services/catalog.service.js';

const router = Router();

router.get('/tools', (_request, response) => {
  response.json({ items: listTools() });
});

router.get('/templates', (request, response) => {
  response.json({ items: listTemplates(request.query.tool) });
});

export default router;
