import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb, mutateDb } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token } = body as { token: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  await mutateDb((d2) => {
    const u = d2.users.find((x) => x.id === v.uid);
    if (u) u.passkey = null;
  }, 'fingerprint removed');
  return { ok: true };
});
