import { redirect } from "next/navigation";
import { canEditContent } from "@/lib/auth";

/** The portfolio is edited by admins only — sales has no business here. */
export default async function ContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await canEditContent())) redirect("/admin");
  return children;
}
