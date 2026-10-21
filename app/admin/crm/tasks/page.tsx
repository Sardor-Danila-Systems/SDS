import { redirect } from "next/navigation";

/** The task list moved into the tracker; keep old links and bookmarks working. */
export default async function TasksRedirect({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const { user } = await searchParams;
  redirect(user ? `/admin/tracker?owner=${encodeURIComponent(user)}` : "/admin/tracker");
}
