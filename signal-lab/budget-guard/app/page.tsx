import { Faq } from "@/components/landing/Faq";
import { Features } from "@/components/landing/Features";
import { FinalCta } from "@/components/landing/FinalCta";
import { Hero } from "@/components/landing/Hero";
import { JsonLd } from "@/components/landing/JsonLd";
import { Pricing } from "@/components/landing/Pricing";
import { Problem } from "@/components/landing/Problem";
import { SocialProof } from "@/components/landing/SocialProof";

// Fully static: everything comes from product.config.ts.
export default function Home() {
  return (
    <>
      <JsonLd />
      <Hero />
      <Problem />
      <Features />
      <SocialProof />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}
