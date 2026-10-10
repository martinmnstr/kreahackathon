import { writeFileSync } from "node:fs";
import { getLatestRecall } from "./fda.js";
import { getCompanyContext } from "./cala.js";
import { generateImage } from "./krea.js";

const recall = await getLatestRecall();
const company = await getCompanyContext(recall.recalling_firm);

// TODO: card text + image prompts (team fills in)
const cards = [
  { type: "recall_alert", text: "", imagePrompt: "" },
  { type: "check_kitchen", text: "", imagePrompt: "" },
  { type: "what_to_do", text: "", imagePrompt: "" },
  { type: "brand_statement", text: "", imagePrompt: "" },
];
for (const card of cards) card.imageUrl = await generateImage(card.imagePrompt);

writeFileSync("output.json", JSON.stringify({ recall, company, cards }, null, 2));
console.log("Wrote output.json");
