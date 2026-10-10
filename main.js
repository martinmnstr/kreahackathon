import { writeFileSync } from "node:fs";
import { getLatestRecall } from "./fda.js";
import { getCompanyContext } from "./cala.js";
import { writeCards } from "./llm.js";
import { generateImage } from "./krea.js";

const recall = await getLatestRecall();
const company = await getCompanyContext(recall.recalling_firm);
const cards = await writeCards(recall, company);
for (const card of cards) card.imageUrl = await generateImage(card.imagePrompt);

const result = { recall, company, cards };
writeFileSync("output.json", JSON.stringify(result, null, 2));
console.log("Wrote output.json");
