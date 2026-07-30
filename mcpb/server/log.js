/**
 * Stderr-only logger. stdout is the MCP stdio channel and must never receive
 * anything that is not a JSON-RPC message.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(level = "info") {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const write = (name, args) => {
    if (LEVELS[name] < threshold) return;
    const text = args
      .map(a => (typeof a === "string" ? a : a instanceof Error ? (a.stack ?? a.message) : JSON.stringify(a)))
      .join(" ");
    process.stderr.write(`[laxis-mcp] ${new Date().toISOString()} ${name.toUpperCase()} ${text}\n`);
  };

  return {
    debug: (...args) => write("debug", args),
    info: (...args) => write("info", args),
    warn: (...args) => write("warn", args),
    error: (...args) => write("error", args),
  };
}
