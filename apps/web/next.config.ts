import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@vaasenk/ui', '@vaasenk/shared-types'],
  typedRoutes: true,
};

export default config;
