import { defineEventHandler, readBody } from 'h3';
import { verifyToken, readDb, mutateDb } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token, on, message } = body as { token: string; on: boolean; message: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || me.role !== 'owner') return { ok: false, error: 'Only Owner can toggle maintenance' };
  await mutateDb((d2) => { d2.settings.maintenance = { on: !!on, message: message || '' }; }, `maintenance ${on ? 'ON' : 'OFF'} by ${me.username}`);
  return { ok: true };
});
