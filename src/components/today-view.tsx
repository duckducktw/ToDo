"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DateTime } from "luxon";
import { CalendarDays, CheckCircle2, ChevronDown, ListTodo, Plus, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "@/types/domain";
import { useTimezoneReady } from "@/app/providers";
import { getErrorMessage, useTaskActions, useTasks } from "@/hooks/use-productivity-data";
import { SortableTaskCard, type TaskMoveAction } from "@/components/task-card";
import { TaskEditorDialog, type TaskEditorValue } from "@/components/task-editor-dialog";
import { TodayCalendarPanel } from "@/components/calendar-panel";
import { AnimatedDetails } from "@/components/animated-details";
import { useCompletionAnimation } from "@/hooks/use-completion-animation";

function browserToday() {
  return DateTime.local().toISODate() ?? "2026-07-15";
}

function isRolledOver(task: Task) {
  return task.automatic_move?.kind === "rollover";
}

function TaskListSkeleton() {
  return (
    <div className="task-list-skeleton" role="status" aria-label="正在載入待辦">
      {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
    </div>
  );
}

export function TodayView() {
  const [date, setDate] = useState(browserToday);
  const [mobilePanel, setMobilePanel] = useState<"tasks" | "calendar">("tasks");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dragAnnouncement, setDragAnnouncement] = useState("");
  const [rolloverReady, setRolloverReady] = useState(false);
  const timezoneReady = useTimezoneReady();
  const query = useTasks(date, date);
  const actions = useTaskActions();
  const completion = useCompletionAnimation();
  const rolloverDateRef = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const runRolloverRef = useRef(actions.runRollover);
  const refetchRef = useRef(query.refetch);

  useEffect(() => {
    pendingRef.current = actions.isPending;
    runRolloverRef.current = actions.runRollover;
    refetchRef.current = query.refetch;
  }, [actions.isPending, actions.runRollover, query.refetch]);

  const activeTasks = useMemo(
    () => (query.data?.tasks ?? []).filter((task) => task.status === "todo" || completion.completingIds.has(task.id)).sort((a, b) => a.sequence_order - b.sequence_order),
    [completion.completingIds, query.data?.tasks],
  );
  const completedTasks = useMemo(
    () => (query.data?.tasks ?? []).filter((task) => task.status === "done" && !completion.completingIds.has(task.id)).sort((a, b) => a.sequence_order - b.sequence_order),
    [completion.completingIds, query.data?.tasks],
  );
  const rolledTasks = activeTasks.filter(isRolledOver);
  const regularTasks = activeTasks.filter((task) => !isRolledOver(task));
  const taskActionsDisabled = actions.isPending || completion.completionActive || !rolloverReady;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!query.data || !timezoneReady || rolloverDateRef.current === query.data.today) return;
    let cancelled = false;
    setRolloverReady(false);

    void refetchRef.current().then(async (fresh) => {
      if (cancelled) return false;
      if (!fresh.data) return true;
      if (fresh.data.today !== date) {
        rolloverDateRef.current = null;
        setDate(fresh.data.today);
        return false;
      }
      rolloverDateRef.current = fresh.data.today;
      await runRolloverRef.current(fresh.data.revision).catch(() => {
        rolloverDateRef.current = null;
      });
      return true;
    }).then((ready) => {
      if (!cancelled && ready) setRolloverReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [date, query.data, timezoneReady]);

  useEffect(() => {
    if (!timezoneReady) return;

    const checkDate = () => {
      const nextDate = browserToday();
      if (nextDate !== date) {
        rolloverDateRef.current = null;
        setRolloverReady(false);
        setDate(nextDate);
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      checkDate();
      if (pendingRef.current) return;
      void refetchRef.current().then((fresh) => {
        if (!fresh.data || pendingRef.current) return;
        if (fresh.data.today !== date) {
          rolloverDateRef.current = null;
          setRolloverReady(false);
          setDate(fresh.data.today);
          return;
        }
        return runRolloverRef.current(fresh.data.revision).catch(() => {
          rolloverDateRef.current = null;
        });
      });
    };

    const interval = window.setInterval(checkDate, 30_000);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [date, timezoneReady]);

  function openCreate() {
    setEditingTask(null);
    setEditorOpen(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setEditorOpen(true);
  }

  async function submitTask(value: TaskEditorValue) {
    const revision = query.data?.revision;
    if (revision === undefined || taskActionsDisabled) return;
    if (editingTask) {
      await actions.updateTask(editingTask.id, value, revision);
    } else {
      await actions.createTask(value, revision);
    }
  }

  function handleMove(task: Task, action: TaskMoveAction) {
    const revision = query.data?.revision;
    if (revision === undefined || taskActionsDisabled) return;
    if (action === "date") {
      openEdit(task);
      return;
    }
    if (action === "previous-day" || action === "next-day") {
      const destination = DateTime.fromISO(task.scheduled_date).plus({ days: action === "previous-day" ? -1 : 1 }).toISODate();
      if (destination) void actions.reorderTask(task, destination, 0, revision).catch(() => undefined);
      return;
    }
    const group = isRolledOver(task) ? rolledTasks : regularTasks;
    const index = group.findIndex((candidate) => candidate.id === task.id);
    const groupDestinationIndex = action === "up" ? index - 1 : index + 1;
    if (groupDestinationIndex >= 0 && groupDestinationIndex < group.length) {
      const destinationIndex = isRolledOver(task)
        ? groupDestinationIndex
        : rolledTasks.length + groupDestinationIndex;
      void actions.reorderTask(task, date, destinationIndex, revision).catch(() => undefined);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const task = activeTasks.find((candidate) => candidate.id === event.active.id);
    if (task) setDragAnnouncement(`已抓取 ${task.title}`);
  }

  function handleDragEnd(event: DragEndEvent) {
    const task = activeTasks.find((candidate) => candidate.id === event.active.id);
    if (!task || !event.over || event.active.id === event.over.id || !query.data || taskActionsDisabled) {
      setDragAnnouncement(task ? `已放下 ${task.title}` : "");
      return;
    }
    const overTask = activeTasks.find((candidate) => candidate.id === event.over?.id);
    if (!overTask || isRolledOver(task) !== isRolledOver(overTask)) {
      setDragAnnouncement(`${task.title} 保留在原本區段`);
      return;
    }
    const destinationIndex = activeTasks.findIndex((candidate) => candidate.id === overTask.id);
    if (destinationIndex >= 0) {
      setDragAnnouncement(`${task.title} 已移到第 ${destinationIndex + 1} 位`);
      void actions.reorderTask(task, date, destinationIndex, query.data.revision).catch(() => undefined);
    }
  }

  const formattedDate = DateTime.fromISO(date).setLocale("zh-TW");
  const taskProps = {
    disabled: taskActionsDisabled,
    onToggle: (task: Task) => {
      if (!query.data || taskActionsDisabled) return;
      if (task.status === "todo" && !completion.startCompletion(task.id)) return;
      void actions.updateTask(task.id, { status: task.status === "done" ? "todo" : "done" }, query.data.revision).catch(() => undefined);
    },
    onToggleFlexible: (task: Task) => {
      if (!query.data || taskActionsDisabled) return;
      void actions.updateTask(task.id, { is_flexible: !task.is_flexible }, query.data.revision).catch(() => undefined);
    },
    onEdit: openEdit,
    onDelete: (task: Task) => query.data && !taskActionsDisabled ? actions.deleteTask(task, query.data.revision) : Promise.resolve(),
    onMove: handleMove,
  };

  return (
    <div className="today-page page-container">
      <header className="page-heading today-heading">
        <div>
          <span className="eyebrow">{formattedDate.toFormat("cccc")}</span>
          <h1>今日焦點</h1>
          <p>{formattedDate.toFormat("yyyy 年 M 月 d 日")}</p>
        </div>
        <button className="button primary add-task-button" type="button" autoComplete="off" onClick={openCreate} disabled={!query.data || taskActionsDisabled}>
          <Plus aria-hidden="true" size={18} />
          新增待辦
        </button>
      </header>

      <div className="mobile-segmented" role="group" aria-label="今日內容">
        <button type="button" className={mobilePanel === "tasks" ? "active" : ""} aria-pressed={mobilePanel === "tasks"} onClick={() => setMobilePanel("tasks")}>
          <ListTodo aria-hidden="true" size={16} />待辦
        </button>
        <button type="button" className={mobilePanel === "calendar" ? "active" : ""} aria-pressed={mobilePanel === "calendar"} onClick={() => setMobilePanel("calendar")}>
          <CalendarDays aria-hidden="true" size={16} />日曆
        </button>
      </div>

      <div className={`today-grid mobile-show-${mobilePanel}`}>
        <TodayCalendarPanel date={date} />
        <section className="tasks-panel" aria-labelledby="today-tasks-title">
          <div className="panel-heading">
            <div>
              <span className="section-kicker"><Sparkles aria-hidden="true" size={14} />執行清單</span>
              <h2 id="today-tasks-title">今天的待辦</h2>
            </div>
            {query.data ? <span className="task-count"><strong>{completedTasks.length}</strong> / {activeTasks.length + completedTasks.length} 完成</span> : null}
          </div>

          {query.isPending ? <TaskListSkeleton /> : null}
          {query.isError ? (
            <div className="state-panel error-state" role="alert">
              <span className="state-icon"><TriangleAlert aria-hidden="true" size={21} /></span>
              <div><strong>無法載入待辦</strong><p>{getErrorMessage(query.error)}</p></div>
              <button className="button secondary small" type="button" onClick={() => void query.refetch()}>
                <RefreshCw aria-hidden="true" size={15} />重試
              </button>
            </div>
          ) : null}

          {query.data ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext items={activeTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                <div className="active-task-groups">
                  {rolledTasks.length > 0 ? (
                    <section className="task-group delayed-group" aria-labelledby="delayed-tasks-title">
                      <div className="task-group-title"><span id="delayed-tasks-title">延遲帶入</span><small>{rolledTasks.length}</small></div>
                      <div className="task-stack">
                        {rolledTasks.map((task, index) => <SortableTaskCard key={task.id} task={task} index={index} count={rolledTasks.length} completing={completion.completingIds.has(task.id)} {...taskProps} />)}
                      </div>
                    </section>
                  ) : null}
                  {regularTasks.length > 0 ? (
                    <section className="task-group" aria-labelledby="regular-tasks-title">
                      <div className="task-group-title"><span id="regular-tasks-title">今日待辦</span><small>{regularTasks.length}</small></div>
                      <div className="task-stack">
                        {regularTasks.map((task, index) => <SortableTaskCard key={task.id} task={task} index={index} count={regularTasks.length} completing={completion.completingIds.has(task.id)} {...taskProps} />)}
                      </div>
                    </section>
                  ) : null}
                  {activeTasks.length === 0 ? (
                    <div className="empty-state">
                      <span className="empty-icon"><CheckCircle2 aria-hidden="true" size={26} /></span>
                      <strong>{completedTasks.length > 0 ? "今天的待辦都完成了" : "今天還沒有待辦"}</strong>
                      <button className="button secondary" type="button" onClick={openCreate}><Plus aria-hidden="true" size={16} />新增待辦</button>
                    </div>
                  ) : null}
                </div>
              </SortableContext>
            </DndContext>
          ) : null}

          {completedTasks.length > 0 ? (
            <AnimatedDetails
              className="completed-disclosure"
              summary={<><span><CheckCircle2 aria-hidden="true" size={17} />已完成</span><span>{completedTasks.length}<ChevronDown className="disclosure-chevron" aria-hidden="true" size={17} /></span></>}
            >
              <div className="task-stack completed-stack">
                {completedTasks.map((task, index) => <SortableTaskCard key={task.id} task={task} index={index} count={completedTasks.length} completing={completion.completingIds.has(task.id)} {...taskProps} />)}
              </div>
            </AnimatedDetails>
          ) : null}
          <p className="screen-reader-status" aria-live="assertive">{dragAnnouncement}</p>
        </section>
      </div>

      <TaskEditorDialog open={editorOpen} onOpenChange={setEditorOpen} task={editingTask} defaultDate={date} onSubmit={submitTask} />
    </div>
  );
}
