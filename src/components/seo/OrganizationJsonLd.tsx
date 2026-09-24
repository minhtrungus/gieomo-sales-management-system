import { OFFICIAL_STORE_CONFIG, OFFICIAL_SAME_AS } from "@/lib/constants";

export function OrganizationJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": ["Organization", "OnlineStore"],
    "@id": `${OFFICIAL_STORE_CONFIG.url}/#organization`,
    name: OFFICIAL_STORE_CONFIG.name,
    alternateName: OFFICIAL_STORE_CONFIG.alternateName,
    url: OFFICIAL_STORE_CONFIG.url,
    logo: {
      "@type": "ImageObject",
      url: OFFICIAL_STORE_CONFIG.logo,
      caption: "Gieo Mơ — Chương trình gây quỹ của Mầm Mơ",
    },
    image: `${OFFICIAL_STORE_CONFIG.url}/icon-192.png`,
    description: OFFICIAL_STORE_CONFIG.description,
    email: "support@gieomo.store",
    sameAs: OFFICIAL_SAME_AS,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${OFFICIAL_STORE_CONFIG.url}/products?search={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer service",
        email: "support@gieomo.store",
        availableLanguage: ["Vietnamese", "vi"],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
