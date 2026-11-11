import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb, mutateDb, addTx, nextId, hashPassword, findUser, toUserRow } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token, username, password, role, hours, credit } = body as {
    token: string; username: string; password: string; role: string; hours: number | null; credit: number;
  };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || me.role !== 'owner') return { ok: false, error: 'Only Owner can create accounts' };
  if (findUser(db, username)) return { ok: false, error: 'Username already taken' };

  const now = new Date().toISOString();
  const hash = await hashPassword(password);
  let result: any = { ok: false, error: 'Failed' };
  await mutateDb((d2) => {
    if (findUser(d2, username)) return;
    const user = {
      id: `u_${nextId(d2, 'user')}`,
      username: username.trim(),
      password_hash: hash,
      role,
      status: 'active',
      balance: credit,
      ref_used: 0,
      ref_limit: role === 'reseller' ? 0 : 10,
      expires_at: hours ? new Date(Date.now() + hours * 3_600_000).toISOString() : null,
      created_at: now,
      last_active_at: now,
      uplink: me.username,
      passkey: null,
    };
    d2.users.push(user);
    addTx(d2, user, 'account_created', `Created by ${me.username} (${role})`, 0, user.balance);
    result = { ok: true, username: user.username };
  }, `owner create user: ${username}`);
  return result;
});
