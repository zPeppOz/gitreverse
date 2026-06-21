/**
 * GitHub host configuration.
 *
 * Supports both github.com (SaaS) and a self-hosted GitHub Enterprise Server
 * (GHE) instance. The API path differs between the two:
 *   - github.com:        https://api.github.com
 *   - GHE Server <host>: https://<host>/api/v3
 *
 * `NEXT_PUBLIC_GITHUB_HOST` is used so the value is available both on the
 * server (API routes / clients) and in the browser (repo URL parsing).
 * `GITHUB_HOST` and `GITHUB_API_BASE_URL` are server-only overrides.
 */

const DEFAULT_GITHUB_HOST = "github.com";

function readTrimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Hostname of the configured GitHub instance (e.g. `github.com` or `ghe.example.com`). */
export function getGitHubHost(): string {
  const raw =
    readTrimmedEnv("NEXT_PUBLIC_GITHUB_HOST") ?? readTrimmedEnv("GITHUB_HOST");
  if (!raw) return DEFAULT_GITHUB_HOST;

  // Accept a full URL or a bare hostname.
  try {
    if (raw.includes("://")) {
      return new URL(raw).hostname.replace(/^www\./, "");
    }
  } catch {
    // fall through to bare-host handling
  }
  return raw.replace(/^www\./, "").replace(/\/.*$/, "");
}

/** True when configured for a self-hosted GitHub Enterprise Server instance. */
export function isGitHubEnterpriseHost(): boolean {
  return getGitHubHost() !== DEFAULT_GITHUB_HOST;
}

/** REST API base URL for the configured instance (no trailing slash). */
export function getGitHubApiBaseUrl(): string {
  const explicit = readTrimmedEnv("GITHUB_API_BASE_URL");
  if (explicit) return stripTrailingSlash(explicit);

  const host = getGitHubHost();
  if (host === DEFAULT_GITHUB_HOST) {
    return "https://api.github.com";
  }
  return `https://${host}/api/v3`;
}
