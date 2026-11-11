// Browser-side helpers for fingerprint unlock (WebAuthn). Never import this on the server.

const DEVICE_KEY = "zx-fp-device";
const UNLOCKED_KEY = "zx-fp-unlocked";

/** Remembered on THIS phone after the fingerprint was set up. `until` is only used to skip the lock screen once it expired. */
export type FpDevice = { id: string; u: string; until: string | null };

export function getFpDevice(): FpDevice | null {
  try {
    const v = JSON.parse(localStorage.getItem(DEVICE_KEY) || "null") as FpDevice | null;
    return v && typeof v.id === "string" && typeof v.u === "string" ? v : null;
  } catch { return null; }
}
export function setFpDevice(d: FpDevice) { try { localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); } catch { /* ignore */ } }
export function clearFpDevice() { try { localStorage.removeItem(DEVICE_KEY); } catch { /* ignore */ } }

export function markUnlocked() { try { sessionStorage.setItem(UNLOCKED_KEY, "1"); } catch { /* ignore */ } }
export function clearUnlocked() { try { sessionStorage.removeItem(UNLOCKED_KEY); } catch { /* ignore */ } }

/** App-lock: fingerprint is set up on this phone, still valid, and this browser session has not been unlocked yet. */
export function fpLocked(): boolean {
  if (typeof window === "undefined") return false;
  const d = getFpDevice();
  if (!d) return false;
  if (d.until && new Date(d.until).getTime() <= Date.now()) return false;
  try { return sessionStorage.getItem(UNLOCKED_KEY) !== "1"; } catch { return false; }
}

export async function fpSupported(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential || !window.isSecureContext) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

const enc = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const dec = (str: string) => {
  const p = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p + "=".repeat((4 - (p.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Opens the phone's fingerprint prompt to create a new passkey. */
export async function createPasskey(o: { challenge: string; rpId: string; userId: string; username: string }) {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: dec(o.challenge) as BufferSource,
      rp: { id: o.rpId, name: "ZEROX BYPASS PANEL" },
      user: { id: dec(o.userId) as BufferSource, name: o.username, displayName: o.username },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      attestation: "none",
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Fingerprint cancelled");
  const r = cred.response as AuthenticatorAttestationResponse;
  const pub = r.getPublicKey?.();
  const alg = r.getPublicKeyAlgorithm?.();
  if (!pub || typeof alg !== "number") throw new Error("This browser cannot set up fingerprint. Update Chrome or Safari and try again.");
  return { id: cred.id, publicKey: enc(pub), alg, clientDataJSON: enc(r.clientDataJSON) };
}

/** Opens the phone's fingerprint prompt to sign a login challenge. */
export async function getPasskey(o: { challenge: string; rpId: string; credentialId: string }) {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: dec(o.challenge) as BufferSource,
      rpId: o.rpId,
      allowCredentials: [{ type: "public-key", id: dec(o.credentialId) as BufferSource }],
      userVerification: "required",
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Fingerprint cancelled");
  const r = cred.response as AuthenticatorAssertionResponse;
  return { authenticatorData: enc(r.authenticatorData), clientDataJSON: enc(r.clientDataJSON), signature: enc(r.signature) };
}

export function fpErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return "Fingerprint cancelled or not recognised. Try again.";
  if (name === "SecurityError") return "Fingerprint works only on the real website address (https). Open the published site.";
  if (name === "NotSupportedError") return "This phone/browser does not support fingerprint here.";
  if (name === "InvalidStateError") return "Fingerprint is already set up on this phone. Remove it first.";
  return e instanceof Error && e.message ? e.message : "Fingerprint failed. Try again.";
}
