/**
 * In-process mock of the hosted Laxis stack for bridge tests:
 *  - a real MCP server (SDK McpServer + StreamableHTTPServerTransport, stateful
 *    sessions) behind bearer auth on /mcp;
 *  - optionally, an OAuth Authorization Server (RFC 8414 metadata, /authorize
 *    with PKCE S256, /token with single-use rotating refresh tokens) plus the
 *    RFC 9728 protected-resource metadata the RS advertises.
 *
 * The bridge under test runs as a child process; this mock lives in the test
 * process, so tests mutate auth state (expire/revoke) with direct calls.
 */
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

function sha256base64url(input) {
  return createHash("sha256").update(input).digest("base64url");
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export async function startMockLaxis({ mode, apiKey } = {}) {
  const state = {
    mode, // "oauth" | "apikey"
    apiKey,
    lastHeaders: undefined,
    authorizeRequests: [],
    tokenRequests: [],
    refreshCount: 0,
    unauthorizedHits: 0,
    codes: new Map(), // code -> { challenge, redirectUri, clientId, resource }
    accessTokens: new Set(),
    refreshTokens: new Map(), // token -> { active }
    counter: 0,
  };

  const transports = new Map();

  const issueTokens = () => {
    state.counter += 1;
    const accessToken = `at_${state.counter}`;
    const refreshToken = `rt_${state.counter}`;
    state.accessTokens.add(accessToken);
    state.refreshTokens.set(refreshToken, { active: true });
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 1800,
      refresh_token: refreshToken,
      scope: "meetings:read",
    };
  };

  const json = (res, status, body, headers = {}) =>
    res.writeHead(status, { "Content-Type": "application/json", ...headers }).end(JSON.stringify(body));

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, base());

      if (state.mode === "oauth") {
        if (url.pathname === "/.well-known/oauth-protected-resource/mcp") {
          json(res, 200, {
            resource: `${base()}/mcp`,
            authorization_servers: [base()],
            scopes_supported: ["meetings:read"],
            bearer_methods_supported: ["header"],
          });
          return;
        }
        if (url.pathname === "/.well-known/oauth-authorization-server") {
          json(res, 200, {
            issuer: base(),
            authorization_endpoint: `${base()}/authorize`,
            token_endpoint: `${base()}/token`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none"],
            scopes_supported: ["meetings:read"],
          });
          return;
        }
        if (url.pathname === "/authorize") {
          const params = Object.fromEntries(url.searchParams);
          state.authorizeRequests.push(params);
          const code = `code_${randomUUID()}`;
          state.codes.set(code, {
            challenge: params.code_challenge,
            redirectUri: params.redirect_uri,
            clientId: params.client_id,
            resource: params.resource,
          });
          const target = new URL(params.redirect_uri);
          target.searchParams.set("code", code);
          if (params.state) target.searchParams.set("state", params.state);
          res.writeHead(302, { Location: target.toString() }).end();
          return;
        }
        if (url.pathname === "/token" && req.method === "POST") {
          const params = Object.fromEntries(new URLSearchParams(await readRawBody(req)));
          state.tokenRequests.push(params);
          if (params.grant_type === "authorization_code") {
            const issued = state.codes.get(params.code);
            state.codes.delete(params.code);
            if (
              !issued ||
              issued.clientId !== params.client_id ||
              issued.redirectUri !== params.redirect_uri ||
              issued.challenge !== sha256base64url(params.code_verifier ?? "")
            ) {
              json(res, 400, { error: "invalid_grant", error_description: "bad code or PKCE verifier" });
              return;
            }
            json(res, 200, issueTokens());
            return;
          }
          if (params.grant_type === "refresh_token") {
            const record = state.refreshTokens.get(params.refresh_token);
            if (!record?.active || params.client_id !== "laxis-mcp") {
              json(res, 400, { error: "invalid_grant", error_description: "refresh token is not active" });
              return;
            }
            record.active = false; // single-use rotation
            state.refreshCount += 1;
            json(res, 200, issueTokens());
            return;
          }
          json(res, 400, { error: "unsupported_grant_type" });
          return;
        }
      }

      if (url.pathname !== "/mcp") {
        res.writeHead(404).end();
        return;
      }

      const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      const authorized = state.mode === "oauth" ? state.accessTokens.has(bearer) : bearer === state.apiKey;
      if (!authorized) {
        state.unauthorizedHits += 1;
        const headers = {};
        if (state.mode === "oauth") {
          headers["WWW-Authenticate"] =
            `Bearer resource_metadata="${base()}/.well-known/oauth-protected-resource/mcp", scope="meetings:read"`;
        }
        json(res, 401, { error: "unauthorized" }, headers);
        return;
      }
      state.lastHeaders = req.headers;

      const rawBody = req.method === "POST" ? await readRawBody(req) : "";
      const body = rawBody ? JSON.parse(rawBody) : undefined;
      const sessionId = req.headers["mcp-session-id"];
      let transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport) {
        if (req.method !== "POST" || !isInitializeRequest(body)) {
          json(res, 400, { error: "no session" });
          return;
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: id => transports.set(id, transport),
        });
        // One McpServer per session — a Server instance binds to a single transport.
        await buildMcpServer(state).connect(transport);
      }
      await transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) json(res, 500, { error: String(err) });
    }
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = () => `http://127.0.0.1:${server.address().port}`;

  return {
    state,
    mcpUrl: `${base()}/mcp`,
    expireAccessTokens: () => state.accessTokens.clear(),
    revokeRefreshTokens: () => {
      for (const record of state.refreshTokens.values()) record.active = false;
    },
    close: () =>
      new Promise(resolve => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

function buildMcpServer(state) {
  const mcp = new McpServer({ name: "mock-laxis", version: "0.0.1" });
  mcp.registerTool(
    "echo",
    { description: "Echo text back", inputSchema: { text: z.string() } },
    async ({ text }) => ({ content: [{ type: "text", text }] }),
  );
  mcp.registerTool("whoami", { description: "Report the credentials the server saw" }, async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          authorization: state.lastHeaders?.authorization ?? null,
          client: state.lastHeaders?.["x-laxis-client"] ?? null,
        }),
      },
    ],
  }));
  return mcp;
}
