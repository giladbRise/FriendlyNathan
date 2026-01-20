-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('employee', 'admin');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('pending', 'in_progress', 'success', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'employee',
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "n8n_instances" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "api_key_encrypted" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "n8n_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_generations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "n8n_instance_id" TEXT,
    "n8n_url" VARCHAR(500) NOT NULL,
    "workflow_description" TEXT NOT NULL,
    "generated_workflow_json" JSONB,
    "n8n_workflow_id" VARCHAR(255),
    "n8n_workflow_url" VARCHAR(500),
    "status" "WorkflowStatus" NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "nodes_discovered_count" INTEGER,
    "nodes_used_count" INTEGER,
    "credentials_required" JSONB,
    "ai_tokens_used" INTEGER,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "workflow_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_guidance_templates" (
    "id" TEXT NOT NULL,
    "credential_type" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "instructions_markdown" TEXT NOT NULL,
    "video_url" VARCHAR(500),
    "documentation_url" VARCHAR(500),
    "contact_info" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credential_guidance_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_cache" (
    "id" TEXT NOT NULL,
    "n8n_url" VARCHAR(500) NOT NULL,
    "nodes_json" JSONB NOT NULL,
    "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "node_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "n8n_instances_user_id_idx" ON "n8n_instances"("user_id");

-- CreateIndex
CREATE INDEX "workflow_generations_user_id_idx" ON "workflow_generations"("user_id");

-- CreateIndex
CREATE INDEX "workflow_generations_status_idx" ON "workflow_generations"("status");

-- CreateIndex
CREATE INDEX "workflow_generations_created_at_idx" ON "workflow_generations"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "credential_guidance_templates_credential_type_key" ON "credential_guidance_templates"("credential_type");

-- CreateIndex
CREATE INDEX "credential_guidance_templates_credential_type_idx" ON "credential_guidance_templates"("credential_type");

-- CreateIndex
CREATE UNIQUE INDEX "node_cache_n8n_url_key" ON "node_cache"("n8n_url");

-- CreateIndex
CREATE INDEX "node_cache_n8n_url_idx" ON "node_cache"("n8n_url");

-- CreateIndex
CREATE INDEX "node_cache_expires_at_idx" ON "node_cache"("expires_at");

-- AddForeignKey
ALTER TABLE "n8n_instances" ADD CONSTRAINT "n8n_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_generations" ADD CONSTRAINT "workflow_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_generations" ADD CONSTRAINT "workflow_generations_n8n_instance_id_fkey" FOREIGN KEY ("n8n_instance_id") REFERENCES "n8n_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
