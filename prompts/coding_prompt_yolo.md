## Coding Agent — YOLO Mode

You are continuing work on **Friendly Nathan**, an AI-powered n8n workflow generator.
This is a fresh context window — you have no memory of previous sessions.

> **MODE: YOLO** — Rapid prototyping. Features are marked as passing after lint/typecheck succeeds.
> Browser testing and regression checks are skipped.
>
> For production-quality verification, use `coding_prompt.md` (standard mode) instead.

---

### Step 1: Orient Yourself

```bash
pwd
ls -la
cat app_spec.txt
cat claude-progress.txt
git log --oneline -20
```

Then check feature status:

```
feature_get_stats      # Progress overview
feature_get_next       # Next feature to implement
```

Reading `app_spec.txt` is critical — it contains the full application requirements.

### Step 2: Start Servers

If `init.sh` exists:

```bash
chmod +x init.sh && ./init.sh
```

Otherwise, start servers manually and document the process.

### Step 3: Pick a Feature

```
feature_get_next                              # Get next pending feature
feature_mark_in_progress  feature_id={id}     # Claim it immediately
```

Focus on completing one feature per cycle. Building prerequisite functionality is your responsibility — see the standard prompt for the full "when to skip" guidance. The same rules apply: skip only for truly external blockers.

### Step 4: Implement

1. Write the code (backend and/or frontend as needed)
2. Follow existing patterns in the codebase
3. Handle errors gracefully
4. No mock data — all data from PostgreSQL via Prisma

### Step 5: Verify via Static Analysis

In YOLO mode, verification is lint + typecheck only.

```bash
npm run lint
cd backend && npx tsc --noEmit
cd ../frontend && npx tsc --noEmit
```

If either fails, fix the errors before proceeding.

### Step 6: Update Feature Status

```
feature_mark_passing  feature_id={id}
```

Only modify the `passes` field. Never delete, edit, combine, or reorder features.

### Step 7: Commit

```bash
git add .
git commit -m "Implement [feature name] - YOLO mode

- Added [specific changes]
- Lint/typecheck passing
- Marked feature #{id} as passing"
```

### Step 8: Update Progress

Update `claude-progress.txt` with:
- What you accomplished
- Features completed
- Issues found or fixed
- Next steps
- Current status (e.g., "45/260 features passing")

### Step 9: Clean Exit

1. Commit all working code
2. Update `claude-progress.txt`
3. Ensure no uncommitted changes
4. Leave the codebase compilable

---

## Feature Tool Reference

```
feature_get_stats                    # Progress counts
feature_get_next                     # Next pending feature
feature_mark_in_progress  id={id}    # Claim a feature
feature_mark_passing  id={id}        # Mark as passing (after lint/typecheck)
feature_skip  id={id}                # Skip (external blockers only)
feature_clear_in_progress  id={id}   # Unclaim a feature
```

Do not fetch lists of all features or query by category. `feature_get_next` tells you what to work on.

---

## Email in Development

For email-dependent features, configure the app to log emails to the terminal. Read links from server logs to test the flow.

---

## YOLO Mode Quality Bar

- Code compiles without errors (lint + typecheck pass)
- Follows existing code patterns
- Basic error handling in place
- Features implemented according to spec
- No mock data

Browser testing is skipped. Features may have UI bugs that only manual testing would catch. Run standard mode for production-quality verification.

You have unlimited time across sessions. Keep the codebase compilable.

---

Begin with Step 1.
