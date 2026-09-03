import { FlatCompat } from "@eslint/eslintrc";

/**
 * Configuración del linter.
 *
 * Se usa el CLI de ESLint y no `next lint`, que quedó deprecado en Next 15 y no
 * es compatible con ESLint 9. `eslint-config-next` todavía se publica en el
 * formato antiguo, así que se adapta con FlatCompat: es el puente oficial y
 * evita reconstruir a mano el conjunto de reglas de React y de accesibilidad.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      // Lo genera Next en cada build; no es código nuestro.
      "next-env.d.ts",
      // Generado por introspección de la base: lo que haya que corregir se
      // corrige en el esquema, no en el archivo generado.
      "src/db/generated/**",
      // Copias del repositorio que crean las sesiones con worktree. Sin esto
      // `npm run lint` recorre el clon entero —incluido su node_modules— y
      // reporta miles de problemas que no son de este árbol.
      ".claude/worktrees/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // El proyecto ya prohíbe `any` por tsconfig estricto; esta regla duplica
      // el aviso con menos contexto.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
