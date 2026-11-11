import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb, toProfile } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token } = body as { token: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const u = db.users.find((x) => x.id === v.uid);
  if (!u || u.status !== 'active') return { ok: false, error: 'Session expired' };
  return { ok: true, me: { userId: u.id, profile: toProfile(u), role: u.role } };
});
