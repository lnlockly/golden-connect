/**
 * Curated catalog of ElizaOS plugins exposed in the Create Agent wizard.
 *
 * Keep this list small and opinionated — every plugin we ship here has a
 * known install path + sealed-secret strategy on the TrendeX k3s side.
 * Each entry lists the env-var secrets the runtime needs to start;
 * those are collected from the operator in the wizard and forwarded to
 * the deploy endpoint (never persisted in the generated character.json).
 */

export type ElizaPluginCategory = 'delivery' | 'social' | 'model' | 'chain' | 'data';

export interface ElizaPluginSecret {
  key: string;
  label: string;
  placeholder: string;
}

export interface ElizaPlugin {
  pkg: string;
  label: string;
  description: string;
  category: ElizaPluginCategory;
  needsSecret?: ElizaPluginSecret[];
}

export const ELIZA_PLUGINS: ElizaPlugin[] = [
  {
    pkg: '@elizaos/plugin-telegram',
    label: 'Telegram',
    description: 'Telegram bot client',
    category: 'delivery',
    needsSecret: [
      { key: 'TELEGRAM_BOT_TOKEN', label: 'Bot token (from @BotFather)', placeholder: '123:ABC...' },
    ],
  },
  {
    pkg: '@elizaos/plugin-discord',
    label: 'Discord',
    description: 'Discord bot client',
    category: 'social',
    needsSecret: [
      { key: 'DISCORD_APPLICATION_ID', label: 'App ID', placeholder: '...' },
      { key: 'DISCORD_API_TOKEN', label: 'Bot token', placeholder: '...' },
    ],
  },
  {
    pkg: '@elizaos/plugin-twitter',
    label: 'Twitter / X',
    description: 'Post + reply on X',
    category: 'social',
    needsSecret: [
      { key: 'TWITTER_USERNAME', label: 'Username', placeholder: 'my_agent' },
      { key: 'TWITTER_PASSWORD', label: 'Password', placeholder: '...' },
    ],
  },
  {
    pkg: '@elizaos/plugin-web',
    label: 'Web search',
    description: 'Browse and scrape the web',
    category: 'data',
  },
  {
    pkg: '@elizaos/plugin-openai',
    label: 'OpenAI',
    description: 'GPT-4o / o-series inference',
    category: 'model',
    needsSecret: [
      { key: 'OPENAI_API_KEY', label: 'OpenAI API key', placeholder: 'sk-...' },
    ],
  },
  {
    pkg: '@elizaos/plugin-anthropic',
    label: 'Anthropic',
    description: 'Claude inference',
    category: 'model',
    needsSecret: [
      { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', placeholder: 'sk-ant-...' },
    ],
  },
  {
    pkg: '@elizaos/plugin-evm',
    label: 'EVM chains',
    description: 'Transactions on Ethereum / Base / Arbitrum',
    category: 'chain',
  },
  {
    pkg: '@elizaos/plugin-solana',
    label: 'Solana',
    description: 'Solana transactions + wallet',
    category: 'chain',
  },
];

export const PLUGIN_CATEGORIES: ElizaPluginCategory[] = [
  'model',
  'delivery',
  'social',
  'chain',
  'data',
];

export function findPluginByPkg(pkg: string): ElizaPlugin | undefined {
  return ELIZA_PLUGINS.find((p) => p.pkg === pkg);
}
