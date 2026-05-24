import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiGet, apiPost, AuthExpiredError, setStoredToken } from './api';
import { getInitData, getStartParam, isTma } from './telegram';

interface AuthOkResponse {
  ok: boolean;
  token?: string;
  user?: AuthUser;
}

// Shape returned by `GET /me` on trendex-api. Email/password auth only —
// wallet fields removed. Telegram link is tracked via `tg_id` /
// `tg_username` once the user clicks "Привязать Telegram" from the cabinet
// or logs in via the bot directly.
export interface AuthUser {
  id: number;
  ref_code: string;
  email?: string | null;
  tg_id?: number | null;
  tg_username?: string | null;
  is_admin?: boolean;
  invited_by?: {
    ref_code: string;
    username_masked?: string | null;
  } | null;
  joined_at?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refetch: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, refCode?: string | null, turnstileToken?: string | null) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface MeResponse {
  ok?: boolean;
  user?: AuthUser;
  invited_by?: AuthUser['invited_by'];
  ref_code?: string;
}

async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await apiGet<MeResponse | AuthUser>('/me');
    if (res && typeof res === 'object' && 'user' in res && res.user) {
      return {
        ...res.user,
        ref_code: res.user.ref_code ?? res.ref_code ?? '',
        invited_by: res.invited_by ?? res.user.invited_by ?? null,
      } as AuthUser;
    }
    return (res as AuthUser) ?? null;
  } catch (e) {
    if (e instanceof AuthExpiredError) return null;
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    const u = await fetchMe();
    setUser(u);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      let u = await fetchMe();
      // Silent login inside Telegram Mini App — POST initData to /auth/telegram
      // and refetch /me. User never sees a login screen inside the WebApp.
      if (!u && isTma()) {
        const initData = getInitData();
        if (initData) {
          try {
            const body: Record<string, unknown> = { init_data: initData };
            const ref = getStartParam();
            if (ref) body.ref_code = ref;
            const resp = await apiPost<AuthOkResponse>('/auth/telegram', body);
            if (resp?.token) setStoredToken(resp.token);
            u = await fetchMe();
          } catch {
            /* fall through — normal (unauth) state */
          }
        }
      }
      if (!active) return;
      setUser(u);
      setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // On success the backend sets the `af_session` cookie and returns
    // the user; we still re-fetch /me so the shape matches everywhere.
    const resp = await apiPost<AuthOkResponse>('/auth/login', { email, password });
    if (resp?.token) setStoredToken(resp.token);
    await refetch();
  }, [refetch]);

  const signup = useCallback(async (
    email: string,
    password: string,
    refCode?: string | null,
    turnstileToken?: string | null,
  ) => {
    const body: Record<string, unknown> = { email, password };
    if (refCode) body.ref_code = refCode;
    if (turnstileToken) body.turnstile_token = turnstileToken;
    const resp = await apiPost<AuthOkResponse>('/auth/signup', body);
    if (resp?.token) setStoredToken(resp.token);
    await refetch();
  }, [refetch]);

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } catch {
      // Even if the backend is unreachable we still reset local state —
      // the cookie may have already expired.
    }
    setStoredToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    refetch,
    login,
    signup,
    logout,
  }), [user, isLoading, refetch, login, signup, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
