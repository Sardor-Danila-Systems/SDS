import { motion } from 'motion/react';
import { Instagram, Mail, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function Contact() {
  const { t } = useTranslation();

  const telegramLink = 'https://t.me/sardor_system_solutions';
  const instagramLink = 'https://www.instagram.com/sardor_danila_systems/';
  const phoneNumber = 'tel:+998883928811';
  return (
    <section id="contact" className="scroll-mt-24 py-24 lg:pb-32">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-4xl"
        >
          <Card className="overflow-hidden border-primary/25 bg-linear-to-br from-primary/15 via-card/80 to-card/40 p-px shadow-2xl">
            <CardContent className="relative rounded-xl bg-background/95 px-8 py-14 text-center md:px-16 md:py-20">
              <div
                className="pointer-events-none absolute -top-32 -left-24 size-72 rounded-full bg-primary/20 blur-3xl"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -right-24 -bottom-32 size-72 rounded-full bg-primary/15 blur-3xl"
                aria-hidden
              />

              <div className="relative z-10">
                <h2 className="mb-6 font-heading text-4xl font-semibold tracking-tight md:text-5xl">
                  {t('contact.title')}
                </h2>
                <p className="mx-auto mb-10 max-w-xl text-lg text-muted-foreground">{t('contact.subtitle')}</p>

                <div className="flex flex-wrap justify-center gap-3">
                  <Button onClick={() => {}} size="lg" className="h-11 rounded-xl px-6 font-semibold">
                    <Send className="size-4" />
                    {t('contact.telegram')}
                  </Button>
                  <Button onClick={() => {}} variant="outline" size="lg" className="h-11 rounded-xl border-border/80 px-6 font-semibold">
                    <Instagram className="size-4" />
                    {t('contact.instagram')}
                  </Button>
                  <Button onClick={() => {}} variant="outline" size="lg" className="h-11 rounded-xl border-border/80 px-6 font-semibold">
                    <Mail className="size-4" />
                    {t('contact.email')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
