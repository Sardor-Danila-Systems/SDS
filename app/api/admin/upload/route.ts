import { NextResponse } from "next/server";
import { canEditContent } from "@/lib/auth";
import { MediaError, saveMedia } from "@/lib/media";

/**
 * Image upload for the project form. Takes multipart `file`, returns
 * `{ src }` — the `/api/media/<id>` address the form stores on the project.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/avif"];

export async function POST(request: Request) {
  if (!(await canEditContent())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "Файл не передан." }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "Поддерживаются PNG, JPEG, WebP и AVIF." },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Файл больше 8 МБ." },
      { status: 413 },
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase();

  try {
    const src = await saveMedia({
      name: safeName,
      contentType: file.type,
      data: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ src });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: error instanceof MediaError ? message : `Загрузка не удалась: ${message}` },
      { status: 502 },
    );
  }
}
