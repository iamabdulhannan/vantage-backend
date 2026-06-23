// Vercel serverless entry — delegates to the Nest app compiled by `nest build`.
// Kept as plain JS so Vercel's esbuild doesn't strip TypeScript decorator metadata
// (the real app is compiled with tsc, which preserves it).
module.exports = require('../dist/serverless').default;
