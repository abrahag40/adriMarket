/**
 * Entry del Worker · decisión 0023.
 *
 * Envuelve el que genera OpenNext (`.open-next/worker.js`) para agregarle lo
 * único que Next no sabe hacer: **el latido**. En Vercel lo daba un bucle en
 * GitHub Actions que solo era gratis porque el repositorio es público (decisión
 * 0005); en Cloudflare es un Cron Trigger del propio Worker.
 *
 * El cron no reimplementa nada: arma la misma petición que mandaba el bucle
 * —`POST /api/jobs/tick` con `x-job-secret`— y se la pasa al mismo manejador que
 * atiende a los visitantes. Así el latido sigue pasando por la ruta que prueba
 * `smoke.sh`, con su secreto y su registro de auditoría.
 *
 * Si el latido responde algo que no sea 2xx, el cron **truena**: Cloudflare lo
 * marca como fallido en sus registros en lugar de darlo por bueno.
 *
 * No entra al typecheck (`tsconfig.json` solo incluye `src/` y `scripts/`):
 * `.open-next/worker.js` no existe hasta compilar.
 */
import openNext from "./.open-next/worker.js";

type Env = { JOBS_SECRET?: string; SITE_URL?: string; NOINDEX?: string };
type Ctx = { waitUntil(promise: Promise<unknown>): void };

const worker = {
  /**
   * Con `NOINDEX=si` —solo las vistas previas en workers.dev— cada respuesta
   * sale con `X-Robots-Tag: noindex`. Va en la cabecera y no en robots.txt a
   * propósito: un `Disallow` impide que el buscador vea el `noindex`, y una URL
   * enlazada desde fuera puede indexarse igual, sin contenido. La cabecera
   * cubre también lo que no es HTML (el sitemap, las fotos).
   */
  async fetch(request: Request, env: Env, ctx: Ctx) {
    const response = await openNext.fetch(request, env, ctx);
    if (env.NOINDEX !== "si") return response;
    const marked = new Response(response.body, response);
    marked.headers.set("x-robots-tag", "noindex, nofollow");
    return marked;
  },

  async scheduled(_controller: unknown, env: Env, ctx: Ctx) {
    if (!env.JOBS_SECRET) {
      throw new Error("latido: falta JOBS_SECRET en el Worker");
    }
    const url = new URL("/api/jobs/tick", env.SITE_URL ?? "http://localhost");
    const response = await openNext.fetch(
      new Request(url, { method: "POST", headers: { "x-job-secret": env.JOBS_SECRET } }),
      env,
      ctx,
    );
    if (!response.ok) {
      throw new Error(`latido: /api/jobs/tick respondió ${response.status}: ${await response.text()}`);
    }
  },
};

export default worker;
