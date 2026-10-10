import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

// Pathless layout for the app pages. No auth: data comes from the local Recall Radar API.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="min-h-screen">
      <div className="hazard-stripes h-2" />
      <header className="border-b-2 border-ink bg-card">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <Link to="/dashboard" className="font-display text-lg">RECALL<span className="text-primary">/</span>CARDS</Link>
          <nav className="flex gap-4 text-sm font-semibold">
            <Link to="/dashboard" activeProps={{ className: "text-primary" }}>Recalls</Link>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
