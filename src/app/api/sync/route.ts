import { requireApiUser } from "@/lib/auth-user";
import { apiHandler } from "@/lib/api";
import { subscribeToSyncEvents } from "@/lib/sync-events";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return apiHandler(async () => {
    const user = await requireApiUser();
    const encoder = new TextEncoder();
    let cleanup: () => void = () => undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (value: string) => controller.enqueue(encoder.encode(value));
        const unsubscribe = subscribeToSyncEvents(user.id, (kind) => {
          send(`event: ${kind}\ndata: {}\n\n`);
        });
        const heartbeat = setInterval(() => send(": keepalive\n\n"), 25_000);
        const close = () => {
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // The browser may already have closed the stream.
          }
        };
        request.signal.addEventListener("abort", close, { once: true });
        cleanup = close;
        send("retry: 3000\n\n");
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
