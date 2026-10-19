"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/crm";
import { LogoutButton } from "./logout-button";

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
  /** Roles allowed to see it. Server checks still apply on every action. */
  roles?: Role[];
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/*
  Ordered by how often it is opened, not by how the data model is arranged:
  leads and the funnel are the daily work, the register of companies to
  approach is occasional. Proposals used to be a section of their own — the
  price and the stage now live on the lead card, which is where the deal is.
*/
const GROUPS: NavGroup[] = [
  { label: null, items: [{ href: "/admin", label: "Сегодня" }] },
  {
    label: "Продажи",
    items: [
      { href: "/admin/crm/leads", label: "Лиды" },
      { href: "/admin/crm/pipeline", label: "Воронка" },
      { href: "/admin/crm/tasks", label: "Задачи" },
      { href: "/admin/crm/meetings", label: "Встречи" },
      { href: "/admin/crm/prospects", label: "Кому написать" },
    ],
  },
  {
    label: "Работа",
    items: [
      { href: "/admin/crm/clients", label: "Клиенты" },
      { href: "/admin/crm/projects", label: "Проекты" },
      { href: "/admin/crm/finance", label: "Финансы", roles: ["ADMIN", "SALES"] },
    ],
  },
  {
    label: "Сайт",
    items: [{ href: "/admin/content", label: "Портфолио" }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

export function AdminNav({
  role,
  userName,
}: {
  role: Role;
  userName: string;
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
        <div key={group.label ?? "root"} className="mb-7 last:mb-0">
          {group.label ? (
            <p className="label mb-3 px-3">{group.label}</p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex rounded-md px-3 py-2 text-[0.9375rem] transition-colors",
                      active
                        ? "bg-surface font-medium text-foreground"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                  >
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
      <aside className="hidden w-56 shrink-0 border-r border-border lg:block">
        <div className="sticky top-16 flex h-[calc(100dvh-4rem)] flex-col justify-between p-5">
          <nav>{links}</nav>
          <div className="border-t border-border pt-4">
            <p className="px-3 text-sm">{userName}</p>
            <p className="label mt-1 px-3">{role}</p>
            <div className="mt-3 px-3">
              <LogoutButton />
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile: a disclosure above the content rather than a cramped rail */}
      <div className="border-b border-border lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between px-6 py-3 text-[0.9375rem]"
        >
          Меню
          <span className="label">{open ? "закрыть" : "открыть"}</span>
        </button>
        {open ? (
          <div className="px-3 pb-5">
            <nav>{links}</nav>
            <div className="mt-4 border-t border-border px-3 pt-4">
              <p className="text-sm">{userName}</p>
              <p className="label mt-1">{role}</p>
              <div className="mt-3">
                <LogoutButton />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
