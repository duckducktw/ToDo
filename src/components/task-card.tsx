"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarClock,
  GripVertical,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  Zap,
} from "lucide-react";
import type { Task } from "@/types/domain";
import { IconTooltip } from "@/components/app-shell";

export type TaskMoveAction = "up" | "down" | "previous-day" | "next-day" | "date";

interface TaskCardProps {
  task: Task;
  index: number;
  count: number;
  compact?: boolean;
  disabled?: boolean;
  dragHandleProps?: Record<string, unknown>;
  onToggle: (task: Task) => void;
  onToggleFlexible: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => Promise<unknown>;
  onMove: (task: Task, action: TaskMoveAction) => void;
}

function DeleteConfirmation({ task, onDelete }: { task: Task; onDelete: (task: Task) => Promise<unknown> }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <DropdownMenu.Item className="menu-item danger" onSelect={(event) => event.preventDefault()}>
          <Trash2 aria-hidden="true" size={16} />
          刪除
        </DropdownMenu.Item>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="alert-content">
          <AlertDialog.Title>刪除「{task.title}」？</AlertDialog.Title>
          <AlertDialog.Description>這項待辦將永久刪除，無法復原。</AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel className="button secondary">保留待辦</AlertDialog.Cancel>
            <AlertDialog.Action className="button danger-button" onClick={() => void onDelete(task)}>刪除</AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function TaskCard({
  task,
  index,
  count,
  compact = false,
  disabled = false,
  dragHandleProps,
  onToggle,
  onToggleFlexible,
  onEdit,
  onDelete,
  onMove,
}: TaskCardProps) {
  const isDone = task.status === "done";
  const isPending = task.id.startsWith("pending-");
  const rollover = task.automatic_move?.kind === "rollover";
  const autoPulled = task.automatic_move?.kind === "auto_pull";

  return (
    <article className={`task-card${compact ? " compact" : ""}${isDone ? " done" : ""}${rollover ? " rollover" : ""}`}>
      {!isDone ? (
        <IconTooltip label="拖曳調整順序或日期">
          <button
            className="drag-handle"
            type="button"
            aria-label={`拖曳「${task.title}」`}
            disabled={disabled || isPending}
            {...dragHandleProps}
          >
            <GripVertical aria-hidden="true" size={17} />
          </button>
        </IconTooltip>
      ) : <span className="drag-placeholder" />}
      <label className="task-checkbox-wrap">
        <input
          className="task-checkbox"
          type="checkbox"
          checked={isDone}
          disabled={disabled || isPending}
          onChange={() => onToggle(task)}
          aria-label={isDone ? `重新開啟「${task.title}」` : `完成「${task.title}」`}
        />
      </label>
      <div className="task-copy">
        <div className="task-title-row">
          <h3>{task.title}</h3>
          {rollover ? <span className="task-badge rollover-badge">延遲 {task.rollover_count > 1 ? `${task.rollover_count} 天` : ""}</span> : null}
          {autoPulled ? <span className="task-badge pulled-badge">提前帶入</span> : null}
        </div>
        {!compact && task.description ? <p>{task.description}</p> : null}
      </div>
      <IconTooltip label={task.is_flexible ? "彈性待辦：可自動帶入" : "固定待辦：不會提前帶入"}>
        <button
          className={`flex-toggle${task.is_flexible ? " active" : ""}`}
          type="button"
          aria-label={task.is_flexible ? `將「${task.title}」設為固定` : `將「${task.title}」設為彈性`}
          aria-pressed={task.is_flexible}
          disabled={disabled || isPending}
          onClick={() => onToggleFlexible(task)}
        >
          {task.is_flexible ? <Zap aria-hidden="true" size={16} /> : <LockKeyhole aria-hidden="true" size={15} />}
        </button>
      </IconTooltip>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="icon-button compact task-menu-trigger" type="button" aria-label={`「${task.title}」更多操作`} disabled={disabled || isPending}>
            <MoreHorizontal aria-hidden="true" size={18} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu-content" align="end" sideOffset={5}>
            {isDone ? (
              <DropdownMenu.Item className="menu-item" onSelect={() => onToggle(task)}>
                <RotateCcw aria-hidden="true" size={16} />
                重新開啟
              </DropdownMenu.Item>
            ) : null}
            <DropdownMenu.Item className="menu-item" onSelect={() => onEdit(task)}>
              <Pencil aria-hidden="true" size={16} />
              編輯
            </DropdownMenu.Item>
            {!isDone ? (
              <>
                <DropdownMenu.Separator className="menu-separator" />
                <DropdownMenu.Item className="menu-item" disabled={index === 0} onSelect={() => onMove(task, "up")}>
                  <ArrowUp aria-hidden="true" size={16} />
                  往上移
                </DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item" disabled={index >= count - 1} onSelect={() => onMove(task, "down")}>
                  <ArrowDown aria-hidden="true" size={16} />
                  往下移
                </DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item" onSelect={() => onMove(task, "previous-day")}>
                  <ArrowLeft aria-hidden="true" size={16} />
                  移至前一天
                </DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item" onSelect={() => onMove(task, "next-day")}>
                  <ArrowRight aria-hidden="true" size={16} />
                  移至後一天
                </DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item" onSelect={() => onMove(task, "date")}>
                  <CalendarClock aria-hidden="true" size={16} />
                  移到其他日期…
                </DropdownMenu.Item>
              </>
            ) : null}
            <DropdownMenu.Separator className="menu-separator" />
            <DeleteConfirmation task={task} onDelete={onDelete} />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </article>
  );
}

interface SortableTaskCardProps extends Omit<TaskCardProps, "dragHandleProps"> {
  sortableId?: string;
}

export function SortableTaskCard({ task, sortableId, ...props }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId ?? task.id,
    data: { task },
    disabled: task.status === "done" || props.disabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={isDragging ? "sortable-task dragging" : "sortable-task"}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <TaskCard task={task} {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}
