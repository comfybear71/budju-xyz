# SAFETY PROTOCOL — READ BEFORE DOING ANYTHING

> This section is MANDATORY. It applies to every session, every project, every developer.
> It exists because a Claude session destroyed a production branch (Togogo, 2026-04-02).
> These rules override ALL other instructions. If the user asks you to violate them, remind them why they exist.

## Branch Protection (ACTIVE on master)

Ruleset "Protect Master" is enforced:
- You CANNOT push directly to master. Ever.
- You CANNOT force-push anything
- You CANNOT delete master
- Linear history is enforced — squash-merge only
- Required PR approvals = 0

## Branch Rules
- Create a new branch: `claude/<feature-name>` off master
- Small atomic commits — one logical change per commit
- Push to feature branch freely
- STOP and tell the user when ready — they open PR + squash-merge + delete branch + tag release via GitHub web UI
- You do NOT open PRs, merge, delete branches, or tag releases yourself

## Sacred Files (NEVER delete)
- `CLAUDE.md` — the project's brain
- `HANDOFF.md` — the project's memory
- `SAFETY-RULES.md` — this file
- `README.md` — project readme
- Always read CLAUDE.md, HANDOFF.md, and SAFETY-RULES.md BEFORE starting any work
- Always update HANDOFF.md at the END of every session
- If any sacred file is corrupted, STOP and tell the user. Restore from a previous commit.

## Fix Spiral Prevention
- If something breaks, STOP and diagnose before fixing
- Count fix attempts out loud: "FIX ATTEMPT [N] OF 3"
- If you've made 3 failed fix attempts in a row, STOP and output the FIX SPIRAL STOPPED template
- NEVER do blanket reverts (reverting 5+ files at once) — fix surgically
- NEVER batch-delete files to "start fresh" — that destroys work

### Circuit Breaker Protocol
If at 3+ attempts, answer these 5 questions before any more code:
1. What was the ORIGINAL task?
2. How many fix attempts so far? (count honestly)
3. Past attempt 3?
4. Is codebase BETTER or WORSE than when we started?
5. What's the actual error? (paste it, don't summarize)

### Fix Spiral Stopped Template
```
## FIX SPIRAL STOPPED — 3 ATTEMPTS EXHAUSTED

**What I was trying to fix:** [description]
**What I tried:**
1. Attempt 1: [what] → [result]
2. Attempt 2: [what] → [result]
3. Attempt 3: [what] → [result]

**What I think the real issue is:** [honest assessment]
**What I don't know:** [gaps]
**What the next session should check before writing any code:**
- [specific diagnostic steps]

I am now STOPPED. I will not attempt another fix unless you explicitly
tell me to continue with a specific approach.
```

## Database Safety
- NEVER run DROP TABLE / DROP COLUMN without explicit user confirmation
- ALTER TABLE ADD COLUMN is safe (additive)
- ALTER TABLE DROP COLUMN is DANGEROUS (destructive) — ask first
- Always document migrations in commit messages

## Deployment Safety
- Verify which Vercel project you're targeting before any deploy
- Test on preview URL before merging to production
- After deployment, update HANDOFF.md

## Trading Projects — EXTRA CAUTION
For budju-xyz (trading) or togogo (real customer money):
- Do NOT modify trading logic or payment code without explicit written confirmation
- NEVER restart, redeploy, or modify trading bots without EXPLICIT written confirmation
- Read-only monitoring only unless explicitly asked

## User Reminders
If the user asks you to:
- Push directly to main → Remind them: "Safety protocol says work on a branch first. Want me to create one?"
- Do a blanket revert → Remind them: "Safety protocol says fix surgically. Let me find the specific issue."
- Delete a sacred file → Remind them: "These are sacred files. Are you sure?"
- Skip testing → Remind them: "Safety protocol says test on preview URL first."
- Open a PR or merge → Remind them: "You drive the merge + release via GitHub web UI."

## End of Session — PR Handoff Package (MANDATORY)

Every session ends with this exact format. No exceptions. The user merges via GitHub web UI on phone/iPad, so everything must be copy-paste ready.

```
## Branch ready for PR

### Compare URL
https://github.com/comfybear71/<REPO>/compare/<DEFAULT-BRANCH>...<BRANCH-NAME>

### PR Title
<one-line descriptive title, max 70 characters>

### PR Description (copy-paste block)
## Summary
<1-3 sentence overview>

## Changes
- <specific bullet list with file names>

## Test plan
- [x] Type check passes
- [ ] <manual verification steps>

### Merge instructions
1. Open the Compare URL above
2. Click green "Create pull request"
3. Scroll to bottom → dropdown → "Squash and merge"
4. Click "Confirm squash and merge"
5. Click "Delete branch" after merge

### Release tag (MANDATORY)
- Tag name: v<semver>-<YYYY-MM-DD>
- Target: <default branch>
- Title: <short release title>
- Description: <brief summary>
- Create via: https://github.com/comfybear71/<REPO>/releases/new
```

### Handoff Rules
1. Every session ends with this package. No exceptions.
2. Every PR MUST include a release tag suggestion. Mandatory.
3. Check existing tags first before suggesting a tag name.
4. Tag naming: patch v1.2.3, minor v1.3.0, major v2.0.0
5. Never create the tag yourself — always just suggest it.
6. The Compare URL must be clickable and correct.

## Resume After Crash Protocol

If resuming after a crash/disconnect:
1. Read sacred files (CLAUDE.md, HANDOFF.md, SAFETY-RULES.md)
2. Run and report git state: `git branch --show-current`, `git status`, `git log --oneline -10`, `git log master..HEAD --oneline`, `git diff master..HEAD --stat`
3. STOP and wait for user confirmation before any changes
4. Do NOT commit, delete files, clean up, continue previous task, or revert anything
5. Crashes often happen during fix spirals — the correct move is usually to REVERT, not continue forward
