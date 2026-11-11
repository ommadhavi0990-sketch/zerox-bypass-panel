import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import logo from "@/assets/zerox-logo.webp";
import { settingsQuery, clearToken, clearLegacyLocalData } from "@/lib/queries";
import { clearUnlocked } from "@/lib/fingerprint-device";
import { inr, ROLE_LABEL, type AppRole, type Profile } from "@/lib/zx";

export function Navbar() {
  return (
    <header className="zx-navbar">
      <Link to="/" className="zx-brand">
        <img src={logo} alt="" className="zx-navlogo" width={38} height={38} decoding="async" />
        <Wordmark />
      </Link>
    </header>
  );
}

/** Stylish two-line brand lockup: glowing gradient "ZEROX" over a gradient-bordered tag. */
export function Wordmark({ sub = "BYPASS", className = "" }: { sub?: string; className?: string }) {
  return (
    <span className={`zx-wm ${className}`} aria-label={`ZEROX ${sub}`}>
      <span className="zx-wm-main" data-text="ZEROX" aria-hidden="true">
        ZEROX
      </span>
      <span className="zx-wm-sub" aria-hidden="true">
        <i />
        {sub}
        <i />
      </span>
    </span>
  );
}

export function Footer() {
  const { data: tg } = useQuery(settingsQuery);
  return (
    <footer className="zx-footer">
      &copy; {new Date().getFullYear()} - <span className="zx-logo">ZEROX BYPASS</span>. All rights
      reserved. ·{" "}
      <a href={tg?.telegram.url} target="_blank" rel="noopener noreferrer">
        DM {tg?.telegram.handle}
      </a>
    </footer>
  );
}

export function DmButton({ label = "TO BUY REFERRAL" }: { label?: string }) {
  const { data: tg } = useQuery(settingsQuery);
  return (
    <a className="zx-dm" href={tg?.telegram.url} target="_blank" rel="noopener noreferrer">
      <i className="bi bi-telegram" /> DM {tg?.telegram.handle} {label}
    </a>
  );
}

type NavItem = { to: string; label: string; icon: string; roles?: AppRole[] };
const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: "bi-speedometer2" },
  { to: "/keys", label: "Keys", icon: "bi-key" },
  { to: "/keys/generate", label: "Generate", icon: "bi-plus-circle" },
  { to: "/referral", label: "Create Referral", icon: "bi-person-plus", roles: ["owner", "admin"] },
  { to: "/admin/users", label: "Manage Users", icon: "bi-people", roles: ["owner", "admin"] },
  { to: "/admin/pricing", label: "Credits & Pricing", icon: "bi-coin", roles: ["owner"] },
  { to: "/admin/connect", label: "Connect Link", icon: "bi-link-45deg", roles: ["owner"] },
  { to: "/admin/notices", label: "Send Notices", icon: "bi-megaphone", roles: ["owner"] },
  { to: "/history", label: "Transactions", icon: "bi-receipt" },
  { to: "/fingerprint", label: "Enable Fingerprint", icon: "bi-fingerprint" },
  { to: "/settings", label: "Settings", icon: "bi-gear-wide-connected" },
];

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await qc.cancelQueries();
    qc.clear();
    clearUnlocked();
    clearToken();
    clearLegacyLocalData();
    navigate({ to: "/", replace: true });
  };
}

export function Drawer({ role, profile }: { role: AppRole | null; profile: Profile }) {
  const [open, setOpen] = useState(false);
  const signOut = useSignOut();
  const { data: tg } = useQuery(settingsQuery);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = NAV.filter((n) => !n.roles || (role && n.roles.includes(role)));
  return (
    <>
      <div className={`zx-scrim ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <nav className={`zx-drawer ${open ? "open" : ""}`} aria-label="Main menu" aria-hidden={!open}>
        <div className="zx-drawer-head">
          <img src={logo} alt="" width={40} height={40} />
          <Wordmark sub="BYPASS PANEL" />
        </div>
        <div className="zx-drawer-user">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold truncate">
              <i className="bi bi-person-circle zx-accent mr-2" />
              {profile.username}
            </span>
            <span className="zx-badge solid">{role ? ROLE_LABEL[role] : "—"}</span>
          </div>
          <div className="mt-1 text-sm zx-muted">
            Balance: <b className="zx-accent">{role === "owner" ? "∞" : inr(profile.balance)}</b>
          </div>
        </div>
        {items.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            activeOptions={{ exact: true }}
            activeProps={{ className: "active" }}
            onClick={() => setOpen(false)}
            tabIndex={open ? 0 : -1}
          >
            <span className="zx-dico">
              <i className={`bi ${n.icon}`} />
            </span>
            {n.label}
            <i className="bi bi-chevron-right zx-chev" />
          </Link>
        ))}
        <div className="zx-sep" />
        <a
          href={tg?.telegram.url}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={open ? 0 : -1}
        >
          <span className="zx-dico">
            <i className="bi bi-telegram" />
          </span>
          DM {tg?.telegram.handle}
          <i className="bi bi-box-arrow-up-right zx-chev" />
        </a>
        <button
          type="button"
          className="zx-drawer-link"
          onClick={() => {
            setOpen(false);
            void signOut();
          }}
          tabIndex={open ? 0 : -1}
        >
          <span className="zx-dico bad">
            <i className="bi bi-box-arrow-right" />
          </span>
          Logout
          <i className="bi bi-chevron-right zx-chev" />
        </button>
      </nav>
      <button
        type="button"
        className={`zx-burger ${open ? "open" : ""}`}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <i />
        <i />
        <i />
      </button>
    </>
  );
}

/** Premium auth-card header: HUD corners, spinning emblem ring around the logo, gradient title, divider. */
export function AuthHead({
  title,
  sub,
  withLogo = true,
}: {
  title: string;
  sub: string;
  withLogo?: boolean;
}) {
  return (
    <>
      <span className="zx-auth-hud" aria-hidden="true" />
      {withLogo && (
        <div className="zx-auth-emblem">
          <img src={logo} alt="ZEROX BYPASS logo" className="zx-auth-logo" width={96} height={96} />
        </div>
      )}
      <h1 className="zx-auth-title">{title}</h1>
      <p className="zx-auth-sub">{sub}</p>
      <div className="zx-auth-divider" aria-hidden="true">
        <i />
      </div>
    </>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
