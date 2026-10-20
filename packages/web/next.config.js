/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@interview-prep/shared'],
  experimental: {
    optimizePackageImports: ['@interview-prep/shared'],
  },
};

module.exports = nextConfig;