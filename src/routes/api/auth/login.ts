import { createFileRoute } from "@tanstack/react-router";
import { verifyPassword, signToken, findUser, toProfile, readDb, mutateDb } from "../../../src/lib/gh-store.server";

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { username, password } = body as { username: string; password: string };

  if (!username || !password) {
    return { ok: false, error: "Username and password required" };
  }

  const { db } = await readDb();
  const u = findUser(db, username);

  if (!u || !(await verifyPassword(password, u.password_hash))) {
    return { ok: false, error: "Wrong username or password" };
  }
  if (u.status === "banned") return { ok: false, error: "This account is banned. Contact the Owner." };
  if (u.status === "blocked") return { ok: false, error: "This account is blocked. Contact the Owner." };

  // Touch last-seen
  await mutateDb((d2) => {
    const x = d2.users.find((y) => y.id === u.id);
    if (x) x.last_active_at = new Date().toISOString();
  }, `login: ${u.username}`);

  const token = await signToken(u.id);
  return { ok: true, token, me: { userId: u.id, profile: toProfile(u), role: u.role } };
}

export const Route = createFileRoute("/api/auth/login")({
  server: { handlers: { POST: async ({ request }) => Response.json(await handle(request)) } },
});
