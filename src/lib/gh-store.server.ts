/* Server-only data layer: the panel's "database" is db.json inside the private
 * GitHub repo zerox-panel-data. Every read/write goes through the GitHub
 * Contents API (auth via GH_DATA_TOKEN). Free forever, no signup, and one
 * tiny file is plenty for a hobby panel.
 *
 * Never import this module from client code — only inside createServerFn
 * handlers (dynamic import) and server route handlers.
 *
 * node:crypto is imported lazily inside each function (never at module top
 * level) so TanStack Start's build-time analyzer never sees it and never
 * tries to bundle it for the client. */

import https from "https";
import type { Db, DbUser, UserRow } from "./types";
import type { Profile } from "@/lib/zx";

/* Lazy crypto loader: imported per-function, never at module top level. */
let _crypto: typeof import("node:crypto") | null = null;
async function crypto(): Promise<typeof import("node:crypto")> {
  if (!_crypto) _crypto = await import("node:crypto");
  return _crypto;
}

/* ------------------------------ configuration ----------------------------- */

const DATA_REPO = () => (process.env.GH_DATA_REPO || "ommadhavi0990-sketch/zerox-panel-data").trim();
const DATA_TOKEN = () => (process.env.GH_DATA_TOKEN || "").trim();
const SESSION_SECRET = () => (process.env.SESSION_SECRET || "").trim();

export function storageConfigured(): boolean {
  return !!DATA_TOKEN() && !!SESSION_SECRET();
}
export function storageError(): string {
  return "Panel storage is not configured on the server (GH_DATA_TOKEN / SESSION_SECRET missing).";
}

/* ------------------------------ password hash ----------------------------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

/** scrypt hash, format: scrypt:N:r:p:saltB64:hashB64 */
export async function hashPassword(pw: string): Promise<string> {
  const { randomBytes, scryptSync } = await crypto();
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt:${SCRYPT.N}:${SCRYPT.r}:${SCRYPT.p}:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split(":");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, N, r, p, saltB64, hashB64] = parts;
    const { scryptSync, timingSafeEqual, Buffer } = await crypto();
    const hash = scryptSync(pw, Buffer.from(saltB64!, "base64"), SCRYPT.keylen, {
      N: +(N!),
      r: +(r!),
      p: +(p!),
    });
    return (
      hash.length === Buffer.from(hashB64!, "base64").length &&
      timingSafeEqual(hash, Buffer.from(hashB64!, "base64"))
    );
  } catch {
    return false;
  }
}

/* ------------------------------ session tokens ---------------------------- */

const TOKEN_DAYS = 7;

/** HMAC-signed session token: base64url(payload).base64url(hmac) */
export async function signToken(userId: string): Promise<string> {
  const { createHmac } = await crypto();
  const payload = { uid: userId, exp: Date.now() + TOKEN_DAYS * 86_400_000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", SESSION_SECRET()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export async function verifyToken(token: string): Promise<{ uid: string } | null> {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const { createHmac, timingSafeEqual, Buffer } = await crypto();
    const want = createHmac("sha256", SESSION_SECRET()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(want);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { uid?: string; exp?: number };
    if (!payload.uid || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return { uid: payload.uid };
  } catch {
    return null;
  }
}

/* ------------------------------ GitHub access ----------------------------- */

const GH_API = "https://api.github.com";
const DB_PATH = "db.json";
const CACHE_MS = 10_000; // reads are cached briefly so one page load = one API call

let cache: { at: number; sha: string; db: Db } | null = null;

async function gh(path: string, init?: { method?: string; body?: string }): Promise<{ status: number; json?: any; text?: string }> {
  const headers: Record<string, string> = {
    Authorization: `token ${DATA_TOKEN()}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "zerox-panel-store",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(init?.body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(init.body) } : {}),
  };
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await new Promise<{ status: number; json?: any; text?: string }>((resolve, reject) => {
        const url = new URL(`${GH_API}${path}`);
        const req = https.request(url, {
          method: init?.method || "GET",
          headers,
          timeout: 20000,
        }, (res) => {
          let buf = "";
          res.on("data", (c) => (buf += c));
          res.on("end", () => {
            let json: any;
            try { json = JSON.parse(buf); } catch { json = undefined; }
            resolve({ status: res.statusCode, json, text: buf });
          });
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
        if (init?.body) req.write(init.body);
        req.end();
      });
      // Retry server-side hiccups; let 4xx (our mistakes) through immediately.
      if (res.status >= 500 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw new Error(`GitHub API unreachable (${String(lastErr)}) — try again in a moment.`);
}

function defaultDb(): Db {
  return {
    version: 1,
    seq: { user: 1, key: 0, referral: 0, tx: 0, notice: 0 },
    users: [
      {
        id: "u_1",
        username: "owner",
        password_hash: "PLACEHOLDER",
        role: "owner",
        status: "active",
        balance: 999_999_999,
        ref_used: 0,
        ref_limit: 1_000_000,
        expires_at: null,
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        uplink: null,
        passkey: null,
      },
    ],
    keys: [],
    referrals: [],
    transactions: [],
    notices: [],
    settings: {
      prices: [
        { hours: 24, price: 49 },
        { hours: 72, price: 129 },
        { hours: 168, price: 249 },
        { hours: 360, price: 499 },
        { hours: 720, price: 999 },
      ],
      telegram: { url: "https://t.me/ONExZEROXX", handle: "@ONExZEROXX" },
      maintenance: { on: false, message: "" },
    },
  };
}

async function putDb(db: Db, sha: string | null, message: string): Promise<string> {
  const { Buffer } = await crypto();
  const res = await gh(`/repos/${DATA_REPO()}/contents/${DB_PATH}?ref=main`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(db, null, 2), "utf8").toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
  if (res.status >= 400) {
    const err = res.text || "";
    if (err.includes('"sha"')) throw new ConflictError();
    throw new Error(`DB write failed (${res.status}): ${err.slice(0, 200)}`);
  }
  const json = res.json as { content?: { sha?: string } };
  return json.content?.sha || "";
}

class ConflictError extends Error {}

/** Read the whole db (10s in-memory cache). Bootstraps db.json if it is missing. */
export async function readDb(force = false): Promise<{ db: Db; sha: string }> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return { db: cache.db, sha: cache.sha };
  const res = await gh(`/repos/${DATA_REPO()}/contents/${DB_PATH}?ref=main`);
  if (res.status === 404) {
    // First ever run: create the database with the default owner (owner/owner123).
    const db = defaultDb();
    db.users[0].password_hash = await hashPassword("owner123");
    const sha = await putDb(db, null, "Bootstrap panel database");
    cache = { at: Date.now(), sha, db };
    return { db, sha };
  }
  if (res.status >= 400) throw new Error(`DB read failed (${res.status}): ${(res.text || "").slice(0, 200)}`);
  const json = res.json as { sha: string; content: string; encoding: string };
  let db: Db;
  try {
    const { Buffer } = await crypto();
    db = JSON.parse(Buffer.from(json.content.replace(/\s/g, ""), "base64").toString("utf8")) as Db;
  } catch (e: any) {
    throw new Error(`db.json read error: ${e.message}. Status: ${res.status}. Content present: ${!!json?.content}`);
  }
  cache = { at: Date.now(), sha: json.sha, db };
  return { db, sha: json.sha };
}

/** Apply a change to db.json and save it (retries if the file moved underneath us). */
export async function mutateDb(mutate: (db: Db) => void, message: string): Promise<Db> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { db, sha } = await readDb(attempt > 1);
    const next: Db = structuredClone(db);
    mutate(next);
    try {
      const newSha = await putDb(next, sha, message);
      cache = { at: Date.now(), sha: newSha, db: next };
      return next;
    } catch (e) {
      if (e instanceof ConflictError && attempt < 3) continue; // someone else wrote first — re-apply
      throw e;
    }
  }
  throw new Error("DB is busy — try again in a moment.");
}

/* -------------------------------- helpers --------------------------------- */

export function findUser(db: Db, username: string): DbUser | undefined {
  const q = username.trim().toLowerCase();
  return db.users.find((u) => u.username.toLowerCase() === q);
}

/** Strip server-only fields off a user row before sending it to the browser. */
export function toUserRow(u: DbUser): UserRow {
  const { password_hash: _ph, passkey: _pk, ...row } = u;
  return row;
}

export function toProfile(u: DbUser): Profile {
  return {
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
}

/** Next incrementing id for a collection (keys, referrals, ...). Mutates db.seq. */
export function nextId(db: Db, kind: keyof Db["seq"]): number {
  db.seq[kind] = (db.seq[kind] || 0) + 1;
  return db.seq[kind];
}

/** Append a transaction row (call inside mutateDb). */
export function addTx(
  db: Db,
  user: DbUser,
  kind: string,
  details: string,
  amount: number,
  balanceAfter: number | null,
): void {
  db.transactions.push({
    id: nextId(db, "tx"),
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

/** Random referral/license code without look-alike characters. */
export async function randomCode(len: number): Promise<string> {
  const { randomBytes } = await crypto();
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = randomBytes(len);
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export async function licenseKey(): Promise<string> {
  return `ZX${await randomCode(4)}-${await randomCode(4)}-${await randomCode(4)}`;
}

export async function referralCode(): Promise<string> {
  return `ZX${await randomCode(6)}`;
}
