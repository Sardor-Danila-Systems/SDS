"use server";

import { revalidatePath } from "next/cache";
import {
  AuthzError,
  createIdeas,
  deleteIdea,
  ideaContext,
  listIdeas,
  setIdeaStatus,
  updateIdea,
  type IdeaInput,
} from "@/lib/crm/repo";
import { CrmStoreError } from "@/lib/crm/store";
import { aiEnabled, generateLocal, generateWithAi } from "@/lib/ideas/generator";
import {
  IDEA_CATEGORIES,
  IDEA_LEVELS,
  IDEA_STATUSES,
  type IdeaCategory,
  type IdeaLevel,
  type IdeaStatus,
  type IdeaStep,
} from "@/types/crm";

export type IdeaResult = { ok: true; info?: string } | { ok: false; error: string };

async function run(work: () => Promise<string | void>): Promise<IdeaResult> {
  try {
    const info = await work();
    revalidatePath("/admin/ideas");
    return { ok: true, info: info || undefined };
  } catch (error) {
    if (error instanceof AuthzError || error instanceof CrmStoreError) return { ok: false, error: error.message };
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось сохранить." };
  }
}

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined =>
  list.includes(value as T) ? (value as T) : undefined;

/** Generate a batch and put it straight on the board. */
export async function generateIdeasAction(input: {
  category: IdeaCategory | "ANY";
  count: number;
  mood: "practical" | "bold";
}): Promise<IdeaResult> {
  return run(async () => {
    const category = input.category === "ANY" ? "ANY" : oneOf(IDEA_CATEGORIES, input.category) ?? "ANY";
    const count = Math.min(Math.max(Math.round(input.count) || 3, 1), 8);
    const mood = input.mood === "bold" ? "bold" : "practical";

    const [context, existing] = await Promise.all([ideaContext(), listIdeas()]);
    const options = { category, count, mood, niches: context.niches, existingTitles: existing.map((i) => i.title) } as const;

    let ideas: IdeaInput[] = [];
    let note = "";
    if (aiEnabled()) {
      try {
        ideas = await generateWithAi({ ...options, niches: [...options.niches] , existingTitles: [...options.existingTitles] });
      } catch {
        note = " (ИИ не ответил, взяты встроенные идеи)";
      }
    }
    if (!ideas.length) ideas = generateLocal({ ...options, niches: [...options.niches], existingTitles: [...options.existingTitles] });
    if (!ideas.length) throw new Error("Новых идей в этом направлении больше нет. Попробуйте другое направление или добавьте свою.");

    await createIdeas(ideas);
    return `Добавлено идей: ${ideas.length}${note}`;
  });
}

export async function addIdeaAction(input: {
  title: string;
  description?: string;
  category?: IdeaCategory;
  effort?: IdeaLevel;
  impact?: IdeaLevel;
}): Promise<IdeaResult> {
  return run(async () => {
    await createIdeas([
      {
        title: input.title,
        description: input.description,
        category: oneOf(IDEA_CATEGORIES, input.category),
        effort: oneOf(IDEA_LEVELS, input.effort),
        impact: oneOf(IDEA_LEVELS, input.impact),
        source: "manual",
      },
    ]);
  });
}

export async function updateIdeaAction(
  ideaId: string,
  patch: {
    title?: string;
    description?: string;
    category?: IdeaCategory;
    effort?: IdeaLevel;
    impact?: IdeaLevel;
    notes?: string;
    favorite?: boolean;
    steps?: IdeaStep[];
  },
): Promise<IdeaResult> {
  return run(async () => {
    await updateIdea(ideaId, {
      ...patch,
      category: patch.category && oneOf(IDEA_CATEGORIES, patch.category),
      effort: patch.effort && oneOf(IDEA_LEVELS, patch.effort),
      impact: patch.impact && oneOf(IDEA_LEVELS, patch.impact),
    });
  });
}

export async function setIdeaStatusAction(ideaId: string, status: IdeaStatus): Promise<IdeaResult> {
  return run(async () => {
    const next = oneOf(IDEA_STATUSES, status);
    if (!next) throw new Error("Неизвестный статус.");
    await setIdeaStatus(ideaId, next);
  });
}

export async function deleteIdeaAction(ideaId: string): Promise<IdeaResult> {
  return run(async () => {
    await deleteIdea(ideaId);
  });
}
