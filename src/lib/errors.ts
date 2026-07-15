import { ZodError } from "zod";

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "REVISION_REQUIRED"
  | "STALE_REVISION"
  | "NOT_FOUND"
  | "STORE_CORRUPT"
  | "STORE_BUSY"
  | "CALENDAR_RECONNECT_REQUIRED"
  | "UPSTREAM_CALENDAR_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    public readonly status: number,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new AppError(
      "INVALID_REQUEST",
      400,
      error.issues[0]?.message ?? "Request validation failed.",
      error,
    );
  }

  return new AppError(
    "INTERNAL_ERROR",
    500,
    "An unexpected server error occurred.",
    error,
  );
}
