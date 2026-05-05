import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import HowItWorksSection from "@/components/HowItWorksSection";
import TokenSection from "@/components/TokenSection";
import ComingSoonSection from "@/components/ComingSoonSection";
import FooterCTA from "@/components/FooterCTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <hr className="section-divider" />
        <div className="py-24">
          <FeaturesSection />
          <HowItWorksSection />
          <TokenSection />
          <ComingSoonSection />
        </div>
        <FooterCTA />
      </main>
      <Footer />
    </>
  );
}
