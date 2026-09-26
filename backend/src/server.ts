import { createApp } from './app';
import { env } from './config/env'
import { logger } from './shared/utils/logger';

const app = createApp();

const server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`)
});

const PORT = env.PORT ?? 3000

app.listen(PORT, () => {
    console.log(` Server Runing on port ${PORT}`)
})