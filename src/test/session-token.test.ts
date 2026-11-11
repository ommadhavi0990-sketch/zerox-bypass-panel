// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, signToken, verifyPassword, verifyToken } from "@/lib/gh-store.server";

describe("session tokens and passwords", () => {
  beforeAll(() => {
    process.env["SESSION_SECRET"] = "test-secret-for-unit-tests-123456";
  });

  it("signs and verifies a session token asynchronously", async () => {
    const token = await signToken("u_1");
    expect(typeof token).toBe("string");
    const verified = await verifyToken(token);
    expect(verified).toEqual({ uid: "u_1" });
  });

  it("rejects tampered or malformed tokens", async () => {
    const token = await signToken("u_1");
    const bad = token.slice(0, -4) + "AAAA";
    expect(await verifyToken(bad)).toBeNull();
    expect(await verifyToken("not-a-token")).toBeNull();
  });

  it("hashes and verifies passwords with scrypt", async () => {
    const hash = await hashPassword("owner123");
    expect(await verifyPassword("owner123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
