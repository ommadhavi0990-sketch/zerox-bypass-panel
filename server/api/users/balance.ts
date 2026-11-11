import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb, mutateDb, addTx } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token, userId, mode, amount, note } = body as {
    token: string; userId: string; mode: string; amount: number; note?: string;
  };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || me.role !== 'owner') return { ok: false, error: 'Only Owner can adjust balances' };
  const target = db.users.find((x) => x.id === userId);
  if (!target || target.role === 'owner') return { ok: false, error: 'User not found or is Owner' };
  let before = target.balance;
  let balance: number;
  if (mode === 'add') balance = before + amount;
  else if (mode === 'subtract') balance = Math.max(0, before - amount);
  else balance = amount;
  const delta = balance - before;
  await mutateDb((d2) => {
    const u = d2.users.find((x) => x.id === userId);
    if (!u) return;
    u.balance = balance;
    addTx(d2, u, 'balance_adjust', note || `${mode} ₹${amount} by ${me.username}`, delta, u.balance);
  }, `owner balance: ${target.username}`);
  return { ok: true, balance };
});
