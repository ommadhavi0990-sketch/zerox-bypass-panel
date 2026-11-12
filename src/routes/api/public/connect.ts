import { createFileRoute } from "@tanstack/react-router";

// Public connect API used by the APK (login.h) to validate a license key.
export const Route = createFileRoute("/api/public/connect")({
  server: {
    handlers: {
      OPTIONS: async () =>
        (await import("../../../lib/connect-handler.server")).connectHandlers.OPTIONS(),
      GET: async (ctx) =>
        (await import("../../../lib/connect-handler.server")).connectHandlers.GET(ctx),
      POST: async (ctx) =>
        (await import("../../../lib/connect-handler.server")).connectHandlers.POST(ctx),
    },
  },
});
