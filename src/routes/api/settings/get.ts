import { createFileRoute } from "@tanstack/react-router";
import { readDb } from '../../../src/lib/gh-store.server';

async function handle(_request: Request) {
  const { db } = await readDb();
  return { ok: true, settings: db.settings };
}

export const Route = createFileRoute("/api/settings/get")({ server: { handlers: { POST: async ({ request }) => {
  return Response.json(await handle(request));
} } } }));
