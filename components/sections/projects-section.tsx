import { useTranslations } from "next-intl";
import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { Reveal } from "@/components/animations/reveal";
import { ProjectStream } from "./project-stream";
import { projectPlate } from "@/lib/project-plate";
import { projectCopy } from "@/lib/get-projects";
import { ProjectCard } from "@/components/projects/project-card";
import type { Locale, Project } from "@/types/project";

/**
 * The centre of the site.
 *
 * A plain two-column grid, every card the same shape: our own products first,
 * then the team's Dotlabs-era work under its own heading. Nothing is hidden
 * behind "show more" and nothing alternates sides — with seven projects the
 * whole body of work fits on one screenful of scrolling, and which caption
 * belongs to which picture is never a question.
 *
 * The two groups stay visually and verbally separate: the Dotlabs work is the
 * team's commercial experience, not SDS client work, and the caption above it
 * says so.
 *
 * Data comes from the DB via the server parent; `locale` is passed down so
 * each card can pick the right translation out of the project's `i18n` field.
 */
export function ProjectsSection({
  locale,
  products,
  commercialProjects,
}: {
  locale: Locale;
  products: Project[];
  commercialProjects: Project[];
}) {
  const t = useTranslations("Work");
  const tCommercial = useTranslations("Commercial");

  // Every project rides the corridor: real captures where we have them, a
  // drawn title card where we do not.
  const streamImages = [...products, ...commercialProjects].map((project, i) => {
    const capture = project.cover ?? project.images[0];
    return {
      src: capture
        ? capture.src
        : projectPlate(project.title, projectCopy(project, locale).category, i),
    };
  });

  return (
    <Section id="projects">
      <Container>
        <SectionHeading
          label={t("label")}
          title={t("title")}
          description={t("subtitle")}
        />

        {streamImages.length > 0 ? (
          <Reveal className="mt-10 lg:mt-12">
            <ProjectStream images={streamImages} />
          </Reveal>
        ) : null}

        <div className="mt-16 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:mt-12 lg:gap-x-10 lg:gap-y-14">
          {products.map((project, i) => (
            <ProjectCard
              key={project.slug}
              project={project}
              locale={locale}
              index={i}
              priority={i === 0}
            />
          ))}
        </div>

        {commercialProjects.length > 0 ? (
          <div className="mt-16 border-t border-border-strong pt-10 lg:mt-20 lg:pt-12">
            <Reveal from="left">
              <span className="label">{tCommercial("label")}</span>
              <h3 className="display-3 mt-4 max-w-2xl text-balance">
                {tCommercial("title")}
              </h3>
              <p className="mt-4 max-w-xl text-pretty text-[0.9375rem] leading-relaxed text-muted-foreground">
                {tCommercial("subtitle")}
              </p>
            </Reveal>

            <div className="mt-10 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:gap-x-10 lg:gap-y-14">
              {commercialProjects.map((project, i) => (
                <ProjectCard
                  key={project.slug}
                  project={project}
                  locale={locale}
                  index={i}
                  variant="team"
                />
              ))}
            </div>

            <Reveal>
              <p className="mt-12 max-w-xl text-sm leading-relaxed text-subtle-foreground">
                {tCommercial("disclaimer")}
              </p>
            </Reveal>
          </div>
        ) : null}
      </Container>
    </Section>
  );
}
