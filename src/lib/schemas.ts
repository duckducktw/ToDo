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

const notificationTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const notificationSettingsSchema = z.object({
  enabled: z.boolean(),
  badgeEnabled: z.boolean().default(false),
  mode: z.enum(["interval", "fixed"]),
  intervalHours: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(6)]),
  slots: z.array(z.object({ start: notificationTimeSchema, end: notificationTimeSchema }).strict()).min(1).max(4),
  fixedTimes: z.array(notificationTimeSchema).min(1).max(8),
  dndUntil: z.number().int().nonnegative().nullable(),
  dndIndefinite: z.boolean(),
  prefix: z.string().max(40),
}).strict();

export const defaultNotificationSettings = {
  enabled: false,
  badgeEnabled: false,
  mode: "interval" as const,
  intervalHours: 2 as const,
  slots: [{ start: "07:00", end: "11:30" }, { start: "13:30", end: "17:30" }],
  fixedTimes: ["09:00", "14:00", "17:00"],
  dndUntil: null,
  dndIndefinite: false,
  prefix: "做得很好！",
};

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
    notification_settings: notificationSettingsSchema.default(defaultNotificationSettings),
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

export const webPushSubscriptionSchema = z.object({
  endpoint: z.url(),
  // WebKit may omit this optional PushSubscriptionJSON member.
  expirationTime: z.number().nonnegative().nullable().default(null),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }).strict(),
}).strict();

const pushUserStateSchema = z.object({
  user_id: z.string().regex(/^google_[A-Za-z0-9_-]{1,200}$/),
  subscriptions: z.array(webPushSubscriptionSchema).max(32),
  last_dispatch_minute: z.string().nullable(),
  empty_notification_date: dateSchema.nullable(),
  deliveries: z.array(z.object({
    dispatch_key: z.string().min(1).max(100),
    endpoint: z.url(),
    payload: z.string().min(1).max(16_384),
    attempts: z.number().int().nonnegative(),
    next_attempt_at: isoTimestampSchema,
    expires_at: isoTimestampSchema,
    sent_at: isoTimestampSchema.nullable(),
  }).strict()).max(256).default([]),
}).strict();

export const pushStoreSchema = z.object({
  schema_version: z.literal(1),
  revision: z.number().int().nonnegative(),
  users: z.array(pushUserStateSchema),
}).strict();

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

export const userSettingsInputSchema = z
  .object({
    timezone: timezoneSchema.optional(),
    notification_settings: notificationSettingsSchema.optional(),
  })
  .strict()
  .refine((value) => value.timezone !== undefined || value.notification_settings !== undefined, {
    message: "At least one user setting is required.",
  });

export type TaskFile = z.infer<typeof taskFileSchema>;
export type UsersFile = z.infer<typeof usersFileSchema>;
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type PatchTaskInput = z.infer<typeof patchTaskInputSchema>;
export type ReorderTaskInput = z.infer<typeof reorderTaskInputSchema>;
export type OAuthCredential = z.infer<typeof oauthCredentialSchema>;
export type PushStore = z.infer<typeof pushStoreSchema>;
