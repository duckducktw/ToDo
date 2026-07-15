"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useId, useState } from "react";
import { CalendarDays, LockKeyhole, X, Zap } from "lucide-react";
import type { Task } from "@/types/domain";

export interface TaskEditorValue {
  title: string;
  description: string;
  scheduled_date: string;
  is_flexible: boolean;
}

interface TaskEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
  defaultDate: string;
  onSubmit: (value: TaskEditorValue) => Promise<unknown>;
}

interface TaskEditorFormProps extends Omit<TaskEditorDialogProps, "open"> {
  descriptionId: string;
}

function TaskEditorForm({ onOpenChange, task, defaultDate, onSubmit, descriptionId }: TaskEditorFormProps) {
  const titleId = useId();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [date, setDate] = useState(task?.scheduled_date ?? defaultDate);
  const [isFlexible, setIsFlexible] = useState(task?.is_flexible ?? true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();
    if (!normalizedTitle) {
      setError("請輸入待辦名稱");
      return;
    }
    if (normalizedTitle.length > 120) {
      setError("待辦名稱不可超過 120 個字元");
      return;
    }
    if (normalizedDescription.length > 1000) {
      setError("說明不可超過 1,000 個字元");
      return;
    }
    if (!date) {
      setError("請選擇安排日期");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        title: normalizedTitle,
        description: normalizedDescription,
        scheduled_date: date,
        is_flexible: isFlexible,
      });
      onOpenChange(false);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "儲存失敗，請再試一次");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Content className="dialog-content" aria-describedby={descriptionId}>
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{task ? "編輯待辦" : "新增待辦"}</Dialog.Title>
              <Dialog.Description className="screen-reader-status" id={descriptionId}>設定待辦內容、日期與安排方式。</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="關閉">
              <X aria-hidden="true" size={19} />
            </Dialog.Close>
          </div>
          <form className="task-form" onSubmit={handleSubmit} noValidate>
            <label className="field" htmlFor={titleId}>
              <span>待辦名稱</span>
              <input
                id={titleId}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                placeholder="例如：完成提案初稿"
                autoFocus
                required
              />
              <small className="field-counter">{title.length}/120</small>
            </label>
            <label className="field" htmlFor={`${titleId}-date`}>
              <span>安排日期</span>
              <span className="input-with-icon">
                <CalendarDays aria-hidden="true" size={17} />
                <input id={`${titleId}-date`} type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
              </span>
            </label>
            <label className="field" htmlFor={`${titleId}-description`}>
              <span>說明 <small>選填</small></span>
              <textarea
                id={`${titleId}-description`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="補充完成條件、連結或備註"
              />
              <small className="field-counter">{description.length}/1000</small>
            </label>
            <fieldset className="flexibility-choice">
              <legend>安排方式</legend>
              <button
                type="button"
                className={isFlexible ? "choice-button selected" : "choice-button"}
                aria-pressed={isFlexible}
                onClick={() => setIsFlexible(true)}
              >
                <Zap aria-hidden="true" size={18} />
                <span><strong>彈性安排</strong></span>
              </button>
              <button
                type="button"
                className={!isFlexible ? "choice-button selected locked" : "choice-button"}
                aria-pressed={!isFlexible}
                onClick={() => setIsFlexible(false)}
              >
                <LockKeyhole aria-hidden="true" size={18} />
                <span><strong>固定日期</strong></span>
              </button>
            </fieldset>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="dialog-actions">
              <Dialog.Close className="button secondary" type="button">取消</Dialog.Close>
              <button className="button primary" type="submit" autoComplete="off" disabled={submitting}>
                {submitting ? "儲存中…" : task ? "儲存變更" : "加入待辦"}
              </button>
            </div>
          </form>
    </Dialog.Content>
  );
}

export function TaskEditorDialog({ open, onOpenChange, task, defaultDate, onSubmit }: TaskEditorDialogProps) {
  const descriptionId = useId();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {open ? (
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <TaskEditorForm
            key={task?.id ?? `new-${defaultDate}`}
            onOpenChange={onOpenChange}
            task={task}
            defaultDate={defaultDate}
            onSubmit={onSubmit}
            descriptionId={descriptionId}
          />
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}
