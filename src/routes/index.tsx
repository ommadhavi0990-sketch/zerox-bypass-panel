import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DmButton, AuthHead } from "@/components/zx/Shell";
import { Card } from "@/components/zx/ui";
import { errMsg, USERNAME_RE } from "@/lib/zx";
import {
  clearFpDevice,
  fpDeviceActive,
  fpErrorMessage,
  fpLocked,
  fpSupported,
  getFpDevice,
  markUnlocked,
  unlockLocalPasskey,
  type FpDevice,
} from "@/lib/fingerprint-device";

// Simple local auth (no Supabase). Users are stored in localStorage.
const LOCAL_USERS_KEY = "zx_local_users";
const LOCAL_SESSION_KEY = "zx_local_session";

type LocalUser = {
  id: string;
  username: string;
  passwordHash: string;
  role: "owner" | "admin" | "reseller";
  balance: number;
  expires_at: string | null;
  created_at: string;
};

function getUsers(): LocalUser[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveUsers(users: LocalUser[]) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {
    /* ignore */
  }
}
function hashPassword(pw: string): string {
  // Simple hash (not for real security — just obfuscation)
  let h = 0;
  for (let i = 0; i < pw.length; i++) h = ((h << 5) - h + pw.charCodeAt(i)) | 0;
  return String(h);
}
function getSession(): LocalUser | null {
  try {
    const raw = sessionStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function setSession(user: LocalUser) {
  try {
    sessionStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}
function clearSession() {
  try {
    sessionStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// Seed the default owner account. Always ensures it exists (idempotent) so a stale
// or half-written local store can never lock the owner out of the demo panel.
function ensureSeed() {
  const users = getUsers();
  if (!users.some((u) => u.username.toLowerCase() === "owner")) {
    users.push({
      id: "owner-1",
      username: "owner",
      passwordHash: hashPassword("owner123"),
      role: "owner",
      balance: 999999999,
      expires_at: null,
      created_at: new Date().toISOString(),
    });
    saveUsers(users);
  }
}

export const Route = createFileRoute("/")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Login · ZEROX BYPASS Panel" },
      {
        name: "description",
        content: "Sign in to the ZEROX BYPASS panel to generate keys and manage referrals.",
      },
      { property: "og:title", content: "Login · ZEROX BYPASS Panel" },
      {
        property: "og:description",
        content: "Sign in to the ZEROX BYPASS panel to generate keys and manage referrals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function safeRedirect(r?: string) {
  return r && r.startsWith("/") && !r.startsWith("//") ? r : "/dashboard";
}

function LoginPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dev, setDev] = useState<FpDevice | null>(null);
  const [fp, setFp] = useState<"none" | "active" | "expired">("none");
  const [fpBusy, setFpBusy] = useState(false);
  const [canFp, setCanFp] = useState(false);

  useEffect(() => {
    ensureSeed();
    void fpSupported().then((v) => setCanFp(v));
    const d = getFpDevice();
    setDev(d);
    // Local mode: the stored device is valid until its expiry date. No server needed.
    setFp(d ? (fpDeviceActive(d) ? "active" : "expired") : "none");
    const session = getSession();
    if (session && !fpLocked()) navigate({ to: safeRedirect(redirect), replace: true });
  }, [navigate, redirect]);

  async function unlock() {
    if (!dev) return;
    setError(null);
    setFpBusy(true);
    try {
      // The WebAuthn biometric prompt is the verification in local mode.
      await unlockLocalPasskey(dev.id);
      const user = getUsers().find((u) => u.username.toLowerCase() === dev.u.toLowerCase());
      if (!user) {
        clearFpDevice();
        setDev(null);
        setFp("none");
        setError(
          "The account saved with this fingerprint no longer exists. Log in with your password.",
        );
        return;
      }
      markUnlocked();
      setSession(user);
      navigate({ to: safeRedirect(redirect), replace: true });
    } catch (e) {
      setError(fpErrorMessage(e));
    } finally {
      setFpBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!USERNAME_RE.test(username.trim()))
      return setError("Username must be 4-24 letters, numbers or _");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    setBusy(true);
    try {
      const users = getUsers();
      const user = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
      if (!user || user.passwordHash !== hashPassword(password)) {
        setBusy(false);
        return setError("Wrong username or password");
      }
      markUnlocked();
      setSession(user);
      navigate({ to: safeRedirect(redirect), replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="zx-auth-wrap zx-auth-full">
      <div className="w-full max-w-[420px]">
        <Card className="zx-auth-card">
          <AuthHead title="Welcome Back" sub="Sign in to your ZEROX panel" />
          <div className="zx-auth-body">
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              {error && (
                <div className="zx-alert bad">
                  <i className="bi bi-exclamation-octagon" />
                  <span>{error}</span>
                </div>
              )}
              <div>
                <label className="zx-label" htmlFor="username">
                  Username
                </label>
                <div className="zx-input-icon">
                  <input
                    id="username"
                    className="zx-input"
                    placeholder="Username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={4}
                  />
                  <i className="bi bi-person-fill zx-ico" />
                </div>
              </div>
              <div>
                <label className="zx-label" htmlFor="password">
                  Password
                </label>
                <div className="zx-input-icon">
                  <input
                    id="password"
                    type={show ? "text" : "password"}
                    className="zx-input"
                    placeholder="Password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="zx-ico"
                    aria-label={show ? "Hide password" : "Show password"}
                    onClick={() => setShow((s) => !s)}
                  >
                    <i className={`bi ${show ? "bi-unlock-fill" : "bi-lock-fill"}`} />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="zx-check">
                  <input type="checkbox" defaultChecked /> Remember me
                </label>
              </div>
              <button type="submit" className="zx-btn zx-btn-lg w-full" disabled={busy}>
                {busy ? (
                  <>
                    <span className="zx-prog" style={{ width: 18, height: 18, borderWidth: 2 }} />{" "}
                    Logging in…
                  </>
                ) : (
                  "Login to Dashboard"
                )}
              </button>
              <p className="text-center text-sm zx-muted pt-2">
                Default account: <b>owner</b> / <b>owner123</b>
              </p>
              {(dev || canFp) && (
                <div className="space-y-3 pt-4">
                  <div className="flex items-center gap-3 zx-muted text-xs font-bold uppercase tracking-wider">
                    <span className="flex-1 border-t" style={{ borderColor: "var(--g18)" }} />
                    OR
                    <span className="flex-1 border-t" style={{ borderColor: "var(--g18)" }} />
                  </div>
                  {dev && fp === "active" && (
                    <button
                      type="button"
                      className="zx-btn zx-btn-lg w-full"
                      disabled={fpBusy}
                      onClick={() => void unlock()}
                    >
                      <i className="bi bi-fingerprint" />{" "}
                      {fpBusy ? "Waiting for fingerprint…" : "UNLOCK WITH FINGER TOUCH"}
                    </button>
                  )}
                  {dev && fp === "expired" && (
                    <div className="zx-alert bad">
                      <i className="bi bi-hourglass-bottom" />
                      <span>
                        <b>Fingerprint expired.</b> Log in with your password, then renew it under
                        Enable Fingerprint.
                      </span>
                    </div>
                  )}
                  {(!dev || fp === "expired") && (
                    <Link to="/fingerprint" className="zx-btn-ghost w-full">
                      <i className="bi bi-fingerprint" /> Enable Fingerprint
                    </Link>
                  )}
                </div>
              )}
            </form>
            <DmButton />
            <div className="zx-credit">ZEROX BYPASS PANEL</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
