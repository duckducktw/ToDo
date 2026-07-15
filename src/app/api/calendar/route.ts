import { apiHandler, jsonResponse } from "@/lib/api";
import { requireApiUser } from "@/lib/auth-user";
import { fetchCalendarEvents } from "@/lib/calendar";
import { dateRangeQuerySchema } from "@/lib/schemas";
import type { CalendarResponse } from "@/types/domain";

export async function GET(request: Request): Promise<Response> {
  return apiHandler(async () => {
    const user = await requireApiUser();
    const url = new URL(request.url);
    const range = dateRangeQuerySchema.parse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    const events = await fetchCalendarEvents(
      user.id,
      range.from,
      range.to,
      user.timezone,
    );
    const payload: CalendarResponse = { events, timezone: user.timezone };
    return jsonResponse(payload);
  });
}

