import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function Card({ children, className = "", style }: { children: ReactNode; className?: string | undefined; style?: React.CSSProperties | undefined }) {
  return <div className={`zx-card ${className}`} style={style}>{children}</div>;
}

export function CardHeader({ icon, title, sub, right }: { icon?: string | undefined; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="zx-card-header">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <span className="zx-icon-box"><i className={`bi ${icon}`} /></span>}
        <div className="min-w-0">
          <h6 className="zx-card-title truncate">{title}</h6>
          {sub && <div className="zx-muted text-sm">{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Field({ label, error, children, modern }: { label: string; error?: string | undefined; children: ReactNode; modern?: boolean | undefined }) {
  return (
    <div>
      <label className={modern ? "zx-label-modern" : "zx-label"}>{label}</label>
      {children}
      {error && <small className="zx-error">{error}</small>}
    </div>
  );
}

export function Loader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 zx-muted">
      <span className="zx-prog" style={{ width: 28, height: 28, borderWidth: 3 }} />
      <span className="font-semibold tracking-wide">{label}…</span>
    </div>
  );
}

export function Empty({ icon = "bi-inbox", text }: { icon?: string; text: string }) {
  return (
    <div className="text-center py-10 px-4">
      <i className={`bi ${icon} zx-muted`} style={{ fontSize: "2.6rem" }} />
      <p className="mt-3 zx-muted font-bold">{text}</p>
    </div>
  );
}

export type Column<T> = { key: string; label: string; render: (row: T) => ReactNode; className?: string | undefined; mobileHidden?: boolean | undefined };

/** Table on desktop, stacked cards on phones — nothing overflows on small screens. */
export function DataTable<T>({ columns, rows, rowKey, empty, mobileTitle }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string | number;
  empty?: ReactNode;
  mobileTitle?: ((r: T) => ReactNode) | undefined;
}) {
  if (!rows.length) return <>{empty ?? <Empty text="Nothing here yet." />}</>;
  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="zx-table">
          <thead>
            <tr>{columns.map((c) => <th key={c.key} className={c.className}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)}>{columns.map((c) => <td key={c.key} className={c.className}>{c.render(r)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden">
        {rows.map((r) => (
          <div className="zx-mobile-row" key={rowKey(r)}>
            {mobileTitle && <div className="mb-2">{mobileTitle(r)}</div>}
            {columns.filter((c) => !c.mobileHidden).map((c) => (
              <div className="zx-kv" key={c.key}><span>{c.label}</span><span>{c.render(r)}</span></div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ title: string; body: string; action: () => unknown; danger?: boolean } | null>(null);
  const dialog = (
    <AlertDialog open={!!state} onOpenChange={(o) => !o && setState(null)}>
      <AlertDialogContent className="zx-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{state?.title}</AlertDialogTitle>
          <AlertDialogDescription className="zx-muted">{state?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="zx-btn-ghost">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={`zx-btn zx-btn-sm ${state?.danger ? "zx-btn-danger" : ""}`}
            onClick={() => { const a = state?.action; setState(null); void a?.(); }}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { confirm: setState, dialog };
}

export async function copyText(text: string, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast.success(label);
  }
}

export function StatusPill({ status, expired }: { status: string; expired?: boolean | undefined }) {
  if (status === "banned") return <span className="zx-badge bad"><i className="bi bi-circle-fill" style={{ fontSize: "0.45rem" }} /> Banned</span>;
  if (status === "blocked") return <span className="zx-badge warn"><i className="bi bi-circle-fill" style={{ fontSize: "0.45rem" }} /> Blocked</span>;
  if (expired) return <span className="zx-badge mute"><i className="bi bi-circle-fill" style={{ fontSize: "0.45rem" }} /> Expired</span>;
  return <span className="zx-badge ok"><i className="bi bi-circle-fill" style={{ fontSize: "0.45rem" }} /> Active</span>;
}

export function RoleTag({ role }: { role: string | null }) {
  if (role === "owner") return <span className="zx-badge solid"><i className="bi bi-crown" /> Owner</span>;
  if (role === "admin") return <span className="zx-badge"><i className="bi bi-shield-check" /> Admin</span>;
  if (role === "reseller") return <span className="zx-badge mute"><i className="bi bi-person" /> Reseller</span>;
  return <span className="zx-badge mute">—</span>;
}

export function PageGrid({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-3 sm:px-4 py-6 sm:py-8">{children}</div>;
}
