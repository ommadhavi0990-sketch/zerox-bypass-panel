import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Drawer, Footer, Navbar, DmButton, useSignOut } from "@/components/zx/Shell";
import { Card, Loader } from "@/components/zx/ui";
import { hasSession, meQuery, noticesQuery } from "@/lib/queries";
import { MeContext } from "@/lib/me-context";
import { fpLocked } from "@/lib/fingerprint-device";
import { EXPIRED_MESSAGE, timeAgo, type Profile } from "@/lib/zx";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: ({ location }) => {
    // Client-side gate: no session token (or fingerprint re-lock) → back to login.
    if (!hasSession() || fpLocked()) throw redirect({ to: "/", search: { redirect: location.href } });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery),
  pendingComponent: () => (
    <ShellFrame>
      <Loader label="Loading panel" />
    </ShellFrame>
  ),
  component: PanelLayout,
});

function ShellFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function useExpiryTick(expiresAt: string | null | undefined) {
  const [tick, force] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return;
    const t = window.setTimeout(() => force((n) => n + 1), Math.min(ms + 200, 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [expiresAt, tick]);
}

function PanelLayout() {
  const navigate = useNavigate();
  const { data: me, isLoading } = useQuery(meQuery);
  const signOut = useSignOut();
  useExpiryTick(me?.profile?.expires_at);

  // meQuery clears a bad/expired token itself — send the user to the login page.
  useEffect(() => {
    if (!isLoading && !me) navigate({ to: "/", replace: true });
  }, [isLoading, me, navigate]);

  const ctx = useMemo(() => {
    if (!me?.profile) return null;
    return {
      userId: me.userId,
      profile: me.profile,
      role: me.role,
      isOwner: me.role === "owner",
      isAdmin: me.role === "admin",
    };
  }, [me]);

  if (!me || !ctx) {
    return (
      <ShellFrame>
        <GateCard
          icon="bi-person-x"
          title="Account not set up"
          text="No active session. Please log in."
          onLogout={signOut}
        />
      </ShellFrame>
    );
  }

  const p = ctx.profile;
  let gate: React.ReactNode = null;
  if (p.status === "banned")
    gate = (
      <GateCard
        icon="bi-slash-circle"
        title="Account Banned"
        text="Your account is banned. Please contact the Owner."
        onLogout={signOut}
      />
    );
  else if (p.status === "blocked")
    gate = (
      <GateCard
        icon="bi-lock"
        title="Account Blocked"
        text="Your account is blocked. Please contact the Owner."
        onLogout={signOut}
      />
    );
  else if (!ctx.isOwner && p.expires_at && new Date(p.expires_at).getTime() <= Date.now())
    gate = (
      <GateCard
        icon="bi-hourglass-bottom"
        title="Referral Expired"
        text={EXPIRED_MESSAGE}
        onLogout={signOut}
      />
    );

  return (
    <MeContext.Provider value={ctx}>
      <div className="flex min-h-dvh flex-col">
        {!gate && <Drawer role={ctx.role} profile={p} />}
        <Navbar />
        <main className="flex-1">
          {gate ?? (
            <>
              <NoticeBar />
              <Outlet />
            </>
          )}
        </main>
        <Footer />
      </div>
    </MeContext.Provider>
  );
}

function GateCard({
  icon,
  title,
  text,
  onLogout,
}: {
  icon: string;
  title: string;
  text: string;
  onLogout: () => void;
}) {
  return (
    <div className="zx-auth-wrap">
      <div className="w-full max-w-[440px]">
        <Card className="zx-auth-card text-center">
          <div className="pt-8">
            <span
              className="zx-stat-icon bad mx-auto"
              style={{ width: 70, height: 70, fontSize: "2rem" }}
            >
              <i className={`bi ${icon}`} />
            </span>
          </div>
          <div className="zx-auth-title" style={{ paddingTop: 14 }}>
            {title}
          </div>
          <div className="zx-auth-body">
            <p className="font-semibold text-lg">{text}</p>
            <button type="button" className="zx-btn-ghost mt-5" onClick={onLogout}>
              <i className="bi bi-box-arrow-right" /> Logout
            </button>
          </div>
        </Card>
        <DmButton label="NOW" />
      </div>
    </div>
  );
}

function NoticeBar() {
  const { data } = useQuery(noticesQuery);
  const [hidden, setHidden] = useState<number[]>([]);
  useEffect(() => {
    try {
      setHidden(JSON.parse(localStorage.getItem("zx_hidden_notices") || "[]").map(Number));
    } catch {
      /* ignore */
    }
  }, []);
  const visible = (data ?? []).filter((n) => !hidden.includes(n.id)).slice(0, 3);
  if (!visible.length) return null;
  function dismiss(id: number) {
    const next = [...hidden, id].slice(-100);
    setHidden(next);
    try {
      localStorage.setItem("zx_hidden_notices", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="mx-auto w-full max-w-6xl px-3 sm:px-4 pt-5 space-y-2">
      {visible.map((n) => (
        <div key={n.id} className="zx-alert" role="status">
          <i className="bi bi-megaphone-fill" />
          <div className="flex-1 min-w-0">
            <div className="font-bold">
              {n.title}{" "}
              <span className="zx-muted text-xs font-semibold ml-1">{timeAgo(n.created_at)}</span>
            </div>
            <div className="text-sm whitespace-pre-wrap break-words">{n.body}</div>
          </div>
          <button
            type="button"
            className="zx-icon-btn"
            style={{ width: 30, height: 30 }}
            aria-label="Dismiss notice"
            onClick={() => dismiss(n.id)}
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>
      ))}
    </div>
  );
}
