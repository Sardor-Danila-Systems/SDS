import { motion } from 'motion/react';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type ProjectCopy = { title: string; category: string; desc: string };

const PROJECT_ASSETS = [
  {
    tech: ['Framer Motion', 'Next JS', 'PostgreSQL'],
    img: '/oson-uy.png',
  },
  {
    tech: ['Next JS', 'Nest JS', 'PostgreSQL'],
    img: '/dashboard.png',
  },
  {
    tech: ['Next JS', 'PostgreSQL', 'Prisma'],
    img: '/kidscity.png',
  },
] as const;

export default function Portfolio() {
  const { t } = useTranslation();
  const copies = t('portfolio.projects', { returnObjects: true }) as ProjectCopy[];
  const projects = copies.map((copy, i) => ({
    ...copy,
    ...PROJECT_ASSETS[i],
  }));

  return (
    <section id="portfolio" className="scroll-mt-24 py-24 lg:py-32">
      <div className="container mx-auto px-6">
        <div className="mb-16 flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2 className="mb-4 font-heading text-4xl font-semibold tracking-tight lg:text-5xl">
              {t('portfolio.title')}
            </h2>
            <p className="text-lg text-muted-foreground">{t('portfolio.subtitle')}</p>
          </div>
          <Button variant="ghost" className="gap-2 px-0 font-semibold text-primary hover:bg-transparent hover:text-primary/90">
            {t('portfolio.viewAll')}
            <ExternalLink className="size-4" />
          </Button>
        </div>

        <div className="space-y-20 lg:space-y-28">
          {projects.map((project, i) => (
            <motion.article
              key={project.title}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className={`flex flex-col gap-10 lg:items-center ${i % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'}`}
            >
              <div className="w-full overflow-hidden rounded-2xl border border-border/80 bg-muted/10 shadow-xl lg:w-3/5">
                <button
                  type="button"
                  className="group block w-full cursor-default text-left"
                  aria-label={project.title}
                >
                  <img
                    src={project.img}
                    alt=""
                    className="aspect-video w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                  />
                </button>
              </div>
              <div className="w-full lg:w-2/5">
                <div className="mb-4 flex items-center gap-3">
                  <Badge variant="secondary" className="font-mono text-[10px] tracking-widest uppercase">
                    {project.category}
                  </Badge>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <h3 className="mb-4 font-heading text-3xl font-semibold tracking-tight">{project.title}</h3>
                <p className="mb-8 text-lg leading-relaxed text-muted-foreground">{project.desc}</p>
                <div className="mb-8 flex flex-wrap gap-2">
                  {project.tech.map((tag) => (
                    <span key={tag} className="tech-tag">
                      {tag}
                    </span>
                  ))}
                </div>
                <Button variant="outline" className="rounded-xl font-semibold" type="button">
                  {t('portfolio.more')}
                  <ExternalLink className="size-3.5" />
                </Button>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
