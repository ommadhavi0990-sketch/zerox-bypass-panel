import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, Loader, PageGrid } from "@/components/zx/ui";
import { useMe } from "@/lib/me-context";
import { fmtDate } from "@/lib/zx";
import {
  clearFpDevice,
  fpDaysLeft,
  fpDeviceActive,
  fpErrorMessage,
  fpSupported,
  getFpDevice,
  markUnlocked,
  renewLocalPasskey,
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

  async function refresh() {
    setDev(getFpDevice());
  }

  async function enable() {
    setError(null);
    setBusy(true);
    try {
      await setupLocalPasskey(profile.username);
      markUnlocked();
      toast.success("Fingerprint enabled on this phone");
      await refresh();
    } catch (e) {
      setError(fpErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function renew() {
    if (!thisDevice) return;
    setError(null);
    setBusy(true);
    try {
      const d = await renewLocalPasskey(thisDevice);
      toast.success(`Fingerprint renewed · valid ${fpDaysLeft(d)} more days`);
      await refresh();
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
                  Your fingerprint never leaves your phone — the panel runs without a database, so
                  this phone's biometric prompt is the only verification. It stays valid for 30 days
                  and can be renewed any time. Set it up on the same website address you log in
                  from.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>
    </PageGrid>
  );
}
