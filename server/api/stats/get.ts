import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token } = body as { token: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me) return { ok: false, error: 'Session expired' };
  const mine = me.role === 'owner' ? db.keys : db.keys.filter((k) => k.created_by === v.uid);
  const now = Date.now();
  const active = mine.filter((k) => !k.expires_at || new Date(k.expires_at).getTime() > now).length;
  const users = me.role === 'owner' ? db.users.length : db.users.filter((u) => u.uplink === me.username).length;
  return { ok: true, total_keys: mine.length, active_keys: active, expired_keys: mine.length - active, users };
});
