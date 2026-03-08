import { Router } from 'express';
import { fetchBilibiliStat } from '../services/social.service.js';

const router = Router();

router.get('/bilibili/stat', async (_request, response, next) => {
  try {
    const stat = await fetchBilibiliStat();
    response.json(stat);
  } catch (error) {
    next(error);
  }
});

export default router;
