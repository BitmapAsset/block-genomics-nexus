import { headers } from "next/headers";

/**
 * Renders one schema.org JSON-LD block. Server component, emits a <script>
 * only: no visual output. `<` is escaped so a string value can never close the
 * tag early. Carries the request nonce (`x-nonce`, set by middleware) like
 * every other script on the page.
 */
export default async function JsonLd({ data }: { data: Record<string, unknown> }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
