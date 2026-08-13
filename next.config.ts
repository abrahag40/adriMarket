import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Las páginas de catálogo leen de Postgres en el servidor, así que el
  // runtime de Node es obligatorio (no edge).
  serverExternalPackages: ["postgres"],
  typedRoutes: false,
  eslint: {
    // El linter corre como compuerta propia en el pipeline, no dentro del
    // build: así un aviso de estilo no bloquea un despliegue.
    ignoreDuringBuilds: true,
  },
};

export default config;
