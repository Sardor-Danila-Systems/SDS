import "server-only";
import type { IdeaCategory, IdeaLevel } from "@/types/crm";
import type { IdeaInput } from "@/lib/crm/repo";

/*
  The idea generator.

  Two sources, one result shape:

  - built-in: a library of strategies with blanks (`{niche}`, `{n}`) filled from
    what the studio actually works with. Works with no setup and never repeats
    an idea that is already on the board.
  - AI: when ANTHROPIC_API_KEY is set, Claude is asked for fresh ideas. Only
    aggregate facts leave the server (the studio's own description, niche names,
    titles of ideas already on the board) — no client names, contacts or money.
*/

export interface GenerateOptions {
  category?: IdeaCategory | "ANY";
  count: number;
  /** "bold" leans towards unusual ideas, "practical" towards cheap and quick ones. */
  mood: "practical" | "bold";
  niches: string[];
  existingTitles: string[];
}

interface Seed {
  category: IdeaCategory;
  effort: IdeaLevel;
  impact: IdeaLevel;
  bold?: boolean;
  title: string;
  description: string;
  steps: string[];
}

const DEFAULT_NICHES = [
  "рестораны и кофейни",
  "стоматологии и клиники",
  "мебельные цеха",
  "автосалоны",
  "отели и гостевые дома",
  "учебные центры",
  "застройщики",
  "двери и окна",
];

const SEEDS: Seed[] = [
  // ---- sales
  {
    category: "SALES",
    effort: "LOW",
    impact: "HIGH",
    title: "Бесплатный разбор для сферы «{niche}» за 24 часа",
    description:
      "Берём 5 компаний из сферы «{niche}», в течение суток присылаем каждой короткий разбор: три места, где они теряют заявки, и как мы это закрываем. Не продаём, показываем, что видим.",
    steps: ["Выбрать 5 компаний и открыть их сайты и соцсети", "Записать по 3 потери заявок на каждую", "Отправить разбор в Telegram, без ссылки на цену", "Через 2 дня спросить, что из этого уже заметили"],
  },
  {
    category: "SALES",
    effort: "LOW",
    impact: "MEDIUM",
    title: "Демо на данных клиента до первой встречи",
    description:
      "Перед звонком собираем мини-демо с их названием, меню или прайсом и логотипом. На встрече открываем не презентацию, а их будущую систему.",
    steps: ["Найти публичные данные клиента", "Подставить их в готовое демо из sds-demo", "Показать на встрече с телефона"],
  },
  {
    category: "SALES",
    effort: "MEDIUM",
    impact: "HIGH",
    title: "Оплата по результату: первые 30 дней по цене пилота",
    description:
      "Для «{niche}» предлагаем пилот на месяц по сниженной цене и общую метрику успеха (например, число заявок). Если метрика не растёт, продолжение обсуждаем заново.",
    steps: ["Определить метрику для сферы «{niche}»", "Подготовить условия пилота на одну страницу", "Предложить трём тёплым лидам", "Записать результат в кейс"],
  },
  {
    category: "SALES",
    effort: "LOW",
    impact: "MEDIUM",
    title: "Голосовое вместо письма: 30 секунд в холодном контакте",
    description:
      "Вместо длинного сообщения новым контактам отправляем короткое голосовое: кто мы, что заметили у них, один конкретный вопрос. Живой голос отвечает лучше текста.",
    steps: ["Написать план на 30 секунд", "Записать 10 голосовых разным людям", "Сравнить ответы с текстовыми сообщениями за неделю"],
  },
  {
    category: "SALES",
    effort: "MEDIUM",
    impact: "HIGH",
    bold: true,
    title: "«Ночной менеджер»: показываем, сколько заявок они теряют после 22:00",
    description:
      "Делаем тест: пишем в компанию из сферы «{niche}» ночью и после обеда в выходной, фиксируем, ответили или нет. Результат показываем владельцу цифрой, и это открывает разговор про бота.",
    steps: ["Написать в 20 компаний вечером и ночью", "Посчитать время ответа и долю без ответа", "Собрать картинку с цифрами для разговора"],
  },
  {
    category: "SALES",
    effort: "LOW",
    impact: "MEDIUM",
    title: "Реферальный бонус клиентам: месяц поддержки за приведённого друга",
    description:
      "Если клиент привёл другую компанию, которая стала клиентом, даём ему месяц поддержки бесплатно. Клиентам из одной сферы доверяют друг другу охотнее, чем рекламе.",
    steps: ["Сформулировать условия в двух строках", "Отправить действующим клиентам", "Заводить в CRM источник «рекомендация»"],
  },
  // ---- marketing
  {
    category: "MARKETING",
    effort: "MEDIUM",
    impact: "HIGH",
    title: "Серия «Как это выглядит у вас»: демо для одной ниши в неделю",
    description:
      "Каждую неделю публикуем короткое видео: демо для новой сферы (например, «{niche}») и три фразы о том, что оно меняет в работе владельца. Календарь на 8 недель уже лежит в наших демо.",
    steps: ["Составить календарь на 8 недель по нишам", "Снять экран демо с озвучкой", "Выкладывать по вторникам в Instagram и Telegram", "Считать переходы на sd-s.uz"],
  },
  {
    category: "MARKETING",
    effort: "LOW",
    impact: "MEDIUM",
    title: "Кейс на одной странице после каждого проекта",
    description:
      "После запуска делаем страницу: что было, что сделали, цифра до и после, цитата владельца. Одним форматом, чтобы собирать быстро и показывать на встречах.",
    steps: ["Сделать шаблон кейса", "Попросить цифры и цитату у последнего клиента", "Добавить кейсы в портфолио на сайте"],
  },
  {
    category: "MARKETING",
    effort: "HIGH",
    impact: "HIGH",
    bold: true,
    title: "Бесплатный мини-инструмент для «{niche}» как магнит для заявок",
    description:
      "Делаем маленький полезный инструмент без регистрации (калькулятор окупаемости бота, проверка скорости ответа, генератор меню) и ведём из него на консультацию. Люди делятся им сами.",
    steps: ["Выбрать боль из разговоров с клиентами", "Собрать инструмент за неделю", "Запустить в Telegram-каналах сферы «{niche}»", "Собирать контакты тех, кто дошёл до результата"],
  },
  {
    category: "MARKETING",
    effort: "LOW",
    impact: "MEDIUM",
    title: "Закреплённый пост «Что мы сделали за неделю»",
    description:
      "Раз в неделю публикуем короткий отчёт: сколько заявок прошло через наши системы клиентов, что запустили. Показывает, что студия живая и работает, а не только обещает.",
    steps: ["Брать цифры из аналитики", "Писать пост по пятницам", "Закреплять на неделю"],
  },
  // ---- product
  {
    category: "PRODUCT",
    effort: "HIGH",
    impact: "HIGH",
    title: "Готовый «пакет под ключ» для сферы «{niche}» с фиксированной ценой",
    description:
      "Сайт, бот, CRM и обучение сотрудников одним пакетом с понятным сроком (например, 14 дней) и ценой. Клиенту проще решиться, нам проще делать: всё собрано из готовых блоков.",
    steps: ["Собрать состав пакета из проектов, которые уже делали", "Назвать срок и цену", "Сделать страницу пакета на сайте", "Продать первые три"],
  },
  {
    category: "PRODUCT",
    effort: "MEDIUM",
    impact: "HIGH",
    title: "Ежемесячный отчёт владельцу в Telegram, который собирается сам",
    description:
      "Раз в месяц бот присылает владельцу: сколько обращений, записей, выручка, где просело. Это наша «сервисная подписка», которую жалко отключать.",
    steps: ["Определить 5 главных цифр", "Собрать шаблон отчёта", "Подключить к действующим клиентам", "Предложить платный тариф с разбором"],
  },
  {
    category: "PRODUCT",
    effort: "MEDIUM",
    impact: "MEDIUM",
    bold: true,
    title: "Голосовой помощник для сферы «{niche}», который звонит и напоминает",
    description:
      "Для сферы «{niche}» делаем помощника, который сам звонит с напоминаниями о записи или оплате и пишет итог в CRM. Снимает самую скучную работу у администратора.",
    steps: ["Описать сценарий звонка на одной странице", "Проверить на 20 тестовых вызовах", "Предложить как дополнение к CRM"],
  },
  {
    category: "PRODUCT",
    effort: "LOW",
    impact: "MEDIUM",
    title: "Библиотека готовых блоков: форма заявки, бронь, каталог, калькулятор",
    description:
      "Складываем то, что уже писали, в одну библиотеку с превью. Новый проект собирается из неё за дни, а не недели.",
    steps: ["Пройти последние 5 проектов и выписать повторяющиеся блоки", "Вынести их в отдельный репозиторий", "Сделать страницу с превью блоков"],
  },
  // ---- clients
  {
    category: "CLIENTS",
    effort: "LOW",
    impact: "HIGH",
    title: "Звонок через 30 дней после запуска: «что вам мешает»",
    description:
      "Через месяц после сдачи проекта звоним клиенту и спрашиваем не «всё ли нравится», а «что вы бы поменяли». Из ответов вырастают доработки и продажа второго этапа.",
    steps: ["Поставить напоминание в CRM на +30 дней", "Подготовить 3 вопроса", "Записывать ответы в карточку клиента"],
  },
  {
    category: "CLIENTS",
    effort: "LOW",
    impact: "MEDIUM",
    title: "Подарок к годовщине сотрудничества: мини-аудит и скидка на доработки",
    description:
      "Через год присылаем клиенту короткий отчёт: что было сделано, какие цифры выросли, что стоит улучшить. С персональным предложением на доработки.",
    steps: ["Брать дату запуска из карточки проекта", "Собирать отчёт из аналитики", "Отправить в Telegram"],
  },
  {
    category: "CLIENTS",
    effort: "MEDIUM",
    impact: "HIGH",
    title: "Закрытый чат клиентов одной сферы: обмен практиками",
    description:
      "Собираем владельцев из сферы «{niche}» в закрытый чат: делятся, что работает. Мы модерируем и иногда показываем новое. Клиенты остаются, потому что полезно.",
    steps: ["Спросить у 5 клиентов, нужен ли им такой чат", "Создать чат и правила", "Раз в неделю запускать тему"],
  },
  // ---- team
  {
    category: "TEAM",
    effort: "LOW",
    impact: "MEDIUM",
    title: "Пятничные 30 минут: показать, что сделал за неделю",
    description:
      "Каждый в команде коротко показывает одну рабочую вещь, которой гордится. Видно, кто чем занят, и растёт общее качество.",
    steps: ["Поставить встречу на пятницу", "Правило: только показ, без обсуждения проблем", "Записывать идеи, которые появились"],
  },
  {
    category: "TEAM",
    effort: "MEDIUM",
    impact: "MEDIUM",
    bold: true,
    title: "День без созвонов раз в неделю",
    description:
      "Один день в неделю у всех без встреч, только глубокая работа. Проверяем месяц и смотрим, сколько стало закрытых задач.",
    steps: ["Выбрать день", "Предупредить клиентов", "Сравнить закрытые задачи до и после"],
  },
  {
    category: "TEAM",
    effort: "LOW",
    impact: "LOW",
    title: "Доска «Мы это уже умеем»: что можно переиспользовать",
    description:
      "Общая страница, куда добавляют решения, которые пригодятся в других проектах. Через полгода это станет библиотекой.",
    steps: ["Создать страницу", "Добавлять после каждого проекта", "Раз в квартал разбирать"],
  },
  // ---- process
  {
    category: "PROCESS",
    effort: "LOW",
    impact: "HIGH",
    title: "Ответ на заявку за 15 минут: правило и напоминание",
    description:
      "Любая новая заявка получает первый ответ за 15 минут в рабочее время. CRM напоминает, если время вышло. Скорость первого ответа сильнее всего влияет на закрытие.",
    steps: ["Поставить правило в CRM", "Включить уведомление при просрочке", "Раз в неделю смотреть среднее время ответа"],
  },
  {
    category: "PROCESS",
    effort: "MEDIUM",
    impact: "MEDIUM",
    title: "Шаблон предложения с тремя вариантами цены",
    description:
      "Каждое предложение отправляем в трёх вариантах: базовый, оптимальный и расширенный. Клиент выбирает из рамки, а не оценивает «дорого или нет».",
    steps: ["Подготовить структуру из трёх вариантов", "Использовать в двух ближайших предложениях", "Сравнить средний чек"],
  },
  {
    category: "PROCESS",
    effort: "LOW",
    impact: "MEDIUM",
    title: "Чек-лист запуска проекта на одну страницу",
    description:
      "Перед запуском проходим один и тот же список: домены, бэкапы, аналитика, формы, мобильная версия, уведомления. Ошибки на старте дороже всего.",
    steps: ["Собрать чек-лист из прошлых ошибок", "Хранить рядом с проектом", "Обновлять после каждого запуска"],
  },
  // ---- partners
  {
    category: "PARTNERS",
    effort: "MEDIUM",
    impact: "HIGH",
    title: "Партнёрство с бухгалтерами и юристами малого бизнеса",
    description:
      "Эти люди знают всех владельцев в городе и часто слышат «нам нужна автоматизация». Договариваемся о вознаграждении за каждого клиента, которого они привели.",
    steps: ["Составить список из 15 бухгалтеров и юристов", "Подготовить короткое предложение партнёрам", "Договориться о 3 встречах"],
  },
  {
    category: "PARTNERS",
    effort: "LOW",
    impact: "MEDIUM",
    title: "Совместный вебинар с поставщиками для сферы «{niche}»",
    description:
      "Поставщики оборудования и сервисов уже собирают нужную нам аудиторию. Делаем совместный разбор: как автоматизация экономит время в сфере «{niche}».",
    steps: ["Найти 3 крупных поставщика", "Предложить формат на 40 минут", "Собрать список участников и контакты"],
  },
  {
    category: "PARTNERS",
    effort: "HIGH",
    impact: "HIGH",
    bold: true,
    title: "Белая марка для маленьких студий: мы делаем, они продают",
    description:
      "Маленькие веб-студии и фрилансеры продают сайты, но не умеют CRM и ботов. Предлагаем делать это под их брендом, а доход делим.",
    steps: ["Описать условия сотрудничества", "Найти 5 студий и фрилансеров в городе", "Сделать пробный проект вместе"],
  },
];

const fill = (text: string, niche: string) => text.replaceAll("{niche}", niche);

const shuffle = <T,>(items: T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The built-in generator. Returns fewer than `count` when the board already holds most of the library. */
export function generateLocal(options: GenerateOptions): IdeaInput[] {
  const niches = options.niches.length ? options.niches : DEFAULT_NICHES;
  const pool = SEEDS.filter(
    (s) => (options.category === "ANY" || !options.category || s.category === options.category) && (options.mood === "bold" ? true : !s.bold),
  );
  const boldFirst = options.mood === "bold" ? [...shuffle(pool.filter((s) => s.bold)), ...shuffle(pool.filter((s) => !s.bold))] : shuffle(pool);

  const out: IdeaInput[] = [];
  for (const seed of boldFirst) {
    if (out.length >= options.count) break;
    const niche = shuffle(niches)[0];
    const title = fill(seed.title, niche);
    // the same idea under any niche counts as already present
    const taken = options.existingTitles.some((t) => same(t, title) || DEFAULT_NICHES.concat(niches).some((n) => same(t, fill(seed.title, n))));
    if (taken || out.some((o) => same(o.title, title))) continue;
    out.push({
      title,
      description: fill(seed.description, niche),
      category: seed.category,
      effort: seed.effort,
      impact: seed.impact,
      steps: seed.steps.map((st) => fill(st, niche)),
      source: "generator",
    });
  }
  return out;
}

/* ---------------------------------- AI ---------------------------------- */

const CATEGORY_RU: Record<IdeaCategory, string> = {
  SALES: "продажи",
  MARKETING: "маркетинг",
  PRODUCT: "продукт",
  CLIENTS: "работа с клиентами",
  TEAM: "команда",
  PROCESS: "процессы",
  PARTNERS: "партнёрства",
};

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const LEVELS = new Set(["LOW", "MEDIUM", "HIGH"]);
const CATEGORIES = new Set(Object.keys(CATEGORY_RU));

/** Ask Claude for fresh ideas. Throws on any failure so the caller can fall back to the built-in generator. */
export async function generateWithAi(options: GenerateOptions): Promise<IdeaInput[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY не задан");

  const niches = options.niches.length ? options.niches : DEFAULT_NICHES;
  const prompt = `Ты придумываешь идеи для небольшой студии из Самарканда (Узбекистан), которая делает CRM, сайты, мобильные приложения, Telegram-боты и AI-менеджеров для малого бизнеса. Команда из двух-трёх человек, продают владельцам бизнеса напрямую.

Сферы клиентов: ${niches.join(", ")}.
Направление: ${options.category && options.category !== "ANY" ? CATEGORY_RU[options.category] : "любое"}.
Настроение: ${options.mood === "bold" ? "смелые и необычные идеи, которые отличают студию от других" : "практичные идеи, которые можно проверить за неделю дёшево"}.

Уже есть на доске (не повторяй и не перефразируй): ${options.existingTitles.slice(0, 40).join("; ") || "ничего"}.

Верни ровно ${options.count} идей. Только JSON-массив, без текста вокруг. Каждый элемент:
{"title": "до 90 символов", "description": "2–3 предложения, конкретно, без воды", "category": "SALES|MARKETING|PRODUCT|CLIENTS|TEAM|PROCESS|PARTNERS", "effort": "LOW|MEDIUM|HIGH", "impact": "LOW|MEDIUM|HIGH", "steps": ["3–4 конкретных шага"]}
Пиши по-русски, коротко и по делу. Без общих советов вроде «улучшить сервис».`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Claude API: ${res.status}`);

  const payload = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = payload.content?.filter((c) => c.type === "text").map((c) => c.text).join("") ?? "";
  const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  const rows = JSON.parse(json) as Record<string, unknown>[];

  return rows
    .filter((r) => typeof r.title === "string" && r.title.trim())
    .slice(0, options.count)
    .map((r) => ({
      title: String(r.title),
      description: typeof r.description === "string" ? r.description : "",
      category: (CATEGORIES.has(String(r.category)) ? r.category : options.category && options.category !== "ANY" ? options.category : "SALES") as IdeaCategory,
      effort: (LEVELS.has(String(r.effort)) ? r.effort : "MEDIUM") as IdeaLevel,
      impact: (LEVELS.has(String(r.impact)) ? r.impact : "MEDIUM") as IdeaLevel,
      steps: Array.isArray(r.steps) ? r.steps.map(String) : [],
      source: "ai" as const,
    }))
    .filter((idea) => !options.existingTitles.some((t) => same(t, idea.title)));
}
