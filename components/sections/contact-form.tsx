"use client";

import { useId, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowRight,
  AtSign,
  Check,
  Mail,
  Phone,
  RotateCcw,
  Send,
  type LucideIcon,
} from "lucide-react";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";
import {
  BUDGETS,
  CHANNELS,
  SERVICES,
  type Budget,
  type Channel,
  type Service,
} from "@/lib/contact-options";

/**
 * The enquiry form, on the dark closing section.
 *
 * It asks what we need to answer well in the order a visitor thinks of it:
 * what they want built (chips, several allowed), a rough budget (optional),
 * who they are, how to reach them — with a format check for the chosen
 * channel — and the task in their own words.
 *
 * It sends to `/api/contact`, which files the enquiry in the CRM as a new
 * lead. If that is not possible — the server is unreachable, the store is down
 * — it hands a pre-filled message to the visitor's mail client instead, so an
 * enquiry is never simply lost.
 */

type Field = "name" | "contact" | "message";
type Errors = Partial<Record<Field, string>>;

const MESSAGE_MAX = 2000;
const CHANNEL_ICON: Record<Channel, LucideIcon> = {
  telegram: Send,
  email: Mail,
  phone: Phone,
};

function contactValid(channel: Channel, value: string) {
  const v = value.trim();
  if (channel === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  if (channel === "phone") return v.replace(/\D/g, "").length >= 7;
  return /^(?:@|(?:https?:\/\/)?t\.me\/)?[A-Za-z0-9_]{4,32}$/.test(v);
}

/* ------------------------------ small pieces ------------------------------ */

function FieldLabel({
  htmlFor,
  children,
  optional,
}: {
  htmlFor?: string;
  children: ReactNode;
  optional?: string;
}) {
  const Tag = htmlFor ? "label" : "span";
  return (
    <Tag
      {...(htmlFor ? { htmlFor } : {})}
      // Fixed height, so a label with an "optional" note lines up with one without.
      className="flex h-4 items-center justify-between gap-3"
    >
      <span className="label text-ink-foreground/80">{children}</span>
      {optional ? <span className="text-xs leading-none text-ink-muted">{optional}</span> : null}
    </Tag>
  );
}

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} className="flex items-center gap-1.5 text-[0.8125rem] text-[#ff8a80]">
      <AlertCircle className="size-3.5 shrink-0" />
      {children}
    </p>
  );
}

const CONTROL =
  "w-full rounded-md border bg-white/[0.035] text-[0.9375rem] text-ink-foreground transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-ink-muted/80 hover:border-white/25 focus-visible:border-primary focus-visible:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

function Chip({
  selected,
  onClick,
  children,
  role,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  role?: "radio";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-pressed={role ? undefined : selected}
      aria-checked={role ? selected : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm transition-[background-color,border-color,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-ink-line text-ink-foreground/85 hover:border-white/35 hover:text-ink-foreground",
      )}
    >
      {selected ? <Check className="size-3.5" /> : null}
      {children}
    </button>
  );
}

/* ---------------------------------- form ---------------------------------- */

/** Built for the dark contact section; `tone` is kept for existing call sites. */
export function ContactForm({ tone = "ink" }: { tone?: "default" | "ink" }) {
  void tone;
  const t = useTranslations("Contact.form");
  const locale = useLocale();
  const uid = useId();
  const ids = {
    name: `${uid}-name`,
    company: `${uid}-company`,
    contact: `${uid}-contact`,
    message: `${uid}-message`,
  };

  const [services, setServices] = useState<Service[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [channel, setChannel] = useState<Channel>("telegram");
  const [values, setValues] = useState({ name: "", company: "", contact: "", message: "" });
  // A field real visitors never see; bots fill it in and are quietly ignored.
  const [trap, setTrap] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [tried, setTried] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "fallback">("idle");
  const [sendError, setSendError] = useState<string | null>(null);

  function check(field: Field, v = values, ch = channel): string | undefined {
    if (field === "name") return v.name.trim() ? undefined : t("errors.name");
    if (field === "contact") {
      if (!v.contact.trim()) return t("errors.contact");
      return contactValid(ch, v.contact) ? undefined : t(`errors.contactFormat.${ch}`);
    }
    return v.message.trim().length >= 10 ? undefined : t("errors.message");
  }

  function validateAll(): Errors {
    const next: Errors = {};
    for (const f of ["name", "contact", "message"] as Field[]) {
      const e = check(f);
      if (e) next[f] = e;
    }
    return next;
  }

  function update(field: Field | "company", value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    // Once a field has shown an error, re-check it as the visitor fixes it.
    if (field !== "company" && errors[field]) {
      setErrors((e) => ({ ...e, [field]: check(field, next) }));
    }
  }

  function blur(field: Field) {
    // Only nag on leaving a field the visitor has actually typed into, or
    // after they have tried to send.
    if (!tried && !values[field].trim()) return;
    setErrors((e) => ({ ...e, [field]: check(field) }));
  }

  function pickChannel(next: Channel) {
    setChannel(next);
    if (errors.contact || (tried && values.contact)) {
      setErrors((e) => ({ ...e, contact: check("contact", values, next) }));
    }
  }

  function toggleService(s: Service) {
    setServices((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]));
  }

  function openMailClient() {
    const subject = `${t("emailSubject")} — ${values.name}`;
    const body = [
      `${t("name")}: ${values.name}`,
      values.company ? `${t("company")}: ${values.company}` : null,
      `${t(`channel.${channel}`)}: ${values.contact}`,
      services.length ? `${t("services.title")}: ${services.map((s) => t(`services.${s}`)).join(", ")}` : null,
      budget ? `${t("budget.title")}: ${t(`budget.${budget}`)}` : null,
      "",
      values.message,
    ]
      .filter((line) => line !== null)
      .join("\n");
    window.location.href = `${siteConfig.contacts.emailHref}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (status === "sending") return;
    setTried(true);
    const found = validateAll();
    setErrors(found);
    const first = (["name", "contact", "message"] as Field[]).find((f) => found[f]);
    if (first) {
      document.getElementById(ids[first])?.focus();
      return;
    }

    setStatus("sending");
    setSendError(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          services,
          budget,
          channel,
          website: trap,
          locale,
        }),
      });
      if (response.ok) {
        setStatus("sent");
        return;
      }
      if (response.status === 429) {
        setStatus("idle");
        setSendError(t("errors.tooMany"));
        return;
      }
      throw new Error(String(response.status));
    } catch {
      // The enquiry did not reach us — hand it over by e-mail instead.
      setStatus("fallback");
      openMailClient();
    }
  }

  function reset() {
    setServices([]);
    setBudget(null);
    setValues({ name: "", company: "", contact: "", message: "" });
    setErrors({});
    setTried(false);
    setStatus("idle");
  }

  /* ------------------------------- success ------------------------------- */

  if (status === "sent" || status === "fallback") {
    const sent = status === "sent";
    return (
      <div role="status" className="rounded-lg border border-ink-line bg-white/[0.03] p-6 sm:p-8">
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-full",
            sent ? "bg-primary text-primary-foreground" : "bg-white/10 text-ink-foreground",
          )}
        >
          {sent ? <Check className="size-5" /> : <Mail className="size-5" />}
        </span>
        <p className="mt-5 text-2xl font-medium tracking-[-0.03em]">
          {sent ? t("successTitle") : t("fallbackTitle")}
        </p>
        <p className="mt-2 max-w-md text-pretty leading-relaxed text-ink-muted">
          {sent ? t("success") : t("fallbackSuccess")}
        </p>
        {sent && (services.length > 0 || budget) ? (
          <dl className="mt-6 grid gap-3 border-t border-ink-line pt-5 text-sm sm:grid-cols-2">
            {services.length > 0 ? (
              <div>
                <dt className="text-ink-muted">{t("services.title")}</dt>
                <dd className="mt-1">{services.map((s) => t(`services.${s}`)).join(", ")}</dd>
              </div>
            ) : null}
            {budget ? (
              <div>
                <dt className="text-ink-muted">{t("budget.title")}</dt>
                <dd className="mt-1">{t(`budget.${budget}`)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-7 inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink-foreground"
        >
          <RotateCcw className="size-4" />
          {t("sendAnother")}
        </button>
      </div>
    );
  }

  /* --------------------------------- form -------------------------------- */

  const ChannelIcon = CHANNEL_ICON[channel];
  const count = values.message.length;

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-9">
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`${uid}-website`}>Website</label>
        <input
          id={`${uid}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={trap}
          onChange={(e) => setTrap(e.target.value)}
        />
      </div>

      {/* What to build */}
      <fieldset className="space-y-3.5">
        <legend className="w-full">
          <FieldLabel optional={t("multiple")}>{t("services.title")}</FieldLabel>
        </legend>
        <div className="flex flex-wrap gap-2">
          {SERVICES.map((s) => (
            <Chip key={s} selected={services.includes(s)} onClick={() => toggleService(s)}>
              {t(`services.${s}`)}
            </Chip>
          ))}
        </div>
      </fieldset>

      {/* Budget */}
      <fieldset className="space-y-3.5">
        <legend className="w-full">
          <FieldLabel optional={t("optional")}>{t("budget.title")}</FieldLabel>
        </legend>
        <div role="radiogroup" aria-label={t("budget.title")} className="flex flex-wrap gap-2">
          {BUDGETS.map((b) => (
            <Chip
              key={b}
              role="radio"
              selected={budget === b}
              onClick={() => setBudget((cur) => (cur === b ? null : b))}
            >
              {t(`budget.${b}`)}
            </Chip>
          ))}
        </div>
      </fieldset>

      {/* Who */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2.5">
          <FieldLabel htmlFor={ids.name}>{t("name")}</FieldLabel>
          <input
            id={ids.name}
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            onBlur={() => blur("name")}
            placeholder={t("namePlaceholder")}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? `${ids.name}-error` : undefined}
            autoComplete="name"
            className={cn(CONTROL, "h-12 px-4", errors.name ? "border-[#ff8a80]/70" : "border-ink-line")}
          />
          <FieldError id={`${ids.name}-error`}>{errors.name}</FieldError>
        </div>

        <div className="space-y-2.5">
          <FieldLabel htmlFor={ids.company} optional={t("optional")}>
            {t("company")}
          </FieldLabel>
          <input
            id={ids.company}
            value={values.company}
            onChange={(e) => update("company", e.target.value)}
            placeholder={t("companyPlaceholder")}
            autoComplete="organization"
            className={cn(CONTROL, "h-12 border-ink-line px-4")}
          />
        </div>
      </div>

      {/* How to reach them */}
      <div className="space-y-2.5">
        <FieldLabel htmlFor={ids.contact}>{t("channel.title")}</FieldLabel>
        <div
          role="radiogroup"
          aria-label={t("channel.title")}
          className="inline-flex rounded-md border border-ink-line bg-white/[0.03] p-1"
        >
          {CHANNELS.map((c) => {
            const Icon = CHANNEL_ICON[c];
            const active = channel === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => pickChannel(c)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-[3px] px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active ? "bg-white/[0.09] text-ink-foreground" : "text-ink-muted hover:text-ink-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {t(`channel.${c}`)}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted">
            {channel === "telegram" ? <AtSign className="size-4" /> : <ChannelIcon className="size-4" />}
          </span>
          <input
            id={ids.contact}
            value={values.contact}
            onChange={(e) => update("contact", e.target.value)}
            onBlur={() => blur("contact")}
            placeholder={t(`channel.placeholder.${channel}`)}
            inputMode={channel === "phone" ? "tel" : channel === "email" ? "email" : "text"}
            type={channel === "email" ? "email" : channel === "phone" ? "tel" : "text"}
            autoComplete={channel === "email" ? "email" : channel === "phone" ? "tel" : "off"}
            aria-invalid={!!errors.contact}
            aria-describedby={errors.contact ? `${ids.contact}-error` : undefined}
            className={cn(CONTROL, "h-12 pl-11 pr-4", errors.contact ? "border-[#ff8a80]/70" : "border-ink-line")}
          />
        </div>
        <FieldError id={`${ids.contact}-error`}>{errors.contact}</FieldError>
      </div>

      {/* The task */}
      <div className="space-y-2.5">
        <FieldLabel htmlFor={ids.message}>{t("message")}</FieldLabel>
        <div className="relative">
          <textarea
            id={ids.message}
            value={values.message}
            maxLength={MESSAGE_MAX}
            onChange={(e) => update("message", e.target.value)}
            onBlur={() => blur("message")}
            placeholder={t("messagePlaceholder")}
            rows={6}
            aria-invalid={!!errors.message}
            aria-describedby={`${ids.message}-hint${errors.message ? ` ${ids.message}-error` : ""}`}
            className={cn(
              CONTROL,
              "block min-h-40 resize-y px-4 py-3.5 pb-8 leading-relaxed",
              errors.message ? "border-[#ff8a80]/70" : "border-ink-line",
            )}
          />
          <span
            className={cn(
              "pointer-events-none absolute bottom-2.5 right-3.5 font-mono text-[0.6875rem] tabular-nums",
              count > MESSAGE_MAX * 0.9 ? "text-[#ffcc80]" : "text-ink-muted",
            )}
          >
            {count} / {MESSAGE_MAX}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <FieldError id={`${ids.message}-error`}>{errors.message}</FieldError>
          <p id={`${ids.message}-hint`} className={cn("text-[0.8125rem] text-ink-muted", errors.message && "sr-only")}>
            {t("messageHint")}
          </p>
        </div>
      </div>

      {sendError ? (
        <p className="flex items-center gap-2 rounded-md border border-[#ff8a80]/40 bg-[#ff8a80]/10 px-4 py-3 text-sm text-[#ffb4ab]" role="alert">
          <AlertCircle className="size-4 shrink-0" />
          {sendError}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 border-t border-ink-line pt-7 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-sm text-[0.8125rem] leading-relaxed text-ink-muted">{t("note")}</p>
        <button
          type="submit"
          disabled={status === "sending"}
          className="group inline-flex h-12 w-full shrink-0 items-center justify-center gap-2.5 rounded-md bg-primary px-7 text-[0.9375rem] font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:opacity-70 sm:w-auto"
        >
          {status === "sending" ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
              {t("sending")}
            </>
          ) : (
            <>
              {t("submit")}
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
