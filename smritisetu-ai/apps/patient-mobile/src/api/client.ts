import type {
  DevicePairingResponse,
  GameConfig,
  OfflinePackage,
  SyncEventEnvelope,
  SyncResponse,
  SyncStatusResponse,
} from "@smritisetu/shared-types";
import { API_BASE, REQUEST_TIMEOUT_MS } from "./config";
import { ApiRequestError, NetworkError } from "./errors";
import { secureStorage } from "./secureStorage";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  authenticated?: boolean;
  timeoutMs?: number;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, authenticated = true, timeoutMs = REQUEST_TIMEOUT_MS } = options;

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authenticated) {
    const token = await secureStorage.getDeviceToken();
    if (!token) throw new ApiRequestError(401, "NOT_PAIRED", "This device is not paired");
    headers.authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    // Offline, DNS failure or timeout — never the server's answer.
    throw new NetworkError("Could not reach the server", error);
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  const parsed = text.length > 0 ? safeJson(text) : null;

  if (!response.ok) {
    const errorBody = (parsed as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiRequestError(
      response.status,
      errorBody?.code ?? "UNKNOWN",
      errorBody?.message ?? `Request failed with status ${response.status}`,
      errorBody?.details,
    );
  }

  return (parsed as { data: T })?.data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const apiClient = {
  async pairDevice(input: {
    pairingCode: string;
    deviceIdentifier: string;
    platform?: string;
    appVersion?: string;
    pushToken?: string;
  }): Promise<DevicePairingResponse> {
    return request<DevicePairingResponse>("/devices/pair", {
      method: "POST",
      body: input,
      authenticated: false,
      timeoutMs: 4000,
    });
  },

  async getOfflinePackage(patientId: string, language?: string): Promise<OfflinePackage> {
    const query = language ? `?language=${encodeURIComponent(language)}` : "";
    return request<OfflinePackage>(`/patients/${patientId}/offline-package${query}`, {
      // The package can be large on a slow connection.
      timeoutMs: 45000,
    });
  },

  async getGameConfig(patientId: string): Promise<GameConfig> {
    return request<GameConfig>(`/patients/${patientId}/game-config`);
  },

  async pushEvents(events: SyncEventEnvelope[], clientPackageVersion: number): Promise<SyncResponse> {
    return request<SyncResponse>("/sync/events", {
      method: "POST",
      body: { events, clientPackageVersion },
      timeoutMs: 30000,
    });
  },

  async getSyncStatus(deviceId: string): Promise<SyncStatusResponse> {
    return request<SyncStatusResponse>(`/sync/status/${deviceId}`);
  },

  async updatePreferences(
    patientId: string,
    changes: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return request(`/patients/${patientId}`, { method: "PATCH", body: changes });
  },

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE.replace("/api/v1", "")}/health`, {
        signal: AbortSignal.timeout(4000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};

export { ApiRequestError, NetworkError };
