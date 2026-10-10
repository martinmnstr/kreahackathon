// TODO: generate the 4 card texts + a Krea image prompt per card
// (process.env.ANTHROPIC_API_KEY)
export async function writeCards(recall, company) {
  return [
    { type: "recall_alert", title: "RECALL ALERT", text: recall.reason_for_recall, imagePrompt: "" },
    { type: "check_kitchen", title: "CHECK YOUR KITCHEN", text: recall.code_info, imagePrompt: "" },
    { type: "what_to_do", title: "WHAT TO DO", text: "Stop using, check lot numbers, return for refund, contact company", imagePrompt: "" },
    { type: "brand_statement", title: "OUR STATEMENT", text: `${company.name} is committed to consumer safety.`, imagePrompt: "" },
  ];
}
