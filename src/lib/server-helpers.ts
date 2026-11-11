// Small pure helpers shared by the server-function files. Safe on client and
// server (no node-only imports here).

import type { DbUser, Me } from "./types";
import type { Profile } from "@/lib/zx";

/** Build the public Me object from a db user row (drops password/passkey). */
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
  return { userId: u.id, profile, role: u.role };
}
