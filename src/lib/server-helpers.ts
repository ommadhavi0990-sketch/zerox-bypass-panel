// Small pure helpers shared by the server-function files. Safe on client and
// server (no node-only imports here).

import type { DbPasskey, DbUser, Me } from "./types";
import type { Profile } from "@/lib/zx";

/** Merge legacy single `passkey` and multi-device `passkeys` into one deduplicated list. */
export function userPasskeys(u: Pick<DbUser, "passkey" | "passkeys">): DbPasskey[] {
  const list = [...(u.passkeys ?? [])];
  if (u.passkey && !list.some((p) => p.id === u.passkey!.id)) list.push(u.passkey);
  return list;
}

/** Build the public Me object from a db user row (drops password and credential ids). */
export function meOf(u: DbUser): Me {
  const profile: Profile = {
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
    balance: u.balance,
    ref_used: u.ref_used,
    ref_limit: u.ref_limit,
    expires_at: u.expires_at,
    created_at: u.created_at,
    uplink: u.uplink,
  };
  const keys = userPasskeys(u);
  const latest = keys.reduce<string | null>(
    (best, p) => (!best || p.expires_at > best ? p.expires_at : best),
    null,
  );
  return { userId: u.id, profile, role: u.role, passkeyCount: keys.length, passkeyUntil: latest };
}
