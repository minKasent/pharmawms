export const LOGIN_PATH = "/login";
export const HOME_PATH = "/";

export const RETURN_TO_PARAM = "next";
const REASON_PARAM = "reason";
const EXPIRED_REASON = "expired";

/**
 * Where the user goes when the backend rejects an access cookie the proxy considered valid
 * (revoked, or signed with a rotated key). The proxy then ignores that cookie and refreshes.
 */
export function sessionExpiredPath(returnTo?: string): string {
  const params = new URLSearchParams({ [REASON_PARAM]: EXPIRED_REASON });
  if (returnTo && returnTo !== HOME_PATH) {
    params.set(RETURN_TO_PARAM, returnTo);
  }
  return `${LOGIN_PATH}?${params}`;
}

export function isSessionExpiredRedirect(url: URL): boolean {
  return url.pathname === LOGIN_PATH && url.searchParams.get(REASON_PARAM) === EXPIRED_REASON;
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Only same-origin absolute paths, so a crafted `next` cannot redirect off-site. */
export function safeReturnPath(next: string | null | undefined): string {
  if (!next || CONTROL_CHARS.test(next)) {
    return HOME_PATH;
  }
  const trimmed = next.trim();
  if (!trimmed || CONTROL_CHARS.test(trimmed) || !trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return HOME_PATH;
  }
  try {
    const decoded = decodeURIComponent(trimmed);
    if (CONTROL_CHARS.test(decoded) || !decoded.startsWith("/") || decoded.startsWith("//") || decoded.startsWith("/\\")) {
      return HOME_PATH;
    }
    const parsed = new URL(trimmed, "http://localhost");
    if (parsed.origin !== "http://localhost" || parsed.pathname.startsWith("//") || parsed.pathname.includes("\\")) {
      return HOME_PATH;
    }
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return HOME_PATH;
  }
}
