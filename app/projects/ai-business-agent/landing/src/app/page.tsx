import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import BrainAnimation from "@/components/BrainAnimation";
import SocialProof from "@/components/SocialProof";
import TheBrain from "@/components/TheBrain";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import ProductShowcase from "@/components/ProductShowcase";
import Pricing from "@/components/Pricing";
import Security from "@/components/Security";
import Testimonials from "@/components/Testimonials";
import FAQ from "@/components/FAQ";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <section className="relative bg-gradient-to-b from-[#f0f7ff] via-white to-white py-8 px-6">
        <div className="max-w-5xl mx-auto text-center mb-12">
          <h2
            className="text-3xl md:text-4xl font-bold text-gray-900"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Watch the <span className="gradient-text">Brain</span> work
          </h2>
          <p className="mt-3 text-gray-500">Scroll down — each scene shows a different superpower.</p>
        </div>
        <BrainAnimation />
      </section>
      <SocialProof />
      <TheBrain />
      <Features />
      <HowItWorks />
      <ProductShowcase />
      <Pricing />
      <Security />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}
