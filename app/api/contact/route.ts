import { NextResponse } from "next/server";
import { createWebsiteLead } from "@/lib/crm/inbound";
import { CrmStoreError } from "@/lib/crm/store";
import { siteConfig } from "@/lib/site";

/**
 * The contact form's endpoint: an enquiry from the site becomes a new lead in
 * the CRM.
 *
 * It is public, so it is defended in layers that cost a real visitor nothing:
 * a hidden field only bots fill in, a same-origin check, a small per-address
 * rate limit and an hourly ceiling on the whole site. The limits live in this
 * server instance's memory — enough to stop a script hammering the form, not a
 * guarantee across instances; the ceiling below is what bounds the damage.
 */

const WINDOW_MS = 10 * 60_000;
const PER_ADDRESS = 5;
const SITE_PER_HOUR = 60;

const recentByAddress = new Map<string, number[]>();
let siteWindow: number[] = [];

function allowed(address: string, now: number) {
  siteWindow = siteWindow.filter((t) => now - t < 3_600_000);
  if (siteWindow.length >= SITE_PER_HOUR) return false;

  const mine = (recentByAddress.get(address) ?? []).filter((t) => now - t < WINDOW_MS);
  if (mine.length >= PER_ADDRESS) {
    recentByAddress.set(address, mine);
    return false;
  }
  mine.push(now);
  recentByAddress.set(address, mine);
  siteWindow.push(now);

  // Keep the map from growing without bound.
  if (recentByAddress.size > 5000) recentByAddress.clear();
  return true;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients; the other layers still apply
  try {
    const host = new URL(origin).host;
    const own = request.headers.get("host");
    return host === own || host === new URL(siteConfig.url).host || /^localhost(:\d+)?$/.test(host);
  } catch {
    return false;
  }
}

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // A real visitor never sees this field. Pretend it worked, so a bot learns nothing.
  if (text(body.website, 200)) return NextResponse.json({ ok: true });

  const name = text(body.name, 100);
  const company = text(body.company, 120);
  const contact = text(body.contact, 200);
  const message = text(body.message, 4000);
  const locale = ["ru", "en", "uz"].includes(String(body.locale)) ? String(body.locale) : "ru";

  if (!name || contact.length < 3 || message.length < 10) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allowed(address, Date.now())) {
    return NextResponse.json({ error: "too_many" }, { status: 429 });
  }

  try {
    await createWebsiteLead({ name, company, contact, message, locale });
    return NextResponse.json({ ok: true });
  } catch (error) {
    // The CRM store being unreachable is the one failure the form can recover
    // from, by falling back to e-mail — say so with a distinct status.
    const stored = error instanceof CrmStoreError;
    return NextResponse.json({ error: stored ? "store" : "server" }, { status: 503 });
  }
}
