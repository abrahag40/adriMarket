import { SpecIcon, type SpecIconName } from "@/components/spec-icon";

export type ValueProp = {
  icon: SpecIconName;
  heading: string;
  body: string;
};

/**
 * Las tres columnas de confianza del cierre de la referencia ("700
 * Destinations", "Best Price Guarantee", "Top Notch Support") son
 * afirmaciones de mercadeo sin nada real detrás en este negocio. El
 * componente clona el patrón —ícono, título, una línea— con tres hechos
 * verdaderos sobre cómo funciona esta reserva, no inventados.
 */
export function ValueProps({ items }: { items: ValueProp[] }) {
  return (
    <ul className="value-props">
      {items.map((item) => (
        <li key={item.heading}>
          <SpecIcon name={item.icon} />
          <div>
            <h3 className="value-prop-heading">{item.heading}</h3>
            <p className="muted">{item.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
