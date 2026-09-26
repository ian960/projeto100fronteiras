import express from "express";
import cors from "cors";

import { buildRouter } from "./routes/routes";
import { env } from "./config/env";

export function createApp() {
    const app = express();

    app.use(express.json());

  //  app.use(cors({
   //     origin: env.SITE_URL,
   //     credentials: true
   // }));
   app.use(cors())

    app.use("/api", buildRouter());

    return app;
}