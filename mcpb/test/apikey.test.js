import assert from "node:assert/strict";
import { after, test } from "node:test";

import { startMockLaxis } from "./helpers/mock-laxis.js";
import { spawnBridge, tempDir } from "./helpers/bridge-client.js";

const KEY = "laxis_test_key_123";
const cleanups = [];
after(async () => {
  for (const fn of cleanups.reverse()) await fn();
});

test("api-key mode pipes tools and presents the key as a bearer token", async () => {
  const mock = await startMockLaxis({ mode: "apikey", apiKey: KEY });
  const { client, transport } = spawnBridge({
    LAXIS_MCP_URL: mock.mcpUrl,
    LAXIS_API_KEY: KEY,
    LAXIS_AUTH_DIR: tempDir("laxis-auth"),
  });
  cleanups.push(() => mock.close());
  cleanups.push(() => client.close());

  await client.connect(transport);

  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(t => t.name).sort(), ["echo", "whoami"]);

  const echo = await client.callTool({ name: "echo", arguments: { text: "hello from the bundle" } });
  assert.equal(echo.content[0].text, "hello from the bundle");

  const whoami = JSON.parse((await client.callTool({ name: "whoami" })).content[0].text);
  assert.equal(whoami.authorization, `Bearer ${KEY}`);
  assert.match(whoami.client, /^mcpb\/\d+\.\d+\.\d+$/);
});

test("a rejected api key surfaces a friendly error", async () => {
  const mock = await startMockLaxis({ mode: "apikey", apiKey: KEY });
  const { client, transport } = spawnBridge({
    LAXIS_MCP_URL: mock.mcpUrl,
    LAXIS_API_KEY: "laxis_wrong_key",
    LAXIS_AUTH_DIR: tempDir("laxis-auth"),
  });
  cleanups.push(() => mock.close());
  cleanups.push(() => client.close());

  await assert.rejects(client.connect(transport), err => {
    assert.match(err.message, /rejected your API key/i);
    assert.match(err.message, /app\.laxis\.tech/);
    return true;
  });
  assert.ok(mock.state.unauthorizedHits >= 1);
});
