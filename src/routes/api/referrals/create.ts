import { createFileRoute } from "@tanstack/react-router";
import { verifyToken, readDb, mutateDb, addTx, nextId, referralCost } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token, role, hours, credit, uses, validHours } = body as {
    token: string; role: string; hours: number | null; credit: number; uses: number; validHours: number;
  };
  if (!token) return { ok: false, error: 'Session expired' };
  const v = await verifyToken(token);
  if (!v) return { ok: false, error: 'Session expired' };
  const { db } = await readDb();
  const me = db.users.find((x) => x.id === v.uid);
  if (!me || (me.role !== 'owner' && me.role !== 'admin')) return { ok: false, error: 'Only Owner/Admin can create referrals' };
  if (me.role !== 'owner' && role !== 'reseller') return { ok: false, error: 'Admins can only create RESELLER referrals' };
  const price = hours === null ? 0 : (db.settings.prices.find((p) => p.hours === hours)?.price ?? -1);
  if (price < 0) return { ok: false, error: 'Unknown duration plan' };
  const cost = referralCost(me.role, price, credit, uses);
  if (me.role !== 'owner') {
    if (me.ref_used + uses > me.ref_limit) return { ok: false, error: 'Referral limit reached' };
    if (cost > me.balance) return { ok: false, error: `Insufficient balance — need ₹${cost}` };
  }

  let createdCode: string | null = null;
  const now = new Date().toISOString();
  const result = await mutateDb((d2) => {
    const u = d2.users.find((x) => x.id === me.id);
    if (!u || u.status !== 'active') return;
    if (u.role !== 'owner') {
      if (u.ref_used + uses > u.ref_limit) { throw new Error('limit_reached'); }
      if (referralCost(u.role, price, credit, uses) > u.balance) { throw new Error('insufficient'); }
    }
    let code = `ZX${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    for (let i = 0; d2.referrals.some((r) => r.code === code) && i < 50; i++) code = `ZX${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    d2.referrals.push({
      id: nextId(d2, 'referral'), code, role, duration_hours: hours, credit, uses: 0, max_uses: uses,
      expires_at: new Date(Date.now() + validHours * 3_600_000).toISOString(), revoked: false,
      created_by: u.id, created_by_name: u.username, redemptions: [],
      created_at: now,
    });
    if (u.role !== 'owner') { u.balance -= cost; u.ref_used += uses; }
    const label = hours ? `${hours}h` : 'lifetime';
    addTx(d2, u, 'referral_create', `Created ${code} · ${role} · ${label} · ₹${credit} credit · ${uses} use(s)`, u.role === 'owner' ? 0 : -cost, u.role === 'owner' ? null : u.balance);
    createdCode = code;
  }, `referral created by ${me.username}`);

  if (!createdCode) return { ok: false, error: 'Could not create referral' };
  return { ok: true, code: createdCode };
}

export const Route = createFileRoute("/api/referrals/create")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
