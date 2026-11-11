import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb, mutateDb } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token, id } = body as { token: string; id: number };
  if (!token || !id) return { ok: false, error: 'Missing fields' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || me.role !== 'owner') return { ok: false, error: 'Only Owner can delete notices' };
  await mutateDb((d2) => { d2.notices = d2.notices.filter((n) => n.id !== id); }, `notice deleted by ${me.username}`);
  return { ok: true };
}

export const Route = createFileRoute("/api/notices/delete")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
