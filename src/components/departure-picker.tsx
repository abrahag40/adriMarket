"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PickerDeparture = {
  id: string;
  /** Fecha local de la salida (`YYYY-MM-DD`), ya en la zona del producto. */
  date: string;
  /** Etiqueta corta ya formateada en el servidor: "vie 4 de sep". */
  label: string;
  seats: number;
  /** "12 lugares disponibles", ya resuelta: una función no cruza al cliente. */
  seatsLabel: string;
};

export type PickerLabels = {
  field: string;
  placeholder: string;
  open: string;
  prevMonth: string;
  nextMonth: string;
  weekdays: readonly string[];
  noDeparture: string;
};

/** Lunes primero, como la referencia y como el resto del sitio. */
function primerLunes(anio: number, mes: number): Date {
  const primero = new Date(Date.UTC(anio, mes, 1));
  const dia = (primero.getUTCDay() + 6) % 7;
  primero.setUTCDate(primero.getUTCDate() - dia);
  return primero;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Selección de salida con calendario desplegable · calca el de la referencia
 *
 * La plantilla no usa un desplegable de fechas: usa un campo de solo lectura
 * con el calendario encima, y **las fechas vendibles viajan en el HTML**
 * (`data-tour-date`, un arreglo de fechas ISO) para que moverse de mes sea
 * instantáneo. Aquí es lo mismo: la página manda las salidas de los próximos
 * meses y navegar entre ellos no toca el servidor.
 *
 * Lo que sí sigue siendo del servidor es el precio. Al elegir un día se
 * escribe el `id` de la salida en el campo oculto y se envía el formulario,
 * que es el mismo camino de siempre: la cotización la calcula el servidor y
 * la selección queda en la URL.
 *
 * Sin JavaScript esto no se monta y la página deja el `<select>` de siempre,
 * que funciona igual aunque se vea distinto.
 */
export function DeparturePicker({
  departures,
  selectedId,
  locale,
  labels,
  fallback,
}: {
  departures: PickerDeparture[];
  selectedId: string | null;
  locale: string;
  labels: PickerLabels;
  /** El `<select>` de siempre: es lo que se sirve y lo que queda sin JavaScript. */
  fallback: React.ReactNode;
}) {
  const [valor, setValor] = useState(selectedId ?? "");
  const [abierto, setAbierto] = useState(false);
  /* El calendario aparece **después** de hidratar. Así el HTML que sale del
     servidor —y el que ve una conexión sin JavaScript— sigue siendo el
     desplegable nativo, que funciona sin nada encima. */
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const contenedor = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLButtonElement>(null);

  const porFecha = useMemo(() => {
    const mapa = new Map<string, PickerDeparture>();
    /* Si un día tuviera dos salidas se queda la que aún tiene lugares: es la
       única que el huésped puede comprar. */
    for (const d of departures) {
      const previa = mapa.get(d.date);
      if (!previa || (previa.seats === 0 && d.seats > 0)) mapa.set(d.date, d);
    }
    return mapa;
  }, [departures]);

  const elegida = departures.find((d) => d.id === valor) ?? null;

  const [visible, setVisible] = useState(() => {
    const base = elegida?.date ?? departures[0]?.date ?? iso(new Date());
    return { anio: Number(base.slice(0, 4)), mes: Number(base.slice(5, 7)) - 1 };
  });

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        campo.current?.focus();
      }
    };
    const alTocarFuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("keydown", alTeclear);
    document.addEventListener("mousedown", alTocarFuera);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.removeEventListener("mousedown", alTocarFuera);
    };
  }, [abierto]);

  const nombreMes = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(visible.anio, visible.mes, 1)));

  const celdas = useMemo(() => {
    const inicio = primerLunes(visible.anio, visible.mes);
    return Array.from({ length: 42 }, (_, i) => {
      const dia = new Date(inicio);
      dia.setUTCDate(dia.getUTCDate() + i);
      return { fecha: iso(dia), numero: dia.getUTCDate(), delMes: dia.getUTCMonth() === visible.mes };
    });
  }, [visible]);

  function moverMes(delta: number) {
    setVisible((v) => {
      const d = new Date(Date.UTC(v.anio, v.mes + delta, 1));
      return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() };
    });
  }

  function elegir(salida: PickerDeparture, boton: HTMLButtonElement) {
    setValor(salida.id);
    setAbierto(false);
    campo.current?.focus();
    /* El precio lo recalcula el servidor: se envía el formulario de siempre,
       que ya navega del lado del cliente y deja la selección en la URL. */
    boton.form?.requestSubmit();
  }

  if (!montado) return <>{fallback}</>;

  return (
    <div className="field field-wide">
      <span className="picker-label" id="picker-label">
        {labels.field}
      </span>

      <div className="picker" ref={contenedor}>
        <span className="picker-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
          </svg>
        </span>

        <button
          type="button"
          className="picker-field"
          ref={campo}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-labelledby="picker-label"
          onClick={() => setAbierto((a) => !a)}
        >
          <span className={elegida ? undefined : "picker-vacio"}>
            {elegida ? elegida.label : labels.placeholder}
          </span>
          <span className="picker-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        <input type="hidden" name="departure" value={valor} />

        {abierto ? (
          <div className="picker-pop" role="dialog" aria-label={labels.open}>
            <div className="picker-nav">
              <button type="button" onClick={() => moverMes(-1)}>
                <span className="visually-hidden">{labels.prevMonth}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <p className="picker-month" aria-live="polite">
                {nombreMes}
              </p>
              <button type="button" onClick={() => moverMes(1)}>
                <span className="visually-hidden">{labels.nextMonth}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="picker-week">
              {labels.weekdays.map((dia, i) => (
                <span key={i}>{dia}</span>
              ))}
            </div>

            <div className="picker-grid">
              {celdas.map((celda) => {
                const salida = porFecha.get(celda.fecha);
                const vendible = Boolean(salida && salida.seats > 0);
                if (!vendible) {
                  return (
                    <span
                      key={celda.fecha}
                      className={`picker-day picker-day-off${celda.delMes ? "" : " picker-day-fuera"}`}
                      aria-hidden={celda.delMes ? undefined : "true"}
                    >
                      {celda.numero}
                    </span>
                  );
                }
                return (
                  <button
                    key={celda.fecha}
                    type="button"
                    className={`picker-day picker-day-libre${salida!.id === valor ? " picker-day-elegido" : ""}`}
                    aria-pressed={salida!.id === valor}
                    title={salida!.seatsLabel}
                    onClick={(e) => elegir(salida!, e.currentTarget)}
                  >
                    {celda.numero}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <p className="picker-seats">
        {elegida ? elegida.seatsLabel : labels.noDeparture}
      </p>
    </div>
  );
}
