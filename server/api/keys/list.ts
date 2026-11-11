import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb } from '../../../src/lib/gh-store.server';

const PAGE = 20;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token, q = '', page = 0 } = body as { token: string; q?: string; page?: number };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const mine = v.uid === db.users.find((u) => u.role === 'owner')?.id ? db.keys : db.keys.filter((k) => k.created_by === v.uid);
  const query = (q || '').trim().toLowerCase();
  const filtered = query ? mine.filter((k) => k.license_key.toLowerCase().includes(query) || k.game.toLowerCase().includes(query)) : mine;
  const sorted = [...filtered].sort((x, y) => y.id - x.id);
  return {
    ok: true,
    rows: sorted.slice(page * PAGE, page * PAGE + PAGE),
    count: sorted.length,
  };
});
