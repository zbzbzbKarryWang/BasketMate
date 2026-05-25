/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/proxy/:path*',
        destination: 'http://backend:8000/api/:path*',
      },
      {
        source: '/api/shopping/:path*',
        destination: 'http://backend:8000/api/shopping/:path*',
      },
    ]
  },
}

export default nextConfig
