"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, useSession } from "next-auth/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

type NoticeKind = "success" | "error" | "info";

interface Notice {
  id: number;
  kind: NoticeKind;
  message: string;
}

interface NoticeContextValue {
  notify: (message: string, kind?: NoticeKind) => void;
}

const NoticeContext = createContext<NoticeContextValue | null>(null);
const TimezoneContext = createContext(false);

export function useNotice() {
  const value = useContext(NoticeContext);
  if (!value) {
    throw new Error("useNotice 必須在 AppProviders 內使用");
  }
  return value;
}

export function useTimezoneReady() {
  return useContext(TimezoneContext);
}

function TimezoneSync({
  onReady,
  onSignedOut,
}: {
  onReady: () => void;
  onSignedOut: () => void;
}) {
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      onSignedOut();
      return;
    }
    if (status !== "authenticated") return;

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Taipei";
    const controller = new AbortController();

    void fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone }),
      signal: controller.signal,
    })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) onReady();
      });

    return () => controller.abort();
  }, [onReady, onSignedOut, status]);

  return null;
}

function NoticeViewport({ notices, dismiss }: { notices: Notice[]; dismiss: (id: number) => void }) {
  return (
    <div className="notice-viewport" aria-live="polite" aria-atomic="false">
      {notices.map((notice) => {
        const Icon = notice.kind === "error" ? TriangleAlert : notice.kind === "success" ? CheckCircle2 : Info;
        return (
          <div className={`notice notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"} key={notice.id}>
            <Icon aria-hidden="true" size={18} />
            <span>{notice.message}</span>
            <button className="icon-button compact" type="button" onClick={() => dismiss(notice.id)} aria-label="關閉通知">
              <X aria-hidden="true" size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: { retry: false },
        },
      }),
  );
  const [notices, setNotices] = useState<Notice[]>([]);
  const [timezoneReady, setTimezoneReady] = useState(false);

  const dismiss = useCallback((id: number) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const notify = useCallback((message: string, kind: NoticeKind = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setNotices((current) => [...current.slice(-2), { id, kind, message }]);
    window.setTimeout(() => {
      setNotices((current) => current.filter((notice) => notice.id !== id));
    }, 4500);
  }, []);

  const noticeValue = useMemo(() => ({ notify }), [notify]);
  const markTimezoneReady = useCallback(() => setTimezoneReady(true), []);
  const handleSignedOut = useCallback(() => {
    setTimezoneReady(false);
    queryClient.clear();
    if (window.location.pathname !== "/login") {
      const callbackUrl = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
  }, [queryClient]);

  return (
    <SessionProvider refetchOnWindowFocus>
      <QueryClientProvider client={queryClient}>
        <NoticeContext.Provider value={noticeValue}>
          <TimezoneContext.Provider value={timezoneReady}>
            <TimezoneSync onReady={markTimezoneReady} onSignedOut={handleSignedOut} />
            {children}
            <NoticeViewport notices={notices} dismiss={dismiss} />
          </TimezoneContext.Provider>
        </NoticeContext.Provider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
