/*
  The choices the contact form offers. Shared by the form (which shows them
  translated) and the server (which accepts only these keys and files them in
  the CRM with the Russian labels the team reads).
*/

export const SERVICES = ["website", "shop", "crm", "mobile", "automation", "other"] as const;
export type Service = (typeof SERVICES)[number];

export const BUDGETS = ["lt2", "b2_5", "b5_15", "gt15", "unknown"] as const;
export type Budget = (typeof BUDGETS)[number];

export const CHANNELS = ["telegram", "email", "phone"] as const;
export type Channel = (typeof CHANNELS)[number];

export const SERVICE_LABEL_RU: Record<Service, string> = {
  website: "Сайт",
  shop: "Интернет-магазин",
  crm: "CRM / ERP",
  mobile: "Мобильное приложение",
  automation: "Автоматизация",
  other: "Другое",
};

export const BUDGET_LABEL_RU: Record<Budget, string> = {
  lt2: "до $2 000",
  b2_5: "$2 000 – 5 000",
  b5_15: "$5 000 – 15 000",
  gt15: "от $15 000",
  unknown: "пока не знаю",
};
