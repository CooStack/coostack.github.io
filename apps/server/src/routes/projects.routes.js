import { Router } from 'express';
import { deleteProject, getProject, listProjects, recentProjects, saveProject } from '../services/project.service.js';

const router = Router();

router.get('/', async (request, response, next) => {
  try {
    const items = await listProjects({ tool: request.query.tool, q: request.query.q });
    response.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get('/recent/list', async (_request, response, next) => {
  try {
    const items = await recentProjects();
    response.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get('/:tool/:id', async (request, response, next) => {
  try {
    const item = await getProject(request.params.tool, request.params.id);
    if (!item) {
      response.status(404).json({ message: '项目不存在' });
      return;
    }
    response.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/save', async (request, response, next) => {
  try {
    const item = await saveProject(request.body || {});
    response.json(item);
  } catch (error) {
    next(error);
  }
});

router.delete('/:tool/:id', async (request, response, next) => {
  try {
    const result = await deleteProject(request.params.tool, request.params.id);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
