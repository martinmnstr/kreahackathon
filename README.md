# Recall Radar 🚨 — data service

Food recalls per retailer, per US state, from **Cala** (primary) with **openFDA** filling gaps.
Serves a local JSON API for the frontend. Needs Node 22+, no dependencies.

```bash
cp .env.example .env   # add CALA_API_KEY
npm run refresh        # build the snapshot (~1 min, Cala is slow on new questions)
npm start              # API on http://localhost:8787
```

## API

| Endpoint | Returns |
|---|---|
| `GET /api/retailers` | `[{ id: "walmart", label: "Walmart" }]` |
| `GET /api/:retailer/states` | `{ states: { TX: StateSummary, … } }` — for the heatmap |
| `GET /api/:retailer/recalls?state=TX` | `{ recalls: RecallEvent[] }` — omit `state` for all |
| `GET /api/:retailer/recalls/:id` | one `RecallEvent` |
| `GET /api/:retailer/recalls/:id/context` | `{ summary, sources }` — Cala's story of the recall, input for media |

Every list response carries `savedAt` and `stale`. Add `?refresh=1` to force a rebuild.
The shapes are documented in [src/recalls/types.js](src/recalls/types.js) — that file is the contract.

## How the data is made

```
Cala knowledge/query ──┐  one question for the 60-day window + one per 15-day slice
 (recalls per retailer) │  → merge + fuzzy dedupe → parse states/dates (recalls/parse.js)
                        ▼
openFDA enforcement ──► gap-fill by company match: FDA class, states when Cala only says "37 states",
                        exact date when Cala's is vague/in the future   (sources.* says who won)
                        ▼
Cala entities ────────► company profile: legal name, HQ, CIK, LEI, founding date
                        ▼
data/cache/recalls-walmart.json  ──►  API  ──►  /states (heatmap), /recalls, /context (on demand)
```

Caching (`src/cache.js`): results are files in `data/cache/`. Fresh (<1h) → served as is. Stale →
served instantly while a rebuild runs in the background. Missing → built on the spot (~1 min).
So after one `npm run refresh` the API is always instant.

## Layout

```
src/config.js            retailers, time window, cache TTLs ← start here
src/server.js            HTTP routes
src/service.js           getRecalls / getStates / getRecall / getContext (cached)
src/recalls/build.js     the pipeline above
src/recalls/parse.js     free text → states, dates, company keys
src/recalls/context.js   per-recall Cala story
src/recalls/types.js     RecallEvent / StateSummary contract
src/sources/cala.js      Cala client (throttled, retries 429)
src/sources/fda.js       openFDA client
scripts/refresh.js       npm run refresh [-- walmart]   rebuild + print a summary
scripts/cala.js          npm run cala -- "<question>" | --search "…" | --entity "Name"
```

**Add a retailer:** uncomment/add it in `RETAILERS` in `src/config.js`, run `npm run refresh`. Kroger and Costco
answer the same Cala question; check quality with `npm run cala -- "Which food products sold at Kroger were recalled since August 2026? Return name, recall_date"`.

## Known limits

- Cala returns only ~3–8 recalls per retailer and coverage varies by wording; some recalls it knows aren't surfaced.
- Cala rows are synthesized text: dates/states are parsed best-effort, `statesComplete: false` marks partial lists.
- Meat/poultry recalls are USDA (FSIS), not FDA, so openFDA can't fill their gaps.
- Cala has no entity for some small/foreign firms → `companyProfile: null` (we refuse look-alike matches).
