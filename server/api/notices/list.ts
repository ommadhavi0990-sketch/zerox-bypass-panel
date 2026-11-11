import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token } = body as { token: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const rows = db.notices.filter(
    (n) => (n.target_role === null && n.target_user_id === null) || n.target_role === v.role || n.target_user_id === v.uid,
  );
  return { ok: true, rows: [...rows].sort((x, y) => y.id - x.id).slice(0, 50) };
});
