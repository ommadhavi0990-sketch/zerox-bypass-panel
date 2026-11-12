import { createFileRoute } from "@tanstack/react-router";

// Standard PHP-panel compatible alias (/connect) for /api/public/connect.
export const Route = createFileRoute("/connect")({
  server: {
    handlers: {
      OPTIONS: async () =>
        (await import("../lib/connect-handler.server")).connectHandlers.OPTIONS(),
      GET: async (ctx) => (await import("../lib/connect-handler.server")).connectHandlers.GET(ctx),
      POST: async (ctx) =>
        (await import("../lib/connect-handler.server")).connectHandlers.POST(ctx),
    },
  },
});
