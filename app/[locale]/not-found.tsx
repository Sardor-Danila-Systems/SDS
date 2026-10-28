import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  NOT_FOUND_LINK_CLASS,
  NotFoundView,
} from "@/components/layout/not-found-view";

/** A missing page inside a known locale: the 404 scene under the site header. */
export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <NotFoundView
      framed
      title={t("title")}
      subtitle={t("subtitle")}
      action={
        <Link href="/" className={NOT_FOUND_LINK_CLASS}>
          {t("cta")}
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      }
    />
  );
}
