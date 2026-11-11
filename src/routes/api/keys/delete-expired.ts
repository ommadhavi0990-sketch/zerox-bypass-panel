import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb, mutateDb } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token } = body as { token: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const mine = db.keys.filter((k) => v.uid === db.users.find((u) => u.role === 'owner')?.id || k.created_by === v.uid);
  const expiredIds = new Set(mine.filter((k) => k.expires_at && new Date(k.expires_at).getTime() <= Date.now()).map((k) => k.id));
  if (!expiredIds.size) return { ok: true, deleted: 0 };
  await mutateDb((d2) => { d2.keys = d2.keys.filter((x) => !expiredIds.has(x.id)); }, `expired keys cleaned by ${db.users.find((u) => u.id === v.uid)?.username}`);
  return { ok: true, deleted: expiredIds.size };
}

export const Route = createFileRoute("/api/keys/delete-expired")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
