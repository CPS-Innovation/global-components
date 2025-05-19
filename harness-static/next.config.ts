import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: process.env.BASE_PATH,
  images: {
    unoptimized: true,
  },
  distDir: "out",
  sassOptions: {
    additionalData: `$govuk-assets-path: "${
      process.env.BASE_PATH || ""
    }/assets/";`,
  },
};

export default nextConfig;
