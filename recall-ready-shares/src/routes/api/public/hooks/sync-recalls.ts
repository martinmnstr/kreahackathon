import { createFileRoute } from "@tanstack/react-router";

// Hourly cron target. Only imports public government recall data (idempotent insert-if-new).
export const Route = createFileRoute("/api/public/hooks/sync-recalls")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { syncRecalls } = await import("@/server/recall-sync.server");
        const result = await syncRecalls();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
