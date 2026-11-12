import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  DataTable,
  Empty,
  Field,
  PageGrid,
  useConfirm,
} from "@/components/zx/ui";
import { useMe } from "@/lib/me-context";
import { meQuery, noticesQuery, usersQuery, getToken } from "@/lib/queries";
import { noticeSend, noticeDelete } from "@/lib/data.functions";
import { errMsg, timeAgo, type AppRole } from "@/lib/zx";

export const Route = createFileRoute("/_authenticated/admin/notices")({
  head: () => ({
    meta: [
      { title: "Send Notices · ZEROX BYPASS Panel" },
      { name: "description", content: "Send instant notices to admins and resellers." },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role !== "owner") throw redirect({ to: "/dashboard" });
  },
  component: NoticesPage,
});

function NoticesPage() {
  const { userId } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: notices } = useQuery(noticesQuery);
  const { data: users } = useQuery(usersQuery);
  const { confirm, dialog } = useConfirm();
  const [target, setTarget] = useState<"all" | AppRole | "user">("all");
  const [userIdT, setUserIdT] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const names = new Map((users ?? []).map((u) => [u.id, u.username]));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) {
      navigate({ to: "/", replace: true });
      return;
    }
    if (target === "user" && !userIdT) {
      toast.error("Pick a user to send to");
      return;
    }
    if (!title.trim() || !body.trim()) {
      toast.error("Title and message required");
      return;
    }
    setBusy(true);
    try {
      const r = await noticeSend({
        data: {
          token,
          target:
            target === "all"
              ? "all"
              : target === "admin"
                ? "admin"
                : target === "reseller"
                  ? "reseller"
                  : "user",
          ...(target === "user" ? { userId: userIdT } : {}),
          title: title.trim(),
          body: body.trim(),
        },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Notice sent");
      setTitle("");
      setBody("");
      setUserIdT("");
      void qc.invalidateQueries({ queryKey: ["notices"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send notice");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: number) {
    const token = getToken();
    if (!token) return;
    const r = await noticeDelete({ data: { token, id } });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Notice deleted");
    void qc.invalidateQueries({ queryKey: ["notices"] });
  }

  const targetLabel = (n: { target_user_id: string | null; target_role: string | null }) =>
    n.target_user_id
      ? `@${names.get(n.target_user_id) ?? "user"}`
      : n.target_role
        ? `All ${n.target_role}s`
        : "Everyone";

  return (
    <PageGrid>
      {dialog}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader icon="bi-megaphone" title="Send Notice" />
            <form onSubmit={send} className="zx-card-body space-y-4" noValidate>
              <Field label="Send to" modern>
                <select
                  className="zx-input"
                  value={target}
                  onChange={(e) => setTarget(e.target.value as typeof target)}
                >
                  <option value="all">Everyone</option>
                  <option value="admin">All Admins</option>
                  <option value="reseller">All Resellers</option>
                  <option value="user">Specific user</option>
                </select>
              </Field>
              {target === "user" && (
                <Field label="User" modern>
                  <select
                    className="zx-input"
                    value={userIdT}
                    onChange={(e) => setUserIdT(e.target.value)}
                  >
                    <option value="">— Select user —</option>
                    {(users ?? [])
                      .filter((u) => u.id !== userId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username} ({u.role})
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <Field label="Title" modern>
                <input
                  className="zx-input"
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. New update live"
                />
              </Field>
              <Field label="Message" modern>
                <textarea
                  className="zx-input"
                  style={{ fontFamily: "var(--font-sans)", fontSize: 16 }}
                  rows={5}
                  maxLength={2000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your notice…"
                />
              </Field>
              <button type="submit" className="zx-btn zx-btn-lg w-full" disabled={busy}>
                <i className="bi bi-send" /> {busy ? "Sending…" : "Send Notice"}
              </button>
            </form>
          </Card>
        </div>
        <div className="lg:col-span-3">
          <Card>
            <CardHeader icon="bi-clock-history" title="Sent Notices" />
            <DataTable
              rows={notices ?? []}
              rowKey={(n) => n.id}
              empty={<Empty icon="bi-megaphone" text="No notices sent yet." />}
              columns={[
                {
                  key: "n",
                  label: "Notice",
                  render: (n) => (
                    <div>
                      <b>{n.title}</b>
                      <div className="text-sm zx-muted whitespace-pre-wrap break-words">
                        {n.body}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "t",
                  label: "To",
                  render: (n) => <span className="zx-badge">{targetLabel(n)}</span>,
                },
                {
                  key: "w",
                  label: "Sent",
                  render: (n) => <span className="zx-muted text-sm">{timeAgo(n.created_at)}</span>,
                },
                {
                  key: "d",
                  label: "",
                  render: (n) => (
                    <button
                      type="button"
                      className="zx-icon-btn danger"
                      aria-label="Delete notice"
                      onClick={() =>
                        confirm({
                          title: "Delete notice?",
                          body: `Delete "${n.title}"?`,
                          danger: true,
                          action: () => del(n.id),
                        })
                      }
                    >
                      <i className="bi bi-trash" />
                    </button>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </div>
    </PageGrid>
  );
}
