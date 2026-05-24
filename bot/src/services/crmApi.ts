// bot/src/services/crmApi.ts
// Server-to-server HTTP client for the cabinet CRM (/api/mlm/*).
// Bypasses end-user auth by sending X-Internal-Secret + X-Internal-Owner.
// Cabinet middleware (`internalImpersonate`) trusts these headers and acts
// as if the named TG user had hit the endpoint with cookies.

const CABINET_BASE =
  process.env.CABINET_INTERNAL_URL ||
  process.env.CABINET_URL ||
  "http://goldenConnect-cabinet";
const SECRET = process.env.INTERNAL_API_SECRET || "";

function ownerHeader(tgId: number | string): string {
  return tgId.toString().startsWith("tg_") ? String(tgId) : "tg_" + tgId;
}

async function call<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  pathRaw: string,
  ownerTgId: number | string,
  body?: unknown,
): Promise<T> {
  const path = pathRaw.startsWith("/api/")
    ? pathRaw
    : pathRaw.startsWith("/")
      ? pathRaw
      : "/" + pathRaw;
  const url = CABINET_BASE + path;
  const headers: Record<string, string> = {
    "X-Internal-Secret": SECRET,
    "X-Internal-Owner": ownerHeader(ownerTgId),
  };
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* leave null */
  }
  if (!r.ok) {
    const reason =
      data && typeof data === "object" && "reason" in data
        ? (data as { reason: string }).reason
        : String(r.status);
    throw new Error("crm_api_" + reason);
  }
  return data as T;
}

export type CrmContact = {
  username: string;
  name?: string;
  company?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  category?: string;
  contacts?: {
    telegram?: string;
    whatsapp?: string;
    vk?: string;
    instagram?: string;
    facebook?: string;
  };
  crm?: { status?: string; tags?: string[]; needs?: string; lastNote?: string };
  description?: string;
  photo?: string;
};

export type CrmTask = {
  id: string;
  title: string;
  due?: string;
  done?: boolean;
  username?: string;
  notes?: string;
};

export type CrmSnapshot = {
  dashboard: {
    total?: number;
    newToday?: number;
    inProgress?: number;
    dealsOpen?: number;
    dealsWon?: number;
    revenue?: number;
  };
  today: {
    items?: CrmContact[];
    offer?: string;
  };
  pipeline: {
    stages?: Array<{ stage: string; count: number; sum: number }>;
  };
  tasksOpen: CrmTask[];
};

export const crm = {
  /** Search contacts (no per-owner filter — only fields). */
  async search(
    ownerTgId: number,
    q: string,
    limit = 12,
  ): Promise<CrmContact[]> {
    const r = await call<{ ok: boolean; items: CrmContact[] }>(
      "GET",
      `/api/mlm/_internal/search?ownerId=${encodeURIComponent("tg_" + ownerTgId)}&q=${encodeURIComponent(q)}&limit=${limit}`,
      ownerTgId,
    );
    return r.items || [];
  },

  /** Snapshot for /today /pipeline /stats commands. */
  async snapshot(ownerTgId: number): Promise<CrmSnapshot> {
    const r = await call<{ ok: boolean } & CrmSnapshot>(
      "GET",
      `/api/mlm/_internal/snapshot?ownerId=${encodeURIComponent("tg_" + ownerTgId)}`,
      ownerTgId,
    );
    return r;
  },

  /** Manually add a contact (used by /add wizard). */
  async addContact(ownerTgId: number, body: Partial<CrmContact>): Promise<CrmContact> {
    const r = await call<{ ok: boolean; contact: CrmContact }>(
      "POST",
      "/api/mlm/contacts/manual",
      ownerTgId,
      body,
    );
    return r.contact;
  },

  /** Add a task (used by /add task or reminder flow). */
  async addTask(ownerTgId: number, body: Partial<CrmTask>): Promise<CrmTask> {
    const r = await call<{ ok: boolean; task: CrmTask }>(
      "POST",
      "/api/mlm/tasks",
      ownerTgId,
      body,
    );
    return r.task;
  },

  /** Mark task done. */
  async completeTask(ownerTgId: number, taskId: string): Promise<void> {
    await call("PUT", "/api/mlm/tasks/" + encodeURIComponent(taskId), ownerTgId, { done: true });
  },

  /** Postpone task by N days. */
  async snoozeTask(ownerTgId: number, taskId: string, days = 1): Promise<void> {
    const due = new Date(Date.now() + days * 86_400_000).toISOString();
    await call("PUT", "/api/mlm/tasks/" + encodeURIComponent(taskId), ownerTgId, { due });
  },

  /** AI pitch generation (Groq). */
  async generatePitch(
    ownerTgId: number,
    username: string,
    extra?: { offer?: string; tone?: string },
  ): Promise<string> {
    const r = await call<{ ok: boolean; text?: string; pitch?: string }>(
      "POST",
      `/api/mlm/contacts/${encodeURIComponent(username)}/generate-pitch`,
      ownerTgId,
      extra || {},
    );
    return r.text || r.pitch || "";
  },

  /** Append history (used by voice/photo enrichment). */
  async appendHistory(
    ownerTgId: number,
    username: string,
    msg: string,
    direction: "in" | "out" | "note" = "note",
  ): Promise<void> {
    await call(
      "POST",
      `/api/mlm/contacts/${encodeURIComponent(username)}/history`,
      ownerTgId,
      { msg, direction },
    );
  },

  /** Patch contact note (status, tags, needs). */
  async setNote(
    ownerTgId: number,
    username: string,
    patch: { status?: string; needs?: string; tags?: string[]; lastNote?: string },
  ): Promise<void> {
    await call(
      "PUT",
      `/api/mlm/contacts/${encodeURIComponent(username)}/crm`,
      ownerTgId,
      patch,
    );
  },

  /** Get a single contact (used by /pitch and inline). */
  async getContact(ownerTgId: number, username: string): Promise<CrmContact | null> {
    try {
      const r = await call<{ ok: boolean; contact: CrmContact }>(
        "GET",
        "/api/mlm/contacts/" + encodeURIComponent(username),
        ownerTgId,
      );
      return r.contact;
    } catch {
      return null;
    }
  },

  /** Pick next best lead to work; pass usernames to skip from this session. */
  async nextLead(
    ownerTgId: number,
    skip: string[] = [],
  ): Promise<{ contact: CrmContact | null; exhausted?: boolean; progress?: { scheduled: number; untouched: number } }> {
    const q = new URLSearchParams({
      ownerId: 'tg_' + ownerTgId,
      skip: skip.join(','),
    }).toString();
    const r = await call<{ ok: boolean; contact: CrmContact | null; exhausted?: boolean; progress?: { scheduled: number; untouched: number } }>(
      'GET',
      '/api/mlm/_internal/next-lead?' + q,
      ownerTgId,
    );
    return r;
  },

  /** AI sales-coach reply with optional active lead + conversation memory. */
  async coach(
    ownerTgId: number,
    question: string,
    opts: { leadUsername?: string | null; history?: Array<{ role: 'user' | 'assistant'; content: string }> } = {},
  ): Promise<string> {
    const r = await call<{ ok: boolean; text?: string }>(
      'POST',
      '/api/mlm/_internal/coach',
      ownerTgId,
      { ownerId: 'tg_' + ownerTgId, leadUsername: opts.leadUsername || null, question, history: opts.history || [] },
    );
    return r.text || '';
  },

  /** Internal: fetch digest batch for everyone (push scheduler). */
  async digestBatch(): Promise<
    Array<{
      ownerId: string;
      chatId: number;
      lang: string;
      digest: {
        tasksDueToday: CrmTask[];
        tasksTotalOpen: number;
        leadsNew: number;
        leadsInProgress: number;
        dealsWon: number;
        dealsOpen: number;
      };
    }>
  > {
    const url = CABINET_BASE + "/api/mlm/_internal/digest-batch";
    const r = await fetch(url, {
      method: "GET",
      headers: { "X-Internal-Secret": SECRET },
    });
    if (!r.ok) throw new Error("digest_batch_" + r.status);
    const j = (await r.json()) as { ok: boolean; items: unknown[] };
    return (j.items || []) as Awaited<ReturnType<typeof crm.digestBatch>>;
  },

  /** Internal: ingest a business-bot incoming message into CRM history. */
  async recordBusinessMessage(
    ownerId: string,
    fromUsername: string,
    text: string,
    direction: "in" | "out" = "in",
  ): Promise<void> {
    const url = CABINET_BASE + "/api/mlm/_internal/business-message";
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": SECRET,
      },
      body: JSON.stringify({ ownerId, fromUsername, text, direction }),
    });
  },
};
