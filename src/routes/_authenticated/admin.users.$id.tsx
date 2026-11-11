import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  DataTable,
  Empty,
  Field,
  Loader,
  PageGrid,
  StatusPill,
  useConfirm,
} from "@/components/zx/ui";
import { meQuery, transactionsQuery, usersQuery, getToken } from "@/lib/queries";
import {
  ownerDeleteUser,
  ownerSetPassword,
  ownerUpdateUser,
  ownerAdjustBalance,
} from "@/lib/auth.functions";
import { errMsg, fmtDate, inr, isExpired, type AccountStatus, type AppRole } from "@/lib/zx";
import { kindLabel } from "./dashboard";

export const Route = createFileRoute("/_authenticated/admin/users/$id")({
  head: () => ({
    meta: [
      { title: "Edit Account · ZEROX BYPASS Panel" },
      { name: "description", content: "Edit an account's role, balance, expiry and status." },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role !== "owner") throw redirect({ to: "/dashboard" });
  },
  component: EditUser,
});

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function EditUser() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: users, isLoading } = useQuery(usersQuery);
  const { data: tx } = useQuery(transactionsQuery(id));
  const { confirm, dialog } = useConfirm();
  const u = users?.find((x) => x.id === id);

  const [role, setRole] = useState<AppRole>("reseller");
  const [status, setStatus] = useState<AccountStatus>("active");
  const [lifetime, setLifetime] = useState(false);
  const [expires, setExpires] = useState("");
  const [refLimit, setRefLimit] = useState(10);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"add" | "subtract" | "set">("add");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [pw, setPw] = useState("");

  useEffect(() => {
    if (!u) return;
    setRole((u.role ?? "reseller") as AppRole);
    setStatus(u.status);
    setLifetime(!u.expires_at);
    setExpires(toLocalInput(u.expires_at));
    setRefLimit(u.ref_limit);
  }, [u?.id, u?.status, u?.role, u?.expires_at, u?.ref_limit]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["users"] });
    void qc.invalidateQueries({ queryKey: ["transactions"] });
    void qc.invalidateQueries({ queryKey: ["me"] });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return toast.error("Session expired — log in again");
    setBusy(true);
    try {
      const r = await ownerUpdateUser({
        data: {
          token,
          userId: id,
          role,
          status,
          expires_at: lifetime ? null : expires || null,
          ref_limit: refLimit,
        },
      });
      if (!r.ok) return toast.error(r.error);
      toast.success("Account updated");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function adjust(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return toast.error("Session expired — log in again");
    if (!amount) return toast.error("Enter an amount");
    setBusy(true);
    try {
      const r = await ownerAdjustBalance({
        data: { token, userId: id, mode, amount, note: note.trim() || undefined },
      });
      if (!r.ok) return toast.error(r.error);
      toast.success(`Balance ${r.balance ? inr(r.balance) : "₹0"}`);
      setAmount(0);
      setNote("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Adjustment failed");
    } finally {
      setBusy(false);
    }
  }

  async function quickStatus(s: AccountStatus) {
    const token = getToken();
    if (!token) return toast.error("Session expired — log in again");
    setBusy(true);
    try {
      const r = await ownerUpdateUser({
        data: {
          token,
          userId: id,
          role: u.role,
          status,
          expires_at: lifetime ? null : expires || null,
          ref_limit: refLimit,
        },
      });
      if (!r.ok) return toast.error(r.error);
      toast.success(`Status set to ${statusLabel(s)}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status change failed");
    } finally {
      setBusy(false);
    }
  }

  function statusLabel(s: AccountStatus) {
    return { active: "Active", blocked: "Blocked", banned: "Banned" }[s];
  }

  async function setPassword(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return toast.error("Session expired — log in again");
    if (pw.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);
    try {
      const res = await ownerSetPassword({ data: { token, userId: id, password: pw } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Password changed");
      setPw("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Password change failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const token = getToken();
    if (!token) return;
    const res = await ownerDeleteUser({ data: { token, userId: id } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("User deleted");
    refresh();
    navigate({ to: "/admin/users" });
  }

  if (isLoading)
    return (
      <PageGrid>
        <Loader />
      </PageGrid>
    );
  if (!u)
    return (
      <PageGrid>
        <Card>
          <Empty icon="bi-person-x" text="User not found." />
          <div className="text-center pb-6">
            <Link to="/admin/users" className="zx-btn-ghost">
              Back to list
            </Link>
          </div>
        </Card>
      </PageGrid>
    );

  return (
    <PageGrid>
      {dialog}
      <div className="mx-auto max-w-4xl space-y-4">
        <Card>
          <div className="zx-card-header">
            <div className="flex items-center gap-3 min-w-0">
              <span className="zx-avatar">{u.username[0]?.toUpperCase()}</span>
              <div className="min-w-0">
                <h6 className="zx-card-title truncate">Edit Account</h6>
                <small className="zx-muted font-bold">{u.username}</small>
              </div>
            </div>
            <Link to="/admin/users" className="zx-btn-ghost">
              <i className="bi bi-arrow-left" /> Back
            </Link>
          </div>
          <div className="zx-card-body">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-center">
              <Mini k="Balance" v={u.role === "owner" ? "∞" : inr(u.balance)} />
              <Mini k="Referrals" v={`${u.ref_used}/${u.ref_limit}`} />
              <Mini
                k="Status"
                v={
                  <StatusPill
                    status={u.status}
                    expired={u.role !== "owner" && isExpired(u.expires_at)}
                  />
                }
              />
              <Mini k="Uplink" v={u.uplink ?? "—"} />
            </div>
            <div className="flex flex-wrap gap-2 mb-5">
              <button
                type="button"
                className="zx-btn zx-btn-sm"
                onClick={() => quickStatus("active")}
              >
                <i className="bi bi-unlock" /> Unblock / Unban
              </button>
              <button type="button" className="zx-btn-ghost" onClick={() => quickStatus("blocked")}>
                <i className="bi bi-lock" /> Block
              </button>
              <button
                type="button"
                className="zx-btn zx-btn-sm zx-btn-danger"
                onClick={() => quickStatus("banned")}
              >
                <i className="bi bi-slash-circle" /> Ban
              </button>
            </div>
            <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4" noValidate>
              <Field label="Access Level / Role" modern>
                <select
                  className="zx-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value as AppRole)}
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="reseller">Reseller</option>
                </select>
              </Field>
              <Field label="Account Status" modern>
                <select
                  className="zx-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AccountStatus)}
                >
                  <option value="active">Active</option>
                  <option value="blocked">Blocked</option>
                  <option value="banned">Banned</option>
                </select>
              </Field>
              <Field label="Account Expiration" modern>
                <input
                  type="datetime-local"
                  className="zx-input"
                  disabled={lifetime}
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                />
                <label className="zx-check mt-2">
                  <input
                    type="checkbox"
                    checked={lifetime}
                    onChange={(e) => setLifetime(e.target.checked)}
                  />{" "}
                  Lifetime (never expires)
                </label>
              </Field>
              <Field label="Referral Limit (Admin default 10)" modern>
                <input
                  type="number"
                  min={0}
                  className="zx-input"
                  value={refLimit}
                  onChange={(e) =>
                    setRefLimit(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                  }
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    className="zx-btn-ghost"
                    onClick={() => setRefLimit((n) => Math.max(0, n - 1))}
                  >
                    −1
                  </button>
                  <button
                    type="button"
                    className="zx-btn-ghost"
                    onClick={() => setRefLimit((n) => n + 1)}
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    className="zx-btn-ghost"
                    onClick={() => setRefLimit((n) => n + 10)}
                  >
                    +10
                  </button>
                </div>
              </Field>
              <div className="sm:col-span-2">
                <button type="submit" className="zx-btn zx-btn-lg w-full" disabled={busy}>
                  <i className="bi bi-check-circle-fill" /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader
              icon="bi-wallet2"
              title="Balance"
              sub={`Current: ${u.role === "owner" ? "∞" : inr(u.balance)}`}
            />
            <form onSubmit={adjust} className="zx-card-body space-y-3" noValidate>
              <div className="zx-pick">
                {(["add", "subtract", "set"] as const).map((m) => (
                  <label key={m}>
                    <input
                      type="radio"
                      name="bm"
                      checked={mode === m}
                      onChange={() => setMode(m)}
                    />
                    <span className="capitalize">{m}</span>
                  </label>
                ))}
              </div>
              <div className="zx-input-group">
                <span className="zx-addon">₹</span>
                <input
                  type="number"
                  min={0}
                  className="zx-input"
                  value={amount}
                  onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                />
              </div>
              <input
                className="zx-input"
                placeholder="Note (optional)"
                maxLength={80}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button type="submit" className="zx-btn w-full" disabled={busy || !amount}>
                Apply
              </button>
            </form>
          </Card>
          <Card>
            <CardHeader icon="bi-key" title="Security" />
            <div className="zx-card-body space-y-4">
              <form onSubmit={setPassword} className="space-y-3">
                <input
                  className="zx-input"
                  type="text"
                  placeholder="New password (min 6)"
                  minLength={6}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  required
                />
                <button type="submit" className="zx-btn w-full">
                  Set Password
                </button>
              </form>
              <hr className="zx-hr" />
              <button
                type="button"
                className="zx-btn zx-btn-danger w-full"
                onClick={() =>
                  confirm({
                    title: `Delete ${u.username}?`,
                    body: "Deleting this account cannot be undone.",
                    danger: true,
                    action: remove,
                  })
                }
              >
                <i className="bi bi-trash" /> Delete User
              </button>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader icon="bi-receipt" title="Transaction History" />
          <DataTable
            rows={tx ?? []}
            rowKey={(r) => r.id}
            empty={<Empty text="No transactions." />}
            columns={[
              { key: "k", label: "Action", render: (r) => <b>{kindLabel(r.kind)}</b> },
              {
                key: "d",
                label: "Details",
                render: (r) => <span className="text-sm">{r.details}</span>,
              },
              {
                key: "a",
                label: "Amount",
                render: (r) => (
                  <span
                    className={
                      r.amount < 0
                        ? "zx-text-bad font-bold"
                        : r.amount > 0
                          ? "zx-text-ok font-bold"
                          : "zx-muted"
                    }
                  >
                    {inr(r.amount)}
                  </span>
                ),
              },
              {
                key: "t",
                label: "Time",
                render: (r) => <span className="text-sm zx-muted">{fmtDate(r.created_at)}</span>,
              },
            ]}
          />
        </Card>
      </div>
    </PageGrid>
  );
}

function Mini({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "var(--g08)", border: "1px solid var(--g25)" }}
    >
      <div className="zx-muted text-xs font-bold uppercase tracking-wider mb-1">{k}</div>
      <div className="font-bold">{v}</div>
    </div>
  );
}
