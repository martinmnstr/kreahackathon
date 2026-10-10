// Try Cala questions from the terminal:
//   npm run cala -- "Which food products sold at Kroger were recalled in September 2026? Return name, recall_date"
//   npm run cala -- --search "What did Flowers Foods say about the Hawaiian bread recall?"
//   npm run cala -- --entity "Flowers Foods"
import * as cala from "../src/sources/cala.js";

const [flag, ...rest] = process.argv.slice(2);
const t = Date.now();
if (flag === "--search") {
  console.log(JSON.stringify(await cala.search(rest.join(" ")), null, 2));
} else if (flag === "--entity") {
  const { entities = [] } = await cala.searchEntities(rest.join(" "));
  console.table(entities.map(({ id, name, entity_type }) => ({ id, name, entity_type })));
  if (entities[0]) console.log(await cala.getEntity(entities[0].id));
} else {
  const { rows, entities, errors } = await cala.query([flag, ...rest].join(" "));
  if (errors.length) console.log("Cala refused:", errors);
  console.table(rows);
  console.log(`${entities.length} entities:`, entities.map((e) => `${e.name} (${e.entity_type})`).join(", "));
}
console.log(`\n${Date.now() - t}ms`);
