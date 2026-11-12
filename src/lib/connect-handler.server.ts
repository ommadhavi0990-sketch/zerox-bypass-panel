import { z } from "zod";
import { encryptConnectReply, NONCE_RE } from "./connect-enc.server";

// Public connect handler used by Android APKs / C++ login.h to validate license keys.
// Drop-in compatible with classic Kuro / Zoro / Box PHP panel responses as well as ENC v2 (nonce).

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

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...CORS, ...SECURITY } });

const DEFAULT_CLASSIC_SECRET = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3oj9E";

function normalise(p: Record<string, string>): Record<string, string> {
  const first = (...names: string[]) =>
    names.map((n) => p[n]).find((v) => typeof v === "string" && v.trim() !== "");
  const out: Record<string, string> = {};
  const game = first("game", "Game", "gamename", "game_name");
  const key = first("user_key", "userkey", "key", "license", "license_key");
  const serial = first("serial", "uuid", "device", "device_id", "deviceid", "hwid");
  if (game) out["game"] = game;
  if (key) out["user_key"] = key;
  if (serial) out["serial"] = serial;
  if (p["ping"] !== undefined) out["ping"] = p["ping"];
  if (p["nonce"] !== undefined) out["nonce"] = p["nonce"];
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
      fd.forEach((v, k) => {
        if (typeof v === "string") out[k] = v;
      });
    } else {
      new URLSearchParams(await request.text()).forEach((v, k) => (out[k] = v));
    }
  } catch {
    /* fall through to validation error */
  }
  return out;
}

/** Format an ISO expiry timestamp as "YYYY-MM-DD HH:mm:ss" (never null, safe for C++ login.h). */
function formatExp(expiresAt: string | null): string {
  if (!expiresAt) return "2099-12-31 23:59:59";
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return "2099-12-31 23:59:59";
  return d.toISOString().slice(0, 19).replace("T", " ");
}

const Input = z.object({
  game: z.string().trim().min(1).max(64),
  user_key: z.string().trim().min(1).max(64),
  serial: z.string().trim().min(1).max(256),
});

async function handleVerify(params: Record<string, string>): Promise<Response> {
  try {
    const s = await import("./gh-store.server");
    if (!s.storageConfigured()) {
      return json(
        { status: false, reason: "SERVER NOT CONFIGURED", message: "Panel storage not configured on server" },
        200,
      );
    }

    let parsed: { game: string; user_key: string; serial: string };
    try {
      parsed = Input.parse(params);
    } catch {
      return json(
        { status: false, reason: "BAD INPUT", message: "game, user_key and serial are required" },
        200,
      );
    }

    const { db } = await s.readDb();
    if (db.settings.maintenance.on) {
      const msg = db.settings.maintenance.message || "App under maintenance — try again later.";
      return json({ status: false, reason: msg, message: msg }, 200);
    }

    const now = Date.now();
    const key = db.keys.find((k) => k.license_key === parsed.user_key);
    if (!key) {
      return json(
        { status: false, reason: "USER OR GAME NOT REGISTERED", message: "This license key does not exist" },
        200,
      );
    }
    if (key.expires_at && new Date(key.expires_at).getTime() <= now) {
      return json(
        { status: false, reason: "EXPIRED KEY", message: "This license key has expired" },
        200,
      );
    }

    // Device binding: bind this serial to the key (one-time per device).
    if (!key.devices.includes(parsed.serial)) {
      if (key.devices.length >= key.max_devices) {
        return json(
          {
            status: false,
            reason: "MAX DEVICE REACHED",
            message: `Key is already bound to ${key.devices.length} device(s) (max ${key.max_devices})`,
          },
          200,
        );
      }
      await s.mutateDb((d2) => {
        const k = d2.keys.find((x) => x.id === key.id);
        if (k && !k.devices.includes(parsed.serial)) k.devices.push(parsed.serial);
      }, `connect bind device for ${parsed.user_key}`);
    }
    const bound = (await s.readDb()).db.keys.find((x) => x.license_key === parsed.user_key);
    const devicesList = bound?.devices ?? key.devices;

    const { createHash } = await import("node:crypto");
    const secret = (process.env["CONNECT_SECRET"] || DEFAULT_CLASSIC_SECRET).trim();
    const token = createHash("md5")
      .update(`${parsed.game}-${parsed.user_key}-${parsed.serial}-${secret}`)
      .digest("hex");
    const rng = Math.floor(Date.now() / 1000);
    const expStr = formatExp(key.expires_at);

    const dataObj = {
      token,
      rng,
      EXP: expStr,
      ESP: "on",
      expiry: expStr,
      game: parsed.game,
      device: devicesList.length,
      max_devices: key.max_devices,
    };

    const nonce = params["nonce"]?.trim();
    if (nonce && NONCE_RE.test(nonce)) {
      const encSecret = (process.env["CONNECT_ENC_SECRET"] || secret).trim();
      const encrypted = await encryptConnectReply({
        secret: encSecret,
        userKey: parsed.user_key,
        serial: parsed.serial,
        nonce,
        data: dataObj,
      });
      return json(encrypted, 200);
    }

    return json(
      {
        status: true,
        data: dataObj,
        message: "Key valid",
        expiry: expStr,
        game: key.game,
        devices: devicesList,
        max_devices: key.max_devices,
      },
      200,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ status: false, reason: "SERVER ERROR", message: msg }, 200);
  }
}

export const connectHandlers = {
  OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
  GET: async ({ request }: { request: Request }) => {
    const params = normalise(await readParams(request));
    if (params["ping"] === "1" && !params["user_key"]) {
      const s = await import("./gh-store.server");
      const { db } = await s.readDb();
      const m = db.settings.maintenance;
      return json({ ok: true, message: m.on ? "MAINTENANCE" : "ONLINE", maintenance: m });
    }
    if (params["user_key"] && params["serial"]) {
      return handleVerify(params);
    }
    return json(
      { status: false, reason: "NO_KEY", message: "Send user_key + serial to validate a license key" },
      200,
    );
  },
  POST: async ({ request }: { request: Request }) => {
    const params = normalise(await readParams(request));
    return handleVerify(params);
  },
};
