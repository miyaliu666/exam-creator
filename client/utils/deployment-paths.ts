/** Shared by the Vite build and browser; these helpers never read credentials. */
export function normalizeBasePath(value = "/"): string {
  const path = value.trim() || "/";
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\]/.test(path)
    || !/^\/[A-Za-z0-9/_~.%\-]*$/.test(path)
    || path.split("/").some((part) => {
      try { return [".", ".."].includes(decodeURIComponent(part)); } catch { return true; }
    })) {
    throw new Error("VITE_BASE_PATH must be an absolute application path, such as /exam-creator/.");
  }
  return path.endsWith("/") ? path : `${path}/`;
}

export function normalizeApiBaseUrl(value = "", production = false): string {
  if (!value.trim()) return "";
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || (production && url.protocol !== "https:")
    || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("VITE_API_BASE_URL must be a backend origin; production requires HTTPS.");
  }
  return url.origin;
}

export function withBasePath(path: string, basePath: string): string {
  const base = normalizeBasePath(basePath);
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("Expected an application-relative path.");
  }
  return `${base}${path.slice(1)}`;
}

export function withoutBasePath(path: string, basePath: string): string {
  const base = normalizeBasePath(basePath);
  if (base === "/") return path;
  if (path === base.slice(0, -1)) return "/";
  return path.startsWith(base) ? `/${path.slice(base.length)}` : path;
}

export function resolveBackendUrl(input: string | URL, backendOrigin: string, pageOrigin: string): URL {
  const url = new URL(input, pageOrigin);
  const expectedOrigin = backendOrigin || pageOrigin;
  if (![pageOrigin, expectedOrigin].includes(url.origin) || url.username || url.password
    || !/^\/(?:api|auth|status|state)(?:\/|$)/.test(url.pathname)) {
    throw new Error("Refusing to send an authenticated request outside the configured backend.");
  }
  return new URL(`${url.pathname}${url.search}`, expectedOrigin);
}

export function usesNgrokHost(origin: string): boolean {
  return /(?:^|\.)(?:ngrok-free\.(?:app|dev)|ngrok\.app|ngrok\.io)$/.test(new URL(origin).hostname);
}

const redirectMarker = "#__exam_creator_path=";

export function pagesFallbackHtml(basePath: string): string {
  const base = JSON.stringify(normalizeBasePath(basePath));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Exam Creator</title><script>location.replace(${base}+${JSON.stringify(redirectMarker)}+encodeURIComponent(location.pathname+location.search+location.hash));</script></head><body></body></html>`;
}

export function pagesRestoreScript(basePath: string): string {
  const base = JSON.stringify(normalizeBasePath(basePath));
  return `(()=>{const marker=${JSON.stringify(redirectMarker)};if(!location.hash.startsWith(marker))return;try{const path=decodeURIComponent(location.hash.slice(marker.length));const url=new URL(path,location.origin);if(url.origin===location.origin&&url.pathname.startsWith(${base})&&!path.startsWith("//")&&!path.includes("\\\\")){history.replaceState(null,"",url.pathname+url.search+url.hash);}}catch{history.replaceState(null,"",${base});}})();`;
}
