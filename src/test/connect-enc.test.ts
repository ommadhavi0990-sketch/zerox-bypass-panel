// @vitest-environment node
import { describe, expect, it } from "vitest";
import { encryptConnectReply, NONCE_RE } from "@/lib/connect-enc.server";

const te = new TextEncoder();
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

async function open(reply: { iv: string; ct: string; sig: string }, secret: string, key: string, serial: string, nonce: string) {
  const hk = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = hex(new Uint8Array(await crypto.subtle.sign("HMAC", hk, te.encode(`${reply.iv}|${reply.ct}|${serial}|${nonce}`))));
  if (sig !== reply.sig) throw new Error("bad signature");
  const kb = new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(`${secret}|${key}|${serial}|${nonce}`)));
  const k = await crypto.subtle.importKey("raw", kb, "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(reply.iv), additionalData: te.encode(nonce) }, k, unb64(reply.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

const secret = "S3cretWordForTest", key = "ZEROX-24-ABCD2345", serial = "DEV123", nonce = "Zk3p9Qw7Lm2Xa8Rt5Vb1";
const data = { token: "t", EXP: "2026-12-01 10:00:00", ESP: "on" };

describe("connect ENC v2", () => {
  it("accepts only well-formed nonces", () => {
    expect(NONCE_RE.test(nonce)).toBe(true);
    expect(NONCE_RE.test("short")).toBe(false);
  });
  it("hides every readable field and decrypts for the right phone, key and nonce", async () => {
    const r = await encryptConnectReply({ secret, userKey: key, serial, nonce, data });
    expect(Object.keys(r).sort()).toEqual(["ct", "enc", "iv", "sig", "status"]);
    expect(await open(r, secret, key, serial, nonce)).toEqual(data);
  });
  it("rejects replay, other phone, other key, fake server and tampering", async () => {
    const r = await encryptConnectReply({ secret, userKey: key, serial, nonce, data });
    await expect(open(r, secret, key, serial, "AnotherNonce123456789")).rejects.toThrow();
    await expect(open(r, secret, key, "OTHERDEV", nonce)).rejects.toThrow();
    await expect(open(r, secret, "ZEROX-24-ZZZZ9999", serial, nonce)).rejects.toThrow();
    await expect(open(r, "guess", key, serial, nonce)).rejects.toThrow();
    await expect(open({ ...r, ct: r.ct.slice(0, -6) + "AAAAAA" }, secret, key, serial, nonce)).rejects.toThrow();
  });
});
