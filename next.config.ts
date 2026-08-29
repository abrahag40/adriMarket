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
  experimental: {
    serverActions: {
      // El límite por defecto de una Server Action es 1 MB — mucho más
      // estricto que los 4.5 MB que Vercel permite por función, y nadie lo
      // había puesto a prueba: la subida de fotos del panel es una Server
      // Action, no una ruta de API, así que el límite documentado en la
      // decisión 0005 nunca fue el que de verdad aplicaba. Una foto de
      // teléfono de 2-3 MB ya lo rebasaba con un 413 silencioso.
      // 4 MB deja margen bajo el techo real de la plataforma.
      bodySizeLimit: "4mb",
    },
  },
};

export default config;
