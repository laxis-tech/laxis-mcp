# Laxis MCP Server

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=Laxis&config=eyJ1cmwiOiJodHRwczovL2FwcC5sYXhpcy50ZWNoL21jcCJ9)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Laxis_MCP-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Laxis&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapp.laxis.tech%2Fmcp%22%7D)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

The **Laxis MCP Server** connects [Laxis](https://www.laxis.com) — the AI meeting
note taker and voice dictation tool for professionals — to Claude and other AI
tools through the [Model Context Protocol](https://modelcontextprotocol.io).
Your assistant can **search and read your meeting transcripts, summaries, and
participants** directly in chat — turning every conversation you've recorded into
context your AI can reason over.

> **Remote, hosted server — nothing to install or run.** Laxis hosts the server
> for you. You add one URL to your AI client and **sign in with your Laxis
> account** — no local binary, Docker image, or `npm` package, and no API key to
> copy or paste.

## What is Laxis?

[Laxis](https://www.laxis.com) is the next-generation **AI meeting note taker and
voice dictation tool** built for professionals. It records, transcribes, and
summarizes any conversation directly from your computer — no "bot" ever joins the
call — and works seamlessly with Zoom, Google Meet, Microsoft Teams, Webex, Slack
Huddles, and more.

- 🎥 **Botless meeting recording & transcription** — record and instantly
  transcribe any meeting straight from your computer for a private, professional,
  and seamless experience. High-accuracy AI handles multiple speakers and
  technical jargon with ease.
- 🎙️ **AI dictation — voice to text, anywhere** — speak instead of type. Laxis
  turns your voice into clean, perfectly formatted text up to 3× faster than
  typing, automatically removing filler words ("um," "uh") and adding punctuation.
  Perfect for drafting emails, notes, and messages by voice.
- 🌐 **Real-time translation** — Laxis transcribes and translates conversations
  live, so you can follow and capture cross-language discussions as they happen.
- ✍️ **Personalized AI summaries** — don't just get a transcript. Laxis combines
  your own real-time notes with the meeting transcript to generate insights that
  reflect your specific context and priorities.
- 📊 **50+ professional report templates** — turn hours of conversation into
  structured documentation in seconds, including Sales Discovery, Project
  Updates, User Interviews, and Candidate Screenings.
- ✅ **Automated action items** — Laxis automatically identifies and extracts
  tasks, ensuring nothing falls through the cracks.
- 💬 **Real-time AI copilot** — chat with Laxis before, during, and after
  meetings to get real-time insight.
- 🔄 **Seamless CRM & tool integration** — automatically sync meeting insights,
  action items, and customer data directly into Salesforce, HubSpot, Jira, Slack,
  and your favorite productivity tools.
- 🔒 **Enterprise-grade security** — your data is encrypted and private,
  protected to the highest industry standards.

Sales teams use Laxis to update their CRM instantly and never miss a customer
requirement; product managers turn user interviews into actionable PRDs;
consultants deliver standardized client reports; recruiters capture every detail
of candidate interviews. **This MCP server brings all of that recorded knowledge
to your AI assistant.**

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

## How you connect

You only need a **[Laxis account](https://app.laxis.tech)**. Add the endpoint to
your AI client and it will open your browser to **sign in with Laxis** (OAuth 2.1
+ PKCE) the first time it connects — approve once and you're done. Access tokens
refresh automatically, and you can revoke a client's access anytime from
**Laxis → Settings → Claude (MCP)**.

The connection endpoint is always:

```
https://app.laxis.tech/mcp
```

> **We no longer recommend personal API keys.** Signing in with OAuth is more
> secure (no long-lived secret to copy, store, or leak) and just as quick. API
> keys remain available only for tools that can't sign in interactively — see
> [Connecting without a browser](#connecting-without-a-browser-api-key).

## Install

Pick your client. In every case you connect with the URL above and sign in with
Laxis when prompted — there's no key to paste.

### Claude Desktop — one-click MCP Bundle (recommended)

1. Download the latest **`laxis.mcpb`** from the
   [releases page](https://github.com/laxis-tech/laxis-mcp/releases).
2. Open it with Claude Desktop (double-click, or drag into **Settings →
   Extensions**) and click **Install**.
3. The first time Claude uses a Laxis tool, your browser opens to **sign in
   with Laxis**. Approve, close the tab, done.

The bundle is a thin local bridge to the hosted server — tools live server-side,
so new Laxis capabilities appear without re-downloading it. Source and developer
docs live in [`mcpb/`](mcpb/).

### claude.ai (web) & Claude Desktop — custom connector

In claude.ai or Claude Desktop go to **Settings → Connectors → Add custom
connector**, paste `https://app.laxis.tech/mcp`, and complete the "sign in with
Laxis" flow. Use either the bundle *or* the connector — installing both would
show duplicate tools.

### Claude Code

```bash
claude mcp add Laxis --transport http https://app.laxis.tech/mcp
```

Then run `/mcp` in Claude Code and choose **Authenticate** to sign in with
Laxis. Ask something like *"Use Laxis to summarize my last meeting."*

### Cursor

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=Laxis&config=eyJ1cmwiOiJodHRwczovL2FwcC5sYXhpcy50ZWNoL21jcCJ9)

The one-click button adds the server; open **Cursor → Settings → MCP** and click
**Sign in** (or **Needs login**) next to Laxis to authorize. Or configure it
manually in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "Laxis": {
      "url": "https://app.laxis.tech/mcp"
    }
  }
}
```

### VS Code

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Laxis_MCP-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Laxis&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapp.laxis.tech%2Fmcp%22%7D)

Requires VS Code 1.101+. After installing, VS Code prompts you to sign in with
Laxis on first use. To configure manually, add a `.vscode/mcp.json`:

```json
{
  "servers": {
    "Laxis": {
      "type": "http",
      "url": "https://app.laxis.tech/mcp"
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`, then authorize when prompted:

```json
{
  "mcpServers": {
    "Laxis": {
      "serverUrl": "https://app.laxis.tech/mcp"
    }
  }
}
```

### Other clients

Any client that speaks **Streamable HTTP** to a remote MCP server and supports
the MCP OAuth flow works. Point it at:

- **URL:** `https://app.laxis.tech/mcp`
- **Transport:** Streamable HTTP
- **Auth:** OAuth 2.1 (the client discovers the sign-in flow automatically)

## Connecting without a browser (API key)

> **Not recommended.** Use this only for tools that can't complete an
> interactive OAuth sign-in — headless scripts, CI, or automations such as
> Zapier. A personal API key is a long-lived secret: anyone who has it can read
> your meetings until you revoke it.

1. In Laxis, go to **Settings → Claude (MCP) → Advanced** and generate a
   personal API key (`laxis_…`).
2. Send it as a bearer token on every request:

   ```
   Authorization: Bearer laxis_…
   ```

For a desktop client that lacks native OAuth, you can bridge with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) and the header:

```json
{
  "mcpServers": {
    "Laxis": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://app.laxis.tech/mcp",
        "--header", "Authorization: Bearer laxis_…"
      ]
    }
  }
}
```

Treat the key like a password. **Regenerating** it immediately invalidates the
previous one (and any automations that share it), so update those afterward.

## How it works

```
Your AI client ──OAuth sign-in──▶ Laxis (authorize + consent)
       │
       └──Bearer access token──▶ Laxis MCP Server ──▶ Laxis API ──▶ your meetings
```

The server is a thin, **retrieval-only** proxy in front of the Laxis API. It
validates your OAuth access token, exchanges it for a short-lived, user-scoped
upstream token (it never forwards your client's token to the API), fetches the
requested meeting data, and returns raw snippets. Your AI client does all the
reasoning and answer-writing. You only ever see your own meetings, and access
stops the moment you revoke the connection (or, in API-key mode, the key).

## Roadmap

- Listing in Anthropic's connector and desktop-extension directories, and on
  public MCP registries, for one-click discovery.

## Support

- **Questions / bugs:** open an [issue](https://github.com/laxis-tech/laxis-mcp/issues).
- **Product help:** [laxis.com](https://www.laxis.com) / in-app support.
- **Security:** see [SECURITY.md](SECURITY.md) — please report privately, not via public issues.

## License

[MIT](LICENSE) © Laxis
