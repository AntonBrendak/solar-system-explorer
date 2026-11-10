import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
};

export default createNextIntlPlugin()(nextConfig);
