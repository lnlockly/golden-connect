/**
 * Thin wrapper around the Telegram WebApp SDK (loaded in index.html).
 * All calls are no-ops in a regular web browser.
 */

interface TgThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  accent_text_color?: string;
}

interface TgWebApp {
  initData: string;              // raw URL-encoded payload
  initDataUnsafe?: {
    user?: { id: number; first_name?: string; username?: string };
    start_param?: string;
  };
  colorScheme?: 'light' | 'dark';
  themeParams?: TgThemeParams;
  ready: () => void;
  expand: () => void;
  close: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  MainButton?: { hide: () => void };
  BackButton?: { hide: () => void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function getWebApp(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

/**
 * True if the page runs inside a Telegram WebView (Mini App context).
 * Relies on `initData` being set by the Telegram client — absent in normal
 * browsers even when the SDK <script> is loaded.
 */
export function isTma(): boolean {
  const app = getWebApp();
  return !!app && typeof app.initData === 'string' && app.initData.length > 0;
}

/**
 * Signal the Mini App shell that React has mounted and is ready to paint.
 * Expands the webview to full height and paints the splash background.
 * Safe to call multiple times.
 */
export function initMiniApp(): void {
  const app = getWebApp();
  if (!app) return;
  try {
    app.ready();
    app.expand();
    app.setBackgroundColor?.('#0a0a0a');
    app.setHeaderColor?.('#0a0a0a');
  } catch {
    /* SDK version mismatch — degrade gracefully */
  }
}

export function getInitData(): string | null {
  const app = getWebApp();
  return app?.initData || null;
}

export function getStartParam(): string | null {
  return getWebApp()?.initDataUnsafe?.start_param ?? null;
}
