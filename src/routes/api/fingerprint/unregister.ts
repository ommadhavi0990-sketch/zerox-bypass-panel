import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb, mutateDb } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token } = body as { token: string };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  await mutateDb((d2) => {
    const u = d2.users.find((x) => x.id === v.uid);
    if (u) u.passkey = null;
  }, 'fingerprint removed');
  return { ok: true };
}

export const Route = createFileRoute("/api/fingerprint/unregister")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
