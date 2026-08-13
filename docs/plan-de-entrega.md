# Plan de entrega

Marco de trabajo: **Scrum Guide 2020**, sprints de dos semanas. La versión
presentable, con diagramas, está publicada como página:
<https://claude.ai/code/artifact/d51465d0-ff54-4c9d-ae9e-0b3948e605dd>

## Roles

El Scrum Guide define tres responsabilidades y solo tres. Los cuatro roles que
pidió el cliente se acomodan así, sin inventar híbridos:

| Rol pedido | Dónde queda | Nota |
|---|---|---|
| PO | **Product Owner** | Una persona, no un comité. Ordena el backlog; su prioridad no se vota. |
| Ingenieros | **Developers** (3) | Incluye datos, interfaz, pruebas y despliegue. Deciden cómo y cuánto cabe. |
| SME | **Stakeholder clave**, fuera del equipo Scrum | Aporta las reglas reales del negocio y valida en el Review. 4 h/semana comprometidas. |
| PM | Repartido | Producto y alcance → PO. Proceso e impedimentos → Scrum Master. Coordinación técnica → el equipo. |

Un PM que asigna trabajo elimina la autogestión, y con eso se pierde la
estimación honesta: el compromiso del equipo se vuelve obediencia.

## Cadencia

Sprints de dos semanas. Timeboxes proporcionales a los del Scrum Guide (que
están definidos para sprints de un mes). Son máximos, no metas.

| Evento | Timebox | Cuándo |
|---|---|---|
| Sprint Planning | 4 h | lunes, día 1 |
| Daily Scrum | 15 min | diario, misma hora |
| Sprint Review | 2 h | viernes, día 10 |
| Sprint Retrospective | 1.5 h | viernes, después del Review |
| Refinamiento | ≈2 h/semana | miércoles — **no es un evento oficial de Scrum** |

## Definition of Done

Propiedad del equipo. No se negocia bajo presión de fecha.

- [ ] Criterios de aceptación verificados
- [ ] Pruebas automatizadas del comportamiento nuevo, en verde
- [ ] Migraciones aplican limpias desde cero
- [ ] **Si toca inventario o pagos:** prueba de concurrencia ejecutada, sin
      sobreventa ni desalineación del contador
- [ ] Typecheck y linter sin errores
- [ ] Revisado por otra persona del equipo
- [ ] Desplegado en staging y demostrable
- [ ] Sin trabajo manual pendiente para que funcione

## Definition of Ready

Sin esto, el elemento no se lleva a Planning.

- [ ] Escrito como historia con valor para alguien identificable
- [ ] Criterios de aceptación en formato `Dado / Cuando / Entonces`
- [ ] Estimado por el equipo
- [ ] Sin dependencias externas abiertas, o con la dependencia explícita y con dueño
- [ ] Diseño o contenido disponible si hace falta
- [ ] Cabe en un sprint

## Estimación

Story points en Fibonacci (1, 2, 3, 5, 8, 13) con Planning Poker. Miden
esfuerzo, complejidad e incertidumbre juntos, no horas. Lo que llega a 13 se
divide.

Historia de referencia del equipo: **3 puntos = ficha de producto con galería y
descripción en dos idiomas**.

Capacidad del Sprint 1, por cálculo y no por deseo: 3 Developers × 10 días
hábiles = 30 días-persona, menos 10% de eventos y 10% de refinamiento = 24 días
productivos → pronóstico conservador de **20 a 24 puntos**. De ahí en adelante
se usa *yesterday's weather*: el pronóstico es lo que se terminó realmente en el
sprint anterior.

## Pronóstico de release

Solo el sprint en curso es un compromiso. Lo demás es hipótesis y se vuelve a
planear en cada Planning.

| Sprint | Semanas | Sprint Goal | Pts |
|---|---|---|---|
| 0 | — | *Ya entregado, fuera de cadencia:* esquema y garantías de inventario | — |
| 1 | 1–2 | Un visitante explora los tours y las propiedades reales, en dos idiomas, desde su teléfono | 22 |
| 2 | 3–4 | El visitante ve disponibilidad y precio exactos para sus fechas y personas | 21 |
| 3 | 5–6 | Un huésped completa una reserva pagando el anticipo y llegan las confirmaciones | 23 |
| 4 | 7–8 | La operación administra el día a día sin pedirle nada al equipo técnico | 22 |
| 5 | 9–10 | El cliente publica productos y cambia tarifas sin código ni despliegue | 21 |
| 6 | 11–12 | En producción vendiendo, con avisos, monitoreo y staff capacitado | 20 |

Hito intermedio: al cerrar el Sprint 3 el sistema ya cobra anticipos, lo que
habilita **venta asistida** en la semana 6 — adelanta ingresos y pone reservas
reales frente al modelo antes de construir el panel sobre supuestos.

Fuera del MVP a propósito: Mercado Pago, CFDI, reseñas, reportes avanzados y
cobro automático del saldo. Fuera del alcance por decisión previa:
sincronización con canales externos e inventario de terceros.

## Riesgos abiertos

| Riesgo | Dueño | Mitigación |
|---|---|---|
| La cuenta de la pasarela no está aprobada para el Sprint 3 | PO | Trámite iniciado el día 1 del Sprint 1, cinco semanas antes de necesitarla |
| El SME no tiene tiempo y las reglas se adivinan | SM | 4 h/semana en agenda; dos sprints sin él se escala como impedimento |
| Decisiones abiertas del cliente que frenan trabajo | PO | Fecha límite por decisión (último momento responsable); si vence, se avanza con supuesto documentado |
| Tarifas y contenido reales que no llegan | PO | Es requisito de la Definition of Ready del Sprint 2 |
| El no-show hace insuficiente el anticipo | PO | Se mide desde el primer mes de venta |
| Datos personales de los pax | Developers | Consentimiento en el checkout (S3) y acceso por rol (S4). No se posterga |
| Equipo chico: una ausencia pega fuerte | SM | Revisión cruzada obligatoria, sin dueños únicos de módulo |

## Métricas

De proceso, para el equipo y no para reportar hacia arriba: Sprint Goal
cumplido (sí/no), velocidad, defectos escapados, tiempo de ciclo.

De producto, disponibles solo después del Sprint 3: conversión del checkout,
apartados expirados y tasa de no-show.

La velocidad sirve para pronosticar, no para medir productividad. No se compara
entre equipos ni se usa en evaluaciones individuales: en el momento en que se
vuelve meta, se infla y deja de servir para lo único que servía.

## Fuentes

Scrum Guide 2020 (Schwaber y Sutherland) · INVEST (Bill Wake) · Gherkin ·
Planning Poker (James Grenning) · yesterday's weather (Extreme Programming) ·
último momento responsable (Lean) · RACI.
