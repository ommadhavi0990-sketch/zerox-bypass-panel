import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb, mutateDb } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token, id } = body as { token: string; id: number };
  if (!token || !id) return { ok: false, error: 'Missing fields' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const r = db.referrals.find((x) => x.id === id);
  if (!r || (v.uid !== db.users.find((u) => u.role === 'owner')?.id && r.created_by !== v.uid))
    return { ok: false, error: 'Referral not found' };
  await mutateDb((d2) => {
    const x = d2.referrals.find((y) => y.id === id);
    if (x) x.revoked = true;
  }, `referral revoked by ${db.users.find((u) => u.id === v.uid)?.username}`);
  return { ok: true };
});
