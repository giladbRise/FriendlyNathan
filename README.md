<p align="center">
  <img src="https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png" alt="n8n" width="80"/>
</p>

<h1 align="center">
  <br/>
  Friendly Nathan
  <br/>
  <sub><sup>Your AI Workflow Buddy for n8n</sup></sub>
</h1>

<p align="center">
  <strong>Describe what you want. Nathan builds it. One click to deploy.</strong>
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Get_Started-FF6D5A?style=for-the-badge&logoColor=white" alt="Get Started"/></a>
  <a href="#-how-it-works"><img src="https://img.shields.io/badge/How_It_Works-4285F4?style=for-the-badge&logoColor=white" alt="How It Works"/></a>
  <a href="#-features"><img src="https://img.shields.io/badge/Features-00BFA5?style=for-the-badge&logoColor=white" alt="Features"/></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Google_Gemini-4285F4?style=flat-square&logo=google&logoColor=white" alt="Gemini"/>
  <img src="https://img.shields.io/badge/n8n-FF6D5A?style=flat-square&logo=n8n&logoColor=white" alt="n8n"/>
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker"/>
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
</p>

<br/>

<p align="center">
  <img src="post-fixes-verification.png" alt="Friendly Nathan UI" width="380"/>
</p>

<br/>

---

<br/>

## The Problem

Building n8n workflows means dragging nodes, configuring parameters, connecting things together, and reading docs for every integration. It works, but it's slow.

## The Solution

Talk to Nathan instead.

> *"Every morning at 9am, check my Gmail for unread emails with attachments, save them to Google Drive, and log a row in Google Sheets"*

Nathan turns that sentence into a **complete, deployable n8n workflow** with all the nodes, connections, parameters, and credential placeholders configured. Then deploys it to your n8n instance with one click.

<br/>

---

<br/>

## How It Works

```
 YOU                           NATHAN                         YOUR n8n
  |                              |                              |
  |   "Send me a daily           |                              |
  |    Gmail summary"            |                              |
  |  --------------------------> |                              |
  |                              |  1. Analyze with Gemini AI   |
  |                              |  2. Discover available nodes  |
  |                              |  3. Build workflow JSON       |
  |                              |  4. Detect & fix gaps         |
  |                              |  5. Validate everything       |
  |      Live progress updates   |                              |
  |  <~~~~~~~~~~~~~~~~~~~~~~~~   |                              |
  |                              |                              |
  |   "Looks good, deploy!"     |                              |
  |  --------------------------> |  --------------------------> |
  |                              |     Deploy via n8n API       |
  |                              |                              |
  |      "It's live!"          |  <--------------------------- |
  |  <------------------------  |     Workflow URL returned     |
```

<br/>

### 4 Steps, Zero Drag-and-Drop

| Step | What You Do | What Nathan Does |
|:----:|-------------|-----------------|
| **1** | Enter your n8n URL + API key | Validates the connection |
| **2** | Describe your workflow in plain English | Analyzes intent with Gemini AI |
| **3** | Watch the live progress bar | Builds nodes, connections, parameters, runs gap detection, validates |
| **4** | Click "Deploy" | Pushes to your n8n instance, returns the direct URL |

<br/>

---

<br/>

## Features

### Core

| | Feature | Details |
|-|---------|---------|
| **AI** | Natural Language to Workflow | Gemini AI understands your description and maps it to the right n8n nodes |
| **QA** | Auto-Improvement | Detects missing triggers, incomplete outputs, vague configs. Up to 3 refinement passes. |
| **RT** | Live Progress | WebSocket-powered real-time updates as your workflow is being built |
| **1C** | One-Click Deploy | Push directly to any n8n instance. Credential placeholders auto-configured. |

### Smart Defaults

Nathan automatically handles things you'd normally configure manually:

- **Missing trigger?** Adds Schedule, Webhook, or Manual trigger based on your description
- **No output node?** Adds Gmail, Sheets, or notification nodes where appropriate
- **Need AI?** Sets up the full LangChain chain+model pattern with Gemini
- **Credential placeholders** are pre-configured so you just fill in the values in n8n

### 10 Ready-Made Templates

Skip the description entirely. Pick a template, customize the fields, deploy.

| Category | Templates | Examples |
|----------|:---------:|---------|
| Email Automation | 3 | Gmail daily digest, email-to-spreadsheet, attachment saver |
| Data Collection | 2 | Webhook receiver, form submission processor |
| Reporting | 1 | Scheduled daily report with Google Sheets |
| Monitoring | 1 | API health checks with alert notifications |
| AI Processing | 1 | Content summarization with Gemini |
| Data Sync | 1 | Cross-platform data synchronization |
| Notifications | 1 | Multi-channel alert routing |

<br/>

---

<br/>

## Quick Start

### Prerequisites

| Requirement | Minimum | Get It |
|-------------|---------|--------|
| Node.js | v20+ | [nodejs.org](https://nodejs.org/) |
| npm | v10+ | Comes with Node.js |
| PostgreSQL | v15+ | [postgresql.org](https://www.postgresql.org/) or use Docker |
| Gemini API Key | Free tier | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| n8n Instance | Any version | [n8n.io](https://n8n.io/) (cloud or self-hosted) |

### Option A: Local Development

```bash
# 1. Clone & install
git clone https://github.com/giladbRise/MCP-n8n.git
cd MCP-n8n
npm install

# 2. Configure environment
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your values:

```env
# Required
DATABASE_URL=postgresql://postgres:password@localhost:5432/n8n_workflow_builder
JWT_SECRET=your-secure-random-string-minimum-32-chars
ENCRYPTION_KEY=your-32-char-hex-key
GEMINI_API_KEY=your-gemini-api-key

# Optional (defaults shown)
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

> Generate secure keys:
> ```bash
> # JWT_SECRET
> node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
> # ENCRYPTION_KEY
> node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
> ```

```bash
# 3. Set up database
cd backend
npx prisma migrate dev
cd ..

# 4. Start everything
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | [localhost:5173](http://localhost:5173) |
| Backend API | [localhost:3000](http://localhost:3000) |
| Health Check | [localhost:3000/health](http://localhost:3000/health) |

### Option B: Docker

```bash
# One command to rule them all
docker-compose up --build

# Or in background
docker-compose up -d
```

Docker Compose starts PostgreSQL, Backend, and Frontend automatically. Database migrations run on first boot.

<br/>

---

<br/>

## Connecting to n8n

1. Open your n8n instance
2. Go to **Settings > API > Create API Key**
3. In Nathan, click **"Set up your n8n connection"**
4. Enter your n8n URL and API key
5. Nathan validates the connection before you can generate

Works with both **n8n Cloud** and **self-hosted** instances.

<br/>

---

<br/>

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    FRIENDLY NATHAN                        │
├──────────────┬──────────────────────┬────────────────────┤
│   FRONTEND   │      BACKEND         │    MCP SERVER      │
│              │                      │                    │
│  React 18    │  Express + TS        │  Model Context     │
│  Vite 5      │  Prisma ORM          │  Protocol          │
│  TailwindCSS │  Socket.io           │                    │
│  Motion      │  Gemini AI           │  Node catalog      │
│  Socket.io   │  Gap Detector        │  caching           │
│              │  Rate Limiting        │                    │
│  :5173       │  :3000               │  stdio              │
└──────┬───────┴──────────┬───────────┴────────────────────┘
       │                  │
       │  HTTP + WS       │  REST API
       │                  │
       ▼                  ▼
   Browser            n8n Instance
                    (cloud or self-hosted)
```

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React, TypeScript, TailwindCSS, Vite, Motion | 18.2, 5.3, 3.4, 5.0, 12.33 |
| **Backend** | Express, TypeScript, Prisma, Socket.io | 4.18, 5.3, 5.8, 4.6 |
| **AI** | Google Gemini (gemini-3-flash-preview) | Latest |
| **Database** | PostgreSQL + Prisma ORM | 15+ |
| **Security** | Helmet, JWT, AES-256-CBC, Zod, Rate Limiting | — |
| **MCP** | Model Context Protocol SDK | 1.25 |

### Project Structure

```
MCP-n8n/
│
├── frontend/                  React SPA
│   ├── src/pages/             16 route components
│   ├── src/components/        Reusable UI (ErrorBoundary, Nav, Modal...)
│   └── src/contexts/          Auth context, theme
│
├── backend/                   Express API
│   ├── src/controllers/       8 request handlers
│   ├── src/services/          11 business logic modules
│   │   ├── gemini.service         Gemini AI integration
│   │   ├── publicWorkflow.service Workflow generation orchestrator
│   │   ├── workflowGenerator.service  n8n JSON builder
│   │   ├── workflow-gap-detector      Auto-improvement engine
│   │   └── workflow-templates         10 pre-built templates
│   ├── src/routes/            8 route files (public + auth + admin)
│   ├── src/middleware/        Auth, rate limiting, error handling
│   └── prisma/                Schema + migrations
│
├── mcp-server/                Model Context Protocol server
│   └── src/index.ts           Node discovery + caching
│
├── docker-compose.yml         3-service orchestration
└── package.json               Monorepo workspace root
```

<br/>

---

<br/>

## API Reference

### Public Endpoints (No Auth)

| Method | Endpoint | What It Does |
|--------|----------|-------------|
| `POST` | `/api/public/validate-n8n` | Validate n8n connection |
| `POST` | `/api/public/generate-workflow` | Generate workflow from description |
| `POST` | `/api/public/preview-workflow` | Preview without deploying |
| `POST` | `/api/public/create-workflow` | Deploy to n8n instance |
| `POST` | `/api/public/cancel-workflow/:id` | Cancel in-progress generation |
| `GET` | `/api/templates` | List all templates |
| `GET` | `/api/templates/categories` | Get template categories |
| `GET` | `/api/templates/:id` | Get specific template |
| `GET` | `/health` | Health check |

### Authenticated Endpoints

| Scope | Endpoints | Purpose |
|-------|-----------|---------|
| Auth | `/api/auth/*` | Register, login, logout, refresh |
| Workflows | `/api/workflows/*` | CRUD on saved workflows |
| Instances | `/api/n8n-instances/*` | Manage n8n connections |
| Admin | `/api/admin/*` | User management, audit logs |

<br/>

---

<br/>

## Security

| Layer | How |
|-------|-----|
| **Encryption** | AES-256-CBC with random IV for stored credentials |
| **Auth** | JWT tokens + bcrypt password hashing |
| **Validation** | Zod schemas on every endpoint |
| **Headers** | Helmet.js security headers |
| **Rate Limiting** | 50 req/15min general, 10 req/15min for generation |
| **Access Control** | Role-based (Employee / Admin) with route protection |
| **Startup** | Server refuses to start without `JWT_SECRET` and `ENCRYPTION_KEY` |

<br/>

---

<br/>

## Troubleshooting

<details>
<summary><strong>Port already in use</strong></summary>

```bash
lsof -ti:3000 | xargs kill -9   # Backend
lsof -ti:5173 | xargs kill -9   # Frontend
```
</details>

<details>
<summary><strong>Gemini API issues</strong></summary>

- Verify `GEMINI_API_KEY` is set in `backend/.env`
- Check your quota at [Google Cloud Console](https://console.cloud.google.com)
- Users can also provide their own Gemini API key in the Nathan UI settings
</details>

<details>
<summary><strong>n8n connection fails</strong></summary>

- Confirm your n8n instance is accessible from your network
- Verify the API key has correct permissions
- Check that the n8n API is enabled (Settings > API)
</details>

<details>
<summary><strong>Database issues</strong></summary>

```bash
cd backend
npx prisma generate          # Regenerate Prisma client
npx prisma migrate dev       # Apply pending migrations
npx prisma studio            # Open database GUI at localhost:5555
```
</details>

<br/>

---

<br/>

## Development

```bash
npm run dev              # Start frontend + backend together
npm run dev:backend      # Backend only (hot-reload with tsx)
npm run dev:frontend     # Frontend only (Vite HMR)
npm run build            # Production build (both)
npm run lint             # Lint everything
npm run format           # Prettier formatting
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for system design details and the auto-improvement pipeline.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and coding standards.

<br/>

---

<br/>

## License

Proprietary — RISE Internal Use Only

<br/>

---

<p align="center">
  <strong>Built by the RISE Team</strong><br/>
  <sub>Making workflow automation accessible to everyone</sub>
</p>
