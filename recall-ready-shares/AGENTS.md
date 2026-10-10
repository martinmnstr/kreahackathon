<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Recall data is imported server-side from public FDA (openFDA enforcement) in `src/server/recall-sync.server.ts`; an hourly cron hits `/api/public/hooks/sync-recalls`. Why: one idempotent import path keeps the feed consistent.
- Raw-text parsing (states, lot numbers, hazard, targeted headlines) lives in pure `src/lib/recall-parse.ts` with tests. Why: rules are testable without network.
- Cards and clips render in the browser on a canvas (`src/lib/card-render.ts`), clips via MediaRecorder; colors come from `--story-*` CSS tokens. Why: no per-card server or AI cost.
- Hazard illustrations come only through the adapter in `src/lib/illustrations.ts`. Why: the illustration library can be swapped without touching the renderer.
- Saved library stores card settings (not files) and re-renders on reopen. Why: no storage needed.
- Client-callable server functions live in `src/lib/*.functions.ts`, never under `src/server/`. Why: import protection blocks `src/server/` from the browser bundle.
- Recall geography uses a browser-initialized MapLibre map with bundled state GeoJSON and pure counting helpers; nationwide notices count once per state. Why: keyless rendering and testable coverage keep map and feed consistent.
