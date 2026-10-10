// Local JSON API for any UI. No dependencies: node:http + the service layer.
//   GET  /api/retailers
//   GET  /api/:retailer/recalls[?state=CA][&refresh=1]
//   GET  /api/:retailer/states
//   GET  /api/:retailer/recalls/:id
//   GET  /api/:retailer/recalls/:id/context[?refresh=1]  (Cala story for media; ~30s first time)
import { createServer } from "node:http";
import { PORT, RETAILERS } from "./config.js";
import { getRecalls, getStates, getRecall, getContext } from "./service.js";

const routes = [
  ["GET", /^\/api\/retailers$/, () => Object.entries(RETAILERS).map(([id, r]) => ({ id, ...r }))],
  ["GET", /^\/api\/(\w+)\/recalls$/, async ([retailer], q) => {
    const res = await getRecalls(retailer, { force: q.has("refresh") });
    const state = q.get("state")?.toUpperCase();
    return state ? { ...res, recalls: res.recalls.filter((r) => r.nationwide || r.states.includes(state)) } : res;
  }],
  ["GET", /^\/api\/(\w+)\/states$/, ([retailer]) => getStates(retailer)],
  ["GET", /^\/api\/(\w+)\/recalls\/(\w+)$/, ([retailer, id]) => getRecall(retailer, id)],
  ["GET", /^\/api\/(\w+)\/recalls\/(\w+)\/context$/, ([retailer, id], q) => getContext(retailer, id, { force: q.has("refresh") })],
];

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // local dev: any UI origin may call us
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const url = new URL(req.url, "http://localhost");
  const started = Date.now();
  let status = 200, body;
  try {
    const route = routes.find(([m, re]) => m === req.method && re.test(url.pathname));
    if (!route) throw Object.assign(new Error("Not found"), { status: 404 });
    body = await route[2](url.pathname.match(route[1]).slice(1), url.searchParams);
  } catch (err) {
    status = err.status ?? 500;
    body = { error: err.message };
  }
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  console.log(`${req.method} ${url.pathname}${url.search} → ${status} (${Date.now() - started}ms)`);
});

server.listen(PORT, () => console.log(`Recall Radar API on http://localhost:${PORT}/api/retailers`));
