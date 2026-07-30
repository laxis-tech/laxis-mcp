import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * On-disk persistence for OAuth material, scoped per server URL so that dev /
 * stg / prod configurations never share credentials.
 *
 * OAuth tokens are obtained at runtime, after installation, so they cannot go
 * into Claude Desktop's keychain-backed user_config; a 0600 file under the
 * user's home is the same posture mcp-remote uses (~/.mcp-auth).
 *
 * Tokens are re-read from disk on every access (no in-memory cache): with
 * refresh-token rotation enabled server-side, always trusting the newest
 * on-disk state lets concurrent bridge instances converge on the winning
 * rotation instead of fighting it.
 */
export class TokenStorage {
  constructor(baseDir, serverUrl) {
    const scope = createHash("sha256").update(serverUrl).digest("hex").slice(0, 16);
    this.dir = path.join(baseDir, scope);
    this.tokensPath = path.join(this.dir, "tokens.json");
    this.verifierPath = path.join(this.dir, "verifier.txt");
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    // Best effort: record which server this scope belongs to, for debugging.
    this.#writeAtomic(path.join(this.dir, "meta.json"), JSON.stringify({ serverUrl }, null, 2));
  }

  readTokens() {
    const raw = this.#read(this.tokensPath);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      this.clearTokens();
      return undefined;
    }
  }

  writeTokens(tokens) {
    this.#writeAtomic(this.tokensPath, JSON.stringify(tokens, null, 2));
  }

  clearTokens() {
    fs.rmSync(this.tokensPath, { force: true });
  }

  readVerifier() {
    return this.#read(this.verifierPath);
  }

  writeVerifier(verifier) {
    this.#writeAtomic(this.verifierPath, verifier);
  }

  clearVerifier() {
    fs.rmSync(this.verifierPath, { force: true });
  }

  #read(file) {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      return undefined;
    }
  }

  #writeAtomic(file, contents) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, contents, { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
}
