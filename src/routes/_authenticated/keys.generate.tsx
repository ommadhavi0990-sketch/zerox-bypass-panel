import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, Field, Loader, PageGrid, copyText } from "@/components/zx/ui";
import { useMe } from "@/lib/me-context";
import { pricesQuery } from "@/lib/queries";
import { BULK_OPTIONS, durationLabel, GAMES, inr, keyBatchCost } from "@/lib/zx";

export const Route = createFileRoute("/_authenticated/keys/generate")({
  head: () => ({ meta: [{ title: "Generate Keys · ZEROX BYPASS Panel" }, { name: "description", content: "Key generation is disabled without a database." }] }),
  component: GeneratePage,
});

type Result = { keys: string[]; charged: number; balance: number; game: string; duration: string; devices: number };

function GeneratePage() {
  const { profile, role, isOwner } = useMe();
  const canBulkCustom = role === "owner" || role === "admin";
  const qc = useQueryClient();
  const { data: prices, isLoading } = useQuery(pricesQuery);
  const [game, setGame] = useState<string>(GAMES[0]);
  const [hours, setHours] = useState<number | null>(null);
  const [devices, setDevices] = useState(1);
  const [bulk, setBulk] = useState<number>(1);
  const [custom, setCustom] = useState(false);
  const [customKey, setCustomKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const reqId = useRef<string>(crypto.randomUUID());

  const selected = hours ?? prices?.[0]?.hours ?? null;
  const price = prices?.find((p) => p.hours === selected)?.price ?? 0;
  const qty = canBulkCustom && !custom ? bulk : 1;
  const total = useMemo(() => keyBatchCost(role, price, qty), [role, price, qty]);
  const short = !isOwner && total > profile.balance;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    toast.error("Key generation is disabled without a database. Contact the Owner.");
    setBusy(false);
  }

  function download() {
    if (!result) return;
    const blob = new Blob([result.keys.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ZEROX_keys_${Date.now()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <PageGrid>
      <div className="mx-auto max-w-2xl space-y-4">
        {result && (
          <Card>
            <div className="zx-card-body">
              <h5 className="font-bold text-lg mb-1"><i className="bi bi-patch-check-fill mr-2 zx-accent" />{result.keys.length} Key(s) Generated</h5>
              <div className="zx-muted text-sm mb-3">{result.game} · {result.duration} · {result.devices} device(s) · Charged {inr(result.charged)}</div>
              <textarea readOnly className="zx-input" rows={Math.min(12, Math.max(2, result.keys.length))} value={result.keys.join("\n")} onFocus={(e) => e.currentTarget.select()} />
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button type="button" className="zx-btn" onClick={() => copyText(result.keys.join("\n"), "All keys copied")}><i className="bi bi-clipboard-check" /> Copy All</button>
                <button type="button" className="zx-btn" onClick={download}><i className="bi bi-download" /> Download .txt</button>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <CardHeader icon="bi-lightning-charge-fill" title="Generate Keys" right={<span className="zx-badge solid">Balance: {isOwner ? "∞" : inr(profile.balance)}</span>} />
          <div className="zx-card-body">
            <div className="zx-alert warn">
              <i className="bi bi-info-circle" />
              <span>Key generation requires a Supabase database. Contact the Owner to enable it.</span>
            </div>
            {isLoading ? <Loader /> : (
              <form onSubmit={submit} className="space-y-4" disabled>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Game">
                    <select className="zx-input" value={game} onChange={(e) => setGame(e.target.value)} disabled>
                      {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </Field>
                  <Field label="Max Devices">
                    <input type="number" inputMode="numeric" min={1} max={50} className="zx-input" value={devices} onChange={(e) => setDevices(Math.max(0, Math.min(50, Number(e.target.value) || 0)))} disabled />
                  </Field>
                </div>
                <Field label="Duration Plan">
                  <select className="zx-input" value={selected ?? ""} onChange={(e) => setHours(Number(e.target.value))} disabled>
                    {(prices ?? []).map((p) => <option key={p.hours} value={p.hours}>{durationLabel(p.hours)} — ₹{p.price}</option>)}
                  </select>
                </Field>
                {canBulkCustom && !custom && (
                  <Field label="Bulk Quantity">
                    <div className="zx-pick">
                      {BULK_OPTIONS.map((q) => (
                        <label key={q}><input type="radio" name="bulk" checked={bulk === q} onChange={() => setBulk(q)} disabled /><span>{q} Key{q > 1 ? "s" : ""}</span></label>
                      ))}
                    </div>
                  </Field>
                )}
                {canBulkCustom && <label className="zx-check"><input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} disabled /> Custom key name (single key)</label>}
                {canBulkCustom && custom && <input className="zx-input" placeholder="MYKEY-1234" maxLength={20} autoCapitalize="characters" value={customKey} onChange={(e) => setCustomKey(e.target.value)} aria-label="Custom key name" disabled />}

                <div className="zx-total">
                  <span className="font-semibold">Total Credit</span>
                  <b className="text-2xl">{isOwner ? <span className="zx-text-ok">FREE</span> : inr(total)}</b>
                </div>
                {short && <div className="zx-alert warn"><i className="bi bi-exclamation-triangle" /><span>Insufficient balance. You need {inr(total)} but have {inr(profile.balance)}.</span></div>}
                <button type="submit" className="zx-btn zx-btn-lg w-full" disabled>
                  <i className="bi bi-stars" /> GENERATE NOW (disabled)
                </button>
              </form>
            )}
          </div>
        </Card>
        <p className="text-center zx-muted text-sm">Your balance: {isOwner ? "∞ (Owner: free generation)" : inr(profile.balance)}</p>
      </div>
    </PageGrid>
  );
}
