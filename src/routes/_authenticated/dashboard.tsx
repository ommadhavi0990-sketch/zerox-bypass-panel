import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardHeader, DataTable, Empty, PageGrid } from "@/components/zx/ui";
import { useMe } from "@/lib/me-context";
import { statsQuery, transactionsQuery } from "@/lib/queries";
import { inr, ROLE_LABEL, timeAgo, fmtDate } from "@/lib/zx";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · ZEROX BYPASS Panel" }, { name: "description", content: "Your ZEROX BYPASS panel overview." }] }),
  component: Dashboard,
});

function Countdown({ expiresAt }: { expiresAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return <div className="zx-timer"><span className="zx-logo" style={{ fontSize: "1.3rem" }}>LIFETIME</span></div>;
  const d = new Date(expiresAt).getTime() - now;
  if (d <= 0) return <div className="zx-timer"><span className="zx-text-bad">EXPIRED</span></div>;
  const parts = [Math.floor(d / 86400000), Math.floor((d % 86400000) / 3600000), Math.floor((d % 3600000) / 60000), Math.floor((d % 60000) / 1000)];
  return (
    <div className="zx-timer">
      {parts.map((v, i) => <span key={i}>{String(v).padStart(2, "0")}<small>{"dhms"[i]}</small></span>)}
    </div>
  );
}

function Donut({ a, b }: { a: number; b: number }) {
  const total = a + b;
  const pct = total ? a / total : 0;
  const r = 52, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 140 140" className="mx-auto block" style={{ width: 150, height: 150 }} role="img" aria-label={`${a} active, ${b} expired keys`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--g15)" strokeWidth="12" />
      {pct > 0 && <circle cx="70" cy="70" r={r} fill="none" stroke="var(--zx-a)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} transform="rotate(-90 70 70)" style={{ transition: "stroke-dasharray .6s", filter: "drop-shadow(0 0 6px var(--g70))" }} />}
      <text x="70" y="66" textAnchor="middle" fill="var(--zx-text)" style={{ font: "800 22px var(--font-sans)" }}>{a}</text>
      <text x="70" y="86" textAnchor="middle" fill="var(--zx-muted)" style={{ font: "700 10px var(--font-sans)", letterSpacing: 1 }}>ACTIVE KEYS</text>
    </svg>
  );
}

function Dashboard() {
  const { profile, role, isOwner, userId } = useMe();
  const { data: stats } = useQuery(statsQuery);
  const { data: tx } = useQuery(transactionsQuery(userId));
  const s = stats ?? { total_keys: 0, active_keys: 0, expired_keys: 0, users: 0 };

  const cards = [
    { icon: "bi-key", cls: "", val: s.total_keys, lab: "Total Keys" },
    { icon: "bi-check2-circle", cls: "ok", val: s.active_keys, lab: "Active" },
    { icon: "bi-slash-circle", cls: "bad", val: s.expired_keys, lab: "Expired" },
    { icon: "bi-people", cls: "warn", val: s.users, lab: isOwner ? "Users" : "My Users" },
  ];

  return (
    <PageGrid>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        {cards.map((c, i) => (
          <Card key={c.lab} style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="zx-stat">
              <div className={`zx-stat-icon ${c.cls}`}><i className={`bi ${c.icon}`} /></div>
              <div className="min-w-0"><div className="zx-stat-val">{c.val}</div><div className="zx-stat-lab">{c.lab}</div></div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider zx-muted">
                  <span className="zx-status-dot" /> System Status: Active · Account {profile.expires_at ? "expires in" : "validity"}
                </span>
                <Countdown expiresAt={isOwner ? null : profile.expires_at} />
              </div>
              <div className="zx-prog"><i className="bi bi-lightning-fill" /></div>
            </div>
          </Card>

          <Card>
            <CardHeader icon="bi-clock-history" title="Recent Activity" right={<Link to="/history" className="zx-btn-ghost">View all</Link>} />
            <DataTable
              rows={(tx ?? []).slice(0, 8)}
              rowKey={(r) => r.id}
              empty={<Empty icon="bi-activity" text="No activity yet — generate your first key." />}
              columns={[
                { key: "a", label: "Action", render: (r) => <div><div className="font-bold text-sm">{kindLabel(r.kind)}</div><div className="zx-muted text-xs">{r.details}</div></div> },
                { key: "m", label: "Amount", render: (r) => <span className={r.amount < 0 ? "zx-text-bad font-bold" : r.amount > 0 ? "zx-text-ok font-bold" : "zx-muted"}>{r.amount > 0 ? "+" : ""}{inr(r.amount)}</span> },
                { key: "t", label: "Time", className: "text-right", render: (r) => <span className="zx-muted text-sm" title={fmtDate(r.created_at)}>{timeAgo(r.created_at)}</span> },
              ]}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="p-5 sm:p-6">
              <h6 className="text-xs font-bold uppercase tracking-wider zx-muted mb-4" style={{ textShadow: "none" }}>My Account</h6>
              <Row k="Username" v={<b>{profile.username}</b>} />
              <Row k="Rank" v={<span className="zx-badge solid">{role ? ROLE_LABEL[role] : "—"}</span>} />
              <Row k="Credit" v={<b className="zx-accent text-lg">{isOwner ? "∞ Unlimited" : inr(profile.balance)}</b>} />
              {role !== "reseller" && <Row k="Referrals" v={<b>{isOwner ? "Unlimited" : `${profile.ref_used} / ${profile.ref_limit}`}</b>} />}
              <Row k="Expiry" v={<span className="text-sm">{isOwner || !profile.expires_at ? "Lifetime" : fmtDate(profile.expires_at)}</span>} />
              <hr className="zx-hr" />
              <Donut a={s.active_keys} b={s.expired_keys} />
              <div className="grid grid-cols-2 gap-2 mt-4">
                <Link to="/keys/generate" className="zx-btn zx-btn-sm"><i className="bi bi-stars" /> Generate</Link>
                <Link to="/keys" className="zx-btn-ghost"><i className="bi bi-key" /> My Keys</Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </PageGrid>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 mb-3"><span className="zx-muted text-sm font-semibold">{k}</span>{v}</div>;
}

export function kindLabel(kind: string) {
  return (
    {
      key_generate: "Keys Generated",
      referral_create: "Referral Created",
      referral_revoke: "Referral Revoked",
      account_created: "Account Created",
      balance_adjust: "Balance Updated",
      owner_edit: "Account Updated",
    } as Record<string, string>
  )[kind] ?? kind;
}
