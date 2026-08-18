# Question CSV import (URL-only images)

Edit `questions.csv`, then run:

```powershell
cd server
npm run db:import
```

## CSV columns

| Column | Required | Example |
|---|---|---|
| topic | yes | Flags |
| text | yes | Which country is this flag? |
| optionA | yes | France |
| optionB | yes | Germany |
| optionC | yes | Italy |
| optionD | yes | Spain |
| correct | yes | A |
| imageUrl | no | https://res.cloudinary.com/.../flags-france.png |

Leave `imageUrl` empty for text-only questions.

## Image URLs (no local files)

1. Upload images to **Cloudinary**, **S3**, **ImgBB**, etc.
2. Copy the **https://** URL
3. Paste it in the `imageUrl` column on the same row as the question

The URL **is** the link — same row = that image shows for that question.

## Naming URLs for easy tagging

Use predictable names when you upload:

```
https://res.cloudinary.com/your-cloud/image/upload/quizcream/flags-france.png
https://res.cloudinary.com/your-cloud/image/upload/quizcream/flags-japan.png
https://res.cloudinary.com/your-cloud/image/upload/quizcream/flags-brazil.png
```

You can see the country in the URL — easy to match when editing the CSV.

## Example flag row

```csv
Flags,Which country is this flag?,France,UK,Germany,Italy,A,https://res.cloudinary.com/you/image/upload/quizcream/flags-france.png
```

## Upsert behavior

- Same `topic` + `text` → updates that question
- New row → creates a new question
- New topic name → creates the topic automatically

No GitHub image folders needed. Push code only; images live on your CDN.
