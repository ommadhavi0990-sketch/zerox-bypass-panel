import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Simple connect endpoint (Supabase removed). Returns status:false so old apps won't falsely authenticate.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function normalise(p: Record<string, string>): Record<string, string> {
  const first = (...names: string[]) => names.map((n) => p[n]).find((v) => typeof v === "string" && v.trim() !== "");
  const out: Record<string, string> = {};
  const game = first("game", "Game", "gamename", "game_name");
  const key = first("user_key", "userkey", "key", "license", "license_key");
  const serial = first("serial", "uuid", "device", "device_id", "deviceid", "hwid");
  if (game) out["game"] = game;
  if (key) out["user_key"] = key;
  if (serial) out["serial"] = serial;
  if (p["ping"]) out["ping"] = p["ping"];
  if (p["nonce"] !== undefined) out["nonce"] = p["nonce"];
  return out;
}

const Input = z.object({
  game: z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/),
  user_key: z.string().trim().min(1).max(36),
  serial: z.string().trim().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
});

const SECURITY = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...CORS, ...SECURITY } });

const clientIp = (request: Request) =>
  request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

async function readParams(request: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  new URL(request.url).searchParams.forEach((v, k) => (out[k] = v));
  if (request.method !== "POST") return out;
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(body ?? {})) if (v != null) out[k] = String(v);
    } else if (type.includes("multipart/form-data")) {
      const fd = await request.formData();
      fd.forEach((v, k) => { if (typeof v === "string") out[k] = v; });
    } else {
      new URLSearchParams(await request.text()).forEach((v, k) => (out[k] = v));
    }
  } catch {
    /* fall through to validation error */
  }
  return out;
}

export const Route = createFileRoute("/api/public/connect")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const params = normalise(await readParams(request));
        if (params["ping"] === "1" && !params["user_key"]) return json({ ok: true, message: "ZEROX BYPASS connect server online (no database)" });
        return json({ status: false, reason: "DISABLED", message: "Connect API disabled without Supabase database" }, 200);
      },
      POST: async ({ request }) => json({ status: false, reason: "DISABLED", message: "Connect API disabled without Supabase database" }, 200),
    },
  },
});
