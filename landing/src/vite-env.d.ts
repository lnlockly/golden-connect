/// <reference types="vite/client" />

// Narrow the subset of env vars the client actually reads. Anything
// not listed here still works via `import.meta.env.X` through the
// wildcard typing from `vite/client`, but keeping the important ones
// typed protects callers from typos.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WC_PROJECT_ID?: string;
  readonly VITE_BSC_CHAIN?: 'mainnet' | 'testnet';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
