import "server-only";
import { requirePermission } from "@/lib/crm/repo";

/*
  Developer performance: who worked how much, from Jira and GitHub.

  Both sources are read server-side with tokens from the environment; nothing
  here reaches the browser. A missing token disables that source and the page
  says so — it never fails as a whole.

  People are matched across systems through PERF_PEOPLE, a JSON array like
    [{"name":"Даня","github":"DanyaNextgen","jira":"Danila","aliases":["frozzen1337","Danya"]}]
  `aliases` are any other names the person commits or logs time under (a git
  author name that is not linked to the GitHub account shows up as its own
  name). Matching ignores case.
  Anyone not listed still appears, under their own GitHub login or Jira name.
*/

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export interface PersonStats {
  name: string;
  github?: string;
  commits: number;
  prsMerged: number;
  jiraDone: number;
  jiraInProgress: number;
  /** GitHub issues the person opened inside the period. */
  issuesOpened: number;
  /** GitHub issues closed inside the period, credited to the assignee (else the author). */
  issuesClosed: number;
  /** GitHub issues open right now that are on the person (assignee, else author). */
  issuesOpen: number;
  /** Comments on issues and PRs inside the period. */
  comments: number;
  /** Hours logged in Jira worklogs inside the period. */
  hoursLogged: number;
  /** Last activity (commit or Jira resolution), ISO. */
  lastActive?: string;
}

type NumKey =
  | "commits"
  | "prsMerged"
  | "jiraDone"
  | "jiraInProgress"
  | "hoursLogged"
  | "issuesOpened"
  | "issuesClosed"
  | "issuesOpen"
  | "comments";

export interface SourceStatus {
  ok: boolean;
  /** Why the source is empty, in Russian, for the page. */
  note?: string;
}

export interface PerformanceData {
  period: Period;
  since: string;
  people: PersonStats[];
  github: SourceStatus;
  jira: SourceStatus;
  totals: Pick<PersonStats, NumKey>;
  /** Commits per day, oldest first, for the activity strip. */
  daily: { date: string; commits: number }[];
  generatedAt: string;
}

export interface PersonMap {
  name: string;
  github?: string;
  jira?: string;
  aliases?: string[];
}

export function personMap(): PersonMap[] {
  try {
    const raw = JSON.parse(process.env.PERF_PEOPLE ?? "[]");
    return Array.isArray(raw) ? (raw as PersonMap[]) : [];
  } catch {
    return [];
  }
}

/* --------------------------------- helpers -------------------------------- */

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

export async function getJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`${new URL(url).host}: ${res.status}`);
  return (await res.json()) as T;
}

/* ---------------------------------- GitHub -------------------------------- */

interface GhCommit {
  author: { login: string } | null;
  commit: { author: { name: string; date: string } };
}
interface GhPull {
  merged_at: string | null;
  user: { login: string } | null;
}

interface GhIssue {
  user: { login: string } | null;
  assignees?: { login: string }[];
  state: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  pull_request?: unknown;
}
interface GhComment {
  user: { login: string } | null;
}

interface GithubResult {
  issuesOpened: Map<string, number>;
  issuesClosed: Map<string, number>;
  issuesOpen: Map<string, number>;
  comments: Map<string, number>;
  commits: Map<string, number>;
  prs: Map<string, number>;
  last: Map<string, string>;
  daily: Map<string, number>;
}

async function loadGithub(since: string): Promise<GithubResult> {
  const token = process.env.GITHUB_TOKEN;
  const org = process.env.GITHUB_ORG;
  if (!token || !org) throw new Error("Не заданы GITHUB_TOKEN и GITHUB_ORG.");

  const init: RequestInit = {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  };
  const api = "https://api.github.com";
  const repos = await getJson<{ name: string; archived: boolean }[]>(
    `${api}/orgs/${org}/repos?per_page=100&sort=pushed`,
    init,
  );
  const live = repos.filter((r) => !r.archived);

  const result: GithubResult = {
    commits: new Map(),
    prs: new Map(),
    last: new Map(),
    daily: new Map(),
    issuesOpened: new Map(),
    issuesClosed: new Map(),
    issuesOpen: new Map(),
    comments: new Map(),
  };
  const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1);

  // Busy repos pass 100 commits a month, so walk the pages (capped at 10).
  const commitsOf = async (repo: string) => {
    const all: GhCommit[] = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await getJson<GhCommit[]>(
        `${api}/repos/${org}/${repo}/commits?since=${since}&per_page=100&page=${page}`,
        init,
      ).catch(() => [] as GhCommit[]); // empty repo answers 409
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  };
  // Closed PRs come newest-updated first; stop once a page is entirely older than the period.
  const pullsOf = async (repo: string) => {
    const all: GhPull[] = [];
    for (let page = 1; page <= 5; page++) {
      const batch = await getJson<(GhPull & { updated_at: string })[]>(
        `${api}/repos/${org}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`,
        init,
      ).catch(() => [] as (GhPull & { updated_at: string })[]);
      all.push(...batch);
      if (batch.length < 100 || batch.every((p) => p.updated_at < since)) break;
    }
    return all;
  };

  // Generic paginated list (capped at `max` pages); errors read as empty.
  const pages = async <T,>(url: string, max = 5) => {
    const all: T[] = [];
    for (let page = 1; page <= max; page++) {
      const batch = await getJson<T[]>(`${url}&per_page=100&page=${page}`, init).catch(() => [] as T[]);
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  };

  await mapLimit(live, 5, async (repo) => {
    const base = `${api}/repos/${org}/${repo.name}`;
    const [commits, pulls, touched, open, comments] = await Promise.all([
      commitsOf(repo.name),
      pullsOf(repo.name),
      // `since` filters by last update, which covers anything opened or closed in the period.
      pages<GhIssue>(`${base}/issues?state=all&since=${since}`),
      pages<GhIssue>(`${base}/issues?state=open`),
      pages<GhComment>(`${base}/issues/comments?since=${since}`, 10),
    ]);
    const issueOwner = (i: GhIssue) => i.assignees?.[0]?.login ?? i.user?.login;
    for (const i of touched) {
      if (i.pull_request) continue; // the issues API also returns PRs
      if (i.user && i.created_at >= since) bump(result.issuesOpened, i.user.login);
      const who = issueOwner(i);
      if (who && i.state === "closed" && i.closed_at && i.closed_at >= since) bump(result.issuesClosed, who);
    }
    for (const i of open) {
      const who = issueOwner(i);
      if (who && !i.pull_request) bump(result.issuesOpen, who);
    }
    for (const c of comments) if (c.user && !c.user.login.endsWith("[bot]")) bump(result.comments, c.user.login);
    for (const c of commits) {
      const who = c.author?.login ?? c.commit.author.name;
      bump(result.commits, who);
      bump(result.daily, c.commit.author.date.slice(0, 10));
      const prev = result.last.get(who);
      if (!prev || c.commit.author.date > prev) result.last.set(who, c.commit.author.date);
    }
    for (const p of pulls) {
      if (p.merged_at && p.merged_at >= since && p.user) bump(result.prs, p.user.login);
    }
  });
  return result;
}

/* ----------------------------------- Jira --------------------------------- */

interface JiraIssue {
  key: string;
  fields: {
    assignee: { displayName: string } | null;
    status: { statusCategory: { key: string } };
    resolutiondate: string | null;
    timespent: number | null;
  };
}

export interface JiraHistory {
  created: string;
  items: { field: string; from: string | null; to: string | null; toString: string | null; fromString: string | null }[];
}

/**
  Who actually did a Jira issue: the assignee at the moment it first entered a
  status of the "in progress" category. The team reassigns finished work to
  the reviewer before closing it, so the current assignee is not the author.
  Returns undefined when the issue never started with someone on it.
*/
export function jiraDoer(
  histories: JiraHistory[],
  categoryOf: Map<string, string>,
  currentAssignee?: string,
): string | undefined {
  const sorted = [...histories].sort((a, b) => a.created.localeCompare(b.created));
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  // Replay assignee changes; the "from" of the first change is the original assignee.
  const firstAssign = sorted.flatMap((h) => h.items).find((it) => it.field === "assignee");
  let assignee = firstAssign ? str(firstAssign.fromString) : currentAssignee;
  for (const h of sorted) {
    for (const it of h.items) if (it.field === "assignee") assignee = str(it.toString);
    const started = h.items.some((it) => it.field === "status" && it.to && categoryOf.get(it.to) === "indeterminate");
    if (started && assignee) return assignee;
  }
  return undefined;
}

export interface JiraResult {
  done: Map<string, number>;
  inProgress: Map<string, number>;
  hours: Map<string, number>;
  last: Map<string, string>;
}

async function loadJira(sinceDate: string, since: string): Promise<JiraResult> {
  const base = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!base || !email || !token) throw new Error("Не заданы JIRA_BASE_URL, JIRA_EMAIL и JIRA_API_TOKEN.");

  const init: RequestInit = {
    headers: {
      Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
      Accept: "application/json",
    },
  };
  const projects = (process.env.JIRA_PROJECTS ?? "DEV").split(",").map((p) => p.trim()).filter(Boolean);
  const jql = `project in (${projects.join(",")}) AND (updated >= "${sinceDate}" OR statusCategory = "In Progress") ORDER BY updated DESC`;

  const issues: JiraIssue[] = [];
  let token_: string | undefined;
  do {
    const qs = new URLSearchParams({
      jql,
      maxResults: "100",
      fields: "assignee,status,resolutiondate,timespent",
    });
    if (token_) qs.set("nextPageToken", token_);
    const page = await getJson<{ issues: JiraIssue[]; nextPageToken?: string; isLast?: boolean }>(
      `${base}/rest/api/3/search/jql?${qs}`,
      init,
    );
    issues.push(...page.issues);
    token_ = page.isLast ? undefined : page.nextPageToken;
  } while (token_ && issues.length < 1000);

  const r: JiraResult = { done: new Map(), inProgress: new Map(), hours: new Map(), last: new Map() };
  const add = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

  /*
    The team hands finished work to the reviewer (the PM) before closing it:
    the issue is reassigned to him and he moves it to Done. Crediting the
    current assignee would give him everyone's tasks. The developer is the
    person the issue was assigned to when it first entered an "in progress"
    status; without such a transition, the current assignee stands.
  */
  const categoryOf = new Map<string, string>();
  try {
    const statuses = await getJson<{ id: string; statusCategory: { key: string } }[]>(`${base}/rest/api/3/status`, init);
    for (const st of statuses) categoryOf.set(st.id, st.statusCategory.key);
  } catch {
    // Without the status map every issue falls back to its current assignee.
  }
  const counted = issues.filter((i) => {
    const c = i.fields.status.statusCategory.key;
    return c === "indeterminate" || (c === "done" && !!i.fields.resolutiondate && i.fields.resolutiondate >= since);
  });
  const doer = new Map<string, string>();
  await mapLimit(categoryOf.size ? counted : [], 6, async (issue) => {
    const histories: JiraHistory[] = [];
    for (let startAt = 0; startAt < 500; startAt += 100) {
      const page = await getJson<{ values: JiraHistory[]; isLast?: boolean; total?: number }>(
        `${base}/rest/api/3/issue/${issue.key}/changelog?startAt=${startAt}&maxResults=100`,
        init,
      ).catch(() => null);
      if (!page) return;
      histories.push(...page.values);
      if (page.isLast !== false || page.values.length < 100) break;
    }
    const who = jiraDoer(histories, categoryOf, issue.fields.assignee?.displayName);
    if (who) doer.set(issue.key, who);
  });

  for (const issue of issues) {
    const who = doer.get(issue.key) ?? issue.fields.assignee?.displayName;
    if (!who) continue;
    const category = issue.fields.status.statusCategory.key;
    if (category === "done" && issue.fields.resolutiondate && issue.fields.resolutiondate >= since) {
      add(r.done, who);
      const prev = r.last.get(who);
      if (!prev || issue.fields.resolutiondate > prev) r.last.set(who, issue.fields.resolutiondate);
    } else if (category === "indeterminate") {
      add(r.inProgress, who);
    }
  }

  // Real time comes from worklogs (who logged it, when), not from the issue
  // total, which would credit old hours to whoever holds the issue now.
  const withTime = issues.filter((i) => (i.fields.timespent ?? 0) > 0);
  await mapLimit(withTime, 6, async (issue) => {
    const data = await getJson<{ worklogs: { author: { displayName: string }; started: string; timeSpentSeconds: number }[] }>(
      `${base}/rest/api/3/issue/${issue.key}/worklog`,
      init,
    ).catch(() => ({ worklogs: [] }));
    for (const w of data.worklogs) {
      if (new Date(w.started).toISOString() >= since) add(r.hours, w.author.displayName, w.timeSpentSeconds / 3600);
    }
  });
  return r;
}

/* ---------------------------------- public -------------------------------- */

export async function buildPerformance(period: Period): Promise<PerformanceData> {
  await requirePermission("team.view");

  const sinceMs = Date.now() - period * 86_400_000;
  const since = new Date(sinceMs).toISOString();
  const sinceDate = since.slice(0, 10);

  const [gh, jira] = await Promise.allSettled([loadGithub(since), loadJira(sinceDate, since)]);
  const status = (r: PromiseSettledResult<unknown>): SourceStatus =>
    r.status === "fulfilled" ? { ok: true } : { ok: false, note: (r.reason as Error).message };

  const g = gh.status === "fulfilled" ? gh.value : null;
  const j = jira.status === "fulfilled" ? jira.value : null;

  // One row per person: mapped identities first, leftovers under their own name.
  const people = new Map<string, PersonStats>();
  const row = (name: string) => {
    let p = people.get(name);
    if (!p)
      people.set(
        name,
        (p = {
          name,
          commits: 0,
          prsMerged: 0,
          jiraDone: 0,
          jiraInProgress: 0,
          hoursLogged: 0,
          issuesOpened: 0,
          issuesClosed: 0,
          issuesOpen: 0,
          comments: 0,
        }),
      );
    return p;
  };
  const mapped = personMap();
  const owner = (id: string) => {
    const key = id.toLowerCase();
    const hit = mapped.find((m) =>
      [m.name, m.github, m.jira, ...(m.aliases ?? [])].some((v) => v?.toLowerCase() === key),
    );
    return hit?.name ?? id;
  };
  const ghOwner = owner;
  const jiraOwner = owner;
  const later = (a?: string, b?: string) => (!a || (b && b > a) ? b : a);

  for (const [login, n] of g?.commits ?? []) {
    const p = row(ghOwner(login));
    p.commits += n;
    p.github ??= mapped.find((m) => m.name === p.name)?.github ?? login;
    p.lastActive = later(p.lastActive, g!.last.get(login));
  }
  for (const [login, n] of g?.prs ?? []) row(ghOwner(login)).prsMerged += n;
  for (const [login, n] of g?.issuesOpened ?? []) row(ghOwner(login)).issuesOpened += n;
  for (const [login, n] of g?.issuesClosed ?? []) row(ghOwner(login)).issuesClosed += n;
  for (const [login, n] of g?.issuesOpen ?? []) row(ghOwner(login)).issuesOpen += n;
  for (const [login, n] of g?.comments ?? []) row(ghOwner(login)).comments += n;
  for (const [who, n] of j?.done ?? []) {
    const p = row(jiraOwner(who));
    p.jiraDone += n;
    p.lastActive = later(p.lastActive, j!.last.get(who));
  }
  for (const [who, n] of j?.inProgress ?? []) row(jiraOwner(who)).jiraInProgress += n;
  for (const [who, h] of j?.hours ?? []) row(jiraOwner(who)).hoursLogged += h;

  const score = (p: PersonStats) => p.commits + p.jiraDone * 3 + p.prsMerged * 2 + p.issuesClosed * 2;
  const list = [...people.values()]
    .map((p) => ({ ...p, hoursLogged: Math.round(p.hoursLogged * 10) / 10 }))
    .sort((a, b) => score(b) - score(a));

  const daily = Array.from({ length: period }, (_, i) => {
    const date = new Date(sinceMs + (i + 1) * 86_400_000).toISOString().slice(0, 10);
    return { date, commits: g?.daily.get(date) ?? 0 };
  });

  const sum = (k: NumKey) =>
    Math.round(list.reduce((a, p) => a + p[k], 0) * 10) / 10;

  return {
    period,
    since,
    people: list,
    github: status(gh),
    jira: status(jira),
    totals: {
      commits: sum("commits"),
      prsMerged: sum("prsMerged"),
      jiraDone: sum("jiraDone"),
      jiraInProgress: sum("jiraInProgress"),
      hoursLogged: sum("hoursLogged"),
      issuesOpened: sum("issuesOpened"),
      issuesClosed: sum("issuesClosed"),
      issuesOpen: sum("issuesOpen"),
      comments: sum("comments"),
    },
    daily,
    generatedAt: new Date().toISOString(),
  };
}
