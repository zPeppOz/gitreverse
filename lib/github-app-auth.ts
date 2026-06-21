/**
 * GitHub App authentication.
 *
 * When a GitHub App is configured, the app's private key is used to mint a
 * short-lived RS256 JWT, which is then exchanged for an installation access
 * token. The installation token is what authenticates REST API calls (works
 * for both github.com and GitHub Enterprise Server).
 *
 * Required env:
 *   - GITHUB_APP_ID              (numeric App ID, or use GITHUB_APP_CLIENT_ID)
 *   - GITHUB_APP_PRIVATE_KEY     (PEM; literal "\n" escapes are accepted)
 *   - GITHUB_APP_INSTALLATION_ID (installation to act as)
 *
 * Tokens are cached in-process until shortly before they expire.
 */

import { createSign } from "node:crypto";
import { getGitHubApiBaseUrl } from "@/lib/github-config";

const TOKEN_REFRESH_BUFFER_MS = 60_000;
// Fallback lifetime when the response omits a parseable expires_at (~55 min).
const FALLBACK_TOKEN_LIFETIME_MS = 55 * 60_000;

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

let cachedToken: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

function readTrimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function getAppId(): string | null {
  return readTrimmedEnv("GITHUB_APP_ID") ?? readTrimmedEnv("GITHUB_APP_CLIENT_ID");
}

function getPrivateKey(): string | null {
  const raw = readTrimmedEnv("GITHUB_APP_PRIVATE_KEY");
  if (!raw) return null;
  // Allow keys stored on a single line with escaped newlines.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function getInstallationId(): string | null {
  return readTrimmedEnv("GITHUB_APP_INSTALLATION_ID");
}

/** True when all GitHub App credentials are present. */
export function hasGitHubAppConfig(): boolean {
  return !!getAppId() && !!getPrivateKey() && !!getInstallationId();
}

function base64url(input: Buffer | string): string {
  return (input instanceof Buffer ? input : Buffer.from(input)).toString(
    "base64url"
  );
}

/** Build a signed app JWT (valid ~10 minutes), used to request installation tokens. */
function createAppJwt(appId: string, privateKey: string): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    // Backdate 60s to tolerate clock drift; expire 9 minutes out (< 10 min max).
    iat: nowSeconds - 60,
    exp: nowSeconds + 9 * 60,
    iss: appId,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload)
  )}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = base64url(signer.sign(privateKey));

  return `${signingInput}.${signature}`;
}

interface InstallationTokenResponse {
  token: string;
  expires_at: string;
}

async function requestInstallationToken(): Promise<string> {
  const appId = getAppId();
  const privateKey = getPrivateKey();
  const installationId = getInstallationId();
  if (!appId || !privateKey || !installationId) {
    throw new Error(
      "GitHub App is not fully configured. Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID."
    );
  }

  let jwt: string;
  try {
    jwt = createAppJwt(appId, privateKey);
  } catch {
    throw new Error(
      "Failed to sign GitHub App JWT. Check that GITHUB_APP_PRIVATE_KEY is a valid PEM key."
    );
  }

  const res = await fetch(
    `${getGitHubApiBaseUrl()}/app/installations/${encodeURIComponent(
      installationId
    )}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "User-Agent": "gitreverse/1.0.0",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (res.status === 401) {
    throw new Error(
      "GitHub App authentication failed. Check GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY."
    );
  }
  if (res.status === 404) {
    throw new Error(
      "GitHub App installation not found. Check GITHUB_APP_INSTALLATION_ID."
    );
  }
  if (!res.ok) {
    throw new Error(
      `GitHub App token request failed: ${res.status} ${res.statusText}`
    );
  }

  const data = (await res.json()) as InstallationTokenResponse;
  if (!data.token) {
    throw new Error("GitHub App token response did not include a token.");
  }

  const expiresAtMs = Date.parse(data.expires_at);
  cachedToken = {
    token: data.token,
    expiresAtMs: Number.isFinite(expiresAtMs)
      ? expiresAtMs
      : Date.now() + FALLBACK_TOKEN_LIFETIME_MS,
  };
  return data.token;
}

/** Returns a valid installation access token, refreshing it when near expiry. */
export async function getInstallationToken(): Promise<string> {
  if (
    cachedToken &&
    cachedToken.expiresAtMs - TOKEN_REFRESH_BUFFER_MS > Date.now()
  ) {
    return cachedToken.token;
  }

  // De-duplicate concurrent refreshes.
  if (!inFlight) {
    inFlight = requestInstallationToken().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
