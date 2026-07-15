"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { CalendarDays, CheckCheck, Focus, LogOut, MoreVertical } from "lucide-react";

export function IconTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={450}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="tooltip-content" sideOffset={7}>
            {label}
            <Tooltip.Arrow className="tooltip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function AccountMenu() {
  const { data, status } = useSession();
  const user = data?.user;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="account-trigger" type="button" aria-label="開啟帳戶選單">
          {user?.image ? (
            <Image className="avatar" src={user.image} width={34} height={34} alt="" unoptimized />
          ) : (
            <span className="avatar avatar-fallback" aria-hidden="true">
              {user?.name?.slice(0, 1) || "我"}
            </span>
          )}
          <span className="account-copy">
            <strong>{status === "loading" ? "載入中" : user?.name || "我的帳戶"}</strong>
            <small>{user?.email || ""}</small>
          </span>
          <MoreVertical aria-hidden="true" size={17} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu-content account-menu" align="end" sideOffset={8}>
          <div className="menu-account-copy">
            <strong>{user?.name || "我的帳戶"}</strong>
            <span>{user?.email}</span>
          </div>
          <DropdownMenu.Separator className="menu-separator" />
          <DropdownMenu.Item className="menu-item danger" onSelect={() => void signOut({ redirectTo: "/login" })}>
            <LogOut aria-hidden="true" size={16} />
            登出
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/" aria-label="流動待辦首頁">
            <span className="brand-mark" aria-hidden="true">
              <CheckCheck size={20} strokeWidth={2.4} />
            </span>
            <span>流動待辦</span>
          </Link>
          <nav className="desktop-nav" aria-label="主要導覽">
            <Link className={pathname === "/" ? "nav-link active" : "nav-link"} href="/">
              <Focus aria-hidden="true" size={17} />
              今日焦點
            </Link>
            <Link className={pathname.startsWith("/planning") ? "nav-link active" : "nav-link"} href="/planning">
              <CalendarDays aria-hidden="true" size={17} />
              安排
            </Link>
          </nav>
          <AccountMenu />
        </div>
      </header>
      <main className="main-content">{children}</main>
      <nav className="mobile-nav" aria-label="主要導覽">
        <Link className={pathname === "/" ? "mobile-nav-link active" : "mobile-nav-link"} href="/">
          <Focus aria-hidden="true" size={20} />
          今日焦點
        </Link>
        <Link className={pathname.startsWith("/planning") ? "mobile-nav-link active" : "mobile-nav-link"} href="/planning">
          <CalendarDays aria-hidden="true" size={20} />
          安排
        </Link>
      </nav>
    </div>
  );
}
