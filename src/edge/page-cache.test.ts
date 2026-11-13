import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_AGE_MS, PageCache, cacheKey, isCacheable, isWrite } from "./page-cache";

/**
 * Caché de páginas públicas · decisión 0024.
 *
 * No habla con R2: un bucket en memoria con la misma forma. Lo que se comprueba
 * es lo que podría mentirle a un visitante —un cupo vendido que sigue a la
 * venta, un checkout ajeno— y no que R2 guarde bytes.
 */

const BASE = "https://tours.example";
const pedir = (ruta: string, init?: RequestInit) => new Request(`${BASE}${ruta}`, init);

function bucketEnMemoria() {
  const objetos = new Map<string, { cuerpo: string; meta?: Record<string, string> }>();
  return {
    objetos,
    async get(llave: string) {
      const o = objetos.get(llave);
      if (!o) return null;
      return {
        body: new Response(o.cuerpo).body!,
        customMetadata: o.meta,
        text: async () => o.cuerpo,
      };
    },
    async put(llave: string, valor: ArrayBuffer | string, opciones?: { customMetadata?: Record<string, string> }) {
      const cuerpo = typeof valor === "string" ? valor : new TextDecoder().decode(valor);
      objetos.set(llave, { cuerpo, meta: opciones?.customMetadata });
    },
  };
}

/** Un "Next" de mentira que cuenta cuántas veces armó la página. */
function armador(html: () => string) {
  let veces = 0;
  return {
    get veces() {
      return veces;
    },
    render: async () => {
      veces += 1;
      return new Response(html(), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    },
  };
}

const pendientes: Promise<unknown>[] = [];
const esperar = (p: Promise<unknown>) => pendientes.push(p);
const asentar = async () => {
  await Promise.all(pendientes.splice(0));
};

describe("qué se guarda", () => {
  it("la portada, sus listados, destinos y las fichas", () => {
    for (const ruta of [
      "/es",
      "/en",
      "/es?kind=tour&location=tulum&page=2",
      "/es/destinos",
      "/en/destinations",
      "/es/tours/snorkel-cenotes-tulum",
      "/en/stays/casa-akumal?from=2027-03-04&to=2027-03-07&guests=5",
    ]) {
      assert.equal(isCacheable(pedir(ruta)), true, ruta);
    }
  });

  it("nunca el checkout, los extras, una reserva, el panel, la API ni las fotos", () => {
    for (const ruta of [
      "/es/checkout?kind=stay&slug=casa-akumal",
      "/es/extras?kind=tour&slug=x",
      "/es/reserva/AM-68UT3E",
      "/admin",
      "/admin/reservas",
      "/api/health",
      "/media/akumal-1.svg",
      "/",
      "/fr",
      "/es/destinations",
      "/es/tours/snorkel/otra-cosa",
    ]) {
      assert.equal(isCacheable(pedir(ruta)), false, ruta);
    }
  });

  it("sólo GET, y nunca con credenciales", () => {
    assert.equal(isCacheable(pedir("/es", { method: "POST" })), false);
    assert.equal(isCacheable(pedir("/es", { method: "HEAD" })), false);
    assert.equal(isCacheable(pedir("/es", { headers: { authorization: "Bearer x" } })), false);
  });

  it("toda petición que no sea de lectura es una escritura", () => {
    assert.equal(isWrite(pedir("/es", { method: "POST" })), true);
    assert.equal(isWrite(pedir("/api/jobs/tick", { method: "POST" })), true);
    assert.equal(isWrite(pedir("/es")), false);
  });
});

describe("la llave", () => {
  it("cambia con la consulta, el despliegue, la versión y la navegación del cliente", async () => {
    const base = await cacheKey(pedir("/es?kind=tour"), "d1", "v1");
    assert.notEqual(base, await cacheKey(pedir("/es?kind=stay"), "d1", "v1"));
    assert.notEqual(base, await cacheKey(pedir("/es?kind=tour"), "d2", "v1"));
    assert.notEqual(base, await cacheKey(pedir("/es?kind=tour"), "d1", "v2"));
    assert.notEqual(base, await cacheKey(pedir("/es?kind=tour", { headers: { rsc: "1" } }), "d1", "v1"));
    assert.equal(base, await cacheKey(pedir("/es?kind=tour"), "d1", "v1"));
  });
});

describe("servir", () => {
  it("la segunda visita no arma la página", async () => {
    const cache = new PageCache(bucketEnMemoria(), "d1");
    const next = armador(() => "<p>portada</p>");
    const primera = await cache.serve(pedir("/es"), next.render, esperar);
    await asentar();
    const segunda = await cache.serve(pedir("/es"), next.render, esperar);

    assert.equal(next.veces, 1);
    assert.equal(primera.headers.get("x-cache"), "MISS");
    assert.equal(segunda.headers.get("x-cache"), "HIT");
    assert.equal(await segunda.text(), "<p>portada</p>");
    assert.match(segunda.headers.get("content-type") ?? "", /text\/html/);
    assert.match(segunda.headers.get("cache-control") ?? "", /no-store/);
  });

  it("después de una escritura, el cupo que se ve es el de la base", async () => {
    const cache = new PageCache(bucketEnMemoria(), "d1");
    let lugares = 12;
    const next = armador(() => `<p>${lugares} lugares</p>`);

    await cache.serve(pedir("/es/tours/x"), next.render, esperar);
    await asentar();
    lugares = 10; // alguien reservó dos
    await cache.bump(); // la reserva sube la versión antes de responder
    const despues = await cache.serve(pedir("/es/tours/x"), next.render, esperar);

    assert.equal(await despues.text(), "<p>10 lugares</p>");
    assert.equal(next.veces, 2);
  });

  it("una página armada antes de una escritura no se sirve después de ella", async () => {
    const bucket = bucketEnMemoria();
    const cache = new PageCache(bucket, "d1");
    let lugares = 12;
    let soltar!: () => void;
    const lenta = new Promise<void>((r) => (soltar = r));
    let avisarLectura!: () => void;
    const leyo = new Promise<void>((r) => (avisarLectura = r));

    // La visita lee la base (12) y tarda en terminar; mientras, se reserva.
    // Se espera a que de verdad haya leído: sin eso, la reserva podía llegar
    // antes de la lectura y la prueba pasaba con el defecto puesto (comprobado).
    const visita = cache.serve(
      pedir("/es/tours/x"),
      async () => {
        const html = `<p>${lugares} lugares</p>`;
        avisarLectura();
        await lenta;
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      },
      esperar,
    );
    await leyo;
    lugares = 10;
    await cache.bump();
    soltar();
    await visita;
    await asentar();

    const siguiente = await cache.serve(pedir("/es/tours/x"), armador(() => `<p>${lugares} lugares</p>`).render, esperar);
    assert.equal(await siguiente.text(), "<p>10 lugares</p>");
  });

  it("una copia con más de diez minutos se vuelve a armar aunque nada haya escrito", async () => {
    let ahora = 1_000_000;
    const cache = new PageCache(bucketEnMemoria(), "d1", () => ahora);
    const next = armador(() => "<p>x</p>");
    await cache.serve(pedir("/es"), next.render, esperar);
    await asentar();
    ahora += MAX_AGE_MS + 1;
    await cache.serve(pedir("/es"), next.render, esperar);
    assert.equal(next.veces, 2);
  });

  it("no guarda un error, una redirección ni una respuesta con cookie", async () => {
    for (const respuesta of [
      () => new Response("no", { status: 404, headers: { "content-type": "text/html" } }),
      () => new Response(null, { status: 307, headers: { location: "/es" } }),
      () => new Response("x", { status: 200, headers: { "content-type": "text/html", "set-cookie": "s=1" } }),
    ]) {
      const bucket = bucketEnMemoria();
      const cache = new PageCache(bucket, "d1");
      await cache.serve(pedir("/es"), async () => respuesta(), esperar);
      await asentar();
      assert.equal([...bucket.objetos.keys()].filter((k) => !k.endsWith("version-del-catalogo")).length, 0);
    }
  });
});
