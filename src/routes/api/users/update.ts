import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb, mutateDb, addTx, findUser, toUserRow } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token, userId, role, status, expires_at, ref_limit } = body as {
    token: string; userId: string; role: string; status: string; expires_at: string | null; ref_limit: number;
  };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || me.role !== 'owner') return { ok: false, error: 'Only Owner can edit accounts' };
  const target = db.users.find((x) => x.id === userId);
  if (!target) return { ok: false, error: 'User not found' };
  await mutateDb((d2) => {
    const u = d2.users.find((x) => x.id === userId);
    if (!u) return;
    u.role = role;
    u.status = status;
    u.expires_at = expires_at;
    u.ref_limit = ref_limit;
    addTx(d2, u, 'owner_edit', `Updated by ${me.username} → ${role} / ${status}`, 0, u.balance);
  }, `owner edit user: ${target.username}`);
  return { ok: true };
}

export const Route = createFileRoute("/api/users/update")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
