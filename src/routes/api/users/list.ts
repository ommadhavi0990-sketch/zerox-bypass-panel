import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb, toUserRow } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token } = body as { token: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || (me.role !== 'owner' && me.role !== 'admin')) return { ok: false, error: 'Not allowed' };
  const rows = me.role === 'owner' ? db.users : db.users.filter((u) => u.uplink === me.username);
  return { ok: true, rows: [...rows].sort((x, y) => y.created_at.localeCompare(x.created_at)).map(toUserRow) };
}

export const Route = createFileRoute("/api/users/list")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
