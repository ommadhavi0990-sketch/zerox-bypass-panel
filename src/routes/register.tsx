import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PublicShell, DmButton, AuthHead } from "@/components/zx/Shell";
import { Card } from "@/components/zx/ui";
import { USERNAME_RE, usernameToEmail } from "@/lib/zx";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create Account · ZEROX BYPASS Panel" },
      { name: "description", content: "Account creation is disabled in this build. Contact the Owner." },
      { property: "og:title", content: "Create Account · ZEROX BYPASS Panel" },
      { property: "og:description", content: "Account creation is disabled in this build. Contact the Owner." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterPage,
});

type Errors = Partial<Record<"username" | "password" | "password2" | "referral", string>>;

function RegisterPage() {
  const [f, setF] = useState({ username: "", password: "", password2: "", referral: "" });
  const [show, setShow] = useState({ p1: false, p2: false });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("Account creation is disabled in this build. Please contact the Owner to create an account.");
    setBusy(false);
  }

  return (
    <PublicShell>
      <div className="zx-auth-wrap">
        <div className="w-full max-w-[480px]">
          <Card className="zx-auth-card wide">
            <AuthHead title="Account Creation Disabled" sub="Contact the Owner to get an account" />
            <div className="zx-auth-body">
              <form onSubmit={onSubmit} noValidate className="space-y-4">
                {formError && <div className="zx-alert bad"><i className="bi bi-exclamation-octagon" /><span>{formError}</span></div>}
                <div>
                  <label className="zx-label" htmlFor="username">Username</label>
                  <div className="zx-input-icon">
                    <input id="username" className="zx-input" placeholder="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={24} value={f.username} onChange={set("username")} disabled />
                    <i className="bi bi-person-fill zx-ico" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="zx-label" htmlFor="password">Password</label>
                    <div className="zx-input-icon">
                      <input id="password" type={show.p1 ? "text" : "password"} className="zx-input" placeholder="Min 6 chars" autoComplete="new-password" maxLength={64} value={f.password} onChange={set("password")} disabled />
                      <button type="button" className="zx-ico" aria-label="Toggle password" disabled><i className={`bi ${show.p1 ? "bi-unlock-fill" : "bi-lock-fill"}`} /></button>
                    </div>
                  </div>
                  <div>
                    <label className="zx-label" htmlFor="password2">Confirm Password</label>
                    <div className="zx-input-icon">
                      <input id="password2" type={show.p2 ? "text" : "password"} className="zx-input" placeholder="Repeat password" autoComplete="new-password" maxLength={64} value={f.password2} onChange={set("password2")} disabled />
                      <button type="button" className="zx-ico" aria-label="Toggle password" disabled><i className={`bi ${show.p2 ? "bi-unlock-fill" : "bi-lock-fill"}`} /></button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="zx-label" htmlFor="referral">Referral Code</label>
                  <div className="zx-input-icon">
                    <input id="referral" className="zx-input uppercase" placeholder="Referral Code" autoCapitalize="characters" spellCheck={false} maxLength={32} value={f.referral} onChange={set("referral")} disabled />
                    <i className="bi bi-gift-fill zx-ico" />
                  </div>
                </div>
                <button type="submit" className="zx-btn zx-btn-lg w-full" disabled>
                  Creating… (disabled)
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
