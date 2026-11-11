import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, DataTable, Empty, Loader, PageGrid, copyText, useConfirm } from "@/components/zx/ui";
import { useMe } from "@/lib/me-context";
import { keysQuery, getToken } from "@/lib/queries";
import { keysDelete, keysDeleteExpired, keysResetDevices } from "@/lib/data.functions";
import { durationLabel, fmtDate, isExpired } from "@/lib/zx";

export const Route = createFileRoute("/_authenticated/keys/")({
  head: () => ({ meta: [{ title: "My Keys · ZEROX BYPASS Panel" }, { name: "description", content: "All license keys you generated." }] }),
  component: KeysPage,
});

const PAGE = 20;

function KeysPage() {
  const { isOwner } = useMe();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [blur, setBlur] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    const t = window.setTimeout(() => { setQ(search.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({ ...keysQuery(page, q), placeholderData: keepPreviousData });

  const refresh = () => { void qc.invalidateQueries({ queryKey: ["keys"] }); void qc.invalidateQueries({ queryKey: ["stats"] }); };

  async function del(id: number) {
    const token = getToken();
    if (!token) return;
    const r = await keysDelete({ data: { token, id } });
    if (!r.ok) return toast.error(r.error);
    toast.success("Key deleted");
    refresh();
  }
  async function resetDevices(id: number) {
    const token = getToken();
    if (!token) return;
    const r = await keysResetDevices({ data: { token, id } });
    if (!r.ok) return toast.error(r.error);
    toast.success("Devices reset");
    refresh();
  }
  async function delExpired() {
    const token = getToken();
    if (!token) return;
    const r = await keysDeleteExpired({ data: { token } });
    if (!r.ok) return toast.error(r.error);
    toast.success(r.deleted ? `${r.deleted} expired key(s) deleted` : "No expired keys");
    refresh();
  }

  const rows = data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE));

  return (
    <PageGrid>
      {dialog}
      <Card>
        <CardHeader
          icon="bi-key"
          title="Registered License Keys"
          sub={`${data?.count ?? 0} total`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="zx-icon-btn" onClick={() => setBlur((b) => !b)} title="Toggle key visibility" aria-label="Toggle key visibility"><i className={`bi ${blur ? "bi-eye" : "bi-eye-slash"}`} /></button>
              <button type="button" className="zx-btn-ghost" onClick={() => confirm({ title: "Delete expired keys?", body: "All your expired keys will be removed permanently.", danger: true, action: delExpired })}><i className="bi bi-trash" /> <span className="hidden sm:inline">Delete Expired</span></button>
              <Link to="/keys/generate" className="zx-btn zx-btn-sm"><i className="bi bi-plus-circle" /> Generate</Link>
            </div>
          }
        />
        <div className="p-3 sm:p-4">
          <div className="zx-input-icon">
            <input className="zx-input" placeholder="Search keys…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search keys" />
            <i className="bi bi-search zx-ico" />
          </div>
        </div>
        {isLoading ? <Loader /> : (
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty={<Empty icon="bi-key" text={q ? "No keys match your search." : "No license keys yet — generate your first key."} />}
            mobileTitle={(r) => <span className={`zx-code ${blur ? "zx-blur" : ""}`}>{r.license_key}</span>}
            columns={[
              { key: "id", label: "ID", className: "w-16", mobileHidden: true, render: (r) => <span className="zx-muted">#{r.id}</span> },
              { key: "game", label: "Game", render: (r) => <b>{r.game}</b> },
              { key: "key", label: "License Key", mobileHidden: true, render: (r) => <span className={`zx-code ${blur ? "zx-blur" : ""}`}>{r.license_key}</span> },
              ...(isOwner ? [{ key: "by", label: "By", render: (r: (typeof rows)[number]) => <span className="zx-muted">{r.created_by_name}</span> }] : []),
              { key: "dev", label: "Devices", render: (r) => <span className="font-bold">{r.devices?.length ?? 0} / {r.max_devices}</span> },
              { key: "plan", label: "Plan", render: (r) => <span className="zx-badge">{durationLabel(r.duration_hours)}</span> },
              { key: "exp", label: "Expiry", render: (r) => isExpired(r.expires_at) ? <span className="zx-badge bad">Expired</span> : <span className="text-sm">{fmtDate(r.expires_at)}</span> },
              {
                key: "act", label: "Actions", render: (r) => (
                  <div className="flex gap-2 justify-end md:justify-start">
                    <button type="button" className="zx-icon-btn" aria-label="Copy key" onClick={() => copyText(r.license_key, "Key copied")}><i className="bi bi-clipboard" /></button>
                    <button type="button" className="zx-icon-btn" aria-label="Reset devices" title="Reset devices" onClick={() => resetDevices(r.id)}><i className="bi bi-phone" /></button>
                    <button type="button" className="zx-icon-btn danger" aria-label="Delete key" onClick={() => confirm({ title: "Delete key?", body: `Key ${r.license_key} will be removed permanently.`, danger: true, action: () => del(r.id) })}><i className="bi bi-trash" /></button>
                  </div>
                ),
              },
            ]}
          />
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between gap-3 p-3 sm:p-4 border-t" style={{ borderColor: "var(--g25)" }}>
            <button type="button" className="zx-btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><i className="bi bi-chevron-left" /> Prev</button>
            <span className="zx-muted text-sm font-semibold">Page {page + 1} / {pages} {isFetching && "…"}</span>
            <button type="button" className="zx-btn-ghost" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next <i className="bi bi-chevron-right" /></button>
          </div>
        )}
      </Card>
    </PageGrid>
  );
}
