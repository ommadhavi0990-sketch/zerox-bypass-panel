import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, Loader, PageGrid } from "@/components/zx/ui";
import { useMe } from "@/lib/me-context";
import { fmtDate } from "@/lib/zx";
import { getToken } from "@/lib/queries";
import { fpRegister, fpRenew, fpUnregister } from "@/lib/queries";
import {
  clearFpDevice,
  fpDaysLeft,
  fpDeviceActive,
  fpErrorMessage,
  fpSupported,
  getFpDevice,
  markUnlocked,
  renewLocalPasskey,
  setFpDevice,
  setupLocalPasskey,
  type FpDevice,
} from "@/lib/fingerprint-device";

export const Route = createFileRoute("/_authenticated/fingerprint")({
  head: () => ({
    meta: [
      { title: "Enable Fingerprint · ZEROX BYPASS Panel" },
      { name: "description", content: "Unlock the panel with your phone fingerprint." },
    ],
  }),
  component: FingerprintPage,
});

function FingerprintPage() {
  const { profile } = useMe();
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
  const active = thisDevice ? fpDeviceActive(thisDevice) : false;
  const daysLeft = thisDevice ? fpDaysLeft(thisDevice) : 0;

  function refresh() {
    setDev(getFpDevice());
  }

  async function enable() {
    const token = getToken();
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      // The phone's biometric prompt creates the credential; the panel then
      // registers its id + a 30-day validity on the server (user record).
      const d = await setupLocalPasskey(profile.username);
      const r = await fpRegister({ token, credentialId: d.id });
      if (!r.ok) {
        clearFpDevice();
        setError(r.error);
        return;
      }
      setFpDevice({ ...d, until: r.until });
      markUnlocked();
      toast.success("Fingerprint enabled on this phone");
      refresh();
    } catch (e) {
      setError(fpErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function renew() {
    const token = getToken();
    if (!thisDevice || !token) return;
    setError(null);
    setBusy(true);
    try {
      const d = await renewLocalPasskey(thisDevice);
      const r = await fpRenew({ token, credentialId: d.id });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setFpDevice({ ...d, until: r.until });
      toast.success(`Fingerprint renewed · valid ${fpDaysLeft({ ...d, until: r.until })} more days`);
      refresh();
    } catch (e) {
      setError(fpErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const token = getToken();
    if (!thisDevice || !token) return;
    setBusy(true);
    try {
      const r = await fpUnregister({ token });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      clearFpDevice();
      setDev(null);
      toast.success("Fingerprint removed from this phone");
    } finally {
      setBusy(false);
    }
  }

  const badge = !thisDevice
    ? { cls: "mute", text: "OFF" }
    : active
      ? { cls: "ok", text: "ACTIVE" }
      : { cls: "bad", text: "EXPIRED" };
  const validText = !thisDevice
    ? "—"
    : active
      ? `${fmtDate(thisDevice.until)} · ${daysLeft} day(s) left`
      : "Expired";

  return (
    <PageGrid>
      <div className="mx-auto max-w-2xl space-y-4">
        <Card>
          <CardHeader
            icon="bi-fingerprint"
            title="Enable Fingerprint"
            sub="Unlock this panel with your phone's fingerprint"
            right={<span className={`zx-badge ${badge.cls}`}>{badge.text}</span>}
          />
          <div className="zx-card-body space-y-4">
            {supported === null ? (
              <Loader />
            ) : (
              <>
                <div
                  className="flex justify-between gap-3 py-2 border-b"
                  style={{ borderColor: "var(--g18)" }}
                >
                  <span className="zx-muted font-semibold">Fingerprint valid till</span>
                  <b className="text-right">{validText}</b>
                </div>
                <div
                  className="flex justify-between gap-3 py-2 border-b"
                  style={{ borderColor: "var(--g18)" }}
                >
                  <span className="zx-muted font-semibold">This phone</span>
                  <b className="text-right">
                    {thisDevice ? (active ? "Enabled" : "Expired") : "Not enabled"}
                  </b>
                </div>

                {thisDevice && !active && (
                  <div className="zx-alert bad">
                    <i className="bi bi-hourglass-bottom" />
                    <span>
                      Your fingerprint has expired. Log in with your password and renew it below.
                    </span>
                  </div>
                )}
                {supported === false && !thisDevice && (
                  <div className="zx-alert warn">
                    <i className="bi bi-exclamation-triangle" />
                    <span>
                      Fingerprint is not available here. Open the real website (https) on a phone
                      that has a fingerprint lock set.
                    </span>
                  </div>
                )}
                {error && (
                  <div className="zx-alert bad">
                    <i className="bi bi-exclamation-octagon" />
                    <span>{error}</span>
                  </div>
                )}

                {thisDevice ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="zx-btn w-full"
                      disabled={busy || supported === false}
                      onClick={() => void renew()}
                    >
                      <i className="bi bi-arrow-repeat" />{" "}
                      {busy ? "Waiting for fingerprint…" : "Renew (Extend 30 Days)"}
                    </button>
                    <button
                      type="button"
                      className="zx-btn-ghost w-full"
                      disabled={busy}
                      onClick={() => void remove()}
                    >
                      <i className="bi bi-trash" /> Remove from this phone
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="zx-btn zx-btn-lg w-full"
                    disabled={busy || supported === false}
                    onClick={() => void enable()}
                  >
                    <i className="bi bi-fingerprint" />{" "}
                    {busy ? "Waiting for fingerprint…" : "ENABLE FINGERPRINT"}
                  </button>
                )}

                <p className="zx-muted text-xs">
                  Your fingerprint never leaves your phone — the biometric prompt is the only
                  verification. Its id is registered on your panel account and stays valid for 30
                  days, renewable any time. Unlock works only on the phone that created it. Set it
                  up on the same website address you log in from.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>
    </PageGrid>
  );
}
