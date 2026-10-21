import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { getSessionUser, listAssignableUsers } from "@/lib/auth";
import { canSeeFinance } from "@/lib/crm/rbac";
import { AuthzError, listLeads } from "@/lib/crm/repo";
import { ACTIVE_LEAD_STAGES, pipelineColumn, type LeadStage } from "@/types/crm";
import {
  EmptyState, PageHeader, Panel, PrimaryAction, PriorityTag, StageBadge, STAGE_LABEL,
  formatDate, formatMoney,
} from "@/components/crm/ui";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const CONTROL =
  "h-10 rounded-lg border border-input bg-card px-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string; owner?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  let leads;
  try {
    leads = await listLeads();
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }

  const { stage, q, owner } = await searchParams;
  const needle = q?.toLowerCase().trim();
  const showMoney = canSeeFinance(user.role);
  const isAdmin = user.role === "ADMIN";
  // The admin sees who owns each lead and can look at one salesperson's work.
  const people = isAdmin ? await listAssignableUsers() : [];
  const ownerName = (id?: string) => people.find((p) => p.id === id)?.name ?? "—";

  const filtered = leads.filter((l) => {
    if (stage && pipelineColumn(l.stage) !== pipelineColumn(stage as LeadStage))
      return false;
    if (isAdmin && owner && l.ownerId !== owner) return false;
    if (!needle) return true;
    return [l.firstName, l.lastName, l.company, l.email, l.phone, l.city]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(needle));
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Лиды"
        hint={`${filtered.length} из ${leads.length}`}
        action={
          <PrimaryAction href="/admin/crm/leads/new">
            <Plus className="size-4" /> Новый лид
          </PrimaryAction>
        }
      />

      <form className="flex flex-wrap items-center gap-3" method="get">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <input
            id="q" name="q" defaultValue={q ?? ""} aria-label="Поиск"
            placeholder="Имя, компания, email, телефон"
            className={`${CONTROL} w-full pl-9`}
          />
        </div>
        <select name="stage" defaultValue={stage ?? ""} aria-label="Этап" className={CONTROL}>
          <option value="">Все этапы</option>
          {ACTIVE_LEAD_STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABEL[s] ?? s}</option>
          ))}
        </select>
        {isAdmin ? (
          <select name="owner" defaultValue={owner ?? ""} aria-label="Ответственный" className={CONTROL}>
            <option value="">Все сотрудники</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : null}
        <button type="submit" className="h-10 rounded-lg border border-border-strong bg-card px-4 text-sm font-medium transition-colors hover:bg-surface">
          Применить
        </button>
      </form>

      {filtered.length === 0 ? (
        <EmptyState
          title={leads.length ? "Ничего не найдено" : "Лидов пока нет"}
          hint={leads.length ? "Измените фильтры." : "Добавьте первого потенциального клиента."}
          action={leads.length ? undefined : <PrimaryAction href="/admin/crm/leads/new">Добавить лид</PrimaryAction>}
        />
      ) : (
        <Panel flush>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5">Лид</TableHead>
                <TableHead>Этап</TableHead>
                <TableHead className="hidden md:table-cell">Услуга</TableHead>
                {showMoney ? <TableHead className="hidden lg:table-cell">Сумма</TableHead> : null}
                {isAdmin ? <TableHead className="hidden lg:table-cell">Ответственный</TableHead> : null}
                <TableHead className="hidden pr-5 text-right md:table-cell">Следующее действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((lead) => (
                <TableRow key={lead.id} className="group">
                  <TableCell className="px-5">
                    <Link href={`/admin/crm/leads/${lead.id}`} className="block">
                      <span className="block font-medium group-hover:text-primary">
                        {lead.company ?? `${lead.firstName} ${lead.lastName ?? ""}`}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {lead.company ? `${lead.firstName} ${lead.lastName ?? ""}` : lead.email ?? "—"}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell><StageBadge stage={lead.stage} /></TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {lead.service ?? "—"}
                    <span className="mt-1 block"><PriorityTag priority={lead.priority} /></span>
                  </TableCell>
                  {showMoney ? (
                    <TableCell className="hidden tabular lg:table-cell">
                      {formatMoney(lead.proposedPrice ?? lead.budget)}
                    </TableCell>
                  ) : null}
                  {isAdmin ? (
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {ownerName(lead.ownerId)}
                    </TableCell>
                  ) : null}
                  <TableCell className="hidden pr-5 text-right md:table-cell">
                    {lead.nextActionTitle ? (
                      <>
                        <span className="block max-w-56 truncate">{lead.nextActionTitle}</span>
                        <span className="text-xs text-subtle-foreground">{formatDate(lead.nextActionAt)}</span>
                      </>
                    ) : (
                      <span className="text-subtle-foreground">нет действия</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
