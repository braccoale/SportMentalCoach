import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

const nextConfig: NextConfig = {
  // Local Windows builds can skip Next's child-process type checker after the
  // standalone `tsc --noEmit` check has passed. CI/Vercel keep it enabled.
  typescript: {
    ignoreBuildErrors: process.env.NEXT_SKIP_BUILD_TYPECHECK === '1',
  },
  experimental: {
    ppr: true,
    clientSegmentCache: true
  }
};

export default withNextIntl(nextConfig);
