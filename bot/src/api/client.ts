/**
 * Thin HTTP client for the trendex-api `/internal/*` endpoints.
 *
 * All repos in src/db/* delegate to this client. Authentication is the
 * shared `x-trendex-secret` header; `baseUrl` is the trendex-api
 * origin (defaults to http://localhost:4000 for local dev).
 *
 * Every error — network, non-2xx, malformed JSON — is surfaced as an
 * `ApiError` with an HTTP-style status code (0 for network / parse).
 * Callers can catch and log but should generally let them bubble up:
 * bot handlers already sit behind try/catch or `bot.catch`.
 */

export interface ApiClientOpts {
  baseUrl: string;
  secret: string;
  /** Network timeout in ms per request. 0 disables. Default 15s. */
  timeoutMs?: number;
  /** Optional fetch implementation — defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: string | null;

  constructor(message: string, status: number, body: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiClientOpts) {
    // Normalize: strip trailing slash so callers can pass either form.
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.secret = opts.secret;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async getJson<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async postJson<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async patchJson<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  async deleteJson<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("DELETE", path, body);
  }

  /**
   * Verify a login-link token emitted by the website. Called when a user
   * opens `t.me/<bot>?start=login_<token>`. The api side consumes the
   * token (single-use) and binds the session to `tg_id`.
   *
   * Returns `{ ok: true }` on success. Surfaces `ApiError` with:
   *   - status 410 → token expired / already used
   *   - status 404 → token not found
   *   - status 0   → network error
   * so the bot can map each to a localised reply.
   */
  async verifyTgLink(
    token: string,
    tgId: number,
    username: string | null,
  ): Promise<{ ok: true }> {
    return this.postJson<{ ok: true }>("/auth/tg-link-verify", {
      token,
      tg_id: tgId,
      username,
    });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = this.baseUrl + (path.startsWith("/") ? path : "/" + path);
    const controller = new AbortController();
    const timer =
      this.timeoutMs > 0
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : null;

    const headers: Record<string, string> = {
      "x-trendex-secret": this.secret,
      accept: "application/json",
    };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }

    let resp: Response;
    try {
      resp = await this.fetchImpl(url, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });
    } catch (err) {
      if (timer) clearTimeout(timer);
      const msg = (err as Error).message || String(err);
      throw new ApiError(
        `network error calling ${method} ${path}: ${msg}`,
        0,
        null,
      );
    }
    if (timer) clearTimeout(timer);

    const text = await resp.text().catch(() => "");
    if (!resp.ok) {
      throw new ApiError(
        `${method} ${path} → ${resp.status} ${resp.statusText}`,
        resp.status,
        text.slice(0, 2000) || null,
      );
    }
    if (!text) {
      // Treat empty body as empty object — most endpoints return JSON, but
      // some PATCH/DELETE may legitimately return 204.
      return {} as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new ApiError(
        `invalid JSON from ${method} ${path}: ${(err as Error).message}`,
        0,
        text.slice(0, 2000),
      );
    }
  }
  /**
   * Generate a one-time auto-login URL for the cabinet, called from the bot
   * when a user wants to open the cabinet without manual login. The cabinet
   * stores a single-use token (15 min TTL) keyed off tg_id; clicking the URL
   * lands the user in /cabinet/cabinet with a session cookie set.
   */
  async issueCabinetMagicLink(profile: {
    tg_id: number;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    language_code?: string | null;
  }): Promise<{ ok: true; url: string; expires_at: string } | { ok: false; reason: string }> {
    const cabinetBase = (process.env.CABINET_BASE_URL || 'https://trendex.biz').replace(/\/+$/, '');
    const secret = process.env.INTERNAL_API_SECRET || process.env.TRENDEX_API_INTERNAL_SECRET || '';
    if (!secret) return { ok: false, reason: 'no_secret' };
    try {
      const r = await fetch(cabinetBase + '/cabinet/api/bot/issue-magic-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-trendex-secret': secret,
        },
        body: JSON.stringify(profile),
      });
      const data = (await r.json()) as { ok?: boolean; reason?: string; url?: string; expires_at?: string };
      if (!r.ok || !data.ok) return { ok: false, reason: data.reason || ('http_' + r.status) };
      return { ok: true, url: data.url || '', expires_at: data.expires_at || '' };
    } catch (e) {
      return { ok: false, reason: (e as Error).message };
    }
  }

}