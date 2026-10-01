/* eslint-disable max-lines -- HTTP、WebSocket 与静态资源路由集中注册，保持同一鉴权顺序。 */
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, relative, resolve, sep } from "node:path";
import { hostname } from "node:os";
import { Hono, type Context } from "hono";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { WebSocket } from "ws";
import {
  Emitter,
  VSBuffer,
  SocketProtocol,
  ChannelServer,
  LoggingChannelServer,
  type ISocket,
} from "@zcode/rpc";
import {
  ServiceCollection,
  IZCodeAgentService,
  createZCodeAgentConnectionScope,
  IFileService,
  IGitService,
  ISystemService,
  ITerminalService,
  IBotsService,
  IProviderProvisioningTargetService,
} from "@zcode/services";
import {
  botProviders,
  formatLogPrefix,
  formatZodError,
  remoteTargetSchema,
  SERVER_REMOTE_PROTOCOL_VERSION,
  ZCODE_RPC_HOST_CAPABILITY_HEADER,
  ZCODE_VERSION,
  type BotProvider,
  type ServerRemoteInfo,
  type ServerRemoteWorkspaceInfo,
} from "@zcode/shared";
import { connectRemote, createRemoteBackend, type RemoteConnection } from "./remote/index.js";
import { createHostCapabilityStore } from "./hostCapability.js";
import {
  createWebPushService,
  parsePushDiagnosticInput,
  parsePushSubscriptionInput,
} from "./push/webPushService.js";

function wrapWebSocket(ws: WebSocket): ISocket {
  const onData = new Emitter<VSBuffer>();
  const onClose = new Emitter<void>();
  const onEnd = new Emitter<void>();

  ws.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
    onData.fire(VSBuffer.wrap(new Uint8Array(buf)));
  });
  ws.on("close", () => {
    onClose.fire();
    onEnd.fire();
  });
  ws.on("error", () => {
    onClose.fire();
    onEnd.fire();
  });

  return {
    onData: onData.event,
    onClose: onClose.event,
    onEnd: onEnd.event,
    write(buffer: VSBuffer) {
      if (ws.readyState === ws.OPEN) {
        ws.send(buffer.buffer);
      }
    },
    end() {
      ws.close();
    },
    drain() {
      return Promise.resolve();
    },
    dispose() {
      ws.close();
    },
  };
}

const log = (...args: unknown[]) =>
  console.log(formatLogPrefix("zcode-server:http", process.pid), ...args);

function setupChannelServer(
  ws: WebSocket,
  services: ServiceCollection,
  clientMode: "desktop-continuous" | "web-remote-replayable",
) {
  const socket = wrapWebSocket(ws);
  const protocol = new SocketProtocol(socket);
  const rawServer = new ChannelServer(protocol, "server");
  // 用日志中间件包装，统一记录所有 RPC 调用
  const server = new LoggingChannelServer(rawServer, log);
  const agentService = services.getOptional(IZCodeAgentService);
  const connectionScope = agentService
    ? createZCodeAgentConnectionScope(agentService, {
        connectionId: `server-ws-${randomUUID()}`,
        clientMode,
        role: clientMode === "desktop-continuous" ? "trusted-host-relay" : "terminal-client",
      })
    : undefined;
  const overrides = new Map<string, unknown>();
  if (connectionScope) {
    overrides.set(IZCodeAgentService.channelName, connectionScope.service);
  }
  // Provisioning 携带跨 Environment 凭据，只允许 Desktop trusted host 使用；普通 Web
  // remote/replayable 客户端即使知道频道名，也不能获得 target 写入接口。
  if (
    clientMode !== "desktop-continuous" &&
    services.getOptional(IProviderProvisioningTargetService)
  ) {
    overrides.set(IProviderProvisioningTargetService.channelName, {
      apply: async () => {
        throw new Error("Provider Provisioning 仅支持受信 Desktop Host");
      },
    });
  }
  services.exposeOnChannelServer(server, overrides);
  socket.onClose(() => {
    void connectionScope?.dispose();
    rawServer.dispose();
  });
}

/** 存储 web 模式下的远程连接，key 为随机 ID */
const remoteConnections = new Map<string, RemoteConnection>();

// /auth/bootstrap 是唯一的无鉴权可写端点：按 IP 记录失败次数，超限后临时拉黑，
// 防止对 ZCODE_SERVER_AUTH_TOKEN 的无限在线暴力尝试（配合下方 tokensMatch 的常量时间比较）。
const authFailureByIp = new Map<string, { count: number; blockedUntil: number }>();
const AUTH_MAX_FAILURES = 10;
const AUTH_BLOCK_DURATION_MS = 60_000;

function clientIpOf(c: Context): string {
  // ใช้ socket IP จริงเท่านั้น ห้ามพึ่ง X-Forwarded-For — การเชื่อมต่อตรงเข้า port 3030
  // สามารถปลอม XFF ได้ ทำให้หมุน IP หลอก bypass limiter ได้ทุกครั้ง
  // (กรณีหลัง reverse proxy ทุก client จะรวม bucket เดียว ล็อกกันได้ชั่วคราว 60s — ยอมรับได้)
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } }).incoming;
  return incoming?.socket?.remoteAddress || "local";
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface HttpServerOptions {
  serverId?: string;
  name?: string;
  host?: string;
  authRequired?: boolean;
  authToken?: string;
  spaFallback?: boolean;
  staticRoot?: string;
  workspaces?: ServerRemoteWorkspaceInfo[];
}

function readTrimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function resolveServerId(options: HttpServerOptions): string {
  return (
    options.serverId?.trim() || readTrimmedEnv("ZCODE_SERVER_ID") || hostname() || "zcode-server"
  );
}

function resolveServerWorkspaces(options: HttpServerOptions): ServerRemoteWorkspaceInfo[] {
  if (options.workspaces) {
    return options.workspaces;
  }
  const workspacePath = readTrimmedEnv("ZCODE_SERVER_WORKSPACE") || process.cwd();
  return [
    {
      path: workspacePath,
      label: basename(workspacePath) || workspacePath,
    },
  ];
}

function createServerInfo(options: HttpServerOptions): ServerRemoteInfo {
  return {
    serverId: resolveServerId(options),
    ...(options.name?.trim() || readTrimmedEnv("ZCODE_SERVER_NAME")
      ? { name: options.name?.trim() || readTrimmedEnv("ZCODE_SERVER_NAME") }
      : {}),
    version: ZCODE_VERSION,
    protocolVersion: SERVER_REMOTE_PROTOCOL_VERSION,
    authRequired: options.authRequired ?? Boolean(readTrimmedEnv("ZCODE_SERVER_TOKEN")),
    workspaces: resolveServerWorkspaces(options),
    capabilities: {
      desktopContinuous: true,
      websocketRpc: true,
      processResourceTelemetry: true,
    },
  };
}

const zcodeLiteTokenCookieName = "zcode_lite_token";

const staticMimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  // PWA manifest 必须用 application/manifest+json，缺省 octet-stream 会被 Safari 拒收，
  // 导致 Home Screen web app 失去 Web Push 资格。
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) {
    return cookies;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) {
      cookies.set(name, value);
    }
  }
  return cookies;
}

function hasValidLiteToken(c: Context, token: string): boolean {
  const url = new URL(c.req.url);
  if (tokensMatch(url.searchParams.get("token") ?? "", token)) {
    c.header("Set-Cookie", buildLiteTokenCookie(c, token));
    return true;
  }
  return tokensMatch(
    parseCookieHeader(c.req.header("cookie")).get(zcodeLiteTokenCookieName) ?? "",
    token,
  );
}

// 修复依据（2026-10-01 review）：此前 cookie 固定携带 Secure，纯 HTTP LAN 部署
// （docker-compose 发布 0.0.0.0:3030）下浏览器会拒绝存储该 cookie，认证流程死循环。
// Secure 只应在 HTTPS 请求上设置；HTTPS 判定优先取反代头 X-Forwarded-Proto。
function isHttpsRequest(c: Context): boolean {
  const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto) return forwardedProto === "https";
  return new URL(c.req.url).protocol === "https:";
}

function buildLiteTokenCookie(c: Context, token: string): string {
  const attributes = ["Path=/", "Max-Age=31536000", "HttpOnly"];
  if (isHttpsRequest(c)) attributes.push("Secure");
  attributes.push("SameSite=Lax");
  return `${zcodeLiteTokenCookieName}=${encodeURIComponent(token)}; ${attributes.join("; ")}`;
}

function tokensMatch(submitted: string, expected: string): boolean {
  // timingSafeEqual 要求等长输入；先各自哈希再比较，同时避免长度与字节时序泄漏。
  const submittedHash = createHash("sha256").update(submitted).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(submittedHash, expectedHash);
}

function isTokenProtectedPath(pathname: string): boolean {
  if (pathname === "/auth/bootstrap") {
    return false;
  }
  return pathname === "/ws" || pathname.startsWith("/ws/") || pathname.startsWith("/api/");
}

function isStaticFallbackAllowed(pathname: string): boolean {
  return !isTokenProtectedPath(pathname);
}

function isInsideDirectory(root: string, candidate: string): boolean {
  const diff = relative(root, candidate);
  return diff === "" || (!diff.startsWith("..") && !diff.includes(`..${sep}`));
}

async function resolveStaticFile(
  staticRoot: string,
  pathname: string,
  spaFallback: boolean,
): Promise<string | null> {
  const root = resolve(staticRoot);
  const normalizedPathname = pathname === "/" ? "/index.html" : pathname;
  const relativePath = decodeURIComponent(normalizedPathname).replace(/^\/+/, "");
  let candidate = resolve(root, relativePath);
  if (!isInsideDirectory(root, candidate)) {
    return null;
  }

  try {
    const candidateStat = await stat(candidate);
    if (candidateStat.isDirectory()) {
      candidate = resolve(candidate, "index.html");
      if (!isInsideDirectory(root, candidate)) {
        return null;
      }
      const indexStat = await stat(candidate);
      return indexStat.isFile() ? candidate : null;
    }
    if (candidateStat.isFile()) {
      return candidate;
    }
  } catch {
    // 静态资源未命中时再进入 SPA fallback，保留真实文件错误的 404 语义。
  }

  if (!spaFallback || !isStaticFallbackAllowed(pathname)) {
    return null;
  }
  const indexFile = resolve(root, "index.html");
  try {
    const indexStat = await stat(indexFile);
    return indexStat.isFile() ? indexFile : null;
  } catch {
    return null;
  }
}

function staticContentType(filePath: string): string {
  return staticMimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function createHttpServer(
  services: ServiceCollection,
  port = 3030,
  options: HttpServerOptions = {},
) {
  const app = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  const hostCapabilities = createHostCapabilityStore();

  const authToken = options.authToken?.trim();
  if (authToken) {
    app.use("*", async (c, next) => {
      const pathname = new URL(c.req.url).pathname;
      const validToken = hasValidLiteToken(c, authToken);
      if (validToken || !isTokenProtectedPath(pathname)) {
        await next();
        return;
      }
      return c.json({ error: "Unauthorized" }, 401);
    });
  } else {
    // 无 token 时除静态文件外全部开放（/ws、/api、远程连接）。Docker 部署把端口发布到
    // 0.0.0.0，必须在启动日志里明确暴露这一默认姿势，避免误以为服务有鉴权保护。
    log(
      "WARNING: no auth token configured (ZCODE_SERVER_AUTH_TOKEN) — API and WebSocket are open to anyone who can reach this port",
    );
  }

  app.post("/auth/bootstrap", async (c) => {
    if (!authToken) {
      return c.json({ authenticated: true, authenticationRequired: false });
    }
    const ip = clientIpOf(c);
    const failureState = authFailureByIp.get(ip);
    if (failureState && failureState.blockedUntil > Date.now()) {
      return c.json({ error: "Too many failed attempts. Try again later." }, 429);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid request body" }, 400);
    }
    const submittedToken =
      typeof body === "object" &&
      body !== null &&
      "token" in body &&
      typeof body.token === "string"
        ? body.token.trim()
        : "";
    if (!submittedToken || !tokensMatch(submittedToken, authToken)) {
      const state = authFailureByIp.get(ip) ?? { count: 0, blockedUntil: 0 };
      state.count += 1;
      if (state.count >= AUTH_MAX_FAILURES) {
        state.blockedUntil = Date.now() + AUTH_BLOCK_DURATION_MS;
        state.count = 0;
      }
      authFailureByIp.set(ip, state);
      if (authFailureByIp.size > 1024) {
        const now = Date.now();
        for (const [key, value] of authFailureByIp) {
          if (value.blockedUntil <= now) authFailureByIp.delete(key);
        }
      }
      return c.json({ error: "Invalid server token" }, 401);
    }
    authFailureByIp.delete(ip);
    c.header("Set-Cookie", buildLiteTokenCookie(c, authToken));
    return c.json({ authenticated: true, authenticationRequired: true });
  });

  app.get("/api/server-info", (c) => c.json(createServerInfo(options)));

  const webPushService = createWebPushService();
  if (!authToken) {
    app.use("/api/push/*", async (c, _next) =>
      c.json({ error: "Push registration requires server authentication" }, 503),
    );
  }
  app.get("/api/push/config", (c) => c.json(webPushService.config()));
  app.get("/api/push/devices", async (c) => c.json({ devices: await webPushService.listDevices() }));
  app.post("/api/push/devices", async (c) => {
    try {
      const input = parsePushSubscriptionInput(await c.req.json());
      const result = await webPushService.registerDevice(input);
      return c.json(result, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid push subscription";
      return c.json({ error: message }, 400);
    }
  });
  app.delete("/api/push/devices/:deviceId", async (c) => {
    const deviceId = c.req.param("deviceId");
    return c.json({ revoked: await webPushService.revokeDevice(deviceId) });
  });
  // Service Worker 诊断回调（2026-10-01 push 排查）：设备侧 push 生命周期只有这里能看到，
  // server transport 成功不代表设备显示成功。与 /api/push/* 共用 token 鉴权与 503 保护。
  app.post("/api/push/diagnostic", async (c) => {
    try {
      const input = parsePushDiagnosticInput(await c.req.json());
      const known = await webPushService.recordDeviceDiagnostic(input.deviceId, input.stage, input.detail);
      return c.json({ ok: true, known });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid push diagnostic";
      return c.json({ error: message }, 400);
    }
  });
  app.post("/api/push/test", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const deviceId =
        typeof body === "object" && body !== null && "deviceId" in body && typeof body.deviceId === "string"
          ? body.deviceId
          : undefined;
      await webPushService.testDevice(deviceId);
      return c.json({ ok: true });
    } catch (error) {
      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : undefined;
      const body =
        typeof error === "object" && error !== null && "body" in error
          ? (error as { body?: unknown }).body
          : undefined;
      const message =
        statusCode && Number.isFinite(statusCode)
          ? typeof body === "string" && body.trim()
            ? `Push service rejected the request (HTTP ${statusCode}): ${body.trim().slice(0, 500)}`
            : `Push service rejected the request (HTTP ${statusCode})`
          : error instanceof Error
            ? error.message
            : "Push test failed";
      return c.json({ error: message }, 503);
    }
  });

  app.post("/api/rpc-host-capability", (c) => c.json(hostCapabilities.issue()));

  // 普通 `/ws` 永远是 terminal-client；浏览器/任意客户端设置旧 mode header
  // 都不能再把自己提升为 trusted host。
  app.get(
    "/ws",
    upgradeWebSocket(() => ({
      onOpen(_event, ws) {
        setupChannelServer(ws.raw as WebSocket, services, "web-remote-replayable");
      },
    })),
  );

  const upgradeTrustedHostWebSocket = upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      setupChannelServer(ws.raw as WebSocket, services, "desktop-continuous");
    },
  }));
  app.use("/ws/host", async (c, next) => {
    const capability = c.req.header(ZCODE_RPC_HOST_CAPABILITY_HEADER);
    if (!hostCapabilities.consume(capability)) {
      return c.json({ error: "Invalid or expired host capability" }, 401);
    }
    await next();
  });
  app.get("/ws/host", upgradeTrustedHostWebSocket);

  // Web 模式下发起远程连接
  app.post("/api/connect-remote", async (c) => {
    const rawBody = await c.req.json();
    const parsedBody = remoteTargetSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return c.json({ error: `Invalid request body: ${formatZodError(parsedBody.error)}` }, 400);
    }
    const body = parsedBody.data;

    try {
      const backend = await createRemoteBackend(body);
      const connection = await connectRemote(backend);
      const id = generateId();
      remoteConnections.set(id, connection);

      return c.json({ id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  const handleBotCallback = async (c: Context) => {
    const provider = c.req.param("provider") as BotProvider;
    if (!botProviders.includes(provider)) {
      return c.json({ error: `Unsupported provider: ${provider}` }, 400);
    }
    if (provider !== "webhook") {
      return c.json({ error: `Provider ${provider} does not support HTTP callbacks.` }, 400);
    }
    const botsService = services.getOptional(IBotsService);
    if (!botsService) {
      return c.json({ error: "Bots service is not available." }, 503);
    }
    const rawBodyText = await c.req.text().catch(() => "");
    let rawBody: unknown = {};
    if (rawBodyText) {
      try {
        rawBody = JSON.parse(rawBodyText) as unknown;
      } catch {
        rawBody = { payload: rawBodyText };
      }
    }
    const webhookSecret = c.req.header("x-zcode-bot-secret");
    const botId = c.req.param("botId");
    const result = await botsService.handleProviderCallbackResponse(provider, {
      ...(typeof rawBody === "object" && rawBody !== null ? rawBody : { payload: rawBody }),
      rawBody: rawBodyText,
      ...(botId ? { botId } : {}),
      ...(webhookSecret ? { webhookSecret } : {}),
    });
    const responseBody = result.responseBody ?? { ok: result.ok, replies: result.replies };
    if (result.status === 400) {
      return c.json(responseBody, 400);
    }
    if (result.status === 401) {
      return c.json(responseBody, 401);
    }
    if (result.status === 503) {
      // Bugfix：Bot 业务失败必须把可重试状态透传给 HTTP provider；返回 200 会让
      // webhook/网关误以为消息已消费，效果与提前提交 Telegram offset 相同。
      return c.json(responseBody, 503);
    }
    return c.json(responseBody, 200);
  };

  app.post("/api/bots/:provider", handleBotCallback);
  app.post("/api/bots/:provider/:botId", handleBotCallback);

  // 远程连接的 WebSocket 端点，将远程 services 桥接给浏览器
  app.get(
    "/ws/remote/:id",
    upgradeWebSocket((c) => {
      const id = c.req.param("id");
      return {
        onOpen(_event, ws) {
          if (!id) {
            ws.close(4000, "Missing remote connection id");
            return;
          }
          const connection = remoteConnections.get(id);
          if (!connection) {
            ws.close(4004, "Remote connection not found");
            return;
          }
          // 一个连接只给一个 WS 客户端使用，取出后从 Map 移除
          remoteConnections.delete(id);

          // 将远程 services 包装为 ServiceCollection，复用 exposeOnChannelServer 统一注册
          const remoteServices = new ServiceCollection()
            .register(IFileService, connection.services.fileService)
            .register(IGitService, connection.services.gitService)
            .register(ISystemService, connection.services.systemService)
            .register(ITerminalService, connection.services.terminalService);

          setupChannelServer(ws.raw as WebSocket, remoteServices, "web-remote-replayable");
        },
      };
    }),
  );

  if (options.staticRoot?.trim()) {
    const staticRoot = options.staticRoot.trim();
    // sw.js 与 manifest 修复依据（2026-10-01 push 排查）：此前除 index.html 外全部返回
    // `max-age=31536000, immutable`，iOS Home Screen app 的 SW 更新检查会命中 HTTP 缓存长达一年，
    // 设备因此一直运行旧版 sw.js，推送"服务端发送成功但设备端无任何日志"。SW 脚本必须每次向源站确认新鲜度，
    // manifest 同理（Add to Home Screen 时读取）。
    const noCacheStatic = (filePath: string): boolean =>
      filePath.endsWith("index.html") ||
      filePath.endsWith("sw.js") ||
      filePath.endsWith(".webmanifest");
    app.get("*", async (c) => {
      const pathname = new URL(c.req.url).pathname;
      const filePath = await resolveStaticFile(staticRoot, pathname, options.spaFallback ?? true);
      if (!filePath) {
        return c.notFound();
      }
      return c.body(await readFile(filePath), 200, {
        "Cache-Control": noCacheStatic(filePath) ? "no-cache" : "public, max-age=31536000, immutable",
        "Content-Type": staticContentType(filePath),
      });
    });
  }

  const server = serve({ fetch: app.fetch, hostname: options.host, port }, () => {
    const address = server.address();
    const listenPort = typeof address === "object" && address ? address.port : port;
    const listenHost = options.host?.trim() || "localhost";
    log(`http://${listenHost}:${listenPort}`);
  });

  injectWebSocket(server);

  // 服务器关闭时释放通知订阅（webPushService 挂在进程级 notification bus 上），
  // 避免重复 createHttpServer（测试/热重载）时监听器残留。
  server.on("close", () => webPushService.dispose());

  return server;
}
