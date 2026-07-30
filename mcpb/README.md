# Laxis MCP Bundle (`.mcpb`) — developer guide

One-click Claude Desktop install for the Laxis MCP server. The bundle ships a
**thin Node.js bridge** (stdio ⇄ Streamable HTTP) in front of the hosted server
at `https://app.laxis.tech/mcp` — no tool logic lives here. MCPB only supports
local processes, so this bridge is what makes the hosted server double-click
installable.

```
Claude Desktop ── stdio ── server/index.js ── Streamable HTTP ──▶ app.laxis.tech/mcp
                              │
                              ├── OAuth mode (default): "Sign in with Laxis" in the
                              │   browser via the pre-registered `laxis-mcp` public
                              │   PKCE client; tokens persist under ~/.laxis/mcp
                              └── API-key mode: LAXIS_API_KEY set → Bearer laxis_… header
```

Because the bridge is a pure proxy (tools/list, tools/call, notifications all
pass through untouched), server-side tool changes require **no bundle release**.

## Credential modes

**OAuth (default).** On the first `401` the SDK discovers the Authorization
Server via RFC 9728 → RFC 8414, and the bridge opens the system browser for
authorization-code + PKCE as the pre-registered public client `laxis-mcp`
(no DCR). The loopback redirect lands on `http://127.0.0.1:33418/oauth/callback`
(fallback ports 33419/33420). Access tokens refresh silently; refresh tokens
rotate (single-use) and are persisted atomically to `~/.laxis/mcp/<hash>/`
with `0600` permissions. `invalid_grant` (revoked/lost rotation) self-heals by
clearing tokens and re-running the browser flow. Concurrent refreshes are
coalesced (`createDedupingFetch`) so rotation is never raced.

**API key.** If the optional `api_key` user_config is set, the bridge sends
`Authorization: Bearer laxis_…` directly and OAuth is disabled. This is also
the fallback the bridge points users to when the server doesn't advertise
OAuth metadata (e.g. an environment where OAuth isn't rolled out yet).

## Environment variables

Set by `manifest.json` / useful for development:

| Variable | Default | Purpose |
|---|---|---|
| `LAXIS_MCP_URL` | `https://app.laxis.tech/mcp` | Upstream server (point at stg for testing) |
| `LAXIS_API_KEY` | – | Personal API key → api-key mode |
| `LAXIS_OAUTH_CLIENT_ID` | `laxis-mcp` | Pre-registered public client id |
| `LAXIS_OAUTH_SCOPE` | `meetings:read` | Scope fallback when discovery offers none |
| `LAXIS_OAUTH_PORTS` | `33418,33419,33420` | Loopback callback ports (must be registered on the AS) |
| `LAXIS_AUTH_DIR` | `~/.laxis/mcp` | Token storage root |
| `LAXIS_AUTH_TIMEOUT_MS` | `300000` | Max wait for the browser round-trip |
| `LAXIS_LOG_LEVEL` | `info` | `debug` for troubleshooting (stderr only) |
| `LAXIS_AUTH_URL_FILE` | – | Write authorization URLs to a file instead of opening a browser (tests/headless) |
| `LAXIS_BROWSER_COMMAND` | – | Custom command to open the authorization URL |

## Develop & test

```bash
cd mcpb
npm ci
npm test                 # e2e: real SDK client ⇄ bridge ⇄ mock server + mock AS
```

The tests cover both credential modes end-to-end, including the full browser
sign-in (driven via `LAXIS_AUTH_URL_FILE`), silent refresh with rotation,
grant persistence across bridge restarts, revocation self-heal, and friendly
errors for rejected keys / OAuth-less servers.

Manual run against a real environment:

```bash
LAXIS_MCP_URL=https://<stg-host>/mcp LAXIS_LOG_LEVEL=debug \
  npx @modelcontextprotocol/inspector node server/index.js
```

## Pack & install locally

```bash
cd mcpb
npm ci --omit=dev
npx @anthropic-ai/mcpb validate manifest.json
npx @anthropic-ai/mcpb pack . laxis.mcpb
```

Open `laxis.mcpb` with Claude Desktop (or drag into **Settings → Extensions**)
to install. Logs: **Settings → Extensions → Laxis → Logs** (or the MCP log
files under Claude Desktop's logs directory); the bridge logs to stderr only.

## CI & release

Workflow templates live in [`ci/`](ci/) — **a maintainer must copy them to
`.github/workflows/`** (the automation account that authored this change
cannot push workflow files):

```bash
mkdir -p .github/workflows && cp mcpb/ci/*.yml .github/workflows/
```

- `mcpb.yml` — tests + manifest validation + pack sanity check on PRs and
  pushes touching `mcpb/**`.
- `mcpb-release.yml` — on a `mcpb-v<version>` tag: verifies the tag matches
  the manifest/package versions, tests, packs with production deps, and
  attaches `laxis.mcpb` to a GitHub release for the tag.

Release steps:

1. Bump `version` in **both** `manifest.json` and `package.json` (keep in sync).
2. Tag `mcpb-v<version>` and push the tag.
3. Update the download link target if the release URL scheme ever changes
   (the root README points at the releases page).

The icon is a generated placeholder (`python3 scripts/gen_icon.py`) — replace
`icon.png` with an official 512×512 design export whenever ready.

## Server-side requirements (ops runbook)

The bundle's OAuth mode requires, in the target environment:

- api: `laxis.oauth.enabled=true`, and the `laxis-mcp` seed client's
  `laxis.oauth.seed-client-redirect-uris` including
  `http://127.0.0.1:33418/oauth/callback` (plus `33419`/`33420` fallbacks).
  Redirect matching is **exact**, and the client row is seeded
  create-if-absent — changing URIs on an already-seeded environment means
  deleting the `oauth2_registered_client` row so it re-seeds.
- mcp (RS): `OAUTH_ENABLED=true` with issuer/JWKS/resource configured — while
  **keeping personal API keys accepted** (this bundle's fallback, Zapier).
- DCR can stay off: the bridge always uses the pre-registered client id.

Without these, the bridge detects the missing RFC 9728 metadata and returns a
clear "use a personal API key" error instead of opening a dead-end browser tab.
