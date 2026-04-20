// Tiny logger — writes to console and optionally appends to a file. Usable
// from both main and renderer; file logging only engages in the main process
// (renderer call becomes a no-op because `fs` is not available).

type Level = 'info' | 'warn' | 'error' | 'debug'

let fileWriter: ((line: string) => void) | null = null

export function configureFileLogger(writer: (line: string) => void): void {
  fileWriter = writer
}

function log(level: Level, ...args: unknown[]): void {
  const ts = new Date().toISOString()
  const prefix = `[${ts}] [${level.toUpperCase()}]`
  if (level === 'error') console.error(prefix, ...args)
  else if (level === 'warn') console.warn(prefix, ...args)
  else if (level === 'debug') console.debug(prefix, ...args)
  else console.log(prefix, ...args)

  if (fileWriter) {
    try {
      const msg = args
        .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
        .join(' ')
      fileWriter(`${prefix} ${msg}\n`)
    } catch {
      // swallow — don't let logging break the app
    }
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export const logger = {
  info: (...a: unknown[]) => log('info', ...a),
  warn: (...a: unknown[]) => log('warn', ...a),
  error: (...a: unknown[]) => log('error', ...a),
  debug: (...a: unknown[]) => log('debug', ...a)
}
