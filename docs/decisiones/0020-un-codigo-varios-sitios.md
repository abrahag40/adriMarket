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

## Lo que queda abierto

- **El latido y la cuota de Neon.** El 2026-10-21 la base de adriMarket se cortó
  por cuota del plan gratuito. Lo más probable es el latido de cada minuto: no deja
  que la base se duerma, y 0.25 CU todo el día gastan las 100 CU-horas del mes en
  unos 17 días. Cada sitio nuevo en el mismo plan y con el mismo latido repite el
  problema. Decidir: pagar el plan de Neon o espaciar el latido.
