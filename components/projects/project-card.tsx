import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale, Project } from "@/types/project";
import { projectCopy } from "@/lib/get-projects";
import { Reveal } from "@/components/animations/reveal";
import { ProjectVisual } from "./project-visual";

/**
 * One project in the grid.
 *
 * Every card is built the same way — picture, number, name, one line of what
 * it is, one line of what it does — so two of them side by side can be
 * compared at a glance. The alternating full-width scenes this replaced read
 * as a sequence of separate pages: handsome, but it took a moment on each one
 * to work out which text belonged to which image.
 *
 * `variant` changes only the second line: SDS products name their category,
 * the team's Dotlabs-era work names the role the team held, which is the
 * distinction the section above it draws in words.
 */
export function ProjectCard({
  project,
  locale,
  index,
  variant = "product",
  priority = false,
}: {
  project: Project;
  locale: Locale;
  index: number;
  variant?: "product" | "team";
  priority?: boolean;
}) {
  const tWork = useTranslations("Work");
  const copy = projectCopy(project, locale);
  const meta = variant === "team" ? copy.role : copy.category;

  return (
    <Reveal
      as="article"
      from={index % 2 === 0 ? "left" : "right"}
      delay={(index % 2) * 0.06}
    >
      <Link href={`/projects/${project.slug}`} className="group block">
        <ProjectVisual
          project={project}
          alt={project.title}
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 48vw, 44vw"
        />

        <div className="relative mt-6 flex items-baseline gap-4 pt-5">
          <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-border-strong" />
          <span
            aria-hidden
            className="absolute left-0 top-0 h-px w-full origin-left scale-x-0 bg-primary transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100"
          />
          <span className="index-num text-subtle-foreground transition-colors duration-300 group-hover:text-primary">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="text-2xl font-medium tracking-[-0.03em] transition-colors duration-300 group-hover:text-primary md:text-[1.75rem]">
            {project.title}
          </h3>
        </div>

        {meta ? <p className="label mt-3 pl-9">{meta}</p> : null}

        <p className="mt-3 max-w-md text-pretty pl-9 text-[0.9375rem] leading-relaxed text-muted-foreground">
          {copy.description}
        </p>

        <span className="mt-5 flex items-center gap-3 pl-9 text-[0.9375rem] font-medium">
          <span className="inline-flex items-center gap-2 transition-colors duration-300 group-hover:text-primary">
            {tWork("viewProject")}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1.5" />
          </span>
          {variant === "team" && project.domain ? (
            <span className="text-sm font-normal text-subtle-foreground">
              {project.domain}
            </span>
          ) : null}
        </span>
      </Link>
    </Reveal>
  );
}
