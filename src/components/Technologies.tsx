import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

const TECHS = [
  'React',
  'Next.js',
  'TypeScript',
  'Node.js',
  'PostgreSQL',
  'Tailwind CSS',
  'Flutter',
  'Docker',
] as const;

const list = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.045, delayChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0.35, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function Technologies() {
  const { t } = useTranslation();

  return (
    <section className="border-y border-border/80 py-16">
      <div className="container mx-auto px-6">
        <motion.p
          className="mb-10 text-center text-[10px] font-medium tracking-[0.28em] text-muted-foreground uppercase"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.4 }}
        >
          {t('technologies.label')}
        </motion.p>
        <motion.div
          className="flex flex-wrap justify-center gap-x-10 gap-y-6 opacity-55 transition-opacity duration-500 hover:opacity-100"
          variants={list}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
        >
          {TECHS.map((tech) => (
            <motion.span
              key={tech}
              variants={item}
              className="font-heading cursor-pointer text-xl font-semibold tracking-tight whitespace-nowrap text-foreground"
            >
              {tech}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
