import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb, mutateDb } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token, id } = body as { token: string; id: number };
  if (!token || !id) return { ok: false, error: 'Missing fields' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || me.role !== 'owner') return { ok: false, error: 'Only Owner can delete notices' };
  await mutateDb((d2) => { d2.notices = d2.notices.filter((n) => n.id !== id); }, `notice deleted by ${me.username}`);
  return { ok: true };
});
