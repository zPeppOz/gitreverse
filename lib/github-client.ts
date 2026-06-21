/**
 * GitHub API Client — native fetch.
 *
 * Works against github.com and GitHub Enterprise Server (configurable host).
 * Auth uses a GitHub App installation token when configured, otherwise the
 * static GITHUB_TOKEN.
 */

import { getGitHubApiBaseUrl } from "@/lib/github-config";
import {
  getInstallationToken,
  hasGitHubAppConfig,
} from "@/lib/github-app-auth";

async function resolveGitHubToken(): Promise<string | null> {
  if (hasGitHubAppConfig()) {
    return getInstallationToken();
  }
  return process.env.GITHUB_TOKEN?.trim() || null;
}

async function githubHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "gitreverse/1.0.0",
  };
  const token = await resolveGitHubToken();
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

interface GitHubTreeItem {
  path: string;
  type: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated?: boolean;
}

interface GitHubBranchResponse {
  commit: {
    commit: {
      tree: { sha: string };
    };
  };
}

interface GitHubContentsResponse {
  content: string;
  encoding: string;
}

export interface RepoMeta {
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics: string[];
  default_branch: string;
}

interface GitHubRepoResponse {
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics?: string[];
  default_branch: string;
}

export async function getRepoMeta(owner: string, repo: string): Promise<RepoMeta> {
  const res = await fetch(`${getGitHubApiBaseUrl()}/repos/${owner}/${repo}`, {
    headers: await githubHeaders(),
  });

  if (res.status === 401) {
    throw new Error("GitHub authentication failed. Check GITHUB_TOKEN.");
  }
  if (res.status === 403) {
    throw new Error("GitHub API rate limit exceeded or access denied.");
  }
  if (res.status === 404) {
    throw new Error(`Repository ${owner}/${repo} not found.`);
  }
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as GitHubRepoResponse;
  return {
    description: data.description,
    stargazers_count: data.stargazers_count,
    language: data.language,
    topics: data.topics ?? [],
    default_branch: data.default_branch,
  };
}

export async function getFileTree(
  owner: string,
  repo: string,
  branch: string = "main"
): Promise<{ tree: Array<{ path: string; type: string }>; truncated: boolean }> {
  const doFetch = async (b: string, isRetry: boolean) => {
    const branchRes = await fetch(
      `${getGitHubApiBaseUrl()}/repos/${owner}/${repo}/branches/${b}`,
      { headers: await githubHeaders() }
    );

    if (branchRes.status === 401) {
      throw new Error("GitHub authentication failed. Check GITHUB_TOKEN.");
    }
    if (branchRes.status === 403) {
      throw new Error("GitHub API rate limit exceeded or access denied.");
    }
    if (branchRes.status === 404) {
      if (!isRetry) {
        const fallback = b === "main" ? "master" : "main";
        return doFetch(fallback, true);
      }
      throw new Error(`Repository ${owner}/${repo} or branch ${b} not found.`);
    }
    if (!branchRes.ok) {
      throw new Error(
        `GitHub API error: ${branchRes.status} ${branchRes.statusText}`
      );
    }

    const branchData = (await branchRes.json()) as GitHubBranchResponse;
    const treeSha = branchData.commit.commit.tree.sha;

    const treeRes = await fetch(
      `${getGitHubApiBaseUrl()}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
      { headers: await githubHeaders() }
    );

    if (treeRes.status === 401) {
      throw new Error("GitHub authentication failed. Check GITHUB_TOKEN.");
    }
    if (treeRes.status === 403) {
      throw new Error("GitHub API rate limit exceeded or access denied.");
    }
    if (!treeRes.ok) {
      throw new Error(`GitHub API error: ${treeRes.status} ${treeRes.statusText}`);
    }

    const treeData = (await treeRes.json()) as GitHubTreeResponse;
    return {
      tree: treeData.tree.map((t) => ({ path: t.path, type: t.type })),
      truncated: treeData.truncated ?? false,
    };
  };

  return doFetch(branch, false);
}

export async function readFile(
  owner: string,
  repo: string,
  path: string,
  branch: string = "main"
): Promise<string> {
  const doFetch = async (b: string, isRetry: boolean) => {
    const res = await fetch(
      `${getGitHubApiBaseUrl()}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(b)}`,
      { headers: await githubHeaders() }
    );

    if (res.status === 401) {
      throw new Error("GitHub authentication failed. Check GITHUB_TOKEN.");
    }
    if (res.status === 403) {
      throw new Error("GitHub API rate limit exceeded or access denied.");
    }
    if (res.status === 404) {
      if (!isRetry) {
        const fallback = b === "main" ? "master" : "main";
        return doFetch(fallback, true);
      }
      throw new Error(`File ${path} not found in ${owner}/${repo}@${b}.`);
    }
    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as GitHubContentsResponse;
    return Buffer.from(data.content, "base64").toString("utf-8");
  };

  return doFetch(branch, false);
}

export async function getReadme(
  owner: string,
  repo: string,
  branch: string = "main"
): Promise<string> {
  const doFetch = async (b: string, isRetry: boolean) => {
    const res = await fetch(
      `${getGitHubApiBaseUrl()}/repos/${owner}/${repo}/readme?ref=${encodeURIComponent(b)}`,
      { headers: await githubHeaders() }
    );

    if (res.status === 401) {
      throw new Error("GitHub authentication failed. Check GITHUB_TOKEN.");
    }
    if (res.status === 403) {
      throw new Error("GitHub API rate limit exceeded or access denied.");
    }
    if (res.status === 404) {
      if (!isRetry) {
        const fallback = b === "main" ? "master" : "main";
        return doFetch(fallback, true);
      }
      return "";
    }
    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as GitHubContentsResponse;
    return Buffer.from(data.content, "base64").toString("utf-8");
  };

  return doFetch(branch, false);
}
