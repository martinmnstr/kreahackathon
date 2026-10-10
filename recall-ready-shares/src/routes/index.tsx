import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BellRing, MapPin, Clapperboard, FileCheck2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Recall Story Cards — shareable recall alerts for local news" },
      { name: "description", content: "One click turns any FDA recall into a sourced Instagram or TikTok card or clip, targeted by state." },
      { property: "og:title", content: "Recall Story Cards" },
      { property: "og:description", content: "Sourced, shareable recall cards for newsrooms, health departments and parenting creators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: BellRing, title: "Live recall alerts", body: "New FDA recalls pop up in the app the moment they're published." },
  { icon: MapPin, title: "Targeted by state", body: "“New in California this week” — filter and headline for your audience." },
  { icon: Clapperboard, title: "Cards and clips", body: "Instagram 4:5 and TikTok 9:16 images, plus a 7-second animated clip." },
  { icon: FileCheck2, title: "Always sourced", body: "Every card carries the agency, recall number, lot codes and date." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <div className="hazard-stripes h-3" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl">RECALL<span className="text-primary">/</span>CARDS</span>
        <Button asChild variant="outline"><Link to="/dashboard">Open recalls</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="grid items-center gap-12 py-12 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="mb-4 inline-block bg-caution px-3 py-1 font-mono text-sm">FOR NEWSROOMS · HEALTH DEPTS · PARENT CREATORS</p>
            <h1 className="text-5xl leading-[1.02] md:text-7xl">Recall warnings people actually <span className="text-primary">share.</span></h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Plain-text recall notices don't get reposted. Turn any recall into a sourced story card or short clip in one click.
            </p>
            <div className="mt-8 flex gap-3">
              <Button asChild size="lg" className="stamp"><Link to="/dashboard">Start making cards</Link></Button>
            </div>
          </div>
          <div className="stamp mx-auto w-full max-w-sm rotate-2 rounded-lg bg-ink p-6 text-paper">
            <div className="mb-4 inline-block rounded bg-primary px-3 py-1 font-display text-primary-foreground">RECALL ALERT</div>
            <p className="font-mono text-sm text-caution">NEW IN CALIFORNIA THIS WEEK</p>
            <p className="mt-3 font-display text-3xl leading-tight">Cabricharme cheese wedges</p>
            <p className="mt-4 font-display text-primary">UNDECLARED ALLERGEN</p>
            <div className="mt-4 flex flex-wrap gap-2 font-mono text-sm">
              {["CA", "AZ", "NY", "NJ"].map((s) => (
                <span key={s} className={s === "CA" ? "rounded bg-primary px-2 py-1" : "rounded bg-paper px-2 py-1 text-ink"}>{s}</span>
              ))}
            </div>
            <p className="mt-4 font-mono text-xs text-caution">LOT 24A115 · 24A116</p>
            <p className="mt-6 border-t border-paper/20 pt-3 text-xs">SOURCE: FDA · Recall H-1395-2026</p>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border-2 border-ink bg-card p-5">
              <f.icon className="mb-3 h-7 w-7 text-primary" />
              <h3 className="text-lg">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
