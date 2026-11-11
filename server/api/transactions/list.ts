import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token, userId } = body as { token: string; userId?: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || (me.role !== 'owner' && me.role !== 'admin')) return { ok: false, error: 'Not allowed' };
  let rows: typeof db.transactions;
  if (me.role === 'owner' && userId) rows = db.transactions.filter((t) => t.user_id === userId);
  else if (me.role === 'owner') rows = db.transactions;
  else rows = db.transactions.filter((t) => t.user_id === v.uid);
  return { ok: true, rows: [...rows].sort((x, y) => y.id - x.id).slice(0, 300) };
});
