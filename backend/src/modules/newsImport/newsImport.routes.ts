import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { Role } from '../../shared/types/enums';
import { newsImportController } from './newsImport.controller';

// Admin only: the panel page "Importar notícias" and the editor's
// "Foto da fonte" box.
export function newsImportAdminRouter(): Router {
  const router = Router();

  // Mounted on the router, so a route added below is protected by default.
  router.use(authenticate, authorize(Role.ADMIN));

  router.get('/sources', newsImportController.listSources);
  router.post('/sources', newsImportController.createSource);
  router.patch('/sources/:id', newsImportController.updateSource);
  router.delete('/sources/:id', newsImportController.removeSource);
  router.post('/sources/:id/run', newsImportController.runSource);
  router.post('/run', newsImportController.runAll);
  router.get('/items', newsImportController.recentItems);
  router.get('/posts/:postId', newsImportController.originOfPost);

  return router;
}
