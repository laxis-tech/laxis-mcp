# Laxis MCP Server

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=Laxis&config=eyJ1cmwiOiJodHRwczovL2FwcC5sYXhpcy50ZWNoL21jcCIsImhlYWRlcnMiOnsiQXV0aG9yaXphdGlvbiI6IkJlYXJlciBZT1VSX0tFWSJ9fQ==)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Laxis_MCP-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Laxis&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapp.laxis.tech%2Fmcp%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22Bearer%20%24%7Binput%3Alaxis_pat%7D%22%7D%7D)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

The **Laxis MCP Server** connects [Laxis](https://www.laxis.com) to Claude and other
AI tools through the [Model Context Protocol](https://modelcontextprotocol.io).
Your assistant can **search and read your meeting transcripts, summaries, and
participants** directly in chat — turning every conversation you've recorded into
context your AI can reason over.

> **Remote, hosted server — nothing to install or run.** Laxis hosts the server
> for you. You just add one URL and your personal API key to your AI client. There
> is no local binary, Docker image, or `npm` package to manage.

## About Laxis

[Laxis](https://www.laxis.com/ai-meeting-assistant/) is an AI meeting assistant that
**records, transcribes, and summarizes every conversation in real time** — so your
team can stay present in the discussion instead of scrambling to take notes.

- **Capture every meeting.** Laxis joins your Zoom, Google Meet, Microsoft Teams,
  and Webex calls automatically through calendar integration — with a meeting bot
  or bot-free, zero-footprint capture — and also handles in-person conversations
  and audio uploads.
- **Accurate, speaker-labeled transcripts.** Speech-to-text recognizes each
  participant, so you always know who said what, across **40+ languages**.
- **AI summaries and insights.** Laxis automatically pulls out action items, key
  decisions, and customer requirements, and turns raw transcripts into polished
  notes using **50+ professional templates**.
- **Ask your meeting history anything.** Search across every past conversation to
  recall facts, trends, and forgotten decisions.
- **Repurpose in one click.** Turn a meeting into a follow-up email, blog post,
  project requirements doc, or CRM update the moment the call ends.

Everything Laxis records becomes a searchable knowledge base of your conversations.
**This MCP server opens that knowledge base to Claude and other AI tools** — letting
your assistant reason directly over the meetings you've already captured.

## Use cases

- **Recall decisions and commitments** — *"What did we agree on pricing in my last call with Acme?"*
- **Catch up fast** — *"Summarize my meetings from this week and list the action items."*
- **Find the exact moment** — *"Find where the customer mentioned their renewal date."*
- **Prep for the next call** — *"Who attended the Q3 planning meeting and what did we promise to follow up on?"*

## Tools

All tools are **read-only**. The server returns raw snippets from your meetings;
your AI client generates the answer. It never writes to your account, makes LLM
calls of its own, or touches data that isn't yours.

| Tool | Purpose |
|---|---|
| `list_meetings` | Browse your recent meetings — title, date, duration, status, and a short summary (metadata only). |
| `search_meetings` | Semantic search across your transcripts; returns the most relevant transcript snippets. |
| `get_meeting` | Full details for one meeting — participants, AI summary points, and metadata. |
| `get_transcript` | The full, paged transcript text, formatted as `[m:ss] Speaker: text`. |

## Prerequisites

1. A **Laxis account** — sign up at [app.laxis.tech](https://app.laxis.tech).
2. A **personal API key** (see below).
3. An MCP client that supports **remote servers with a custom `Authorization`
   header** — e.g. Claude Code, Cursor, VS Code, or Windsurf. (See
   [Claude Desktop & claude.ai](#claude-desktop--claudeai-web) for those clients.)

## Get your API key

1. Go to **[app.laxis.tech](https://app.laxis.tech) → Settings → Claude (MCP)**.
2. Click **Generate API key**. Copy the value — it looks like `laxis_xxxxxxxx…`.

> Treat this key like a password: it grants read access to your meetings.
> **Regenerating** the key immediately invalidates the previous one (and any
> Zapier zaps that share it), so update your connectors afterward. The same screen
> shows a ready-to-paste `claude mcp add` command for Claude Code.

The connection endpoint is always:

```
https://app.laxis.tech/mcp
```

with the header:

```
Authorization: Bearer YOUR_KEY
```

## Install

Replace `YOUR_KEY` below with the key you generated.

### Claude Code (recommended)

```bash
claude mcp add Laxis --transport http https://app.laxis.tech/mcp \
  --header "Authorization: Bearer YOUR_KEY"
```

Then ask Claude something like *"Use Laxis to summarize my last meeting."*

### Cursor

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=Laxis&config=eyJ1cmwiOiJodHRwczovL2FwcC5sYXhpcy50ZWNoL21jcCIsImhlYWRlcnMiOnsiQXV0aG9yaXphdGlvbiI6IkJlYXJlciBZT1VSX0tFWSJ9fQ==)

The one-click button adds the server with a placeholder key — after installing,
open **Cursor → Settings → MCP** (or `~/.cursor/mcp.json`) and replace
`YOUR_KEY` with your real key. Or configure it manually:

```json
{
  "mcpServers": {
    "Laxis": {
      "url": "https://app.laxis.tech/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_KEY"
      }
    }
  }
}
```

### VS Code

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Laxis_MCP-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Laxis&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapp.laxis.tech%2Fmcp%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22Bearer%20%24%7Binput%3Alaxis_pat%7D%22%7D%7D)

Requires VS Code 1.101+. You'll be prompted for your API key on first use. To
configure manually, add a `.vscode/mcp.json` to your workspace (this version
prompts for the key and stores it securely instead of hard-coding it):

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "laxis_pat",
      "description": "Laxis personal API key",
      "password": true
    }
  ],
  "servers": {
    "Laxis": {
      "type": "http",
      "url": "https://app.laxis.tech/mcp",
      "headers": {
        "Authorization": "Bearer ${input:laxis_pat}"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "Laxis": {
      "serverUrl": "https://app.laxis.tech/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_KEY"
      }
    }
  }
}
```

### Claude Desktop & claude.ai (web)

Native one-click **custom connectors** in Claude Desktop and on claude.ai use
OAuth, which is **coming soon** for Laxis (see [Roadmap](#roadmap)). Until then,
connect Claude Desktop with the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote)
bridge (requires Node.js). Edit **Settings → Developer → Edit Config**
(`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "Laxis": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://app.laxis.tech/mcp",
        "--header", "Authorization: Bearer YOUR_KEY"
      ]
    }
  }
}
```

Restart Claude Desktop after saving.

### Other clients

Any client that speaks **Streamable HTTP** to a remote MCP server works. Point it at:

- **URL:** `https://app.laxis.tech/mcp`
- **Transport:** Streamable HTTP
- **Header:** `Authorization: Bearer YOUR_KEY`

## How it works

```
Your AI client ──(Authorization: Bearer laxis_…)──▶ Laxis MCP Server ──▶ Laxis API
```

The server is a thin, **retrieval-only** proxy in front of the Laxis API. It holds
no signing keys: it exchanges your personal API key for a short-lived, user-scoped
token, fetches the requested meeting data, and returns raw snippets. Your AI client
does all the reasoning and answer-writing from those snippets. You only ever see
your own meetings, and access stops the moment you regenerate or delete the key.

## Roadmap

- **OAuth 2.1 connector** — one-click "Add custom connector" support for
  claude.ai (web) and Claude Desktop, with no API key to copy/paste.
- Listing on public MCP registries and directories for one-click discovery.

## Support

- **Questions / bugs:** open an [issue](https://github.com/laxis-tech/laxis-mcp/issues).
- **Product help:** [laxis.com](https://www.laxis.com) / in-app support.
- **Security:** see [SECURITY.md](SECURITY.md) — please report privately, not via public issues.

## License

[MIT](LICENSE) © Laxis
