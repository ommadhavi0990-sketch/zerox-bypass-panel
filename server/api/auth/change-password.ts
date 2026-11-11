import { defineEventHandler, readBody } from 'h3';
import { verifyPassword, hashPassword, findUser, readDb, mutateDb } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
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
});
