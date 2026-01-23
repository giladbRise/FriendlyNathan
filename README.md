<p align="center">
  <img src="https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png" alt="n8n" width="100"/>
</p>

<h1 align="center">Friendly Nathan (n8n)</h1>

<p align="center">
  <strong>AI-Powered n8n Workflow Generator</strong><br/>
  <em>Describe what you need in plain English. Get production-ready workflows instantly.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/n8n-Workflow%20Automation-FF6D5A?style=for-the-badge&logo=n8n&logoColor=white" alt="n8n"/>
  <img src="https://img.shields.io/badge/Google%20Gemini-AI%20Powered-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI"/>
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/React-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-RISE%20Internal-blue?style=flat-square" alt="License"/>
  <img src="https://img.shields.io/badge/Version-2.0.0-green?style=flat-square" alt="Version"/>
  <img src="https://img.shields.io/badge/Status-Production-brightgreen?style=flat-square" alt="Status"/>
</p>

---

## What is Friendly Nathan?

Friendly Nathan bridges the gap between **what you want to automate** and **how to build it in n8n**. Instead of spending hours configuring nodes, connections, and parameters — simply describe your workflow in natural language.

```
"Every morning at 9am, check my Gmail for unread emails with attachments,
 save the attachments to Google Drive, and send me a Slack summary"
```

**Friendly Nathan generates a complete, deployable n8n workflow in seconds.**

---

## Key Features

### Intelligent Workflow Generation
Powered by Google Gemini AI with deep n8n knowledge. Understands complex multi-step automation requirements and automatically selects the right nodes and configurations.

### Auto-Improvement System
Automatically detects and fixes workflow gaps. Iteratively improves workflows until they're production-ready — no technical intervention required.

### Smart Templates Library
10+ pre-built templates across 6 categories with fillable fields for quick customization:
- **Communication** — Email processing, Slack notifications
- **Data Processing** — Sheet sync, data transformation
- **Notifications** — Multi-channel alerts, summaries
- **Integrations** — CRM sync, cross-platform automation
- **Scheduling** — Daily reports, periodic tasks
- **AI-Powered** — Content generation, analysis workflows

### Real-Time Progress
Live generation progress via WebSocket. See each step as your workflow is being built with instant preview before deployment.

### Direct n8n Integration
Connect to any n8n instance (self-hosted or cloud). One-click deployment with automatic credential placeholder setup.

---

## Architecture

```
                              FRONTEND (React)
    ┌─────────────────────────────────────────────────────────────────┐
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
    │  │ Description │  │  Template   │  │     Workflow Preview    │  │
    │  │   Input     │  │  Selector   │  │     & Deployment        │  │
    │  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
    └─────────┼────────────────┼──────────────────────┼───────────────┘
              │                │                      │
              ▼                ▼                      ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                        BACKEND (Express)                         │
    │  ┌─────────────────────────────────────────────────────────────┐│
    │  │                   Workflow Generation Pipeline               ││
    │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ ││
    │  │  │  Parse   │─▶│ Generate │─▶│  Auto    │─▶│  Validate   │ ││
    │  │  │ Request  │  │ Workflow │  │ Improve  │  │  & Deploy   │ ││
    │  │  └──────────┘  └──────────┘  └──────────┘  └─────────────┘ ││
    │  └─────────────────────────────────────────────────────────────┘│
    │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
    │  │ Gap Detection   │  │ Learning System │  │  Node Cache     │ │
    │  │ Service         │  │ (Preferences)   │  │  (TTL-based)    │ │
    │  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
    └─────────────────────────────────────────────────────────────────┘
              │                                           │
              ▼                                           ▼
    ┌─────────────────────┐                 ┌─────────────────────────┐
    │   Google Gemini AI  │                 │      n8n Instance       │
    │   (Workflow Logic)  │                 │   (Deployment Target)   │
    └─────────────────────┘                 └─────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, TailwindCSS, Socket.io Client |
| **Backend** | Node.js, Express, TypeScript, Socket.io |
| **AI Engine** | Google Gemini Pro (via API) |
| **Automation** | n8n (any instance) |
| **Validation** | Zod schemas |
| **Database** | PostgreSQL with Prisma ORM |

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Google Gemini API key
- n8n instance (self-hosted or cloud)

### Installation

```bash
# Clone the repository
git clone https://github.com/giladbRise/Friendly Nathan.git
cd Friendly Nathan

# Install all dependencies
npm install

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your settings

# Start the application
npm run dev
```

### Environment Variables

Create `backend/.env`:

```env
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Optional: Default Gemini API key (users can also provide their own)
GEMINI_API_KEY=your_gemini_api_key
```

---

## Usage

### 1. Connect to n8n

Enter your n8n instance URL and API key:
- n8n URL: `https://your-n8n-instance.com`
- API Key: `your-n8n-api-key`

### 2. Describe Your Workflow

Write what you want to automate in plain English:

> "When a new row is added to my Google Sheet, extract the email address, send a welcome email using Gmail, and log the action to Slack"

### 3. Preview & Deploy

- Review the generated workflow
- Click **"Create in n8n"** to deploy
- Open directly in your n8n editor

---

## AI Node Configuration

Friendly Nathan uses the **chain+model pattern** for AI nodes — the recommended architecture for n8n:

```
┌─────────────┐    main    ┌───────────────┐   ai_model   ┌─────────────────────┐
│ Edit Fields │ ─────────▶ │ Basic LLM     │ ───────────▶ │ Google Gemini Chat  │
│ (chatInput) │            │ Chain         │              │ Model               │
└─────────────┘            └───────────────┘              └─────────────────────┘
```

This pattern ensures:
- Proper input preparation with `chatInput` field
- Correct connection types between nodes
- Full compatibility with n8n's LangChain integration

---

## Auto-Improvement System

Friendly Nathan automatically detects and fixes common workflow issues:

| Issue Type | Auto-Fix |
|------------|----------|
| Missing triggers | Adds appropriate trigger node |
| Incomplete outputs | Adds output/notification nodes |
| Vague data sources | Clarifies with specific node configurations |
| Missing AI setup | Implements chain+model pattern |
| Unclear conditions | Adds proper IF/Switch logic |

The system iterates up to 3 times to ensure workflow quality before presenting the final result.

---

## Project Structure

```
Friendly Nathan/
├── backend/
│   ├── src/
│   │   ├── controllers/          # API endpoint handlers
│   │   ├── services/             # Business logic
│   │   │   ├── gemini.service.ts              # AI generation
│   │   │   ├── publicWorkflow.service.ts      # Workflow orchestration
│   │   │   ├── workflow-gap-detector.service.ts
│   │   │   ├── workflow-templates.service.ts
│   │   │   └── workflowGenerator.service.ts
│   │   ├── routes/               # API routes
│   │   ├── config/               # Configuration files
│   │   └── middleware/           # Express middleware
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/                # React pages
│   │   ├── components/           # Reusable components
│   │   └── services/             # API clients
│   └── package.json
├── mcp-server/                   # MCP protocol server
└── README.md
```

---

## API Endpoints

### Public Endpoints (No Auth Required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/public/validate` | Validate n8n connection |
| POST | `/api/public/generate` | Generate workflow |
| POST | `/api/public/preview` | Preview workflow without creating |
| POST | `/api/public/create` | Create workflow in n8n |
| DELETE | `/api/public/cancel/:id` | Cancel generation |

### Templates
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/templates` | List all templates |
| GET | `/api/templates/categories` | Get template categories |
| GET | `/api/templates/:id` | Get specific template |

---

## Security Features

- **Encrypted API Keys**: AES-256 encryption for stored credentials
- **JWT Authentication**: Secure token-based auth for protected endpoints
- **No Credential Exposure**: API keys never logged or exposed in UI
- **Input Validation**: Zod schemas validate all inputs
- **Rate Limiting**: Prevents abuse of workflow generation

---

## Docker Deployment

```bash
# Build and start all services
docker-compose up --build

# Run in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

---

## Troubleshooting

### Port Already in Use
```bash
# Find and kill process using port 3000 (backend)
lsof -ti:3000 | xargs kill -9

# Find and kill process using port 5173 (frontend)
lsof -ti:5173 | xargs kill -9
```

### Gemini API Issues
- Verify `GEMINI_API_KEY` is set correctly in backend/.env
- Check API quota in Google Cloud Console
- Ensure billing is enabled for your Google Cloud project

### n8n Connection Issues
- Verify n8n instance is accessible from your network
- Check API key has correct permissions
- Ensure n8n API is enabled in your instance

---

## Built for RISE

Friendly Nathan is optimized for **RISE** organizational workflows:

- Enterprise-ready security
- Slack integration for team communication
- Google Workspace compatibility (Sheets, Drive, Gmail)
- AI-powered automation with Gemini

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

Proprietary - RISE Internal Use Only

---

## Support

For issues or questions:
- Internal: Contact RISE DevOps team
- Slack: #n8n-workflow-builder

---

<p align="center">
  <strong>Built with care by the RISE Team</strong><br/>
  <em>Making workflow automation accessible to everyone</em>
</p>

---

**Version**: 2.0.0 | **Last Updated**: January 2026
