import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb, mutateDb, hashPassword, findUser } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token, userId, password } = body as { token: string; userId: string; password: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || me.role !== 'owner') return { ok: false, error: 'Only Owner can set passwords' };
  const hash = await hashPassword(password);
  let result: any = { ok: false, error: 'User not found' };
  await mutateDb((d2) => {
    const u = d2.users.find((x) => x.id === userId);
    if (!u) return;
    u.password_hash = hash;
    result = { ok: true };
  }, `owner set password: ${userId}`);
  return result;
}

export const Route = createFileRoute("/api/users/set-password")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
