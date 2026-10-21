import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { PageHeader, Panel, CURRENCY_OPTIONS, DEFAULT_CURRENCY, sourceOptions } from "@/components/crm/ui";
import { ActionForm } from "@/components/crm/action-form";
import { Field, FieldRow, SelectField, TextField } from "@/components/crm/fields";
import { addLeadAction } from "../../actions";

/**
 * Only what is needed to start a conversation — name, how to reach them, what
 * they want, and when we act next. Everything else (email, position, priority,
 * our price) is filled in on the card once there is something to say, and a
 * short form is the difference between a lead written down and one lost.
 *
 * On success the action redirects to the new card, so the save is visible.
 */
export default async function NewLeadPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Новый лид" />

      <Panel>
      <ActionForm
        action={addLeadAction}
        submitLabel="Создать лид"
        pendingLabel="Создаём…"
        resetOnSuccess={false}
      >
        <FieldRow>
          <Field label="Имя" name="firstName" required placeholder="Азиз" />
          <Field label="Телефон" name="phone" placeholder="+998 90 123 45 67" />
        </FieldRow>

        <FieldRow>
          <Field label="Компания" name="company" placeholder="Registon Coffee" />
          <Field label="Telegram" name="telegram" placeholder="@username" />
        </FieldRow>

        <FieldRow>
          <SelectField
            label="Откуда"
            name="source"
            defaultValue="INSTAGRAM"
            options={sourceOptions()}
          />
          <Field label="Что нужно" name="service" placeholder="Сайт для кафе" />
        </FieldRow>

        <TextField label="Подробнее" name="description" rows={3} />

        <FieldRow>
          <Field label="Бюджет" name="budget" placeholder="5 000 000" />
          <SelectField
            label="Валюта"
            name="currency"
            defaultValue={DEFAULT_CURRENCY}
            options={CURRENCY_OPTIONS}
          />
        </FieldRow>

        <FieldRow>
          <Field
            label="Следующее действие"
            name="nextActionTitle"
            placeholder="Позвонить"
          />
          <Field label="Когда" name="nextActionAt" type="date" />
        </FieldRow>
      </ActionForm>
      </Panel>
    </div>
  );
}
