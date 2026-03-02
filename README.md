# TechStack Analyzer

AI-powered website technology stack analyzer that identifies technologies, surfaces Adobe product opportunities, and generates tailored use case recommendations — built for Adobe Sales teams.

Enter any URL, and the tool will scrape the site, detect its tech stack (CMS, analytics, eCommerce, CDN, etc.), analyze it with Claude (AWS Bedrock), and produce a structured report with Adobe placement opportunities.

## Features

- **Instant Tech Detection** — Scrapes any website with Puppeteer and identifies frameworks, libraries, and services
- **AI-Powered Analysis** — Claude (via AWS Bedrock) categorizes technologies, identifies challenges, and maps Adobe product opportunities
- **Use Case Discovery** — Generates top 10 use cases with matching Adobe products, business value, and implementation hints
- **Adobe Opportunity Insights** — Visual dashboard with placement potential gauge, category status, and confidence distribution charts
- **Usage Dashboard** — ROI tracking with time savings, analysis stats, technology frequency, and adoption metrics
- **Past Analyses** — Browse, revisit, and compare previous analyses with favicons and timestamps
- **Export** — Download results as Excel (.xlsx) or Markdown (.md)
- **Text-to-Speech** — Optional ElevenLabs integration for voice-assisted walkthroughs
- **Rate Limiting** — 5 analysis requests/min, 15 TTS requests/min

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, Recharts, GSAP, Radix UI |
| Backend | Node.js 20, Express, Puppeteer, AWS Bedrock SDK |
| Database | SQLite (development) / MariaDB 11 (production) |
| Infrastructure | Docker, Docker Compose, Caddy reverse proxy |

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────┐
│   Browser    │────▶│  Caddy (:80)                     │
└─────────────┘     │  reverse_proxy → techstack:3001   │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │  Express Server (:3001)           │
                    │  ├─ Static frontend (prod)        │
                    │  ├─ Puppeteer (headless Chrome)   │
                    │  ├─ Tech detection engine         │
                    │  ├─ AWS Bedrock (Claude)          │
                    │  └─ ElevenLabs TTS (optional)     │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │  MariaDB / SQLite                 │
                    └──────────────────────────────────┘
```

In development, the Vite dev server runs on port 5173 and proxies `/api` requests to the Express server on port 3001. In production, Express serves the built frontend from `client/dist`.

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- An AWS Bedrock API key or IAM credentials with access to Claude

### Installation

```bash
make install
```

### Configuration

Create `project/.env` with at minimum:

```env
# Required: one of these auth methods
BEDROCK_API_KEY=your-api-key
# or
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret

# Optional
BEDROCK_MODEL=us.anthropic.claude-sonnet-4-6
BEDROCK_REGION=us-west-2
ELEVENLABS_API_KEY=your-key
ELEVENLABS_VOICE_ID=your-voice-id
```

### Run Locally

```bash
make start
```

Opens the client at `http://localhost:5173` with the API server on port 3001. Uses SQLite by default in development — no database setup needed.

### Build

```bash
make build
```

## Deployment

The project ships with a full Docker-based deployment pipeline via `make deploy`.

### Prerequisites

- Docker Desktop running locally (for cross-compilation to `linux/amd64`)
- SSH access to the target server
- A `.env.deploy` file or inline variables:

```env
SSH_HOST=user@your-server
REMOTE_DIR=/opt/techstack-crawler
HOST_PORT=8516
# SSH_KEY=path/to/key (optional)
```

### Deploy

```bash
make deploy
```

This will:

1. Create a database backup on the server
2. Build the Docker image locally (`linux/amd64`)
3. Export and transfer the image + project files via SCP
4. Start the containers with `docker compose up -d`
5. Run a health check and verify the deployed commit matches

Output includes a commit verification:

```
>>> Lokaler Commit: abc1234
>>> Server-Commit: abc1234
>>> Commit-Check: OK (lokal = server)
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BEDROCK_API_KEY` | AWS Bedrock API key | — |
| `BEDROCK_ENDPOINT` | Custom Bedrock endpoint | Auto |
| `BEDROCK_MODEL` | Claude model ID | `us.anthropic.claude-sonnet-4-6` |
| `BEDROCK_REGION` | AWS region | `us-west-2` |
| `AWS_ACCESS_KEY_ID` | IAM auth (alternative to API key) | — |
| `AWS_SECRET_ACCESS_KEY` | IAM auth | — |
| `BEDROCK_SECRET_NAME` | AWS Secrets Manager key name | — |
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `DB_TYPE` | Force `sqlite` | Auto-detected |
| `DB_PATH` | SQLite file path | `data/techstack.db` |
| `DB_HOST` | MariaDB host | `localhost` |
| `DB_PORT` | MariaDB port | `3306` |
| `DB_USER` | MariaDB user | `techstack` |
| `DB_PASSWORD` | MariaDB password | — |
| `DB_NAME` | Database name | `techstack_crawler` |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS key | — |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice | — |
| `ELEVENLABS_MODEL` | ElevenLabs model | `eleven_v3` |
| `PUPPETEER_EXECUTABLE_PATH` | Custom Chromium path | Bundled |
| `SCRAPE_TIMEOUT` | Page load timeout (ms) | `60000` |
| `CORS_ORIGIN` | Allowed CORS origin (production) | `*` |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/analyze-sync` | Analyze a URL (`{ url }`) |
| `POST` | `/api/use-case-discovery` | Generate use cases for an analysis |
| `GET` | `/api/analyses` | List all past analyses |
| `GET` | `/api/analyses/:id` | Get a single analysis |
| `GET` | `/api/tts/status` | Check TTS availability |
| `POST` | `/api/tts` | Generate speech (`{ text }`) |
| `POST` | `/api/dashboard/login` | Dashboard login |
| `GET` | `/api/dashboard/stats` | Dashboard statistics (auth required) |
| `GET` | `/api/health` | Health check (returns commit hash) |
| `GET` | `/api/bedrock-status` | Bedrock auth status |

## Available Commands

| Command | Description |
|---------|-------------|
| `make install` | Install dependencies |
| `make start` | Start development servers |
| `make stop` | Stop development servers |
| `make build` | Build client and server |
| `make docker-up` | Start with Docker locally |
| `make docker-down` | Stop Docker containers |
| `make deploy` | Build, transfer, and deploy to remote server |

## License

Internal Adobe tool — not for public distribution.
