import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — Naxora" };

export default function Privacy() {
  return (
    <main className="min-h-screen py-32 px-6">
      <article className="max-w-3xl mx-auto prose prose-invert prose-slate">
        <a href="/" className="text-cyan-400 text-sm hover:underline">← Back to Naxora</a>
        <h1 className="text-4xl font-bold mt-6 mb-2">Privacy Policy</h1>
        <p className="text-slate-500 text-sm mb-8">Last updated: February 23, 2026</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">Our Core Principle: Local-First</h2>
        <p className="text-slate-400 leading-relaxed mb-4">Naxora is built on a local-first architecture. Your business data, customer conversations, and knowledge base are processed and stored on YOUR machine. We do not have access to your data.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">What We Collect</h2>
        <p className="text-slate-400 leading-relaxed mb-4">We collect minimal data necessary to operate the service: your email address for account creation, billing information for paid plans, and basic usage analytics (message counts, feature usage) — never conversation content.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">AI Processing</h2>
        <p className="text-slate-400 leading-relaxed mb-4">When using our default AI model, conversations are processed through our API but are not stored or used for training. When you bring your own API keys (BYOK), requests go directly from your machine to your chosen provider.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">Data Storage</h2>
        <p className="text-slate-400 leading-relaxed mb-4">All business data, knowledge bases, conversation history, and configurations are stored locally on your machine. We cannot access, read, or recover this data. You have full control.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">Third Parties</h2>
        <p className="text-slate-400 leading-relaxed mb-4">We use Stripe for payment processing and basic analytics tools. We do not sell, rent, or share your personal information with third parties for marketing purposes.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">Contact</h2>
        <p className="text-slate-400 leading-relaxed">For privacy questions, email us at support@naxora.ai.</p>
      </article>
    </main>
  );
}
