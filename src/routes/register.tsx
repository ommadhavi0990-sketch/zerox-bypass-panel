import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PublicShell, DmButton, AuthHead } from "@/components/zx/Shell";
import { Card } from "@/components/zx/ui";
import { USERNAME_RE, errMsg } from "@/lib/zx";
import { setToken, clearLegacyLocalData } from "@/lib/queries";
import { registerAccount } from "@/lib/auth.functions";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create Account · ZEROX BYPASS Panel" },
      { name: "description", content: "Create a panel account with a referral code." },
      { property: "og:title", content: "Create Account · ZEROX BYPASS Panel" },
      { property: "og:description", content: "Create a panel account with a referral code." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterPage,
});

type Errors = Partial<Record<"username" | "password" | "password2" | "referral", string>>;

function RegisterPage() {
  const navigate = useNavigate();
  const [f, setF] = useState({ username: "", password: "", password2: "", referral: "" });
  const [show, setShow] = useState({ p1: false, p2: false });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearLegacyLocalData();
    setFormError(null);
    const er: Errors = {};
    if (!USERNAME_RE.test(f.username.trim())) er.username = "Username must be 4-24 letters, numbers or _";
    if (f.password.length < 6) er.password = "At least 6 characters";
    if (f.password2 !== f.password) er.password2 = "Passwords do not match";
    if (!f.referral.trim()) er.referral = "Enter your referral code";
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const r = await registerAccount({
        data: { username: f.username.trim(), password: f.password, referral: f.referral.trim().toUpperCase() },
      });
      if (!r.ok) {
        setFormError(r.error);
        return;
      }
      setToken(r.token);
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      setFormError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicShell>
      <div className="zx-auth-wrap">
        <div className="w-full max-w-[480px]">
          <Card className="zx-auth-card wide">
            <AuthHead title="Create Account" sub="Register with a referral code from your uplink" />
            <div className="zx-auth-body">
              <form onSubmit={onSubmit} noValidate className="space-y-4">
                {formError && <div className="zx-alert bad"><i className="bi bi-exclamation-octagon" /><span>{formError}</span></div>}
                <div>
                  <label className="zx-label" htmlFor="username">Username</label>
                  <div className="zx-input-icon">
                    <input id="username" className="zx-input" placeholder="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={24} value={f.username} onChange={set("username")} />
                    <i className="bi bi-person-fill zx-ico" />
                  </div>
                  {errors.username && <p className="zx-input-err">{errors.username}</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="zx-label" htmlFor="password">Password</label>
                    <div className="zx-input-icon">
                      <input id="password" type={show.p1 ? "text" : "password"} className="zx-input" placeholder="Min 6 chars" autoComplete="new-password" maxLength={64} value={f.password} onChange={set("password")} />
                      <button type="button" className="zx-ico" aria-label="Toggle password" onClick={() => setShow((s) => ({ ...s, p1: !s.p1 }))}><i className={`bi ${show.p1 ? "bi-unlock-fill" : "bi-lock-fill"}`} /></button>
                    </div>
                    {errors.password && <p className="zx-input-err">{errors.password}</p>}
                  </div>
                  <div>
                    <label className="zx-label" htmlFor="password2">Confirm Password</label>
                    <div className="zx-input-icon">
                      <input id="password2" type={show.p2 ? "text" : "password"} className="zx-input" placeholder="Repeat password" autoComplete="new-password" maxLength={64} value={f.password2} onChange={set("password2")} />
                      <button type="button" className="zx-ico" aria-label="Toggle password" onClick={() => setShow((s) => ({ ...s, p2: !s.p2 }))}><i className={`bi ${show.p2 ? "bi-unlock-fill" : "bi-lock-fill"}`} /></button>
                    </div>
                    {errors.password2 && <p className="zx-input-err">{errors.password2}</p>}
                  </div>
                </div>
                <div>
                  <label className="zx-label" htmlFor="referral">Referral Code</label>
                  <div className="zx-input-icon">
                    <input id="referral" className="zx-input uppercase" placeholder="Referral Code" autoCapitalize="characters" spellCheck={false} maxLength={32} value={f.referral} onChange={set("referral")} />
                    <i className="bi bi-gift-fill zx-ico" />
                  </div>
                  {errors.referral && <p className="zx-input-err">{errors.referral}</p>}
                </div>
                <button type="submit" className="zx-btn zx-btn-lg w-full" disabled={busy}>
                  {busy ? <><span className="zx-prog" style={{ width: 18, height: 18, borderWidth: 2 }} /> Creating…</> : "Create Account"}
                </button>
                <p className="text-center text-sm zx-muted pt-1">
                  Already have an account? <Link to="/" className="font-bold">Login</Link>
                </p>
              </form>
            </div>
          </Card>
          <DmButton />
          <div className="zx-credit">ZEROX BYPASS PANEL</div>
        </div>
      </div>
    </PublicShell>
  );
}
