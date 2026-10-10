import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  if (!user) return <div className="p-10 font-mono text-sm">Loading…</div>;
  return (
    <div className="min-h-screen">
      <div className="hazard-stripes h-2" />
      <header className="border-b-2 border-ink bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-3 sm:gap-6">
          <Link to="/dashboard" className="font-display text-lg">RECALL<span className="text-primary">/</span>CARDS</Link>
          <nav className="order-3 flex w-full gap-4 text-sm font-semibold sm:order-none sm:w-auto">
            <Link to="/dashboard" activeProps={{ className: "text-primary" }}>Recalls</Link>
            <Link to="/library" activeProps={{ className: "text-primary" }}>My library</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Notifications userId={user.id} />
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

function Notifications({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      const { data: prefs } = await supabase.from("user_prefs").select("last_seen_at").eq("user_id", userId).maybeSingle();
      if (!prefs) await supabase.from("user_prefs").insert({ user_id: userId });
      const since = prefs?.last_seen_at ?? new Date().toISOString();
      const { data: fresh } = await supabase.from("recalls").select("id,title,source,recall_date").gt("created_at", since).order("created_at", { ascending: false }).limit(20);
      return fresh ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("recall-inserts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "recalls" }, (payload) => {
        const r = payload.new as { id: string; title: string; source: string };
        qc.invalidateQueries({ queryKey: ["notifications", userId] });
        qc.invalidateQueries({ queryKey: ["recalls"] });
        toast(`New ${r.source} recall`, {
          description: r.title,
          action: { label: "Make card", onClick: () => navigate({ to: "/recall/$id", params: { id: r.id } }) },
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, userId, navigate]);

  async function markSeen(next: boolean) {
    setOpen(next);
    if (!next && data?.length) {
      await supabase.from("user_prefs").upsert({ user_id: userId, last_seen_at: new Date().toISOString() });
      qc.invalidateQueries({ queryKey: ["notifications", userId] });
    }
  }

  const count = data?.length ?? 0;
  return (
    <Popover open={open} onOpenChange={markSeen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="New recalls" className="relative">
          <Bell className="h-5 w-5" />
          {count > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-2 text-sm font-semibold">New recalls since your last visit</div>
        {count === 0 ? <p className="p-4 text-sm text-muted-foreground">You're all caught up.</p> : (
          <ul className="max-h-80 overflow-auto">
            {data!.map((r) => (
              <li key={r.id}>
                <Link to="/recall/$id" params={{ id: r.id }} onClick={() => markSeen(false)} className="block px-4 py-2 text-sm hover:bg-muted">
                  <span className="font-mono text-xs text-primary">{r.source}</span> {r.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
