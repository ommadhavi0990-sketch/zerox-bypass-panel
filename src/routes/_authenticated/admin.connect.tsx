import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, Field, Loader, PageGrid, copyText } from "@/components/zx/ui";
import { meQuery, settingsQuery, getToken } from "@/lib/queries";
import { maintenanceSet } from "@/lib/data.functions";
import { errMsg } from "@/lib/zx";

export const Route = createFileRoute("/_authenticated/admin/connect")({
  head: () => ({
    meta: [
      { title: "Connect Link · ZEROX BYPASS Panel" },
      { name: "description", content: "Generate the APK connect link for login.h." },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role !== "owner") throw redirect({ to: "/dashboard" });
  },
  component: ConnectPage,
});

const CONNECT_PATH = "/api/public/connect";

function LinkBox({ label, url, note }: { label: string; url: string; note?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-bold uppercase tracking-wider zx-muted">{label}</div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          className="zx-input zx-code"
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={label}
        />
        <button
          type="button"
          className="zx-btn zx-btn-sm"
          onClick={() => copyText(url, "Connect link copied")}
        >
          <i className="bi bi-clipboard" /> Copy
        </button>
      </div>
      {note && <div className="zx-muted text-xs">{note}</div>}
    </div>
  );
}

const REASONS = [
  "App under maintenance. Features are being updated. Try again later.",
  "UI is being changed. App will be back soon.",
  "New update coming. Please wait and try again later.",
  "Server fix in progress. Please try after some time.",
];

function MaintenanceCard() {
  const qc = useQueryClient();
  const { data: settings } = useQuery(settingsQuery);
  const [on, setOn] = useState(!!settings?.maintenance.on);
  const [msg, setMsg] = useState(settings?.maintenance.message ?? "");
  const [busy, setBusy] = useState(false);

  async function apply(enable: boolean) {
    const token = getToken();
    if (!token) {
      toast.error("Session expired — log in again");
      return;
    }
    const text = msg.trim();
    if (enable && text.length < 3) {
      toast.error("Write a reason first");
      return;
    }
    setBusy(true);
    try {
      const r = await maintenanceSet({ data: { token, on: enable, message: text } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setOn(enable);
      toast.success(
        enable ? "App is now in maintenance — logins blocked" : "App is live again — logins open",
      );
      void qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Maintenance toggle failed");
    } finally {
      setBusy(false);
    }
  }

  const changed = msg.trim().length > 0;

  return (
    <Card>
      <CardHeader
        icon="bi-cone-striped"
        title="App Maintenance"
        sub="Turn the app off for everyone using this connect link."
        right={
          <span className={`zx-badge ${on ? "bad" : "ok"}`}>
            <i className={`bi ${on ? "bi-pause-circle-fill" : "bi-check-circle-fill"}`} />{" "}
            {on ? "MAINTENANCE" : "LIVE"}
          </span>
        }
      />
      <div className="zx-card-body space-y-4">
        <div className={`zx-alert ${on ? "bad" : "ok"} items-center`}>
          <i className={`bi ${on ? "bi-lock-fill" : "bi-unlock-fill"}`} />
          <div className="flex-1 font-semibold">
            {on
              ? "App is OFF. Nobody can log in right now."
              : "App is ON. Users can log in normally."}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Maintenance mode"
            className="zx-switch"
            disabled={busy}
            onClick={() => apply(!on)}
          />
        </div>

        <Field label="Reason shown in the app" modern>
          <textarea
            className="zx-input"
            rows={2}
            value={msg}
            maxLength={200}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Why is the app closed?"
          />
        </Field>
        <div className="zx-chips">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              className="zx-chip"
              aria-pressed={msg.trim() === r}
              onClick={() => setMsg(r)}
            >
              {r.split(".")[0]}
            </button>
          ))}
        </div>

        <div className="zx-apk-preview">
          <div className="text-xs font-bold uppercase tracking-wider zx-muted mb-1">
            What users see when they log in
          </div>
          <div className="font-bold" style={{ color: "var(--danger)" }}>
            {msg.trim() || "—"}
          </div>
        </div>

        {on ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              className="zx-btn-ghost w-full"
              disabled={busy || !changed}
              onClick={() => apply(true)}
            >
              <i className="bi bi-pencil" /> Update reason
            </button>
            <button
              type="button"
              className="zx-btn w-full"
              disabled={busy}
              onClick={() => apply(false)}
            >
              <i className="bi bi-play-circle" /> Turn app ON
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="zx-btn w-full"
            disabled={busy}
            onClick={() => apply(true)}
          >
            <i className="bi bi-pause-circle" /> Put app in maintenance
          </button>
        )}
      </div>
    </Card>
  );
}

function ConnectPage() {
  const [origin, setOrigin] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [test, setTest] = useState({ game: "FIREWORK", key: "", serial: "TESTDEVICE01" });
  const [testing, setTesting] = useState(false);
  const [resp, setResp] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    setPreview(isPreviewHost(window.location.hostname));
  }, []);

  function isPreviewHost(h: string) {
    return h === "localhost" || h === "127.0.0.1";
  }

  function generate() {
    setOrigin(window.location.origin);
    setPreview(isPreviewHost(window.location.hostname));
    toast.success("Connect link generated");
  }

  async function runTest(e: React.FormEvent) {
    e.preventDefault();
    if (!test.key.trim()) {
      toast.error("Enter a key to test");
      return;
    }
    setTesting(true);
    setResp(null);
    try {
      const body = new URLSearchParams({
        game: test.game.trim(),
        user_key: test.key.trim(),
        serial: test.serial.trim(),
      });
      const r = await fetch(CONNECT_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      setResp(JSON.stringify(await r.json(), null, 2));
    } catch (err) {
      setResp(String(err));
    } finally {
      setTesting(false);
    }
  }

  const link = origin ? origin + CONNECT_PATH : "";

  return (
    <PageGrid>
      <div className="mx-auto max-w-2xl space-y-4">
        <MaintenanceCard />

        <Card>
          <CardHeader
            icon="bi-link-45deg"
            title="Generate Connect Link"
            sub="Paste this link in your APK's login.h"
          />
          <div className="zx-card-body space-y-4">
            <button type="button" className="zx-btn zx-btn-lg w-full" onClick={generate}>
              <i className="bi bi-stars" /> GENERATE CONNECT LINK
            </button>
            {origin && (
              <div className="space-y-4">
                <LinkBox label="Website" url={origin} />
                <LinkBox label="Connect link (this website)" url={link} />
                <LinkBox label="PHP-panel compatible link (/connect)" url={`${origin}/connect`} />
                {preview && (
                  <div className="zx-alert warn">
                    <i className="bi bi-exclamation-triangle" />
                    <span>
                      You are on the editor preview. Publish, open the panel on your real website,
                      and generate again to get that website's link.
                    </span>
                  </div>
                )}
                <div className="zx-alert">
                  <i className="bi bi-info-circle" />
                  <span>
                    The connect API validates keys against the live database — generate a key first,
                    then test here.
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon="bi-bug"
            title="Test Connect"
            sub="Check a key exactly like the APK does."
          />
          <form onSubmit={runTest} className="zx-card-body space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Game" modern>
                <input
                  className="zx-input"
                  value={test.game}
                  onChange={(e) => setTest({ ...test, game: e.target.value })}
                />
              </Field>
              <Field label="Key" modern>
                <input
                  className="zx-input zx-code"
                  value={test.key}
                  onChange={(e) => setTest({ ...test, key: e.target.value })}
                  placeholder="Paste a key"
                />
              </Field>
              <Field label="Device serial" modern>
                <input
                  className="zx-input"
                  value={test.serial}
                  onChange={(e) => setTest({ ...test, serial: e.target.value })}
                />
              </Field>
            </div>
            <div className="zx-muted text-xs">
              The connect endpoint returns status:false without a database.
            </div>
            <button type="submit" className="zx-btn w-full" disabled={testing}>
              {testing ? "Testing…" : "Test Now"}
            </button>
            {resp && (
              <textarea
                readOnly
                className="zx-input zx-code"
                rows={Math.min(16, resp.split("\n").length)}
                value={resp}
                aria-label="Server response"
              />
            )}
          </form>
        </Card>
      </div>
    </PageGrid>
  );
}
