import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb, mutateDb, signToken } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { credentialId } = body as { credentialId: string };
  if (!credentialId) return { ok: false, error: 'Missing credentialId', code: 'UNKNOWN' };
  const { db } = await readDb();
  const u = db.users.find((x) => x.passkey?.id === credentialId);
  if (!u) return { ok: false, error: 'This fingerprint is not registered on the panel.', code: 'UNKNOWN' };
  if (u.passkey && new Date(u.passkey.expires_at).getTime() <= Date.now())
    return { ok: false, error: 'Fingerprint expired — log in with your password, then renew it.', code: 'EXPIRED' };
  if (u.status !== 'active') return { ok: false, error: 'This account is not active.', code: 'UNKNOWN' };
  await mutateDb((d2) => {
    const x = d2.users.find((y) => y.id === u.id);
    if (x) x.last_active_at = new Date().toISOString();
  }, `fingerprint login: ${u.username}`);
  const token = await signToken(u.id);
  const me = { userId: u.id, profile: { id: u.id, username: u.username, role: u.role, status: u.status, balance: u.balance, ref_used: u.ref_used, ref_limit: u.ref_limit, expires_at: u.expires_at, created_at: u.created_at, uplink: u.uplink }, role: u.role };
  return { ok: true, token, me };
});
