import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb, mutateDb } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token, prices, telegram } = body as {
    token: string; prices?: { hours: number; price: number }[]; telegram?: { url: string; handle: string };
  };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || me.role !== 'owner') return { ok: false, error: 'Only Owner can change settings' };
  if (prices) {
    const hours = prices.map((p) => p.hours);
    if (new Set(hours).size !== hours.length) return { ok: false, error: 'Duplicate duration hours' };
  }
  await mutateDb((d2) => {
    if (prices) d2.settings.prices = prices.sort((x, y) => x.hours - y.hours);
    if (telegram) d2.settings.telegram = telegram;
  }, `settings updated by ${me.username}`);
  return { ok: true };
}

export const Route = createFileRoute("/api/settings/update")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
