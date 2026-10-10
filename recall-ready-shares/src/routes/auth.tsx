import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Recall Story Cards" },
      { name: "description", content: "Sign in to see live recalls and build shareable recall cards." },
      { property: "og:title", content: "Sign in — Recall Story Cards" },
      { property: "og:description", content: "Sign in to see live recalls and build shareable recall cards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { if (user) navigate({ to: "/dashboard" }); }, [user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/dashboard` } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (mode === "signup") toast.success("Check your email to confirm your account.");
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (result.error) toast.error(result.error.message ?? "Google sign-in failed");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="hazard-stripes h-3" />
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="stamp w-full max-w-sm rounded-lg bg-card p-8">
          <h1 className="text-3xl">{mode === "signin" ? "Sign in" : "Create account"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Recall Story Cards</p>
          <Button variant="outline" className="mt-6 w-full" onClick={google}>Continue with Google</Button>
          <div className="my-4 text-center text-xs text-muted-foreground">or</div>
          <form onSubmit={submit} className="space-y-3">
            <div><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label htmlFor="pw">Password</Label><Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={busy}>{mode === "signin" ? "Sign in" : "Sign up"}</Button>
          </form>
          <button className="mt-4 text-sm underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
