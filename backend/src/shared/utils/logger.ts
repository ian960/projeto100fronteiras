type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string, meta?: unknown) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(meta !== undefined ? { meta } : {}),
  };

  const line = JSON.stringify(entry, errorsAsObjects);
  if (level === 'error') console.error(line);
  else console.log(line);
}

// JSON.stringify turns an Error into {} (its fields are not enumerable), at
// any depth: `logger.error('x', { err })` would log nothing useful.
function errorsAsObjects(_key: string, value: unknown) {
  if (value instanceof Error) {
    const code = (value as { code?: unknown }).code;
    return { name: value.name, message: value.message, ...(code !== undefined ? { code } : {}), stack: value.stack };
  }
  return value;
}

export const logger = {
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};