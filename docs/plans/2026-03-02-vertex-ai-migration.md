# Vertex AI Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from Gemini API key auth to Vertex AI service account JWT auth with model `gemini-3-1-pro-preview`, and update both frontend pages to replace the Gemini API key field with Vertex AI SA Email + Private Key fields (with helpful tooltips).

**Architecture:** The backend `GeminiService` is fully rewritten to use service account JWT → Bearer token exchange (via `crypto` module, zero new deps). Credentials flow: `.env` defaults → optional per-request override via request body. Frontend stores SA email + private key in localStorage, same pattern as existing n8n credentials.

**Tech Stack:** Node.js `crypto` (built-in), fetch (built-in), React, localStorage, TypeScript

---

## Task 1: Update backend `.env` with Vertex AI credentials

**Files:**
- Modify: `backend/.env`

**Step 1: Replace Gemini env vars with Vertex AI vars**

Open `backend/.env` and replace lines 9-11:
```
# Google Gemini API
GEMINI_API_KEY="dev-gemini-key-placeholder"
GEMINI_MODEL="gemini-3-flash-preview"
```

With:
```
# Vertex AI Configuration
VERTEX_SA_EMAIL="gilad-sa-vertex-ai@rise-vertex-ai.iam.gserviceaccount.com"
VERTEX_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCJ6/Nd5OqOr9xm\nnk3vhmRpjOjLFHI51IjcdYUJ0EMANSa65lXB+e3FqnITA9AqSU2QF3QbkWtNnqse\ndTDYQjbEdm8q8/uqXuBwIIkEsjNj3kGcRU76OiBRs8IawHPCfh31IQ9M9R9BDnR8\nVcXsfxJr7bX1UeyviMraZG0LIi7rg7R/GGZp0L9ADt39uZ7X5eZ5ZH4APzd6HZ1z\n7bh8ZoT1HcP/mmkJSFEUdVI9Hr6PBE6VbOxAFB49E1SfDJgGBjJXbT7P9gg9g12a\nZ9iEtqN1d+k9RnaCZveE55EdmDQmiMgBlfQDtUkNnqE9ZZZISZ/JqphD3kpJKOSS\nSJQDfgKxAgMBAAECggEAFCjwmFNrM7MiAL/3/WCEEeeeaXzSG4DlBnCJIz+VY5Th\nVeVwOJvbNQ7ugLgId/3iAANlndf6OszMD3YqzxmSntH++uTR7vvSS6F91blkiJ8G\nsRxyaGIRsk+XukhSQ2Yi499SuLmFuYEu5rO07BZA75S+CZ9RfPD+UcDnLX7wI82U\nJuZzMzsV7HiM29YGhsiDr4ll+rJ5dpvfrmixqYA1C9FVBNyKYPujKwV4yOhv8Zaq\nzutiOKQB6IaedWUP7oqOWmtUrdyb8FZLoJwyu1xpb7i/vcTbxu//6uRuycQpNWQc\n2IDi41ZeOYmCf6RnZEm/stb3iGrRY4mAWAvZLfz7SQKBgQC+pFWtrG3+I85875N/\nT2P7xl10vu2eXkEG9TeE+kjEvnKauhfCU+YWX+iZl3ndpRHIK6WdE5+vr5uYcAaw\nRh/W9H0sLwxxuZJANJRWdAEqe+/CwJw3ZuxzAp3kh2fMSPA2bsgcikWx41rYAeff\nxQGcUNvcHoxUZkG1ZVFoT0zQZQKBgQC5NKE772Q/Kilw/FPIywj+I7SzLOqZvA+6\ntiBwg2pyWnEKnT4m3/scnC/xEGZBZjJG+2rywyg9vaZeUPLDKXxR7UuEzPIJuQyM\nNdJZjO4otNjNtdMNa4WqUALWjQ0JnA+QJ2wCTnh84oTG+F0YgO0FBP7vQg1aPOKC\nxCZfRY02XQKBgENzuazdWX2WBbVGvxVIbcPjh6WK+GAUUUW49Y/jTmPuTnZYaZek\nP8Ci5pWRdtjpUsVUTCCrlNCAfbkNyhAMf696id9cNjb2xbxZ3jJIkTEK8OYjaCJi\nFD8NKfh1wFATboqT39HZSpeKLdZHtlcCSXOZWHEljdk+5PjdhFQ32qHRAoGAIIS4\nJqDi1iBeBGOZhnD31D+Ks8cYLgQSMvNVgMviPc/Zd0aiqgq7uYtG86mwep0qCMKO\nRa+0ehq5gmfuKAw5stzaXKfre3+NT3UHyQdwrZ8LThs1wm51mrDPvsInXt+S7/ms\nAj+q8iqHq7PiDLJea3o0FOhhFc4I63LrVeENaVUCgYB5DtqHP6YlfaGrg4gmI3Jr\n8yGLYxTTIu+C2RDfbVDsO+kA6o/IsJ6SoVmieF/l4iBMrhsozAFWMsI7Lapdg3tw\nb5imHdEf8Au3JJ+cXTifLMb9aZI0cCmLEW3rzx1RrAGFtQOs4TTr3Ac+VaPy8DOe\nWoBoWDYYR89TGR+QkWvUnw==\n-----END PRIVATE KEY-----\n"
VERTEX_LOCATION="us-central1"
```

**Step 2: Verify the file looks correct**

Run: `cat backend/.env | grep VERTEX`
Expected output: 3 lines with VERTEX_SA_EMAIL, VERTEX_PRIVATE_KEY, VERTEX_LOCATION

**Step 3: Commit**

```bash
git add backend/.env
git commit -m "chore: switch env config from Gemini API key to Vertex AI service account"
```

---

## Task 2: Rewrite `gemini.service.ts` for Vertex AI

**Files:**
- Modify: `backend/src/services/gemini.service.ts`

This is the core change. The entire auth + API call layer is replaced. The prompts, parsing, workflow logic, and fallback workflow are **unchanged** — only the methods that handle credentials and API calls change.

**Step 1: Replace the top of the file (imports + class fields + constructor + initializeModel + isAvailable)**

Replace lines 1-151 (from `import { GoogleGenerativeAI...` through `isAvailable(): boolean { ... }`) with:

```typescript
import crypto from 'crypto';

// ─── Interfaces (unchanged) ────────────────────────────────────────────────

interface N8nNode {
  name: string;
  displayName: string;
  description?: string;
  version: number;
  group?: string[];
  credentials?: string[];
}

interface NodeProperty {
  name: string;
  displayName: string;
  type: string;
  default?: any;
  description?: string;
  required?: boolean;
  options?: Array<{ name: string; value: string; description?: string }>;
}

interface NodeTypeDetails {
  name: string;
  displayName: string;
  description?: string;
  version: number;
  properties?: NodeProperty[];
  credentials?: Array<{ name: string; required?: boolean }>;
}

interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, any>;
}

interface WorkflowConnection {
  main: Array<Array<{ node: string; type: string; index: number }>>;
  ai_model?: Array<Array<{ node: string; type: string; index: number }>>;
}

interface N8nWorkflow {
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, WorkflowConnection>;
  active: boolean;
  settings?: Record<string, any>;
}

interface GeneratedWorkflow {
  workflow: N8nWorkflow;
  explanation: string;
  nodeCount: number;
}

export interface WorkflowIntent {
  sender?: string | null;
  days?: number | null;
  slackChannel?: string | null;
  spreadsheetId?: string | null;
  spreadsheetGid?: string | null;
  wantsMarkUnread?: boolean;
  wantsGeminiSummary?: boolean;
  wantsSlack?: boolean;
  wantsEmail?: boolean;
  wantsSpreadsheet?: boolean;
  wantsGoogleSheets?: boolean;
  requestedNodeTypes?: string[];
}

export interface VerificationResult {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  analysis: string;
}

// ─── Vertex AI Auth Helpers ────────────────────────────────────────────────

const VERTEX_MODEL = 'gemini-3-1-pro-preview';
const TOKEN_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_CACHE_TTL_MS = 55 * 60 * 1000; // 55 minutes (tokens last 60)

interface CachedToken {
  token: string;
  expiresAt: number;
}

/** Extract GCP project ID from service account email: name@project-id.iam.gserviceaccount.com */
function projectIdFromEmail(saEmail: string): string {
  const parts = saEmail.split('@');
  if (parts.length !== 2) throw new Error('Invalid service account email format');
  const domain = parts[1]; // project-id.iam.gserviceaccount.com
  return domain.split('.')[0]; // project-id
}

/** Sign a JWT for Google OAuth2 service account flow using RS256 */
function signServiceAccountJwt(saEmail: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: saEmail,
    sub: saEmail,
    aud: TOKEN_URL,
    scope: TOKEN_SCOPE,
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const toSign = `${header}.${payload}`;
  // Normalize private key: handle \n as literal or as newlines
  const pem = privateKey.replace(/\\n/g, '\n');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(toSign);
  sign.end();
  const signature = sign.sign(pem, 'base64url');
  return `${toSign}.${signature}`;
}

/** Exchange a signed JWT for a Google OAuth2 Bearer access token */
async function fetchAccessToken(saEmail: string, privateKey: string): Promise<string> {
  const jwt = signServiceAccountJwt(saEmail, privateKey);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error(`Vertex AI token exchange failed: ${data?.error_description || data?.error || res.status}`);
  }
  return data.access_token as string;
}

// ─── GeminiService ─────────────────────────────────────────────────────────

/**
 * Gemini AI Service — now using Vertex AI with service account JWT auth.
 * Model: gemini-3-1-pro-preview
 * Auth: Service account email + private key → OAuth2 Bearer token (cached 55 min)
 */
export class GeminiService {
  private serverSaEmail: string | null = null;
  private serverPrivateKey: string | null = null;

  /** Token cache keyed by SA email to avoid re-fetching every request */
  private tokenCache = new Map<string, CachedToken>();

  /** Generation config for structured JSON outputs (low temperature for consistency) */
  private readonly structuredGenerationConfig = {
    temperature: 0.2,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 8192,
  };

  /** Max retries for transient errors (429, 503) */
  private readonly MAX_RETRIES = 3;

  constructor() {
    const email = process.env.VERTEX_SA_EMAIL;
    const key = process.env.VERTEX_PRIVATE_KEY;
    if (email && key && email !== 'your-sa@project.iam.gserviceaccount.com') {
      this.serverSaEmail = email;
      this.serverPrivateKey = key;
      console.log(`Vertex AI initialized with SA: ${email}`);
    } else {
      console.warn('Vertex AI credentials not configured in VERTEX_SA_EMAIL / VERTEX_PRIVATE_KEY');
    }
  }

  /** Returns true if server-level Vertex AI credentials are configured */
  isAvailable(): boolean {
    return this.serverSaEmail !== null && this.serverPrivateKey !== null;
  }

  /** Get a cached or fresh Bearer token for the given SA credentials */
  private async getBearerToken(saEmail: string, privateKey: string): Promise<string> {
    const cached = this.tokenCache.get(saEmail);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }
    const token = await fetchAccessToken(saEmail, privateKey);
    this.tokenCache.set(saEmail, { token, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
    return token;
  }

  /** Resolve which SA credentials to use: custom (user-provided) or server defaults */
  private resolveCredentials(customSaEmail?: string, customPrivateKey?: string): { saEmail: string; privateKey: string } {
    if (customSaEmail && customPrivateKey) {
      return { saEmail: customSaEmail, privateKey: customPrivateKey };
    }
    if (this.serverSaEmail && this.serverPrivateKey) {
      return { saEmail: this.serverSaEmail, privateKey: this.serverPrivateKey };
    }
    throw new Error('Vertex AI not available. Please provide service account credentials.');
  }
```

**Step 2: Replace `fixWorkflow` method signature and `apiKey` references**

The `fixWorkflow`, `verifyWorkflow`, `generateWorkflow`, and `analyzeWorkflowIntent` methods use `customApiKey?: string`. Replace ALL occurrences with `customSaEmail?: string, customPrivateKey?: string` and replace the `apiKey` resolution line.

For each public method, the pattern changes from:
```typescript
// OLD
async fixWorkflow(..., customApiKey?: string) {
  const apiKey = customApiKey || this.apiKey;
  if (!apiKey) { ... return fallback }
  ...
  const text = await this.generateWithFallback(prompt, apiKey, customApiKey !== undefined);
```

To:
```typescript
// NEW
async fixWorkflow(..., customSaEmail?: string, customPrivateKey?: string) {
  let credentials: { saEmail: string; privateKey: string };
  try {
    credentials = this.resolveCredentials(customSaEmail, customPrivateKey);
  } catch {
    return { workflow, fixesApplied: [] };
  }
  ...
  const text = await this.callVertexAI(prompt, credentials.saEmail, credentials.privateKey);
```

Apply this pattern to: `fixWorkflow`, `verifyWorkflow`, `generateWorkflow`, `analyzeWorkflowIntent`.

**Step 3: Replace `generateWithFallback` and `generateWithV1Beta` with `callVertexAI`**

Delete the entire `generateWithFallback` method (lines 396-472) and `generateWithV1Beta` method (lines 474-515) and `getModelCandidates` method (lines 356-366).

Replace them all with a single `callVertexAI` method:

```typescript
/** Call Vertex AI Gemini with retry logic for transient errors */
private async callVertexAI(prompt: string, saEmail: string, privateKey: string): Promise<string> {
  const projectId = projectIdFromEmail(saEmail);
  const location = process.env.VERTEX_LOCATION || 'us-central1';
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${VERTEX_MODEL}:generateContent`;

  for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
    try {
      const token = await this.getBearerToken(saEmail, privateKey);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: this.structuredGenerationConfig,
        }),
      });

      const data = await res.json() as any;

      if (!res.ok) {
        const errMsg = data?.error?.message || `Vertex AI error (${res.status})`;
        // If token expired (401), clear cache and retry
        if (res.status === 401) {
          this.tokenCache.delete(saEmail);
          throw new Error(errMsg);
        }
        if (res.status === 429 || res.status === 503 || res.status === 500) {
          throw new Error(errMsg); // will be retried below
        }
        throw new Error(errMsg); // non-retryable
      }

      const text = data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || '')
        .join('');

      if (!text) throw new Error('Vertex AI returned empty response');
      return text;

    } catch (err: any) {
      const isRetryable = err.message?.includes('429') ||
        err.message?.includes('503') ||
        err.message?.includes('500') ||
        err.message?.includes('rate limit') ||
        err.message?.includes('quota') ||
        err.message?.includes('overloaded') ||
        err.message?.includes('unavailable') ||
        err.message?.includes('token expired') ||
        err.message?.includes('401');

      if (isRetryable && attempt < this.MAX_RETRIES - 1) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`Vertex AI transient error (attempt ${attempt + 1}/${this.MAX_RETRIES}), retrying in ${backoffMs}ms:`, err.message);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Vertex AI: max retries exceeded');
}
```

**Step 4: Also remove `isModelNotFoundError`, `isRetryableError`, `sleep` private methods** (lines 368-394) — they are replaced by inline logic in `callVertexAI`.

**Step 5: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add backend/src/services/gemini.service.ts
git commit -m "feat: migrate GeminiService to Vertex AI JWT auth with gemini-3-1-pro-preview"
```

---

## Task 3: Update `public.controller.ts` — rename `geminiApiKey` → Vertex AI params

**Files:**
- Modify: `backend/src/controllers/public.controller.ts`

**Step 1: Update the Zod schema**

Replace `geminiApiKey: z.string().optional()` in `generateWorkflowSchema` with:
```typescript
vertexSaEmail: z.string().optional(),
vertexPrivateKey: z.string().optional(),
```

Also update `previewWorkflowSchema` (it extends `generateWorkflowSchema` via `.omit({ socketId: true })` — this extends automatically).

**Step 2: Update `generateWorkflowPublic`**

Replace the `publicWorkflowService.generateWorkflow(...)` call from:
```typescript
const result = await publicWorkflowService.generateWorkflow(
  validatedData.n8nUrl,
  validatedData.n8nApiKey,
  validatedData.description,
  validatedData.socketId,
  validatedData.geminiApiKey
);
```

To:
```typescript
const result = await publicWorkflowService.generateWorkflow(
  validatedData.n8nUrl,
  validatedData.n8nApiKey,
  validatedData.description,
  validatedData.socketId,
  validatedData.vertexSaEmail,
  validatedData.vertexPrivateKey
);
```

**Step 3: Update `previewWorkflowPublic`**

Replace:
```typescript
const result = await publicWorkflowService.previewWorkflow(
  validatedData.n8nUrl,
  validatedData.n8nApiKey,
  validatedData.description,
  validatedData.geminiApiKey
);
```

With:
```typescript
const result = await publicWorkflowService.previewWorkflow(
  validatedData.n8nUrl,
  validatedData.n8nApiKey,
  validatedData.description,
  validatedData.vertexSaEmail,
  validatedData.vertexPrivateKey
);
```

**Step 4: Compile check**

Run: `cd backend && npx tsc --noEmit`
Expected: Errors about `publicWorkflowService.generateWorkflow` and `previewWorkflow` signatures — these get fixed in Task 4.

**Step 5: Commit after Task 4 passes compilation**

---

## Task 4: Update `publicWorkflow.service.ts` — rename `geminiApiKey` throughout

**Files:**
- Modify: `backend/src/services/publicWorkflow.service.ts`

**Step 1: Find all occurrences of `geminiApiKey`**

Run: `grep -n "geminiApiKey" backend/src/services/publicWorkflow.service.ts`

This will show every line that needs updating (expect ~15-20 occurrences).

**Step 2: Update `generateWorkflow` method signature**

Find: `async generateWorkflow(n8nUrl: string, n8nApiKey: string, description: string, socketId?: string, geminiApiKey?: string)`
Replace with: `async generateWorkflow(n8nUrl: string, n8nApiKey: string, description: string, socketId?: string, vertexSaEmail?: string, vertexPrivateKey?: string)`

**Step 3: Update `previewWorkflow` method signature**

Find: `async previewWorkflow(n8nUrl: string, n8nApiKey: string, description: string, geminiApiKey?: string)`
Replace with: `async previewWorkflow(n8nUrl: string, n8nApiKey: string, description: string, vertexSaEmail?: string, vertexPrivateKey?: string)`

**Step 4: Update all `geminiService.*` calls in the service**

Every call like `geminiService.generateWorkflow(..., geminiApiKey)` becomes `geminiService.generateWorkflow(..., vertexSaEmail, vertexPrivateKey)`.

Every call like `geminiService.verifyWorkflow(..., geminiApiKey)` becomes `geminiService.verifyWorkflow(..., vertexSaEmail, vertexPrivateKey)`.

Every call like `geminiService.analyzeWorkflowIntent(..., geminiApiKey)` becomes `geminiService.analyzeWorkflowIntent(..., vertexSaEmail, vertexPrivateKey)`.

Every call like `geminiService.fixWorkflow(..., geminiApiKey)` becomes `geminiService.fixWorkflow(..., vertexSaEmail, vertexPrivateKey)`.

**Step 5: Update `hasGeminiKey` variable** (line ~348)

Find: `const hasGeminiKey = !!(geminiApiKey || geminiService.isAvailable());`
Replace: `const hasVertexCredentials = !!((vertexSaEmail && vertexPrivateKey) || geminiService.isAvailable());`

Then update all references from `hasGeminiKey` to `hasVertexCredentials`.

**Step 6: Compile check**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add backend/src/controllers/public.controller.ts backend/src/services/publicWorkflow.service.ts
git commit -m "feat: rename geminiApiKey → vertexSaEmail/vertexPrivateKey throughout backend"
```

---

## Task 5: Update `SimplifiedWorkflowPage.tsx` — replace Gemini key field with Vertex AI fields

**Files:**
- Modify: `frontend/src/pages/SimplifiedWorkflowPage.tsx`

**Step 1: Update STORAGE_KEYS constant** (line 47-51)

Replace:
```typescript
const STORAGE_KEYS = {
  N8N_URL: 'rise_n8n_url',
  N8N_API_KEY: 'rise_n8n_api_key',
  GEMINI_API_KEY: 'rise_gemini_api_key',
};
```

With:
```typescript
const STORAGE_KEYS = {
  N8N_URL: 'rise_n8n_url',
  N8N_API_KEY: 'rise_n8n_api_key',
  VERTEX_SA_EMAIL: 'rise_vertex_sa_email',
  VERTEX_PRIVATE_KEY: 'rise_vertex_private_key',
};
```

**Step 2: Update state declarations** (around line 268-273)

Replace:
```typescript
const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) || '');
const [showApiKeys, setShowApiKeys] = useState(false);
const [showGeminiKey, setShowGeminiKey] = useState(false);
```

With:
```typescript
const [vertexSaEmail, setVertexSaEmail] = useState(() => localStorage.getItem(STORAGE_KEYS.VERTEX_SA_EMAIL) || '');
const [vertexPrivateKey, setVertexPrivateKey] = useState(() => localStorage.getItem(STORAGE_KEYS.VERTEX_PRIVATE_KEY) || '');
const [showApiKeys, setShowApiKeys] = useState(false);
const [showVertexKey, setShowVertexKey] = useState(false);
const [showVertexSection, setShowVertexSection] = useState(false);
```

**Step 3: Update localStorage persist effects** (around line 310-313)

Replace:
```typescript
useEffect(() => { localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, geminiApiKey); }, [geminiApiKey]);
```

With:
```typescript
useEffect(() => { localStorage.setItem(STORAGE_KEYS.VERTEX_SA_EMAIL, vertexSaEmail); }, [vertexSaEmail]);
useEffect(() => { localStorage.setItem(STORAGE_KEYS.VERTEX_PRIVATE_KEY, vertexPrivateKey); }, [vertexPrivateKey]);
```

**Step 4: Update the preview/generate API call** (around line 393-395)

Replace `geminiApiKey: geminiApiKey.trim() || undefined` with:
```typescript
vertexSaEmail: vertexSaEmail.trim() || undefined,
vertexPrivateKey: vertexPrivateKey.trim() || undefined,
```

**Step 5: Update handleClearCredentials** (around line 457-461)

Replace:
```typescript
setGeminiApiKey('');
...
localStorage.removeItem(STORAGE_KEYS.GEMINI_API_KEY);
```

With:
```typescript
setVertexSaEmail('');
setVertexPrivateKey('');
...
localStorage.removeItem(STORAGE_KEYS.VERTEX_SA_EMAIL);
localStorage.removeItem(STORAGE_KEYS.VERTEX_PRIVATE_KEY);
```

**Step 6: Update the "Clear all" button condition** (around line 602)

Replace: `{(n8nApiKey || geminiApiKey) && (`
With: `{(n8nApiKey || vertexSaEmail) && (`

**Step 7: Replace the entire Gemini API Key UI section** (lines 661-691)

Replace this entire block:
```tsx
{/* Gemini API Key */}
<div>
  <label htmlFor="settings-gemini-key" ...>
    Gemini API Key <span ...>(optional)</span>
  </label>
  <div className="relative">
    <input
      id="settings-gemini-key"
      type={showGeminiKey ? 'text' : 'password'}
      value={geminiApiKey}
      onChange={(e) => setGeminiApiKey(e.target.value)}
      placeholder="AIzaSy..."
      ...
    />
    <button ... onClick={() => setShowGeminiKey(!showGeminiKey)}>
      {showGeminiKey ? <EyeOff .../> : <Eye .../>}
    </button>
  </div>
  <p className="mt-1.5 text-[11px] text-muted-foreground">
    From <a href="https://aistudio.google.com/app/apikey" ...>Google AI Studio</a>
  </p>
</div>
```

With this new Vertex AI section:
```tsx
{/* Vertex AI Credentials — collapsible */}
<div>
  <button
    type="button"
    onClick={() => setShowVertexSection(!showVertexSection)}
    className="flex items-center gap-2 text-xs font-semibold text-foreground/70 uppercase tracking-wider hover:text-primary transition-colors w-full text-left"
    disabled={generating}
  >
    <span
      className="transition-transform duration-200"
      style={{ display: 'inline-block', transform: showVertexSection ? 'rotate(90deg)' : 'rotate(0deg)' }}
    >
      ▶
    </span>
    Vertex AI Credentials
    <span className="text-muted-foreground/50 normal-case tracking-normal font-normal">(optional — uses server default if empty)</span>
  </button>

  {showVertexSection && (
    <div className="mt-3 space-y-3 pl-4 border-l-2 border-border">
      {/* Service Account Email */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <label htmlFor="settings-vertex-email" className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
            Service Account Email
          </label>
          <div className="relative group">
            <span className="text-muted-foreground cursor-help text-xs">ⓘ</span>
            <div className="absolute left-0 bottom-6 w-72 p-3 bg-foreground text-background text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
              Your GCP service account email.<br/>
              Format: <code className="text-primary/80">name@project-id.iam.gserviceaccount.com</code><br/><br/>
              Find it in GCP Console → IAM &amp; Admin → Service Accounts. The project ID is extracted automatically from this email.
            </div>
          </div>
        </div>
        <input
          id="settings-vertex-email"
          type="text"
          value={vertexSaEmail}
          onChange={(e) => setVertexSaEmail(e.target.value)}
          placeholder="name@project-id.iam.gserviceaccount.com"
          className="w-full px-4 py-3 border-2 border-border rounded-2xl bg-white text-foreground text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all friendly-focus"
          disabled={generating}
        />
      </div>

      {/* Private Key */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <label htmlFor="settings-vertex-key" className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
            Private Key
          </label>
          <div className="relative group">
            <span className="text-muted-foreground cursor-help text-xs">ⓘ</span>
            <div className="absolute left-0 bottom-6 w-72 p-3 bg-foreground text-background text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
              The private key from your service account JSON file.<br/><br/>
              Paste the full block including:<br/>
              <code className="text-primary/80 break-all">-----BEGIN PRIVATE KEY-----</code><br/>
              ...key data...<br/>
              <code className="text-primary/80 break-all">-----END PRIVATE KEY-----</code><br/><br/>
              Found under <code className="text-primary/80">"private_key"</code> in the downloaded JSON key file from GCP Console.
            </div>
          </div>
        </div>
        <div className="relative">
          <textarea
            id="settings-vertex-key"
            rows={showVertexKey ? 6 : 2}
            value={showVertexKey ? vertexPrivateKey : (vertexPrivateKey ? '••••••••••••••••••••••••••••••••' : '')}
            onChange={(e) => { if (showVertexKey) setVertexPrivateKey(e.target.value); }}
            placeholder="-----BEGIN PRIVATE KEY-----"
            className="w-full px-4 py-3 border-2 border-border rounded-2xl bg-white text-foreground text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all pr-12 friendly-focus resize-none"
            disabled={generating}
            readOnly={!showVertexKey}
          />
          <button
            type="button"
            onClick={() => setShowVertexKey(!showVertexKey)}
            className="absolute right-3 top-3 text-muted-foreground hover:text-primary transition-colors"
            aria-label={showVertexKey ? 'Hide private key' : 'Show private key'}
          >
            {showVertexKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Stored in your browser only. Never sent to our servers beyond this request.
        </p>
      </div>
    </div>
  )}
</div>
```

**Step 8: Verify app compiles**

Run: `cd frontend && npm run build 2>&1 | tail -20`
Expected: No TypeScript errors

**Step 9: Commit**

```bash
git add frontend/src/pages/SimplifiedWorkflowPage.tsx
git commit -m "feat: replace Gemini API key field with Vertex AI SA credentials UI in SimplifiedWorkflowPage"
```

---

## Task 6: Update `WorkflowCreatePage.tsx` — replace Gemini key with Vertex AI fields

**Files:**
- Modify: `frontend/src/pages/WorkflowCreatePage.tsx`

**Step 1: Replace state declaration** (around line 69-70)

Replace:
```typescript
const [geminiApiKey, setGeminiApiKey] = useState('');
const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
```

With:
```typescript
const [vertexSaEmail, setVertexSaEmail] = useState('');
const [vertexPrivateKey, setVertexPrivateKey] = useState('');
const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
const [showVertexKey, setShowVertexKey] = useState(false);
```

**Step 2: Update the generate API call** (around line 301-304)

Replace:
```typescript
geminiApiKey: geminiApiKey.trim() || undefined,
```

With:
```typescript
vertexSaEmail: vertexSaEmail.trim() || undefined,
vertexPrivateKey: vertexPrivateKey.trim() || undefined,
```

**Step 3: Replace the Advanced AI Options UI section** (lines 677-730 approx)

Find the block starting with `{/* Advanced Options - Gemini API Key */}` and replace the entire contents of the expanded section:

```tsx
{/* Advanced Options — Vertex AI Credentials */}
<div className="mt-4">
  <button
    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
    className="text-sm text-primary hover:text-secondary flex items-center gap-1 transition-colors"
    disabled={generating}
  >
    <span className="transform transition-transform" style={{ display: 'inline-block', transform: showAdvancedOptions ? 'rotate(90deg)' : 'rotate(0deg)' }}>
      ▶
    </span>
    Advanced AI Options
  </button>

  {showAdvancedOptions && (
    <div className="mt-3 p-4 bg-primary/10 border border-primary/30 rounded-md">
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Optionally provide your own Vertex AI service account credentials. Leave empty to use the server default.
        </p>

        {/* Service Account Email */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label htmlFor="vertexSaEmail" className="block text-sm font-medium text-foreground">
              Service Account Email <span className="text-muted-foreground">(optional)</span>
            </label>
            <div className="relative group">
              <span className="text-muted-foreground cursor-help text-sm">ⓘ</span>
              <div className="absolute left-0 bottom-6 w-72 p-3 bg-foreground text-background text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                Your GCP service account email.<br/>
                Format: <code>name@project-id.iam.gserviceaccount.com</code><br/><br/>
                Find it in GCP Console → IAM &amp; Admin → Service Accounts.
              </div>
            </div>
          </div>
          <input
            type="text"
            id="vertexSaEmail"
            value={vertexSaEmail}
            onChange={(e) => setVertexSaEmail(e.target.value)}
            placeholder="name@project-id.iam.gserviceaccount.com"
            className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
          />
        </div>

        {/* Private Key */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label htmlFor="vertexPrivateKey" className="block text-sm font-medium text-foreground">
              Private Key <span className="text-muted-foreground">(optional)</span>
            </label>
            <div className="relative group">
              <span className="text-muted-foreground cursor-help text-sm">ⓘ</span>
              <div className="absolute left-0 bottom-6 w-72 p-3 bg-foreground text-background text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                Paste the full private key block from your service account JSON:<br/><br/>
                <code>-----BEGIN PRIVATE KEY-----</code><br/>
                ...key data...<br/>
                <code>-----END PRIVATE KEY-----</code><br/><br/>
                Found under <code>"private_key"</code> in the downloaded JSON key file.
              </div>
            </div>
          </div>
          <div className="relative">
            <textarea
              id="vertexPrivateKey"
              rows={showVertexKey ? 5 : 2}
              value={showVertexKey ? vertexPrivateKey : (vertexPrivateKey ? '••••••••••••••••••••••••••••••••' : '')}
              onChange={(e) => { if (showVertexKey) setVertexPrivateKey(e.target.value); }}
              placeholder="-----BEGIN PRIVATE KEY-----"
              className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-xs pr-10 resize-none"
              readOnly={!showVertexKey}
            />
            <button
              type="button"
              onClick={() => setShowVertexKey(!showVertexKey)}
              className="absolute right-2 top-2 text-muted-foreground hover:text-primary transition-colors"
              aria-label={showVertexKey ? 'Hide key' : 'Show key'}
            >
              {showVertexKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )}
</div>
```

**Step 4: Add EyeOff import if not already present**

Check the imports at the top of WorkflowCreatePage.tsx. If `EyeOff` isn't imported from lucide-react, add it.

**Step 5: Verify app compiles**

Run: `cd frontend && npm run build 2>&1 | tail -20`
Expected: No errors

**Step 6: Commit**

```bash
git add frontend/src/pages/WorkflowCreatePage.tsx
git commit -m "feat: replace Gemini API key field with Vertex AI SA credentials UI in WorkflowCreatePage"
```

---

## Task 7: End-to-end smoke test + final commit

**Step 1: Start the backend**

Run: `cd backend && npm run dev`
Expected: Server starts on port 3000, logs: `Vertex AI initialized with SA: gilad-sa-vertex-ai@rise-vertex-ai.iam.gserviceaccount.com`

**Step 2: Test a workflow generation via curl**

```bash
curl -s -X POST http://localhost:3000/api/public/preview-workflow \
  -H "Content-Type: application/json" \
  -d '{
    "n8nUrl": "https://n8n.risecodes.com",
    "n8nApiKey": "test-key",
    "description": "Send a Gmail email with a daily summary of new Google Sheets rows"
  }' | python3 -m json.tool | head -30
```

Expected: JSON response with `previewId` field (or error with specific n8n connection error — that's fine, it means the AI call worked but n8n wasn't reachable).

**Step 3: Test with user-provided credentials**

```bash
curl -s -X POST http://localhost:3000/api/public/preview-workflow \
  -H "Content-Type: application/json" \
  -d '{
    "n8nUrl": "https://n8n.risecodes.com",
    "n8nApiKey": "test-key",
    "description": "Send Gmail summary to Google Sheets",
    "vertexSaEmail": "gilad-sa-vertex-ai@rise-vertex-ai.iam.gserviceaccount.com",
    "vertexPrivateKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
  }' | python3 -m json.tool | head -10
```

Expected: Response with `previewId` (or n8n connection error).

**Step 4: Start the frontend**

Run: `cd frontend && npm run dev`
Open browser to `http://localhost:5173`

**Step 5: Manual UI test**

1. Open the main page (SimplifiedWorkflowPage)
2. Click the Settings gear icon
3. Verify the Vertex AI Credentials section appears (collapsed by default)
4. Click to expand it
5. Verify two fields appear: "Service Account Email" and "Private Key"
6. Hover the ⓘ icons — verify tooltips appear with correct instructions
7. Enter the SA email in the email field
8. Click 👁️ next to private key to reveal it, then paste a key
9. Verify both values persist after page refresh (localStorage)
10. Check WorkflowCreatePage → Advanced AI Options — same Vertex AI fields

**Step 6: Push to GitHub**

```bash
git push FriendlyNathan main
```

---

## Summary of Files Changed

| File | Change |
|------|--------|
| `backend/.env` | GEMINI_ → VERTEX_ env vars |
| `backend/src/services/gemini.service.ts` | Full auth rewrite: JWT signing, Bearer token, Vertex AI REST call, token cache |
| `backend/src/controllers/public.controller.ts` | `geminiApiKey` → `vertexSaEmail` + `vertexPrivateKey` in Zod schema + calls |
| `backend/src/services/publicWorkflow.service.ts` | `geminiApiKey` → `vertexSaEmail` + `vertexPrivateKey` throughout |
| `frontend/src/pages/SimplifiedWorkflowPage.tsx` | New Vertex AI collapsible section with tooltip hints, localStorage persistence |
| `frontend/src/pages/WorkflowCreatePage.tsx` | New Vertex AI fields in Advanced AI Options |
