import { createFileRoute } from "@tanstack/react-router";
import { verifyPassword, hashPassword, findUser, readDb, mutateDb } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token, current, next } = body as { token: string; current: string; next: string };
  if (!token || !current || !next) return { ok: false, error: 'All fields required' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || !(await verifyPassword(current, me.password_hash)))
    return { ok: false, error: 'Current password is wrong' };
  const hash = await hashPassword(next);
  await mutateDb((d2) => {
    const x = d2.users.find((u) => u.id === me.id);
    if (x) x.password_hash = hash;
  }, `password change: ${me.username}`);
  return { ok: true };
}

export const Route = createFileRoute("/api/auth/change-password")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
