/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tells Webpack/Turbopack to skip bundling this heavy Node library
  serverExternalPackages: ['pdf-parse'],
  // Fallback syntax if you are on an older Next.js 14 version
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  }
};

export default nextConfig;
