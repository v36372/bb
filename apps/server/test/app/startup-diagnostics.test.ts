import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadServerConfig } from "@bb/config/server";
import { describe, expect, it } from "vitest";
import {
  awaitHttpListenerBound,
  startHttpListener,
} from "../../src/start-server.js";

const testDir = dirname(fileURLToPath(import.meta.url));

async function readServerEntrypoint(): Promise<string> {
  return readFile(resolve(testDir, "../../src/index.ts"), "utf8");
}

async function readServerPackageJson(): Promise<string> {
  return readFile(resolve(testDir, "../../package.json"), "utf8");
}

async function readStartServerSource(): Promise<string> {
  return readFile(resolve(testDir, "../../src/start-server.ts"), "utf8");
}

async function closeListener(
  server: ReturnType<typeof startHttpListener>,
): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error && error.message !== "Server is not running.") {
        rejectClose(error);
        return;
      }
      resolveClose();
    });
  });
}

describe("server startup diagnostics", () => {
  it("installs safe diagnostics before loading the startup module", async () => {
    const source = await readServerEntrypoint();
    const installCallIndex = source.indexOf("installSafeProcessDiagnostics({");
    const startupImportIndex = source.indexOf('import("./start-server.js")');

    expect(installCallIndex).toBeGreaterThanOrEqual(0);
    expect(startupImportIndex).toBeGreaterThan(installCallIndex);
    expect(source).not.toContain('from "./db.js"');
    expect(source).not.toContain('from "./server.js"');
    expect(source).not.toContain("process.report");
  });

  it("keeps the startup bundle external to the production bootstrap", async () => {
    const packageJson = await readServerPackageJson();

    expect(packageJson).toContain("--external ./start-server.js");
    expect(packageJson).toContain("src/start-server.ts dist/start-server.js");
  });

  it.each([
    {
      bindHost: undefined,
      expectedAddress: "127.0.0.1",
      name: "binds the default server listener to IPv4 loopback",
    },
    {
      bindHost: "0.0.0.0",
      expectedAddress: "0.0.0.0",
      name: "binds the explicit wildcard listener to IPv4 only",
    },
  ])("$name", async ({ bindHost, expectedAddress }) => {
    const serverConfig = loadServerConfig({
      env: {
        BB_DATA_DIR: "/tmp/bb-server-listener-test",
        BB_HOST_DAEMON_PORT: "49162",
        ...(bindHost === undefined ? {} : { BB_SERVER_BIND_HOST: bindHost }),
        BB_SERVER_PORT: "49161",
        NODE_ENV: "development",
      },
    });
    const server = startHttpListener({
      fetch: () => new Response("ok"),
      serverConfig: { ...serverConfig, BB_SERVER_PORT: 0 },
    });

    try {
      await awaitHttpListenerBound(server);
      expect(server.address()).toMatchObject({
        address: expectedAddress,
        family: "IPv4",
      });
    } finally {
      await closeListener(server);
    }
  });

  it("binds the HTTP listener before the startup recovery sweep", async () => {
    const source = await readStartServerSource();
    expect(source).toMatch(
      /const server = startHttpListener\([\s\S]*await awaitHttpListenerBound\(server\);[\s\S]*await runStartupRecoverySweep\(/,
    );
  });

  it("rejects a colliding listener before startup recovery can run", async () => {
    const serverConfig = loadServerConfig({
      env: {
        BB_DATA_DIR: "/tmp/bb-server-listener-test",
        BB_HOST_DAEMON_PORT: "49162",
        BB_SERVER_BIND_HOST: "127.0.0.1",
        BB_SERVER_PORT: "49161",
        NODE_ENV: "development",
      },
    });
    const holder = startHttpListener({
      fetch: () => new Response("ok"),
      serverConfig: { ...serverConfig, BB_SERVER_PORT: 0 },
    });
    let colliding: ReturnType<typeof startHttpListener> | undefined;
    try {
      await awaitHttpListenerBound(holder);
      const address = holder.address();
      expect(address).not.toBeNull();
      const port = (address as AddressInfo).port;
      colliding = startHttpListener({
        fetch: () => new Response("ok"),
        serverConfig: { ...serverConfig, BB_SERVER_PORT: port },
      });
      let recovered = false;
      await expect(
        (async () => {
          await awaitHttpListenerBound(colliding);
          recovered = true;
        })(),
      ).rejects.toMatchObject({ code: "EADDRINUSE" });
      expect(recovered).toBe(false);
    } finally {
      if (colliding) {
        await closeListener(colliding);
      }
      await closeListener(holder);
    }
  });
});
