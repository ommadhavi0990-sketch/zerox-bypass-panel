// ENC v2 for the connect endpoint (opt-in: only when the app sends a fresh random `nonce`).
// Old login.h versions that send no nonce keep getting the classic JSON, so nothing breaks for them.
//
//   key  = SHA-256( secret_word | user_key | serial | nonce )          (32 bytes)
//   ct   = AES-256-GCM( key, iv(12 random bytes), aad = nonce, JSON of the normal "data" object )
//   sig  = HMAC-SHA256( secret_word, iv | ct | serial | nonce )  hex   (iv, ct = base64 strings as sent)
//
// A recorded reply is useless for the next login (new nonce => new key), a reply for another phone or
// another key does not verify, and the readable fields (ESP, expiry, ...) exist only inside `ct`.

export const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;

const te = new TextEncoder();
const b64 = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s)));

async function hmacHex(secret: string, msg: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    te.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", k, te.encode(msg))));
}

export async function encryptConnectReply(a: {
  secret: string;
  userKey: string;
  serial: string;
  nonce: string;
  data: Record<string, unknown>;
}) {
  const key = await crypto.subtle.importKey(
    "raw",
    (await sha256(`${a.secret}|${a.userKey}|${a.serial}|${a.nonce}`)) as BufferSource,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const ivRaw = crypto.getRandomValues(new Uint8Array(12));
  const ctRaw = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivRaw, additionalData: te.encode(a.nonce) },
      key,
      te.encode(JSON.stringify(a.data)),
    ),
  );
  const iv = b64(ivRaw);
  const ct = b64(ctRaw);
  const sig = await hmacHex(a.secret, `${iv}|${ct}|${a.serial}|${a.nonce}`);
  return { status: true as const, enc: 1 as const, iv, ct, sig };
}
