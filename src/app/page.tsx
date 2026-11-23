import Experience from "@/components/Experience";
import { About, Contact, GithubCastle, MapHero, Stack, Work } from "@/components/home/Sections";
import { getPortfolio, person, site, siteUrl } from "@/lib/portfolio";

export default async function Home() {
  const data = await getPortfolio();
  const { profile, projects, links } = data;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": `${siteUrl}/#person`,
        name: profile.name,
        alternateName: profile.alias,
        jobTitle: profile.role,
        description: site.description,
        url: siteUrl,
        email: `mailto:${profile.email}`,
        image: profile.avatar ?? undefined,
        knowsAbout: [...profile.focus, ...data.stack],
        sameAs: links.map((l) => l.href),
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: site.title,
        description: site.description,
        inLanguage: "en",
        author: { "@id": `${siteUrl}/#person` },
      },
      {
        "@type": "ItemList",
        name: `Projects by ${person.name}`,
        itemListElement: projects.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "SoftwareSourceCode",
            name: p.title,
            description: p.summary,
            codeRepository: p.source,
            url: p.live ?? p.source,
            image: `${siteUrl}${p.poster}`,
            programmingLanguage: p.language ?? p.tech[0],
            keywords: p.tech.join(", "),
            author: { "@id": `${siteUrl}/#person` },
          },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Experience
        route="home"
        signs={projects.map((p) => ({ title: p.title, clip: p.clip ?? "" }))}
        loaderLines={["inflating balloons", "teaching dolphins to jump", "waking the frog", "planting lollipops"]}
      >
        <MapHero data={data} />
        <About data={data} />
        <Stack data={data} />
        <Work data={data} />
        <GithubCastle data={data} />
        <Contact data={data} year={data.year} />
      </Experience>
    </>
  );
}
