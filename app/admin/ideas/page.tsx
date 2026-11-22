import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/crm/rbac";
import { AuthzError, listIdeas } from "@/lib/crm/repo";
import { aiEnabled } from "@/lib/ideas/generator";
import { PageHeader } from "@/components/crm/ui";
import { IdeasBoard } from "@/components/ideas/ideas-board";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  let ideas;
  try {
    ideas = await listIdeas();
  } catch (error) {
    if (error instanceof AuthzError) redirect("/admin");
    throw error;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Идеи"
        hint="Что можно попробовать: стратегии, предложения, эксперименты. Развивайте нужные, убирайте лишние."
      />
      <IdeasBoard ideas={ideas} canDelete={can(user.role, "idea.delete")} aiEnabled={aiEnabled()} />
    </div>
  );
}
