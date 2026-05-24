/**
 * Monitor repo — bot-side facade over /internal/admin/monitor/* (shared
 * secret). Lets the admin manage which group chats the bot logs activity
 * for (membership / messages).
 */
import type { ApiClient } from "../api/client.js";

export interface MonitoredChatRow {
  id: number;
  chat_id: number;
  chat_title: string | null;
  added_by_user_id: number | null;
  tracking: 'members' | 'activity' | 'all';
  active: boolean;
  added_at: string;
}

export class MonitorRepo {
  constructor(private readonly api: ApiClient) {}

  async list(): Promise<MonitoredChatRow[]> {
    try {
      const r = await this.api.getJson<{ ok: boolean; chats: MonitoredChatRow[] }>(
        `/internal/admin/monitor/chats`,
      );
      return r.chats ?? [];
    } catch {
      return [];
    }
  }

  async add(input: {
    chat_id: number;
    chat_title?: string | null;
    tracking: 'members' | 'activity' | 'all';
  }): Promise<MonitoredChatRow | { error: string }> {
    try {
      const r = await this.api.postJson<{ ok: boolean; chat: MonitoredChatRow }>(
        `/internal/admin/monitor/chats`,
        input,
      );
      return r.chat;
    } catch (e: any) {
      return { error: String(e?.message ?? e) };
    }
  }

  async del(chatId: number): Promise<boolean> {
    try {
      await this.api.deleteJson(`/internal/admin/monitor/chats/${chatId}`);
      return true;
    } catch {
      return false;
    }
  }
}
