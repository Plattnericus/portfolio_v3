import type { Metadata } from "next";
import Experience from "@/components/Experience";
import Lost from "@/components/lost/Lost";

export const metadata: Metadata = {
  title: "Lost in candy land",
  description: "This page does not exist. The unicorn is still looking for it.",
  // keep it out of the index and do not point search engines at the home page
  robots: { index: false, follow: true },
  alternates: { canonical: null },
};

export default function NotFound() {
  return (
    <Experience route="lost" loaderLines={["looking under every lollipop", "asking the frog", "checking the castle"]}>
      <Lost />
    </Experience>
  );
}
