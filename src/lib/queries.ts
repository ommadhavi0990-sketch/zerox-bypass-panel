import { queryOptions, keepPreviousData } from "@tanstack/react-query";
import { DEFAULT_TELEGRAM } from "@/lib/zx";
import { meAccount } from "./auth.functions";
import {
  keysList,
  noticesList,
  referralsList,
  settingsGet,
  statsGet,
  transactionsList,
  usersList,
} from "./data.functions";
import type { DbKey, DbNotice, DbReferral, DbSettings, DbTx, UserRow } from "./types";
import type { Me } from "./types";

export type { Me };

/* --------------------------------- session --------------------------------- */
/* The session token is an HMAC-signed string issued by the server (login /
 * fingerprint unlock). The browser keeps it and passes it with every server
 * function call; the server re-verifies it each time. */

const TOKEN_KEY = "zx_token";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}
export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
export function hasSession(): boolean {
  return !!getToken();
}

/** Old demo-mode leftovers (pre-database builds stored users in localStorage). */
export function clearLegacyLocalData(): void {
  try {
    localStorage.removeItem("zx_local_users");
    sessionStorage.removeItem("zx_local_session");
  } catch {
    /* ignore */
  }
}

/* ---------------------------------- queries -------------------------------- */

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    const token = getToken();
    if (!token) return null;
    const r = await meAccount({ data: { token } });
    if (!r.ok) {
      clearToken();
      return null;
    }
    return r.me;
  },
  staleTime: 15_000,
});

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async (): Promise<DbSettings> => {
    const r = await settingsGet();
    if (!r.ok) throw new Error(r.error);
    return r.settings;
  },
  placeholderData: {
    prices: [],
    telegram: DEFAULT_TELEGRAM,
    maintenance: { on: false, message: "" },
  } satisfies DbSettings,
  staleTime: 60_000,
});

export const pricesQuery = queryOptions({
  queryKey: ["prices"],
  queryFn: async (): Promise<{ hours: number; price: number }[]> => {
    const r = await settingsGet();
    if (!r.ok) throw new Error(r.error);
    return r.settings.prices;
  },
  placeholderData: [
    { hours: 24, price: 49 },
    { hours: 72, price: 129 },
    { hours: 168, price: 249 },
    { hours: 360, price: 499 },
    { hours: 720, price: 999 },
  ],
  staleTime: 60_000,
});

export const statsQuery = queryOptions({
  queryKey: ["stats"],
  queryFn: async () => {
    const token = getToken();
    if (!token) return { total_keys: 0, active_keys: 0, expired_keys: 0, users: 0 };
    const r = await statsGet({ data: { token } });
    if (!r.ok) return { total_keys: 0, active_keys: 0, expired_keys: 0, users: 0 };
    return {
      total_keys: r.total_keys,
      active_keys: r.active_keys,
      expired_keys: r.expired_keys,
      users: r.users,
    };
  },
  staleTime: 15_000,
});

export const noticesQuery = queryOptions({
  queryKey: ["notices"],
  queryFn: async (): Promise<DbNotice[]> => {
    const token = getToken();
    if (!token) return [];
    const r = await noticesList({ data: { token } });
    return r.ok ? r.rows : [];
  },
  staleTime: 30_000,
});

export function transactionsQuery(onlyUserId?: string) {
  return queryOptions({
    queryKey: ["transactions", onlyUserId ?? "all"],
    queryFn: async (): Promise<DbTx[]> => {
      const token = getToken();
      if (!token) return [];
      const r = await transactionsList({
        data: { token, ...(onlyUserId ? { userId: onlyUserId } : {}) },
      });
      return r.ok ? r.rows : [];
    },
    staleTime: 10_000,
  });
}

export const usersQuery = queryOptions({
  queryKey: ["users"],
  queryFn: async (): Promise<UserRow[]> => {
    const token = getToken();
    if (!token) return [];
    const r = await usersList({ data: { token } });
    return r.ok ? r.rows : [];
  },
  staleTime: 10_000,
});

export const referralsQuery = queryOptions({
  queryKey: ["referrals"],
  queryFn: async (): Promise<DbReferral[]> => {
    const token = getToken();
    if (!token) return [];
    const r = await referralsList({ data: { token } });
    return r.ok ? r.rows : [];
  },
  staleTime: 10_000,
});

export function keysQuery(page: number, q: string) {
  return queryOptions({
    queryKey: ["keys", page, q],
    queryFn: async (): Promise<{ rows: DbKey[]; count: number }> => {
      const token = getToken();
      if (!token) return { rows: [], count: 0 };
      const r = await keysList({ data: { token, q, page } });
      return r.ok ? { rows: r.rows, count: r.count } : { rows: [], count: 0 };
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}
