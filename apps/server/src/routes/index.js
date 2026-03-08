import { Router } from 'express';
import healthRoutes from './health.routes.js';
import catalogRoutes from './catalog.routes.js';
import projectsRoutes from './projects.routes.js';
import exportRoutes from './export.routes.js';
import socialRoutes from './social.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/catalog', catalogRoutes);
router.use('/projects', projectsRoutes);
router.use('/export', exportRoutes);
router.use('/social', socialRoutes);

export default router;
