# Publishing (maintainers)

How to list the Laxis MCP Server on the official
[MCP Registry](https://registry.modelcontextprotocol.io) and downstream
directories (e.g. mcp.directory, Cursor's directory). The manifest is
[`server.json`](../server.json) in the repo root.

## One-time prep

- The `name` in `server.json` is `io.github.laxis-tech/laxis-mcp`. The
  `io.github.laxis-tech/*` namespace is owned by whoever can authenticate as the
  **laxis-tech** GitHub org, so publishing must be done by an org member.
- Make sure `version` in `server.json` is bumped for every change you publish
  (the registry rejects re-publishing the same version).

## Publish

Using the official [`mcp-publisher`](https://github.com/modelcontextprotocol/registry) CLI:

```bash
# 1. Install the publisher CLI (see the registry repo for the latest method)
#    e.g. via Homebrew, Go, or a release binary:
brew install mcp-publisher

# 2. Authenticate. GitHub OAuth proves ownership of the io.github.laxis-tech namespace.
mcp-publisher login github

# 3. Validate and publish the manifest in this directory
mcp-publisher publish
```

`mcp-publisher publish` reads `./server.json`, validates it against the schema,
and submits it. Verify the listing at
`https://registry.modelcontextprotocol.io/v0/servers?search=laxis`.

## Automating with CI (optional)

You can publish from GitHub Actions on a tagged release using OIDC instead of an
interactive login — see the registry docs for the `mcp-publisher login github-oidc`
flow. Gate it on a `release` event so a new tag → new published version.

## Downstream directories

Many directories (including mcp.directory) ingest from the official registry
automatically; others have a **"Submit Server"** form where you paste the repo or
`server.json` URL. After the official-registry listing is live:

1. Submit `https://github.com/laxis-tech/laxis-mcp` to any directory's submit form.
2. Confirm the install snippets they generate match the README (URL
   `https://app.laxis.tech/mcp`, `Authorization: Bearer` header).

## Before you publish — checklist

- [ ] `https://app.laxis.tech/mcp` is live in **production** (not just dev/stg).
- [ ] A freshly generated `laxis_…` key connects successfully from at least
      Claude Code and one GUI client (Cursor or VS Code).
- [ ] `server.json` `version` bumped; `$schema` still current.
- [ ] README endpoint, header, and one-click links verified.
