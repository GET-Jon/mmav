export function getSiteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.DEPLOY_URL ||
    process.env.URL ||
    "http://localhost:3001";

  const withProtocol = raw.startsWith("http") ? raw : `https://${raw}`;

  return withProtocol.endsWith("/")
    ? withProtocol.slice(0, -1)
    : withProtocol;
}
