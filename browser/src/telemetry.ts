import fs from "node:fs";
import path from "node:path";

import {
  LOGS_DIR,
  anonymousId,
  installedChannel,
  lastActiveDay,
  lastSeenVersion,
  setLastActiveDay,
  setLastSeenVersion,
} from "shared";

const POSTHOG_PROJECT_KEY = "phc_CGHn2kUdTTqGJJNR3td6hRwzE4KexxdssMsGtTMtyZXk";
const POSTHOG_ORIGIN = process.env.TERMINAL_BROWSER_TELEMETRY_ORIGIN ?? "https://eu.i.posthog.com";
const PERSON_PROFILES = false;
const SEND_TIMEOUT_MS = 5000;
const OPT_OUT_ENV_VARS = ["DO_NOT_TRACK", "TERMINAL_BROWSER_NO_TELEMETRY"];
const ERROR_TYPE_MAX_LENGTH = 64;
export const TELEMETRY_LOG_FILE = path.join(LOGS_DIR, "telemetry.jsonl");

type EventName = "app_launched" | "app_upgraded" | "daily_active" | "$exception";

export type CrashSource = "uncaughtException" | "unhandledRejection";

interface TelemetryOptions {
  version: string;
  usageEnabled(): boolean;
  crashReportsEnabled(): boolean;
  terminal(): string | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function envOptsOut(): boolean {
  return OPT_OUT_ENV_VARS.some((name) => {
    const value = process.env[name]?.trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "on";
  });
}

export function errorType(error: unknown): string {
  const type = error instanceof Error ? error.name || "Error" : typeof error;
  return type.slice(0, ERROR_TYPE_MAX_LENGTH);
}

export class Telemetry {
  private activeDay: string | null = null;

  constructor(private readonly options: TelemetryOptions) {}

  launched() {
    try {
      const previous = lastSeenVersion();
      const version = this.options.version;
      if (previous !== version) setLastSeenVersion(version);
      void this.send("app_launched", { first_launch: previous === null });
      if (previous && previous !== version) void this.send("app_upgraded", { from_version: previous });
    } catch {}
  }

  used() {
    try {
      const day = today();
      if (this.activeDay === day || !this.allowed("usage")) return;
      this.activeDay = day;
      if (lastActiveDay() === day) return;
      setLastActiveDay(day);
      void this.send("daily_active");
    } catch {}
  }

  crashed(error: unknown, source: CrashSource): Promise<void> {
    if (!this.allowed("crash")) return Promise.resolve();
    const type = errorType(error);
    return this.send(
      "$exception",
      {
        source,
        $exception_level: source === "uncaughtException" ? "fatal" : "error",
        $exception_fingerprint: type,
        $exception_list: [{ type, value: type, mechanism: { handled: false, synthetic: false } }],
      },
      "crash",
    );
  }

  private allowed(kind: "usage" | "crash"): boolean {
    if (!POSTHOG_PROJECT_KEY) return false;
    if (this.options.version === "dev" && !process.env.TERMINAL_BROWSER_TELEMETRY_ORIGIN) return false;
    if (envOptsOut()) return false;
    return kind === "usage" ? this.options.usageEnabled() : this.options.crashReportsEnabled();
  }

  private send(event: EventName, properties: Record<string, unknown> = {}, kind: "usage" | "crash" = "usage"): Promise<void> {
    if (!this.allowed(kind)) return Promise.resolve();
    const install = {
      version: this.options.version,
      channel: installedChannel(),
      os: process.platform,
      arch: process.arch,
      terminal: this.options.terminal(),
    };
    const body = {
      api_key: POSTHOG_PROJECT_KEY,
      event,
      distinct_id: anonymousId(),
      timestamp: new Date().toISOString(),
      properties: {
        ...install,
        ...properties,
        $geoip_disable: true,
        $process_person_profile: PERSON_PROFILES,
        ...(PERSON_PROFILES ? { $set: install } : {}),
      },
    };
    const json = JSON.stringify(body);
    logSent(json);
    return fetch(`${POSTHOG_ORIGIN}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: json,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    }).then(
      () => undefined,
      () => undefined,
    );
  }
}

function logSent(json: string) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.appendFileSync(TELEMETRY_LOG_FILE, `${json}\n`);
  } catch {}
}
