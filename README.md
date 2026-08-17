# Quiz Cream

A real-time trivia quiz app — play solo or battle another player 1v1, 7 questions, 7 seconds each.

**Live app:** [quizcream-production.up.railway.app](https://quizcream-production.up.railway.app)

## Features

- Solo practice mode
- 1v1 real-time battles via Socket.io matchmaking
- Sign in with Google or email/password (JWT-based sessions)
- Live score tracking and post-quiz score breakdown

## Tech stack

- Node.js / Express backend with Socket.io
- PostgreSQL via Prisma ORM
- Vanilla HTML/CSS/JS frontend
- Deployed on Railway

## Project structure

```
index.html          # standalone frontend entry point
server/
  index.js          # Express + Socket.io server
  auth/              # Google OAuth, JWT, password handling
  routes/            # HTTP routes (auth, etc.)
  middleware/        # auth middleware
  game/              # match manager, questions, scoring
  matchmaking/        # matchmaking queue
  prisma/            # schema and migrations
  public/            # served frontend
```

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `server/.env.example` to `server/.env` and fill in `DATABASE_URL`, `JWT_SECRET`, and `GOOGLE_CLIENT_ID`.
3. Run database migrations:
   ```bash
   npm run db:migrate
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
