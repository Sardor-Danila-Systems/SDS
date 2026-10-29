import "server-only";
import { mutateCrm } from "./store";
import { wallNow } from "./standups";
import type { Lead } from "@/types/crm";

/*
  Enquiries that arrive from the public site.

  The visitor is not signed in, so nothing here goes through the permission
  checks the admin screens use: this module does exactly one thing — add a new
  lead — and `app/api/contact` is the only caller. It is `server-only`, so it
  can never end up in a browser bundle.
*/

export interface WebsiteEnquiry {
  name: string;
  company?: string;
  contact: string;
  message: string;
  locale: string;
}

/** Splits free-text contact details into the fields a lead has. */
export function parseContact(raw: string) {
  const contact = raw.trim();
  const email = contact.match(/[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+/)?.[0];
  const telegram =
    contact.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{3,})/)?.[1] ??
    contact.match(/(?:^|\s)@([A-Za-z0-9_]{3,})(?:\s|$)/)?.[1];
  const digits = contact.replace(/[^\d+]/g, "");
  const phone =
    !email && !telegram && digits.replace(/\D/g, "").length >= 7 ? contact : undefined;
  return {
    email,
    telegram: telegram ? `@${telegram}` : undefined,
    phone,
    // Whatever is left over is kept as typed, so nothing the visitor wrote is lost.
    other: !email && !telegram && !phone ? contact : undefined,
  };
}

/** Control characters out, length capped — the text goes into the CRM as typed. */
function clean(value: string, max: number) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

export async function createWebsiteLead(input: WebsiteEnquiry) {
  const name = clean(input.name, 100);
  const company = clean(input.company ?? "", 120) || undefined;
  const message = clean(input.message, 4000);
  const parsed = parseContact(clean(input.contact, 200));
  const now = new Date().toISOString();

  return mutateCrm((data) => {
    const lead: Lead = {
      id: crypto.randomUUID(),
      firstName: name,
      company,
      email: parsed.email,
      telegram: parsed.telegram,
      phone: parsed.phone,
      source: "WEBSITE",
      stage: "NEW",
      priority: "MEDIUM",
      description: message,
      // Answering a fresh enquiry is the first thing to do: it shows up among
      // today's next steps and in the notifications.
      nextActionTitle: "Ответить на заявку с сайта",
      nextActionAt: wallNow().date,
      notes: [
        `Заявка с сайта (${input.locale.toUpperCase()}).`,
        parsed.other ? `Контакт: ${parsed.other}` : null,
      ]
        .filter(Boolean)
        .join(" "),
      createdAt: now,
      updatedAt: now,
    };
    data.leads.push(lead);
    data.activities.push({
      id: crypto.randomUUID(),
      kind: "CREATED",
      entityType: "lead",
      entityId: lead.id,
      summary: "Заявка с сайта",
      detail: message,
      actorId: "website",
      actorName: "Сайт",
      createdAt: now,
    });
    return lead;
  });
}
