import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: "/static-app",
  images: {
    unoptimized: true,
  },
  distDir: "out",
};

export default nextConfig;
