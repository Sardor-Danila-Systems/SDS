import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { canEditContent } from "@/lib/auth";
import {
  ProjectsStoreError,
  readProjects,
  slugify,
  upsertProject,
} from "@/lib/projects-store";
import type { Project } from "@/types/project";

/**
 * Create a project. The form POSTs the whole `Project` (minus `id`, which the
 * store assigns).
 *
 * The middleware already guards `/api/admin/*`, but the session is re-checked
 * here so the route is safe on its own.
 */
export async function POST(request: Request) {
  if (!(await canEditContent())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Partial<Project>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Укажите название." }, { status: 400 });
  }

  const slug = slugify(body.slug?.trim() || body.title);
  if (!slug) {
    return NextResponse.json(
      { error: "Не удалось построить slug — укажите его вручную." },
      { status: 400 },
    );
  }

  const existing = await readProjects({ fresh: true });
  if (existing.some((p) => p.slug === slug)) {
    return NextResponse.json(
      { error: `Проект со slug «${slug}» уже существует.` },
      { status: 409 },
    );
  }

  try {
    await upsertProject({ ...(body as Project), slug });
  } catch (error) {
    return NextResponse.json({ error: storageMessage(error) }, { status: 502 });
  }

  // The public pages are prerendered from this data, so they have to be
  // rebuilt for the change to show.
  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true, slug });
}

/** Blob failures are usually configuration, not code — pass the reason on. */
function storageMessage(error: unknown) {
  if (error instanceof ProjectsStoreError) return error.message;
  return error instanceof Error ? error.message : "Не удалось сохранить.";
}
