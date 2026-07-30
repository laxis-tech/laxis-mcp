import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { AuthDeclinedError, AuthTimeoutError } from "./auth/callback.js";
import { NoOAuthSupportError } from "./auth/provider.js";
import { VERSION } from "./config.js";

const KEY_HELP =
  "Generate a key at app.laxis.tech → Settings → Claude (MCP) and update it in " +
  "Claude Desktop → Settings → Extensions → Laxis.";

/**
 * fetch wrapper that deduplicates concurrent refresh-token requests.
 *
 * The Authorization Server rotates refresh tokens (single use). The SDK can
 * trigger two refreshes at once — the serialized POST queue and the SSE GET
 * stream each react to a 401 — and the loser of that race would burn the
 * grant and force an interactive sign-in. Keying in-flight token POSTs by
 * their exact form body lets both callers share one response.
 */
export function createDedupingFetch(log) {
  const inflight = new Map();
  return async (url, init) => {
    const body = init?.body === undefined ? "" : String(init.body);
    if (init?.method !== "POST" || !body.includes("grant_type=refresh_token")) {
      return fetch(url, init);
    }
    const key = `${url}|${body}`;
    if (!inflight.has(key)) {
      const request = fetch(url, init);
      inflight.set(key, request);
      request
        .catch(() => {})
        .finally(() => {
          // Keep the entry briefly so near-simultaneous callers coalesce, then
          // drop it so later retries hit the network again.
          setTimeout(() => inflight.delete(key), 5000).unref?.();
        });
    } else {
      log.debug("Coalescing concurrent refresh-token request");
    }
    const response = await inflight.get(key);
    // Each caller gets a clone so the shared body is never consumed twice.
    return response.clone();
  };
}

/**
 * Connection to the hosted Laxis MCP server over Streamable HTTP.
 *
 * Sends are serialized: MCP allows concurrent requests, but issuing the POSTs
 * one at a time (the response bodies still stream concurrently) means an
 * expired access token triggers exactly one refresh instead of racing several
 * refresh calls into the Authorization Server's single-use rotating refresh
 * tokens — losing that race revokes the grant and forces a needless sign-in.
 */
export class Upstream {
  #queue = Promise.resolve();
  #interactiveAuth = null;

  /**
   * @param {object} opts
   * @param {string} opts.url
   * @param {string} [opts.apiKey] personal API key — set for api-key mode, absent for OAuth mode
   * @param {import("@modelcontextprotocol/sdk/client/auth.js").OAuthClientProvider} [opts.authProvider]
   * @param {import("./auth/callback.js").CallbackServer} [opts.callbackServer]
   * @param {number} opts.authTimeoutMs
   * @param {ReturnType<import("./log.js").createLogger>} opts.log
   */
  constructor({ url, apiKey, authProvider, callbackServer, authTimeoutMs, log }) {
    this.url = url;
    this.apiKey = apiKey;
    this.authProvider = authProvider;
    this.callbackServer = callbackServer;
    this.authTimeoutMs = authTimeoutMs;
    this.log = log;

    const headers = { "X-Laxis-Client": `mcpb/${VERSION}` };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    this.transport = new StreamableHTTPClientTransport(new URL(url), {
      authProvider,
      requestInit: { headers },
      fetch: authProvider ? createDedupingFetch(log) : undefined,
    });
  }

  get onmessage() {
    return this.transport.onmessage;
  }

  set onmessage(handler) {
    this.transport.onmessage = handler;
  }

  set onerror(handler) {
    this.transport.onerror = handler;
  }

  async start() {
    await this.transport.start();
  }

  async close() {
    await this.transport.close().catch(() => {});
  }

  /** Serialized send; returns a promise for this specific message's delivery. */
  send(message) {
    const attempt = this.#queue.then(() => this.#sendWithAuth(message));
    // Keep the queue alive regardless of individual outcomes.
    this.#queue = attempt.then(
      () => {},
      () => {},
    );
    return attempt;
  }

  async #sendWithAuth(message) {
    try {
      await this.transport.send(message);
    } catch (err) {
      // UnauthorizedError means the SDK already ran discovery, found no usable
      // refresh token, and sent the user's browser to the authorization page.
      // Wait for the loopback redirect, exchange the code, then retry once.
      if (err instanceof UnauthorizedError && this.authProvider) {
        await this.#completeInteractiveAuth();
        await this.transport.send(message);
        return;
      }
      throw err;
    }
  }

  #completeInteractiveAuth() {
    this.#interactiveAuth ??= this.#waitAndFinish().finally(() => {
      this.#interactiveAuth = null;
    });
    return this.#interactiveAuth;
  }

  async #waitAndFinish() {
    const { code } = await this.callbackServer.waitForCallback(this.authTimeoutMs);
    await this.transport.finishAuth(code);
    this.log.info("Signed in to Laxis.");
  }
}

/** Human-readable message for an upstream failure, surfaced as a tool/JSON-RPC error. */
export function describeUpstreamError(err, { apiKey, serverUrl }) {
  if (err instanceof NoOAuthSupportError || err instanceof AuthDeclinedError) return err.message;
  if (err instanceof AuthTimeoutError) {
    return `${err.message}. A Laxis sign-in page was opened in your browser — finish signing in there, then ask again.`;
  }
  if (err instanceof UnauthorizedError) {
    return `Laxis sign-in did not complete (${err.message || "authorization required"}). Try again to restart it.`;
  }
  if (err instanceof StreamableHTTPError) {
    if (err.code === 401 || err.code === 403) {
      return apiKey
        ? `Laxis rejected your API key (HTTP ${err.code}) — it may have been regenerated. ${KEY_HELP}`
        : `Laxis rejected the request (HTTP ${err.code}). Try again to re-authorize.`;
    }
    if (err.code === 404) {
      return "The Laxis session expired — the connection will restart; please try again.";
    }
    return `The Laxis server returned an error (HTTP ${err.code}).`;
  }
  if (err instanceof TypeError || ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"].includes(err?.cause?.code)) {
    return `Could not reach Laxis at ${serverUrl} — check your network connection and try again.`;
  }
  return `Unexpected error talking to Laxis: ${err.message}`;
}

/**
 * Wires the local stdio transport (Claude Desktop) to the upstream connection.
 * Pure message piping — tool definitions, pagination, plan gating all live on
 * the hosted server, so this bridge never needs updating when they change.
 */
export function wireBridge({ local, upstream, log, config, onFatal }) {
  local.onmessage = message => {
    upstream.send(message).catch(err => {
      log.error("Upstream send failed:", err);
      // Answer requests with a JSON-RPC error so Claude isn't left waiting;
      // notifications get no reply by design.
      if (message?.id !== undefined && message?.id !== null && message?.method) {
        local
          .send({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32000, message: describeUpstreamError(err, config) },
          })
          .catch(sendErr => log.error("Failed to report error to client:", sendErr));
      }
      // A dead upstream session cannot be revived mid-process (the client only
      // sends `initialize` once) — exit so Claude Desktop restarts us clean.
      if (err instanceof StreamableHTTPError && err.code === 404) {
        onFatal("Upstream session expired");
      }
    });
  };

  upstream.onmessage = message => {
    local.send(message).catch(err => log.error("Failed to forward message to client:", err));
  };

  upstream.onerror = err => log.debug("Upstream transport notice:", err?.message ?? err);
  local.onerror = err => log.error("stdio transport error:", err?.message ?? err);
}
