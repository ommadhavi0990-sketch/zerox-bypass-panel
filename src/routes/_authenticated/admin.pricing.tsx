import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, Field, Loader, PageGrid, useConfirm } from "@/components/zx/ui";
import { meQuery, pricesQuery, settingsQuery, getToken } from "@/lib/queries";
import { settingsUpdate } from "@/lib/data.functions";
import { durationLabel, errMsg } from "@/lib/zx";

export const Route = createFileRoute("/_authenticated/admin/pricing")({
  head: () => ({
    meta: [
      { title: "Credits & Pricing · ZEROX BYPASS Panel" },
      {
        name: "description",
        content: "Set key prices per duration and the Owner's Telegram link.",
      },
    ],
  }),
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
  const [newH, setNewH] = useState({ amount: "", unit: "hours", price: "" });
  const [tgUrl, setTgUrl] = useState("");
  const [tgHandle, setTgHandle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (prices) setEdit(Object.fromEntries(prices.map((p) => [p.hours, Number(p.price)])));
  }, [prices]);
  useEffect(() => {
    if (tg) {
      setTgUrl(tg.telegram.url);
      setTgHandle(tg.telegram.handle);
    }
  }, [tg]);

  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return toast.error("Session expired — log in again");
    const next = Object.entries(edit)
      .map(([hours, price]) => ({ hours: Number(hours), price: Number(price) }))
      .sort((a, b) => a.hours - b.hours);
    setBusy(true);
    try {
      const r = await settingsUpdate({ data: { token, prices: next } });
      if (!r.ok) return toast.error(r.error);
      toast.success("Prices saved");
      void qc.invalidateQueries({ queryKey: ["prices"] });
      void qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save prices");
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return toast.error("Session expired — log in again");
    const amount = Number(newH.amount);
    const unit = newH.unit === "hours" ? 1 : 24;
    const hours = amount * unit;
    const price = Number(newH.price || 0);
    if (!hours || price < 0) return toast.error("Enter a valid duration and price");
    setBusy(true);
    try {
      const next = [...(prices ?? []), { hours, price }].sort((a, b) => a.hours - b.hours);
      const r = await settingsUpdate({ data: { token, prices: next } });
      if (!r.ok) return toast.error(r.error);
      toast.success(`Added ${durationLabel(hours)} · ₹${price}`);
      setNewH({ amount: "", unit: "hours", price: "" });
      void qc.invalidateQueries({ queryKey: ["prices"] });
      void qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add duration");
    } finally {
      setBusy(false);
    }
  }

  async function del(hours: number) {
    const token = getToken();
    if (!token) return;
    const next = (prices ?? []).filter((p) => p.hours !== hours);
    const r = await settingsUpdate({ data: { token, prices: next } });
    if (!r.ok) return toast.error(r.error);
    toast.success(`Removed ${durationLabel(hours)}`);
    void qc.invalidateQueries({ queryKey: ["prices"] });
    void qc.invalidateQueries({ queryKey: ["settings"] });
  }

  async function saveTg(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return toast.error("Session expired — log in again");
    try {
      const u = new URL(tgUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:")
        throw new Error("Use a full https://t.me/… link");
    } catch {
      return toast.error("Enter a valid Telegram link");
    }
    setBusy(true);
    try {
      const r = await settingsUpdate({
        data: { token, telegram: { url: tgUrl.trim(), handle: tgHandle.trim() } },
      });
      if (!r.ok) return toast.error(r.error);
      toast.success("Telegram link saved");
      void qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save Telegram link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageGrid>
      {dialog}
      <div className="mx-auto max-w-2xl space-y-4">
        <Card>
          <CardHeader
            icon="bi-coin"
            title="Credits & Pricing"
            sub="Credit (₹) charged per key for each duration. Applies instantly."
          />
          <div className="zx-card-body">
            <div className="zx-alert">
              <i className="bi bi-info-circle" />
              <span>Pricing changes apply to key generation instantly.</span>
            </div>
            {isLoading ? (
              <Loader />
            ) : (
              <>
                <form onSubmit={saveAll} className="space-y-2" noValidate>
                  {(prices ?? []).map((p) => (
                    <div key={p.hours} className="flex items-center gap-2">
                      <div className="flex-1 font-bold">{durationLabel(p.hours)}</div>
                      <div className="zx-input-group" style={{ width: 150 }}>
                        <span className="zx-addon">₹</span>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="zx-input"
                          value={edit[p.hours] ?? 0}
                          onChange={(e) =>
                            setEdit((s) => ({
                              ...s,
                              [p.hours]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                            }))
                          }
                          aria-label={`${durationLabel(p.hours)} price`}
                        />
                      </div>
                      <button
                        type="button"
                        className="zx-icon-btn danger"
                        aria-label={`Remove ${durationLabel(p.hours)}`}
                        onClick={() => del(p.hours)}
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </div>
                  ))}
                  <button type="submit" className="zx-btn w-full mt-3" disabled={busy}>
                    {busy ? "Saving…" : "Save Prices"}
                  </button>
                </form>
                <hr className="zx-hr" />
                <form
                  onSubmit={add}
                  className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2"
                  noValidate
                >
                  <input
                    type="number"
                    min={1}
                    className="zx-input"
                    placeholder="Amount"
                    value={newH.amount}
                    onChange={(e) => setNewH({ ...newH, amount: e.target.value })}
                    aria-label="Duration amount"
                  />
                  <select
                    className="zx-input"
                    value={newH.unit}
                    onChange={(e) => setNewH({ ...newH, unit: e.target.value })}
                    aria-label="Duration unit"
                  >
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    className="zx-input"
                    placeholder="₹ price"
                    value={newH.price}
                    onChange={(e) => setNewH({ ...newH, price: e.target.value })}
                    aria-label="Price"
                  />
                  <button type="submit" className="zx-btn" disabled={busy}>
                    Add
                  </button>
                </form>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon="bi-telegram"
            title="Owner Telegram DM"
            sub="Shown on login, register, expired screens and footer."
          />
          <form onSubmit={saveTg} className="zx-card-body space-y-4" noValidate>
            <Field label="Telegram link" modern>
              <input
                className="zx-input"
                value={tgUrl}
                onChange={(e) => setTgUrl(e.target.value)}
                placeholder="https://t.me/ONExZEROXX"
              />
            </Field>
            <Field label="Handle shown on buttons" modern>
              <input
                className="zx-input"
                value={tgHandle}
                onChange={(e) => setTgHandle(e.target.value)}
                placeholder="@ONExZEROXX"
              />
            </Field>
            <button type="submit" className="zx-btn w-full" disabled={busy}>
              Save Telegram
            </button>
          </form>
        </Card>
      </div>
    </PageGrid>
  );
}
