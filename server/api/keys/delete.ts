import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb, mutateDb } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token, id } = body as { token: string; id: number };
  if (!token || !id) return { ok: false, error: 'Missing fields' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const k = db.keys.find((x) => x.id === id);
  if (!k || (v.uid !== db.users.find((u) => u.role === 'owner')?.id && k.created_by !== v.uid))
    return { ok: false, error: 'Key not found' };
  await mutateDb((d2) => { d2.keys = d2.keys.filter((x) => x.id !== id); }, `key deleted by ${db.users.find((u) => u.id === v.uid)?.username}`);
  return { ok: true };
});
