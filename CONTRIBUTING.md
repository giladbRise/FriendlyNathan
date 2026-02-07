# Contributing to Friendly Nathan

Guide for human developers and AI coding agents working on this project.

---

## Development Setup

```bash
# Install dependencies
npm install

# Set up environment
cp backend/.env.example backend/.env
# Fill in required values (see ARCHITECTURE.md for variable reference)

# Set up database
cd backend
npx prisma generate
npx prisma migrate dev
cd ..

# Start development servers
npm run dev
```

Frontend: `http://localhost:5173` | Backend: `http://localhost:3000`

---

## Branch & Commit Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make focused commits with clear messages:
   ```bash
   git commit -m "Add webhook template with Slack integration

   - New template in workflow-templates.service.ts
   - Webhook path and Slack channel as fillable fields
   - Category: Data Collection"
   ```

3. Push and open a Pull Request against `main`.

### Commit Message Format

```
<verb> <what changed>

- Specific detail 1
- Specific detail 2
```

Use present tense verbs: Add, Fix, Update, Remove, Refactor, Improve.

---

## Code Standards

### TypeScript

- Strict mode enabled in both `backend/tsconfig.json` and `frontend/tsconfig.json`
- All function parameters and return types must be typed
- Use Zod schemas for runtime validation at API boundaries
- Prefer `interface` for object shapes, `type` for unions/intersections

### Backend Patterns

- **Routes** define endpoints and attach middleware
- **Controllers** parse requests, call services, format responses
- **Services** contain business logic (no Express req/res objects)
- **Middleware** handles cross-cutting concerns (auth, validation, error handling)

```
Route → Controller → Service → Database/External API
```

### Frontend Patterns

- **Pages** are route-level components (one per route in App.tsx)
- **Components** are reusable UI pieces
- **Contexts** provide cross-cutting state (auth, theme)
- **Services** wrap API calls with Axios

### Styling

- TailwindCSS utility classes (no custom CSS unless necessary)
- Dark theme by default
- Responsive: mobile-first breakpoints
- Design tokens:
  - Primary: `#0066FF`
  - Background: `#0A0E27`
  - Surface: `#1A1F3A`
  - Success: `#00FF88`
  - Error: `#FF3366`

---

## Adding a Workflow Template

Templates are defined in `backend/src/services/workflow-templates.service.ts`.

Each template needs:

```typescript
{
  id: 'unique-kebab-case-id',
  name: 'Human-Readable Name',
  description: 'What this template does',
  category: 'Category Name',  // Match existing categories or create new
  icon: 'emoji',
  fields: [
    {
      name: 'fieldName',
      label: 'Display Label',
      type: 'text' | 'number' | 'email' | 'url' | 'slack-channel',
      placeholder: 'Example value',
      required: true | false,
      validation: 'optional-regex-pattern'
    }
  ],
  generatePrompt: (fields) => `Natural language description using ${fields.fieldName}`
}
```

Current categories: Email Automation, Data Collection, Reporting, Monitoring, AI Processing, Data Sync, Notifications.

---

## Adding an API Endpoint

1. Define the route in `backend/src/routes/`
2. Create a controller in `backend/src/controllers/`
3. Add business logic in `backend/src/services/`
4. Add Zod validation schemas for request bodies
5. Register the route in `backend/src/index.ts`

For public endpoints: register under `/api/public/`
For authenticated endpoints: apply `authMiddleware` in the route file.

---

## Testing

### Manual Testing

```bash
# Start the app
npm run dev

# Open http://localhost:5173
# Test through the UI — click, type, verify
```

### Lint & Type Check

```bash
npm run lint              # ESLint on both projects
npm run format            # Prettier formatting
cd backend && npx tsc --noEmit   # Type check backend
cd frontend && npx tsc --noEmit  # Type check frontend
```

### Database

```bash
cd backend
npx prisma studio        # Visual database browser
```

---

## AI Agent Development

This project uses autonomous AI coding agents for feature implementation. The agent system is documented in `prompts/`:

| File | Purpose |
|------|---------|
| `prompts/initializer_prompt.md` | First-run agent: creates feature database, project structure |
| `prompts/coding_prompt.md` | Standard coding agent: implements features with full browser verification |
| `prompts/coding_prompt_yolo.md` | Fast mode: implements features with lint/typecheck only (no browser testing) |

### Feature Tracking

Features are stored in a SQLite database (`features.db`) and managed via MCP tools:
- `feature_get_next` — Get the next pending feature
- `feature_mark_in_progress` — Claim a feature
- `feature_mark_passing` — Mark as complete after verification
- `feature_skip` — Skip (external blockers only)
- `feature_get_stats` — Progress overview

### Key Rules for Agents

- All data must come from the real database (PostgreSQL) — no mock data
- Test through the actual UI, not just API calls
- One feature at a time, thoroughly verified
- Commit after each completed feature
- Update `claude-progress.txt` before ending a session

---

## Troubleshooting

### Common Issues

| Problem | Fix |
|---------|-----|
| Port 3000 in use | `lsof -ti:3000 \| xargs kill -9` |
| Port 5173 in use | `lsof -ti:5173 \| xargs kill -9` |
| Prisma client outdated | `cd backend && npx prisma generate` |
| Database schema changed | `cd backend && npx prisma migrate dev` |
| JWT errors | Check `JWT_SECRET` is set in `backend/.env` |
| CORS errors | Verify `FRONTEND_URL` matches your dev server URL |

---

## Questions?

- Slack: `#n8n-workflow-builder`
- Internal: RISE DevOps team
