import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb, toProfile } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token } = body as { token: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const u = db.users.find((x) => x.id === v.uid);
  if (!u || u.status !== 'active') return { ok: false, error: 'Session expired' };
  return { ok: true, me: { userId: u.id, profile: toProfile(u), role: u.role } };
}

export const Route = createFileRoute("/api/auth/me")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
