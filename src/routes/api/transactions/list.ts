import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token, userId } = body as { token: string; userId?: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || (me.role !== 'owner' && me.role !== 'admin')) return { ok: false, error: 'Not allowed' };
  let rows: typeof db.transactions;
  if (me.role === 'owner' && userId) rows = db.transactions.filter((t) => t.user_id === userId);
  else if (me.role === 'owner') rows = db.transactions;
  else rows = db.transactions.filter((t) => t.user_id === v.uid);
  return { ok: true, rows: [...rows].sort((x, y) => y.id - x.id).slice(0, 300) };
}

export const Route = createFileRoute("/api/transactions/list")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
