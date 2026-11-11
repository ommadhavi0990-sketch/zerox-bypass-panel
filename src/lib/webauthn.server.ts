// Minimal WebAuthn verification using only WebCrypto (works on Cloudflare Workers and Node).
// Supports ES256 (-7) and RS256 (-257), the algorithms every phone fingerprint sensor uses.

export const b64u = {
  enc(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(str: string): Uint8Array {
    const p = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(p + "=".repeat((4 - (p.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

export function randomChallenge(): string {
  return b64u.enc(crypto.getRandomValues(new Uint8Array(32)));
}

const sha256 = async (d: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", d as BufferSource));

/** WebAuthn ES256 signatures are ASN.1 DER; WebCrypto wants raw r||s (64 bytes). */
export function derToRaw(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new Error("Bad signature");
  let i = 2;
  if (der[1]! & 0x80) i = 2 + (der[1]! & 0x7f);
  const readInt = () => {
    if (der[i] !== 0x02) throw new Error("Bad signature");
    const len = der[i + 1]!;
    let v = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    if (v.length > 32) throw new Error("Bad signature");
    out.set(v, 32 - v.length);
    return out;
  };
  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

async function importKey(spki: Uint8Array, alg: number): Promise<CryptoKey> {
  if (alg === -7) return crypto.subtle.importKey("spki", spki as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  if (alg === -257) return crypto.subtle.importKey("spki", spki as BufferSource, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  throw new Error("Unsupported key type");
}

type ClientData = { type: string; challenge: string; origin: string };

function parseClientData(clientDataJSON: string, type: string, challenge: string, origin: string): ClientData {
  const cd = JSON.parse(new TextDecoder().decode(b64u.dec(clientDataJSON))) as ClientData;
  if (cd.type !== type) throw new Error("Wrong request type");
  if (cd.challenge !== challenge) throw new Error("Challenge mismatch");
  if (cd.origin !== origin) throw new Error("Origin mismatch");
  return cd;
}

/** Registration: checks the browser really answered OUR challenge on OUR site, and that the key is usable. */
export async function verifyRegistration(a: { clientDataJSON: string; publicKey: string; alg: number; challenge: string; origin: string }) {
  parseClientData(a.clientDataJSON, "webauthn.create", a.challenge, a.origin);
  await importKey(b64u.dec(a.publicKey), a.alg);
}

/** Login: full assertion check. Returns the new signature counter. */
export async function verifyAssertion(a: {
  publicKey: string; alg: number; storedSignCount: number;
  authenticatorData: string; clientDataJSON: string; signature: string;
  rpId: string; challenge: string; origin: string;
}): Promise<{ signCount: number }> {
  parseClientData(a.clientDataJSON, "webauthn.get", a.challenge, a.origin);
  const authData = b64u.dec(a.authenticatorData);
  if (authData.length < 37) throw new Error("Bad authenticator data");
  const rpHash = await sha256(new TextEncoder().encode(a.rpId));
  for (let i = 0; i < 32; i++) if (authData[i] !== rpHash[i]) throw new Error("Wrong site");
  const flags = authData[32]!;
  if (!(flags & 0x01)) throw new Error("User not present");
  if (!(flags & 0x04)) throw new Error("Fingerprint not verified");
  const signCount = ((authData[33]! << 24) | (authData[34]! << 16) | (authData[35]! << 8) | authData[36]!) >>> 0;
  if (signCount !== 0 || a.storedSignCount !== 0) {
    if (signCount <= a.storedSignCount) throw new Error("Cloned authenticator suspected");
  }
  const cdHash = await sha256(b64u.dec(a.clientDataJSON));
  const signed = new Uint8Array(authData.length + cdHash.length);
  signed.set(authData, 0);
  signed.set(cdHash, authData.length);
  const key = await importKey(b64u.dec(a.publicKey), a.alg);
  const sig = b64u.dec(a.signature);
  const ok = a.alg === -7
    ? await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(sig) as BufferSource, signed as BufferSource)
    : await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, sig as BufferSource, signed as BufferSource);
  if (!ok) throw new Error("Fingerprint signature invalid");
  return { signCount };
}
