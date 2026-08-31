---
name: exe-self-deploy
description: Update, preview, deploy, or restart the customized bb instance on this exe.dev VM. Use when syncing this bb fork with get-bb/bb upstream, resolving upstream merge conflicts, modifying bb UI/server/daemon/plugins/assets, testing a production-style preview, deploying live, rolling back, or restarting bb.
---

# Update and deploy this bb fork

Work in `/home/exedev/bb` and follow its `AGENTS.md`. `origin` is the writable fork; `upstream` is `get-bb/bb`.

## Safety

- Preserve local customization. Merge upstream into published `main`; never rebase it, reset it, force-push it, or resolve an entire conflict with one side without inspecting both.
- Treat a dirty worktree as user work. Inspect it and stop before merging if it cannot be preserved safely. Never stash or discard it automatically.
- Never modify `/usr/local/lib/node_modules/bb-app` directly or reset/delete `/home/exedev/.bb`.
- Use `bb-deploy` for the live restart. It builds and packages the checkout, backs up the production SQLite database, restarts `bb.service`, health-checks port 8000, and automatically restores the upstream package if installation or health checks fail.
- The tracked helper sources live in `scripts/exe-deploy/`. After changing them,
  run `sudo scripts/exe-deploy/install`; never hand-edit the installed copies.

## Sync with upstream

Establish a clean, current local branch:

```sh
cd /home/exedev/bb
git status --short
git branch --show-current
git remote -v
git fetch --prune origin
git fetch --prune upstream
git merge --ff-only origin/main
git log --oneline --left-right main...upstream/main
git diff --stat main...upstream/main
```

Require `main`, a clean worktree, `origin` as the writable fork, and `upstream` as `get-bb/bb`. If local and `origin/main` diverged, inspect the commits and reconcile them without resetting or force-pushing.

Merge instead of rebasing published customization:

```sh
git merge --no-edit upstream/main
```

## Resolve conflicts

If the merge conflicts:

1. List every unresolved file with `git diff --name-only --diff-filter=U`.
2. Read each complete conflict and surrounding construct. Inspect base/local/upstream versions where useful with `git show :1:<path>`, `git show :2:<path>`, and `git show :3:<path>`.
3. Preserve customized behavior while adopting compatible upstream architecture, renamed APIs, migrations, tests, and documentation. Reuse the upstream convention instead of retaining obsolete parallel paths.
4. Never blanket-resolve a whole file with `--ours` or `--theirs` unless inspection proves the other side contains no required change. Regenerate lockfiles and generated artifacts with their owning tools rather than hand-merging generated output.
5. For server/daemon wire changes, preserve the required `HOST_DAEMON_PROTOCOL_VERSION` bump. For Drizzle conflicts, change schemas/migrations and regenerate snapshots; never hand-edit snapshot JSON.
6. When upstream changed a contract, use language-server references and migrate every caller. When commands, flags, or settings changed, update the matching CLI guide, skill, and configuration docs required by `AGENTS.md`.
7. Remove all conflict markers, stage only resolved files, run `git diff --check`, then complete the merge with `git commit --no-edit`.

If semantics remain genuinely ambiguous after inspecting code, tests, history, and docs, ask the user about that specific choice. Resolve independent conflicts first.

## Verify and push

Identify affected packages from the merge diff. Run focused tests and typechecks through Turbo, as required by `AGENTS.md`:

```sh
pnpm exec turbo run test --filter=<affected-package>
pnpm exec turbo run typecheck --filter=<affected-package>
git diff --check
git status --short
git push origin main
```

Fix source failures; never suppress tests or warnings. Push the completed merge before touching the live service.

## Preview

Build and restart the isolated production-style preview:

```sh
bb-preview build
```

Capture the transient systemd unit printed by the command and follow it to completion with the available long-running-process facility. Success logs `preview ready at https://v36372-bb.exe.xyz:8001/`.

Then verify:

```sh
bb-preview status
curl -fsS -o /dev/null http://127.0.0.1:8001/
```

The preview uses `/home/exedev/.bb-preview`, not production data. Inspect `bb-preview logs` on failure. Do not deploy a failed preview.

## Deploy and restart production

```sh
bb-deploy
```

The default deployment installs the new package while the full-stack launcher and host
daemon keep running, then sends `SIGHUP` to the launcher. The launcher terminates and
restarts only its server child. Provider bridges and the active agent process stay
alive, so the current turn continues through the brief server reconnect without a
follow-up message.

Use `bb-deploy full` only when the change must replace the launcher, host daemon,
agent runtime, or provider-bridge process itself. A full deployment queues an automatic
continuation before restarting the complete service. Do not start a `journalctl -f`
supervised process: it belongs to the old broker lifecycle during a full restart and
produces a misleading exit-143 notification.

After either mode, verify the exact deployment:

```sh
bb-deploy logs
bb status --json
curl -fsS -o /dev/null http://127.0.0.1:8000/
```

Confirm the deployed release filename contains the expected commit, finish every
remaining task, and report. On failure, inspect the full unit logs. The worker restores
the upstream package after installation or health-check failure; use
`bb-deploy rollback` manually only when explicitly needed.

## Report

Report the previous and merged upstream commit IDs, conflicts and chosen semantics, verification commands and results, pushed `origin/main` commit, deployed release path, and live health result.
