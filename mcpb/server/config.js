import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DEFAULT_SERVER_URL = "https://app.laxis.tech/mcp";
export const DEFAULT_CLIENT_ID = "laxis-mcp";
// Must stay in sync with the ports registered on the Authorization Server for
// the `laxis-mcp` public client (laxis.oauth.seed-client-redirect-uris in api).
export const DEFAULT_OAUTH_PORTS = [33418, 33419, 33420];
export const CALLBACK_PATH = "/oauth/callback";

export const VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

/**
 * A user_config value that Claude Desktop leaves unset can surface as an empty
 * string or as the raw, unsubstituted template — treat both as absent.
 */
function cleanUserValue(value) {
  const v = (value ?? "").trim();
  if (!v || v.startsWith("${")) return undefined;
  return v;
}

export function loadConfig(env = process.env) {
  const serverUrl = cleanUserValue(env.LAXIS_MCP_URL) ?? DEFAULT_SERVER_URL;

  const ports = (cleanUserValue(env.LAXIS_OAUTH_PORTS) ?? DEFAULT_OAUTH_PORTS.join(","))
    .split(",")
    .map(p => Number.parseInt(p.trim(), 10))
    .filter(p => Number.isInteger(p) && p >= 0 && p <= 65535);

  return {
    serverUrl,
    apiKey: cleanUserValue(env.LAXIS_API_KEY),
    clientId: cleanUserValue(env.LAXIS_OAUTH_CLIENT_ID) ?? DEFAULT_CLIENT_ID,
    scope: cleanUserValue(env.LAXIS_OAUTH_SCOPE) ?? "meetings:read",
    oauthPorts: ports.length > 0 ? ports : DEFAULT_OAUTH_PORTS,
    authDir: cleanUserValue(env.LAXIS_AUTH_DIR) ?? path.join(os.homedir(), ".laxis", "mcp"),
    authTimeoutMs: Number.parseInt(cleanUserValue(env.LAXIS_AUTH_TIMEOUT_MS) ?? "300000", 10),
    logLevel: cleanUserValue(env.LAXIS_LOG_LEVEL) ?? "info",
    // Escape hatches for tests and unusual desktop setups: write the
    // authorization URL to a file instead of opening a browser, or open it
    // with a custom command.
    authUrlFile: cleanUserValue(env.LAXIS_AUTH_URL_FILE),
    browserCommand: cleanUserValue(env.LAXIS_BROWSER_COMMAND),
  };
}
