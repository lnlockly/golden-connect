import type { Logger } from "pino";

/**
 * Singleton holder for the Claude OAuth tokens. Both the HTTP /api/chat
 * path and the in-bot AI chat share the same access token so a refresh
 * from one side doesn't leave the other on a stale 401-ing token.
 */
export class ClaudeAuth {
  private accessToken: string;
  private readonly refreshToken: string;

  constructor(
    private readonly logger: Logger,
    accessToken: string,
    refreshToken: string,
  ) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  get access(): string {
    return this.accessToken;
  }

  get hasAccess(): boolean {
    return !!this.accessToken;
  }

  get hasRefresh(): boolean {
    return !!this.refreshToken;
  }

  setAccess(token: string): void {
    this.accessToken = token;
  }

  async refresh(): Promise<string | null> {
    if (!this.refreshToken) return null;
    try {
      const resp = await fetch("https://console.anthropic.com/v1/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: this.refreshToken,
          client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
        }),
      });
      if (!resp.ok) {
        this.logger.warn({ status: resp.status }, "oauth refresh failed");
        return null;
      }
      const j = (await resp.json()) as { access_token?: string };
      if (!j.access_token) return null;
      this.accessToken = j.access_token;
      this.logger.info("oauth access token refreshed");
      return j.access_token;
    } catch (e) {
      this.logger.warn({ err: (e as Error).message }, "oauth refresh error");
      return null;
    }
  }
}
