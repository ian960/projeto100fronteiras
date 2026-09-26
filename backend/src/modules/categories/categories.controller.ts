import { created, noContent, ok } from "@/shared/http/response";
import { categoriesService } from "./categories.service"
import { Request, Response } from "express";
import { categoryIdParamSchema, categorySlugParamSchema, createCategorySchema, updateCategorySchema } from "./categories.schemas";

export class CategoriesController {

    listPublic = async (_req: Request, res: Response) => {
        const categories = await categoriesService.listActive();
        return ok(res, { categories });
    };

    getBySlug = async (req: Request, res: Response) => {
        const parsed = categorySlugParamSchema.parse({ params: req.params});
        const slug = req.params
        const category = await categoriesService.getBySlug(parsed.params.slug);
        return ok(res, { category });
    };

    list = async (_req: Request, res: Response) => {
        const categories = await categoriesService.listAll();
        return ok(res, { categories });

    };

    getById = async (req: Request, res: Response) => {
        const parsed = categoryIdParamSchema.parse({ param: req.params});
        const category = await categoriesService.getById(parsed.params.id);
        return ok(res, { category})
    };

    create = async (req: Request, res: Response) => {
        const parsed = createCategorySchema.parse({ body: req.body });
        const category = await categoriesService.create(parsed.body);
        return created(res, { category });
    };

    update = async (req: Request, res: Response) => {
        const parsed = updateCategorySchema.parse({ params: req.params, body: req.body });
        const category = await categoriesService.update(parsed.params.id, parsed.body);
        return ok(res, { category });
    };
    remove = async (req: Request, res: Response) => {
        const parsed = categoryIdParamSchema.parse({ params: req.params});
        await categoriesService.remove(parsed.params.id);
        return noContent(res);
    };


}

export const categoriesController = new CategoriesController();