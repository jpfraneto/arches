const port = Number(Bun.env.PORT ?? 3001);
const apiOrigin = Bun.env.API_ORIGIN ?? "http://localhost:3000";
const index = await Bun.file(new URL("./index.html", import.meta.url)).text();

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
      const target = new URL(url.pathname + url.search, apiOrigin);
      return fetch(target, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
    }

    return new Response(index, {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  },
});

console.log(`arches-web listening on http://localhost:${port}`);
