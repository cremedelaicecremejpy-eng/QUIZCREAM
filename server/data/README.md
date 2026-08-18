# Question format for Neon / CSV import

## Required every row
- `topic` — e.g. Flags
- `correct` — A, B, C, or D

## Question (at least one)
- `text` — question words (can be **empty** if you only show an image)
- `imageUrl` — full https URL for question image (flag, photo, etc.)

## Each option A–D (each needs text **or** image URL, or both)
- `optionA` … `optionD` — answer text (can be empty if image URL provided)
- `optionAImageUrl` … `optionDImageUrl` — full https URL for image answers

## Mix and match examples

**Image question + text options (flags quiz):**
```
text: "Which country is this flag?"
imageUrl: https://.../flag-france.svg
optionA-D: country names
option image URLs: empty
```

**Image-only question + text options:**
```
text: (empty)
imageUrl: https://.../flag-france.svg
optionA-D: country names
```

**Text question + image options:**
```
text: "Which flag is France?"
imageUrl: (empty)
optionA: (empty)
optionAImageUrl: https://.../flag-france.svg
```

Text-only questions still work with everything empty except option text.

## CSV header

```csv
topic,text,optionA,optionB,optionC,optionD,correct,imageUrl,optionAImageUrl,optionBImageUrl,optionCImageUrl,optionDImageUrl
```

Import: `npm run db:import`

## Neon Question table columns

| Column | Purpose |
|---|---|
| text | Question words (optional if imageUrl set) |
| imageUrl | Question image |
| optionA–D | Answer text (optional if option image set) |
| optionAImageUrl–optionDImageUrl | Answer images |
| correctOption | A, B, C, or D |
