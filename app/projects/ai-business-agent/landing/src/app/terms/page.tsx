import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service — Naxora" };

export default function Terms() {
  return (
    <main className="min-h-screen py-32 px-6">
      <article className="max-w-3xl mx-auto prose prose-invert prose-slate">
        <a href="/" className="text-cyan-400 text-sm hover:underline">← Back to Naxora</a>
        <h1 className="text-4xl font-bold mt-6 mb-2">Terms of Service</h1>
        <p className="text-slate-500 text-sm mb-8">Last updated: February 23, 2026</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">1. Acceptance of Terms</h2>
        <p className="text-slate-400 leading-relaxed mb-4">By using Naxora, you agree to these terms. If you don&apos;t agree, please don&apos;t use our service.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">2. Service Description</h2>
        <p className="text-slate-400 leading-relaxed mb-4">Naxora provides AI-powered customer service agents that run locally on your machine. We provide the software, default AI model access, and optional cloud features.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">3. Your Responsibilities</h2>
        <p className="text-slate-400 leading-relaxed mb-4">You are responsible for the content your AI agent provides to customers, ensuring compliance with applicable laws, and maintaining your local system&apos;s security.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">4. Billing & Cancellation</h2>
        <p className="text-slate-400 leading-relaxed mb-4">Paid plans are billed monthly. You can cancel anytime with one click. No contracts, no hidden fees. Refunds are handled on a case-by-case basis.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">5. Data Ownership</h2>
        <p className="text-slate-400 leading-relaxed mb-4">You own all your data. Your business information, knowledge bases, and customer conversations remain yours. We do not claim any rights to your content.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">6. Limitation of Liability</h2>
        <p className="text-slate-400 leading-relaxed mb-4">Naxora is provided &ldquo;as is.&rdquo; We are not liable for any damages arising from the use of our service, including but not limited to incorrect AI responses or system downtime.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">7. Contact</h2>
        <p className="text-slate-400 leading-relaxed">Questions? Email support@naxora.ai.</p>
      </article>
    </main>
  );
}
