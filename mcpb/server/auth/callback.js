import { randomBytes } from "node:crypto";
import http from "node:http";

import { CALLBACK_PATH } from "../config.js";

export class AuthTimeoutError extends Error {
  constructor() {
    super("Timed out waiting for the Laxis sign-in to complete");
  }
}

export class AuthDeclinedError extends Error {
  constructor(detail) {
    super(`Laxis sign-in was not completed${detail ? `: ${detail}` : ""}`);
  }
}

function page({ title, body, ok }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; display: flex; min-height: 100vh;
         align-items: center; justify-content: center; margin: 0; background: Canvas; color: CanvasText; }
  main { text-align: center; padding: 2.5rem 3rem; max-width: 26rem; }
  .badge { width: 3.5rem; height: 3.5rem; border-radius: 1rem; margin: 0 auto 1.25rem;
           display: flex; align-items: center; justify-content: center; font-size: 1.75rem;
           background: ${ok ? "#22c55e" : "#ef4444"}; color: #fff; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  p { margin: .25rem 0; opacity: .75; line-height: 1.5; }
</style></head>
<body><main>
  <div class="badge">${ok ? "✓" : "✕"}</div>
  <h1>${title}</h1>
  ${body}
</main>
<script>setTimeout(() => window.close(), 1500)</script>
</body></html>`;
}

const SUCCESS_PAGE = page({
  ok: true,
  title: "Connected to Laxis",
  body: "<p>Claude now has access to your Laxis meetings.</p><p>You can close this tab and return to Claude.</p>",
});

const stalePage = () =>
  page({
    ok: false,
    title: "This sign-in link is no longer valid",
    body: "<p>Return to Claude and try again — a fresh sign-in window will open.</p>",
  });

const declinedPage = detail =>
  page({
    ok: false,
    title: "Sign-in was not completed",
    body: `<p>${detail || "The authorization request was declined."}</p><p>Return to Claude and try again when you're ready.</p>`,
  });

/**
 * Loopback redirect target for the OAuth authorization-code flow.
 *
 * Binds 127.0.0.1 on the first free port from `ports` at startup and holds it
 * for the process lifetime, so the redirect URL is known synchronously whenever
 * the SDK builds an authorization URL. The port list must match the redirect
 * URIs registered for the `laxis-mcp` public client on the Authorization
 * Server — a port the AS doesn't know about would fail redirect validation.
 *
 * Only the most recently issued `state` is accepted (single pending flow), and
 * a callback that arrives before anyone awaits it is buffered.
 */
export class CallbackServer {
  #server;
  #activeState;
  #completed; // { code } | { error: Error }
  #waiter; // { resolve, reject, timer }

  constructor({ ports, log }) {
    this.ports = ports;
    this.log = log;
    this.port = undefined;
  }

  async start() {
    let lastError;
    for (const port of this.ports) {
      try {
        this.#server = await this.#listen(port);
        this.port = this.#server.address().port;
        this.log.debug(`OAuth callback listening on ${this.redirectUrl}`);
        return;
      } catch (err) {
        lastError = err;
        this.log.debug(`Port ${port} unavailable (${err.code ?? err.message}), trying next`);
      }
    }
    throw new Error(
      `Could not bind an OAuth callback port (tried ${this.ports.join(", ")}): ${lastError?.message}. ` +
        "Another Laxis MCP instance may be running.",
    );
  }

  get redirectUrl() {
    return `http://127.0.0.1:${this.port}${CALLBACK_PATH}`;
  }

  /** Issues the state for a new authorization flow, superseding any previous one. */
  newState() {
    this.#activeState = randomBytes(16).toString("hex");
    this.#completed = undefined;
    return this.#activeState;
  }

  /** Resolves with `{ code }` once the browser redirect lands, or rejects on timeout/decline. */
  waitForCallback(timeoutMs) {
    if (this.#completed) {
      const done = this.#completed;
      this.#completed = undefined;
      return done.error ? Promise.reject(done.error) : Promise.resolve(done);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiter = undefined;
        reject(new AuthTimeoutError());
      }, timeoutMs);
      timer.unref?.();
      this.#waiter = { resolve, reject, timer };
    });
  }

  close() {
    this.#server?.close();
    this.#server = undefined;
  }

  #deliver(result) {
    this.#activeState = undefined;
    if (this.#waiter) {
      clearTimeout(this.#waiter.timer);
      const { resolve, reject } = this.#waiter;
      this.#waiter = undefined;
      result.error ? reject(result.error) : resolve(result);
    } else {
      this.#completed = result;
    }
  }

  #listen(port) {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.#handle(req, res));
      server.on("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.removeListener("error", reject);
        server.unref();
        resolve(server);
      });
    });
  }

  #handle(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${this.port}`);
    if (req.method !== "GET" || url.pathname !== CALLBACK_PATH) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }

    const respond = (status, html) => res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" }).end(html);

    const state = url.searchParams.get("state");
    if (!this.#activeState || state !== this.#activeState) {
      this.log.warn("OAuth callback with unknown state — ignoring");
      respond(400, stalePage());
      return;
    }

    const error = url.searchParams.get("error");
    if (error) {
      const detail = url.searchParams.get("error_description") ?? error;
      this.log.warn(`Authorization declined: ${detail}`);
      respond(200, declinedPage(detail));
      this.#deliver({ error: new AuthDeclinedError(detail) });
      return;
    }

    const code = url.searchParams.get("code");
    if (!code) {
      respond(400, stalePage());
      return;
    }
    respond(200, SUCCESS_PAGE);
    this.#deliver({ code });
  }
}
