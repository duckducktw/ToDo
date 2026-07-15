"use client";

import { signIn } from "next-auth/react";
import { CheckCheck, LockKeyhole } from "lucide-react";
import { useState } from "react";

export function LoginView({ authError = false }: { authError?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(
    authError ? "Google 登入未完成，請再試一次。" : "",
  );

  async function handleSignIn() {
    setPending(true);
    setError("");
    try {
      await signIn("google", { redirectTo: "/" });
    } catch {
      setPending(false);
      setError("無法開始 Google 登入，請確認網路後再試一次。");
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-mark large" aria-hidden="true"><CheckCheck size={24} strokeWidth={2.4} /></span>
          <span>流動待辦</span>
        </div>
        <div className="login-heading">
          <span className="eyebrow">你的每日工作台</span>
          <h1 id="login-title">登入後開始安排</h1>
        </div>
        <button className="google-signin" type="button" onClick={() => void handleSignIn()} disabled={pending}>
          <span className="google-g" aria-hidden="true">G</span>
          {pending ? "前往 Google…" : "使用 Google 登入"}
        </button>
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        <p className="login-privacy"><LockKeyhole aria-hidden="true" size={14} />只要求基本資料與 Google 日曆唯讀權限</p>
      </section>
      <aside className="login-preview" aria-label="今日安排預覽">
        <div className="preview-topline"><span>今日安排</span><strong>7 月 15 日</strong></div>
        <div className="preview-columns">
          <div className="preview-calendar">
            <span>09:00</span><i />
            <span>10:00</span><i className="preview-event">團隊晨會</i>
            <span>11:00</span><i />
            <span>12:00</span><i />
            <span>13:00</span><i className="preview-event second">午餐約會</i>
            <span>14:00</span><i />
            <span>15:00</span><i />
          </div>
          <div className="preview-tasks">
            <span>今日待辦</span>
            <div><b /><p>完成產品提案</p><em>彈性</em></div>
            <div><b /><p>確認客戶需求</p><em className="fixed">固定</em></div>
            <div className="preview-done"><b /><p>整理會議筆記</p></div>
          </div>
        </div>
      </aside>
    </main>
  );
}
