/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // This proxies requests from the Next.js frontend to the FastAPI backend
    // to avoid CORS issues in development.
    const backend = process.env.BACKEND_URL || "http://localhost:8081";

    return [
      // Proxy all known backend routes
      {
        source: '/jobs/:path*',
        destination: `${backend}/jobs/:path*`,
      },
      {
        source: '/analyze/:path*',
        destination: `${backend}/analyze/:path*`,
      },
      {
        source: '/cover-letter/:path*',
        destination: `${backend}/cover-letter/:path*`,
      },
       {
        source: '/cover_letters', // Handle specific endpoint from llm.py
        destination: `${backend}/cover_letters`,
      },
      {
        source: '/chat/:path*',
        destination: `${backend}/chat/:path*`,
      },
      {
        source: '/parse/:path*',
        destination: `${backend}/parse/:path*`,
      },
      {
        source: '/qa', // Handle specific endpoint from analyze.py
        destination: `${backend}/qa`,
      },
      {
        source: '/harvest/:path*',
        destination: `${backend}/harvest/:path*`,
      },
    ];
  },
};

export default nextConfig;