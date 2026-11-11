import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb, mutateDb } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token, userId } = body as { token: string; userId: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || me.role !== 'owner') return { ok: false, error: 'Only Owner can delete accounts' };
  const target = db.users.find((x) => x.id === userId);
  if (!target) return { ok: false, error: 'User not found' };
  if (target.id === me.id) return { ok: false, error: 'Cannot delete yourself' };
  if (target.role === 'owner' && db.users.filter((u) => u.role === 'owner').length <= 1)
    return { ok: false, error: 'Cannot delete last Owner' };
  await mutateDb((d2) => { d2.users = d2.users.filter((u) => u.id !== userId); }, `owner delete user: ${target.username}`);
  return { ok: true };
}

export const Route = createFileRoute("/api/users/delete")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
