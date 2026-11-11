import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, Field, Loader, PageGrid, useConfirm } from "@/components/zx/ui";
import { meQuery, pricesQuery, settingsQuery } from "@/lib/queries";
import { durationLabel, errMsg } from "@/lib/zx";

export const Route = createFileRoute("/_authenticated/admin/pricing")({
  head: () => ({ meta: [{ title: "Credits & Pricing · ZEROX BYPASS Panel" }, { name: "description", content: "Set key prices per duration and the Owner's Telegram link." }] }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role !== "owner") throw redirect({ to: "/dashboard" });
  },
  component: PricingPage,
});

function PricingPage() {
  const qc = useQueryClient();
  const { data: prices, isLoading } = useQuery(pricesQuery);
  const { data: tg } = useQuery(settingsQuery);
  const { confirm, dialog } = useConfirm();
  const [edit, setEdit] = useState<Record<number, number>>({});
  const [newH, setNewH] = useState({ amount: "", unit: "24", price: "" });
  const [tgUrl, setTgUrl] = useState("");
  const [tgHandle, setTgHandle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (prices) setEdit(Object.fromEntries(prices.map((p) => [p.hours, Number(p.price)]))); }, [prices]);
  useEffect(() => { if (tg) { setTgUrl(tg.url); setTgHandle(tg.handle); } }, [tg]);

  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    toast.error("Pricing is disabled without a database.");
    setBusy(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    toast.error("Adding durations is disabled without a database.");
  }

  async function del(hours: number) { toast.error("Removing durations is disabled without a database."); }

  async function saveTg(e: React.FormEvent) {
    e.preventDefault();
    toast.error("Telegram link update is disabled without a database.");
  }

  return (
    <PageGrid>
      {dialog}
      <div className="mx-auto max-w-2xl space-y-4">
        <Card>
          <CardHeader icon="bi-coin" title="Credits & Pricing" sub="Credit (₹) charged per key for each duration. Applies instantly." />
          <div className="zx-card-body">
            <div className="zx-alert warn">
              <i className="bi bi-info-circle" />
              <span>Pricing and Telegram settings require a Supabase database.</span>
            </div>
            {isLoading ? <Loader /> : (
              <>
                <form onSubmit={saveAll} className="space-y-2" disabled>
                  {(prices ?? []).map((p) => (
                    <div key={p.hours} className="flex items-center gap-2">
                      <div className="flex-1 font-bold">{durationLabel(p.hours)}</div>
                      <div className="zx-input-group" style={{ width: 150 }}>
                        <span className="zx-addon">₹</span>
                        <input type="number" min={0} inputMode="numeric" className="zx-input" value={edit[p.hours] ?? 0} onChange={(e) => setEdit((s) => ({ ...s, [p.hours]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} aria-label={`${durationLabel(p.hours)} price`} disabled />
                      </div>
                      <button type="button" className="zx-icon-btn danger" disabled aria-label={`Remove ${durationLabel(p.hours)}`} onClick={() => del(p.hours)}><i className="bi bi-trash" /></button>
                    </div>
                  ))}
                  <button type="submit" className="zx-btn w-full mt-3" disabled>{busy ? "Saving…" : "Save Prices"}</button>
                </form>
                <hr className="zx-hr" />
                <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2" disabled>
                  <input type="number" min={1} className="zx-input" placeholder="Amount" value={newH.amount} onChange={(e) => setNewH({ ...newH, amount: e.target.value })} aria-label="Duration amount" disabled />
                  <select className="zx-input" value={newH.unit} onChange={(e) => setNewH({ ...newH, unit: e.target.value })} aria-label="Duration unit" disabled><option value="1">Hours</option><option value="24">Days</option></select>
                  <input type="number" min={0} className="zx-input" placeholder="₹ price" value={newH.price} onChange={(e) => setNewH({ ...newH, price: e.target.value })} aria-label="Price" disabled />
                  <button type="submit" className="zx-btn">Add</button>
                </form>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon="bi-telegram" title="Owner Telegram DM" sub="Shown on login, register, expired screens and footer." />
          <form onSubmit={saveTg} className="zx-card-body space-y-4" disabled>
            <Field label="Telegram link" modern><input className="zx-input" value={tgUrl} onChange={(e) => setTgUrl(e.target.value)} placeholder="https://t.me/ONExZEROXX" disabled /></Field>
            <Field label="Handle shown on buttons" modern><input className="zx-input" value={tgHandle} onChange={(e) => setTgHandle(e.target.value)} placeholder="@ONExZEROXX" disabled /></Field>
            <button type="submit" className="zx-btn w-full" disabled>Save Telegram</button>
          </form>
        </Card>
      </div>
    </PageGrid>
  );
}
