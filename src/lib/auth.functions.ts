import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DbUser, Me } from "./types";
import { meOf, userPasskeys } from "./server-helpers";

/* Server functions backed by the GitHub-as-database store (gh-store.server.ts).
 * Handlers dynamically import the store so its node:crypto / GitHub API code
 * never enters the client bundle. The browser keeps the session token and
 * passes it with every call; the server verifies it (HMAC) on each request. */

type Fail = { ok: false; error: string };
type LoginOk = { ok: true; token: string; me: Me };
type LoginResult = LoginOk | Fail;

const usernameField = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_]{4,24}$/, "Username must be 4-24 letters, numbers or _");
const passwordField = z.string().min(6, "Password must be at least 6 characters").max(64);
const b64 = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+={0,2}$/)
  .transform((s) => s.replace(/=+$/, ""));

/* ------------------------------- sign in / up ------------------------------ */

export const loginAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ username: z.string().trim().min(1).max(24), password: z.string().min(1).max(64) })
      .parse(d),
  )
  .handler(async ({ data }): Promise<LoginResult> => {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
    const { db } = await s.readDb();
    const u = s.findUser(db, data.username);
    if (!u || !(await s.verifyPassword(data.password, u.password_hash)))
      return { ok: false, error: "Wrong username or password" };
    if (u.status === "banned")
      return { ok: false, error: "This account is banned. Contact the Owner." };
    if (u.status === "blocked")
      return { ok: false, error: "This account is blocked. Contact the Owner." };
    // Touch last-seen (cheap single write, only on a successful login).
    await s.mutateDb(async (d2) => {
      const x = s.findUser(d2, u.username);
      if (x) x.last_active_at = new Date().toISOString();
    }, `login: ${u.username}`);
    return { ok: true, token: await s.signToken(u.id), me: meOf(u) };
  });

export const registerAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        username: usernameField,
        password: passwordField,
        referral: z.string().trim().min(4, "Enter a valid referral code").max(32),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<LoginResult> => {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) return { ok: false, error: s.storageError() };

    // Validate first (no wasted DB commits on typos).
    const { db } = await s.readDb();
    const code = data.referral.trim().toUpperCase();
    const ref = db.referrals.find((r) => r.code === code);
    if (
      !ref ||
      ref.revoked ||
      ref.uses >= ref.max_uses ||
      new Date(ref.expires_at).getTime() <= Date.now()
    )
      return { ok: false, error: "Invalid, expired or fully-used referral code" };
    if (s.findUser(db, data.username)) return { ok: false, error: "Username already taken" };

    let out: LoginResult = { ok: false, error: "Registration failed — try again" };
    await s.mutateDb(async (d2) => {
      // Re-check inside the mutation (atomic against concurrent signups).
      const r = d2.referrals.find((x) => x.code === code);
      if (!r || r.revoked || r.uses >= r.max_uses || new Date(r.expires_at).getTime() <= Date.now())
        return;
      if (s.findUser(d2, data.username)) {
        out = { ok: false, error: "Username already taken" };
        return;
      }
      const now = new Date().toISOString();
      const user: DbUser = {
        id: `u_${s.nextId(d2, "user")}`,
        username: data.username.trim(),
        password_hash: await s.hashPassword(data.password),
        role: r.role,
        status: "active",
        balance: r.credit,
        ref_used: 0,
        ref_limit: r.role === "reseller" ? 0 : 10,
        expires_at: r.duration_hours
          ? new Date(Date.now() + r.duration_hours * 3_600_000).toISOString()
          : null,
        created_at: now,
        last_active_at: now,
        uplink: r.created_by_name,
        passkey: null,
      };
      d2.users.push(user);
      r.uses += 1;
      r.redemptions.push({ username: user.username, at: now });
      s.addTx(
        d2,
        user,
        "account_created",
        `Registered with code ${r.code} (uplink ${r.created_by_name})`,
        0,
        user.balance,
      );
      out = { ok: true, token: await s.signToken(user.id), me: meOf(user) };
    }, `register: ${data.username}`);
    return out;
  });

export const meAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1).max(512) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; me: Me } | Fail> => {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
    const v = await s.verifyToken(data.token);
    if (!v) return { ok: false, error: "Session expired" };
    const { db } = await s.readDb();
    const u = db.users.find((x) => x.id === v.uid);
    if (!u || u.status !== "active") return { ok: false, error: "Session expired" };
    return { ok: true, me: meOf(u) };
  });

export const changeMyPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ token: z.string().min(1), current: z.string().min(1).max(64), next: passwordField })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
    const v = await s.verifyToken(data.token);
    if (!v) return { ok: false, error: "Session expired — log in again" };
    const { db } = await s.readDb();
    const me = db.users.find((x) => x.id === v.uid);
    if (!me || !(await s.verifyPassword(data.current, me.password_hash)))
      return { ok: false, error: "Current password is wrong" };
    const hash = await s.hashPassword(data.next);
    await s.mutateDb(async (d2) => {
      const x = d2.users.find((u) => u.id === me.id);
      if (x) x.password_hash = hash;
    }, `password change: ${me.username}`);
    return { ok: true };
  });

/* ------------------------------ owner: users ------------------------------- */

const createUserSchema = z.object({
  token: z.string().min(1),
  username: usernameField,
  password: passwordField,
  role: z.enum(["owner", "admin", "reseller"]),
  hours: z.number().int().positive().nullable(),
  credit: z.number().int().min(0).max(100_000_000),
});

export const ownerCreateUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createUserSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; username: string } | Fail> => {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
    const v = await s.verifyToken(data.token);
    if (!v) return { ok: false, error: "Session expired — log in again" };
    const { db } = await s.readDb();
    const me = db.users.find((x) => x.id === v.uid);
    if (!me || me.role !== "owner")
      return { ok: false, error: "Only the Owner can create accounts" };
    if (s.findUser(db, data.username)) return { ok: false, error: "Username already taken" };

    const now = new Date().toISOString();
    const hash = await s.hashPassword(data.password);
    let out: { ok: true; username: string } | Fail = {
      ok: false,
      error: "Could not create the account",
    };
    await s.mutateDb(async (d2) => {
      if (s.findUser(d2, data.username)) {
        out = { ok: false, error: "Username already taken" };
        return;
      }
      const user: DbUser = {
        id: `u_${s.nextId(d2, "user")}`,
        username: data.username.trim(),
        password_hash: hash,
        role: data.role,
        status: "active",
        balance: data.credit,
        ref_used: 0,
        ref_limit: data.role === "reseller" ? 0 : 10,
        expires_at: data.hours ? new Date(Date.now() + data.hours * 3_600_000).toISOString() : null,
        created_at: now,
        last_active_at: now,
        uplink: me.username,
        passkey: null,
      };
      d2.users.push(user);
      s.addTx(
        d2,
        user,
        "account_created",
        `Created by ${me.username} (${data.role})`,
        0,
        user.balance,
      );
      out = { ok: true, username: user.username };
    }, `owner create user: ${data.username}`);
    return out;
  });

export const ownerSetPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ token: z.string().min(1), userId: z.string().min(1), password: passwordField })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
    const v = await s.verifyToken(data.token);
    if (!v) return { ok: false, error: "Session expired — log in again" };
    const { db } = await s.readDb();
    const me = db.users.find((x) => x.id === v.uid);
    if (!me || me.role !== "owner") return { ok: false, error: "Only the Owner can set passwords" };
    const hash = await s.hashPassword(data.password);
    let out: { ok: true } | Fail = { ok: false, error: "User not found" };
    await s.mutateDb(async (d2) => {
      const u = d2.users.find((x) => x.id === data.userId);
      if (!u) return;
      u.password_hash = hash;
      out = { ok: true };
    }, `owner set password: ${data.userId}`);
    return out;
  });

export const ownerDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(1), userId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
    const v = await s.verifyToken(data.token);
    if (!v) return { ok: false, error: "Session expired — log in again" };
    const { db } = await s.readDb();
    const me = db.users.find((x) => x.id === v.uid);
    if (!me || me.role !== "owner")
      return { ok: false, error: "Only the Owner can delete accounts" };
    const target = db.users.find((x) => x.id === data.userId);
    if (!target) return { ok: false, error: "User not found" };
    if (target.id === me.id) return { ok: false, error: "You cannot delete your own account" };
    if (target.role === "owner" && db.users.filter((u) => u.role === "owner").length <= 1)
      return { ok: false, error: "Cannot delete the last Owner account" };

    await s.mutateDb(async (d2) => {
      d2.users = d2.users.filter((u) => u.id !== data.userId);
    }, `owner delete user: ${target.username}`);
    return { ok: true };
  });

export const ownerUpdateUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1),
        userId: z.string().min(1),
        role: z.enum(["owner", "admin", "reseller"]),
        status: z.enum(["active", "banned", "blocked"]),
        expires_at: z
          .string()
          .nullable()
          .transform((val) => {
            if (!val) return null;
            const d = new Date(val);
            return Number.isNaN(d.getTime()) ? null : d.toISOString();
          }),
        ref_limit: z.number().int().min(0).max(1_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
    const v = await s.verifyToken(data.token);
    if (!v) return { ok: false, error: "Session expired — log in again" };
    const { db } = await s.readDb();
    const me = db.users.find((x) => x.id === v.uid);
    if (!me || me.role !== "owner") return { ok: false, error: "Only the Owner can edit accounts" };
    const target = db.users.find((x) => x.id === data.userId);
    if (!target) return { ok: false, error: "User not found" };
    if (
      target.role === "owner" &&
      data.role !== "owner" &&
      db.users.filter((u) => u.role === "owner").length <= 1
    )
      return { ok: false, error: "Cannot demote the last Owner account" };
    if (target.id === me.id && data.status !== "active")
      return { ok: false, error: "You cannot block or ban yourself" };

    await s.mutateDb(async (d2) => {
      const u = d2.users.find((x) => x.id === data.userId);
      if (!u) return;
      u.role = data.role;
      u.status = data.status;
      u.expires_at = data.expires_at;
      u.ref_limit = data.ref_limit;
      s.addTx(
        d2,
        u,
        "owner_edit",
        `Updated by ${me.username} → ${data.role} / ${data.status}`,
        0,
        u.balance,
      );
    }, `owner edit user: ${target.username}`);
    return { ok: true };
  });

export const ownerAdjustBalance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1),
        userId: z.string().min(1),
        mode: z.enum(["add", "subtract", "set"]),
        amount: z.number().int().min(0).max(100_000_000),
        note: z.string().trim().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; balance: number } | Fail> => {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
    const v = await s.verifyToken(data.token);
    if (!v) return { ok: false, error: "Session expired — log in again" };
    const { db } = await s.readDb();
    const me = db.users.find((x) => x.id === v.uid);
    if (!me || me.role !== "owner")
      return { ok: false, error: "Only the Owner can adjust balances" };
    const target = db.users.find((x) => x.id === data.userId);
    if (!target) return { ok: false, error: "User not found" };
    if (target.role === "owner")
      return { ok: false, error: "Owner balance is unlimited — nothing to adjust" };

    let out: { ok: true; balance: number } | Fail = {
      ok: false,
      error: "Could not adjust balance",
    };
    await s.mutateDb(async (d2) => {
      const u = d2.users.find((x) => x.id === data.userId);
      if (!u || u.role === "owner") return;
      const before = u.balance;
      u.balance =
        data.mode === "add"
          ? before + data.amount
          : data.mode === "subtract"
            ? Math.max(0, before - data.amount)
            : data.amount;
      const delta = u.balance - before;
      s.addTx(
        d2,
        u,
        "balance_adjust",
        data.note?.trim() || `${data.mode} ₹${data.amount} by ${me.username}`,
        delta,
        u.balance,
      );
      out = { ok: true, balance: u.balance };
    }, `owner balance: ${target.username}`);
    return out;
  });

/* --------------------------- fingerprint (passkey) ------------------------- */
/* The phone's biometric prompt is the verification (WebAuthn platform
 * authenticator). This panel stores the credential id + a 30-day validity on
 * the user's account; unlock only works on the phone that created it. */

const FP_DAYS = 30;
const MAX_PASSKEYS = 10;
const fpUntil = () => new Date(Date.now() + FP_DAYS * 86_400_000).toISOString();
const normId = (id: string) => id.replace(/=+$/, "");

export const fpRegister = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(1), credentialId: b64 }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; until: string } | Fail> => {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
    const v = await s.verifyToken(data.token);
    if (!v) return { ok: false, error: "Session expired — log in again" };
    const until = fpUntil();
    const entry = { id: data.credentialId, expires_at: until };
    let out: { ok: true; until: string } | Fail = { ok: false, error: "Session expired" };
    await s.mutateDb(async (d2) => {
      const u = d2.users.find((x) => x.id === v.uid);
      if (!u) return;
      const next = userPasskeys(u).filter((p) => normId(p.id) !== data.credentialId);
      next.push(entry);
      u.passkeys = next.slice(-MAX_PASSKEYS);
      u.passkey = entry;
      out = { ok: true, until };
    }, "fingerprint enabled");
    return out;
  });

export const fpLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ credentialId: b64 }).parse(d))
  .handler(
    async ({ data }): Promise<LoginResult & { code?: "UNKNOWN" | "EXPIRED"; until?: string }> => {
      const s = await import("./gh-store.server");
      if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
      const matchUser = (db: { users: DbUser[] }) => {
        for (const user of db.users) {
          const pk = userPasskeys(user).find((p) => normId(p.id) === data.credentialId);
          if (pk) return { user, pk };
        }
        return null;
      };
      let hit = matchUser((await s.readDb()).db);
      if (!hit) {
        // Retry bypassing the 10s read cache in case a passkey was just registered.
        hit = matchUser((await s.readDb(true)).db);
      }
      if (!hit)
        return {
          ok: false,
          error: "This fingerprint is not registered on the panel.",
          code: "UNKNOWN",
        };
      const { user: u, pk } = hit;
      if (new Date(pk.expires_at).getTime() <= Date.now())
        return {
          ok: false,
          error: "Fingerprint expired — log in with your password, then renew it.",
          code: "EXPIRED",
        };
      if (u.status !== "active") return { ok: false, error: "This account is not active." };
      await s.mutateDb(async (d2) => {
        const x = d2.users.find((y) => y.id === u.id);
        if (x) x.last_active_at = new Date().toISOString();
      }, `fingerprint login: ${u.username}`);
      return { ok: true, token: await s.signToken(u.id), me: meOf(u), until: pk.expires_at };
    },
  );

export const fpRenew = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(1), credentialId: b64 }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; until: string } | Fail> => {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
    const v = await s.verifyToken(data.token);
    if (!v) return { ok: false, error: "Session expired — log in again" };
    const until = fpUntil();
    let out: { ok: true; until: string } | Fail = {
      ok: false,
      error: "Fingerprint not found on your account",
    };
    await s.mutateDb(async (d2) => {
      const u = d2.users.find((x) => x.id === v.uid);
      if (!u) return;
      const existing = userPasskeys(u);
      if (!existing.some((p) => normId(p.id) === data.credentialId)) return;
      const updated = { id: data.credentialId, expires_at: until };
      u.passkeys = existing.map((p) => (normId(p.id) === data.credentialId ? updated : p));
      if (!u.passkey || normId(u.passkey.id) === data.credentialId) u.passkey = updated;
      out = { ok: true, until };
    }, "fingerprint renewed");
    return out;
  });

export const fpUnregister = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(1), credentialId: b64.optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
    const v = await s.verifyToken(data.token);
    if (!v) return { ok: false, error: "Session expired — log in again" };
    await s.mutateDb(async (d2) => {
      const u = d2.users.find((x) => x.id === v.uid);
      if (!u) return;
      if (data.credentialId) {
        const remaining = userPasskeys(u).filter((p) => normId(p.id) !== data.credentialId);
        u.passkeys = remaining;
        u.passkey = remaining[remaining.length - 1] ?? null;
      } else {
        u.passkeys = [];
        u.passkey = null;
      }
    }, "fingerprint removed");
    return { ok: true };
  });
