import "server-only";
import { requirePermission } from "@/lib/crm/repo";
import { type JiraHistory, type Period, getJson, jiraDoer, mapLimit, personMap } from "@/lib/performance";

/*
  One developer in detail: what exactly they did in GitHub and Jira over the
  period, and how their Jira tasks went (time in work, returns, deadlines).

  The person is the row name from the overview (a PERF_PEOPLE name, or a bare
  GitHub login / Jira name for people not listed there). Every identity of the
  person — GitHub login, Jira name, aliases — is matched ignoring case.
*/

export interface PersonCommit {
  repo: string;
  sha: string;
  message: string;
  date: string;
  url: string;
}

export interface PersonPull {
  repo: string;
  number: number;
  title: string;
  url: string;
  base: string;
  /** merged — влит; closed — закрыт без мержа; open — ещё открыт. */
  state: "merged" | "closed" | "open";
  createdAt: string;
  closedAt?: string;
}

export interface PersonIssue {
  repo: string;
  number: number;
  title: string;
  url: string;
  open: boolean;
  createdAt: string;
  closedAt?: string;
  /** The person opened it (otherwise it is only assigned to them). */
  authored: boolean;
}

export interface PersonTask {
  key: string;
  summary: string;
  url: string;
  status: string;
  category: "new" | "indeterminate" | "done";
  startedAt?: string;
  doneAt?: string;
  /** Hours from first "in progress" to done (or to now while still open). */
  cycleHours?: number;
  dueDate?: string;
  overdue: boolean;
  /** In progress → back to a "to do" status. */
  backToBacklog: number;
  /** Review → back to work (the reviewer sent it back). */
  returnedFromReview: number;
  /** Done → reopened. */
  reopened: number;
  /** Hours logged in Jira on the issue. */
  hoursLogged: number;
  /** Status path, oldest first, for the timeline. */
  path: { at: string; to: string }[];
}

export interface RepoShare {
  repo: string;
  commits: number;
  pulls: number;
  issues: number;
}

export interface PersonDetail {
  name: string;
  period: Period;
  since: string;
  github: { ok: boolean; note?: string };
  jira: { ok: boolean; note?: string };
  commits: PersonCommit[];
  pulls: PersonPull[];
  issues: PersonIssue[];
  tasks: PersonTask[];
  repos: { active: RepoShare[]; untouched: string[] };
  summary: {
    commits: number;
    pullsMerged: number;
    pullsFailed: number;
    pullsOpen: number;
    issuesCreated: number;
    issuesClosed: number;
    issuesOpen: number;
    tasksDone: number;
    tasksInProgress: number;
    avgCycleHours?: number;
    mistakes: number;
    overdue: number;
    hoursLogged: number;
  };
}

/* -------------------------------- identity -------------------------------- */

function identitiesOf(name: string) {
  const hit = personMap().find((m) => m.name === name);
  const all = [name, hit?.github, hit?.jira, ...(hit?.aliases ?? [])].filter(Boolean) as string[];
  const set = new Set(all.map((v) => v.toLowerCase()));
  return { is: (v?: string | null) => !!v && set.has(v.toLowerCase()) };
}

/* --------------------------------- GitHub --------------------------------- */

interface GhCommit {
  sha: string;
  html_url: string;
  author: { login: string } | null;
  commit: { author: { name: string; date: string }; message: string };
}
interface GhPull {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  merged_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  user: { login: string } | null;
  base: { ref: string };
}
interface GhIssue {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  user: { login: string } | null;
  assignees?: { login: string }[];
  pull_request?: unknown;
}

async function loadGithub(is: (v?: string | null) => boolean, since: string) {
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
  const repos = (
    await getJson<{ name: string; archived: boolean }[]>(`${api}/orgs/${org}/repos?per_page=100&sort=pushed`, init)
  ).filter((r) => !r.archived);

  const pages = async <T,>(url: string, max: number, stop?: (batch: T[]) => boolean) => {
    const all: T[] = [];
    for (let page = 1; page <= max; page++) {
      const batch = await getJson<T[]>(`${url}&per_page=100&page=${page}`, init).catch(() => [] as T[]);
      all.push(...batch);
      if (batch.length < 100 || stop?.(batch)) break;
    }
    return all;
  };

  const commits: PersonCommit[] = [];
  const pulls: PersonPull[] = [];
  const issues: PersonIssue[] = [];
  const share = new Map<string, RepoShare>();
  const bump = (repo: string, k: "commits" | "pulls" | "issues") => {
    let s = share.get(repo);
    if (!s) share.set(repo, (s = { repo, commits: 0, pulls: 0, issues: 0 }));
    s[k]++;
  };

  await mapLimit(repos, 5, async ({ name: repo }) => {
    const base = `${api}/repos/${org}/${repo}`;
    const [rc, rp, touched, open] = await Promise.all([
      pages<GhCommit>(`${base}/commits?since=${since}`, 10),
      pages<GhPull>(`${base}/pulls?state=all&sort=updated&direction=desc`, 5, (b) =>
        b.every((p) => p.updated_at < since),
      ),
      pages<GhIssue>(`${base}/issues?state=all&since=${since}`, 5),
      // Open issues that nobody touched in the period still count as "not closed".
      pages<GhIssue>(`${base}/issues?state=open`, 5),
    ]);
    const ri = [...new Map([...touched, ...open].map((i) => [i.number, i])).values()];
    for (const c of rc) {
      if (!is(c.author?.login) && !is(c.commit.author.name)) continue;
      commits.push({
        repo,
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split("\n")[0] ?? "",
        date: c.commit.author.date,
        url: c.html_url,
      });
      bump(repo, "commits");
    }
    for (const p of rp) {
      if (!is(p.user?.login)) continue;
      const touched = p.created_at >= since || (p.closed_at ?? "") >= since || p.state === "open";
      if (!touched) continue;
      pulls.push({
        repo,
        number: p.number,
        title: p.title,
        url: p.html_url,
        base: p.base.ref,
        state: p.merged_at ? "merged" : p.state === "closed" ? "closed" : "open",
        createdAt: p.created_at,
        closedAt: p.merged_at ?? p.closed_at ?? undefined,
      });
      bump(repo, "pulls");
    }
    for (const i of ri) {
      if (i.pull_request) continue; // the issues API also returns PRs
      const authored = is(i.user?.login);
      const assigned = (i.assignees ?? []).some((a) => is(a.login));
      if (!authored && !assigned) continue;
      issues.push({
        repo,
        number: i.number,
        title: i.title,
        url: i.html_url,
        open: i.state === "open",
        createdAt: i.created_at,
        closedAt: i.closed_at ?? undefined,
        authored,
      });
      bump(repo, "issues");
    }
  });

  commits.sort((a, b) => b.date.localeCompare(a.date));
  pulls.sort((a, b) => (b.closedAt ?? b.createdAt).localeCompare(a.closedAt ?? a.createdAt));
  issues.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = [...share.values()].sort(
    (a, b) => b.commits + b.pulls + b.issues - (a.commits + a.pulls + a.issues),
  );
  const untouched = repos.map((r) => r.name).filter((r) => !share.has(r));
  return { commits, pulls, issues, repos: { active, untouched } };
}

/* ---------------------------------- Jira ---------------------------------- */

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    assignee: { displayName: string } | null;
    status: { name: string; statusCategory: { key: string } };
    resolutiondate: string | null;
    duedate: string | null;
    timespent: number | null;
  };
}

const REVIEW = /провер|review|ревью|тест|qa/i;

async function loadJira(is: (v?: string | null) => boolean, sinceDate: string, since: string) {
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
  let next: string | undefined;
  do {
    const qs = new URLSearchParams({
      jql,
      maxResults: "100",
      fields: "summary,assignee,status,resolutiondate,duedate,timespent",
    });
    if (next) qs.set("nextPageToken", next);
    const page = await getJson<{ issues: JiraIssue[]; nextPageToken?: string; isLast?: boolean }>(
      `${base}/rest/api/3/search/jql?${qs}`,
      init,
    );
    issues.push(...page.issues);
    next = page.isLast ? undefined : page.nextPageToken;
  } while (next && issues.length < 1000);

  const statuses = await getJson<{ id: string; name: string; statusCategory: { key: string } }[]>(
    `${base}/rest/api/3/status`,
    init,
  ).catch(() => []);
  const categoryOf = new Map(statuses.map((s) => [s.id, s.statusCategory.key]));
  const nameOf = new Map(statuses.map((s) => [s.id, s.name]));

  const tasks: PersonTask[] = [];
  await mapLimit(issues, 6, async (issue) => {
    const histories: JiraHistory[] = [];
    for (let startAt = 0; startAt < 500; startAt += 100) {
      const page = await getJson<{ values: JiraHistory[]; isLast?: boolean }>(
        `${base}/rest/api/3/issue/${issue.key}/changelog?startAt=${startAt}&maxResults=100`,
        init,
      ).catch(() => null);
      if (!page) break;
      histories.push(...page.values);
      if (page.isLast !== false || page.values.length < 100) break;
    }
    const current = issue.fields.assignee?.displayName;
    const doer = categoryOf.size ? jiraDoer(histories, categoryOf, current) : undefined;
    if (!is(doer ?? current)) return;

    const category = issue.fields.status.statusCategory.key as PersonTask["category"];
    const doneAt = category === "done" ? (issue.fields.resolutiondate ?? undefined) : undefined;
    // Only work that is live now or finished inside the period.
    if (category === "new" || (category === "done" && (!doneAt || doneAt < since))) return;

    const sorted = [...histories].sort((a, b) => a.created.localeCompare(b.created));
    let startedAt: string | undefined;
    let backToBacklog = 0;
    let returnedFromReview = 0;
    let reopened = 0;
    const path: PersonTask["path"] = [];
    for (const h of sorted) {
      for (const it of h.items) {
        if (it.field !== "status" || !it.to) continue;
        const from = it.from ? categoryOf.get(it.from) : undefined;
        const to = categoryOf.get(it.to);
        const fromName = (it.from && nameOf.get(it.from)) ?? it.fromString ?? "";
        path.push({ at: h.created, to: nameOf.get(it.to) ?? it.toString ?? it.to });
        if (to === "indeterminate" && !startedAt) startedAt = h.created;
        if (from === "indeterminate" && to === "new") backToBacklog++;
        if (from === "done" && to !== "done") reopened++;
        if (REVIEW.test(fromName) && to !== "done" && !REVIEW.test(nameOf.get(it.to) ?? it.toString ?? "")) {
          returnedFromReview++;
        }
      }
    }

    const end = doneAt ?? new Date().toISOString();
    const cycleHours = startedAt
      ? Math.round(((new Date(end).getTime() - new Date(startedAt).getTime()) / 3_600_000) * 10) / 10
      : undefined;
    const due = issue.fields.duedate ?? undefined;
    // A due date is a day: the work is late once that whole day has passed.
    const dueEnd = due ? `${due}T23:59:59` : undefined;
    const overdue = !!dueEnd && (doneAt ? new Date(doneAt) > new Date(dueEnd) : new Date() > new Date(dueEnd));

    tasks.push({
      key: issue.key,
      summary: issue.fields.summary,
      url: `${base}/browse/${issue.key}`,
      status: issue.fields.status.name,
      category,
      startedAt,
      doneAt,
      cycleHours,
      dueDate: due,
      overdue,
      backToBacklog,
      returnedFromReview,
      reopened,
      hoursLogged: Math.round(((issue.fields.timespent ?? 0) / 3600) * 10) / 10,
      path,
    });
  });

  tasks.sort((a, b) => (b.doneAt ?? b.startedAt ?? "").localeCompare(a.doneAt ?? a.startedAt ?? ""));
  return tasks;
}

/* --------------------------------- public --------------------------------- */

export async function buildPersonDetail(name: string, period: Period): Promise<PersonDetail> {
  await requirePermission("team.view");

  const since = new Date(Date.now() - period * 86_400_000).toISOString();
  const { is } = identitiesOf(name);
  const [gh, jira] = await Promise.allSettled([loadGithub(is, since), loadJira(is, since.slice(0, 10), since)]);
  const g = gh.status === "fulfilled" ? gh.value : null;
  const tasks = jira.status === "fulfilled" ? jira.value : [];
  const note = (r: PromiseSettledResult<unknown>) =>
    r.status === "fulfilled" ? { ok: true } : { ok: false, note: (r.reason as Error).message };

  const commits = g?.commits ?? [];
  const pulls = g?.pulls ?? [];
  const issues = g?.issues ?? [];
  const done = tasks.filter((t) => t.category === "done");
  const cycles = done.map((t) => t.cycleHours).filter((h): h is number => h !== undefined);

  return {
    name,
    period,
    since,
    github: note(gh),
    jira: note(jira),
    commits,
    pulls,
    issues,
    tasks,
    repos: g?.repos ?? { active: [], untouched: [] },
    summary: {
      commits: commits.length,
      pullsMerged: pulls.filter((p) => p.state === "merged").length,
      pullsFailed: pulls.filter((p) => p.state === "closed").length,
      pullsOpen: pulls.filter((p) => p.state === "open").length,
      issuesCreated: issues.filter((i) => i.authored && i.createdAt >= since).length,
      issuesClosed: issues.filter((i) => !i.open && (i.closedAt ?? "") >= since).length,
      issuesOpen: issues.filter((i) => i.open).length,
      tasksDone: done.length,
      tasksInProgress: tasks.filter((t) => t.category === "indeterminate").length,
      avgCycleHours: cycles.length
        ? Math.round((cycles.reduce((a, b) => a + b, 0) / cycles.length) * 10) / 10
        : undefined,
      mistakes: tasks.reduce((a, t) => a + t.backToBacklog + t.returnedFromReview + t.reopened, 0),
      overdue: tasks.filter((t) => t.overdue).length,
      hoursLogged: Math.round(tasks.reduce((a, t) => a + t.hoursLogged, 0) * 10) / 10,
    },
  };
}
