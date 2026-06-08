# daemon code

> A daily AI-powered game where your daemon — a statistical model of your own behaviour — runs endlessly beneath the surface.

**Live:** [daemoncode.app](https://daemoncode.app)

---

## What it does

daemon code is a daily self-awareness app built around a simple idea: your behaviour under pressure is measurable, and the patterns are more consistent than you think.

Each day you play a short session of adaptive mini-games — reaction tests, instinct probes, decision-under-pressure tasks. The daemon watches how you respond: not what you say about yourself, but what you actually do.

- **Daily sessions** — 5 mini-games per day, each designed to surface instinct rather than intention
- **Nightly analysis** — an AI pipeline runs while you sleep, reading your session data and producing a behavioural observation narrated in audio
- **Shadow prompt** — one question derived from your session, carried into your day unanswered
- **Process Log** — a live map of your active behavioural patterns (approval loops, avoidance cycles, performance drift) with states that shift as you change
- **The Chronicle** — every observation the daemon has ever written about you, in order
- **Voice** — the daemon speaks, in a tone matched to your psychological archetype

The daemon is always running. You just check in.

---

## Architecture

```
User → Cloudflare Pages (React PWA)
          ↓ HTTPS
     API Gateway v2 (HTTP API)
          ↓
     Lambda: api  (Go — auth, session, home, push)
          ↓ SQS trigger (nightly EventBridge cron)
     Lambda: orchestrator
          ↓ SQS
     Lambda: analyst      → Claude Sonnet 4.6 (pattern analysis, Mirror Method output)
          ↓ EventBridge
     Lambda: narrator     → Claude Sonnet 4.6 + AWS Polly Neural (prose + shadow prompt + audio)
     Lambda: deckgen      → rule-based (archetype-tailored fragment queue, 5 fragments/day)
     Lambda: notifier     → Web Push
          ↓
     DynamoDB (shadow state + daily decks)
     RDS PostgreSQL (users, sessions, card responses)
     S3 (narration audio)
     Secrets Manager (JWT, Anthropic, VAPID keys)
```

All infrastructure is managed with **Terraform** and deployed via **GitHub Actions** (OIDC, no stored credentials).

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Framer Motion |
| Backend | Go 1.22, net/http, sqlc, pgx |
| AI | Anthropic Claude Sonnet 4.6 |
| TTS | AWS Polly (Neural engine) |
| Database | RDS PostgreSQL + DynamoDB |
| Infra | Terraform, AWS Lambda, API Gateway v2, SQS, EventBridge |
| CDN / Hosting | Cloudflare Pages |
| CI/CD | GitHub Actions (OIDC → AWS) |
| Observability | AWS X-Ray, CloudWatch dashboard |

---

## Key engineering decisions

**Go for the backend** — Lambda cold starts matter at low traffic volumes. A Go binary with no framework overhead starts in ~50ms vs ~500ms for Node with a framework. Each Lambda is a single statically linked binary compiled from a dedicated `cmd/` entry point.

**Separate Lambda per pipeline stage** — Analyst, Narrator, DeckGen, and Notifier each run independently, connected by SQS and EventBridge. This makes retries, timeouts, and cost attribution clean. A failed narration doesn't block deck generation.

**sqlc for type-safe SQL** — No ORM. Queries are written in plain SQL and compiled to type-safe Go functions. Schema changes are caught at compile time, not at runtime.

**DynamoDB for hot state** — Session state, push subscriptions, and daily decks live in DynamoDB for single-digit millisecond reads. Relational data (users, card responses, pattern history) lives in PostgreSQL.

**Cloudflare Pages for hosting** — Global CDN, automatic preview deployments per branch, zero-config HTTPS.

**OIDC for CI/CD** — GitHub Actions assumes an AWS IAM role via OIDC federation. No long-lived access keys are stored anywhere.

---

## Project structure

```
daemon-code/
├── backend/
│   ├── cmd/              # Lambda entry points (api, analyst, narrator, deckgen, …)
│   ├── internal/
│   │   ├── handlers/     # HTTP handlers (auth, session, home, push, …)
│   │   ├── services/     # AI, deck generation, narration, push notification
│   │   ├── dynamo/       # DynamoDB client
│   │   ├── db/           # sqlc-generated PostgreSQL layer
│   │   ├── middleware/   # Auth (JWT), CORS, logging
│   │   └── config/       # Environment-driven config
├── frontend/
│   ├── src/
│   │   ├── screens/      # Route-level components (Home, Session, Onboarding, …)
│   │   ├── components/   # Daemon orb, mini-games, UI primitives
│   │   ├── hooks/        # useAuth, usePushPrompt, useCompileAnimation, …
│   │   └── lib/          # API client, constants, copy, haptics
└── terraform/
    ├── environments/dev/
    └── modules/          # compute, data, security/iam, observability/cloudwatch
```

---

## Running locally

**Backend**
```bash
cp .env.local.example .env.local   # fill in secrets from AWS Secrets Manager
source .env.local
go run ./backend/cmd/localserver   # run from repo root, not from inside backend/
```

**Frontend**
```bash
cd frontend
cp .env.local.example .env.local   # defaults to http://localhost:8080
npm install
npm run dev
```

No Docker or local emulators needed. The local server connects directly to live dev AWS resources (RDS is publicly accessible in dev; DynamoDB/SQS/EventBridge are API-based). See `docs/local-dev.md` for the full setup guide including how to retrieve secrets from Secrets Manager.

---

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `ci-backend` | PR / push | `go build`, `go vet`, `go test`, `gofmt` check |
| `ci-frontend` | PR / push | `tsc`, `eslint`, Vite build |
| `cd-backend` | push to main | Builds Go binaries, zips, deploys to Lambda |
| `tf-plan` | PR | Terraform plan, posts diff as PR comment |
| `tf-apply` | manual dispatch | Terraform apply (requires `confirm=APPLY`) |

