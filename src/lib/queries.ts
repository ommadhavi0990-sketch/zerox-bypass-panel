import { queryOptions, keepPreviousData } from "@tanstack/react-query";
import { DEFAULT_TELEGRAM } from "@/lib/zx";
import type { DbKey, DbNotice, DbReferral, DbSettings, DbTx, UserRow } from "./types";
import type { Me } from "./types";

export type { Me };

/* --------------------------------- session --------------------------------- */
/* The session token is an HMAC-signed string issued by the server (login /
 * fingerprint unlock). The browser keeps it and passes it with every API call;
 * the server re-verifies it each time. */

const TOKEN_KEY = "zx_token";
const API = "/api";

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

/** POST to a Nitro API route with JSON body. Returns parsed JSON. */
async function apiFetch(path: string, body: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ----------------------------- client API mutations ------------------------ */
/* These replace direct createServerFn calls (which hit /_serverFn/ and are
 * blocked by Render WAF). They POST to Nitro /api/ routes instead. */

export async function loginAccount(username: string, password: string): Promise<{ ok: true; token: string; me: Me } | { ok: false; error: string }> {
  const r = await apiFetch("/auth/login", { username, password });
  return r;
}

export async function registerAccount(username: string, password: string, referral: string): Promise<{ ok: true; token: string; me: Me } | { ok: false; error: string }> {
  const r = await apiFetch("/auth/register", { username, password, referral });
  return r;
}

export async function changeMyPassword(token: string, current: string, next: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFetch("/auth/change-password", { token, current, next });
}

export async function keysGenerate(body: { token: string; game: string; hours: number | null; devices: number; qty?: number; customKey?: string }): Promise<any> {
  return apiFetch("/keys/generate", body);
}

export async function keysDelete(token: string, id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFetch("/keys/delete", { token, id });
}

export async function keysResetDevices(token: string, id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFetch("/keys/reset-devices", { token, id });
}

export async function keysDeleteExpired(token: string): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  return apiFetch("/keys/delete-expired", { token });
}

export async function referralCreate(body: { token: string; role: string; hours: number | null; credit: number; uses: number; validHours: number }): Promise<any> {
  return apiFetch("/referrals/create", body);
}

export async function referralRevoke(token: string, id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFetch("/referrals/revoke", { token, id });
}

export async function noticeSend(body: { token: string; target: string; userId?: string; title: string; body: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFetch("/notices/send", body);
}

export async function noticeDelete(token: string, id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFetch("/notices/delete", { token, id });
}

export async function settingsUpdate(body: { token: string; prices?: { hours: number; price: number }[]; telegram?: { url: string; handle: string } }): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFetch("/settings/update", body);
}

export async function maintenanceSet(body: { token: string; on: boolean; message: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFetch("/maintenance/set", body);
}

export async function ownerCreateUser(body: { token: string; username: string; password: string; role: string; hours: number | null; credit: number }): Promise<any> {
  return apiFetch("/users/create", body);
}

export async function ownerSetPassword(body: { token: string; userId: string; password: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFetch("/users/set-password", body);
}

export async function ownerDeleteUser(body: { token: string; userId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFetch("/users/delete", body);
}

export async function ownerUpdateUser(body: { token: string; userId: string; role: string; status: string; expires_at: string | null; ref_limit: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFetch("/users/update", body);
}

export async function ownerAdjustBalance(body: { token: string; userId: string; mode: string; amount: number; note?: string }): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  return apiFetch("/users/balance", body);
}

export async function fpRegister(body: { token: string; credentialId: string }): Promise<any> {
  return apiFetch("/fingerprint/register", body);
}

export async function fpLogin(body: { credentialId: string }): Promise<{ ok: true; token: string; me: Me } | { ok: false; error: string; code?: string }> {
  return apiFetch("/fingerprint/login", body);
}

export async function fpRenew(body: { token: string; credentialId: string }): Promise<any> {
  return apiFetch("/fingerprint/renew", body);
}

export async function fpUnregister(body: { token: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFetch("/fingerprint/unregister", body);
}

/* ---------------------------------- queries -------------------------------- */

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    const token = getToken();
    if (!token) return null;
    const r = await apiFetch("/auth/me", { token });
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
    const r = await apiFetch("/settings/get");
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
    const r = await apiFetch("/settings/get");
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
    const r = await apiFetch("/stats/get", { token });
    if (!r.ok) return { total_keys: 0, active_keys: 0, expired_keys: 0, users: 0 };
    return { total_keys: r.total_keys, active_keys: r.active_keys, expired_keys: r.expired_keys, users: r.users };
  },
  staleTime: 15_000,
});

export const noticesQuery = queryOptions({
  queryKey: ["notices"],
  queryFn: async (): Promise<DbNotice[]> => {
    const token = getToken();
    if (!token) return [];
    const r = await apiFetch("/notices/list", { token });
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
      const r = await apiFetch("/transactions/list", { token, ...(onlyUserId ? { userId: onlyUserId } : {}) });
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
    const r = await apiFetch("/users/list", { token });
    return r.ok ? r.rows : [];
  },
  staleTime: 10_000,
});

export const referralsQuery = queryOptions({
  queryKey: ["referrals"],
  queryFn: async (): Promise<DbReferral[]> => {
    const token = getToken();
    if (!token) return [];
    const r = await apiFetch("/referrals/list", { token });
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
      const r = await apiFetch("/keys/list", { token, q, page });
      return r.ok ? { rows: r.rows, count: r.count } : { rows: [], count: 0 };
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}
