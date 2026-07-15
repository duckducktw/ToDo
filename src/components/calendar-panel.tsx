"use client";

import { DateTime } from "luxon";
import { signIn } from "next-auth/react";
import { CalendarDays, Clock3, Link2, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { CalendarEvent } from "@/types/domain";
import { ApiError, getErrorMessage, useCalendar } from "@/hooks/use-productivity-data";

interface CalendarStatusProps {
  error: unknown;
  onRetry: () => void;
  compact?: boolean;
}

export function CalendarError({ error, onRetry, compact = false }: CalendarStatusProps) {
  const reconnect = error instanceof ApiError && error.code === "CALENDAR_RECONNECT_REQUIRED";
  return (
    <div className={`state-panel error-state${compact ? " compact" : ""}`} role="alert">
      <span className="state-icon"><TriangleAlert aria-hidden="true" size={21} /></span>
      <div>
        <strong>{reconnect ? "需要重新連結 Google 日曆" : "暫時無法載入日曆"}</strong>
        {!compact ? <p>{getErrorMessage(error)}</p> : null}
      </div>
      <button
        className="button secondary small"
        type="button"
        onClick={reconnect ? () => void signIn("google", { redirectTo: window.location.href }) : onRetry}
      >
        {reconnect ? <Link2 aria-hidden="true" size={15} /> : <RefreshCw aria-hidden="true" size={15} />}
        {reconnect ? "重新連結" : "重試"}
      </button>
    </div>
  );
}

export function eventOccursOnDate(event: CalendarEvent, date: string, timezone: string) {
  if (event.is_all_day) return event.start <= date && event.end > date;
  const start = DateTime.fromISO(event.start, { setZone: true }).setZone(timezone);
  const end = DateTime.fromISO(event.end, { setZone: true }).setZone(timezone);
  const dayStart = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  return start < dayStart.plus({ days: 1 }) && end > dayStart;
}

export function formatEventTime(
  event: CalendarEvent,
  timezone: string,
  date?: string,
) {
  if (event.is_all_day) return "全天";
  const start = DateTime.fromISO(event.start, { setZone: true }).setZone(timezone);
  const end = DateTime.fromISO(event.end, { setZone: true }).setZone(timezone);
  if (date) {
    const dayStart = DateTime.fromISO(date, { zone: timezone }).startOf("day");
    const dayEnd = dayStart.plus({ days: 1 });
    if (start <= dayStart && end >= dayEnd) return "全天";
    const startLabel = start < dayStart ? "00:00" : start.toFormat("HH:mm");
    const endLabel = end >= dayEnd ? "24:00" : end.toFormat("HH:mm");
    return `${startLabel}–${endLabel}`;
  }
  return `${start.toFormat("HH:mm")}–${end.toFormat("HH:mm")}`;
}

export function DayCalendarReferences({ events, date, timezone, limit = 3 }: { events: CalendarEvent[]; date: string; timezone: string; limit?: number }) {
  const matching = events.filter((event) => eventOccursOnDate(event, date, timezone));
  if (matching.length === 0) return <p className="calendar-reference-empty">沒有日曆行程</p>;
  return (
    <div className="calendar-references" aria-label={`${date} Google 日曆行程`}>
      {matching.slice(0, limit).map((event) => (
        <div className="calendar-reference" key={event.id} title={event.title}>
          <span>{formatEventTime(event, timezone, date)}</span>
          <strong>{event.title}</strong>
        </div>
      ))}
      {matching.length > limit ? <span className="calendar-overflow">另有 {matching.length - limit} 項</span> : null}
    </div>
  );
}

function Timeline({ events, date, timezone }: { events: CalendarEvent[]; date: string; timezone: string }) {
  const [now, setNow] = useState(() => DateTime.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(DateTime.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const matching = events.filter((event) => eventOccursOnDate(event, date, timezone));
  const allDay = matching.filter((event) => event.is_all_day);
  const timed = matching.filter((event) => !event.is_all_day);
  const hourHeight = 52;
  const dayStart = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  const dayEnd = dayStart.plus({ days: 1 });
  const nowInZone = now.setZone(timezone);
  const isToday = nowInZone.toISODate() === date;
  const segments = timed
    .map((event) => {
      const rawStart = DateTime.fromISO(event.start, { setZone: true }).setZone(timezone);
      const rawEnd = DateTime.fromISO(event.end, { setZone: true }).setZone(timezone);
      const visibleStart = rawStart < dayStart ? dayStart : rawStart;
      const visibleEnd = rawEnd > dayEnd ? dayEnd : rawEnd;
      return {
        event,
        startMinute: visibleStart.diff(dayStart, "minutes").minutes,
        endMinute: visibleEnd.diff(dayStart, "minutes").minutes,
      };
    })
    .filter((segment) => segment.endMinute > segment.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const earliestEventHour = segments.length > 0 ? Math.floor(Math.min(...segments.map((segment) => segment.startMinute)) / 60) : 7;
  const latestEventHour = segments.length > 0 ? Math.ceil(Math.max(...segments.map((segment) => segment.endMinute)) / 60) : 22;
  const startHour = Math.max(0, Math.min(7, earliestEventHour, isToday ? nowInZone.hour : 7));
  const endHour = Math.min(24, Math.max(22, latestEventHour, isToday ? nowInZone.hour + 1 : 22));
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);

  const positioned = segments.map((segment) => ({ ...segment, lane: 0, lanes: 1 }));
  let groupStart = 0;
  while (groupStart < positioned.length) {
    let groupEnd = groupStart + 1;
    let latestEnd = positioned[groupStart].endMinute;
    while (groupEnd < positioned.length && positioned[groupEnd].startMinute < latestEnd) {
      latestEnd = Math.max(latestEnd, positioned[groupEnd].endMinute);
      groupEnd += 1;
    }
    const laneEnds: number[] = [];
    for (let index = groupStart; index < groupEnd; index += 1) {
      const availableLane = laneEnds.findIndex((endMinute) => endMinute <= positioned[index].startMinute);
      const lane = availableLane === -1 ? laneEnds.length : availableLane;
      laneEnds[lane] = positioned[index].endMinute;
      positioned[index].lane = lane;
    }
    for (let index = groupStart; index < groupEnd; index += 1) positioned[index].lanes = laneEnds.length;
    groupStart = groupEnd;
  }

  return (
    <>
      {allDay.length > 0 ? (
        <div className="all-day-events">
          <span>全天</span>
          <div>{allDay.map((event) => <strong key={event.id}>{event.title}</strong>)}</div>
        </div>
      ) : null}
      <div className="timeline-scroll" tabIndex={0} aria-label="當日日曆時間軸">
        <div className="timeline" style={{ height: (endHour - startHour) * hourHeight }}>
          {hours.map((hour) => (
            <div className="timeline-hour" key={hour} style={{ top: (hour - startHour) * hourHeight }}>
              <time>{hour === 24 ? "00:00" : `${String(hour).padStart(2, "0")}:00`}</time>
              <span />
            </div>
          ))}
          {isToday && nowInZone.hour + nowInZone.minute / 60 >= startHour && nowInZone.hour + nowInZone.minute / 60 <= endHour ? (
            <div className="current-time-marker" style={{ top: (nowInZone.hour + nowInZone.minute / 60 - startHour) * hourHeight }} aria-label={`現在時間 ${nowInZone.toFormat("HH:mm")}`}>
              <time>{nowInZone.toFormat("HH:mm")}</time><span />
            </div>
          ) : null}
          {positioned.map(({ event, startMinute, endMinute, lane, lanes }) => {
            const top = (startMinute - startHour * 60) / 60 * hourHeight;
            const height = Math.max(30, (endMinute - startMinute) / 60 * hourHeight);
            const laneWidth = 85 / lanes;
            return (
              <div
                className="timeline-event"
                key={event.id}
                style={{ top, height, left: `calc(${15 + laneWidth * lane}% + 2px)`, width: `calc(${laneWidth}% - 5px)`, right: "auto" }}
                title={`${formatEventTime(event, timezone, date)} ${event.title}`}
              >
                <strong>{event.title}</strong>
                <span>{formatEventTime(event, timezone, date)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {matching.length === 0 ? (
        <div className="calendar-open-day">
          <CalendarDays aria-hidden="true" size={21} />
          今天沒有固定行程
        </div>
      ) : null}
    </>
  );
}

export function TodayCalendarPanel({ date }: { date: string }) {
  const query = useCalendar(date, date);
  return (
    <section className="calendar-panel" aria-labelledby="calendar-panel-title">
      <div className="panel-heading compact-heading">
        <div>
          <span className="section-kicker"><Clock3 aria-hidden="true" size={14} />時間參考</span>
          <h2 id="calendar-panel-title">Google 日曆</h2>
        </div>
        <span className="readonly-label">唯讀</span>
      </div>
      {query.isPending ? <CalendarSkeleton /> : null}
      {query.isError ? <CalendarError error={query.error} onRetry={() => void query.refetch()} /> : null}
      {query.data ? <Timeline events={query.data.events} date={date} timezone={query.data.timezone} /> : null}
    </section>
  );
}

export function CalendarSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`calendar-skeleton${compact ? " compact" : ""}`} aria-label="正在載入 Google 日曆">
      {Array.from({ length: compact ? 3 : 8 }, (_, index) => <span key={index} />)}
    </div>
  );
}

export function PlanningCalendarState({ from, to, children }: { from: string; to: string; children: (data: { events: CalendarEvent[]; timezone: string }) => React.ReactNode }) {
  const query = useCalendar(from, to);
  if (query.isPending) return <CalendarSkeleton compact />;
  if (query.isError) return <CalendarError compact error={query.error} onRetry={() => void query.refetch()} />;
  return query.data ? children(query.data) : null;
}
