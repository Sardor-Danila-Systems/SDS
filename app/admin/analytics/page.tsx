import Link from "next/link";
import { redirect } from "next/navigation";
import { LineChart } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { AuthzError } from "@/lib/crm/repo";
import {
  ANALYTICS_CURRENCIES,
  buildAnalytics,
  type AnalyticsCurrency,
} from "@/lib/crm/analytics";
import { EmptyState, PageHeader } from "@/components/crm/ui";
import { AnalyticsBento } from "@/components/ui/analytics-bento";
import { cn } from "@/lib/utils";

const SANS = "var(--font-onest), ui-sans-serif, system-ui, -apple-system, sans-serif";
const MONO = "var(--font-mono-jb), ui-monospace, SFMono-Regular, Menlo, monospace";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ cur?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!can(user.role, "finance.report")) redirect("/admin");

  const { cur } = await searchParams;
  const currency: AnalyticsCurrency = cur === "USD" ? "USD" : "UZS";

  let analytics;
  try {
    analytics = await buildAnalytics(currency);
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Аналитика"
        hint="Поступления, активность команды и сезонность — по данным CRM"
        action={
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {ANALYTICS_CURRENCIES.map((c) => (
              <Link
                key={c}
                href={c === "UZS" ? "/admin/analytics" : `/admin/analytics?cur=${c}`}
                className={cn(
                  "inline-flex h-9 items-center rounded-md px-3.5 text-sm transition-colors",
                  c === currency
                    ? "bg-primary-soft font-medium text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c}
              </Link>
            ))}
          </div>
        }
      />

      {analytics.hasMoney ? (
        <AnalyticsBento
          key={currency}
          currency={analytics.currency}
          revenue={analytics.revenue}
          sessions={analytics.sessions}
          categories={analytics.categories}
          seasonality={analytics.seasonality}
          fontFamily={SANS}
          monoFamily={MONO}
          text={{ revenue: "Получено", share: "Доля", sales: "Получено", year: "Год" }}
          colors={{
            desktop: ["#22D3EE", "#116bff"],
            mobile: ["#FFB800", "#FF5A1F"],
          }}
        />
      ) : (
        <EmptyState
          icon={LineChart}
          title={`Поступлений в ${currency} пока нет`}
          hint="Запишите платёж в карточке проекта — графики появятся сразу. Другую валюту можно выбрать справа вверху."
        />
      )}
    </div>
  );
}
