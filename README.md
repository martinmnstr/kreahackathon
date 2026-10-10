# Recall Radar 🚨

FDA recall → Cala company context → LLM card text → Krea images → 4 social cards.

```bash
cp .env.example .env   # add your keys
npm start              # writes output.json
```

Needs Node 22+. No dependencies.

| File | What | Who |
|------|------|-----|
| `fda.js` | latest recall from openFDA (works) | |
| `cala.js` | company context | Cala team |
| `llm.js` | 4 card texts + image prompts | |
| `krea.js` | card images | Krea team |
| `main.js` | glues it together | |

**Lovable:** build the UI in Lovable and use `output.json` as the data (paste it in as mock data for now).
