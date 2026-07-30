/**
 * OAuthClientProvider for the pre-registered `laxis-mcp` public client.
 *
 * No dynamic client registration: `clientInformation()` always returns the
 * fixed client_id, so the SDK skips DCR entirely (prod can keep its DCR flag
 * off). Security rests on PKCE + the Authorization Server's locked loopback
 * redirect URIs, per OAuth 2.1 native-app rules.
 */
export class NoOAuthSupportError extends Error {
  constructor(serverUrl) {
    super(
      `The Laxis server at ${serverUrl} does not advertise OAuth sign-in (yet). ` +
        "Update the Laxis extension, or paste a personal API key (app.laxis.tech → Settings → Claude (MCP)) " +
        "into Claude Desktop → Settings → Extensions → Laxis.",
    );
  }
}

export class LaxisOAuthProvider {
  /**
   * @param {object} deps
   * @param {string} deps.serverUrl MCP server URL (for error messages)
   * @param {string} deps.clientId pre-registered public client id
   * @param {string} deps.scope scope hint used when discovery offers none
   * @param {import("./storage.js").TokenStorage} deps.storage
   * @param {import("./callback.js").CallbackServer} deps.callbackServer
   * @param {{open(url: string): Promise<void>}} deps.browser
   * @param {Promise<boolean>} deps.oauthSupport resolves false when the RS has no OAuth metadata
   * @param {ReturnType<import("../log.js").createLogger>} deps.log
   */
  constructor({ serverUrl, clientId, scope, storage, callbackServer, browser, oauthSupport, log }) {
    this.serverUrl = serverUrl;
    this.clientId = clientId;
    this.scope = scope;
    this.storage = storage;
    this.callbackServer = callbackServer;
    this.browser = browser;
    this.oauthSupport = oauthSupport;
    this.log = log;
  }

  get redirectUrl() {
    return this.callbackServer.redirectUrl;
  }

  get clientMetadata() {
    return {
      client_name: "Laxis for Claude Desktop",
      client_uri: "https://www.laxis.com",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: this.scope,
    };
  }

  state() {
    return this.callbackServer.newState();
  }

  clientInformation() {
    return { client_id: this.clientId };
  }

  tokens() {
    return this.storage.readTokens();
  }

  saveTokens(tokens) {
    this.storage.writeTokens(tokens);
  }

  async redirectToAuthorization(authorizationUrl) {
    // Refuse to open a browser toward a server that never advertised OAuth —
    // without RFC 9728 metadata the SDK falls back to guessing /authorize on
    // the MCP origin, which would land the user on a 404.
    if (!(await this.oauthSupport)) {
      throw new NoOAuthSupportError(this.serverUrl);
    }
    this.log.info("Authorization required — opening your browser to sign in to Laxis…");
    this.log.debug(`Authorization URL: ${authorizationUrl}`);
    await this.browser.open(authorizationUrl.toString());
  }

  saveCodeVerifier(verifier) {
    this.storage.writeVerifier(verifier);
  }

  codeVerifier() {
    const verifier = this.storage.readVerifier();
    if (!verifier) throw new Error("Missing PKCE code verifier — restart the sign-in flow");
    return verifier;
  }

  invalidateCredentials(scope) {
    this.log.debug(`Invalidating credentials (${scope})`);
    if (scope === "all" || scope === "tokens") this.storage.clearTokens();
    if (scope === "all" || scope === "verifier") this.storage.clearVerifier();
    // "client" and "discovery" have no persistent state here: the client id is
    // static and discovery is re-run on each process start.
  }
}

/**
 * Probe RFC 9728 Protected Resource Metadata so we can distinguish "OAuth not
 * rolled out on this server" from a normal authorization round-trip. Checks the
 * path-scoped well-known location first (what the laxis-mcp RS serves), then
 * the root fallback.
 */
export async function probeOAuthSupport(serverUrl, log) {
  const url = new URL(serverUrl);
  const candidates = [
    `${url.origin}/.well-known/oauth-protected-resource${url.pathname === "/" ? "" : url.pathname}`,
    `${url.origin}/.well-known/oauth-protected-resource`,
  ];
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { headers: { Accept: "application/json" } });
      if (res.ok) {
        log.debug(`OAuth resource metadata found at ${candidate}`);
        return true;
      }
    } catch (err) {
      log.debug(`Probe failed for ${candidate}: ${err.message}`);
    }
  }
  log.warn("No OAuth resource metadata advertised by the server — sign-in requires a personal API key.");
  return false;
}
