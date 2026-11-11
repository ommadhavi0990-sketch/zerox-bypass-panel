import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Result = { ok: true } | { ok: false; error: string };

function clean(msg: string) {
  return msg;
}

const registerSchema = z.object({
  username: z.string().trim().min(4, "Username: 4-24 letters, numbers or _").max(24),
  password: z.string().min(6, "Password must be at least 6 characters").max(64),
  referral: z.string().trim().min(4, "Enter a valid referral code").max(32),
});

/** Registration is disabled without Supabase. */
export const registerAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => registerSchema.parse(d))
  .handler(async () => ({ ok: false, error: "Account creation is disabled. Contact the Owner." } as Result));

const createUserSchema = z.object({
  username: z.string().trim().min(4).max(24),
  password: z.string().min(6).max(64),
  role: z.enum(["owner", "admin", "reseller"]),
  hours: z.number().int().positive().nullable(),
  credit: z.number().int().min(0).max(100_000_000),
});

export const ownerCreateUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createUserSchema.parse(d))
  .handler(async () => ({ ok: false, error: "User management is disabled without a database." } as Result));

export const ownerSetPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ userId: z.string(), password: z.string().min(6).max(64) }).parse(d))
  .handler(async () => ({ ok: false, error: "Password management is disabled without a database." } as Result));

export const ownerDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ userId: z.string() }).parse(d))
  .handler(async () => ({ ok: false, error: "User deletion is disabled without a database." } as Result));
