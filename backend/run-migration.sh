#!/bin/bash
cd backend
npx prisma migrate dev --name add_password_reset_tokens --skip-generate
npx prisma generate
