interface BadgeMethods {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

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
