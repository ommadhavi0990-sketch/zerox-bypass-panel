export type AppRole = "owner" | "admin" | "reseller";
export type AccountStatus = "active" | "banned" | "blocked";
export type Profile = {
  id: string;
  username: string;
  role: AppRole;
  status: AccountStatus;
  balance: number;
  ref_used: number;
  ref_limit: number;
  expires_at: string | null;
  created_at: string;
  uplink: string | null;
};

export const USERNAME_RE = /^[a-zA-Z0-9_]{4,24}$/;
export const AUTH_EMAIL_DOMAIN = "zeroxpanel.app";
export const GAMES = ["BGMI", "FIREWORK"] as const;
export const BULK_OPTIONS = [1, 10, 50, 100, 200, 300] as const;
export const DEFAULT_TELEGRAM = { url: "https://t.me/ONExZEROXX", handle: "@ONExZEROXX" };
export const EXPIRED_MESSAGE = "Your referral has expired. Please DM the Owner.";

/** Usernames are the login identity; auth needs an email, so derive a fixed internal one. */
export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

export function durationLabel(hours: number | null | undefined) {
  if (hours == null) return "Lifetime";
  if (hours < 24) return `${hours} ${hours === 1 ? "Hour" : "Hours"}`;
  if (hours % 24 === 0) {
    const d = hours / 24;
    return `${d} ${d === 1 ? "Day" : "Days"}`;
  }
  return `${hours} Hours`;
}

export function inr(n: number | null | undefined) {
  return "₹" + Number(n ?? 0).toLocaleString("en-IN");
}

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Owner",
  admin: "Admin",
  reseller: "Reseller",
};

export function isExpired(expiresAt: string | null | undefined, now = Date.now()) {
  return !!expiresAt && new Date(expiresAt).getTime() <= now;
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(d: string | null | undefined) {
  if (!d) return "never";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 0) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function timeLeft(d: string | null | undefined, now = Date.now()) {
  if (!d) return "Lifetime";
  const ms = new Date(d).getTime() - now;
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3600000);
  if (h < 24) return `${h}h ${Math.floor((ms % 3600000) / 60000)}m left`;
  return `${Math.floor(h / 24)}d ${h % 24}h left`;
}

/** Turn errors into a short message for the user. */
export function errMsg(e: unknown): string {
  const raw =
    typeof e === "string"
      ? e
      : e && typeof e === "object" && "message" in e
        ? String((e as { message: unknown }).message)
        : "Something went wrong";
  if (/Invalid login credentials/i.test(raw)) return "Wrong username or password";
  if (/already (been )?registered|already exists/i.test(raw)) return "Username already taken";
  if (/Failed to fetch|NetworkError/i.test(raw)) return "Network error — check your internet";
  return raw.replace(/^.*?ERROR:\s*/i, "");
}

export function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (+c ^ ((Math.random() * 16) >> (+c / 4))).toString(16),
      );
}

/** Cost an admin pays to create a referral: (duration price + credit) × uses. Owner pays nothing. */
export function referralCost(
  role: AppRole | null | undefined,
  durationPrice: number,
  credit: number,
  uses: number,
) {
  if (role === "owner") return 0;
  return (Math.max(0, durationPrice) + Math.max(0, credit)) * Math.max(1, uses);
}

/** Price of a key batch: per-key price × quantity. Owner generates free. */
export function keyBatchCost(role: AppRole | null | undefined, pricePerKey: number, qty: number) {
  if (role === "owner") return 0;
  return Math.max(0, pricePerKey) * Math.max(1, qty);
}
