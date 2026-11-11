import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb, mutateDb } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token, id } = body as { token: string; id: number };
  if (!token || !id) return { ok: false, error: 'Missing fields' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const r = db.referrals.find((x) => x.id === id);
  if (!r || (v.uid !== db.users.find((u) => u.role === 'owner')?.id && r.created_by !== v.uid))
    return { ok: false, error: 'Referral not found' };
  await mutateDb((d2) => {
    const x = d2.referrals.find((y) => y.id === id);
    if (x) x.revoked = true;
  }, `referral revoked by ${db.users.find((u) => u.id === v.uid)?.username}`);
  return { ok: true };
}

export const Route = createFileRoute("/api/referrals/revoke")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
