import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  DataTable,
  Empty,
  Field,
  Loader,
  PageGrid,
  RoleTag,
  copyText,
  useConfirm,
} from "@/components/zx/ui";
import { useMe } from "@/lib/me-context";
import { meQuery, pricesQuery, referralsQuery, getToken } from "@/lib/queries";
import { referralCreate, referralRevoke } from "@/lib/data.functions";
import {
  durationLabel,
  errMsg,
  fmtDate,
  inr,
  isExpired,
  newRequestId,
  referralCost,
  type AppRole,
} from "@/lib/zx";

export const Route = createFileRoute("/_authenticated/referral")({
  head: () => ({
    meta: [
      { title: "Create Referral · ZEROX BYPASS Panel" },
      { name: "description", content: "Referral creation is disabled without a database." },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role !== "owner" && me?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
  component: ReferralPage,
});

const VALIDITY = [
  { h: 24, l: "1 Day" },
  { h: 72, l: "3 Days" },
  { h: 168, l: "7 Days" },
  { h: 360, l: "15 Days" },
  { h: 720, l: "30 Days" },
];

function ReferralPage() {
  const { profile, role, isOwner } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: prices } = useQuery(pricesQuery);
  const { data: list, isLoading } = useQuery(referralsQuery);
  const { confirm, dialog } = useConfirm();

  const [target, setTarget] = useState<AppRole>("reseller");
  const [hours, setHours] = useState<string>("");
  const [credit, setCredit] = useState(0);
  const [uses, setUses] = useState(1);
  const [valid, setValid] = useState(168);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const reqId = useRef(crypto.randomUUID());

  const sel = hours || String(prices?.[0]?.hours ?? "");
  const lifetime = sel === "life";
  const price = lifetime ? 0 : (prices?.find((p) => String(p.hours) === sel)?.price ?? 0);
  const cost = referralCost(role, price, credit, uses);
  const remaining = profile.ref_limit - profile.ref_used;
  const overLimit = !isOwner && uses > remaining;
  const short = !isOwner && cost > profile.balance;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) {
      navigate({ to: "/", replace: true });
      return;
    }
    const h = sel && sel !== "life" ? Number(sel) : null;
    if (!h && !isOwner) {
      toast.error("Select a duration plan");
      return;
    }
    setBusy(true);
    try {
      const r = await referralCreate({
        data: {
          token,
          role: isOwner ? target : "reseller",
          hours: h,
          credit: credit,
          uses: uses,
          validHours: valid,
        },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setLast(r.code);
      void qc.invalidateQueries({ queryKey: ["referrals"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      setHours("");
      setCredit(0);
      setUses(1);
      setValid(168);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Referral creation failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: number) {
    const token = getToken();
    if (!token) return;
    const r = await referralRevoke({ data: { token, id } });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Referral revoked");
    void qc.invalidateQueries({ queryKey: ["referrals"] });
  }

  return (
    <PageGrid>
      {dialog}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader icon="bi-ticket-perforated" title="Create Referral" />
            <div className="zx-card-body">
              {!isOwner && (
                <div className={`zx-alert ${remaining <= 0 ? "bad" : "warn"} mb-4`}>
                  <i className="bi bi-ticket-perforated" />
                  <span>
                    Referral used:{" "}
                    <b>
                      {profile.ref_used} / {profile.ref_limit}
                    </b>
                    {remaining <= 0
                      ? " — limit reached, contact the Owner"
                      : ` · ${remaining} left`}
                  </span>
                </div>
              )}
              <form onSubmit={submit} className="space-y-4" noValidate>
                <Field label="Target Account Level" modern>
                  <select
                    className="zx-input"
                    value={isOwner ? target : "reseller"}
                    disabled={!isOwner}
                    onChange={(e) => setTarget(e.target.value as AppRole)}
                  >
                    {isOwner && <option value="owner">OWNER</option>}
                    {isOwner && <option value="admin">ADMIN</option>}
                    <option value="reseller">RESELLER</option>
                  </select>
                </Field>
                <Field label="Account Expiration" modern>
                  <select
                    className="zx-input"
                    value={sel}
                    onChange={(e) => setHours(e.target.value)}
                  >
                    {(prices ?? []).map((p) => (
                      <option key={p.hours} value={p.hours}>
                        {durationLabel(p.hours)}
                        {isOwner ? "" : ` — ₹${p.price}`}
                      </option>
                    ))}
                    {isOwner && <option value="life">Lifetime</option>}
                  </select>
                </Field>
                <Field label="Credit Amount (Balance)" modern>
                  <div className="zx-input-group">
                    <span className="zx-addon">₹</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="zx-input"
                      value={credit}
                      onChange={(e) =>
                        setCredit(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                      }
                    />
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Usage Limit" modern>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100}
                      className="zx-input"
                      value={uses}
                      onChange={(e) =>
                        setUses(Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))))
                      }
                    />
                  </Field>
                  <Field label="Code Valid For" modern>
                    <select
                      className="zx-input"
                      value={valid}
                      onChange={(e) => setValid(Number(e.target.value))}
                    >
                      {VALIDITY.map((v) => (
                        <option key={v.h} value={v.h}>
                          {v.l}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="zx-total">
                  <span className="font-semibold">Cost</span>
                  <b className="text-xl">
                    {isOwner ? <span className="zx-text-ok">FREE</span> : inr(cost)}
                  </b>
                </div>
                {!isOwner && (
                  <p className="zx-muted text-xs -mt-2">
                    (Duration price + credit) × usage limit is deducted from your balance (
                    {inr(profile.balance)}).
                  </p>
                )}
                <button
                  type="submit"
                  className="zx-btn zx-btn-lg w-full"
                  disabled={busy || short || overLimit}
                >
                  {busy ? (
                    <>
                      <span className="zx-prog" style={{ width: 18, height: 18, borderWidth: 2 }} />{" "}
                      Creating…
                    </>
                  ) : (
                    "Generate Referral Code"
                  )}
                </button>
              </form>
              {last && (
                <div className="zx-alert ok mt-4">
                  <i className="bi bi-check-circle" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">New code</div>
                    <span className="zx-code text-lg">{last}</span>
                  </div>
                  <button
                    type="button"
                    className="zx-icon-btn"
                    aria-label="Copy code"
                    onClick={() => copyText(last, "Referral copied")}
                  >
                    <i className="bi bi-clipboard" />
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="min-w-0">
          <Card>
            <CardHeader
              icon="bi-clock-history"
              title="History Logs"
              sub={`Total: ${list?.length ?? 0}`}
            />
            {isLoading ? (
              <Loader />
            ) : (
              <DataTable
                rows={list ?? []}
                rowKey={(r) => r.id}
                empty={<Empty text="No codes generated yet." />}
                mobileTitle={(r) => (
                  <div className="flex items-center justify-between gap-2">
                    <span className="zx-code">{r.code}</span>
                    <RoleTag role={r.role} />
                  </div>
                )}
                columns={[
                  {
                    key: "code",
                    label: "Code / Level",
                    mobileHidden: true,
                    render: (r) => (
                      <div className="flex flex-col items-start gap-1">
                        <button
                          type="button"
                          className="zx-code"
                          onClick={() => copyText(r.code, "Referral copied")}
                          title="Copy"
                        >
                          {r.code}
                        </button>
                        <RoleTag role={r.role} />
                      </div>
                    ),
                  },
                  {
                    key: "plan",
                    label: "Plan",
                    render: (r) => (
                      <div className="flex flex-col items-end md:items-start gap-1">
                        <span className="font-bold">{durationLabel(r.duration_hours)}</span>
                        <span className="zx-badge ok">{inr(r.credit)} credit</span>
                      </div>
                    ),
                  },
                  {
                    key: "uses",
                    label: "Uses",
                    render: (r) => (
                      <b>
                        {r.uses} / {r.max_uses}
                      </b>
                    ),
                  },
                  {
                    key: "exp",
                    label: "Code Expiry",
                    render: (r) => (
                      <div className="text-sm">
                        {fmtDate(r.expires_at)}
                        {isOwner && <div className="zx-muted text-xs">by {r.created_by_name}</div>}
                      </div>
                    ),
                  },
                  {
                    key: "status",
                    label: "Status / User",
                    render: (r) => (
                      <div className="flex flex-col items-end md:items-start gap-1">
                        {r.revoked ? (
                          <span className="zx-badge bad">Revoked</span>
                        ) : r.uses >= r.max_uses ? (
                          <span className="zx-badge mute">Used</span>
                        ) : isExpired(r.expires_at) ? (
                          <span className="zx-badge bad">Expired</span>
                        ) : (
                          <span className="zx-badge ok">Available</span>
                        )}
                        {r.redemptions.map((u) => (
                          <span key={u.username} className="text-xs zx-accent font-bold">
                            <i className="bi bi-person-check mr-1" />
                            {u.username}
                          </span>
                        ))}
                      </div>
                    ),
                  },
                  {
                    key: "act",
                    label: "",
                    render: (r) =>
                      !r.revoked && r.uses < r.max_uses && !isExpired(r.expires_at) ? (
                        <button
                          type="button"
                          className="zx-icon-btn danger"
                          aria-label="Revoke referral"
                          onClick={() =>
                            confirm({
                              title: "Revoke referral?",
                              body: `Code ${r.code} will be cancelled for new users. Existing users keep access.`,
                              danger: true,
                              action: () => revoke(r.id),
                            })
                          }
                        >
                          <i className="bi bi-x-octagon" />
                        </button>
                      ) : null,
                  },
                ]}
              />
            )}
          </Card>
        </div>
      </div>
    </PageGrid>
  );
}
