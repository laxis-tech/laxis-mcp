/** Spawns the bridge entry point as Claude Desktop would and connects an MCP client to it. */
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "server", "index.js");

export function tempDir(prefix) {
  return mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

export function spawnBridge(env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [ENTRY],
    env: {
      PATH: process.env.PATH ?? "",
      // Ephemeral loopback port so parallel test runs never collide.
      LAXIS_OAUTH_PORTS: "0",
      LAXIS_LOG_LEVEL: "debug",
      ...env,
    },
    stderr: "inherit",
  });
  const client = new Client({ name: "bridge-test", version: "0.0.0" });
  return { client, transport };
}

export async function waitFor(fn, { timeoutMs = 15000, intervalMs = 50, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/**
 * Plays the user's part of the OAuth dance: waits for the bridge to "open the
 * browser" (append the authorization URL to authUrlFile), follows the mock
 * AS redirect, and delivers the code to the bridge's loopback callback.
 */
export async function completeBrowserSignIn(authUrlFile, { previousCount = 0 } = {}) {
  const authUrl = await waitFor(
    () => {
      let lines;
      try {
        lines = readFileSync(authUrlFile, "utf8").split("\n").filter(Boolean);
      } catch {
        return undefined;
      }
      return lines.length > previousCount ? lines.at(-1) : undefined;
    },
    { label: "authorization URL" },
  );

  const authorize = await fetch(authUrl, { redirect: "manual" });
  if (authorize.status !== 302) throw new Error(`mock /authorize returned ${authorize.status}`);
  const callback = await fetch(authorize.headers.get("location"));
  if (callback.status !== 200) throw new Error(`loopback callback returned ${callback.status}`);
  return authUrl;
}

export function countAuthUrls(authUrlFile) {
  try {
    return readFileSync(authUrlFile, "utf8").split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}
