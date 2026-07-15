import { z } from "zod";

import {
  calendarDaysBetween,
  isValidDate,
  isValidTimezone,
} from "@/lib/date";

export const dateSchema = z
  .string()
  .refine(isValidDate, "Date must use a valid YYYY-MM-DD value.");

export const timezoneSchema = z
  .string()
  .refine(isValidTimezone, "Timezone must be a valid IANA timezone.");

const isoTimestampSchema = z.iso.datetime({ offset: true });

export const automaticMoveSchema = z
  .object({
    kind: z.enum(["rollover", "auto_pull"]),
    from_date: dateSchema,
    moved_at: isoTimestampSchema,
  })
  .strict();

export const taskSchema = z
  .object({
    id: z.uuid(),
    title: z.string().min(1).max(120),
    description: z.string().max(1_000),
    status: z.enum(["todo", "done"]),
    scheduled_date: dateSchema,
    is_flexible: z.boolean(),
    sequence_order: z.number().int().positive(),
    origin_date: dateSchema,
    rollover_count: z.number().int().nonnegative(),
    automatic_move: automaticMoveSchema.nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
    completed_at: isoTimestampSchema.nullable(),
  })
  .strict();

export const taskFileSchema = z
  .object({
    schema_version: z.literal(1),
    revision: z.number().int().nonnegative(),
    tasks: z.array(taskSchema),
  })
  .strict();

export const userProfileSchema = z
  .object({
    id: z.string().regex(/^google_[A-Za-z0-9_-]{1,200}$/),
    email: z.string().email(),
    name: z.string().min(1).max(200),
    avatar_url: z.string().url().nullable(),
    timezone: timezoneSchema,
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
  })
  .strict();

export const usersFileSchema = z
  .object({
    schema_version: z.literal(1),
    revision: z.number().int().nonnegative(),
    users: z.array(userProfileSchema),
  })
  .strict();

export const oauthCredentialSchema = z
  .object({
    schema_version: z.literal(1),
    user_id: z.string().regex(/^google_[A-Za-z0-9_-]{1,200}$/),
    access_token: z.string().min(1),
    refresh_token: z.string().min(1).nullable(),
    expires_at: z.number().int().positive().nullable(),
    token_type: z.string().nullable(),
    scope: z.string().nullable(),
    updated_at: isoTimestampSchema,
  })
  .strict();

export const encryptedVaultSchema = z
  .object({
    schema_version: z.literal(1),
    algorithm: z.literal("aes-256-gcm"),
    iv: z.string().min(1),
    ciphertext: z.string().min(1),
    auth_tag: z.string().min(1),
  })
  .strict();

const titleInputSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(120));

export const createTaskInputSchema = z
  .object({
    title: titleInputSchema,
    description: z.string().max(1_000).optional().default(""),
    scheduled_date: dateSchema,
    is_flexible: z.boolean().optional().default(true),
  })
  .strict();

export const patchTaskInputSchema = z
  .object({
    title: titleInputSchema.optional(),
    description: z.string().max(1_000).optional(),
    status: z.enum(["todo", "done"]).optional(),
    scheduled_date: dateSchema.optional(),
    is_flexible: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one task field is required.",
  });

export const reorderTaskInputSchema = z
  .object({
    task_id: z.uuid(),
    destination_date: dateSchema,
    destination_index: z.number().int().nonnegative(),
  })
  .strict();

export const dateRangeQuerySchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
  })
  .refine((value) => value.from <= value.to, {
    message: "The from date must not be after the to date.",
  })
  .refine(
    (value) =>
      value.from > value.to || calendarDaysBetween(value.from, value.to) <= 61,
    {
      message: "Date ranges may include at most 62 days.",
    },
  );

export const timezoneInputSchema = z
  .object({ timezone: timezoneSchema })
  .strict();

export type TaskFile = z.infer<typeof taskFileSchema>;
export type UsersFile = z.infer<typeof usersFileSchema>;
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type PatchTaskInput = z.infer<typeof patchTaskInputSchema>;
export type ReorderTaskInput = z.infer<typeof reorderTaskInputSchema>;
export type OAuthCredential = z.infer<typeof oauthCredentialSchema>;
