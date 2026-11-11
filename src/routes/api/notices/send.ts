import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb, mutateDb, nextId } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token, target, userId, title, body: bodyText } = body as {
    token: string; target: string; userId?: string; title: string; body: string;
  };
  if (!token || !title || !bodyText) return { ok: false, error: 'All fields required' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || me.role !== 'owner') return { ok: false, error: 'Only Owner can send notices' };
  if (target === 'user' && !userId) return { ok: false, error: 'Pick a user to send to' };
  if (target === 'user' && !db.users.find((u) => u.id === userId)) return { ok: false, error: 'User not found' };

  await mutateDb((d2) => {
    d2.notices.push({
      id: nextId(d2, 'notice'), title: title.trim(), body: bodyText.trim(),
      target_role: target === 'admin' || target === 'reseller' ? target : null,
      target_user_id: target === 'user' ? userId : null,
      created_by: v.uid, created_at: new Date().toISOString(),
    });
    if (d2.notices.length > 300) d2.notices = d2.notices.slice(-300);
  }, `notice sent by ${me.username}`);
  return { ok: true };
}

export const Route = createFileRoute("/api/notices/send")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
