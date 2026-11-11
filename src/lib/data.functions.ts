import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { keyBatchCost, referralCost } from "@/lib/zx";
import type { DbKey, DbReferral, DbNotice, DbSettings, DbTx, UserRow } from "./types";

/* Data server functions (keys, referrals, users, notices, pricing, stats).
 * All backed by the GitHub-as-database store — see gh-store.server.ts. */

type Fail = { ok: false; error: string };

const KEYS_PAGE = 20;

/** Shared auth: verify the session token against db.json. */
async function authMe(
  token: string,
): Promise<{ ok: false; error: string } | { ok: true; db: Awaited<ReturnType<typeof import("./gh-store.server").readDb>>["db"]; me: Awaited<ReturnType<typeof import("./gh-store.server").readDb>>["db"]["users"][number] }> {
  const s = await import("./gh-store.server");
  if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
  const v = s.verifyToken(token);
  if (!v) return { ok: false, error: "Session expired — log in again" };
  const { db } = await s.readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || me.status !== "active") return { ok: false, error: "Session expired — log in again" };
  return { ok: true, db, me };
}

/* ---------------------------------- keys ----------------------------------- */

export const keysList = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(1), q: z.string().trim().max(64).optional(), page: z.number().int().min(0).max(500) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; rows: DbKey[]; count: number } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    const mine = a.me.role === "owner" ? a.db.keys : a.db.keys.filter((k) => k.created_by === a.me.id);
    const q = (data.q || "").trim().toLowerCase();
    const filtered = q ? mine.filter((k) => k.license_key.toLowerCase().includes(q) || k.game.toLowerCase().includes(q)) : mine;
    const sorted = [...filtered].sort((x, y) => y.id - x.id);
    return {
      ok: true,
      rows: sorted.slice(data.page * KEYS_PAGE, data.page * KEYS_PAGE + KEYS_PAGE),
      count: sorted.length,
    };
  });

export const keysGenerate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1),
        game: z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/),
        hours: z.number().int().positive().nullable(),
        devices: z.number().int().min(1).max(50),
        qty: z.number().int().min(1).max(300),
        customKey: z.string().trim().regex(/^[A-Za-z0-9-]{4,20}$/).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; keys: string[]; charged: number; balance: number } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    const { db, me } = a;
    const prices = db.settings.prices;
    const price = data.hours === null ? 0 : (prices.find((p) => p.hours === data.hours)?.price ?? -1);
    if (price < 0) return { ok: false, error: "Unknown duration plan — pick one from the list" };
    if (data.hours === null && me.role !== "owner") return { ok: false, error: "Lifetime keys are Owner-only" };

    const qty = data.customKey ? 1 : data.qty;
    const cost = keyBatchCost(me.role, price, qty);
    if (me.role !== "owner" && cost > me.balance)
      return { ok: false, error: `Insufficient balance — you need ₹${cost} but have ₹${me.balance}` };

    const now = new Date().toISOString();
    const expires_at = data.hours ? new Date(Date.now() + data.hours * 3_600_000).toISOString() : null;
    const made: string[] = [];
    let out: { ok: true; keys: string[]; charged: number; balance: number } | Fail = { ok: false, error: "Key generation failed" };

    await (await import("./gh-store.server")).mutateDb((d2) => {
      const u = d2.users.find((x) => x.id === me.id);
      if (!u || u.status !== "active") return;
      if (me.role !== "owner" && cost > u.balance) return;

      const custom = data.customKey ? data.customKey.toUpperCase() : null;
      if (custom && d2.keys.some((x) => x.license_key === custom)) {
        out = { ok: false, error: "That custom key name is already taken" };
        return;
      }
      for (let i = 0; i < qty; i++) {
        const license = custom ?? licenseOf(d2);
        d2.keys.push({
          id: nextKey(d2),
          license_key: license,
          game: data.game,
          duration_hours: data.hours,
          max_devices: data.devices,
          devices: [],
          created_by: u.id,
          created_by_name: u.username,
          created_at: now,
          expires_at,
        });
        made.push(license);
      }
      if (me.role !== "owner") u.balance -= cost;
      const label = data.hours ? `${data.hours}h` : "lifetime";
      txPush(d2, u, "key_generate", `Generated ${qty} key(s) · ${data.game} · ${label} · ${data.devices} device(s)`, me.role === "owner" ? 0 : -cost, me.role === "owner" ? null : u.balance);
      out = { ok: true, keys: made, charged: cost, balance: u.balance };
    }, `keys generated by ${me.username}`);
    return out;
  });

export const keysDelete = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1), id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    const k = a.db.keys.find((x) => x.id === data.id);
    if (!k || (a.me.role !== "owner" && k.created_by !== a.me.id)) return { ok: false, error: "Key not found" };
    await (await import("./gh-store.server")).mutateDb((d2) => {
      d2.keys = d2.keys.filter((x) => x.id !== data.id);
    }, `key deleted by ${a.me.username}`);
    return { ok: true };
  });

export const keysResetDevices = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1), id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    const k = a.db.keys.find((x) => x.id === data.id);
    if (!k || (a.me.role !== "owner" && k.created_by !== a.me.id)) return { ok: false, error: "Key not found" };
    await (await import("./gh-store.server")).mutateDb((d2) => {
      const x = d2.keys.find((y) => y.id === data.id);
      if (x) x.devices = [];
    }, `devices reset by ${a.me.username}`);
    return { ok: true };
  });

export const keysDeleteExpired = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; deleted: number } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    const mine = a.me.role === "owner" ? a.db.keys : a.db.keys.filter((k) => k.created_by === a.me.id);
    const expiredIds = new Set(mine.filter((k) => k.expires_at && new Date(k.expires_at).getTime() <= Date.now()).map((k) => k.id));
    if (!expiredIds.size) return { ok: true, deleted: 0 };
    await (await import("./gh-store.server")).mutateDb((d2) => {
      d2.keys = d2.keys.filter((x) => !expiredIds.has(x.id));
    }, `expired keys cleaned by ${a.me.username}`);
    return { ok: true, deleted: expiredIds.size };
  });

/* -------------------------------- referrals -------------------------------- */

export const referralsList = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; rows: DbReferral[] } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    const rows = a.me.role === "owner" ? a.db.referrals : a.db.referrals.filter((r) => r.created_by === a.me.id);
    return { ok: true, rows: [...rows].sort((x, y) => y.id - x.id) };
  });

export const referralCreate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1),
        role: z.enum(["owner", "admin", "reseller"]),
        hours: z.number().int().positive().nullable(),
        credit: z.number().int().min(0).max(100_000_000),
        uses: z.number().int().min(1).max(100),
        validHours: z.number().int().positive().max(24 * 365),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; code: string } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    const { db, me } = a;
    if (me.role !== "owner" && me.role !== "admin") return { ok: false, error: "Only Owner/Admin can create referrals" };
    if (me.role !== "owner" && data.role !== "reseller") return { ok: false, error: "Admins can only create RESELLER referrals" };

    const price = data.hours === null ? 0 : (db.settings.prices.find((p) => p.hours === data.hours)?.price ?? -1);
    if (price < 0) return { ok: false, error: "Unknown duration plan — pick one from the list" };
    const cost = referralCost(me.role, price, data.credit, data.uses);
    if (me.role !== "owner") {
      if (me.ref_used + data.uses > me.ref_limit)
        return { ok: false, error: `Referral limit reached (${me.ref_used}/${me.ref_limit}) — ask the Owner to raise it` };
      if (cost > me.balance) return { ok: false, error: `Insufficient balance — you need ₹${cost} but have ₹${me.balance}` };
    }

    let out: { ok: true; code: string } | Fail = { ok: false, error: "Referral creation failed" };
    await (await import("./gh-store.server")).mutateDb((d2) => {
      const u = d2.users.find((x) => x.id === me.id);
      if (!u || u.status !== "active") return;
      if (u.role !== "owner") {
        if (u.ref_used + data.uses > u.ref_limit) {
          out = { ok: false, error: "Referral limit reached" };
          return;
        }
        if (referralCost(u.role, price, data.credit, data.uses) > u.balance) {
          out = { ok: false, error: "Insufficient balance" };
          return;
        }
      }
      let code = `ZX${randCode(6)}`;
      for (let i = 0; d2.referrals.some((r) => r.code === code) && i < 50; i++) code = `ZX${randCode(6)}`;
      d2.referrals.push({
        id: nextReferral(d2),
        code,
        role: data.role,
        duration_hours: data.hours,
        credit: data.credit,
        uses: 0,
        max_uses: data.uses,
        expires_at: new Date(Date.now() + data.validHours * 3_600_000).toISOString(),
        revoked: false,
        created_by: u.id,
        created_by_name: u.username,
        redemptions: [],
      });
      if (u.role !== "owner") {
        u.balance -= cost;
        u.ref_used += data.uses;
      }
      const label = data.hours ? `${data.hours}h` : "lifetime";
      txPush(d2, u, "referral_create", `Created ${code} · ${data.role} · ${label} · ₹${data.credit} credit · ${data.uses} use(s)`, u.role === "owner" ? 0 : -cost, u.role === "owner" ? null : u.balance);
      out = { ok: true, code };
    }, `referral created by ${me.username}`);
    return out;
  });

export const referralRevoke = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1), id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    const r = a.db.referrals.find((x) => x.id === data.id);
    if (!r || (a.me.role !== "owner" && r.created_by !== a.me.id)) return { ok: false, error: "Referral not found" };
    await (await import("./gh-store.server")).mutateDb((d2) => {
      const x = d2.referrals.find((y) => y.id === data.id);
      if (x) x.revoked = true;
    }, `referral revoked by ${a.me.username}`);
    return { ok: true };
  });

/* ----------------------------- users / lists -------------------------------- */

export const usersList = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; rows: UserRow[] } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    if (a.me.role !== "owner" && a.me.role !== "admin") return { ok: false, error: "Not allowed" };
    const rows = a.me.role === "owner" ? a.db.users : a.db.users.filter((u) => u.uplink === a.me.username);
    const store = await import("./gh-store.server");
    return { ok: true, rows: [...rows].sort((x, y) => y.created_at.localeCompare(x.created_at)).map(store.toUserRow) };
  });

export const transactionsList = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1), userId: z.string().min(1).optional() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; rows: DbTx[] } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    let rows: DbTx[];
    if (a.me.role === "owner" && data.userId) rows = a.db.transactions.filter((t) => t.user_id === data.userId);
    else if (a.me.role === "owner") rows = a.db.transactions;
    else rows = a.db.transactions.filter((t) => t.user_id === a.me.id);
    return { ok: true, rows: [...rows].sort((x, y) => y.id - x.id).slice(0, 300) };
  });

export const statsGet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; total_keys: number; active_keys: number; expired_keys: number; users: number } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    const mine = a.me.role === "owner" ? a.db.keys : a.db.keys.filter((k) => k.created_by === a.me.id);
    const now = Date.now();
    const active = mine.filter((k) => !k.expires_at || new Date(k.expires_at).getTime() > now).length;
    const users = a.me.role === "owner" ? a.db.users.length : a.db.users.filter((u) => u.uplink === a.me.username).length;
    return { ok: true, total_keys: mine.length, active_keys: active, expired_keys: mine.length - active, users };
  });

/* --------------------------------- notices ---------------------------------- */

export const noticesList = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; rows: DbNotice[] } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    const rows = a.db.notices.filter(
      (n) => (n.target_role === null && n.target_user_id === null) || n.target_role === a.me.role || n.target_user_id === a.me.id,
    );
    return { ok: true, rows: [...rows].sort((x, y) => y.id - x.id).slice(0, 50) };
  });

export const noticeSend = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1),
        target: z.enum(["all", "admin", "reseller", "user"]),
        userId: z.string().min(1).optional(),
        title: z.string().trim().min(1).max(120),
        body: z.string().trim().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    if (a.me.role !== "owner") return { ok: false, error: "Only the Owner can send notices" };
    if (data.target === "user" && !data.userId) return { ok: false, error: "Pick a user to send to" };
    const target = a.db.users.find((u) => u.id === data.userId);
    if (data.target === "user" && !target) return { ok: false, error: "User not found" };
    await (await import("./gh-store.server")).mutateDb((d2) => {
      d2.notices.push({
        id: nextNotice(d2),
        title: data.title,
        body: data.body,
        target_role: data.target === "admin" || data.target === "reseller" ? data.target : null,
        target_user_id: data.target === "user" ? data.userId || null : null,
        created_by: a.me.id,
        created_at: new Date().toISOString(),
      });
      if (d2.notices.length > 300) d2.notices = d2.notices.slice(-300);
    }, `notice sent by ${a.me.username}`);
    return { ok: true };
  });

export const noticeDelete = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1), id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    if (a.me.role !== "owner") return { ok: false, error: "Only the Owner can delete notices" };
    await (await import("./gh-store.server")).mutateDb((d2) => {
      d2.notices = d2.notices.filter((n) => n.id !== data.id);
    }, `notice deleted by ${a.me.username}`);
    return { ok: true };
  });

/* -------------------------------- settings ---------------------------------- */

export const settingsGet = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: true; settings: DbSettings } | Fail> => {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) return { ok: false, error: s.storageError() };
    const { db } = await s.readDb();
    return { ok: true, settings: db.settings };
  });

export const settingsUpdate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1),
        prices: z.array(z.object({ hours: z.number().int().positive().max(24 * 365), price: z.number().int().min(0).max(1_000_000) })).max(30).optional(),
        telegram: z.object({ url: z.string().trim().url().max(200), handle: z.string().trim().min(1).max(64) }).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    if (a.me.role !== "owner") return { ok: false, error: "Only the Owner can change settings" };
    if (data.prices) {
      const hours = data.prices.map((p) => p.hours);
      if (new Set(hours).size !== hours.length) return { ok: false, error: "Duplicate duration hours" };
    }
    await (await import("./gh-store.server")).mutateDb((d2) => {
      if (data.prices) d2.settings.prices = data.prices.sort((x, y) => x.hours - y.hours);
      if (data.telegram) d2.settings.telegram = data.telegram;
    }, `settings updated by ${a.me.username}`);
    return { ok: true };
  });

export const maintenanceSet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(1), on: z.boolean(), message: z.string().trim().max(200) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    const a = await authMe(data.token);
    if (!a.ok) return a;
    if (a.me.role !== "owner") return { ok: false, error: "Only the Owner can toggle maintenance" };
    await (await import("./gh-store.server")).mutateDb((d2) => {
      d2.settings.maintenance = { on: data.on, message: data.message };
    }, `maintenance ${data.on ? "ON" : "OFF"} by ${a.me.username}`);
    return { ok: true };
  });

/* --------------------- small local helpers (pure-ish) ---------------------- */

function licenseOf(db: { keys: { license_key: string }[] }): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = (n: number) => {
    let out = "";
    for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  };
  for (let i = 0; i < 50; i++) {
    const k = `ZX${pick(4)}-${pick(4)}-${pick(4)}`;
    if (!db.keys.some((x) => x.license_key === k)) return k;
  }
  return `ZX${Date.now().toString(36).toUpperCase()}`;
}

function randCode(len: number): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function nextKey(db: { seq: Record<string, number> }): number {
  db.seq.key = (db.seq.key || 0) + 1;
  return db.seq.key;
}
function nextReferral(db: { seq: Record<string, number> }): number {
  db.seq.referral = (db.seq.referral || 0) + 1;
  return db.seq.referral;
}
function nextNotice(db: { seq: Record<string, number> }): number {
  db.seq.notice = (db.seq.notice || 0) + 1;
  return db.seq.notice;
}

function txPush(
  db: { transactions: DbTx[]; seq: Record<string, number> },
  user: { id: string; username: string },
  kind: string,
  details: string,
  amount: number,
  balanceAfter: number | null,
): void {
  db.seq.tx = (db.seq.tx || 0) + 1;
  db.transactions.push({
    id: db.seq.tx,
    user_id: user.id,
    username: user.username,
    kind,
    details,
    amount,
    balance_after: balanceAfter,
    created_at: new Date().toISOString(),
  });
  if (db.transactions.length > 2000) db.transactions = db.transactions.slice(-2000);
}
