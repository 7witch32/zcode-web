import { createLocalServices, getAppConfigDir } from "@zcode/services/node";
import {
  materializeBundledZCodeBuiltinProviderConfig,
  readBundledZCodeBuiltinProviderConfig,
} from "./bundledZCodeBuiltinProviderConfig.js";
import { createHttpServer } from "./http.js";
import { ensureRemoteServerDeviceMid } from "./stdioDeviceMid.js";

async function main(): Promise<void> {
  // HTTP/Docker mode has no Desktop main process to create telemetry-state.json.
  // Start Plan billing/balance requires X-Device-Mid, so initialize the server-owned
  // device identity before services start and before their first background refresh.
  await ensureRemoteServerDeviceMid({
    log: (...args: unknown[]) => console.error("[zcode-server:http]", ...args),
  });

  const zcodeBuiltinProviderConfigFilePath = await materializeBundledZCodeBuiltinProviderConfig({
    environmentConfigRoot: getAppConfigDir(),
    content: readBundledZCodeBuiltinProviderConfig(),
  });
  const port = Number(process.env["PORT"]) || 3030;
  const host = process.env["ZCODE_SERVER_HOST"]?.trim() || process.env["HOST"]?.trim() || undefined;
  const staticRoot = process.env["ZCODE_WEB_STATIC_ROOT"]?.trim() || undefined;
  const authToken = process.env["ZCODE_SERVER_AUTH_TOKEN"]?.trim() || undefined;
  // Historical sessions may reference a workspace directory that no longer exists.
  // Keep Agent spawn alive by falling back to the persistent workspace mount.
  const agentSpawnFallbackCwd =
    process.env["ZCODE_AGENT_SPAWN_FALLBACK_CWD"]?.trim() || undefined;
  const services = createLocalServices({
    zcodeBuiltinProviderConfigFilePath,
    providerProvisioningTargetEnabled: Boolean(authToken),
    ...(agentSpawnFallbackCwd ? { zcodeAgentSpawnFallbackCwd: agentSpawnFallbackCwd } : {}),
  });

  createHttpServer(services, port, {
    ...(host ? { host } : {}),
    ...(staticRoot ? { staticRoot, spaFallback: true } : {}),
    ...(authToken ? { authToken, authRequired: true } : {}),
  });
}

void main().catch((error: unknown) => {
  console.error("[zcode-server:http] startup failed", error);
  process.exitCode = 1;
});
