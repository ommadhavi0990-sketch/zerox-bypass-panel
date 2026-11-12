// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  durationLabel,
  EXPIRED_MESSAGE,
  isExpired,
  keyBatchCost,
  referralCost,
  usernameToEmail,
  USERNAME_RE,
} from "@/lib/zx";
import { connectHandlers } from "@/lib/connect-handler.server";

describe("durations", () => {
  it("24 hours is exactly 1 Day", () => expect(durationLabel(24)).toBe("1 Day"));
  it("5 hours stays in hours", () => expect(durationLabel(5)).toBe("5 Hours"));
  it("null duration is Lifetime", () => expect(durationLabel(null)).toBe("Lifetime"));
});

describe("balance deductions", () => {
  it("reseller pays exact key price × quantity", () =>
    expect(keyBatchCost("reseller", 99, 10)).toBe(990));
  it("owner generates keys free", () => expect(keyBatchCost("owner", 850, 300)).toBe(0));
  it("admin pays (duration price + credit) × uses for a referral", () =>
    expect(referralCost("admin", 299, 100, 2)).toBe(798));
  it("owner referrals cost nothing", () => expect(referralCost("owner", 550, 5000, 3)).toBe(0));
});

describe("server-side business rules", () => {
  it("expired accounts get the exact owner-DM message", () => {
    expect(EXPIRED_MESSAGE).toBe("Your referral has expired. Please DM the Owner.");
  });

  it("isExpired detects past and future timestamps accurately", () => {
    expect(isExpired(new Date(Date.now() - 5000).toISOString())).toBe(true);
    expect(isExpired(new Date(Date.now() + 50000).toISOString())).toBe(false);
    expect(isExpired(null)).toBe(false);
    expect(isExpired(undefined)).toBe(false);
  });
});

describe("login identity", () => {
  it("usernames are case-insensitive logins", () =>
    expect(usernameToEmail("ZeroX_01")).toBe(usernameToEmail("zerox_01")));
  it("rejects too-short usernames", () => expect(USERNAME_RE.test("abc")).toBe(false));
  it("accepts valid usernames", () => expect(USERNAME_RE.test("zerox_user_01")).toBe(true));
  it("rejects invalid characters in username", () =>
    expect(USERNAME_RE.test("user@name!")).toBe(false));
});

describe("connect protocol validation", () => {
  it("returns status false for empty payload", async () => {
    const req = new Request("http://localhost/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await connectHandlers.POST({ request: req });
    const data = await res.json();
    expect(data.status).toBe(false);
  });
});
