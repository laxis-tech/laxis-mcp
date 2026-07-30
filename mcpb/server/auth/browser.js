import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";

/**
 * Opens the authorization URL in the user's browser.
 *
 * Overrides, in priority order:
 *  - authUrlFile: append the URL to a file instead of opening anything
 *    (used by tests and headless setups);
 *  - browserCommand: spawn a custom command with the URL as last argument.
 *
 * Failure to open is not fatal: the URL is always logged so the user can
 * open it manually, and the callback server keeps waiting either way.
 */
export function createBrowser({ authUrlFile, browserCommand, log }) {
  return {
    async open(url) {
      if (authUrlFile) {
        appendFileSync(authUrlFile, `${url}\n`);
        return;
      }
      try {
        if (browserCommand) {
          const [cmd, ...args] = browserCommand.split(" ").filter(Boolean);
          const child = spawn(cmd, [...args, url], { detached: true, stdio: "ignore" });
          child.on("error", err => log.error("Browser command failed:", err.message));
          child.unref();
          return;
        }
        const { default: open } = await import("open");
        await open(url);
      } catch (err) {
        log.error(`Could not open a browser (${err.message}). Open this URL manually to sign in to Laxis:\n${url}`);
      }
    },
  };
}
