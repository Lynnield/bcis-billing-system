// Validation for the API server address the desktop client talks to.
//
// The system runs on a closed office LAN (spec 2.1), so plain HTTP is allowed
// for loopback and private-network addresses only. Anything that could route
// over the public internet must use HTTPS.

export const DEFAULT_SERVER_URL = "http://localhost:3000";

function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".lan")) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 127 || a === 10) return true; // loopback, 10.0.0.0/8
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  return false;
}

/** Returns the normalized URL (no trailing slash) or throws with a user-readable reason. */
export function normalizeServerUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(`"${input}" is not a valid address. Use the form http://192.168.1.10:3000`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The server address must start with http:// or https://");
  }
  if (url.protocol === "http:" && !isPrivateHost(url.hostname)) {
    throw new Error("Plain http:// is only allowed for this PC or a private office-LAN address; use https:// otherwise");
  }
  if (url.username || url.password) {
    throw new Error("The server address must not contain a username or password");
  }
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, "")}`;
}
