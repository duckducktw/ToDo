export type TaskStatus = "todo" | "done";
export type AutomaticMoveKind = "rollover" | "auto_pull";

export interface AutomaticMove {
  kind: AutomaticMoveKind;
  from_date: string;
  moved_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  scheduled_date: string;
  /** Response-only date used by Planning to retain automatic-move context. */
  display_date?: string;
  is_flexible: boolean;
  sequence_order: number;
  origin_date: string;
  rollover_count: number;
  automatic_move: AutomaticMove | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  timezone: string;
  notification_settings: NotificationSettings;
  created_at: string;
  updated_at: string;
}

export type NotificationScheduleMode = "interval" | "fixed";

export interface NotificationTimeSlot {
  start: string;
  end: string;
}

export interface NotificationSettings {
  enabled: boolean;
  badgeEnabled: boolean;
  mode: NotificationScheduleMode;
  intervalHours: 1 | 2 | 3 | 4 | 6;
  slots: NotificationTimeSlot[];
  fixedTimes: string[];
  dndUntil: number | null;
  dndIndefinite: boolean;
  prefix: string;
}

export interface WebPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  is_all_day: boolean;
}

export interface TaskRangeResponse {
  tasks: Task[];
  revision: number;
  today: string;
  timezone: string;
}

export interface TaskMutationResponse {
  revision: number;
  affected_dates: string[];
  tasks_by_date: Record<string, Task[]>;
  rolled_over_ids: string[];
  auto_pulled_ids: string[];
}

export interface CalendarResponse {
  events: CalendarEvent[];
  timezone: string;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
  };
}
