"use client";

import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DateTime } from "luxon";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { CalendarEvent, Task } from "@/types/domain";
import { CalendarError, CalendarSkeleton, DayCalendarReferences } from "@/components/calendar-panel";
import { IconTooltip } from "@/components/app-shell";
import { SortableTaskCard, TaskCard, type TaskMoveAction } from "@/components/task-card";
import { TaskEditorDialog, type TaskEditorValue } from "@/components/task-editor-dialog";
import { getErrorMessage, useCalendar, useTaskActions, useTasks } from "@/hooks/use-productivity-data";
import { AnimatedDetails } from "@/components/animated-details";
import { useCompletionAnimation } from "@/hooks/use-completion-animation";

type PlanningMode = "week" | "month";

function planningDate(task: Task) {
  return task.display_date ?? task.scheduled_date;
}

const planningCollisionDetection: CollisionDetection = (arguments_) => {
  const activeTask = arguments_.active.data.current?.task as Task | undefined;
  const sourceDayId = activeTask ? `day:${planningDate(activeTask)}` : null;
  const destinationDay = pointerWithin(arguments_).find(
    (collision) =>
      String(collision.id).startsWith("day:") &&
      String(collision.id) !== sourceDayId,
  );
  if (destinationDay) {
    return [destinationDay];
  }

  return closestCorners(arguments_).filter(
    (collision) => collision.id !== arguments_.active.id,
  );
};

function validDate(value: string | null) {
  if (!value) return DateTime.local().toISODate() ?? "2026-07-15";
  const parsed = DateTime.fromISO(value);
  return parsed.isValid ? value : DateTime.local().toISODate() ?? "2026-07-15";
}

function datesBetween(from: DateTime, count: number) {
  return Array.from({ length: count }, (_, index) => from.plus({ days: index }).toISODate()!);
}

interface DayLaneProps {
  date: string;
  tasks: Task[];
  events: CalendarEvent[];
  timezone: string;
  today: string;
  disabled: boolean;
  completingIds: ReadonlySet<string>;
  taskProps: Omit<React.ComponentProps<typeof SortableTaskCard>, "task" | "index" | "count">;
  onAdd: (date: string) => void;
}

function DayLane({ date, tasks, events, timezone, today, disabled, completingIds, taskProps, onAdd }: DayLaneProps) {
  const active = tasks.filter((task) => task.status === "todo" || completingIds.has(task.id)).sort((a, b) => a.sequence_order - b.sequence_order);
  const done = tasks.filter((task) => task.status === "done" && !completingIds.has(task.id)).sort((a, b) => a.sequence_order - b.sequence_order);
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, data: { date } });
  const value = DateTime.fromISO(date).setLocale("zh-TW");

  return (
    <section ref={setNodeRef} className={`week-day-lane${date === today ? " today" : ""}${isOver ? " drop-target" : ""}`} aria-labelledby={`day-${date}`}>
      <header className="week-day-header">
        <div>
          <span>{value.toFormat("ccc")}</span>
          <strong id={`day-${date}`}>{value.day}</strong>
        </div>
        <IconTooltip label={`在 ${value.toFormat("M 月 d 日")}新增待辦`}>
          <button className="icon-button compact" type="button" autoComplete="off" onClick={() => onAdd(date)} aria-label={`在 ${value.toFormat("M 月 d 日")}新增待辦`} disabled={disabled}>
            <Plus aria-hidden="true" size={16} />
          </button>
        </IconTooltip>
      </header>
      <DayCalendarReferences events={events} date={date} timezone={timezone} limit={2} />
      <SortableContext items={active.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="week-task-stack">
          {active.map((task, index) => (
            <SortableTaskCard compact key={task.id} task={task} index={index} count={active.length} completing={completingIds.has(task.id)} {...taskProps} />
          ))}
          {active.length === 0 ? <p className="day-empty">尚無待辦</p> : null}
        </div>
      </SortableContext>
      {done.length > 0 ? (
        <AnimatedDetails
          className="day-completed"
          summary={<><CheckCircle2 aria-hidden="true" size={14} />已完成 {done.length}<ChevronDown aria-hidden="true" size={14} /></>}
        >
          <div className="week-task-stack done-stack">
            {done.map((task, index) => <TaskCard compact key={task.id} task={task} index={index} count={done.length} completing={completingIds.has(task.id)} {...taskProps} />)}
          </div>
        </AnimatedDetails>
      ) : null}
    </section>
  );
}

interface MonthCellProps {
  date: string;
  currentMonth: number;
  today: string;
  selected: boolean;
  tasks: Task[];
  events: CalendarEvent[];
  timezone: string;
  completingIds: ReadonlySet<string>;
  disabled: boolean;
  onSelect: (date: string) => void;
  onAdd: (date: string) => void;
}

function MonthTask({ task, disabled }: { task: Task; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `month:${task.id}`,
    data: { task },
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      className={`month-task${task.is_flexible ? " flexible" : " locked"}${isDragging ? " dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button type="button" aria-label={`拖曳「${task.title}」`} {...attributes} {...listeners}>
        {task.title}
      </button>
    </li>
  );
}

function MonthCell({ date, currentMonth, today, selected, tasks, events, timezone, completingIds, disabled, onSelect, onAdd }: MonthCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, data: { date } });
  const value = DateTime.fromISO(date).setLocale("zh-TW");
  const active = tasks.filter((task) => task.status === "todo" || completingIds.has(task.id)).sort((a, b) => a.sequence_order - b.sequence_order);
  const matchingEvents = events.filter((event) => {
    if (event.is_all_day) return event.start <= date && event.end > date;
    const start = DateTime.fromISO(event.start, { setZone: true }).setZone(timezone).toISODate();
    const end = DateTime.fromISO(event.end, { setZone: true }).setZone(timezone).minus({ milliseconds: 1 }).toISODate();
    return Boolean(start && end && start <= date && end >= date);
  });
  const overflow = Math.max(0, active.length - 2) + Math.max(0, matchingEvents.length - 1);
  const visibleTasks = active.slice(0, 2);
  const summaryId = `month-summary-${date}`;
  const dateLabel = value.toFormat("M 月 d 日");
  const summary = [
    `${active.length} 項待辦`,
    `${matchingEvents.length} 項行程`,
    ...matchingEvents.map((event) => `行程：${event.title}`),
    ...active.map((task) => `待辦：${task.title}`),
  ].join("；");

  return (
    <section ref={setNodeRef} className={`month-cell${value.month !== currentMonth ? " outside" : ""}${date === today ? " today" : ""}${selected ? " selected" : ""}${isOver ? " drop-target" : ""}`} aria-label={`${dateLabel}安排`}>
      <div className="month-cell-header">
        <button type="button" className="month-date-button" onClick={() => onSelect(date)} aria-label={`查看 ${dateLabel}安排`} aria-describedby={summaryId} aria-current={date === today ? "date" : undefined}>
          {value.day}
        </button>
        <button type="button" className="month-add-button" onClick={() => onAdd(date)} aria-label={`在 ${value.toFormat("M 月 d 日")}新增待辦`}>
          <Plus aria-hidden="true" size={14} />
        </button>
      </div>
      <div className="month-cell-body">
        <span className="screen-reader-status" id={summaryId}>{summary}</span>
        {matchingEvents.length > 0 ? (
          <ul className="month-event-list" aria-label={`${dateLabel}行程`}>
            {matchingEvents.slice(0, 1).map((event) => <li className="month-event" key={event.id}>{event.is_all_day ? "全天" : DateTime.fromISO(event.start, { setZone: true }).setZone(timezone).toFormat("HH:mm")} {event.title}</li>)}
          </ul>
        ) : null}
        <SortableContext items={visibleTasks.map((task) => `month:${task.id}`)} strategy={verticalListSortingStrategy}>
          <ul className="month-task-list" aria-label={`${dateLabel}待辦`}>
            {visibleTasks.map((task) => <MonthTask task={task} disabled={disabled || completingIds.has(task.id)} key={task.id} />)}
          </ul>
        </SortableContext>
        {overflow > 0 ? <span className="month-overflow">另有 {overflow} 項安排</span> : null}
      </div>
    </section>
  );
}

export function PlanningView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode: PlanningMode = searchParams.get("view") === "month" ? "month" : "week";
  const anchorDate = validDate(searchParams.get("date"));
  const anchor = DateTime.fromISO(anchorDate);
  const weekStart = anchor.startOf("week");
  const monthStart = anchor.startOf("month").startOf("week");
  const dates = mode === "week" ? datesBetween(weekStart, 7) : datesBetween(monthStart, 42);
  const from = dates[0];
  const to = dates[dates.length - 1];
  const taskQuery = useTasks(from, to);
  const calendarQuery = useCalendar(from, to);
  const actions = useTaskActions();
  const completion = useCompletionAnimation();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editorDate, setEditorDate] = useState(anchorDate);
  const [dragAnnouncement, setDragAnnouncement] = useState("");
  const taskActionsDisabled = actions.isPending || completion.completionActive;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const tasksByDate = useMemo(() => {
    const result: Record<string, Task[]> = {};
    taskQuery.data?.tasks.forEach((task) => {
      (result[planningDate(task)] ??= []).push(task);
    });
    return result;
  }, [taskQuery.data?.tasks]);
  const allActive = useMemo(
    () => (taskQuery.data?.tasks ?? []).filter((task) => task.status === "todo" || completion.completingIds.has(task.id)),
    [completion.completingIds, taskQuery.data?.tasks],
  );

  function updateUrl(nextMode: PlanningMode, nextDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", nextMode);
    params.set("date", nextDate);
    router.replace(`/planning?${params.toString()}`, { scroll: false });
  }

  function navigate(direction: -1 | 1) {
    const next = anchor.plus(mode === "week" ? { weeks: direction } : { months: direction });
    updateUrl(mode, next.toISODate()!);
  }

  function openCreate(date: string) {
    setEditingTask(null);
    setEditorDate(date);
    setEditorOpen(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setEditorDate(planningDate(task));
    setEditorOpen(true);
  }

  async function submitTask(value: TaskEditorValue) {
    if (!taskQuery.data || taskActionsDisabled) return;
    if (editingTask) await actions.updateTask(editingTask.id, value, taskQuery.data.revision);
    else await actions.createTask(value, taskQuery.data.revision);
  }

  function activeForDate(date: string) {
    return (tasksByDate[date] ?? []).filter((task) => task.status === "todo" || completion.completingIds.has(task.id)).sort((a, b) => a.sequence_order - b.sequence_order);
  }

  function moveTask(task: Task, action: TaskMoveAction) {
    if (!taskQuery.data || taskActionsDisabled) return;
    if (action === "date") {
      openEdit(task);
      return;
    }
    if (action === "previous-day" || action === "next-day") {
      const destination = DateTime.fromISO(planningDate(task)).plus({ days: action === "previous-day" ? -1 : 1 }).toISODate();
      if (destination) {
        const destinationIndex = activeForDate(destination).length;
        void actions.reorderTask(task, destination, destinationIndex, taskQuery.data.revision).catch(() => undefined);
      }
      return;
    }
    const currentDate = planningDate(task);
    const current = activeForDate(currentDate);
    const index = current.findIndex((candidate) => candidate.id === task.id);
    const destinationIndex = action === "up" ? index - 1 : index + 1;
    if (destinationIndex >= 0 && destinationIndex < current.length) {
      void actions.reorderTask(task, currentDate, destinationIndex, taskQuery.data.revision).catch(() => undefined);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const task = event.active.data.current?.task as Task | undefined
      ?? allActive.find((candidate) => candidate.id === event.active.id);
    if (task) setDragAnnouncement(`已抓取 ${task.title}`);
  }

  function handleDragEnd(event: DragEndEvent) {
    const task = event.active.data.current?.task as Task | undefined
      ?? allActive.find((candidate) => candidate.id === event.active.id);
    if (!task || !event.over || !taskQuery.data || taskActionsDisabled) return;
    let destinationDate: string;
    let destinationIndex: number;
    const overId = String(event.over.id);
    if (overId.startsWith("day:")) {
      destinationDate = overId.slice(4);
      destinationIndex = activeForDate(destinationDate).filter((candidate) => candidate.id !== task.id).length;
    } else {
      const overTask = event.over.data.current?.task as Task | undefined
        ?? allActive.find((candidate) => candidate.id === event.over?.id);
      if (!overTask) return;
      destinationDate = planningDate(overTask);
      destinationIndex = activeForDate(destinationDate).findIndex((candidate) => candidate.id === overTask.id);
      if (destinationIndex < 0) destinationIndex = 0;
    }
    if (destinationDate === planningDate(task) && activeForDate(destinationDate).findIndex((candidate) => candidate.id === task.id) === destinationIndex) return;
    setDragAnnouncement(`${task.title} 已移到 ${DateTime.fromISO(destinationDate).setLocale("zh-TW").toFormat("M 月 d 日")}第 ${destinationIndex + 1} 位`);
    void actions.reorderTask(task, destinationDate, destinationIndex, taskQuery.data.revision).catch(() => undefined);
  }

  const taskProps = {
    disabled: taskActionsDisabled,
    onToggle: (task: Task) => {
      if (!taskQuery.data || taskActionsDisabled) return;
      if (task.status === "todo" && !completion.startCompletion(task.id)) return;
      void actions.updateTask(task.id, { status: task.status === "done" ? "todo" : "done" }, taskQuery.data.revision).catch(() => undefined);
    },
    onToggleFlexible: (task: Task) => {
      if (taskQuery.data && !taskActionsDisabled) void actions.updateTask(task.id, { is_flexible: !task.is_flexible }, taskQuery.data.revision).catch(() => undefined);
    },
    onEdit: openEdit,
    onDelete: (task: Task) => taskQuery.data && !taskActionsDisabled ? actions.deleteTask(task, taskQuery.data.revision) : Promise.resolve(),
    onMove: moveTask,
  };

  const title = mode === "week"
    ? `${weekStart.setLocale("zh-TW").toFormat("M 月 d 日")} – ${weekStart.plus({ days: 6 }).setLocale("zh-TW").toFormat("M 月 d 日")}`
    : anchor.setLocale("zh-TW").toFormat("yyyy 年 M 月");
  const calendarEvents = calendarQuery.data?.events ?? [];
  const calendarTimezone = calendarQuery.data?.timezone ?? taskQuery.data?.timezone ?? "Asia/Taipei";
  const selectedTasks = tasksByDate[anchorDate] ?? [];
  const selectedActive = selectedTasks.filter((task) => task.status === "todo" || completion.completingIds.has(task.id)).sort((a, b) => a.sequence_order - b.sequence_order);
  const selectedDone = selectedTasks.filter((task) => task.status === "done" && !completion.completingIds.has(task.id)).sort((a, b) => a.sequence_order - b.sequence_order);

  return (
    <div className="planning-page page-container wide">
      <header className="page-heading planning-heading">
        <div>
          <span className="eyebrow">全局安排</span>
          <h1>規劃</h1>
        </div>
        <button className="button primary" type="button" autoComplete="off" onClick={() => openCreate(anchorDate)} disabled={!taskQuery.data || taskActionsDisabled}>
          <Plus aria-hidden="true" size={18} />新增待辦
        </button>
      </header>

      <div className="planning-toolbar" aria-label="日期與檢視控制">
        <div className="date-navigation">
          <IconTooltip label={mode === "week" ? "上一週" : "上個月"}>
            <button className="icon-button" type="button" onClick={() => navigate(-1)} aria-label={mode === "week" ? "上一週" : "上個月"}><ChevronLeft aria-hidden="true" size={19} /></button>
          </IconTooltip>
          <button className="button secondary today-button" type="button" onClick={() => updateUrl(mode, DateTime.local().toISODate()!)}>今天</button>
          <IconTooltip label={mode === "week" ? "下一週" : "下個月"}>
            <button className="icon-button" type="button" onClick={() => navigate(1)} aria-label={mode === "week" ? "下一週" : "下個月"}><ChevronRight aria-hidden="true" size={19} /></button>
          </IconTooltip>
        </div>
        <h2>{title}</h2>
        <div className="view-segmented" role="group" aria-label="規劃檢視">
          <button type="button" className={mode === "week" ? "active" : ""} aria-pressed={mode === "week"} onClick={() => updateUrl("week", anchorDate)}>週</button>
          <button type="button" className={mode === "month" ? "active" : ""} aria-pressed={mode === "month"} onClick={() => updateUrl("month", anchorDate)}>月</button>
        </div>
      </div>

      {calendarQuery.isPending ? <div className="planning-calendar-status"><CalendarSkeleton compact /></div> : null}
      {calendarQuery.isError ? <CalendarError compact error={calendarQuery.error} onRetry={() => void calendarQuery.refetch()} /> : null}

      {taskQuery.isPending ? <div className="planning-skeleton" role="status" aria-label="正在載入規劃"><span /><span /><span /><span /><span /><span /><span /></div> : null}
      {taskQuery.isError ? (
        <div className="state-panel error-state planning-error" role="alert">
          <span className="state-icon"><TriangleAlert aria-hidden="true" size={21} /></span>
          <div><strong>無法載入規劃</strong><p>{getErrorMessage(taskQuery.error)}</p></div>
          <button className="button secondary small" type="button" onClick={() => void taskQuery.refetch()}><RefreshCw aria-hidden="true" size={15} />重試</button>
        </div>
      ) : null}

      {taskQuery.data ? (
        <DndContext sensors={sensors} collisionDetection={planningCollisionDetection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {mode === "week" ? (
            <div className="week-board" aria-label={title}>
              {dates.map((date) => (
                <DayLane
                  key={date}
                  date={date}
                  tasks={tasksByDate[date] ?? []}
                  events={calendarEvents}
                  timezone={calendarTimezone}
                  today={taskQuery.data!.today}
                  disabled={taskActionsDisabled}
                  completingIds={completion.completingIds}
                  taskProps={taskProps}
                  onAdd={openCreate}
                />
              ))}
            </div>
          ) : (
            <>
              <div className="month-weekdays" aria-hidden="true">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="month-grid" aria-label={title}>
                {dates.map((date) => (
                  <MonthCell
                    key={date}
                    date={date}
                    currentMonth={anchor.month}
                    today={taskQuery.data!.today}
                    selected={date === anchorDate}
                    tasks={tasksByDate[date] ?? []}
                    events={calendarEvents}
                    timezone={calendarTimezone}
                    completingIds={completion.completingIds}
                    disabled={taskActionsDisabled}
                    onSelect={(selected) => updateUrl("month", selected)}
                    onAdd={openCreate}
                  />
                ))}
              </div>
              <section className="month-agenda" aria-labelledby="month-agenda-title">
                <div className="month-agenda-heading">
                  <div>
                    <span>{anchor.setLocale("zh-TW").toFormat("cccc")}</span>
                    <h2 id="month-agenda-title">{anchor.setLocale("zh-TW").toFormat("M 月 d 日")}</h2>
                  </div>
                  <button className="button secondary small" type="button" onClick={() => openCreate(anchorDate)}><Plus aria-hidden="true" size={15} />新增</button>
                </div>
                <div className="month-agenda-content">
                  <div className="month-agenda-tasks">
                    <SortableContext items={selectedActive.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                      <div className="task-stack">
                        {selectedActive.map((task, index) => <SortableTaskCard key={task.id} task={task} index={index} count={selectedActive.length} completing={completion.completingIds.has(task.id)} {...taskProps} />)}
                      </div>
                    </SortableContext>
                    {selectedDone.length > 0 ? (
                      <AnimatedDetails
                        className="completed-disclosure"
                        summary={<><span><CheckCircle2 aria-hidden="true" size={17} />已完成</span><span>{selectedDone.length}<ChevronDown className="disclosure-chevron" aria-hidden="true" size={17} /></span></>}
                      >
                        <div className="task-stack completed-stack">{selectedDone.map((task, index) => <TaskCard key={task.id} task={task} index={index} count={selectedDone.length} completing={completion.completingIds.has(task.id)} {...taskProps} />)}</div>
                      </AnimatedDetails>
                    ) : null}
                    {selectedTasks.length === 0 ? <div className="agenda-empty"><CalendarRange aria-hidden="true" size={22} /><span>這天還沒有待辦</span></div> : null}
                  </div>
                  <div className="month-agenda-calendar">
                    <h3>日曆參考</h3>
                    <DayCalendarReferences events={calendarEvents} date={anchorDate} timezone={calendarTimezone} limit={6} />
                  </div>
                </div>
              </section>
            </>
          )}
          <p className="screen-reader-status" aria-live="assertive">{dragAnnouncement}</p>
        </DndContext>
      ) : null}

      <TaskEditorDialog open={editorOpen} onOpenChange={setEditorOpen} task={editingTask} defaultDate={editorDate} onSubmit={submitTask} />
    </div>
  );
}
