# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do **not** open a public GitHub
issue or pull request for anything security-sensitive.

- Email **security@laxis.tech** (or use GitHub's
  [private vulnerability reporting](https://github.com/laxis-tech/laxis-mcp/security/advisories/new)).
- Include steps to reproduce, the impact, and any relevant request/response
  details. **Do not include real personal API keys or customer data.**

We aim to acknowledge reports within a few business days.

## Handling your API key

- Your Laxis personal API key (`laxis_…`) grants read access to your meetings.
  Treat it like a password.
- Prefer client configs that store the key as a secret/prompted input (e.g. the
  VS Code `inputs` example in the README) over hard-coding it in a file.
- If a key is exposed, regenerate it at **app.laxis.tech → Settings →
  Claude (MCP)**. Regenerating immediately invalidates the old key.

## Scope

This repository contains **documentation and the MCP registry manifest only**.
The server is hosted by Laxis at `https://app.laxis.tech/mcp`. Vulnerabilities in
the hosted service, the Laxis API, or the web app should also be reported through
the channels above.
