"use client";

import { DateTime } from "luxon";
import { useCallback, useEffect, useState } from "react";
import { useTasks } from "@/hooks/use-productivity-data";
import { APP_BADGE_SETTING_EVENT, APP_BADGE_SYNC_EVENT, syncAppBadge } from "@/lib/app-badge";

function browserToday() {
  return DateTime.local().toISODate() ?? "2026-07-15";
}

export function AppBadgeSync() {
  const [date, setDate] = useState(browserToday);
  const [badgeEnabled, setBadgeEnabled] = useState(false);
  const query = useTasks(date, date, true);
  const syncCurrentBadge = useCallback(() => {
    if (!badgeEnabled) {
      void syncAppBadge(0);
      return;
    }
    if (!query.data || query.data.today !== date) return;
    const remainingCount = query.data.tasks.filter((task) => task.status === "todo").length;
    void syncAppBadge(remainingCount);
  }, [badgeEnabled, date, query.data]);

  useEffect(() => {
    if (!query.data || query.data.today === date) return;
    const timeout = window.setTimeout(() => setDate(query.data!.today), 0);
    return () => window.clearTimeout(timeout);
  }, [date, query.data]);

  useEffect(() => {
    syncCurrentBadge();
  }, [syncCurrentBadge]);

  useEffect(() => {
    window.addEventListener(APP_BADGE_SYNC_EVENT, syncCurrentBadge);
    return () => window.removeEventListener(APP_BADGE_SYNC_EVENT, syncCurrentBadge);
  }, [syncCurrentBadge]);

  useEffect(() => {
    const updateSetting = (event: Event) => {
      setBadgeEnabled((event as CustomEvent<boolean>).detail === true);
    };
    window.addEventListener(APP_BADGE_SETTING_EVENT, updateSetting);
    return () => window.removeEventListener(APP_BADGE_SETTING_EVENT, updateSetting);
  }, []);

  return null;
}
