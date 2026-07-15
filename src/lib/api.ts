import type { ZodType } from "zod";

import { AppError, toAppError } from "@/lib/errors";
import type { TaskTransactionResult } from "@/lib/store";
import type {
  ApiErrorPayload,
  TaskMutationResponse,
} from "@/types/domain";

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

const MAX_JSON_BODY_BYTES = 16 * 1024;

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(PRIVATE_HEADERS)) {
    headers.set(key, value);
  }
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export async function apiHandler(
  operation: () => Promise<Response>,
): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    const appError = toAppError(error);
    const payload: ApiErrorPayload = {
      error: { code: appError.code, message: appError.message },
    };
    return jsonResponse(payload, { status: appError.status });
  }
}

export async function parseJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  validateMutationOrigin(request);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    !contentType.startsWith("application/json") &&
    !contentType.includes("+json")
  ) {
    throw new AppError(
      "UNSUPPORTED_MEDIA_TYPE",
      415,
      "Request body must use application/json.",
    );
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_JSON_BODY_BYTES
  ) {
    throw new AppError(
      "PAYLOAD_TOO_LARGE",
      413,
      "Request body is too large.",
    );
  }

  let source: string;
  try {
    source = await request.text();
  } catch (error) {
    throw new AppError(
      "INVALID_REQUEST",
      400,
      "Request body could not be read.",
      error,
    );
  }
  if (new TextEncoder().encode(source).byteLength > MAX_JSON_BODY_BYTES) {
    throw new AppError(
      "PAYLOAD_TOO_LARGE",
      413,
      "Request body is too large.",
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(source) as unknown;
  } catch (error) {
    throw new AppError(
      "INVALID_REQUEST",
      400,
      "Request body must be valid JSON.",
      error,
    );
  }
  return schema.parse(body);
}

export function validateMutationOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    return;
  }

  let requestOrigin: string;
  let suppliedOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
    suppliedOrigin = new URL(origin).origin;
  } catch (error) {
    throw new AppError("FORBIDDEN", 403, "Request origin is invalid.", error);
  }
  if (requestOrigin !== suppliedOrigin) {
    throw new AppError("FORBIDDEN", 403, "Cross-origin mutation denied.");
  }
}

export function parseExpectedRevision(request: Request): number {
  validateMutationOrigin(request);
  const value = request.headers.get("if-match")?.trim();
  if (!value) {
    throw new AppError(
      "REVISION_REQUIRED",
      428,
      "If-Match with the current task revision is required.",
    );
  }
  const match = /^(?:W\/)?"?(\d+)"?$/.exec(value);
  if (!match) {
    throw new AppError(
      "INVALID_REQUEST",
      400,
      "If-Match must contain a numeric task revision.",
    );
  }
  return Number(match[1]);
}

export function taskMutationPayload(
  transaction: TaskTransactionResult,
): TaskMutationResponse {
  const affectedDates = transaction.operation.affectedDates;
  const tasksByDate: Record<string, typeof transaction.document.tasks> = {};
  for (const date of affectedDates) {
    tasksByDate[date] = transaction.document.tasks.filter(
      (task) => task.scheduled_date === date,
    );
  }

  return {
    revision: transaction.document.revision,
    affected_dates: affectedDates,
    tasks_by_date: tasksByDate,
    rolled_over_ids: transaction.operation.rolledOverIds,
    auto_pulled_ids: transaction.operation.autoPulledIds,
  };
}
