import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { canEditContent } from "@/lib/auth";

/**
 * Image upload for the project form. Takes multipart `file`, returns
 * `{ src }` — the public Blob URL the form stores on the project.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/avif"];

export async function POST(request: Request) {
  if (!(await canEditContent())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Загрузка не настроена: нет BLOB_READ_WRITE_TOKEN." },
      { status: 500 },
    );
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
    const blob = await put(`work/${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });
    return NextResponse.json({ src: blob.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/private store|public access/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Хранилище Vercel Blob приватное, а картинки должны открываться " +
            "из браузера. Переключите store на public access.",
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: `Загрузка не удалась: ${message}` }, { status: 502 });
  }
}
