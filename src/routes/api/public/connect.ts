import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Public connect API used by the APK (login.h) to validate a license key.
// Backed by the GitHub-as-database store (db.json in zerox-panel-data).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SECURITY = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...CORS, ...SECURITY } });

function normalise(p: Record<string, string>): Record<string, string> {
  const first = (...names: string[]) => names.map((n) => p[n]).find((v) => typeof v === "string" && v.trim() !== "");
  const out: Record<string, string> = {};
  const game = first("game", "Game", "gamename", "game_name");
  const key = first("user_key", "userkey", "key", "license", "license_key");
  const serial = first("serial", "uuid", "device", "device_id", "deviceid", "hwid");
  if (game) out["game"] = game;
  if (key) out["user_key"] = key;
  if (serial) out["serial"] = serial;
  if (p["ping"] !== undefined) out["ping"] = p["ping"];
  return out;
}

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

const Input = z.object({
  game: z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/),
  user_key: z.string().trim().min(1).max(36),
  serial: z.string().trim().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
});

export const Route = createFileRoute("/api/public/connect")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const params = normalise(await readParams(request));
        if (params["ping"] === "1" && !params["user_key"]) {
          const s = await import("../../../lib/gh-store.server");
          const { db } = await s.readDb();
          const m = db.settings.maintenance;
          return json({ ok: true, message: m.on ? "MAINTENANCE" : "ONLINE", maintenance: m });
        }
        return json({ status: false, reason: "NO_KEY", message: "Send user_key + serial to validate a license key" }, 200);
      },
      POST: async ({ request }) => {
        try {
          const s = await import("../../../lib/gh-store.server");
          if (!s.storageConfigured()) {
            return json({ status: false, reason: "CONFIG", message: "Panel storage not configured on server" }, 200);
          }

          const params = normalise(await readParams(request));
        let parsed: { game: string; user_key: string; serial: string };
        try {
          parsed = Input.parse(params);
        } catch {
          return json({ status: false, reason: "BAD_INPUT", message: "game, user_key and serial are required" }, 200);
        }

        // Maintenance mode blocks everything except the owner checking status.
        const { db } = await s.readDb();
        if (db.settings.maintenance.on) {
          return json({
            status: false,
            reason: "MAINTENANCE",
            message: db.settings.maintenance.message || "App under maintenance — try again later.",
          }, 200);
        }

        const now = Date.now();
        const key = db.keys.find((k) => k.license_key === parsed.user_key);
        if (!key) {
          return json({ status: false, reason: "INVALID_KEY", message: "This license key does not exist" }, 200);
        }
        if (key.expires_at && new Date(key.expires_at).getTime() <= now) {
          return json({ status: false, reason: "EXPIRED", message: "This license key has expired" }, 200);
        }

        // Device binding: bind this serial to the key (one-time per device).
        if (!key.devices.includes(parsed.serial)) {
          if (key.devices.length >= key.max_devices) {
            return json({
              status: false,
              reason: "DEVICE_LIMIT",
              message: `Key is already bound to ${key.devices.length} device(s) (max ${key.max_devices})`,
            }, 200);
          }
          await s.mutateDb((d2) => {
            const k = d2.keys.find((x) => x.id === key.id);
            if (k && !k.devices.includes(parsed.serial)) k.devices.push(parsed.serial);
          }, `connect bind device for ${parsed.user_key}`);
        }
        const bound = (await s.readDb()).db.keys.find((x) => x.license_key === parsed.user_key);

        return json({
          status: true,
          reason: null,
          message: "Key valid",
          expiry: key.expires_at ?? null,
          game: key.game,
          devices: bound?.devices ?? key.devices,
          max_devices: key.max_devices,
        }, 200);
        } catch (err) {
          return json({ status: false, reason: "SERVER_ERROR", message: String(err) }, 200);
        }
      },
    },
  },
});
