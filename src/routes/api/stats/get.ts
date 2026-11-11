import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
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
}

export const Route = createFileRoute("/api/stats/get")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
