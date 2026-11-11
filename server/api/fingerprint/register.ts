import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb, mutateDb } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token, credentialId } = body as { token: string; credentialId: string };
  if (!token || !credentialId) return { ok: false, error: 'Missing fields' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
  let result: any = { ok: false, error: 'Session expired' };
  await mutateDb((d2) => {
    const u = d2.users.find((x) => x.id === v.uid);
    if (!u) return;
    u.passkey = { id: credentialId, expires_at: until };
    result = { ok: true, until };
  }, 'fingerprint enabled');
  return result;
});
