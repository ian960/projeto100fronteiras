import { Router } from "express";
import { categoriesController } from "./categories.controller";

export function categoriesPublicRouter(): Router {
    const router = Router();
    router.get('/', categoriesController.listPublic);
    router.get('/:slug', categoriesController.getBySlug);

    return router;

}


export function categoriesAdminRouter(): Router {
    const router = Router();

  //  router.use(authenticate, authorize(Role.ADMIN));

    router.get('/', categoriesController.list);
    router.get('/:id', categoriesController.getById);
    router.post('/', categoriesController.create);
    router.patch('/:id', categoriesController.update);
    router.delete('/:id', categoriesController.remove);

    return router;
}