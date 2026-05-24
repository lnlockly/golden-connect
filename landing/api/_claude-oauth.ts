import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CREDS_PATH = process.env.CLAUDE_CREDENTIALS_PATH ?? join(homedir(), '.claude', '.credentials.json');
const REFRESH_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

interface CredsFile {
  claudeAiOauth: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes?: string[];
    subscriptionType?: string;
    rateLimitTier?: string;
  };
}

let cached: CredsFile | null = null;

async function load(): Promise<CredsFile> {
  if (cached) return cached;
  const raw = await readFile(CREDS_PATH, 'utf8');
  cached = JSON.parse(raw) as CredsFile;
  return cached;
}

async function refresh(creds: CredsFile): Promise<CredsFile> {
  const res = await fetch(REFRESH_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: creds.claudeAiOauth.refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  if (!res.ok) {
    throw new Error(`oauth refresh failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  const next: CredsFile = {
    claudeAiOauth: {
      ...creds.claudeAiOauth,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? creds.claudeAiOauth.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    },
  };
  await writeFile(CREDS_PATH, JSON.stringify(next), { mode: 0o600 });
  cached = next;
  return next;
}

export async function getClaudeOAuthToken(): Promise<string | null> {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return process.env.CLAUDE_CODE_OAUTH_TOKEN;

  let creds: CredsFile;
  try {
    creds = await load();
  } catch {
    return null;
  }

  const { accessToken, expiresAt } = creds.claudeAiOauth;
  const safetyMs = 60_000;
  if (expiresAt - safetyMs > Date.now()) return accessToken;

  const refreshed = await refresh(creds);
  return refreshed.claudeAiOauth.accessToken;
}

export const CLAUDE_CODE_SYSTEM_PREFIX = "You are Claude Code, Anthropic's official CLI for Claude.";
