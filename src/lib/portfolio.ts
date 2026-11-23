import "server-only";
import { cacheLife } from "next/cache";
import content from "@/content/portfolio.json";

export type Project = {
  repo: string;
  title: string;
  kind: string;
  summary: string;
  tech: string[];
  live: string | null;
  source: string;
  poster: string;
  clip: string | null;
  stars: number | null;
  language: string | null;
  pushedAt: string | null;
};

export type Profile = {
  name: string;
  alias: string;
  role: string;
  focus: string[];
  intro: string;
  outro: string;
  email: string;
  crew: string[];
  github: string;
  avatar: string | null;
  followers: number | null;
  publicRepos: number | null;
  totalStars: number | null;
  lastPush: string | null;
  languages: string[];
};

export type Portfolio = {
  profile: Profile;
  projects: Project[];
  links: { label: string; href: string }[];
  stack: string[];
  /** grouped for the skills section; GitHub languages not listed anywhere get their own group */
  skills: { group: string; items: string[] }[];
  live: boolean;
  year: number;
};

type GhRepo = {
  full_name: string;
  description: string | null;
  homepage: string | null;
  stargazers_count: number;
  language: string | null;
  pushed_at: string;
  fork: boolean;
  archived: boolean;
};

type GhUser = { avatar_url: string; followers: number; public_repos: number; name: string | null };

const GH = "https://api.github.com";

async function gh<T>(path: string): Promise<T | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "candy-portfolio",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${GH}${path}`, { headers, signal: AbortSignal.timeout(4500) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // offline or rate limited: the page falls back to the content file
    return null;
  }
}

/**
 * Canonical origin: set explicitly, else the production domain Vercel reports
 * for the project, else the one in the content file.
 */
const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? (vercelDomain ? `https://${vercelDomain}` : content.site.url)
).replace(/\/$/, "");
export const site = content.site;
export const person = content.person;
export const githubUser = process.env.GITHUB_USER ?? content.github.user;

/**
 * Content file + live GitHub data. Cached for an hour, so the page stays fresh
 * without hammering the API, and still renders fully when GitHub is unreachable.
 */
export async function getPortfolio(): Promise<Portfolio> {
  "use cache";
  cacheLife("hours");

  const [user, ownRepos, ...projectRepos] = await Promise.all([
    gh<GhUser>(`/users/${githubUser}`),
    gh<GhRepo[]>(`/users/${githubUser}/repos?per_page=100&type=owner&sort=pushed`),
    ...content.projects.map((p) => gh<GhRepo>(`/repos/${p.repo}`)),
  ]);

  const projects: Project[] = content.projects.map((p, i) => {
    const repo = projectRepos[i];
    return {
      repo: p.repo,
      title: p.title,
      kind: p.kind,
      summary: p.summary,
      tech: p.tech,
      live: p.live ?? repo?.homepage ?? null,
      source: `https://github.com/${p.repo}`,
      poster: p.poster,
      clip: p.clip ?? null,
      stars: repo?.stargazers_count ?? null,
      language: repo?.language ?? null,
      pushedAt: repo?.pushed_at ?? null,
    };
  });

  const visible = (ownRepos ?? []).filter((r) => !r.fork);
  const languageCount = new Map<string, number>();
  for (const r of [...visible, ...projectRepos.filter((r): r is GhRepo => !!r)]) {
    if (r.language) languageCount.set(r.language, (languageCount.get(r.language) ?? 0) + 1);
  }
  const languages = [...languageCount.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);

  const stack = [...new Set([...content.skills.flatMap((g) => g.items), ...content.projects.flatMap((p) => p.tech), ...languages])];
  const listed = new Set(content.skills.flatMap((g) => g.items.map((i) => i.toLowerCase())));
  const unlisted = languages.filter((l) => !listed.has(l.toLowerCase()));
  const skills = unlisted.length ? [...content.skills, { group: "Also on GitHub", items: unlisted }] : content.skills;
  const pushes = visible.map((r) => r.pushed_at).sort();

  return {
    profile: {
      ...content.person,
      github: `https://github.com/${githubUser}`,
      avatar: user?.avatar_url ?? null,
      followers: user?.followers ?? null,
      publicRepos: user?.public_repos ?? null,
      totalStars: ownRepos ? visible.reduce((s, r) => s + r.stargazers_count, 0) : null,
      lastPush: pushes.at(-1) ?? null,
      languages,
    },
    projects,
    links: content.links,
    stack,
    skills,
    live: !!user,
    year: new Date().getUTCFullYear(),
  };
}
