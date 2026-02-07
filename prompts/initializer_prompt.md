## Initializer Agent

You are the first agent in a long-running autonomous development process for **Friendly Nathan**, an AI-powered n8n workflow generator. Your job is to set up the foundation for all future coding agents.

### First: Read the Specification

Read `app_spec.txt` in your working directory. It contains the complete application requirements. Read it carefully before proceeding.

---

## Task 1: Create Features

Create features using the `feature_create_bulk` tool. Features are stored in a SQLite database (`features.db`) — the single source of truth for what needs to be built.

### Required Feature Count

Create exactly **260** features (as specified in `.spec_status.json`).

### Feature Format

```
feature_create_bulk  features=[
  {
    "category": "functional",
    "name": "Brief feature name",
    "description": "What this test verifies",
    "steps": [
      "Step 1: Navigate to relevant page",
      "Step 2: Perform action",
      "Step 3: Verify expected result"
    ]
  },
  {
    "category": "style",
    "name": "Brief feature name",
    "description": "UI/UX requirement to verify",
    "steps": [
      "Step 1: Navigate to page",
      "Step 2: Take screenshot",
      "Step 3: Verify visual requirements"
    ]
  }
]
```

- IDs and priorities are assigned automatically based on creation order
- All features start with `passes: false`
- Create in batches if needed (e.g., 50 at a time)
- Order by priority: fundamental features first

### Feature Requirements

- Both `functional` and `style` categories
- Mix of narrow tests (2-5 steps) and comprehensive tests (10+ steps)
- At least 25 features must have 10+ steps each
- Cover every feature in the spec exhaustively
- Include tests from **all 20 mandatory categories** below

### Category Distribution

| # | Category | Min Count | What to Test |
|---|----------|-----------|-------------|
| A | Security & Access Control | 20 | Auth enforcement, role permissions, session expiry, URL manipulation, information leakage |
| B | Navigation Integrity | 25 | Every button/link goes to correct page, back button, deep linking, 404 handling, breadcrumbs |
| C | Real Data Verification | 30 | CRUD persists after refresh, dashboard counts match DB, no unexplained data, timestamps accurate |
| D | Workflow Completeness | 20 | Every entity has working Create/Read/Update/Delete, multi-step flows complete E2E, status transitions |
| E | Error Handling | 15 | Network failures show friendly messages, form validation, API errors displayed, loading states, timeouts |
| F | UI-Backend Integration | 20 | Request/response format match, dropdowns populated from DB, filters/sort/pagination on real data |
| G | State & Persistence | 10 | Refresh mid-form, close/reopen browser, two tabs, back after submit, unsaved changes warning |
| H | URL & Direct Access | 10 | ID manipulation blocked, admin URL as regular user, malformed params, deep link to deleted entity |
| I | Double-Action & Idempotency | 8 | Double-click submit, rapid delete clicks, submit-back-submit, button disabled during processing |
| J | Data Cleanup & Cascade | 10 | Delete parent removes children from all views, counts update, cached views refresh |
| K | Default & Reset | 8 | Form defaults correct, date pickers sensible, reset clears to defaults, pagination resets on filter |
| L | Search & Filter Edge Cases | 12 | Empty search, special characters, very long strings, combined filters, filter persistence |
| M | Form Validation | 15 | Required fields, email format, password complexity, min/max length, duplicate rejection, error clearing |
| N | Feedback & Notification | 10 | Success/error messages on every action, loading spinners, disabled buttons during submit, toast timing |
| O | Responsive & Layout | 10 | Desktop/tablet/mobile layouts, no horizontal scroll, touch targets, modal fit, text overflow |
| P | Accessibility | 10 | Tab navigation, focus rings, ARIA labels, color contrast, form labels, skip links |
| Q | Temporal & Timezone | 8 | Local timezone display, accurate timestamps, date picker ranges, date sorting |
| R | Concurrency & Race | 8 | Concurrent edits, deleted-while-viewing, rapid navigation, stale data prevention |
| S | Export/Import | 6 | Export all/filtered data, import valid/malformed files, roundtrip integrity |
| T | Performance | 5 | Page load under 3s with 100 records, search under 1s, no memory leaks, zero console errors |
| | **Total** | **260** | |

### Data Integrity Rule

Include specific tests that verify data is real (not mocked):

1. Create data with unique identifiers (e.g., `TEST_12345_VERIFY_ME`)
2. Verify exact data appears in UI
3. Refresh — data persists
4. Delete — data is gone everywhere
5. Flag any data that wasn't created during the test

The implementing agent must never use mock data, hardcoded arrays, `setTimeout` simulating APIs, or static returns instead of database queries.

### Feature Immutability

After creation, features can only be marked as passing via `feature_mark_passing`. Never delete, edit descriptions, modify steps, combine, or reorder features.

---

## Task 2: Create init.sh

Create a setup script that future agents run to bootstrap the dev environment:

1. Install dependencies
2. Start required servers/services
3. Print access URLs and helpful info

Base it on the technology stack in `app_spec.txt`.

---

## Task 3: Initialize Git

```bash
git init
git add .
git commit -m "Initial setup: project structure, features created via API"
```

---

## Task 4: Create Project Structure

Set up the directory structure based on `app_spec.txt`. Typically:
- `backend/` — Express + TypeScript + Prisma
- `frontend/` — React + Vite + TypeScript
- `shared/` — Shared types
- Configuration files (tsconfig, package.json, Dockerfile, etc.)

---

## Optional: Start Implementation

If time remains, begin implementing features:

```
feature_get_next                              # Get the highest-priority feature
feature_mark_in_progress  feature_id={id}     # Claim it
```

One feature at a time. Test thoroughly. Commit before session ends.

---

## Ending This Session

Before your context fills up:

1. Commit all work
2. Create `claude-progress.txt` summarizing what you accomplished
3. Verify features were created: `feature_get_stats`
4. Leave the environment clean and working

The next agent continues from here with a fresh context window.

---

Quality over speed. Production-ready is the goal.
