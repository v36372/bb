---
name: exe-self-deploy
description: Preview and deploy changes to the customized bb instance on this exe.dev VM. Use after modifying bb UI, server, daemon, plugins, or bundled assets in this repository.
---

# Preview and deploy this bb fork

This checkout is the source for the customized bb installation on this VM.

## Remotes

- `origin` is the writable fork.
- `upstream` is `get-bb/bb`.
- Integrate upstream with `git fetch upstream` and `git merge upstream/main` before pushing the fork. Never force-push `main`.

## Preview

Build and restart the isolated preview:

```sh
bb-preview build
```

Follow the unit printed by the command. The preview is available at:

```text
https://v36372-bb.exe.xyz:8001/
```

It uses `/home/exedev/.bb-preview`, not production data. Other commands:

```sh
bb-preview status
bb-preview logs
bb-preview restart
bb-preview stop
bb-preview start
```

## Production deployment

Commit and push the intended source changes, then schedule deployment:

```sh
git diff --check
git status --short
bb-deploy
```

`bb-deploy` installs dependencies, builds all production runtime artifacts, creates a package and database backup, installs the local package globally, restarts `bb.service`, and checks port 8000. The deployment runs in a separate transient systemd unit so it survives restarting bb itself.

The production URL is:

```text
https://v36372-bb.exe.xyz/
```

Inspect deployments with:

```sh
bb-deploy logs
systemctl status bb
journalctl -u bb -n 200 --no-pager
```

Rollback to the matching upstream npm release with:

```sh
bb-deploy rollback
```

Production state remains under `/home/exedev/.bb`. Release packages and SQLite backups are retained under `/home/exedev/.local/state/bb`.
