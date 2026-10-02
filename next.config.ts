import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixa a raiz do projeto (evita que um package-lock.json em pasta acima seja tomado como raiz).
  turbopack: { root: __dirname },
};

export default nextConfig;
