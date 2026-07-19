"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import { Bell, Clock3, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNotice, useTimezoneReady } from "@/app/providers";
import type { NotificationSettings, TaskRangeResponse, UserProfile } from "@/types/domain";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  formatTaskNotification,
  isDndActive,
  isScheduledMinute,
  NOTIFICATION_INTRO_KEY,
  NOTIFICATION_RUNTIME_KEY,
  notificationMinuteKey,
} from "@/lib/notifications";

interface NotificationCenterProps {
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
}

interface RuntimeState { lastMinute?: string; emptyDate?: string }

function todayKey(date: Date) {
  return notificationMinuteKey(date).slice(0, 10);
}

interface NotificationSettingsDialogProps extends NotificationCenterProps {
  initialSettings: NotificationSettings;
  onSave: (settings: NotificationSettings) => Promise<void>;
}

function NotificationSettingsDialog({ settingsOpen: open, onSettingsOpenChange: onOpenChange, initialSettings, onSave }: NotificationSettingsDialogProps) {
  const { notify } = useNotice();
  const [settings, setSettings] = useState(initialSettings);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => "Notification" in window ? Notification.permission : "unsupported");
  const [saving, setSaving] = useState(false);

  async function toggleEnabled() {
    if (!settings.enabled) {
      if (!("Notification" in window)) {
        notify("這個瀏覽器不支援系統通知", "error");
        return;
      }
      const result = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      setPermission(result);
      if (result !== "granted") {
        notify("請先在瀏覽器允許通知權限", "error");
        return;
      }
    }
    setSettings((current) => ({ ...current, enabled: !current.enabled }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = {
      ...settings,
      prefix: settings.prefix.trim().slice(0, 40),
      fixedTimes: [...new Set(settings.fixedTimes)].sort(),
    };
    setSaving(true);
    try {
      await onSave(normalized);
      notify("通知設定已同步到所有裝置", "success");
      onOpenChange(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "通知設定儲存失敗", "error");
    } finally {
      setSaving(false);
    }
  }

  function setDnd(value: string) {
    if (value === "off") setSettings((current) => ({ ...current, dndUntil: null, dndIndefinite: false }));
    else if (value === "indefinite") setSettings((current) => ({ ...current, dndUntil: null, dndIndefinite: true }));
    else setSettings((current) => ({ ...current, dndUntil: Date.now() + Number(value) * 60_000, dndIndefinite: false }));
  }

  const dndValue = settings.dndIndefinite ? "indefinite" : isDndActive(settings) ? "active" : "off";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {open ? <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content notification-dialog" aria-describedby="notification-settings-description">
          <div className="dialog-heading">
            <div><Dialog.Title>通知設定</Dialog.Title><Dialog.Description id="notification-settings-description">設定瀏覽器通知的時間、頻率與顯示內容。</Dialog.Description></div>
            <Dialog.Close className="icon-button" aria-label="關閉"><X size={19} /></Dialog.Close>
          </div>
          <form className="notification-form" onSubmit={submit}>
            <div className="notification-master">
              <span className="notification-icon"><Bell size={20} /></span>
              <span><strong>瀏覽器通知</strong><small>{permission === "denied" ? "瀏覽器已封鎖通知權限" : "網站開啟期間依排程提醒"}</small></span>
              <button type="button" role="switch" aria-checked={settings.enabled} className="switch-control" onClick={() => void toggleEnabled()}><span /></button>
            </div>
            <fieldset disabled={!settings.enabled} className="notification-fields">
              <legend>通知排程</legend>
              <div className="schedule-tabs" role="group" aria-label="排程方式">
                <button type="button" className={settings.mode === "interval" ? "active" : ""} onClick={() => setSettings({ ...settings, mode: "interval" })}>時段與頻率</button>
                <button type="button" className={settings.mode === "fixed" ? "active" : ""} onClick={() => setSettings({ ...settings, mode: "fixed" })}>指定時間</button>
              </div>
              {settings.mode === "interval" ? <div className="schedule-block">
                <label className="inline-field"><span>通知頻率</span><select value={settings.intervalHours} onChange={(event) => setSettings({ ...settings, intervalHours: Number(event.target.value) as NotificationSettings["intervalHours"] })}>{[1,2,3,4,6].map((hour) => <option key={hour} value={hour}>每 {hour} 小時</option>)}</select></label>
                <div className="slot-list">{settings.slots.map((slot, index) => <div className="time-row" key={index}>
                  <Clock3 size={16} /><input type="time" aria-label={`時段 ${index + 1} 開始`} value={slot.start} onChange={(event) => setSettings({ ...settings, slots: settings.slots.map((item, i) => i === index ? { ...item, start: event.target.value } : item) })} /><span>至</span><input type="time" aria-label={`時段 ${index + 1} 結束`} value={slot.end} onChange={(event) => setSettings({ ...settings, slots: settings.slots.map((item, i) => i === index ? { ...item, end: event.target.value } : item) })} />
                  <button type="button" className="icon-button compact" aria-label={`刪除時段 ${index + 1}`} disabled={settings.slots.length === 1} onClick={() => setSettings({ ...settings, slots: settings.slots.filter((_, i) => i !== index) })}><Trash2 size={15} /></button>
                </div>)}</div>
                <button type="button" className="text-action" disabled={settings.slots.length >= 4} onClick={() => setSettings({ ...settings, slots: [...settings.slots, { start: "09:00", end: "12:00" }] })}><Plus size={15} />新增時段</button>
              </div> : <div className="schedule-block"><div className="fixed-times">{settings.fixedTimes.map((time, index) => <div className="time-row" key={index}><Clock3 size={16} /><input type="time" aria-label={`通知時間 ${index + 1}`} value={time} onChange={(event) => setSettings({ ...settings, fixedTimes: settings.fixedTimes.map((item, i) => i === index ? event.target.value : item) })} /><button type="button" className="icon-button compact" aria-label={`刪除通知時間 ${index + 1}`} disabled={settings.fixedTimes.length === 1} onClick={() => setSettings({ ...settings, fixedTimes: settings.fixedTimes.filter((_, i) => i !== index) })}><Trash2 size={15} /></button></div>)}</div><button type="button" className="text-action" disabled={settings.fixedTimes.length >= 8} onClick={() => setSettings({ ...settings, fixedTimes: [...settings.fixedTimes, "12:00"] })}><Plus size={15} />新增時間</button></div>}
              <label className="field"><span>暫時勿擾</span><select value={dndValue} onChange={(event) => setDnd(event.target.value)}><option value="off">關閉</option>{dndValue === "active" ? <option value="active">進行中</option> : null}<option value="10">10 分鐘</option><option value="30">30 分鐘</option><option value="60">1 小時</option><option value="180">3 小時</option><option value="720">12 小時</option><option value="indefinite">直到我手動關閉</option></select><small>勿擾期間的通知會直接捨棄，不會稍後補送。</small></label>
              <label className="field"><span>通知前綴</span><input value={settings.prefix} maxLength={40} placeholder="例如：做得很好！" onChange={(event) => setSettings({ ...settings, prefix: event.target.value })} /></label>
            </fieldset>
            <div className="dialog-actions"><Dialog.Close className="button secondary" type="button">取消</Dialog.Close><button className="button primary" type="submit" disabled={saving}>{saving ? "同步中…" : "儲存設定"}</button></div>
          </form>
        </Dialog.Content>
      </Dialog.Portal> : null}
    </Dialog.Root>
  );
}

export function NotificationCenter(props: NotificationCenterProps) {
  const timezoneReady = useTimezoneReady();
  const { notify } = useNotice();
  const [introOpen, setIntroOpen] = useState(false);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const settingsRef = useRef(DEFAULT_NOTIFICATION_SETTINGS);

  useEffect(() => {
    if (!timezoneReady) return;
    const controller = new AbortController();
    void fetch("/api/me", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("無法載入通知設定");
        return response.json() as Promise<{ user: UserProfile }>;
      })
      .then(({ user }) => {
        settingsRef.current = user.notification_settings;
        setSettings(user.notification_settings);
        if (user.notification_settings.enabled) {
          window.localStorage.setItem(NOTIFICATION_INTRO_KEY, "seen");
          if (!("Notification" in window) || Notification.permission !== "granted") setPermissionOpen(true);
        } else if (!window.localStorage.getItem(NOTIFICATION_INTRO_KEY)) {
          setIntroOpen(true);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) notify(error instanceof Error ? error.message : "無法載入通知設定", "error");
      });
    return () => controller.abort();
  }, [notify, timezoneReady]);

  const saveSettings = useCallback(async (nextSettings: NotificationSettings) => {
    const response = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_settings: nextSettings }),
    });
    if (!response.ok) throw new Error("通知設定無法同步，請稍後再試");
    const payload = await response.json() as { user: UserProfile };
    settingsRef.current = payload.user.notification_settings;
    setSettings(payload.user.notification_settings);
  }, []);

  const requestPermission = useCallback(async () => {
    setPermissionOpen(false);
    if (!("Notification" in window)) {
      notify("這個瀏覽器不支援系統通知", "error");
      return;
    }
    const result = await Notification.requestPermission();
    if (result !== "granted") notify("尚未取得通知權限，下次開啟時會再次詢問", "info");
  }, [notify]);

  const dismissIntro = useCallback((open: boolean) => {
    setIntroOpen(open);
    if (!open) window.localStorage.setItem(NOTIFICATION_INTRO_KEY, "seen");
  }, []);

  useEffect(() => {
    if (!timezoneReady) return;
    const check = async () => {
      const now = new Date();
      const settings = settingsRef.current;
      if (!settings.enabled || !("Notification" in window) || Notification.permission !== "granted" || !isScheduledMinute(settings, now)) return;
      let runtime: RuntimeState = {};
      try { runtime = JSON.parse(window.localStorage.getItem(NOTIFICATION_RUNTIME_KEY) || "{}"); } catch { /* use empty runtime */ }
      const minute = notificationMinuteKey(now);
      if (runtime.lastMinute === minute) return;
      runtime.lastMinute = minute;
      window.localStorage.setItem(NOTIFICATION_RUNTIME_KEY, JSON.stringify(runtime));
      if (isDndActive(settings, now.getTime())) return;
      const date = todayKey(now);
      const response = await fetch(`/api/tasks?${new URLSearchParams({ from: date, to: date })}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as TaskRangeResponse;
      const remaining = data.tasks.filter((task) => task.status === "todo");
      if (remaining.length === 0 && runtime.emptyDate === date) return;
      if (remaining.length === 0) {
        runtime.emptyDate = date;
        window.localStorage.setItem(NOTIFICATION_RUNTIME_KEY, JSON.stringify(runtime));
      }
      const message = formatTaskNotification(settings.prefix, remaining);
      new Notification(message.title, { body: message.body, icon: "/icons/icon-192.png", tag: `flow-todo-${minute}` });
    };
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [timezoneReady]);

  return <>
    {props.settingsOpen && settings ? <NotificationSettingsDialog {...props} initialSettings={settings} onSave={saveSettings} /> : null}
    <AlertDialog.Root open={introOpen} onOpenChange={dismissIntro}><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay" /><AlertDialog.Content className="alert-content notification-intro"><span className="notification-intro-icon"><Bell size={24} /></span><AlertDialog.Title>不錯過今天的重要待辦</AlertDialog.Title><AlertDialog.Description>現在可以開啟瀏覽器通知，依你設定的時段提醒尚未完成的待辦。你隨時可以從頭像選單的「通知設定」調整或關閉。</AlertDialog.Description><div className="dialog-actions"><AlertDialog.Cancel className="button secondary">稍後再說</AlertDialog.Cancel><AlertDialog.Action className="button primary" onClick={() => props.onSettingsOpenChange(true)}>前往設定</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
    <AlertDialog.Root open={permissionOpen} onOpenChange={setPermissionOpen}><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay" /><AlertDialog.Content className="alert-content notification-intro"><span className="notification-intro-icon"><Bell size={24} /></span><AlertDialog.Title>允許這台裝置顯示通知</AlertDialog.Title><AlertDialog.Description>你的通知設定已啟用，但這個瀏覽器尚未取得通知權限。允許後，這台裝置才能依照同步的排程提醒你。</AlertDialog.Description><div className="dialog-actions"><AlertDialog.Cancel className="button secondary">下次再說</AlertDialog.Cancel><AlertDialog.Action className="button primary" onClick={() => void requestPermission()}>允許</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </>;
}
