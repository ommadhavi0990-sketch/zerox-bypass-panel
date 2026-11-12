// Shared data shapes for the GitHub-backed panel database.
// Client-safe (no server imports): queries.ts and the server store both use these.

import type { AccountStatus, AppRole, Profile } from "@/lib/zx";

/** A registered WebAuthn fingerprint credential + expiry. */
export type DbPasskey = { id: string; expires_at: string };

/** What a user row looks like in db.json (server only fields included). */
export type DbUser = Profile & {
  password_hash: string;
  last_active_at: string | null;
  /** This user's latest registered fingerprint unlock (WebAuthn credential id + expiry). */
  passkey: DbPasskey | null;
  /** All registered fingerprint passkeys for this user (supports multiple browsers/devices). */
  passkeys?: DbPasskey[];
};

/** A user row safe to send to the browser (no password hash / passkeys). */
export type UserRow = Omit<DbUser, "password_hash" | "passkey" | "passkeys">;

export type DbKey = {
  id: number;
  license_key: string;
  game: string;
  duration_hours: number | null;
  max_devices: number;
  /** Device serials bound to this key via the connect API. */
  devices: string[];
  created_by: string;
  created_by_name: string;
  created_at: string;
  expires_at: string | null;
};

export type DbReferral = {
  id: number;
  code: string;
  role: AppRole;
  duration_hours: number | null;
  credit: number;
  uses: number;
  max_uses: number;
  expires_at: string;
  revoked: boolean;
  created_by: string;
  created_by_name: string;
  redemptions: { username: string; at: string }[];
};

export type DbTx = {
  id: number;
  user_id: string;
  username: string;
  kind: string;
  details: string;
  amount: number;
  balance_after: number | null;
  created_at: string;
};

export type DbNotice = {
  id: number;
  title: string;
  body: string;
  target_role: AppRole | null;
  target_user_id: string | null;
  created_by: string;
  created_at: string;
};

export type DbSettings = {
  prices: { hours: number; price: number }[];
  telegram: { url: string; handle: string };
  maintenance: { on: boolean; message: string };
};

/** The whole db.json document. */
export type Db = {
  version: number;
  seq: Record<"user" | "key" | "referral" | "tx" | "notice", number>;
  users: DbUser[];
  keys: DbKey[];
  referrals: DbReferral[];
  transactions: DbTx[];
  notices: DbNotice[];
  settings: DbSettings;
};

/** Who is signed in (mirrors the session user, without secret fields). */
export type Me = {
  userId: string;
  profile: Profile | null;
  role: AppRole | null;
  passkeyCount?: number;
  passkeyUntil?: string | null;
};
