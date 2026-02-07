# Architecture

Technical reference for developers working on Friendly Nathan.

---

## System Overview

Friendly Nathan is a full-stack application that converts natural language descriptions into deployable n8n workflows using Google Gemini AI.

```
                              FRONTEND (React + Vite)
    ┌─────────────────────────────────────────────────────────────────┐
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
    │  │ Description │  │  Template   │  │     Workflow Preview    │ │
    │  │   Input     │  │  Selector   │  │     & Deployment       │ │
    │  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘ │
    └─────────┼────────────────┼──────────────────────┼──────────────┘
              │                │                      │
              ▼                ▼                      ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                     BACKEND (Express + TypeScript)               │
    │                                                                  │
    │  ┌─────────────────────────────────────────────────────────────┐ │
    │  │              Workflow Generation Pipeline                    │ │
    │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │ │
    │  │  │  Parse   │─▶│ Generate │─▶│  Auto    │─▶│  Validate  │ │ │
    │  │  │ Request  │  │ Workflow │  │ Improve  │  │  & Deploy  │ │ │
    │  │  └──────────┘  └──────────┘  └──────────┘  └────────────┘ │ │
    │  └─────────────────────────────────────────────────────────────┘ │
    │                                                                  │
    │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐ │
    │  │ Gap Detection  │  │ Learning System│  │  Node Cache        │ │
    │  │ Service        │  │ (Preferences)  │  │  (TTL-based)       │ │
    │  └────────────────┘  └────────────────┘  └────────────────────┘ │
    └─────────────────────────────────────────────────────────────────┘
              │                                           │
              ▼                                           ▼
    ┌─────────────────────┐                 ┌─────────────────────────┐
    │   Google Gemini AI  │                 │      n8n Instance       │
    │   (Workflow Logic)  │                 │   (Deployment Target)   │
    └─────────────────────┘                 └─────────────────────────┘
```

---

## Workflow Generation Pipeline

The core of the system. When a user submits a description, this pipeline executes:

### 1. Parse Request

`publicWorkflow.service.ts` receives the description, validates inputs with Zod, and determines whether this is a free-text generation or template-based request.

### 2. Generate Workflow

`gemini.service.ts` sends the description to Google Gemini with a system prompt containing:
- n8n node catalog (cached, TTL-based)
- Workflow structure requirements (nodes, connections, parameters)
- Known patterns from the learning system

The response is a structured JSON workflow compatible with the n8n API.

### 3. Auto-Improve (Gap Detection)

`workflow-gap-detector.service.ts` scans the generated workflow for common issues:

| Gap Type | Detection | Auto-Fix |
|----------|-----------|----------|
| Missing trigger | No trigger node found | Adds appropriate trigger (Manual, Cron, Webhook) |
| No output | Workflow ends without output | Adds notification or output node |
| Vague data source | Generic node references | Replaces with specific node configurations |
| Missing AI setup | AI node without chain/model | Implements chain+model pattern (see below) |
| Unclear conditions | IF/Switch without logic | Adds proper conditional expressions |

The pipeline loops up to **3 times**, re-submitting to Gemini after each fix until the workflow passes all checks.

### 4. Validate & Deploy

`workflowGenerator.service.ts` validates the final workflow against n8n's API schema, sets up credential placeholders, and creates the workflow in the target n8n instance.

---

## AI Node Pattern (Chain + Model)

n8n's LangChain integration requires a specific node architecture. Friendly Nathan generates this automatically:

```
┌─────────────┐    main    ┌───────────────┐   ai_model   ┌─────────────────────┐
│ Edit Fields │ ─────────▶ │ Basic LLM     │ ───────────▶ │ Google Gemini Chat  │
│ (chatInput) │            │ Chain         │              │ Model               │
└─────────────┘            └───────────────┘              └─────────────────────┘
```

- **Edit Fields** prepares the `chatInput` field required by the chain
- **Basic LLM Chain** orchestrates the AI call
- **Gemini Chat Model** executes the actual LLM request
- Connection types: `main` (data flow) and `ai_model` (model binding)

---

## Backend Services

### Core Services

| Service | File | Purpose |
|---------|------|---------|
| Gemini | `gemini.service.ts` | Google Gemini API integration, prompt management, response parsing |
| Public Workflow | `publicWorkflow.service.ts` | Orchestrates the full generation pipeline |
| Gap Detector | `workflow-gap-detector.service.ts` | Scans workflows for issues, suggests fixes |
| Templates | `workflow-templates.service.ts` | 10 pre-built workflow templates with fillable fields |
| Generator | `workflowGenerator.service.ts` | Builds n8n-compatible workflow JSON, handles deployment |

### Route Structure

```
/api/public/*              # No auth required — workflow generation
/api/templates/*           # No auth required — template browsing
/api/auth/*                # Registration, login, logout
/api/workflows/*           # Authenticated — saved workflow CRUD
/api/n8n-instances/*       # Authenticated — n8n instance management
/api/admin/*               # Admin only — user management, audit
/api/credentials/guidance  # Credential setup help
/health                    # Health check
```

### Middleware Stack

Applied in this order (see `backend/src/index.ts`):
1. `helmet()` — HTTP security headers
2. `cors()` — Cross-origin configuration (allows `FRONTEND_URL`)
3. `express.json()` — Body parsing
4. `express.urlencoded()` — Form data parsing
5. Route-specific: `authMiddleware`, `adminMiddleware`, rate limiters
6. `errorHandler` — Catches all unhandled errors (must be last)

---

## Frontend Architecture

### Routing

Two tiers of routes (see `frontend/src/App.tsx`):

**Public routes** — No login required:
- `/` — `SimplifiedWorkflowPage` (main workflow generator)
- `/login`, `/register`, `/forgot-password`, `/reset-password`

**Protected routes** — JWT auth required:
- `/dashboard` — User dashboard
- `/workflow/create` — Full workflow creation page
- `/workflow/history` — Past workflows
- `/workflow/:id` — Workflow detail
- `/profile` — User settings
- `/instances` — n8n instance management

**Admin routes** — Admin role required:
- `/admin` — Admin dashboard
- `/admin/users` — User management
- `/admin/audit-log` — Audit trail
- `/admin/credentials` — Credential guidance management

### State Management

- **AuthContext** — JWT token, user object, login/logout methods
- Component-level state with `useState`/`useReducer`
- No global state library — React Context handles cross-cutting concerns

### Real-Time Updates

Socket.io client connects to the backend during workflow generation. Progress events:
- `generation:start` — Pipeline started
- `generation:progress` — Step completed (parsing, generating, improving, validating)
- `generation:complete` — Workflow ready
- `generation:error` — Pipeline failed

---

## Database

PostgreSQL with Prisma ORM. Schema defined in `backend/prisma/schema.prisma`.

Key models:
- `User` — Authentication, roles (Employee/Admin)
- `N8nInstance` — Connected n8n instances with encrypted API keys
- `Workflow` — Generated workflow history
- `AuditLog` — User action tracking

### API Key Encryption

n8n API keys are encrypted at rest using AES-256-CBC (see `backend/src/utils/encryption.ts`):
- Encryption key derived from `ENCRYPTION_KEY` environment variable
- Random IV per encryption operation
- Stored as `iv:encrypted` format in the database

---

## MCP Server

`mcp-server/` implements the Model Context Protocol for external AI tool integration. It exposes Friendly Nathan's workflow generation capabilities as MCP tools that other AI systems can invoke.

---

## Configuration

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | No | `3000` | Backend server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `FRONTEND_URL` | No | `http://localhost:5173` | CORS allowed origin |
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | JWT signing secret |
| `ENCRYPTION_KEY` | Yes | — | AES-256 key for API key encryption |

### Node Cache

The n8n node catalog is cached with a TTL to avoid repeated API calls. Cache is invalidated when:
- TTL expires
- A different n8n instance is selected
- Manual refresh is triggered

---

## Development

### Running Locally

```bash
npm run dev              # Start both servers (concurrently)
npm run dev:backend      # Backend only (port 3000)
npm run dev:frontend     # Frontend only (port 5173)
```

### Building

```bash
npm run build            # Build both
npm run build:backend    # TypeScript compilation
npm run build:frontend   # Vite production build
```

### Database Management

```bash
cd backend
npx prisma generate      # Generate client from schema
npx prisma migrate dev   # Create and apply migrations
npx prisma studio        # Browser-based DB GUI
npx prisma db push       # Push schema changes (no migration)
```

### Linting

```bash
npm run lint             # Lint both projects
npm run format           # Prettier formatting
```
