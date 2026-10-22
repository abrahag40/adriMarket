# 0020 · Un código, varios sitios

**Fecha:** 2026-10-22 · **Estado:** aceptada

## Contexto

El motor se va a desplegar para tres clientes de tours, cada uno con su marca. El
primero es Conquest Tours. Cada cliente necesita su sitio **independiente**: su
dirección, su base y sus fotos, sin que sus datos toquen los de otro.

## Decisión

**Un solo repositorio, un proyecto de Vercel y una base de Neon por cliente.**

- Lo que cambia entre sitios es la **marca** (`src/brand.ts`): nombre, leyenda y
  logo. Se elige con `NEXT_PUBLIC_SITE_BRAND` en el proyecto de Vercel de cada
  sitio. Sin la variable, la marca es adriMarket: el sitio que ya existía no cambia.
- El despliegue y el latido son **matrices** (`desplegar.yml`, `heartbeat.yml`):
  un renglón por sitio con el **nombre** de sus llaves (`DATABASE_URL_<SITIO>`,
  `JOBS_SECRET_<SITIO>`, `VERCEL_PROJECT_ID_<SITIO>`). `fail-fast: false`: si un
  sitio falla, los demás despliegan.
- Contra producción, `SITIO=<sitio> npm run prod:migrate` lee
  `.env.neon.<sitio>`, con su propia ancla.

Un sitio nuevo es: un renglón en `src/brand.ts` (y su logo en `public/brand/`), un
proyecto de Vercel con su base y su Blob, sus llaves en GitHub, y un renglón en
cada matriz.

## Alternativa descartada

**Copiar el repositorio por cliente.** Es lo más rápido el primer día y lo más caro
después: cada arreglo —y este proyecto ya tiene una lista larga de trampas pagadas—
habría que repetirlo en tres lugares, y el día que uno se quede atrás nadie lo nota
hasta que falla en producción.

## El latido, cada 15 minutos

El 2026-10-21 la base de adriMarket se cortó por cuota del plan gratuito de Neon
(100 CU-horas al mes por proyecto, que alcanzan para unas 400 horas encendida). El
latido de cada minuto no la dejaba dormir —Neon la suspende a los 5 minutos sin
uso— y la cuota se acababa a mitad de mes. Desde el 2026-10-22 el latido corre
cada 15 minutos y las alarmas de `/api/health` se miden contra eso.

**Lo que cuesta:** un apartado **sin pagar** puede seguir ocupando su lugar hasta 15
minutos de más, y un correo pendiente puede tardar hasta 15 minutos en salir. Nunca
al revés: un lugar pagado no se libera, y el lugar de un apartado vigente no se le
da a otro.

**Alternativa descartada:** pagar Neon Launch por sitio (US$0.106 por CU-hora, sin
mínimo; ≈ US$19 al mes por sitio encendido todo el día). Los clientes pagaron una
plataforma en un solo pago, sin mensualidad.

## Lo que queda abierto

- **Hacer cada tarea en su momento**, no por latido: el correo de confirmación al
  confirmar el pago, y liberar un apartado vencido cuando otro cliente pide ese
  lugar. Con eso el latido puede espaciarse a horas.
- **Las visitas también despiertan la base.** Con campañas de pago y visitas todo
  el día, la cuota gratuita no alcanza con ningún latido: cachear las páginas
  públicas del catálogo para que una visita no toque la base.
