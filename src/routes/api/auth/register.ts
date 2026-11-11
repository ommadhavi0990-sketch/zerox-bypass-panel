import { createFileRoute } from "@tanstack/react-router";
import { verifyPassword, hashPassword, findUser, addTx, nextId, toProfile, signToken, readDb, mutateDb } from '../../../src/lib/gh-store.server';

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { username, password, referral } = body as { username: string; password: string; referral: string };

  if (!username || !password || !referral) {
    return { ok: false, error: 'All fields required' };
  }

  const { db } = await readDb();
  const code = referral.trim().toUpperCase();
  const ref = db.referrals.find((r) => r.code === code);
  if (!ref || ref.revoked || ref.uses >= ref.max_uses || new Date(ref.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: 'Invalid, expired or fully-used referral code' };
  }
  if (findUser(db, username)) {
    return { ok: false, error: 'Username already taken' };
  }

  const hash = await hashPassword(password);
  const now = new Date().toISOString();
  const result = await mutateDb((d2) => {
    const r = d2.referrals.find((x) => x.code === code);
    if (!r || r.revoked || r.uses >= r.max_uses || new Date(r.expires_at).getTime() <= Date.now()) return;
    if (findUser(d2, username)) return;
    const user = {
      id: `u_${nextId(d2, 'user')}`,
      username: username.trim(),
      password_hash: hash,
      role: r.role,
      status: 'active',
      balance: r.credit,
      ref_used: 0,
      ref_limit: r.role === 'reseller' ? 0 : 10,
      expires_at: r.duration_hours ? new Date(Date.now() + r.duration_hours * 3_600_000).toISOString() : null,
      created_at: now,
      last_active_at: now,
      uplink: r.created_by_name,
      passkey: null,
    };
    d2.users.push(user);
    r.uses += 1;
    r.redemptions.push({ username: user.username, at: now });
    addTx(d2, user, 'account_created', `Registered with code ${r.code} (uplink ${r.created_by_name})`, 0, user.balance);
  }, `register: ${username}`);

  const u = result.users.find((x) => x.username === username.trim());
  const token = await signToken(u.id);
  return { ok: true, token, me: { userId: u.id, profile: toProfile(u), role: u.role } };
}

export const Route = createFileRoute("/api/auth/register")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
