# Question CSV import

Add or update questions by editing `questions.csv`, then run:

```powershell
cd server
npm run db:import
```

## CSV columns

| Column | Required | Example |
|---|---|---|
| topic | yes | Geography |
| text | yes | What country is this? |
| optionA | yes | France |
| optionB | yes | Italy |
| optionC | yes | Spain |
| optionD | yes | Germany |
| correct | yes | A |
| image | no | geography/eiffel-tower.svg |

## Images

1. Put files in `server/public/images/`
2. In CSV, set `image` to the path under `images/` (example: `geography/eiffel-tower.jpg`)
3. The import script saves `/images/geography/eiffel-tower.jpg` on the question

Supported formats: `.jpg`, `.png`, `.webp`, `.svg`

## Upsert behavior

- Same `topic` + `text` → updates that question
- New row → creates a new question
- New topic name → creates the topic automatically

## Deploy

1. Commit images + CSV to GitHub
2. Push (Railway serves images from `/images/...`)
3. Run `npm run db:import` locally against Neon, or run it on Railway after deploy
