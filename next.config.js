/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export', // Static export for Tauri
  assetPrefix: process.env.NODE_ENV === 'production' ? '' : undefined,
  images: {
    unoptimized: true,
  },
  // Exclude API routes from static export (Tauri doesn't use them)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
