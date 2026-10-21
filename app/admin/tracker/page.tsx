import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutGrid, List, Plus, Search } from "lucide-react";
import { getSessionUser, listAssignableUsers } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { AuthzError, listProjects, listTasks } from "@/lib/crm/repo";
import { PRIORITIES, type Priority } from "@/types/crm";
import {
  EmptyState, PageHeader, Panel, PrimaryAction, PriorityTag, PRIORITY_LABEL,
  TASK_STATUS_LABEL, formatDate,
} from "@/components/crm/ui";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TaskBoard } from "@/components/tracker/board";
import {
  DEPARTMENT_LABEL, departmentOf, initials, isOverdue, taskKey,
  type Department, type TaskView,
} from "@/components/tracker/shared";
import { cn } from "@/lib/utils";

const CONTROL =
  "h-10 rounded-lg border border-input bg-card px-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

interface Filters {
  q?: string;
  dept?: string;
  owner?: string;
  priority?: string;
  view?: string;
}

export default async function TrackerPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  const isAdmin = can(user.role, "task.assign");
  const { q, dept, owner, priority, view } = await searchParams;

  let tasks, projects;
  try {
    [tasks, projects] = await Promise.all([listTasks(), listProjects()]);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }
  const people = await listAssignableUsers();

  const views: TaskView[] = tasks.map((task) => {
    const person = people.find((p) => p.id === task.ownerId);
    return {
      id: task.id,
      number: task.number ?? 0,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt,
      ownerId: task.ownerId,
      ownerName: person?.name ?? "Не назначен",
      ownerRole: person?.role,
      projectName: projects.find((p) => p.id === task.projectId)?.name,
    };
  });

  const needle = q?.toLowerCase().trim();
  const filtered = views.filter((t) => {
    if (t.status === "CANCELLED") return false;
    if (dept && departmentOf(t.ownerRole) !== (dept as Department)) return false;
    if (isAdmin && owner && t.ownerId !== owner) return false;
    if (priority && t.priority !== priority) return false;
    if (needle && !`${taskKey(t.number)} ${t.title} ${t.ownerName}`.toLowerCase().includes(needle)) {
      return false;
    }
    return true;
  });

  const open = filtered.filter((t) => t.status !== "DONE");
  const overdue = open.filter(isOverdue).length;
  const inReview = filtered.filter((t) => t.status === "REVIEW").length;
  const asList = view === "list";

  const viewHref = (next: "board" | "list") => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, dept, owner, priority })) {
      if (value) params.set(key, value);
    }
    if (next === "list") params.set("view", "list");
    const qs = params.toString();
    return `/admin/tracker${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAdmin ? "Трекер задач" : "Мои задачи"}
        hint={`${open.length} открытых · ${inReview} на проверке · ${overdue} просрочено`}
        action={
          <PrimaryAction href="/admin/tracker/new">
            <Plus className="size-4" /> Новая задача
          </PrimaryAction>
        }
      />

      <form className="flex flex-wrap items-center gap-3" method="get">
        {asList ? <input type="hidden" name="view" value="list" /> : null}
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <input
            name="q" defaultValue={q ?? ""} aria-label="Поиск"
            placeholder="Номер, название, исполнитель"
            className={`${CONTROL} w-full pl-9`}
          />
        </div>
        {isAdmin ? (
          <>
            <select name="dept" defaultValue={dept ?? ""} aria-label="Отдел" className={CONTROL}>
              <option value="">Все отделы</option>
              <option value="SALES">{DEPARTMENT_LABEL.SALES}</option>
              <option value="DEV">{DEPARTMENT_LABEL.DEV}</option>
            </select>
            <select name="owner" defaultValue={owner ?? ""} aria-label="Исполнитель" className={CONTROL}>
              <option value="">Все исполнители</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </>
        ) : null}
        <select name="priority" defaultValue={priority ?? ""} aria-label="Приоритет" className={CONTROL}>
          <option value="">Любой приоритет</option>
          {PRIORITIES.map((p: Priority) => (
            <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-lg border border-border-strong bg-card px-4 text-sm font-medium transition-colors hover:bg-surface">
          Применить
        </button>

        <div className="ml-auto inline-flex rounded-lg border border-border bg-card p-0.5">
          {([["board", LayoutGrid, "Доска"], ["list", List, "Список"]] as const).map(([key, Icon, label]) => (
            <Link
              key={key}
              href={viewHref(key)}
              aria-label={label}
              title={label}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
                (key === "list") === asList
                  ? "bg-primary-soft font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </div>
      </form>

      {filtered.length === 0 ? (
        <EmptyState
          title={views.length ? "Ничего не найдено" : "Задач пока нет"}
          hint={views.length ? "Измените фильтры." : "Создайте первую — она появится на доске."}
          action={views.length ? undefined : <PrimaryAction href="/admin/tracker/new">Создать задачу</PrimaryAction>}
        />
      ) : asList ? (
        <Panel flush>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5">Задача</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="hidden md:table-cell">Исполнитель</TableHead>
                <TableHead className="hidden md:table-cell">Приоритет</TableHead>
                <TableHead className="hidden pr-5 text-right sm:table-cell">Срок</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered
                .sort((a, b) => b.number - a.number)
                .map((task) => (
                  <TableRow key={task.id} className="group">
                    <TableCell className="px-5">
                      <Link href={`/admin/tracker/${task.id}`} className="block">
                        <span className="text-xs tabular text-muted-foreground">{taskKey(task.number)}</span>
                        <span className="block font-medium group-hover:text-primary">{task.title}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {TASK_STATUS_LABEL[task.status]}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="inline-flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-[0.625rem] font-semibold text-primary">
                          {initials(task.ownerName)}
                        </span>
                        {task.ownerName}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell"><PriorityTag priority={task.priority} /></TableCell>
                    <TableCell className={cn("hidden pr-5 text-right sm:table-cell", isOverdue(task) && "font-medium text-destructive")}>
                      {task.dueAt ? formatDate(task.dueAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Panel>
      ) : (
        <TaskBoard tasks={filtered} />
      )}
    </div>
  );
}
