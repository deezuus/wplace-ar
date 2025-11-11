/**
 * Cloudflare Worker Proxy for wPlace AR
 * 
 * This worker handles CORS by forwarding requests to the wplace.live backend,
 * sanitizing headers, and caching responses for improved performance.
 * 
 * Features:
 * - Normalizes cache keys (ignoring timestamp query parameters)
 * - Implements 24-hour cache with stale-while-revalidate for up to 7 days
 * - Sanitizes headers to prevent CORS issues
 */

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/wplace/")) {
      return new Response("Not found", { status: 404 });
    }

    const upstream = new URL(
      "https://backend.wplace.live" + url.pathname.replace(/^\/wplace/, "")
    );
    upstream.search = url.search;

    // Normalize cache key (ignore ?t=...)
    const cacheKeyURL = new URL(upstream);
    cacheKeyURL.searchParams.delete("t");
    const cache = caches.default;

    let cached = await cache.match(cacheKeyURL.toString());
    let r = cached;
    if (!r) {
      const u = await fetch(upstream.toString(), { method: "GET" });
      r = new Response(u.body, u);
    }

    // Sanitize + set our headers
    const h = new Headers(r.headers);
    h.delete("access-control-allow-origin");
    h.delete("access-control-allow-credentials");
    h.delete("set-cookie");
    if (!h.get("content-type")) h.set("content-type", "image/png");

    // For dev: allow any origin (safe since no credentials)
    h.set("Access-Control-Allow-Origin", "*");

    // Caching (store the sanitized response so wplace headers don't reappear)
    h.set(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
    const sanitized = new Response(r.body, { status: r.status, headers: h });

    if (!cached) {
      ctx.waitUntil(cache.put(cacheKeyURL.toString(), sanitized.clone()));
    }

    return sanitized;
  }
};

