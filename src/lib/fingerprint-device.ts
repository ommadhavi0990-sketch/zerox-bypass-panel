// Browser-side helpers for fingerprint unlock (WebAuthn). Never import this on the server.

const DEVICE_KEY = "zx-fp-device";
const UNLOCKED_KEY = "zx-fp-unlocked";

/** Remembered on THIS phone after the fingerprint was set up. `until` is only used to skip the lock screen once it expired. */
export type FpDevice = { id: string; u: string; until: string | null };

export function getFpDevice(): FpDevice | null {
  try {
    const v = JSON.parse(localStorage.getItem(DEVICE_KEY) || "null") as FpDevice | null;
    return v && typeof v.id === "string" && typeof v.u === "string" ? v : null;
  } catch {
    return null;
  }
}
export function setFpDevice(d: FpDevice) {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}
export function clearFpDevice() {
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* ignore */
  }
}

export function markUnlocked() {
  try {
    sessionStorage.setItem(UNLOCKED_KEY, "1");
  } catch {
    /* ignore */
  }
}
export function clearUnlocked() {
  try {
    sessionStorage.removeItem(UNLOCKED_KEY);
  } catch {
    /* ignore */
  }
}

/** App-lock: fingerprint is set up on this phone, still valid, and this browser session has not been unlocked yet. */
export function fpLocked(): boolean {
  if (typeof window === "undefined") return false;
  const d = getFpDevice();
  if (!d) return false;
  if (d.until && new Date(d.until).getTime() <= Date.now()) return false;
  try {
    return sessionStorage.getItem(UNLOCKED_KEY) !== "1";
  } catch {
    return false;
  }
}

export async function fpSupported(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential || !window.isSecureContext)
      return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
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

const credId = (cred: PublicKeyCredential) =>
  cred.rawId && cred.rawId.byteLength > 0 ? enc(cred.rawId) : cred.id.replace(/=+$/, "");

export function sameFpUser(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Opens the phone's fingerprint prompt to create a new passkey. */
export async function createPasskey(o: {
  challenge: string;
  rpId: string;
  userId: string;
  username: string;
}) {
  const createWith = (residentKey: ResidentKeyRequirement) =>
    navigator.credentials.create({
      publicKey: {
        challenge: dec(o.challenge) as BufferSource,
        rp: { id: o.rpId, name: "ZEROX BYPASS PANEL" },
        user: { id: dec(o.userId) as BufferSource, name: o.username, displayName: o.username },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey,
        },
        attestation: "none",
        timeout: 60000,
      },
    }) as Promise<PublicKeyCredential | null>;

  let cred: PublicKeyCredential | null;
  try {
    // Prefer a discoverable passkey so unlock keeps working even if browser storage is cleared or opened as a PWA.
    cred = await createWith("required");
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name !== "NotSupportedError" && name !== "ConstraintError") throw e;
    cred = await createWith("preferred");
  }
  if (!cred) throw new Error("Fingerprint cancelled");
  const r = cred.response as AuthenticatorAttestationResponse;
  const pub = r.getPublicKey?.();
  const alg = r.getPublicKeyAlgorithm?.();
  return {
    id: credId(cred),
    publicKey: pub ? enc(pub) : undefined,
    alg: typeof alg === "number" ? alg : undefined,
    clientDataJSON: enc(r.clientDataJSON),
  };
}

/** Opens the phone's fingerprint prompt to sign a login challenge (discoverable when credentialId is omitted). */
export async function getPasskey(o: { challenge: string; rpId: string; credentialId?: string }) {
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: dec(o.challenge) as BufferSource,
    rpId: o.rpId,
    userVerification: "required",
    timeout: 60000,
    ...(o.credentialId
      ? { allowCredentials: [{ type: "public-key", id: dec(o.credentialId) as BufferSource }] }
      : {}),
  };
  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Fingerprint cancelled");
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: credId(cred),
    authenticatorData: enc(r.authenticatorData),
    clientDataJSON: enc(r.clientDataJSON),
    signature: enc(r.signature),
  };
}

export function fpErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError")
    return "Fingerprint cancelled or not recognised. Try again.";
  if (name === "SecurityError")
    return "Fingerprint works only on the real website address (https). Open the published site.";
  if (name === "NotSupportedError") return "This phone/browser does not support fingerprint here.";
  if (name === "InvalidStateError")
    return "Fingerprint is already set up on this phone. Remove it first.";
  return e instanceof Error && e.message ? e.message : "Fingerprint failed. Try again.";
}

/* ---------- local mode (no server / no Supabase) ----------
   The panel has no database, so fingerprint unlock works entirely on this phone:
   WebAuthn's biometric prompt IS the verification. The device record lives in
   localStorage and is valid for 30 days, renewable. */

/** How many days a locally-set-up fingerprint stays valid. */
export const FP_LOCAL_DAYS = 30;

function randB64(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return enc(b);
}

function localRpId(): string {
  return window.location.hostname;
}

/** Is the remembered device still valid (not expired)? */
export function fpDeviceActive(d: FpDevice): boolean {
  return !d.until || new Date(d.until).getTime() > Date.now();
}

/** Days left before this phone's fingerprint expires (0 if expired). */
export function fpDaysLeft(d: FpDevice): number {
  if (!d.until) return Infinity;
  return Math.max(0, Math.ceil((new Date(d.until).getTime() - Date.now()) / 86_400_000));
}

/** Opens the phone's biometric prompt and registers fingerprint unlock for this user. */
export async function setupLocalPasskey(username: string): Promise<FpDevice> {
  const cred = await createPasskey({
    challenge: randB64(),
    rpId: localRpId(),
    userId: enc(new TextEncoder().encode(`zx-${username}`)),
    username,
  });
  const d: FpDevice = {
    id: cred.id,
    u: username,
    until: new Date(Date.now() + FP_LOCAL_DAYS * 86_400_000).toISOString(),
  };
  setFpDevice(d);
  return d;
}

/** Opens the phone's biometric prompt to verify the owner (throws if cancelled/failed) and returns the credential id. */
export async function unlockLocalPasskey(credentialId?: string): Promise<string> {
  const res = await getPasskey({
    challenge: randB64(),
    rpId: localRpId(),
    ...(credentialId ? { credentialId } : {}),
  });
  return res.id;
}

/** Requires a fresh biometric scan, then extends this phone's validity by 30 days. */
export async function renewLocalPasskey(d: FpDevice): Promise<FpDevice> {
  await unlockLocalPasskey(d.id);
  const next: FpDevice = {
    ...d,
    until: new Date(Date.now() + FP_LOCAL_DAYS * 86_400_000).toISOString(),
  };
  setFpDevice(next);
  return next;
}
