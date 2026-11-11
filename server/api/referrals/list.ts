import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token } = body as { token: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const rows = v.uid === db.users.find((u) => u.role === 'owner')?.id ? db.referrals : db.referrals.filter((r) => r.created_by === v.uid);
  return { ok: true, rows: [...rows].sort((x, y) => y.id - x.id) };
});
