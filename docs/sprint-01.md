# Sprint 1 · semanas 1–2

> **Sprint Goal**
> Un visitante puede encontrar y explorar los tours y las propiedades reales,
> en español e inglés, desde su teléfono.

**Pronóstico:** 22 puntos · **Capacidad estimada:** 20–24

Este sprint no vende nada todavía, y eso es deliberado: el Sprint Goal es que
exista una vitrina real que el SME pueda criticar con sus propios productos.
Sin eso, el motor de precios del Sprint 2 se construiría sobre supuestos de
contenido.

---

## S1-1 · Andamiaje y compuertas automatizadas

**5 puntos** · Developers

> **Como** equipo, **quiero** que el proyecto se despliegue solo y rechace
> automáticamente lo que no cumple el Definition of Done, **para** que la
> calidad no dependa de que alguien se acuerde de revisarla.

```gherkin
Dado un cambio propuesto en una rama
Cuando se abre la solicitud de integración
Entonces se ejecutan typecheck, linter, pruebas de garantías y pruebas de integración
Y la solicitud se bloquea si cualquiera falla

Dado una base de datos vacía
Cuando se ejecuta la secuencia de migraciones
Entonces aplica limpia y sin intervención manual

Dado un cambio integrado a la rama principal
Cuando termina el pipeline
Entonces queda desplegado en staging con su propia URL
```

**Notas técnicas.** El pipeline levanta un Postgres de servicio y corre las
migraciones desde cero: es la única forma de que la compuerta "migraciones
aplican limpias" signifique algo. Las pruebas de concurrencia se ejecutan solo
cuando el cambio toca inventario o pagos, porque tardan.

---

## S1-2 · Sistema de diseño base

**5 puntos** · Developers

> **Como** huésped que está de vacaciones, **quiero** una interfaz legible en mi
> teléfono a pleno sol y con una mano ocupada, **para** poder decidir sin
> pelearme con la pantalla.

```gherkin
Dado cualquier texto de la interfaz sobre su fondo
Cuando se mide el contraste
Entonces cumple al menos AA de WCAG 2.2 (4.5:1 en texto normal)

Dado un control interactivo
Cuando se navega con teclado
Entonces recibe un indicador de foco visible

Dado un control que se toca con el dedo
Entonces su área táctil mide al menos 44 por 44 puntos

Dado que el visitante configuró tema oscuro en su sistema
Cuando abre el sitio
Entonces la interfaz respeta esa preferencia sin perder contraste
```

**Notas técnicas.** Tokens de color, tipografía y espaciado como variables CSS,
una sola definición por token y ambos temas resueltos por tokens — no por
sobreescrituras dispersas. Componentes base: botón, campo, tarjeta, insignia,
galería, encabezado.

---

## S1-3 · Rutas en dos idiomas con metadatos

**3 puntos** · Developers

> **Como** turista que busca "tulum cenote tour" en inglés, **quiero** encontrar
> la página en mi idioma en el buscador, **para** llegar al sitio sin pasar por
> un intermediario que cobra comisión.

```gherkin
Dado un producto publicado con traducciones en español e inglés
Cuando se visita /es/tours/<slug> y /en/tours/<slug>
Entonces cada ruta responde 200 con su contenido en el idioma correspondiente
Y cada una declara la otra como alternativa de idioma
Y ambas declaran título y descripción propios para buscadores

Dado un visitante cuyo navegador prefiere inglés
Cuando entra a la raíz del sitio
Entonces llega a la versión en inglés

Dado un producto sin traducción al inglés
Cuando se visita su ruta /en
Entonces responde 404 en lugar de mostrar contenido en español
```

**Notas técnicas.** Rutas separadas por idioma, no un selector que cambia el
contenido sin cambiar la URL: si las dos versiones comparten dirección, solo una
posiciona en buscadores. El último criterio evita la trampa de publicar
contenido a medio traducir.

---

## S1-4 · Listado de catálogo con filtros

**5 puntos** · Developers

> **Como** visitante que aún no sabe qué quiere, **quiero** filtrar por tipo,
> ubicación y número de personas, **para** ver solo lo que me sirve.

```gherkin
Dado un catálogo con tours y propiedades publicados
Cuando se abre el listado sin filtros
Entonces se muestran únicamente los productos publicados
Y los borradores y archivados no aparecen

Dado que el visitante filtra por tipo "tour" y 4 personas
Cuando se aplica el filtro
Entonces solo aparecen tours con capacidad para 4 o más
Y los filtros aplicados quedan en la URL, compartible y recargable

Dado un filtro sin resultados
Entonces se explica qué filtro quitar, en lugar de mostrar una lista vacía
```

**Notas técnicas.** Los filtros viven en la URL —no en estado del cliente— para
que una búsqueda se pueda compartir y para que el servidor pueda renderizarla.
La capacidad de un tour viene del cupo de su variante; la de una propiedad, de
`max_guests` de la unidad.

---

## S1-5 · Ficha de producto

**3 puntos** · Developers · **historia de referencia del equipo**

> **Como** visitante interesado, **quiero** ver fotos grandes, qué incluye y
> dónde está, **para** confiar lo suficiente para reservar.

```gherkin
Dado un producto publicado con galería y traducciones
Cuando se abre su ficha
Entonces se ven galería, nombre, resumen, descripción, qué incluye y qué no
Y se ve su ubicación
Y para una propiedad se ven capacidad, recámaras, camas y baños
Y para un tour se ven duración, punto de encuentro y precios por tipo de pasajero

Dado un producto en estado borrador
Cuando se abre su ficha directamente por URL
Entonces responde 404
```

**Notas técnicas.** El precio que se muestra aquí es "desde", derivado de la
tarifa más baja vigente; el precio exacto llega en el Sprint 2 con el motor de
cotización. No se inventa un total en esta pantalla.

---

## S1-6 · Spike: entrega de imágenes

**1 punto** · Developers · caja de tiempo: 4 horas

> **Pregunta a responder:** ¿cómo se sirven las fotos —el activo de venta más
> importante— en varios tamaños y formato moderno, sin que la galería sea lo que
> más tarda en cargar?

Un spike no entrega funcionalidad: entrega una decisión. Al terminar la caja de
tiempo se escribe la recomendación en `docs/decisiones/` con la opción elegida y
por qué se descartaron las otras. Si la caja de tiempo se agota sin conclusión,
eso también es un resultado y se lleva al Planning siguiente.

---

## Dependencias y pendientes

| Qué | Dueño | Para cuándo |
|---|---|---|
| Iniciar el trámite de la cuenta de Stripe | PO | **día 1** — la verificación del negocio puede tardar semanas y bloquearía el Sprint 3 |
| Fotos y textos reales de al menos 3 productos | SME | día 3, o el S1-5 se demuestra con contenido de relleno |
| Tarifas y temporadas reales del año | PO / SME | antes del Planning del Sprint 2 (requisito de su DoR) |

## Qué se demuestra en el Sprint Review

Navegar el catálogo real en un teléfono, en los dos idiomas, con las fotos del
cliente. El SME debería poder señalar qué está mal de su propio producto — ese
es el punto del sprint.

---

## Cierre del sprint

**Sprint Goal: cumplido.** Las seis historias terminadas y verificadas.

| Historia | Pts | Estado |
|---|---|---|
| S1-1 Andamiaje y compuertas automatizadas | 5 | terminada |
| S1-2 Sistema de diseño base | 5 | terminada |
| S1-3 Rutas en dos idiomas con metadatos | 3 | terminada |
| S1-4 Listado de catálogo con filtros | 5 | terminada |
| S1-5 Ficha de producto | 3 | terminada |
| S1-6 Spike: entrega de imágenes | 1 | terminada — [decisión 0001](decisiones/0001-entrega-de-imagenes.md) |
| **Velocidad real** | **22** | |

La velocidad de 22 puntos es el pronóstico del Sprint 2 (*yesterday's weather*),
no una meta a superar.

### Evidencia

`scripts/smoke.sh` verifica **46 criterios de aceptación** contra el sitio
construido, y es lo mismo que corre el pipeline. Las garantías del Sprint 0
siguen intactas: 12 pruebas de SQL, 8 de integración y la prueba de carga sin
sobreventa.

### Hallazgos del sprint

Tres cosas salieron de verificar, no de leer el código:

1. **El listado se estaba horneando en el build.** Habría seguido mostrando
   productos despublicados y precios viejos hasta el siguiente despliegue. Se
   detectó cambiando un dato en la base y recargando, no leyendo el reporte del
   build — que además marcaba la ruta como estática cuando ya no lo era.
2. **`canonical` y `hreflang` salían con URLs relativas.** Los buscadores
   ignoran `hreflang` relativo, así que la versión en inglés no habría
   posicionado: exactamente el tráfico que justifica tener dos idiomas.
3. **Las tarjetas sin foto reservaban un hueco gris.** Se lee como una imagen que
   no cargó, y en una vitrina eso resta confianza.

### Deuda técnica anotada, con dueño y fecha

- **Imágenes sin optimizar.** La vitrina usa `<img>` con ancho y alto
  declarados y carga diferida sobre contenido de relleno. Se paga en el Sprint 5
  con el módulo de subida, según la decisión 0001. No es un descuido: es una
  espera deliberada a que existan las fotos reales.
- **Contenido de relleno en las galerías.** Depende de la entrega del SME.

### Para el Sprint Review

Navegar el catálogo en un teléfono, en los dos idiomas, y que el SME señale qué
está mal de sus propios productos. Eso es lo que el sprint tenía que habilitar.

### Para la Retrospective

Los tres hallazgos comparten una causa: **el reporte de una herramienta no es
evidencia del comportamiento**. El marcador del build decía "estático", el HTML
decía que los `hreflang` estaban ahí, y ninguno de los dos era la verdad
completa. Propuesta para el DoD: cuando un criterio se pueda comprobar desde
fuera del proceso, se comprueba desde fuera.
