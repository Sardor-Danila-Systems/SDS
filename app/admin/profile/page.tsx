import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { PageHeader, Panel } from "@/components/crm/ui";
import { ActionForm } from "@/components/crm/action-form";
import { PasswordField } from "@/components/crm/password-field";
import { changePasswordAction } from "../crm/actions";

const ROLE_LABEL = {
  ADMIN: "Админ",
  SALES: "Отдел продаж",
  DEVELOPER: "Разработчик",
} as const;

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  // The bootstrap admin signs in with the server's env variables.
  const isBootstrap = user.id === "bootstrap-admin";

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Профиль" hint="Ваш аккаунт и пароль" />

      <Panel title="Аккаунт">
        <dl className="-my-3 text-sm">
          {[
            ["Имя", user.name],
            ["Логин", user.login],
            ["Роль", ROLE_LABEL[user.role]],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-border py-3 last:border-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="Смена пароля">
        {isBootstrap ? (
          <p className="text-sm text-muted-foreground">
            Пароль этого аккаунта задаётся в настройках сервера (переменная{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 text-xs">ADMIN_PASSWORD</code>) и меняется
            там, а не здесь.
          </p>
        ) : (
          <ActionForm
            action={changePasswordAction}
            submitLabel="Сменить пароль"
            pendingLabel="Меняем…"
            savedLabel="Пароль изменён"
          >
            <PasswordField label="Текущий пароль" name="current" autoComplete="current-password" />
            <PasswordField label="Новый пароль" name="next" autoComplete="new-password" placeholder="не короче 8 символов" />
            <PasswordField label="Повторите новый пароль" name="repeat" autoComplete="new-password" />
          </ActionForm>
        )}
      </Panel>
    </div>
  );
}
