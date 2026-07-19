import path from "node:path";

function configuredDefaultTimezone(): string {
  const candidate = process.env.APP_DEFAULT_TIMEZONE?.trim() || "Asia/Taipei";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "Asia/Taipei";
  }
}

export const DEFAULT_TIMEZONE = configuredDefaultTimezone();

export function getDataStoreDir(): string {
  const configured = process.env.DATA_STORE_DIR?.trim() || "src/data";
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), configured);
}

export function isTestAuthEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_TEST_MODE === "true"
  );
}

export function assertConfiguredAuthSecret(): void {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return;
  }
  if (
    secret.length < 32 ||
    /^(?:replace-with|change-me|secret)/i.test(secret)
  ) {
    throw new Error(
      "AUTH_SECRET must be a non-placeholder secret with at least 32 characters.",
    );
  }
}

export interface WebPushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function getWebPushConfig(): WebPushConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:|https:\/\/)/.test(subject)) {
    throw new Error("VAPID_SUBJECT must be a mailto: or https: URL.");
  }
  return { publicKey, privateKey, subject };
}
