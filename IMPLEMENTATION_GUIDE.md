# Implementation Guide for Future Agents

## 🎯 Quick Start for Next Agent

### 1. Get Your Next Task
```bash
# Use the feature API to get the highest priority pending feature
# This returns feature #1: "Register new user account"
```

### 2. Mark as In Progress
```bash
# Mark the feature as in_progress before starting work
# This prevents other agents from working on it
```

### 3. Implement with Real Data
- NO MOCK DATA allowed
- All data must come from the PostgreSQL database
- Use Prisma ORM for all database operations

### 4. Test Thoroughly
- Test every step in the feature's test steps
- Verify data persists after refresh
- Check for console errors
- Test edge cases

### 5. Mark as Passing
```bash
# Only mark as passing when FULLY working
# feature_mark_passing(feature_id=1)
```

### 6. Commit Progress
```bash
git add .
git commit -m "Implement user registration (Feature #1)

- Created auth routes
- Implemented password validation
- Added email uniqueness check
- Tested all registration scenarios

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

## 📋 Implementation Priority Order

### Phase 1: Core Backend (Features 1-30)
1. **Authentication System**
   - User registration with validation
   - Login with JWT tokens
   - Password hashing with bcrypt
   - Logout and session management
   - Password reset flow
   - User profile management

2. **Database Setup**
   - Prisma migrations
   - Seed script for admin user
   - Database connection testing
   - Error handling

3. **Basic API Structure**
   - Express server setup
   - Middleware (auth, error handling, CORS)
   - Request validation with Zod
   - Rate limiting

### Phase 2: n8n Instance Management (Features 31-50)
1. **n8n Instance CRUD**
   - Save n8n instances
   - AES-256 encryption for API keys
   - Validate n8n credentials
   - List/edit/delete instances
   - Set default instance

2. **n8n API Integration**
   - n8n API client wrapper
   - Node discovery endpoint
   - Error handling for n8n API calls

### Phase 3: AI & Workflow Generation (Features 51-100)
1. **Gemini Integration**
   - Google Gemini API client
   - Prompt engineering for workflow generation
   - Streaming response handling
   - Token usage tracking

2. **MCP Server Integration**
   - n8n-mcp package setup
   - MCP tool invocations
   - Dynamic instance configuration
   - Error handling

3. **Workflow Generation Pipeline**
   - Orchestration service
   - Node discovery caching
   - Workflow validation
   - n8n workflow creation
   - Credential detection

### Phase 4: Real-time & WebSockets (Features 101-120)
1. **Socket.io Setup**
   - WebSocket authentication
   - Progress event emitters
   - Connection management
   - Error handling

### Phase 5: Frontend Foundation (Features 121-160)
1. **React Setup**
   - Vite configuration
   - React Router setup
   - Tailwind CSS configuration
   - shadcn/ui installation

2. **Authentication UI**
   - Login page
   - Registration page
   - Password reset flow
   - Protected routes
   - Auth context

3. **Main Layout**
   - Navigation sidebar
   - Top bar with user menu
   - Responsive design
   - Dark theme styling

### Phase 6: Workflow Creation UI (Features 161-200)
1. **Create Workflow Page**
   - Description textarea
   - n8n instance selector
   - Real-time progress display
   - Success/error handling
   - Credential guidance display

2. **Workflow History**
   - History list with filters
   - Search functionality
   - Pagination
   - Workflow detail view
   - Retry functionality

### Phase 7: Admin Features (Features 201-230)
1. **Admin Dashboard**
   - User management
   - System statistics
   - Audit log
   - Credential guidance management
   - CSV export

### Phase 8: Polish & Testing (Features 231-263)
1. **UI/UX Polish**
   - Animations
   - Loading states
   - Error messages
   - Toast notifications

2. **Accessibility**
   - Keyboard navigation
   - ARIA labels
   - Screen reader support

3. **Performance**
   - Query optimization
   - Caching
   - Bundle size optimization

## 🏗️ Recommended Implementation Pattern

### For Each Feature:

1. **Backend First (if applicable)**
   ```
   backend/src/
   ├── routes/       # API endpoints
   ├── controllers/  # Request handlers
   ├── services/     # Business logic
   ├── middleware/   # Auth, validation, etc.
   ├── utils/        # Helpers
   └── types/        # TypeScript types
   ```

2. **Frontend Second**
   ```
   frontend/src/
   ├── pages/        # Route components
   ├── components/   # Reusable UI components
   ├── contexts/     # React contexts
   ├── hooks/        # Custom hooks
   ├── services/     # API calls
   ├── utils/        # Helpers
   └── types/        # TypeScript types
   ```

3. **Test Thoroughly**
   - Manual testing in browser
   - Test all steps from feature description
   - Verify data persistence
   - Check edge cases

4. **Commit When Complete**
   - One feature per commit (or logical group)
   - Clear commit messages
   - Reference feature number

## 🔧 Useful Commands

### Backend Development
```bash
cd backend
npm run dev              # Start dev server with hot reload
npm run build            # Build TypeScript
npx prisma studio        # Open Prisma Studio (DB GUI)
npx prisma generate      # Generate Prisma Client
npx prisma migrate dev   # Create and apply migration
```

### Frontend Development
```bash
cd frontend
npm run dev              # Start Vite dev server
npm run build            # Build for production
npm run preview          # Preview production build
```

### Feature Management
```bash
# Get next feature to implement
feature_get_next()

# Mark feature as in progress
feature_mark_in_progress(feature_id=X)

# Mark feature as passing
feature_mark_passing(feature_id=X)

# Get statistics
feature_get_stats()

# Skip a feature (if blocked)
feature_skip(feature_id=X)
```

## 🚨 Critical Rules

### ❌ NEVER DO THIS:
- Mock data or hardcoded arrays
- Remove or edit features from database
- Commit without testing
- Skip security measures
- Expose API keys or secrets
- Use generic error messages

### ✅ ALWAYS DO THIS:
- Use real database data
- Mark features in_progress before starting
- Test thoroughly before marking passing
- Commit working code frequently
- Follow TypeScript strict mode
- Handle errors gracefully
- Log important events
- Validate all user input

## 📊 Progress Tracking

Current Status:
- Total Features: 263
- Passing: 0 (0.0%)
- In Progress: 0
- Pending: 263

Next Feature: #1 - "Register new user account"

## 🎨 Design Guidelines

### Colors (from design system)
- Primary: #0066FF (electric blue)
- Secondary: #00D9FF (cyan)
- Background: #0A0E27 (dark blue-black)
- Surface: #1A1F3A (dark blue-grey)
- Text Primary: #FFFFFF
- Text Secondary: #A0AEC0
- Success: #00FF88
- Error: #FF3366
- Warning: #FFA500

### Component Library
Use shadcn/ui for all UI components:
- Button
- Input
- Card
- Dialog
- Select
- Toast
- etc.

### Styling Approach
- Tailwind CSS utility classes
- Dark theme by default
- Responsive design (mobile-first)
- Subtle animations (0.2s ease)
- Glass morphism for modals

## 🐛 Common Issues & Solutions

### "Prisma Client not generated"
```bash
cd backend
npx prisma generate
```

### "Port 3000 already in use"
```bash
lsof -ti:3000 | xargs kill -9
```

### "Database connection failed"
- Check PostgreSQL is running
- Verify DATABASE_URL in backend/.env
- Ensure database exists

### "JWT token invalid"
- Check JWT_SECRET is set
- Verify token format
- Check token expiration

## 📝 Session Management

Before ending your session:
1. Commit all working code
2. Update claude-progress.txt with:
   - Features completed
   - Current status
   - Next steps
   - Any blockers
3. Push to git (if remote configured)
4. Leave environment in clean state

## 🤝 Collaboration Notes

- Each agent works independently
- Features database is single source of truth
- No need to read other agents' code initially
- Focus on your assigned features
- Commit frequently for others to build on

---

**Remember**: Quality over speed. Production-ready code is the goal.
