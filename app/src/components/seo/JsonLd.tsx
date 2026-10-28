/**
 * Renders one schema.org JSON-LD block. Server component, emits a <script>
 * only: no visual output. `<` is escaped so a string value can never close the
 * tag early.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
