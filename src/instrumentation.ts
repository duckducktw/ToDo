export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPushScheduler } = await import("@/lib/push-scheduler");
    startPushScheduler();
  }
}
