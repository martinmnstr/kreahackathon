import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Signed-in users can trigger a refresh of the recall feed. */
export const syncRecallsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { syncRecalls } = await import("@/server/recall-sync.server");
    return syncRecalls();
  });
