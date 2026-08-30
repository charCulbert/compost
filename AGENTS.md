# Development Rules

## Conversational Style

- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text (e.g., "Thanks @user" not "Thanks so much @user!")
- Technical prose only, be direct
- Use concise, clear, simple language. Define unavoidable jargon before using it.
- Explain non-trivial designs and problems as: problem, concrete example or short trace, then solution. State why the solution is necessary and distinguish it from optional complexity.
- Prefer concrete behavior and small illustrations over abstract summaries, dense terminology, or unexplained lists of changes.
- When the user asks a question, answer it first before making edits or running implementation commands.
- When responding to user feedback or an analysis, explicitly say whether you agree or disagree before saying what you changed.

## Code Quality

- Read files in full before wide-ranging changes, before editing files you have not fully inspected, and when asked to investigate or audit. Do not rely on search snippets for broad changes.
- No `any` unless absolutely necessary.
- Inline single-line helpers that have only one call site.
- Check node_modules for external API types; don't guess.
- **No inline imports** (`await import()`, `import("pkg").Type`, dynamic type imports). Top-level imports only.
- Never remove or downgrade code to fix type errors from outdated deps; upgrade the dep instead.
- Always ask before removing functionality or code that appears intentional.
- Do not preserve backward compatibility unless the user asks for it.

## Commands

- After code changes (not docs): `npm run check` (full output, no tail). Fix all errors, warnings, and infos before committing. Does not run tests.
- Never run `npm run build` or `npm test` unless requested by the user.
- If you create or modify a test file, run it and iterate on test or implementation until it passes.
- For ad-hoc scripts, `write` them to a temp file (e.g. `/tmp`), run, edit if needed, remove when done. Don't embed multi-line scripts in `bash` commands.
- Never commit unless the user asks.


## Git worktrees

This repo uses linked git worktrees for parallel or risky work:

- Worktrees live as sibling directories: `../compost-<slug>` with branch `feat/<slug>` or `fix/<slug>`. Existing example: `../compost-timeline-polish`.
- The pi status line shows where you are: `⌂ <branch>` = main working tree, `🌿 <name> [<branch>]` = linked worktree. `/worktree` lists all worktrees and marks the current one.
- Check `git worktree list` before creating a new one. Offer a worktree when a task would conflict with uncommitted changes here or risks destabilizing the main tree; create only after the user confirms: `git worktree add ../compost-<slug> -b feat/<slug>`, then run `npm install` inside it before builds/tests.
- Worktrees are independent checkouts: each has its own branch, index, and node_modules. Everything (edits, builds, tests, commits) happens inside the worktree's directory; never cd back here to run its commands.
- After a worktree's branch is merged, offer to remove it: `git worktree remove ../compost-<slug>` and delete the local branch.

## Git

Multiple pi sessions may be running in this cwd at the same time, each modifying different files. (Sessions in separate worktrees are isolated from each other and don't have this problem with each other; the rules below still apply to the main working tree.) Git operations that touch unstaged, staged, or untracked files outside your own changes will stomp on other sessions' work. Follow these rules:

Committing:

- Only commit files YOU changed in THIS session.
- Stage explicit paths (`git add <path1> <path2>`); never `git add -A` / `git add .`.
- Before committing, run `git status` and verify you are only staging your files.
- Message format: `{feat,fix,docs}[]: <commit message> (optionally multiple lines)`. Message is informative and concise.

Never run (destroys other agents' work or bypasses checks):

- `git reset --hard`, `git checkout .`, `git clean -fd`, `git stash`, `git add -A`, `git add .`, `git commit --no-verify`.

If rebase conflicts occur:

- Resolve conflicts only in files you modified.
- If a conflict is in a file you did not modify, abort and ask the user.
- Never force push.


## User Override

If the user's instructions conflict with any rule in this document, ask for explicit confirmation before overriding. Only then execute their instructions.
