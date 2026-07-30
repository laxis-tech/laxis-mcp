import assert from "node:assert/strict";
import path from "node:path";
import { after, test } from "node:test";

import { startMockLaxis } from "./helpers/mock-laxis.js";
import { completeBrowserSignIn, countAuthUrls, spawnBridge, tempDir } from "./helpers/bridge-client.js";

const cleanups = [];
after(async () => {
  for (const fn of cleanups.reverse()) await fn();
});

test("oauth mode: sign-in, silent refresh, restart persistence, revocation self-heal", async t => {
  const mock = await startMockLaxis({ mode: "oauth" });
  cleanups.push(() => mock.close());
  const authDir = tempDir("laxis-auth");
  const authUrlFile = path.join(tempDir("laxis-browser"), "urls.txt");
  const env = { LAXIS_MCP_URL: mock.mcpUrl, LAXIS_AUTH_DIR: authDir, LAXIS_AUTH_URL_FILE: authUrlFile };

  let { client, transport } = spawnBridge(env);
  cleanups.push(() => client.close());

  await t.test("first connect walks the browser sign-in", async () => {
    const connecting = client.connect(transport);
    await completeBrowserSignIn(authUrlFile);
    await connecting;

    const authorize = mock.state.authorizeRequests[0];
    assert.equal(authorize.client_id, "laxis-mcp");
    assert.equal(authorize.code_challenge_method, "S256");
    assert.equal(authorize.resource, mock.mcpUrl);
    assert.equal(authorize.scope, "meetings:read");
    assert.match(authorize.redirect_uri, /^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/);

    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ["echo", "whoami"]);
    const whoami = JSON.parse((await client.callTool({ name: "whoami" })).content[0].text);
    assert.equal(whoami.authorization, "Bearer at_1");
    assert.match(whoami.client, /^mcpb\//);
  });

  await t.test("expired access token refreshes silently (no browser)", async () => {
    mock.expireAccessTokens();
    const whoami = JSON.parse((await client.callTool({ name: "whoami" })).content[0].text);
    assert.equal(whoami.authorization, "Bearer at_2");
    assert.equal(mock.state.refreshCount, 1);
    assert.equal(countAuthUrls(authUrlFile), 1);
  });

  await t.test("a restarted bridge reuses the persisted grant", async () => {
    await client.close();
    ({ client, transport } = spawnBridge(env));
    mock.expireAccessTokens();

    await client.connect(transport);
    const whoami = JSON.parse((await client.callTool({ name: "whoami" })).content[0].text);
    assert.equal(whoami.authorization, "Bearer at_3");
    assert.equal(mock.state.refreshCount, 2);
    assert.equal(countAuthUrls(authUrlFile), 1);
  });

  await t.test("a revoked grant re-runs the browser sign-in", async () => {
    mock.revokeRefreshTokens();
    mock.expireAccessTokens();

    const calling = client.callTool({ name: "whoami" });
    await completeBrowserSignIn(authUrlFile, { previousCount: 1 });
    const whoami = JSON.parse((await calling).content[0].text);
    assert.equal(whoami.authorization, "Bearer at_4");
    assert.equal(countAuthUrls(authUrlFile), 2);
    assert.equal(mock.state.authorizeRequests.at(-1).client_id, "laxis-mcp");
  });
});

test("oauth mode against a server without OAuth support points at the API key", async () => {
  const mock = await startMockLaxis({ mode: "apikey", apiKey: "laxis_irrelevant" });
  cleanups.push(() => mock.close());
  const { client, transport } = spawnBridge({
    LAXIS_MCP_URL: mock.mcpUrl,
    LAXIS_AUTH_DIR: tempDir("laxis-auth"),
    LAXIS_AUTH_URL_FILE: path.join(tempDir("laxis-browser"), "urls.txt"),
  });
  cleanups.push(() => client.close());

  await assert.rejects(client.connect(transport), err => {
    assert.match(err.message, /does not advertise OAuth/i);
    assert.match(err.message, /personal API key/i);
    return true;
  });
});
