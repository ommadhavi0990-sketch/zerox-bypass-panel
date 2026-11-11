import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token } = body as { token: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const rows = db.notices.filter(
    (n) => (n.target_role === null && n.target_user_id === null) || n.target_role === v.role || n.target_user_id === v.uid,
  );
  return { ok: true, rows: [...rows].sort((x, y) => y.id - x.id).slice(0, 50) };
}

export const Route = createFileRoute("/api/notices/list")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
