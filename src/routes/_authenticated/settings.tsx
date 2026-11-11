import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, Field, PageGrid } from "@/components/zx/ui";
import { useMe } from "@/lib/me-context";
import { getToken } from "@/lib/queries";
import { changeMyPassword } from "@/lib/auth.functions";
import { errMsg, fmtDate, inr, ROLE_LABEL, usernameToEmail } from "@/lib/zx";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings · ZEROX BYPASS Panel" },
      { name: "description", content: "Change your password and view your account." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, role, isOwner } = useMe();
  const [f, setF] = useState({ current: "", password: "", password2: "" });
  const [errors, setErrors] = useState<Partial<typeof f>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Partial<typeof f> = {};
    if (!f.current) er.current = "Enter your current password";
    if (f.password.length < 6) er.password = "At least 6 characters";
    if (f.password2 !== f.password) er.password2 = "Passwords do not match";
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const token = getToken();
      if (!token) {
        setErrors({ current: "Session expired — log in again" });
        return;
      }
      const r = await changeMyPassword({ data: { token, current: f.current, next: f.password } });
      if (!r.ok) {
        setErrors({ current: r.error });
        return;
      }
      toast.success("Password updated");
      setF({ current: "", password: "", password2: "" });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageGrid>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader icon="bi-shield-lock" title="Security Settings" />
          <form onSubmit={submit} className="zx-card-body space-y-4" noValidate>
            <Field label="Current Password" error={errors.current}>
              <input
                type="password"
                className="zx-input"
                placeholder="••••••••"
                autoComplete="current-password"
                value={f.current}
                onChange={(e) => setF({ ...f, current: e.target.value })}
              />
            </Field>
            <Field label="New Password" error={errors.password}>
              <input
                type="password"
                className="zx-input"
                placeholder="At least 6 characters"
                autoComplete="new-password"
                value={f.password}
                onChange={(e) => setF({ ...f, password: e.target.value })}
              />
            </Field>
            <Field label="Confirm New Password" error={errors.password2}>
              <input
                type="password"
                className="zx-input"
                placeholder="Repeat new password"
                autoComplete="new-password"
                value={f.password2}
                onChange={(e) => setF({ ...f, password2: e.target.value })}
              />
            </Field>
            <button type="submit" className="zx-btn zx-btn-lg w-full" disabled={busy}>
              <i className="bi bi-key" /> {busy ? "Updating…" : "Update Password"}
            </button>
          </form>
        </Card>
        <Card>
          <CardHeader icon="bi-person-badge" title="Personal Profile" />
          <div className="zx-card-body">
            <div className="text-center mb-5">
              <span
                className="zx-avatar mx-auto"
                style={{ width: 80, height: 80, fontSize: "2.2rem", borderRadius: "50%" }}
              >
                {profile.username[0]?.toUpperCase()}
              </span>
              <h5 className="mt-3 text-xl">{profile.username}</h5>
              <p className="zx-muted text-sm">
                System Registered {role ? ROLE_LABEL[role] : "User"}
              </p>
            </div>
            <Row k="Balance" v={isOwner ? "∞ Unlimited" : inr(profile.balance)} />
            <Row
              k="Expiry"
              v={isOwner || !profile.expires_at ? "Lifetime" : fmtDate(profile.expires_at)}
            />
            {role !== "reseller" && (
              <Row
                k="Referral limit"
                v={isOwner ? "Unlimited" : `${profile.ref_used} / ${profile.ref_limit}`}
              />
            )}
            <Row k="Uplink" v={profile.uplink ?? "—"} />
            <Row k="Member since" v={fmtDate(profile.created_at)} />
          </div>
        </Card>
      </div>
    </PageGrid>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-2 border-b" style={{ borderColor: "var(--g18)" }}>
      <span className="zx-muted font-semibold">{k}</span>
      <b className="text-right">{v}</b>
    </div>
  );
}
