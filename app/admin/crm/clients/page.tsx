import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthzError, listClients, listLeads } from "@/lib/crm/repo";
import { EmptyState, PageHeader, Panel, formatDate } from "@/components/crm/ui";

/** Clients are created from won leads, never typed in twice. */
export default async function ClientsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  let clients, leads;
  try {
    [clients, leads] = await Promise.all([listClients(), listLeads()]);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }

  const wonWithoutClient = leads.filter((l) => l.stage === "WON" && !l.clientId);

  return (
    <div className="space-y-6">
      <PageHeader label="Работа" title="Клиенты" hint={`${clients.length} всего`} />

      {wonWithoutClient.length > 0 ? (
        <div className="rounded-xl border border-primary/30 bg-primary-soft px-5 py-4">
          <p className="text-sm font-medium">
            {wonWithoutClient.length} выигранных лидов ещё не переведены в клиентов.
          </p>
          <ul className="mt-2 space-y-1">
            {wonWithoutClient.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/admin/crm/leads/${lead.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  {lead.company ?? lead.firstName} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {clients.length === 0 ? (
        <EmptyState
          title="Клиентов пока нет"
          hint="Клиент появляется, когда лид переведён из выигранной сделки."
        />
      ) : (
        <Panel flush>
        <ul className="divide-y divide-border">
          {clients.map((client) => (
            <li
              key={client.id}
              className="grid gap-3 px-5 py-4 md:grid-cols-12 md:items-baseline md:gap-6"
            >
              <div className="md:col-span-4">
                <p className="text-sm font-medium">
                  {client.company ?? client.name}
                </p>
                {client.company ? (
                  <p className="mt-1 text-sm text-muted-foreground">{client.name}</p>
                ) : null}
              </div>
              <div className="text-sm text-muted-foreground md:col-span-3">
                {client.email ?? "—"}
                <span className="block">{client.phone ?? ""}</span>
              </div>
              <div className="text-sm text-muted-foreground md:col-span-3">
                {[client.city, client.country].filter(Boolean).join(", ") || "—"}
              </div>
              <div className="text-sm text-subtle-foreground md:col-span-2 md:text-right">
                {formatDate(client.createdAt)}
              </div>
            </li>
          ))}
        </ul>
        </Panel>
      )}
    </div>
  );
}
