import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardHeader, DataTable, Empty, Loader, PageGrid } from "@/components/zx/ui";
import { useMe } from "@/lib/me-context";
import { transactionsQuery } from "@/lib/queries";
import { fmtDate, inr } from "@/lib/zx";
import { kindLabel } from "./dashboard";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Transactions · ZEROX BYPASS Panel" }, { name: "description", content: "Complete key and referral transaction history." }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { isOwner, userId } = useMe();
  const [mine, setMine] = useState(!isOwner);
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery(transactionsQuery(mine ? userId : undefined));

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((r) => (kind === "all" || r.kind === kind) && (!s || r.username.toLowerCase().includes(s) || r.details.toLowerCase().includes(s)));
  }, [data, kind, q]);

  return (
    <PageGrid>
      <Card>
        <CardHeader
          icon="bi-receipt"
          title={isOwner && !mine ? "All Transactions" : "My Transactions"}
          sub="Latest 300"
          right={isOwner ? (
            <div className="zx-pick" style={{ gridTemplateColumns: "repeat(2, auto)" }}>
              <label><input type="radio" name="scope" checked={!mine} onChange={() => setMine(false)} /><span className="px-3">Everyone</span></label>
              <label><input type="radio" name="scope" checked={mine} onChange={() => setMine(true)} /><span className="px-3">Only me</span></label>
            </div>
          ) : undefined}
        />
        <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
          <div className="zx-input-icon"><input className="zx-input" placeholder="Search user or details…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" /><i className="bi bi-search zx-ico" /></div>
          <select className="zx-input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by type">
            <option value="all">All types</option>
            <option value="key_generate">Keys</option>
            <option value="referral_create">Referrals</option>
            <option value="referral_revoke">Referral revokes</option>
            <option value="balance_adjust">Balance updates</option>
            <option value="account_created">Accounts</option>
            <option value="owner_edit">Owner edits</option>
          </select>
        </div>
        {isLoading ? <Loader /> : (
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty={<Empty icon="bi-receipt" text="No transactions found." />}
            mobileTitle={(r) => <div className="flex justify-between gap-2"><b>{kindLabel(r.kind)}</b><span className="zx-muted text-xs">#{r.id}</span></div>}
            columns={[
              { key: "id", label: "#", mobileHidden: true, render: (r) => <span className="zx-muted">{r.id}</span> },
              { key: "u", label: "User", render: (r) => <b>{r.username}</b> },
              { key: "k", label: "Type", mobileHidden: true, render: (r) => <span className="zx-badge">{kindLabel(r.kind)}</span> },
              { key: "d", label: "Details", render: (r) => <span className="text-sm">{r.details}</span> },
              { key: "a", label: "Amount", render: (r) => <span className={r.amount < 0 ? "zx-text-bad font-bold" : r.amount > 0 ? "zx-text-ok font-bold" : "zx-muted"}>{r.amount > 0 ? "+" : ""}{inr(r.amount)}</span> },
              { key: "b", label: "Balance After", render: (r) => (r.balance_after == null ? "—" : inr(r.balance_after)) },
              { key: "t", label: "Time", render: (r) => <span className="text-sm zx-muted">{fmtDate(r.created_at)}</span> },
            ]}
          />
        )}
      </Card>
    </PageGrid>
  );
}
