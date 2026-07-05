/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The reader is a local single-user app; the frontend calls the API directly at
  // NEXT_PUBLIC_API_BASE_URL (default http://localhost:8000). PDF/file URLs are absolute to the API
  // so byte-range requests work without passing through Next.js rewrites.
  eslint: {
    // Lint is run explicitly in CI via `next lint`; don't fail production builds on it.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
