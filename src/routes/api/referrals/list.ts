import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token } = body as { token: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const rows = v.uid === db.users.find((u) => u.role === 'owner')?.id ? db.referrals : db.referrals.filter((r) => r.created_by === v.uid);
  return { ok: true, rows: [...rows].sort((x, y) => y.id - x.id) };
}

export const Route = createFileRoute("/api/referrals/list")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
