# Vertex AI Migration + Multi-User Credential UX Design

**Date:** 2026-03-02
**Status:** Approved

---

## Overview

Migrate from Gemini API (direct API key) to **Vertex AI** (service account JWT auth) using model `gemini-3-1-pro-preview`. Support both server-default credentials (from `.env`) and optional per-user credentials (stored in browser `localStorage`).

---

## Backend Changes

### Auth Flow (`gemini.service.ts`)

1. Accept `vertexSaEmail` + `vertexPrivateKey` (user-provided or server `.env` defaults)
2. Extract `projectId` from SA email: `email.split('@')[1].split('.')[0]`
   - Example: `gilad-sa-vertex-ai@rise-vertex-ai.iam.gserviceaccount.com` → `rise-vertex-ai`
3. Sign a JWT using Node.js `crypto` (RS256):
   - `iss` = SA email
   - `sub` = SA email
   - `aud` = `https://oauth2.googleapis.com/token`
   - `scope` = `https://www.googleapis.com/auth/cloud-platform`
   - `iat` = now, `exp` = now + 3600
4. POST JWT to `https://oauth2.googleapis.com/token` to get Bearer token
5. Cache token keyed by SA email (expire 55 min to be safe vs 60 min actual)
6. Call Vertex AI:
   ```
   POST https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{projectId}/locations/{LOCATION}/publishers/google/models/gemini-3-1-pro-preview:generateContent
   Authorization: Bearer {token}
   Content-Type: application/json
   ```

### Request Body Format

```json
{
  "contents": [{ "role": "user", "parts": [{ "text": "..." }] }],
  "generationConfig": {
    "temperature": 0.2,
    "topP": 0.9,
    "topK": 40,
    "maxOutputTokens": 8192
  }
}
```

### What Changes

- **Remove**: `@google/generative-ai` SDK (no longer needed)
- **Remove**: v1beta direct API key path
- **Remove**: `GEMINI_API_KEY`, `GEMINI_MODEL` env vars
- **Add**: JWT signing via Node.js built-in `crypto` (zero new dependencies)
- **Add**: Bearer token cache (Map keyed by SA email) to avoid re-fetching per request
- **Add**: `VERTEX_SA_EMAIL`, `VERTEX_PRIVATE_KEY`, `VERTEX_LOCATION` env vars
- **Model**: `gemini-3-1-pro-preview` (hardcoded as latest)

### Controller/Service Signature Changes

`generateWorkflow(description, availableNodes, vertexSaEmail?, vertexPrivateKey?)` — replaces old `customApiKey` parameter pattern.

---

## Frontend Changes

### Credential Fields (both pages)

Both `SimplifiedWorkflowPage.tsx` and `WorkflowCreatePage.tsx` get a collapsible **"Use custom AI credentials"** section:

| Field | Input Type | localStorage Key | Placeholder |
|-------|-----------|-----------------|-------------|
| Service Account Email | `text` | `rise_vertex_sa_email` | `name@project-id.iam.gserviceaccount.com` |
| Private Key | `textarea` + show/hide toggle | `rise_vertex_private_key` | `-----BEGIN PRIVATE KEY-----` |

**Tooltip content (❓ icon):**

- **Email:** `Your GCP service account email. Format: name@project-id.iam.gserviceaccount.com — found in GCP Console → IAM & Admin → Service Accounts.`
- **Private Key:** `The private key from your service account. Paste the full block starting with -----BEGIN PRIVATE KEY----- and ending with -----END PRIVATE KEY-----. Found in the downloaded JSON key file under "private_key".`

**Behavior:**
- Section is **collapsed by default** — casual users aren't overwhelmed
- On expand: pre-populated from `localStorage`
- On generate: saved to `localStorage` (if non-empty)
- If both fields empty → backend uses server `.env` credentials
- Private key shown as password field (dots) with a 👁️ toggle button

---

## Environment Variables

### Remove
```
GEMINI_API_KEY
GEMINI_MODEL
```

### Add
```env
VERTEX_SA_EMAIL=gilad-sa-vertex-ai@rise-vertex-ai.iam.gserviceaccount.com
VERTEX_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
VERTEX_LOCATION=us-central1
```

---

## Security Notes

- Private keys are **never stored in DB** — localStorage only (browser-side, per-user)
- Server credentials are loaded from `.env` at startup (never exposed to frontend)
- Token cache is in-memory only, cleared on server restart
- No new dependencies required (JWT signing uses Node.js built-in `crypto`)

---

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/services/gemini.service.ts` | Full rewrite of auth + API call layer |
| `backend/.env` | Swap GEMINI_ vars for VERTEX_ vars |
| `backend/src/controllers/public.controller.ts` | Update param names (apiKey → vertexSaEmail/vertexPrivateKey) |
| `frontend/src/pages/SimplifiedWorkflowPage.tsx` | Add collapsible credential section |
| `frontend/src/pages/WorkflowCreatePage.tsx` | Add collapsible credential section |
| `ARCHITECTURE.md` | Update AI section to reflect Vertex AI |
| `MEMORY.md` | Update AI chain notes |
