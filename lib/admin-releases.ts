import type { TourStep } from "@/components/ui/product-tour";

/*
  "What's new" for the admin.

  To announce something: add a release to the TOP of this list with a new `id`.
  Everyone who has not seen that id gets a short guided tour the next time they
  open the admin; the rest of the history stays and can be replayed with the
  "Что нового" button. `target` is a CSS selector; mark elements with
  `data-tour="..."` (the navigation already does that for every link:
  `nav-ideas`, `nav-pipeline`, …). A step with no target, or a target that is
  not on screen (the phone menu is closed), is shown centred.
*/

export interface Release {
  id: string;
  title: string;
  steps: TourStep[];
}

export const RELEASES: Release[] = [
  {
    id: "2026-11-ideas",
    title: "Раздел «Идеи» и стабильная воронка",
    steps: [
      {
        title: "В админке новое",
        content: "Короткий обзор на минуту: появился раздел для идей и перестала «прыгать» воронка. Закрыть можно в любой момент клавишей Esc.",
        placement: "center",
      },
      {
        target: '[data-tour="nav-ideas"]',
        title: "Раздел «Идеи»",
        content: "Нажмите «Придумать идеи», и генератор предложит стратегии и эксперименты для студии. Нужные переводите в «Развивать», лишние убирайте, свои добавляйте вручную.",
        placement: "right",
      },
      {
        target: '[data-tour="nav-pipeline"]',
        title: "Воронка стала надёжнее",
        content: "Перенесённая карточка теперь остаётся на месте и после обновления страницы: данные CRM перешли на базу Neon, и сохранения больше не затирают друг друга.",
        placement: "right",
      },
      {
        title: "Подсказки всегда под рукой",
        content: "Кнопка «Что нового» вверху снова покажет этот обзор. Когда в админке появится что-то ещё, мы так же коротко расскажем при входе.",
        placement: "center",
      },
    ],
  },
];
