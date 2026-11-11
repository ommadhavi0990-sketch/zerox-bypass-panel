import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, Field, Loader, PageGrid } from "@/components/zx/ui";
import { useMe } from "@/lib/me-context";
import { fmtDate } from "@/lib/zx";
import { fpCheckCode, fpDisable, fpMyStatus, fpRegisterOptions, fpRegisterVerify, fpRenew } from "@/lib/fingerprint.functions";
import { clearFpDevice, createPasskey, fpErrorMessage, fpSupported, getFpDevice, markUnlocked, setFpDevice, type FpDevice } from "@/lib/fingerprint-device";

export const Route = createFileRoute("/_authenticated/fingerprint")({
  head: () => ({ meta: [{ title: "Enable Fingerprint · ZEROX BYPASS Panel" }, { name: "description", content: "Unlock the panel with your phone fingerprint." }] }),
  component: FingerprintPage,
});

const statusQuery = { queryKey: ["fp_status"], queryFn: () => fpMyStatus() };

type Checked = { duration: string; codeExpiresAt: string; usesLeft: number };

function FingerprintPage() {
  const { profile } = useMe();
  const qc = useQueryClient();
  const { data: st, isLoading } = useQuery(statusQuery);
  const [code, setCode] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [dev, setDev] = useState<FpDevice | null>(null);

  useEffect(() => {
    setDev(getFpDevice());
    void fpSupported().then(setSupported);
  }, []);

  // The remembered device only counts if it belongs to the account that is signed in now.
  const thisDevice = dev && dev.u === profile.username ? dev : null;
  const cleanCode = code.trim().toUpperCase();

  async function checkCode(): Promise<boolean> {
    setError(null);
    if (cleanCode.length < 4) { setError("Enter your referral code"); return false; }
    setChecking(true);
    try {
      const r = await fpCheckCode({ data: { code: cleanCode } });
      if (!r.ok) { setChecked(null); setError(r.error); return false; }
      setChecked({ duration: r.duration, codeExpiresAt: r.codeExpiresAt, usesLeft: r.usesLeft });
      return true;
    } catch (e) {
      setError(fpErrorMessage(e));
      return false;
    } finally {
      setChecking(false);
    }
  }

  async function refresh(expiresAt: string | null, lifetime: boolean) {
    const d = getFpDevice();
    if (d && d.u === profile.username) setFpDevice({ ...d, until: lifetime ? null : expiresAt });
    setDev(getFpDevice());
    setCode("");
    setChecked(null);
    await qc.invalidateQueries({ queryKey: statusQuery.queryKey });
  }

  async function enable() {
    setError(null);
    if (!st?.active && !cleanCode) { setError("Enter a referral code first"); return; }
    setBusy(true);
    try {
      // Check the code BEFORE asking for the fingerprint, so a bad code never wastes a scan.
      if (cleanCode && !(await checkCode())) return;
      const o = await fpRegisterOptions();
      if (!o.ok) { setError(o.error); return; }
      const cred = await createPasskey(o);
      const res = await fpRegisterVerify({ data: { ...(cleanCode ? { code: cleanCode } : {}), credential: cred } });
      if (!res.ok) { setError(res.error); return; }
      setFpDevice({ id: cred.id, u: profile.username, until: res.lifetime ? null : res.expiresAt });
      markUnlocked();
      toast.success("Fingerprint enabled on this phone");
      await refresh(res.expiresAt, res.lifetime);
    } catch (e) {
      setError(fpErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function renew() {
    setError(null);
    if (!(await checkCode())) return;
    setBusy(true);
    try {
      const res = await fpRenew({ data: { code: cleanCode } });
      if (!res.ok) { setError(res.error); return; }
      toast.success("Fingerprint renewed");
      await refresh(res.expiresAt, res.lifetime);
    } catch (e) {
      setError(fpErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!thisDevice) return;
    setBusy(true);
    try {
      await fpDisable({ data: { credentialId: thisDevice.id } });
      clearFpDevice();
      setDev(null);
      toast.success("Fingerprint removed from this phone");
      await qc.invalidateQueries({ queryKey: statusQuery.queryKey });
    } catch (e) {
      setError(fpErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const badge = !st?.has ? { cls: "mute", text: "OFF" } : st.active ? { cls: "ok", text: "ACTIVE" } : { cls: "bad", text: "EXPIRED" };
  const validText = !st?.has ? "—" : st.lifetime ? "Lifetime" : fmtDate(st.expiresAt);

  return (
    <PageGrid>
      <div className="mx-auto max-w-2xl space-y-4">
        <Card>
          <CardHeader icon="bi-fingerprint" title="Enable Fingerprint" sub="Unlock this panel with your phone's fingerprint" right={<span className={`zx-badge ${badge.cls}`}>{badge.text}</span>} />
          <div className="zx-card-body space-y-4">
            {isLoading ? <Loader /> : (
              <>
                <div className="flex justify-between gap-3 py-2 border-b" style={{ borderColor: "var(--g18)" }}>
                  <span className="zx-muted font-semibold">Fingerprint valid till</span><b className="text-right">{validText}</b>
                </div>
                <div className="flex justify-between gap-3 py-2 border-b" style={{ borderColor: "var(--g18)" }}>
                  <span className="zx-muted font-semibold">This phone</span>
                  <b className="text-right">{thisDevice ? "Enabled" : "Not enabled"}</b>
                </div>

                {st?.has && !st.active && (
                  <div className="zx-alert bad"><i className="bi bi-hourglass-bottom" /><span>Your fingerprint has expired. Enter a new referral code to renew it.</span></div>
                )}
                {supported === false && !thisDevice && (
                  <div className="zx-alert warn"><i className="bi bi-exclamation-triangle" /><span>Fingerprint is not available here. Open the real website (https) on a phone that has a fingerprint lock set.</span></div>
                )}
                {error && <div className="zx-alert bad"><i className="bi bi-exclamation-octagon" /><span>{error}</span></div>}

                <Field label={st?.active ? "Referral code (optional, adds more time)" : "Enter referral code"}>
                  <div className="flex items-center gap-2">
                    <input className="zx-input zx-code" placeholder="Referral code" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={code}
                      onChange={(e) => { setCode(e.target.value); setChecked(null); setError(null); }} maxLength={32} />
                    <button type="button" className="zx-btn zx-btn-sm" disabled={checking || busy || cleanCode.length < 4} onClick={() => void checkCode()}>
                      {checking ? "…" : "Check"}
                    </button>
                  </div>
                </Field>

                {checked && (
                  <div className="zx-alert ok">
                    <i className="bi bi-check-circle-fill" />
                    <div className="text-sm">
                      <div className="font-bold">Referral valid · Fingerprint for {checked.duration}</div>
                      <div className="zx-muted">Code valid till {fmtDate(checked.codeExpiresAt)} · {checked.usesLeft} use(s) left</div>
                    </div>
                  </div>
                )}

                {thisDevice ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button type="button" className="zx-btn w-full" disabled={busy || checking || cleanCode.length < 4} onClick={() => void renew()}>
                      <i className="bi bi-arrow-repeat" /> Renew Fingerprint
                    </button>
                    <button type="button" className="zx-btn-ghost w-full" disabled={busy} onClick={() => void remove()}>
                      <i className="bi bi-trash" /> Remove from this phone
                    </button>
                  </div>
                ) : (
                  <button type="button" className="zx-btn zx-btn-lg w-full" disabled={busy || checking || supported === false} onClick={() => void enable()}>
                    <i className="bi bi-fingerprint" /> {busy ? "Waiting for fingerprint…" : "ENABLE FINGERPRINT"}
                  </button>
                )}

                <p className="zx-muted text-xs">
                  Your fingerprint never leaves your phone. When the referral time ends, fingerprint stops working and the login page asks you to renew your referral. Set it up on the same website address you log in from.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>
    </PageGrid>
  );
}
