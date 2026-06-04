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
        destination: (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://backend:8000') + '/api/:path*',
      },
      {
        source: '/api/shopping/:path*',
        destination: (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://backend:8000') + '/api/shopping/:path*',
      },
    ]
  },
}

export default nextConfig