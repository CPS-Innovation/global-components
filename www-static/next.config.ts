import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: "/static",
  images: {
    unoptimized: true,
  },
  distDir: "out",
};

export default nextConfig;
