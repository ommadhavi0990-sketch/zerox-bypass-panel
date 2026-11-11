import { queryOptions } from "@tanstack/react-query";
import type { AppRole, Profile } from "@/lib/zx";

export type Me = { userId: string; profile: Profile | null; role: AppRole | null };

const SESSION_KEY = "zx_local_session";

function getSession(): {
  id: string;
  username: string;
  role: AppRole;
  balance: number;
  expires_at: string | null;
} | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

/** The current local session as a Me object (no query machinery — usable in route guards). */
export function currentMe(): Me | null {
  const s = getSession();
  if (!s) return null;
  const profile: Profile = {
    id: s.id,
    username: s.username,
    role: s.role,
    status: "active",
    balance: s.balance,
    ref_used: 0,
    ref_limit: 10,
    expires_at: s.expires_at,
    created_at: new Date().toISOString(),
    uplink: null,
  };
  return { userId: s.id, profile, role: s.role };
}

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => currentMe(),
  staleTime: 15_000,
});

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async () => ({ url: "https://t.me/ONExZEROXX", handle: "@ONExZEROXX" }),
  placeholderData: { url: "https://t.me/ONExZEROXX", handle: "@ONExZEROXX" },
  staleTime: 5 * 60_000,
});

export const pricesQuery = queryOptions({
  queryKey: ["prices"],
  queryFn: async () => [
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
  queryFn: async () => ({ total_keys: 0, active_keys: 0, expired_keys: 0, users: 1 }),
  staleTime: 15_000,
});

export const noticesQuery = queryOptions({
  queryKey: ["notices"],
  queryFn: async () => [],
  staleTime: 30_000,
});

export function transactionsQuery(onlyUserId?: string) {
  return queryOptions({
    queryKey: ["transactions", onlyUserId ?? "all"],
    queryFn: async () => [],
    staleTime: 10_000,
  });
}

export const usersQuery = queryOptions({
  queryKey: ["users"],
  queryFn: async () => [],
  staleTime: 10_000,
});

export const referralsQuery = queryOptions({
  queryKey: ["referrals"],
  queryFn: async () => [],
  staleTime: 10_000,
});
