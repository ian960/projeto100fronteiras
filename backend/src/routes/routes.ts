import { categoriesPublicRouter } from "@/modules/categories/categories.routes";
import { Router } from "express";

export function buildRouter(): Router {
    const router = Router();

    router.use("/categories", categoriesPublicRouter());

    return router;
}