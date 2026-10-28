"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Briefcase,
  CalendarDays,
  Columns3,
  FolderKanban,
  Gauge,
  KanbanSquare,
  Globe,
  LayoutDashboard,
  Menu,
  Send,
  Users,
  UsersRound,
  Video,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/crm";
import { LogoutButton } from "./logout-button";
import { ThemeToggle } from "./theme-toggle";

/**
 * Admin navigation.
 *
 * CRM and the site's content are deliberately separate groups — they are
 * different jobs done by different people, and mixing them is how a "projects"
 * link ends up meaning two things.
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles allowed to see it. Server checks still apply on every action. */
  roles?: Role[];
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/admin", label: "Сегодня", icon: LayoutDashboard }],
  },
  {
    label: "Задачи",
    items: [
      { href: "/admin/control", label: "Контроль", icon: Gauge, roles: ["ADMIN"] },
      { href: "/admin/tracker", label: "Трекер", icon: KanbanSquare },
    ],
  },
  {
    label: "Продажи",
    items: [
      { href: "/admin/crm/leads", label: "Лиды", icon: Users },
      { href: "/admin/crm/pipeline", label: "Воронка", icon: Columns3 },
      { href: "/admin/crm/meetings", label: "Встречи", icon: CalendarDays },
      { href: "/admin/crm/prospects", label: "Кому написать", icon: Send },
    ],
  },
  {
    label: "Работа",
    items: [
      { href: "/admin/crm/clients", label: "Клиенты", icon: Briefcase },
      { href: "/admin/crm/projects", label: "Проекты", icon: FolderKanban },
      { href: "/admin/crm/finance", label: "Финансы", icon: Wallet, roles: ["ADMIN"] },
    ],
  },
  {
    label: "Управление",
    items: [
      { href: "/admin/team", label: "Команда", icon: UsersRound, roles: ["ADMIN"] },
      { href: "/admin/standups", label: "Созвоны", icon: Video, roles: ["ADMIN"] },
    ],
  },
  {
    label: "Сайт",
    items: [
      { href: "/admin/content", label: "Портфолио", icon: Globe, roles: ["ADMIN"] },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Админ",
  SALES: "Отдел продаж",
  DEVELOPER: "Разработчик",
};

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 px-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-[0.8125rem] font-semibold tracking-tight text-primary-foreground">
        S
      </span>
      <span className="text-[0.9375rem] font-semibold tracking-[-0.02em]">
        SDS <span className="font-normal text-muted-foreground">админка</span>
      </span>
    </Link>
  );
}

function UserCard({ role, userName }: { role: Role; userName: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 shadow-[var(--shadow-panel)]">
      <Link
        href="/admin/profile"
        title="Профиль и пароль"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg transition-colors hover:opacity-80"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
          {initials(userName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight">{userName}</span>
          <span className="block truncate text-xs text-muted-foreground">{ROLE_LABEL[role]}</span>
        </span>
      </Link>
      <LogoutButton />
    </div>
  );
}

export function AdminNav({
  role,
  userName,
  mobileActions,
}: {
  role: Role;
  userName: string;
  mobileActions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname === "/admin/login") return null;

  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.roles || item.roles.includes(role),
    ),
  })).filter((group) => group.items.length > 0);

  const links = (
    <>
      {groups.map((group) => (
        <div key={group.label ?? "root"} className="mb-5 last:mb-0">
          {group.label ? (
            <p className="mb-1.5 px-3 text-xs font-medium text-subtle-foreground">
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[0.875rem] transition-colors",
                      active
                        ? "bg-primary-soft font-medium text-primary"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-[var(--sidebar)] lg:block">
        <div className="sticky top-0 flex h-dvh flex-col justify-between gap-6 overflow-y-auto p-4">
          <div>
            <div className="mb-8 mt-1">
              <Brand />
            </div>
            <nav>{links}</nav>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-subtle-foreground">Тема</span>
              <ThemeToggle />
            </div>
            <UserCard role={role} userName={userName} />
          </div>
        </div>
      </aside>

      {/* Mobile: brand bar with a disclosure instead of a cramped rail */}
      <div className="sticky top-0 z-40 border-b border-border bg-[var(--sidebar)] lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Brand />
          <div className="flex items-center gap-2">
            {mobileActions}
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Закрыть меню" : "Открыть меню"}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card"
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>
        {open ? (
          <div className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto px-4 pb-5 pt-2">
            <nav>{links}</nav>
            <div className="mt-4">
              <UserCard role={role} userName={userName} />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
