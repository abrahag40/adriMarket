#!/usr/bin/env node
/**
 * ¿Cloudflare está cortando peticiones por CPU? · decisiones 0023 y 0024.
 *
 * El plan gratuito de Workers da 10 ms de CPU por petición. La caché de páginas
 * (0024) deja las públicas en ~1 ms, pero lo que no se puede guardar —checkout,
 * panel, latido— usa de 8 a 40 ms. Cloudflare lo tolera la mayoría de las
 * veces, y cuando no, responde `503 · error code: 1102`: un visitante que se
 * queda sin pagar. Este guion cuenta esos cortes con la analítica de Workers,
 * para decidir con datos cuándo contratar Workers Paid, y no por miedo ni por
 * costumbre.
 *
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node scripts/cpu-cloudflare.mjs <worker> [horas]
 *
 * Sale con 1 si hubo al menos un corte en la ventana: en un monitor diario,
 * un rojo aquí es la señal para contratar Workers Paid. El token necesita
 * «Account Analytics · Read».
 */
const [worker, horasTexto = "24"] = process.argv.slice(2);
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: cuenta } = process.env;

if (!worker || !token || !cuenta) {
  console.error("Uso: CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node scripts/cpu-cloudflare.mjs <worker> [horas]");
  process.exit(2);
}

const horas = Number(horasTexto);
const desde = new Date(Date.now() - horas * 3600_000).toISOString();
const consulta = `query {
  viewer { accounts(filter: { accountTag: "${cuenta}" }) {
    workersInvocationsAdaptive(limit: 20, filter: { scriptName: "${worker}", datetime_geq: "${desde}" }) {
      sum { requests }
      quantiles { cpuTimeP50 cpuTimeP90 cpuTimeP99 }
      dimensions { status }
    }
  } }
}`;

const respuesta = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ query: consulta }),
});
const cuerpo = await respuesta.json();
if (cuerpo.errors?.length) {
  console.error("✘ La analítica de Cloudflare respondió con error:", cuerpo.errors.map((e) => e.message).join("; "));
  process.exit(2);
}

const filas = cuerpo.data.viewer.accounts[0]?.workersInvocationsAdaptive ?? [];
const ms = (us) => (us / 1000).toFixed(1).padStart(6);
let total = 0;
let cortadas = 0;
console.log(`${worker} · últimas ${horas} h`);
for (const fila of filas) {
  const n = fila.sum.requests;
  total += n;
  if (fila.dimensions.status === "exceededResources") cortadas += n;
  const q = fila.quantiles;
  console.log(
    `  ${fila.dimensions.status.padEnd(18)} ${String(n).padStart(6)}  CPU ms p50 ${ms(q.cpuTimeP50)}  p90 ${ms(q.cpuTimeP90)}  p99 ${ms(q.cpuTimeP99)}`,
  );
}

if (total === 0) {
  console.log("  sin peticiones en la ventana");
  process.exit(0);
}
if (cortadas > 0) {
  console.error(`✘ ${cortadas} de ${total} peticiones cortadas por CPU (error 1102). Señal para Workers Paid.`);
  process.exit(1);
}
console.log(`✔ ${total} peticiones, ninguna cortada por CPU.`);
