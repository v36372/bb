export const meta = {
  name: "deploy-and-reload",
  description:
    "Deploy the current /home/exedev/bb checkout to the live exe.dev bb.service and reload it. Default mode reloads the server in place with bb-deploy; mode full restarts the launcher, host daemon, and agent runtime with bb-deploy full. Use when asked to deploy, reload, or restart this customized bb instance.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: {
        enum: ["reload", "full"],
        description:
          "reload runs bb-deploy (SIGHUP server child). full runs bb-deploy full (complete service restart).",
      },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["ok", "mode", "commit", "release", "health", "notes"],
    properties: {
      ok: { type: "boolean" },
      mode: { enum: ["reload", "full"] },
      commit: { type: "string" },
      release: { type: "string" },
      health: { type: "string" },
      notes: { type: "string" },
    },
  },
  phases: [
    {
      title: "Inspect",
      detail: "Record checkout state and abort on an unsafe worktree",
    },
    {
      title: "Deploy",
      detail: "Install the package and reload or fully restart bb.service",
    },
    {
      title: "Verify",
      detail: "Confirm logs, live health, and the deployed release",
    },
  ],
};

const mode = args && args.mode === "full" ? "full" : "reload";
const deployCommand = mode === "full" ? "bb-deploy full" : "bb-deploy";

phase("Inspect");
const inspection = await agent(
  [
    "You are a BB workflow worker. Your return value is structured data, not a user-facing message.",
    "Read and follow /home/exedev/bb/.bb/skills/exe-self-deploy/SKILL.md.",
    "Inspect the live checkout at /home/exedev/bb before any deploy.",
    "Run: cd /home/exedev/bb && git status --short && git branch --show-current && git remote -v && git rev-parse HEAD && git log -1 --oneline && git diff --check.",
    "Confirm origin is the writable fork and this is /home/exedev/bb.",
    "Do not merge, rebase, stash, discard, commit, or push.",
    "Never modify /usr/local/lib/node_modules/bb-app or reset/delete /home/exedev/.bb.",
    "ready=false only for an unsafe state: merge/rebase in progress, missing checkout, git diff --check failure, or not /home/exedev/bb. A dirty worktree is allowed; report it and stay ready=true.",
    "commit must be the full HEAD SHA. notes must include dirty files or 'clean'.",
  ].join("\n"),
  {
    label: "Inspect checkout",
    phase: "Inspect",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["ready", "commit", "branch", "dirty", "notes"],
      properties: {
        ready: { type: "boolean" },
        commit: { type: "string" },
        branch: { type: "string" },
        dirty: { type: "boolean" },
        notes: { type: "string" },
      },
    },
  },
);

if (!inspection || !inspection.ready) {
  const notes = inspection
    ? inspection.notes
    : "Inspect worker failed before returning checkout state.";
  return {
    ok: false,
    mode: mode,
    commit: inspection && inspection.commit ? inspection.commit : "",
    release: "",
    health: "skipped",
    notes: notes,
  };
}

phase("Deploy");
const deployed = await agent(
  [
    "You are a BB workflow worker. Your return value is structured data, not a user-facing message.",
    "Read and follow /home/exedev/bb/.bb/skills/exe-self-deploy/SKILL.md.",
    "Deploy the current /home/exedev/bb checkout. Do not merge upstream, commit, push, stash, or discard.",
    "Never modify /usr/local/lib/node_modules/bb-app directly. Never reset or delete /home/exedev/.bb.",
    "Checkout HEAD is " + inspection.commit + " on " + inspection.branch + ".",
    inspection.dirty
      ? "Worktree is dirty; bb-deploy packages the working tree including uncommitted files. Proceed."
      : "Worktree is clean.",
    "Run exactly: " + deployCommand,
    "Capture the transient systemd unit name printed by the command (bb-deploy-* or bb-deploy-full-*).",
    "Wait until that unit finishes. Poll systemctl show <unit> --property=ActiveState,Result,ExecMainStatus. Do not start journalctl -f as a supervised process: a full restart belongs to the old broker lifecycle and yields a misleading exit-143.",
    "ok=true only when the unit succeeds and the worker logs a line starting with 'deployed ' plus a release path under /home/exedev/.local/state/bb/releases/.",
    "release is that tarball path, or empty on failure. unit is the systemd unit name. error is empty on success.",
  ].join("\n"),
  {
    label: "Deploy " + mode,
    phase: "Deploy",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "unit", "release", "error"],
      properties: {
        ok: { type: "boolean" },
        unit: { type: "string" },
        release: { type: "string" },
        error: { type: "string" },
      },
    },
  },
);

phase("Verify");
const expectedCommit = inspection.commit;
const deployOk = deployed && deployed.ok === true;
const deployRelease = deployed && deployed.release ? deployed.release : "";
const deployUnit = deployed && deployed.unit ? deployed.unit : "";
const deployError = deployed && deployed.error ? deployed.error : "";

const verified = await agent(
  [
    "You are a BB workflow worker. Your return value is structured data, not a user-facing message.",
    "Read and follow /home/exedev/bb/.bb/skills/exe-self-deploy/SKILL.md.",
    "Verify the deployment of /home/exedev/bb. Do not start another deploy or rollback unless the unit failed before installing.",
    "Expected HEAD commit: " + expectedCommit,
    "Deploy mode: " + mode,
    "Deploy unit: " + (deployUnit || "(missing)"),
    "Deploy reported ok=" + String(deployOk) + " release=" + (deployRelease || "(missing)"),
    deployError ? "Deploy error: " + deployError : "Deploy reported no error.",
    "Run: bb-deploy logs && bb status --json && curl -fsS -o /dev/null http://127.0.0.1:8000/",
    "If /health exists, also curl -fsS http://127.0.0.1:8000/health.",
    "Confirm the deployed release filename contains the expected commit short SHA (first 12 hex chars of HEAD).",
    "health must be 'ok' if curl to http://127.0.0.1:8000/ succeeds, otherwise a short failure reason.",
    "ok=true only if health is ok AND the live release matches the expected commit.",
    "release is the live release path if known, otherwise the deploy-reported path.",
    "notes must include previous vs current commit if visible, the release path, and any log failure.",
  ].join("\n"),
  {
    label: "Verify live bb",
    phase: "Verify",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "release", "health", "notes"],
      properties: {
        ok: { type: "boolean" },
        release: { type: "string" },
        health: { type: "string" },
        notes: { type: "string" },
      },
    },
  },
);

if (!verified) {
  return {
    ok: false,
    mode: mode,
    commit: expectedCommit,
    release: deployRelease,
    health: "unverified",
    notes: deployError || "Verify worker failed before returning a result.",
  };
}

return {
  ok: verified.ok === true,
  mode: mode,
  commit: expectedCommit,
  release: verified.release || deployRelease,
  health: verified.health,
  notes: verified.notes,
};
