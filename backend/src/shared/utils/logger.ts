
type Level = 'info'  | 'warn' | 'error';

function write(level: Level, message: string, meta?: unknown) {

    const entry = {
        level,
        time: new Date().toISOString(),
        message,

        ...(meta != undefined ? { meta: serialize(meta)}: {}),
        }

        const line = JSON.stringify(entry)
        if (level === 'error') console.error(line);
        else console.log(line);

}

function serialize(meta: unknown) {

    if (meta instanceof Error){
        return{name: meta.name, message: meta.message, stack: meta.stack}
    }
    return meta
        
}

export const logger = {
    info: (message: string, meta?: unknown) => write('info', message, meta),
    warn: (message: string, meta?: unknown) => write('warn', message, meta),
    error: (message: string, meta?: unknown) => write('error', message, meta)
}