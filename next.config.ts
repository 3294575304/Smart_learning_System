import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "p1.itc.cn",
        pathname: "/q_70/images03/**",
      },
    ],
  },
  reactStrictMode: true,
};

export default nextConfig;
