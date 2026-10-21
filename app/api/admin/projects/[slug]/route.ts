import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { canEditContent } from "@/lib/auth";
import {
  ProjectsStoreError,
  deleteProjectBySlug,
  readProjects,
  slugify,
  upsertProject,
} from "@/lib/projects-store";
import type { Project } from "@/types/project";

/** Update a project. The slug in the path identifies the existing record. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await canEditContent())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug: currentSlug } = await params;

  let body: Partial<Project>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const projects = await readProjects({ fresh: true });
  const existing = projects.find((p) => p.slug === currentSlug);
  if (!existing) {
    return NextResponse.json({ error: "Проект не найден." }, { status: 404 });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Укажите название." }, { status: 400 });
  }

  const nextSlug = slugify(body.slug?.trim() || body.title);
  if (!nextSlug) {
    return NextResponse.json(
      { error: "Не удалось построить slug — укажите его вручную." },
      { status: 400 },
    );
  }

  const renamed = nextSlug !== currentSlug;
  if (renamed && projects.some((p) => p.slug === nextSlug)) {
    return NextResponse.json(
      { error: `Проект со slug «${nextSlug}» уже существует.` },
      { status: 409 },
    );
  }

  try {
    // Keep the original id so ordering and links stay stable across a rename.
    await upsertProject({ ...(body as Project), slug: nextSlug, id: existing.id });
    if (renamed) await deleteProjectBySlug(currentSlug);
  } catch (error) {
    return NextResponse.json({ error: storageMessage(error) }, { status: 502 });
  }

  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true, slug: nextSlug });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await canEditContent())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  let removed = false;
  try {
    removed = await deleteProjectBySlug(slug);
  } catch (error) {
    return NextResponse.json({ error: storageMessage(error) }, { status: 502 });
  }
  if (!removed) {
    return NextResponse.json({ error: "Проект не найден." }, { status: 404 });
  }

  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true });
}

/** Blob failures are usually configuration, not code — pass the reason on. */
function storageMessage(error: unknown) {
  if (error instanceof ProjectsStoreError) return error.message;
  return error instanceof Error ? error.message : "Не удалось сохранить.";
}
