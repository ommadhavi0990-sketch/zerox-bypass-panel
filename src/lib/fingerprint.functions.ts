/* Fingerprint functions stub — Supabase removed. These return "not configured" so the UI doesn't crash. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const b64 = z.string().min(1).max(4096).regex(/^[A-Za-z0-9_-]+$/);

export const fpStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ credentialId: b64 }).parse(d))
  .handler(async () => ({ state: "unknown" as const, until: null as string | null }));

export const fpLoginOptions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ credentialId: b64 }).parse(d))
  .handler(async () => ({ ok: false as const, code: "UNKNOWN" as const, error: "Fingerprint is not configured without Supabase." }));

export const fpLoginVerify = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ credentialId: b64, authenticatorData: b64, clientDataJSON: b64, signature: b64 }).parse(d))
  .handler(async () => ({ ok: false as const, code: "ERROR" as const, error: "Fingerprint is not configured without Supabase." }));

export const fpMyStatus = createServerFn({ method: "GET" })
  .handler(async () => ({ has: false, lifetime: false, active: false, expiresAt: null as string | null, devices: 0 }));

export const fpCheckCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(4).max(32) }).parse(d))
  .handler(async () => ({ ok: false as const, error: "Fingerprint is not configured without Supabase." }));

export const fpRegisterOptions = createServerFn({ method: "POST" })
  .handler(async () => ({ ok: false as const, error: "Fingerprint is not configured without Supabase." }));

const credSchema = z.object({ id: b64, publicKey: b64, alg: z.number().int(), clientDataJSON: b64 });

export const fpRegisterVerify = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(4).max(32).optional(), credential: credSchema }).parse(d))
  .handler(async () => ({ ok: false as const, error: "Fingerprint is not configured without Supabase." }));

export const fpRenew = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(4).max(32) }).parse(d))
  .handler(async () => ({ ok: false as const, error: "Fingerprint is not configured without Supabase." }));

export const fpDisable = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ credentialId: b64 }).parse(d))
  .handler(async () => ({ ok: true as const }));
