import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { durationLabel, keyBatchCost, referralCost, usernameToEmail, USERNAME_RE } from "@/lib/zx";

const migrationsDir = join(process.cwd(), "drizzle/migrations");
const coreSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

describe("FIREWORK key prices (seeded)", () => {
  const seed = coreSql.match(/insert into public\.prices \(hours, price\) values([\s\S]*?);/i)?.[1] ?? "";
  const pairs = Object.fromEntries([...seed.matchAll(/\((\d+),\s*(\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]));
  it("5 Hours costs ₹50", () => expect(pairs[5]).toBe(50));
  it("1 Day costs ₹99", () => expect(pairs[24]).toBe(99));
  it("3 Days costs ₹150", () => expect(pairs[72]).toBe(150));
  it("7 Days costs ₹299", () => expect(pairs[168]).toBe(299));
  it("15 Days costs ₹350", () => expect(pairs[360]).toBe(350));
  it("30 Days costs ₹550", () => expect(pairs[720]).toBe(550));
  it("60 Days costs ₹850", () => expect(pairs[1440]).toBe(850));
});

describe("durations", () => {
  it("24 hours is exactly 1 Day", () => expect(durationLabel(24)).toBe("1 Day"));
  it("5 hours stays in hours", () => expect(durationLabel(5)).toBe("5 Hours"));
  it("null duration is Lifetime", () => expect(durationLabel(null)).toBe("Lifetime"));
});

describe("balance deductions", () => {
  it("reseller pays exact key price × quantity", () => expect(keyBatchCost("reseller", 99, 10)).toBe(990));
  it("owner generates keys free", () => expect(keyBatchCost("owner", 850, 300)).toBe(0));
  it("admin pays (duration price + credit) × uses for a referral", () => expect(referralCost("admin", 299, 100, 2)).toBe(798));
  it("owner referrals cost nothing", () => expect(referralCost("owner", 550, 5000, 3)).toBe(0));
});

describe("server-side rules in the database", () => {
  it("admins can only create RESELLER referrals", () => expect(coreSql).toContain("Admins can only generate RESELLER referrals"));
  it("resellers cannot create referrals", () => expect(coreSql).toContain("Resellers cannot generate referrals"));
  it("balance can never go negative", () => expect(coreSql).toMatch(/balance bigint not null default 0 check \(balance >= 0\)/));
  it("default admin referral limit is 10", () => expect(coreSql).toMatch(/ref_limit int not null default 10/));
  it("resellers cannot bulk-generate keys", () => expect(coreSql).toContain("Resellers can generate only 1 key at a time"));
  it("resellers cannot create custom keys", () => expect(coreSql).toContain("Resellers cannot create custom keys"));
  it("expired accounts get the exact owner-DM message", () => expect(coreSql).toContain("Your referral has expired. Please DM the Owner."));
});

describe("login identity", () => {
  it("usernames are case-insensitive logins", () => expect(usernameToEmail("ZeroX_01")).toBe(usernameToEmail("zerox_01")));
  it("rejects too-short usernames", () => expect(USERNAME_RE.test("abc")).toBe(false));
});

describe("connect key matching and lockout", () => {
  it("key must belong to the game the app sends", () => expect(coreSql).toContain("lower(trim(k.game)) <> lower(trim(_game))"));
  it("lockout is per ip+device pair, not ip OR device", () => expect(coreSql).toContain("pair_fails >= 30"));
  it("a successful login clears that pair's failures", () => expect(coreSql).toContain("delete from public.connect_failures where ip_hash = iph and serial_hash = sh"));
});

describe("fingerprint unlock rules in the database", () => {
  it("fingerprint time comes from a referral code", () => expect(coreSql).toContain("fp_redeem_code"));
  it("passkeys are server-side only (no client policies)", () => expect(coreSql).toMatch(/alter table public\.passkeys enable row level security;\s*\n/));
  it("challenges are single-use rows", () => expect(coreSql).toContain("public.passkey_challenges"));
});
