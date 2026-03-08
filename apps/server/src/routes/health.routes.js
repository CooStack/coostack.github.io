import { Router } from 'express';

const router = Router();

router.get('/', (_request, response) => {
  response.json({ ok: true, service: 'blogs-server', time: new Date().toISOString() });
});

export default router;
