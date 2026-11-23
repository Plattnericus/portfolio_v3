import type { Metadata, ResolvingMetadata } from "next";
import Experience from "@/components/Experience";
import Hero from "@/components/sunshine/Hero";
import Ride from "@/components/sunshine/Ride";
import Forest from "@/components/sunshine/Forest";
import Specimens from "@/components/sunshine/Specimens";
import Nope from "@/components/sunshine/Nope";
import Finale from "@/components/sunshine/Finale";

const title = "Sunshine Lollipops";
const description = "A hamster rides a unicorn through a candy meadow. Nothing is wrong. Everything is candy.";

// Open Graph and Twitter fields replace the parent's as a whole, so carry over
// the site's preview image and card and only swap in this page's words.
export async function generateMetadata(_: PageProps<"/sunshine">, parent: ResolvingMetadata): Promise<Metadata> {
  const { openGraph, twitter } = await parent;
  return {
    title,
    description,
    alternates: { canonical: "/sunshine" },
    openGraph: {
      type: "website",
      siteName: openGraph?.siteName,
      locale: openGraph?.locale,
      images: openGraph?.images,
      url: "/sunshine",
      title,
      description,
    },
    twitter: { card: "summary_large_image", images: twitter?.images, title, description },
  };
}

export default function Sunshine() {
  return (
    <Experience
      route="sunshine"
      loaderLines={["warming up the sun", "untangling rainbows", "waking the hamster", "licking lollipops (quality control)"]}
    >
      <Hero />
      <Ride />
      <Forest />
      <Specimens />
      <Nope />
      <Finale />
    </Experience>
  );
}
