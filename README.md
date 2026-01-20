# RISE n8n Workflow AI Builder

A production-ready AI-powered web application that enables RISE employees to create n8n workflows through natural language descriptions. The system uses Google Gemini 3 Flash Preview to intelligently analyze available n8n nodes, generate optimal workflows, and create them directly in customer n8n instances via API.

## 🚀 Features

- **Natural Language Workflow Generation**: Describe workflows in plain English, get working n8n workflows
- **Intelligent Node Discovery**: Automatically discovers available nodes from any n8n instance
- **AI-Powered Generation**: Uses Google Gemini 3 Flash Preview for intelligent workflow creation
- **Real-Time Progress Updates**: WebSocket-based live updates during workflow generation
- **Credential Guidance**: Automatic detection of required credentials with setup instructions
- **Workflow History & Audit**: Complete audit trail of all workflow generations
- **Multi-Tenant Support**: Manage multiple customer n8n instances
- **Role-Based Access**: Employee and Admin roles with appropriate permissions
- **Dark Futuristic Theme**: Modern, professional UI with RISE branding

## 🛠️ Technology Stack

### Frontend
- **Framework**: React 18+ with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: React Context API with hooks
- **Build Tool**: Vite
- **Real-Time**: WebSocket client for live updates

### Backend
- **Runtime**: Node.js 20+ with Express
- **Language**: TypeScript
- **Database**: PostgreSQL 15+
- **ORM**: Prisma
- **Authentication**: JWT with bcrypt
- **Real-Time**: Socket.io for WebSocket connections
- **AI Integration**: Google Gemini 3 Flash Preview API
- **MCP Server**: n8n-mcp package running as service

## 📋 Prerequisites

- Node.js 20 or higher
- PostgreSQL 15 or higher
- Google Cloud account with Gemini API access
- n8n instance URL and API key (for testing)
- npm or yarn package manager
- Docker and Docker Compose (optional, for containerized deployment)

## 🚀 Quick Start

### 1. Clone and Setup

```bash
# Run the automated setup script
./init.sh
```

The init.sh script will:
- Check Node.js and PostgreSQL installation
- Install all dependencies
- Create .env files from templates
- Run database migrations
- Optionally start development servers

### 2. Manual Setup (Alternative)

If you prefer manual setup:

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Configure Environment Variables

**Backend (.env)**:
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/n8n_workflow_builder"

# JWT Authentication
JWT_SECRET="your-secure-random-secret-key-change-this"
JWT_EXPIRES_IN="24h"
JWT_REFRESH_EXPIRES_IN="7d"

# Google Gemini API
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-3-flash-preview"

# n8n Configuration (for testing)
N8N_API_URL="https://your-n8n-instance.com"
N8N_API_KEY="your-n8n-api-key"

# Server Configuration
PORT=3000
NODE_ENV=development

# Encryption (for API keys)
ENCRYPTION_KEY="your-32-character-encryption-key"

# CORS
FRONTEND_URL="http://localhost:5173"
```

**Frontend (.env)**:
```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

### 4. Database Setup

```bash
cd backend

# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# (Optional) Seed initial data
npm run seed
```

### 5. Start Development Servers

**Option A: Using init.sh**
```bash
./init.sh
# Select 'y' when prompted to start servers
```

**Option B: Manually in separate terminals**

Terminal 1 (Backend):
```bash
cd backend
npm run dev
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

### 6. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000

## 🐳 Docker Deployment

### Development with Docker Compose

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

### Production Deployment

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.prod.yml up -d
```

## 📊 Database Schema

The application uses PostgreSQL with the following main tables:

- **users**: User accounts with role-based access
- **n8n_instances**: Saved n8n instance configurations (encrypted)
- **workflow_generations**: Complete history of workflow generations
- **credential_guidance_templates**: Admin-managed credential setup instructions
- **node_cache**: Cached n8n node information

## 🔐 Security Features

- **Encrypted API Keys**: AES-256 encryption for stored n8n API keys
- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access Control**: Employee and Admin roles
- **Rate Limiting**: Prevents abuse of workflow generation
- **Audit Logging**: Complete audit trail of all operations
- **No Credential Exposure**: API keys never logged or exposed in UI
- **SQL Injection Prevention**: Parameterized queries via Prisma ORM
- **XSS Protection**: Input sanitization and output encoding

## 👥 User Roles

### Employee
- Create workflows for any customer n8n instance
- View their own workflow history
- Manage their profile and n8n instances
- Access credential guidance

### Admin
- All employee permissions
- Access admin dashboard
- View company-wide audit log
- Manage user accounts (activate/deactivate)
- Manage credential guidance templates
- View system statistics

## 📖 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and receive JWT
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/me` - Get current user

### Workflow Endpoints
- `POST /api/workflows/generate` - Generate and create workflow
- `GET /api/workflows/history` - Get user's workflow history
- `GET /api/workflows/:id` - Get workflow details
- `POST /api/workflows/:id/retry` - Retry failed workflow

### n8n Instance Endpoints
- `GET /api/n8n-instances` - List saved instances
- `POST /api/n8n-instances` - Save new instance
- `PUT /api/n8n-instances/:id` - Update instance
- `DELETE /api/n8n-instances/:id` - Delete instance
- `POST /api/n8n-instances/validate` - Validate credentials

### Admin Endpoints (Admin Only)
- `GET /api/admin/users` - List all users
- `PUT /api/admin/users/:id/activate` - Activate user
- `PUT /api/admin/users/:id/deactivate` - Deactivate user
- `GET /api/admin/audit-log` - Get audit log
- `GET /api/admin/statistics` - Get system statistics

## 🧪 Testing

### Run Backend Tests
```bash
cd backend
npm test
```

### Run Frontend Tests
```bash
cd frontend
npm test
```

### Run E2E Tests
```bash
npm run test:e2e
```

## 📝 Creating Your First Workflow

1. **Register/Login**: Create an account or login at http://localhost:5173
2. **Add n8n Instance**:
   - Navigate to "Create Workflow"
   - Enter your n8n instance URL and API key
   - Check "Save this instance" for future use
3. **Describe Workflow**:
   - Enter natural language description (e.g., "Send a webhook POST to Slack when data received")
   - Click "Generate Workflow"
4. **Watch Real-Time Progress**:
   - See live updates as nodes are discovered
   - AI generates the workflow
   - Workflow is created in your n8n instance
5. **View & Use**:
   - Click "View in n8n" to see your workflow
   - Follow credential setup guidance if needed
   - Activate and use your workflow!

## 🔧 Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL is running
psql -U postgres -c "SELECT 1"

# Verify DATABASE_URL in backend/.env
# Format: postgresql://user:password@host:port/database
```

### Port Already in Use
```bash
# Find and kill process using port 3000 (backend)
lsof -ti:3000 | xargs kill -9

# Find and kill process using port 5173 (frontend)
lsof -ti:5173 | xargs kill -9
```

### Prisma Migration Issues
```bash
cd backend
# Reset database (WARNING: destroys all data)
npx prisma migrate reset

# Create new migration
npx prisma migrate dev --name init
```

### Gemini API Issues
- Verify `GEMINI_API_KEY` is set correctly in backend/.env
- Check API quota in Google Cloud Console
- Ensure billing is enabled for your Google Cloud project

### n8n Connection Issues
- Verify n8n instance is accessible from your network
- Check API key has correct permissions
- Ensure n8n API is enabled in your instance

## 🤝 Contributing

This is a production application for RISE. For development:

1. Create a feature branch
2. Make your changes
3. Write/update tests
4. Submit pull request with clear description

## 📄 License

Proprietary - RISE Internal Use Only

## 🆘 Support

For issues or questions:
- Internal: Contact RISE DevOps team
- Email: support@rise.com
- Slack: #n8n-workflow-builder

## 🗺️ Roadmap

- [ ] Google SSO integration for RISE workspace
- [ ] Workflow templates library
- [ ] Advanced workflow editing after generation
- [ ] Bulk workflow operations
- [ ] Workflow scheduling integration
- [ ] Multi-language support
- [ ] Advanced analytics dashboard
- [ ] Workflow marketplace

---

**Version**: 1.0.0
**Last Updated**: January 2026
**Maintained by**: RISE Development Team
