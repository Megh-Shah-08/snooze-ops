/** @type {import('next').NextConfig} */
const backendUrl =
  process.env.BACKEND_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://snooze-ops-backend.onrender.com'
    : 'http://127.0.0.1:8000');

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
