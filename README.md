<p align="center">
  <img src="https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png" alt="n8n" width="100"/>
</p>

<h1 align="center">Friendly Nathan</h1>

<p align="center">
  <strong>Describe your automation in plain English. Get a production-ready n8n workflow in seconds.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/n8n-Workflow%20Automation-FF6D5A?style=for-the-badge&logo=n8n&logoColor=white" alt="n8n"/>
  <img src="https://img.shields.io/badge/Google%20Gemini-AI%20Powered-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI"/>
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/React-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-green?style=flat-square" alt="Version"/>
  <img src="https://img.shields.io/badge/Status-Production-brightgreen?style=flat-square" alt="Status"/>
  <img src="https://img.shields.io/badge/Node->=20-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node"/>
</p>

---

## What Does Friendly Nathan Do?

You tell it what you want to automate:

> "Every morning at 9am, check my Gmail for unread emails with attachments,
> save the attachments to Google Drive, and send me a Slack summary"

Friendly Nathan turns that into a complete, deployable n8n workflow — nodes, connections, parameters, and all. No drag-and-drop required.

### How It Works

1. **Connect** your n8n instance (self-hosted or cloud)
2. **Describe** what you want to automate in plain English
3. **Review** the generated workflow in a live preview
4. **Deploy** to your n8n instance with one click

---

## Features

| Feature | What It Does |
|---------|-------------|
| **Natural Language Generation** | Describe workflows in plain English. Gemini AI handles the rest. |
| **Auto-Improvement** | Detects gaps (missing triggers, incomplete outputs) and fixes them automatically. Up to 3 refinement passes. |
| **10 Ready-Made Templates** | Pre-built workflows across 7 categories with fillable fields. Skip the description and customize directly. |
| **Live Progress** | WebSocket-powered real-time updates. Watch your workflow being built step by step. |
| **One-Click Deploy** | Push directly to your n8n instance. Credential placeholders are set up automatically. |
| **AI Node Support** | Uses n8n's chain+model pattern for LangChain-compatible AI nodes. |

### Template Categories

- **Email Automation** (3 templates) — Gmail summaries, email-to-spreadsheet
- **Data Collection** (2) — Webhook receivers, form submissions
- **Reporting** (1) — Scheduled daily reports
- **Monitoring** (1) — API health monitoring with alerts
- **AI Processing** (1) — AI-powered content workflows
- **Data Sync** (1) — Cross-platform data synchronization
- **Notifications** (1) — Multi-channel alert systems

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- Google Gemini API key ([get one here](https://aistudio.google.com/apikey))
- n8n instance (self-hosted or cloud) with API access enabled

### Install & Run

```bash
# Clone the repository
git clone https://github.com/giladbRise/MCP-n8n.git
cd MCP-n8n

# Install all dependencies (backend + frontend + shared)
npm install

# Configure your environment
cp backend/.env.example backend/.env
# Edit backend/.env — at minimum set GEMINI_API_KEY

# Start both servers
npm run dev
```

The frontend opens at `http://localhost:5173`. The backend API runs on `http://localhost:3000`.

### Environment Variables

Create `backend/.env` (see `backend/.env.example`):

```env
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Required: Your Gemini API key (users can also provide their own in the UI)
GEMINI_API_KEY=your_gemini_api_key
```

### Docker

```bash
# Build and start everything
docker-compose up --build

# Or run in background
docker-compose up -d
```

---

## Connecting to n8n

1. Open your n8n instance settings
2. Generate an API key (Settings > API > Create API Key)
3. In Friendly Nathan, enter:
   - **n8n URL**: `https://your-n8n-instance.com`
   - **API Key**: your generated key

The app validates the connection before allowing workflow creation.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, TailwindCSS, Socket.io Client |
| **Backend** | Node.js 20+, Express, TypeScript, Socket.io |
| **AI** | Google Gemini Pro (via API) |
| **Database** | PostgreSQL with Prisma ORM |
| **Validation** | Zod schemas |
| **Target** | Any n8n instance (self-hosted or cloud) |

---

## Project Structure

```
MCP-n8n/
├── backend/                    # Express API server
│   ├── src/
│   │   ├── controllers/        # Request handlers
│   │   ├── services/           # Business logic
│   │   │   ├── gemini.service.ts              # Gemini AI integration
│   │   │   ├── publicWorkflow.service.ts      # Workflow orchestration
│   │   │   ├── workflow-gap-detector.service.ts
│   │   │   ├── workflow-templates.service.ts   # 10 pre-built templates
│   │   │   └── workflowGenerator.service.ts
│   │   ├── routes/             # API route definitions
│   │   ├── config/             # App configuration
│   │   └── middleware/         # Auth, validation, error handling
│   └── prisma/                 # Database schema & migrations
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── pages/              # 16 route components
│   │   ├── components/         # Reusable UI components
│   │   ├── contexts/           # React Context (auth, etc.)
│   │   └── services/           # API client layer
├── mcp-server/                 # MCP protocol server
├── prompts/                    # AI agent system prompts
└── shared/                     # Shared TypeScript types
```

---

## API Reference

### Public Endpoints (No Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/public/validate` | Validate n8n connection credentials |
| `POST` | `/api/public/generate` | Generate a workflow from description |
| `POST` | `/api/public/preview` | Preview workflow without deploying |
| `POST` | `/api/public/create` | Deploy workflow to n8n instance |
| `DELETE` | `/api/public/cancel/:id` | Cancel an in-progress generation |
| `GET` | `/api/templates` | List all available templates |
| `GET` | `/api/templates/categories` | Get template categories |
| `GET` | `/api/templates/:id` | Get a specific template |
| `GET` | `/health` | Health check |

### Authenticated Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/*` | Registration, login, logout |
| `*` | `/api/workflows/*` | CRUD operations on saved workflows |
| `*` | `/api/n8n-instances/*` | Manage connected n8n instances |
| `*` | `/api/admin/*` | Admin dashboard, user management |

---

## Security

- **API Key Encryption**: AES-256-CBC for stored n8n credentials
- **Authentication**: JWT tokens with bcrypt password hashing
- **Input Validation**: Zod schemas on all endpoints
- **HTTP Security**: Helmet.js headers, CORS configuration
- **Rate Limiting**: Prevents abuse of generation endpoints
- **Role-Based Access**: Employee and Admin roles with route protection

---

## Troubleshooting

### Port Already in Use

```bash
lsof -ti:3000 | xargs kill -9   # Backend
lsof -ti:5173 | xargs kill -9   # Frontend
```

### Gemini API Issues

- Verify `GEMINI_API_KEY` is set in `backend/.env`
- Check your API quota in [Google Cloud Console](https://console.cloud.google.com)
- Ensure billing is enabled for your Google Cloud project

### n8n Connection Fails

- Confirm your n8n instance is accessible from your network
- Verify the API key has correct permissions
- Check that the n8n API is enabled (Settings > API)

### Database Issues

```bash
cd backend
npx prisma generate          # Regenerate Prisma client
npx prisma migrate dev       # Apply pending migrations
npx prisma studio            # Open database GUI
```

---

## For Developers

See [ARCHITECTURE.md](ARCHITECTURE.md) for system design details, the auto-improvement pipeline, and AI node configuration patterns.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, coding standards, and how to submit changes.

---

## License

Proprietary — RISE Internal Use Only

## Support

- Internal: Contact RISE DevOps team
- Slack: `#n8n-workflow-builder`

---

<p align="center">
  <strong>Built by the RISE Team</strong><br/>
  <em>Making workflow automation accessible to everyone</em>
</p>
