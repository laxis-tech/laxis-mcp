#!/usr/bin/env node
/**
 * Laxis MCP bridge for Claude Desktop (MCP Bundle entry point).
 *
 * A thin stdio ⇄ Streamable HTTP proxy in front of the hosted Laxis MCP server.
 * Two credential modes:
 *  - OAuth (default): "Sign in with Laxis" in the browser via the pre-registered
 *    `laxis-mcp` public PKCE client; tokens persist under ~/.laxis/mcp.
 *  - API key: set LAXIS_API_KEY (the optional user_config field) to skip OAuth
 *    and send `Authorization: Bearer laxis_…` directly.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { CallbackServer } from "./auth/callback.js";
import { createBrowser } from "./auth/browser.js";
import { LaxisOAuthProvider, probeOAuthSupport } from "./auth/provider.js";
import { TokenStorage } from "./auth/storage.js";
import { Upstream, wireBridge } from "./bridge.js";
import { VERSION, loadConfig } from "./config.js";
import { createLogger } from "./log.js";

async function main() {
  const config = loadConfig(process.env);
  const log = createLogger(config.logLevel);
  const mode = config.apiKey ? "api-key" : "oauth";
  log.info(`Laxis MCP bridge v${VERSION} → ${config.serverUrl} (${mode} mode)`);

  let callbackServer;
  let authProvider;
  if (!config.apiKey) {
    callbackServer = new CallbackServer({ ports: config.oauthPorts, log });
    await callbackServer.start();
    authProvider = new LaxisOAuthProvider({
      serverUrl: config.serverUrl,
      clientId: config.clientId,
      scope: config.scope,
      storage: new TokenStorage(config.authDir, config.serverUrl),
      callbackServer,
      browser: createBrowser({ authUrlFile: config.authUrlFile, browserCommand: config.browserCommand, log }),
      oauthSupport: probeOAuthSupport(config.serverUrl, log),
      log,
    });
  }

  const upstream = new Upstream({
    url: config.serverUrl,
    apiKey: config.apiKey,
    authProvider,
    callbackServer,
    authTimeoutMs: config.authTimeoutMs,
    log,
  });
  const local = new StdioServerTransport();

  let exiting = false;
  const shutdown = async (reason, code) => {
    if (exiting) return;
    exiting = true;
    log.info(`Shutting down (${reason})`);
    callbackServer?.close();
    await upstream.close();
    await local.close().catch(() => {});
    process.exit(code);
  };

  wireBridge({ local, upstream, log, config, onFatal: reason => void shutdown(reason, 1) });
  local.onclose = () => void shutdown("client disconnected", 0);
  process.on("SIGINT", () => void shutdown("SIGINT", 0));
  process.on("SIGTERM", () => void shutdown("SIGTERM", 0));

  await upstream.start();
  await local.start();
  log.debug("Bridge ready — waiting for client messages");
}

main().catch(err => {
  process.stderr.write(`[laxis-mcp] fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
