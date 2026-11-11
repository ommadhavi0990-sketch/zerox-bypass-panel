import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, DataTable, Field, Loader, PageGrid, RoleTag, StatusPill } from "@/components/zx/ui";
import { useMe } from "@/lib/me-context";
import { meQuery, pricesQuery, usersQuery, getToken } from "@/lib/queries";
import { ownerCreateUser, ownerDeleteUser, ownerSetPassword, ownerUpdateUser, ownerAdjustBalance } from "@/lib/queries";
import { durationLabel, errMsg, fmtDate, inr, isExpired, timeAgo, type AppRole } from "@/lib/zx";

export const Route = createFileRoute("/_authenticated/admin/users/")({
  head: () => ({ meta: [{ title: "Manage Users · ZEROX BYPASS Panel" }, { name: "description", content: "View and manage panel users, balances and referrals." }] }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role !== "owner" && me?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
  component: UsersPage,
});

function UsersPage() {
  const { isOwner, userId } = useMe();
  const { data, isLoading } = useQuery(usersQuery);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | AppRole>("all");
  const [showCreate, setShowCreate] = useState(false);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((u) => (role === "all" || u.role === role) && (!s || u.username.toLowerCase().includes(s)));
  }, [data, q, role]);

  const others = (data ?? []).filter((u) => u.id !== userId);
  const liquidity = others.filter((u) => u.role !== "owner").reduce((a, u) => a + Number(u.balance), 0);

  return (
    <PageGrid>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
        <Card><div className="zx-stat"><div className="zx-stat-icon"><i className="bi bi-people-fill" /></div><div><div className="zx-stat-val">{others.length}</div><div className="zx-stat-lab">{isOwner ? "Members" : "My Resellers"}</div></div></div></Card>
        <Card><div className="zx-stat"><div className="zx-stat-icon ok"><i className="bi bi-wallet2" /></div><div><div className="zx-stat-val">{inr(liquidity)}</div><div className="zx-stat-lab">Total Balance</div></div></div></Card>
        <Card><div className="zx-stat"><div className="zx-stat-icon warn"><i className="bi bi-lightning-charge-fill" /></div><div><div className="zx-stat-val">Live</div><div className="zx-stat-lab">Real-time</div></div></div></Card>
      </div>

      <Card>
        <CardHeader
          icon="bi-shield-lock"
          title="Account Governance"
          sub={isOwner ? "Full control over every account." : "Your resellers, their balance and status."}
          right={isOwner ? <button type="button" className="zx-btn zx-btn-sm" onClick={() => setShowCreate((s) => !s)}><i className="bi bi-person-plus" /> {showCreate ? "Close" : "Add User"}</button> : undefined}
        />
        {showCreate && isOwner && <CreateUser onDone={() => setShowCreate(false)} />}
        <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
          <div className="zx-input-icon"><input className="zx-input" placeholder="Filter accounts…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter accounts" /><i className="bi bi-search zx-ico" /></div>
          <select className="zx-input" value={role} onChange={(e) => setRole(e.target.value as typeof role)} aria-label="Filter by role">
            <option value="all">All roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="reseller">Reseller</option>
          </select>
        </div>
        {isLoading ? <Loader /> : (
          <DataTable
            rows={list}
            rowKey={(u) => u.id}
            mobileTitle={(u) => (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0"><span className="zx-avatar" style={{ width: 38, height: 38, fontSize: "1rem" }}>{u.username[0]?.toUpperCase()}</span><b className="truncate">{u.username}</b></div>
                {isOwner && <Link to="/admin/users/$id" params={{ id: u.id }} className="zx-icon-btn" aria-label={`Edit ${u.username}`}><i className="bi bi-sliders2-vertical" /></Link>}
              </div>
            )}
            columns={[
              { key: "id", label: "Identity", mobileHidden: true, render: (u) => <div className="flex items-center gap-3"><span className="zx-avatar" style={{ width: 38, height: 38, fontSize: "1rem" }}>{u.username[0]?.toUpperCase()}</span><div><b>{u.username}</b><div className="zx-muted text-xs">Joined {fmtDate(u.created_at)}</div></div></div> },
              { key: "role", label: "Role", render: (u) => <RoleTag role={u.role} /> },
              { key: "bal", label: "Balance", render: (u) => u.role === "owner" ? <b className="zx-accent text-lg">∞</b> : <b>{inr(u.balance)}</b> },
              { key: "ref", label: "Referrals", render: (u) => u.role === "reseller" ? <span className="zx-muted">—</span> : <span>{u.ref_used} / {u.ref_limit}</span> },
              { key: "st", label: "Status", render: (u) => <StatusPill status={u.status} expired={u.role !== "owner" && isExpired(u.expires_at)} /> },
              { key: "up", label: "Uplink", render: (u) => <span className="zx-muted">{u.uplink ?? "—"}</span> },
              { key: "exp", label: "Expiry", render: (u) => <span className="text-sm">{u.role === "owner" || !u.expires_at ? "Lifetime" : fmtDate(u.expires_at)}</span> },
              { key: "act", label: "Activity", render: (u) => <span className="zx-muted text-sm">{timeAgo(u.last_active_at)}</span> },
            ]}
          />
        )}
      </Card>
    </PageGrid>
  );
}

function CreateUser({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ username: "", password: "", role: "reseller" as AppRole, hours: "720", credit: 0 });
  const [busy, setBusy] = useState(false);
  const { data: prices } = useQuery(pricesQuery);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return toast.error("Session expired — log in again");
    const h = f.hours === "life" ? null : Number(f.hours);
    if (!f.username.trim()) return toast.error("Enter a username");
    if (f.password.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);
    try {
      const r = await ownerCreateUser({ token, username: f.username.trim(), password: f.password, role: f.role, hours: h, credit: f.credit });
      if (!r.ok) return toast.error(r.error);
      toast.success(`Account ${r.username} created`);
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      onDone();
      setF({ username: "", password: "", role: "reseller", hours: "720", credit: 0 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "User creation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="p-4 sm:p-5 border-b grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ borderColor: "var(--g25)" }} noValidate>
      <Field label="Username" modern><input className="zx-input" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="4-24 letters/numbers/_" required /></Field>
      <Field label="Password" modern><input className="zx-input" type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Min 6 characters" minLength={6} required /></Field>
      <Field label="Role" modern>
        <select className="zx-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as AppRole })}><option value="owner">OWNER</option><option value="admin">ADMIN</option><option value="reseller">RESELLER</option></select>
      </Field>
      <Field label="Duration" modern>
        <select className="zx-input" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })}>
          {(prices ?? []).map((p) => <option key={p.hours} value={p.hours}>{durationLabel(p.hours)}</option>)}
          <option value="life">Lifetime</option>
        </select>
      </Field>
      <Field label="Starting Balance (₹)" modern><input className="zx-input" type="number" min={0} value={f.credit} onChange={(e) => setF({ ...f, credit: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></Field>
      <div className="flex items-end"><button type="submit" className="zx-btn w-full" disabled={busy}>{busy ? "Creating…" : <><i className="bi bi-check-circle" /> Create Account</>}</button></div>
    </form>
  );
}
