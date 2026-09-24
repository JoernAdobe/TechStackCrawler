# TechStack Analyzer

AI-powered website technology stack analyzer that identifies technologies, surfaces Adobe product opportunities, and generates tailored use case recommendations for sales and solution-consulting workflows.

Enter any URL, and the tool scrapes the site with Puppeteer, detects its tech stack, analyzes the result with Claude via AWS Bedrock, stores the analysis, and can generate Adobe-oriented use case recommendations.

## Features

- **Instant tech detection** — Scrapes websites with Puppeteer and identifies frameworks, libraries, services, and infrastructure signals.
- **AI-powered analysis** — Uses Claude on AWS Bedrock to categorize technologies, summarize challenges, and map Adobe opportunities.
- **Use case discovery** — Generates prioritized use cases with matching Adobe products, business value, and implementation hints.
- **Adobe opportunity insights** — Frontend dashboard with placement potential, category status, and confidence charts.
- **Usage dashboard** — Admin-only metrics for analyses, estimated time/cost savings, technology frequency, and adoption.
- **Past analyses** — Browse and reopen persisted analyses.
- **Export** — Download analysis output as Excel (`.xlsx`) or Markdown (`.md`).
- **Text-to-speech** — Optional ElevenLabs integration for audio walkthroughs.
- **MCP server** — Model Context Protocol endpoint for AI-agent integration using database-backed bearer tokens.
- **API token management** — Create, list, and revoke MCP bearer tokens from the authenticated dashboard.

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, Recharts, GSAP, Radix UI |
| Backend | Node.js 20, Express, Puppeteer, AWS Bedrock SDK, ElevenLabs SDK, MCP SDK |
| Database | SQLite for local development; MariaDB 11 for Docker/production |
| Auth | Okta OIDC SSO, break-glass dashboard login, MCP bearer tokens |
| Infrastructure | Docker, Docker Compose, Caddy reverse proxy, Makefile deployment scripts |

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────┐
│   Browser   │────▶│  Caddy (:80)                     │
└─────────────┘     │  reverse_proxy → techstack:3001   │
                    └──────────────┬───────────────────┘
┌─────────────┐                    │
│  MCP Agents │────Bearer Token────┤
└─────────────┘                    │
                    ┌──────────────▼───────────────────┐
                    │  Express Server (:3001)           │
                    │  ├─ Static frontend (production)  │
                    │  ├─ REST API routes               │
                    │  ├─ /auth Okta OIDC routes        │
                    │  ├─ /mcp Streamable HTTP endpoint │
                    │  ├─ Puppeteer headless browser    │
                    │  ├─ AWS Bedrock Claude analysis   │
                    │  └─ ElevenLabs TTS (optional)     │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │  MariaDB / SQLite                 │
                    └───────────────────────────────────┘
```

In development, the Vite dev server runs on port `5173` and proxies `/api` requests to the Express server on port `3001`. In production, Express serves the built frontend from `project/client/dist`.

## Project Structure

```text
.
├── README.md                         # This handover-oriented overview
├── Makefile                          # Local dev, Docker, deployment, diagnostics
├── .env.deploy.example               # Template for .env.deploy (make deploy)
├── docs/                             # Deployment, Bedrock setup, archived test reports
├── scripts/backup-db.sh              # Server-side MariaDB backup helper
├── hub/                              # Separate landing hub with its own Caddy/Compose setup
└── project/
    ├── .env.example                  # Environment template; never put real secrets in Git
    ├── Caddyfile                     # Production reverse proxy to the Node app
    ├── docker-compose.yml            # MariaDB + Caddy + techstack app
    ├── package.json                  # npm workspaces and operational scripts
    ├── scripts/
    │   ├── deploy-restore-if-empty.sh
    │   ├── export-local-analyses.ts
    │   ├── rotate-bedrock-key.ts
    │   ├── hash-dashboard-password.ts
    │   ├── test-bedrock-key.ts
    │   └── generate-static-audio.ts
    ├── client/                       # React/Vite application
    └── server/                       # Express API, DB, services, MCP, auth
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- For local development: no database service is required if SQLite is used.
- For AI analysis: either `BEDROCK_API_KEY` or AWS IAM credentials with Bedrock access.
- For Docker/production: Docker and the required MariaDB passwords in the deployment environment.

### Installation

```bash
make install
```

### Configuration

Create `project/.env` from `project/.env.example` and replace all placeholders with environment-specific values. Do not commit `project/.env`.

Minimum local setup with direct Bedrock API-key auth:

```env
BEDROCK_API_KEY=<your-bedrock-api-key>
BEDROCK_ENDPOINT=https://bedrock-runtime.us-west-2.amazonaws.com
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6
BEDROCK_REGION=us-west-2
DB_TYPE=sqlite
```

Alternative Bedrock auth options are AWS IAM credentials (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`) or AWS Secrets Manager via `BEDROCK_SECRET_NAME`.

### Run Locally

```bash
make start
```

This starts the Express server on `http://localhost:3001` and the Vite client on `http://localhost:5173`. In development, SQLite is used automatically when no MariaDB password is configured.

### Build

```bash
make build
```

## Deployment

The main application uses `make deploy`, Docker Compose, and Caddy. The `hub/` landing page is separate and uses `make deploy-hub`.

### Prerequisites

- Docker Desktop running locally when building the deployment image before transfer.
- SSH access to the target host.
- A `.env.deploy` file or inline variables. Required values are `SSH_HOST` and `REMOTE_DIR`; optional values include `HOST_PORT`, `SSH_KEY`, and `CONTAINER_PREFIX`.
- Production database variables in `project/.env`, especially `DB_PASSWORD` and `DB_ROOT_PASSWORD`. `project/docker-compose.yml` intentionally has no default passwords.

### Deploy

```bash
make deploy
```

This will:

1. Create a MariaDB backup on the remote host when the database container is running.
2. Export local SQLite analyses for migration when possible.
3. Build the Docker image locally for `linux/amd64`.
4. Archive project files excluding dependencies, build outputs, and `.env`.
5. Transfer the archive and stream the Docker image to the remote host.
6. Copy `project/.env` to the remote deployment directory if it exists locally.
7. Run `docker compose down` and `docker compose up -d` remotely.
8. Run `project/scripts/deploy-restore-if-empty.sh`, which restores the latest backup only if the target analyses table is empty.
9. Call `/api/health` and compare local and remote commit hashes.

Output includes a commit verification similar to:

```text
>>> Local commit: abc1234
>>> Server commit: abc1234
>>> Commit check: OK
```

### Operational scripts

- `project/scripts/deploy-restore-if-empty.sh` restores the latest database backup only when the `analyses` table is empty and `DB_ROOT_PASSWORD` is available.
- `scripts/backup-db.sh` is a server-side MariaDB dump helper. It requires `DB_ROOT_PASSWORD` and writes timestamped SQL backups to the backup directory configured in the script.
- `project/scripts/rotate-bedrock-key.ts` creates a new Bedrock service-specific credential and updates the configured AWS Secrets Manager secret. Run with `cd project && npm run rotate-bedrock-key` after configuring AWS credentials and rotation variables.

## Environment Variables

The server loads the first available `.env` file from the compiled server-relative project path, the current working directory, or the parent working directory. `project/.env.example` is the source template; keep real values in untracked environment files or a secret manager.

| Variable | Used by | Description | Default / behavior |
|----------|---------|-------------|--------------------|
| `PORT` | server | Express listen port | `3001` |
| `NODE_ENV` | server | Runtime mode | `development`; Docker sets `production` |
| `GIT_COMMIT` | server/Docker | Commit returned by `/api/health` and passed into Docker build | `—` at runtime; Docker build arg defaults to `unknown` |
| `VITE_GIT_COMMIT` | client build | Commit displayed by the frontend footer | Derived from Git during client build when unset |
| `CORS_ORIGIN` | server/Docker | Comma-separated list of allowed cross-origin callers (production) | Unset = same-origin only (no CORS headers); development allows all origins |
| `BEDROCK_API_KEY` | server | Direct Bedrock API-key authentication | Empty; AI calls fail unless this, IAM credentials, or Secrets Manager supplies a key |
| `BEDROCK_SECRET_NAME` | server/scripts | Secrets Manager secret name for loading the Bedrock API key at startup | No runtime default; if unset, Secrets Manager is skipped |
| `BEDROCK_ENDPOINT` | server/scripts | Bedrock runtime endpoint | Server config default is empty; examples/scripts use the regional Bedrock runtime endpoint |
| `BEDROCK_MODEL_ID` | server/scripts | Preferred Claude model ID | Overrides `BEDROCK_MODEL` when set |
| `BEDROCK_MODEL` | server/scripts/Docker | Fallback Claude model ID | `us.anthropic.claude-sonnet-4-6` |
| `BEDROCK_MAX_TOKENS` | server | Max output tokens for Bedrock calls | `8192` |
| `BEDROCK_REGION` | server/scripts | AWS region for Bedrock/Secrets Manager/IAM | Falls back to `AWS_REGION`, then `us-west-2` |
| `AWS_REGION` | server/scripts/Docker | AWS SDK region fallback | `us-west-2` when `BEDROCK_REGION` is unset |
| `AWS_ACCESS_KEY_ID` | server/scripts | IAM auth alternative to `BEDROCK_API_KEY` | Empty |
| `AWS_SECRET_ACCESS_KEY` | server/scripts | IAM auth alternative to `BEDROCK_API_KEY` | Empty |
| `BEDROCK_IAM_USER` | `rotate-bedrock-key` | IAM user for service-specific Bedrock API-key rotation | Script has an environment-specific default; override for handover |
| `BEDROCK_KEY_EXPIRATION_DAYS` | `rotate-bedrock-key` | Expiration period for newly rotated Bedrock API keys | `365` |
| `USE_MOCK_AI` | server/tests | Return mock AI output without calling Bedrock when set to `1` | Disabled |
| `BEDROCK_SKIP_SIMULATE` | server | Skip Bedrock simulation and use mock output when set to `1` | Disabled |
| `PUPPETEER_EXECUTABLE_PATH` | server | Custom Chromium/Chrome path | Unset; Puppeteer-managed browser is used |
| `SCRAPE_TIMEOUT` | server | Page navigation timeout in milliseconds | `60000` |
| `SCRAPE_DEFAULT_LOCALE` | server | Browser locale used during scraping | `en-US` |
| `SCRAPE_DEFAULT_TIMEZONE` | server | Browser timezone used during scraping | `America/New_York` |
| `MULTI_PAGE_CRAWL` | server | Enables sitemap/multi-page enrichment unless set to `0` | Enabled |
| `ELEVENLABS_API_KEY` | server/scripts | ElevenLabs TTS API key | Empty; TTS endpoint reports unavailable |
| `ELEVENLABS_VOICE_ID` | server/scripts | ElevenLabs voice ID | Empty; TTS endpoint reports unavailable |
| `ELEVENLABS_MODEL` | server/scripts/Docker | ElevenLabs model | `eleven_v3` |
| `DB_TYPE` | server | Set to `sqlite` to force SQLite | Auto; SQLite when `DB_TYPE=sqlite`, `DB_PATH` is set, or development has no `DB_PASSWORD` |
| `DB_PATH` | server | SQLite database path | `data/techstack.db` relative to the server working directory |
| `DB_HOST` | server/Docker | MariaDB host | `localhost`; Docker service uses `mariadb` |
| `DB_PORT` | server/Docker | MariaDB port | `3306` |
| `DB_USER` | server/Docker | MariaDB user | `techstack` |
| `DB_PASSWORD` | server/Docker | MariaDB password | Empty; required for production MariaDB and by `docker-compose.yml` |
| `DB_NAME` | server/Docker | MariaDB database name | `techstack_crawler` |
| `DB_ROOT_PASSWORD` | Docker/scripts | MariaDB root password for Compose, backups, and restore | Required by `docker-compose.yml`; no safe default |
| `OKTA_ISSUER` | server/Docker | Okta org issuer, without trailing slash | Adobe org issuer in code; override for any new owner/environment |
| `OKTA_CLIENT_ID` | server/Docker | OIDC client ID | Empty; SSO disabled when incomplete |
| `OKTA_CLIENT_SECRET` | server/Docker | OIDC client secret | Empty; SSO disabled when incomplete |
| `OKTA_REDIRECT_URI` | server/Docker | OIDC callback URL | Empty; SSO disabled when incomplete |
| `OKTA_SCOPES` | server/Docker | OIDC scopes | `openid profile email` |
| `ADMIN_EMAILS` | server/Docker | Comma-separated admin allow-list for dashboard access | Code/Compose include a maintainer fallback; set explicitly during handover |
| `ADMIN_EMAIL` | server | Legacy single-email admin fallback | Used only when `ADMIN_EMAILS` is unset |
| `DASHBOARD_EMAIL` | server/Docker | Break-glass dashboard login email | Empty; break-glass login disabled unless both dashboard variables are set |
| `DASHBOARD_PASSWORD_HASH` | server/Docker | scrypt hash for the break-glass password (`npm run hash-dashboard-password -- '<pw>'`) | Empty; legacy 64-char SHA-256 hex is still accepted but logs a warning |
| `HOST_BIND` | Docker | Host interface for the app port | `0.0.0.0`; set `172.17.0.1` to expose the port only to the hub proxy (see `docs/deployment.md`) |
| `HOST_PORT` | Docker/Makefile | Host port exposed by Caddy for app deployment | `8516` in Compose/Makefile defaults |
| `HOST_PORT_HTTP` | Makefile deploy/restart | Secondary deploy-time port variable passed to Compose commands | `HOST_PORT + 1`; currently not consumed by `project/docker-compose.yml` |
| `CONTAINER_PREFIX` | Docker/scripts/Makefile | Prefix for container names | `techstack-` |
| `SSH_HOST` | Makefile deploy/diagnostics | Remote SSH target | Required for remote commands; do not commit real values |
| `SSH_KEY` | Makefile deploy/diagnostics | Optional SSH key path, relative to repo root | Optional |
| `REMOTE_DIR` | Makefile deploy/restart | Remote deployment directory | Required for `make deploy`; `restart` has a project-specific fallback |
| `SERVICE` | Makefile logs | Docker service suffix for remote logs | `mariadb` |
| `LINES` | Makefile logs | Number of remote Docker log lines | `80` |
| `SIZE` | Makefile tmp-resize | Remote tmpfs size for the diagnostic resize target | `2G` |

## Auth Model

### Okta SSO dashboard access

- `GET /auth/login` starts an OIDC Authorization Code flow.
- `GET /auth/callback` validates `state`, `nonce`, issuer, audience, and the returned `id_token`.
- A successful login creates an in-memory `ts_session` cookie valid for 24 hours.
- Dashboard access requires the authenticated email to be present in `ADMIN_EMAILS`/`ADMIN_EMAIL`.
- `GET /api/dashboard/session` is intentionally public and only reports whether the current cookie maps to an authenticated/admin session.

### Break-glass dashboard login

- `POST /api/dashboard/login` is a fallback for dashboard access when Okta is unavailable.
- It is disabled unless both `DASHBOARD_EMAIL` and `DASHBOARD_PASSWORD_HASH` are set.
- The password hash should be a salted scrypt hash (`scrypt$<salt>$<hash>`), generated with `cd project && npm run hash-dashboard-password -- '<password>'`. Legacy unsalted SHA-256 hashes still work but trigger a startup warning; never store the clear-text password.
- Successful login returns a bearer session token that can also authorize dashboard-protected endpoints.

### MCP bearer tokens

- MCP tokens are created, listed, and revoked through `/api/tokens` endpoints protected by dashboard auth.
- `/mcp` requires `Authorization: Bearer <your-token>` on every request.
- Tokens are stored/validated in the database and may have optional expiration dates.
- MCP Streamable HTTP sessions expire after 30 minutes of inactivity; the server keeps at most 500 active MCP sessions.

## API Endpoints

| Method | Path | Auth | Rate limit | Description |
|--------|------|------|------------|-------------|
| `POST` | `/api/analyze-sync` | Public | 5/minute | Analyze a URL. Body: `{ "url": "https://example.com" }`. |
| `POST` | `/api/use-case-discovery` | Public | 5/minute | Generate use cases. With an `id`, the stored analysis is loaded from the DB (client payload ignored) and the result is persisted; without `id`, the payload is used and nothing is stored. |
| `GET` | `/api/analyses?limit=50` | Public | None | List persisted analyses. `limit` defaults to `50`, max `100`. |
| `GET` | `/api/analyses/:id` | Public | None | Return one persisted analysis by numeric ID. |
| `GET` | `/api/tts/status` | Public | None | Return `{ available: boolean }` based on ElevenLabs config. |
| `POST` | `/api/tts` | Public | 15/minute | Generate MP3 speech. Body: `{ "text": "..." }`, max 5,000 chars. |
| `GET` | `/auth/login` | Public | 100/15 minutes on `/auth/*` | Start Okta login; optional same-site `next` path. |
| `GET` | `/auth/callback` | Public | 100/15 minutes on `/auth/*` | Okta callback; sets `ts_session` cookie. |
| `GET` | `/auth/logout` | Public | 100/15 minutes on `/auth/*` | Destroy current session cookie if present. |
| `GET` | `/api/dashboard/session` | Public | None | Report current dashboard session state. |
| `POST` | `/api/dashboard/login` | Public | 5 failed attempts/15 minutes | Break-glass login; returns a dashboard session bearer token. |
| `GET` | `/api/dashboard/stats` | Dashboard admin | None | Return dashboard metrics and aggregates. |
| `POST` | `/api/tokens` | Dashboard admin | None | Create MCP API token. Body: `{ "name": "...", "expiresAt"?: "YYYY-MM-DD" }`. |
| `GET` | `/api/tokens` | Dashboard admin | None | List MCP API tokens metadata. |
| `DELETE` | `/api/tokens/:id` | Dashboard admin | None | Revoke an MCP API token by numeric ID. |
| `POST` | `/mcp` | MCP bearer token | 50 failed auth attempts/15 minutes | MCP initialize/tool requests over Streamable HTTP. |
| `GET` | `/mcp` | MCP bearer token | 50 failed auth attempts/15 minutes | MCP server-to-client stream for an existing MCP session. |
| `DELETE` | `/mcp` | MCP bearer token | 50 failed auth attempts/15 minutes | Close an MCP session. |
| `GET` | `/api/health` | Public | None | Health check with timestamp and commit hash. |
| `GET` | `/api/bedrock-status` | Public | None | Report Bedrock auth mode (`api-key`, `iam`, or `none`) and model. |

Unknown `/api/*` paths return JSON 404. In production, non-API paths fall through to the built React app.

## MCP Server (Agent Integration)

The TechStack Analyzer exposes a [Model Context Protocol](https://modelcontextprotocol.io/) endpoint at `/mcp`, allowing AI agents (Claude Desktop, Cursor, custom agents) to use the analyzer programmatically.

### Available MCP Tools

| Tool | Description | Input |
|------|-------------|-------|
| `analyze-url` | Analyze a website's technology stack | `{ url: string }` |
| `list-analyses` | List saved analyses | `{ limit?: number }` |
| `get-analysis` | Get full analysis details by ID | `{ id: number }` |
| `use-case-discovery` | Generate Adobe use cases for an analysis | `{ analysisId: number }` |

### Setup

1. Open the admin dashboard at `#/dashboard` and navigate to "MCP API Tokens"
2. Create a new token and copy it (shown only once)
3. Configure your MCP client:

```json
{
  "mcpServers": {
    "techstack-analyzer": {
      "url": "https://your-domain.example/mcp",
      "headers": {
        "Authorization": "Bearer tsa_your-token-here"
      }
    }
  }
}
```

Tokens can be revoked at any time through the dashboard. Expired or revoked tokens are rejected with HTTP 401.

## Available Commands

| Command | Description |
|---------|-------------|
| `make` / `make help` | Show available Makefile targets. |
| `make install` | Install npm workspace dependencies under `project/`. |
| `make start` | Start development server and client (`npm run dev`). |
| `make dev-start` | Same as `make start`. |
| `make stop` | Stop local processes on ports `5173` and `3001`. |
| `make dev-stop` | Same as `make stop`. |
| `make build` | Build client and server. |
| `make docker-up` | Build and start Docker Compose locally. |
| `make docker-down` | Stop Docker Compose containers. |
| `make docker-build` | Build the Docker Compose image. |
| `make deploy` | Build, transfer, deploy, restore-if-empty, and health-check the main app remotely. |
| `make deploy-hub` | Deploy the separate `hub/` landing page. |
| `make status` | Show remote container status and selected deployment diagnostics. Requires `SSH_HOST`. |
| `make logs` | Show remote Docker logs. Optional `SERVICE=<service>` and `LINES=<n>`. |
| `make restart` | Restart remote main app containers and show health status. Requires `SSH_HOST`. |
| `make server-mem` | Show remote memory and mount status. Requires `SSH_HOST`. |
| `make tmp-inspect` | Inspect remote temporary storage usage. Requires `SSH_HOST`. |
| `make tmp-clean` | Remove only known deploy artifacts from remote temporary storage. Requires `SSH_HOST`. |
| `make tmp-resize SIZE=2G` | Resize remote temporary storage mount. Requires `SSH_HOST` and appropriate privileges. |

Additional npm scripts are available under `project/package.json`, including `test:connections`, `test-bedrock-key`, `rotate-bedrock-key`, `export-for-deploy`, and `generate-static-audio`.

## Security & Operations

- **Secrets handling**: Keep real secrets in untracked `.env` files, deployment secret stores, or AWS Secrets Manager. Never commit `project/.env`, `.env.deploy`, Bedrock keys, Okta client secrets, database passwords, or MCP tokens.
- **Admin allow-list**: Set `ADMIN_EMAILS` explicitly for the owning team. Do not rely on repository-maintainer fallbacks during handover.
- **CORS**: Production allows same-origin only by default. Set `CORS_ORIGIN` only if another origin must call the API from a browser.
- **TLS**: TLS terminates in the hub Caddy (`hub/Caddyfile`, certificates mounted from the server, not in Git), which also sets HSTS and the CSP for `techstack.corp.adobe.com`.
- **Database passwords**: Docker Compose requires `DB_PASSWORD` and `DB_ROOT_PASSWORD`; generate strong unique values for each environment.
- **Bedrock key rotation**: Prefer `BEDROCK_SECRET_NAME` plus `npm run rotate-bedrock-key` from `project/` for controlled rotation. Restart the app after rotation so it reloads the secret.
- **Backups**: `make deploy` attempts a remote MariaDB backup before deployment. `scripts/backup-db.sh` can be run manually on the server. Verify backups periodically by restoring into a non-production database.
- **Restore behavior**: `deploy-restore-if-empty.sh` restores only when the target analyses table is empty, reducing accidental overwrite risk.
- **Logs**: Local development logs go to the terminal running `make start`. Production container logs are available through Docker; use `make logs SERVICE=techstack`, `make logs SERVICE=mariadb`, or `make logs SERVICE=caddy` when `SSH_HOST` is configured.
- **Sessions**: Dashboard sessions are in-memory and last 24 hours. Restarting the server logs users out. MCP sessions are in-memory and last 30 minutes after last activity.
- **Public endpoints**: Analysis, TTS, health, Bedrock status, and historical analysis reads are public at the API layer. Put the service behind the intended network boundary or reverse-proxy controls if that is not acceptable for the new owner.
- **SSRF protection**: Every crawler request (main frame and all sub-resources) is checked against private/reserved IP ranges, the actual remote IP of responses is verified, and server-side fetches (sitemaps, sub-pages) are pinned to the validated IP. Keep this boundary intact when changing crawler behavior.

## Further Documentation

| Document | Content |
|----------|---------|
| `docs/deployment.md` | Production topology (hub proxy, ports, TLS), server `.env`, recommended hardening |
| `docs/bedrock-setup.md` | Bedrock access via IAM credentials or API key |
| `docs/archive/` | Historical test reports (Feb 2026) and a generic multi-project deployment guide from a sibling app; kept for reference only, may be outdated |

## Known Risks / Open Items

- **Core API is not authenticated**: `/api/analyze-sync`, `/api/use-case-discovery`, `/api/analyses*` and `/api/tts` are reachable by anyone who can reach the service (Adobe corp network). Only the dashboard, token management and `/mcp` require auth. Decide whether to require Okta login for all users.
- **Chromium runs with `--no-sandbox`** in the container while rendering untrusted websites. A renderer exploit would run as the `node` user with access to the app's environment secrets. Mitigations: rebuild the image regularly (Chromium updates), enable the Chrome sandbox via a seccomp profile, or move the crawler into a separate container without secrets.
- **Network egress (required before wider rollout)**: App-level SSRF checks block all intercepted browser requests and pin server-side fetches, but cannot fully close channels outside Puppeteer's interception (e.g. WebSockets from script-created `about:blank` iframes) or the first request of a DNS-rebinding attack. An egress firewall for the app container (block RFC1918, `100.64.0.0/10`, `169.254.0.0/16`, and the Docker host `172.17.0.1`) is **mandatory** to fully mitigate SSRF.
- **App port reachable over plain HTTP**: Port 8516 is bound on all interfaces by default. Set `HOST_BIND=172.17.0.1` and adjust the deploy health check (see `docs/deployment.md`).
- **Dependencies**: `npm audit` reports known vulnerabilities (mostly transitive; `xlsx` from npm has no upstream fix — switch to the official SheetJS tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`). Run `npm audit` and update before production changes.
- **Git history**: An old, no longer valid hard-coded dashboard password exists in the commit history (removed in `ddd8c2c`). It has no effect on current code; rewrite history if the repository is shared more widely.

## Handover / Ownership Notes

- Assign a new owner for Okta app configuration, Bedrock access, AWS Secrets Manager, database credentials, and deployment SSH access.
- Replace all maintainer-specific defaults in environment files with team-owned values before production use.
- Decide whether public read/analyze endpoints are acceptable or whether the new owner wants authentication in front of the full app.
- Keep `project/.env.example` synchronized whenever new `process.env` usage is added.
- Rotate Bedrock, Okta, database, and MCP credentials during ownership transfer.
- Confirm the backup/restore process with a test restore before the first team-managed deployment.
- Hand over the repository via `git clone` only — never as a copied folder or ZIP, since local working copies contain untracked secrets (`project/.env`, `.env.deploy`, SSH keys).
- The TLS certificates for the hub live only on the server (`/opt/ssl`); back them up before migrating the host.
- Work through **Known Risks / Open Items** above.

## License

Internal Adobe tool — not for public distribution.
