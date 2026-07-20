interface BadgeMethods {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

export const APP_BADGE_SYNC_EVENT = "flow-todo:sync-app-badge";
export const APP_BADGE_SETTING_EVENT = "flow-todo:set-app-badge-enabled";
export const APP_SETTINGS_SYNC_EVENT = "flow-todo:sync-settings";

export async function syncAppBadge(count: number): Promise<void> {
  const badgeNavigator = navigator as unknown as BadgeMethods;
  try {
    if (count > 0) {
      await badgeNavigator.setAppBadge?.(count);
    } else {
      await badgeNavigator.clearAppBadge?.();
    }
  } catch {
    // Badge support and permission vary by browser and installation state.
  }
}

export function requestAppBadgeSync(): void {
  window.dispatchEvent(new Event(APP_BADGE_SYNC_EVENT));
}

export function setAppBadgeEnabled(enabled: boolean): void {
  window.dispatchEvent(new CustomEvent<boolean>(APP_BADGE_SETTING_EVENT, { detail: enabled }));
}
