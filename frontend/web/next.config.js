/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@transport/ui', '@transport/utils'],
  webpack: (config) => {
    // Handle TypeScript files in workspace packages
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs']
    };
    return config;
  }
}

module.exports = nextConfig
