/**
 * Turns the Create Agent wizard form state into a JSON object that
 * ElizaOS can load as a character. The shape follows the conventions
 * used by ElizaOS reference characters (name/bio/lore/style/plugins).
 *
 * Secrets are deliberately NOT embedded here — the wizard forwards
 * them to the deploy endpoint in a separate field so they can be
 * sealed via SOPS / sealed-secrets on the k3s side.
 */

export type CharacterStyle = 'formal' | 'friendly' | 'technical' | 'playful';

export interface CharacterFormInputs {
  name: string;
  ticker: string;
  tagline: string;
  bio: string;
  lore: string;
  topics: string;
  style: CharacterStyle;
  plugins: string[];
}

export interface ElizaCharacter {
  name: string;
  username: string;
  plugins: string[];
  modelProvider: 'anthropic' | 'openai';
  bio: string[];
  lore: string[];
  topics: string[];
  adjectives: string[];
  style: {
    all: string[];
    chat: string[];
    post: string[];
  };
  messageExamples: [];
  postExamples: [];
  knowledge: [];
  settings: {
    model: string;
    secrets: Record<string, string>;
  };
}

// Style → voice descriptors + baseline rules.
const STYLE_PROFILE: Record<CharacterStyle, {
  adjectives: string[];
  all: string[];
  chat: string[];
  post: string[];
}> = {
  formal: {
    adjectives: ['precise', 'measured', 'professional'],
    all: [
      'Keep responses concise and professional.',
      'Avoid slang and casual expressions.',
      'Cite facts plainly, without hedging.',
    ],
    chat: [
      'Respond in complete sentences.',
      'Stay on-topic; do not volunteer opinions.',
    ],
    post: [
      'Lead with the headline, follow with one supporting fact.',
      'Sign off cleanly, no emoji.',
    ],
  },
  friendly: {
    adjectives: ['warm', 'approachable', 'upbeat'],
    all: [
      'Sound like a helpful human, not a bot.',
      'Use contractions. Be concrete.',
      'It is fine to show small amounts of personality.',
    ],
    chat: [
      'Mirror the user\'s energy.',
      'Short replies are fine — do not pad.',
    ],
    post: [
      'Open with a hook, end with an invitation.',
      'A single emoji is allowed, not required.',
    ],
  },
  technical: {
    adjectives: ['rigorous', 'analytical', 'code-literate'],
    all: [
      'Prefer structured answers: bullets, short paragraphs, code blocks.',
      'Be explicit about assumptions and tradeoffs.',
      'No filler, no apologies for length when length is warranted.',
    ],
    chat: [
      'Ask a clarifying question when the request is ambiguous.',
      'Quote exact identifiers / versions when referencing software.',
    ],
    post: [
      'Link or name the source whenever possible.',
      'Keep jargon — the audience speaks it.',
    ],
  },
  playful: {
    adjectives: ['witty', 'irreverent', 'sharp'],
    all: [
      'Lean into wordplay and dry humour.',
      'Never at the user\'s expense.',
      'Stay useful — the joke is the wrapper, not the answer.',
    ],
    chat: [
      'Short and zippy beats long and earnest.',
      'Callbacks to earlier turns are encouraged.',
    ],
    post: [
      'One sharp line, not three. Land the punchline.',
      'Emoji sparingly, only when they actually add something.',
    ],
  },
};

// Split a block of prose into sentences at ./!/? boundaries. Keeps
// short paragraphs as single entries if they lack terminators.
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/(?<=[.!?])\s+(?=[A-ZА-ЯЁ0-9])/u)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [trimmed];
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitTopics(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Deterministic slug: lowercase latin letters, digits, dashes.
// Cyrillic passes through a minimal transliteration table so that
// an agent named "Кафе-бот" still produces a usable k8s-safe username.
const CYR_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function toUsername(name: string): string {
  const lowered = name.toLowerCase();
  let out = '';
  for (const ch of lowered) {
    if (CYR_MAP[ch] !== undefined) out += CYR_MAP[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/[\s_-]/.test(ch)) out += '-';
  }
  return out.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Model provider + concrete model id derive from the selected
// plugin set. Anthropic wins ties — it is our default narrative.
function pickModel(plugins: string[]): { provider: 'anthropic' | 'openai'; model: string } {
  const hasOpenAI = plugins.includes('@elizaos/plugin-openai');
  const hasAnthropic = plugins.includes('@elizaos/plugin-anthropic');
  if (hasAnthropic) return { provider: 'anthropic', model: 'claude-sonnet-4-6' };
  if (hasOpenAI) return { provider: 'openai', model: 'gpt-4o' };
  return { provider: 'anthropic', model: 'claude-sonnet-4-6' };
}

export function buildCharacter(input: CharacterFormInputs): ElizaCharacter {
  const profile = STYLE_PROFILE[input.style];
  const { provider, model } = pickModel(input.plugins);

  return {
    name: input.name.trim(),
    username: toUsername(input.name),
    plugins: [...input.plugins],
    modelProvider: provider,
    bio: splitSentences(input.bio),
    lore: splitLines(input.lore).slice(0, 8),
    topics: splitTopics(input.topics),
    adjectives: [...profile.adjectives],
    style: {
      all: [...profile.all],
      chat: [...profile.chat],
      post: [...profile.post],
    },
    messageExamples: [],
    postExamples: [],
    knowledge: [],
    settings: {
      model,
      // Secrets are always empty in the generated JSON we show to the
      // user and download — they travel in a separate payload field.
      secrets: {},
    },
  };
}

// Field-level validation used by the wizard.
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 40) {
    return 'length';
  }
  // Latin + Cyrillic letters, digits, dash, underscore, space.
  if (!/^[A-Za-zА-Яа-яЁё0-9 _-]+$/u.test(trimmed)) {
    return 'charset';
  }
  return null;
}

export function validateTicker(ticker: string): string | null {
  const trimmed = ticker.trim().toUpperCase();
  if (trimmed.length < 3 || trimmed.length > 8) return 'length';
  if (!/^[A-Z0-9]+$/.test(trimmed)) return 'charset';
  return null;
}

export function validateTagline(tagline: string): string | null {
  if (tagline.length > 80) return 'length';
  return null;
}

export function validateBio(bio: string): string | null {
  const trimmed = bio.trim();
  if (trimmed.length < 20) return 'too_short';
  return null;
}

export function validateTopics(raw: string): string | null {
  const list = splitTopics(raw);
  if (list.length < 3) return 'too_few';
  if (list.length > 10) return 'too_many';
  return null;
}
