#!/bin/bash

# RISE n8n Workflow AI Builder - Development Environment Setup Script
# This script sets up and runs the development environment

set -e  # Exit on error

echo "======================================"
echo "RISE n8n Workflow AI Builder Setup"
echo "======================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js version
echo "Checking Node.js version..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed. Please install Node.js 20+${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}Error: Node.js version must be 20 or higher. Current version: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v) detected${NC}"

# Check PostgreSQL
echo "Checking PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}Warning: PostgreSQL command-line tools not found.${NC}"
    echo -e "${YELLOW}Please ensure PostgreSQL 15+ is installed and running.${NC}"
else
    echo -e "${GREEN}✓ PostgreSQL tools detected${NC}"
fi

# Check if .env files exist
echo ""
echo "Checking environment configuration..."

if [ ! -f "backend/.env" ]; then
    if [ -f "backend/.env.example" ]; then
        echo -e "${YELLOW}Creating backend/.env from backend/.env.example${NC}"
        cp backend/.env.example backend/.env
        echo -e "${YELLOW}⚠ Please edit backend/.env with your actual configuration values:${NC}"
        echo "  - DATABASE_URL (PostgreSQL connection string)"
        echo "  - JWT_SECRET (random secure string)"
        echo "  - GEMINI_API_KEY (Google Gemini API key)"
        echo "  - N8N_API_URL (for testing, e.g., https://your-n8n.instance.com)"
        echo "  - N8N_API_KEY (for testing)"
    else
        echo -e "${RED}Error: backend/.env.example not found. Cannot create .env${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ backend/.env exists${NC}"
fi

if [ ! -f "frontend/.env" ]; then
    if [ -f "frontend/.env.example" ]; then
        echo -e "${YELLOW}Creating frontend/.env from frontend/.env.example${NC}"
        cp frontend/.env.example frontend/.env
    fi
fi

# Install backend dependencies
echo ""
echo "Installing backend dependencies..."
cd backend
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}✓ Backend dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Backend dependencies already installed${NC}"
fi

# Run database migrations
echo ""
echo "Running database migrations..."
if command -v npx &> /dev/null; then
    npx prisma generate
    npx prisma migrate deploy
    echo -e "${GREEN}✓ Database migrations completed${NC}"
else
    echo -e "${YELLOW}Warning: Could not run Prisma migrations. Run manually: npx prisma migrate deploy${NC}"
fi

cd ..

# Install frontend dependencies
echo ""
echo "Installing frontend dependencies..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Frontend dependencies already installed${NC}"
fi
cd ..

# Check if we should start servers
echo ""
echo "======================================"
echo "Setup Complete!"
echo "======================================"
echo ""
echo "To start the development servers:"
echo ""
echo "Terminal 1 - Backend:"
echo "  cd backend && npm run dev"
echo ""
echo "Terminal 2 - Frontend:"
echo "  cd frontend && npm run dev"
echo ""
echo "Or use the provided npm scripts from the root:"
echo "  npm run dev:backend"
echo "  npm run dev:frontend"
echo ""
echo "Access the application at:"
echo "  Frontend: http://localhost:5173"
echo "  Backend API: http://localhost:3000"
echo ""
echo "First-time setup:"
echo "  1. Ensure PostgreSQL is running"
echo "  2. Configure backend/.env with your credentials"
echo "  3. Run 'npx prisma migrate deploy' in backend/"
echo "  4. Create an admin user (see README.md)"
echo ""
echo "For Docker deployment:"
echo "  docker-compose up --build"
echo ""
echo "======================================"

# Ask if user wants to start servers now
read -p "Start development servers now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Starting servers..."
    echo "Press Ctrl+C to stop"
    echo ""

    # Start backend in background
    cd backend
    npm run dev &
    BACKEND_PID=$!
    cd ..

    # Wait a moment for backend to start
    sleep 3

    # Start frontend
    cd frontend
    npm run dev &
    FRONTEND_PID=$!
    cd ..

    # Trap Ctrl+C to kill both processes
    trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

    echo ""
    echo "Servers running:"
    echo "  Backend PID: $BACKEND_PID"
    echo "  Frontend PID: $FRONTEND_PID"
    echo ""
    echo "Press Ctrl+C to stop both servers"

    # Wait for both processes
    wait
fi
