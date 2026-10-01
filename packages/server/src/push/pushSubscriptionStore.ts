import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface StoredPushSubscription {
  deviceId: string;
  deviceName?: string;
  workspaceIdentity?: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
  lastDiagnosticAt?: string;
  lastDiagnosticStage?: string;
  lastDiagnosticDetail?: string;
}

interface StoreFile {
  version: 1;
  subscriptions: StoredPushSubscription[];
}

export interface PushSubscriptionInput {
  deviceId?: string;
  deviceName?: string;
  workspaceIdentity?: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export class PushSubscriptionStore {
  private readonly path: string;
  private writeChain: Promise<void> = Promise.resolve();
  private state: StoreFile | null = null;

  constructor(path: string) {
    this.path = path;
  }

  async list(): Promise<StoredPushSubscription[]> {
    const state = await this.load();
    return state.subscriptions.map((item) => ({ ...item, keys: { ...item.keys } }));
  }

  async upsert(input: PushSubscriptionInput): Promise<StoredPushSubscription> {
    return this.mutate((state) => {
      const now = new Date().toISOString();
      const existing = input.deviceId
        ? state.subscriptions.find((item) => item.deviceId === input.deviceId)
        : state.subscriptions.find((item) => item.endpoint === input.endpoint);
      const item: StoredPushSubscription = {
        deviceId: existing?.deviceId ?? input.deviceId ?? randomUUID(),
        ...(input.deviceName?.trim() ? { deviceName: input.deviceName.trim().slice(0, 80) } : {}),
        ...(input.workspaceIdentity?.trim() ? { workspaceIdentity: input.workspaceIdentity.trim() } : {}),
        endpoint: input.endpoint,
        keys: input.keys,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        enabled: true,
        ...(existing?.lastSuccessAt ? { lastSuccessAt: existing.lastSuccessAt } : {}),
        ...(existing?.lastFailureAt ? { lastFailureAt: existing.lastFailureAt } : {}),
        ...(existing?.lastFailureReason ? { lastFailureReason: existing.lastFailureReason } : {}),
        ...(existing?.lastDiagnosticAt ? { lastDiagnosticAt: existing.lastDiagnosticAt } : {}),
        ...(existing?.lastDiagnosticStage ? { lastDiagnosticStage: existing.lastDiagnosticStage } : {}),
        ...(existing?.lastDiagnosticDetail ? { lastDiagnosticDetail: existing.lastDiagnosticDetail } : {}),
      };
      state.subscriptions = state.subscriptions.filter((candidate) => candidate.deviceId !== item.deviceId);
      state.subscriptions.push(item);
      return item;
    });
  }
  async revoke(deviceId: string): Promise<boolean> {
    return this.mutate((state) => {
      const before = state.subscriptions.length;
      state.subscriptions = state.subscriptions.filter((item) => item.deviceId !== deviceId);
      return state.subscriptions.length !== before;
    });
  }

  async markSuccess(deviceId: string): Promise<void> {
    await this.mutate((state) => {
      const item = state.subscriptions.find((candidate) => candidate.deviceId === deviceId);
      if (item) {
        item.lastSuccessAt = new Date().toISOString();
        item.lastFailureAt = undefined;
        item.lastFailureReason = undefined;
      }
      return undefined;
    });
  }

  async markFailure(deviceId: string, reason: string): Promise<void> {
    await this.mutate((state) => {
      const item = state.subscriptions.find((candidate) => candidate.deviceId === deviceId);
      if (item) {
        item.lastFailureAt = new Date().toISOString();
        item.lastFailureReason = reason.slice(0, 240);
      }
      return undefined;
    });
  }

  async markDiagnostic(deviceId: string, stage: string, detail?: string): Promise<boolean> {
    return this.mutate((state) => {
      const item = state.subscriptions.find((candidate) => candidate.deviceId === deviceId);
      if (!item) return false;
      item.lastDiagnosticAt = new Date().toISOString();
      item.lastDiagnosticStage = stage;
      item.lastDiagnosticDetail = detail?.trim() ? detail.trim().slice(0, 240) : undefined;
      return true;
    });
  }
  private async load(): Promise<StoreFile> {
    if (this.state) return this.state;
    try {
      const raw = JSON.parse(await readFile(this.path, "utf8")) as unknown;
      const subscriptions =
        typeof raw === "object" && raw !== null && Array.isArray((raw as { subscriptions?: unknown }).subscriptions)
          ? (raw as { subscriptions: StoredPushSubscription[] }).subscriptions
          : [];
      this.state = { version: 1, subscriptions };
    } catch {
      this.state = { version: 1, subscriptions: [] };
    }
    return this.state;
  }

  private async mutate<T>(fn: (state: StoreFile) => T): Promise<T> {
    let result!: T;
    this.writeChain = this.writeChain.catch(() => undefined).then(async () => {
      const state = await this.load();
      result = fn(state);
      await mkdir(dirname(this.path), { recursive: true });
      const tempPath = `${this.path}.${process.pid}.tmp`;
      await writeFile(tempPath, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
      await rename(tempPath, this.path);
      try {
        await chmod(this.path, 0o600);
      } catch {
        // Windows does not expose POSIX mode semantics; the file remains protected by the OS ACL.
      }
    });
    await this.writeChain;
    return result;
  }
}
