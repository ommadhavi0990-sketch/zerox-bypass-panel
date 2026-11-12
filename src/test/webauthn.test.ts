// @vitest-environment node
import { describe, expect, it } from "vitest";
import { b64u, randomChallenge, verifyAssertion } from "@/lib/webauthn.server";

const enc = new TextEncoder();
const sha = async (d: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", d as BufferSource));
const origin = "https://panel.example.app";
const rpId = "panel.example.app";

function rawToDer(raw: Uint8Array) {
  const f = (x: Uint8Array) => {
    let i = 0;
    while (i < x.length - 1 && x[i] === 0) i++;
    let v = x.slice(i);
    if (v[0]! & 0x80) v = new Uint8Array([0, ...v]);
    return new Uint8Array([2, v.length, ...v]);
  };
  const body = new Uint8Array([...f(raw.slice(0, 32)), ...f(raw.slice(32))]);
  return new Uint8Array([0x30, body.length, ...body]);
}

async function setup() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const publicKey = b64u.enc(new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey)));
  const sign = async (flags: number, count: number, challenge: string, rp = rpId) => {
    const ad = new Uint8Array(37);
    ad.set(await sha(enc.encode(rp)), 0);
    ad[32] = flags;
    new DataView(ad.buffer).setUint32(33, count);
    const cd = enc.encode(JSON.stringify({ type: "webauthn.get", challenge, origin }));
    const raw = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        kp.privateKey,
        new Uint8Array([...ad, ...(await sha(cd))]),
      ),
    );
    return {
      authenticatorData: b64u.enc(ad),
      clientDataJSON: b64u.enc(cd),
      signature: b64u.enc(rawToDer(raw)),
    };
  };
  return { publicKey, sign, base: { publicKey, alg: -7, rpId, origin } };
}

describe("fingerprint (WebAuthn) verification", () => {
  it("accepts a genuine fingerprint signature and returns the new counter", async () => {
    const { sign, base } = await setup();
    const c = randomChallenge();
    expect(
      (
        await verifyAssertion({
          ...base,
          storedSignCount: 4,
          challenge: c,
          ...(await sign(0x05, 5, c)),
        })
      ).signCount,
    ).toBe(5);
  });
  it("rejects a replayed counter, wrong challenge, missing fingerprint check and another site", async () => {
    const { sign, base } = await setup();
    const c = randomChallenge();
    const good = await sign(0x05, 5, c);
    await expect(
      verifyAssertion({ ...base, storedSignCount: 5, challenge: c, ...good }),
    ).rejects.toThrow();
    await expect(
      verifyAssertion({ ...base, storedSignCount: 0, challenge: randomChallenge(), ...good }),
    ).rejects.toThrow();
    await expect(
      verifyAssertion({ ...base, storedSignCount: 0, challenge: c, ...(await sign(0x01, 6, c)) }),
    ).rejects.toThrow();
    await expect(
      verifyAssertion({
        ...base,
        storedSignCount: 0,
        challenge: c,
        ...(await sign(0x05, 7, c, "evil.app")),
      }),
    ).rejects.toThrow();
  });
  it("rejects a signature from a different key", async () => {
    const a = await setup();
    const b = await setup();
    const c = randomChallenge();
    await expect(
      verifyAssertion({
        ...a.base,
        publicKey: b.publicKey,
        storedSignCount: 0,
        challenge: c,
        ...(await a.sign(0x05, 1, c)),
      }),
    ).rejects.toThrow();
  });
});
