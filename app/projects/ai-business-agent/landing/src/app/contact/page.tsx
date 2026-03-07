"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, MessageSquare, Clock, Send, CheckCircle, MapPin, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    // For now, simulate send — wire to real email API later
    await new Promise(r => setTimeout(r, 1500));
    setSent(true);
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <nav className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/favicon.svg" alt="Naxora" width={32} height={32} className="rounded-xl" />
            <span className="text-gray-900 font-bold text-lg tracking-wide">NAXORA</span>
          </Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-20">
        {/* Hero */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Get in <span className="bg-gradient-to-r from-cyan-500 to-purple-600 bg-clip-text text-transparent">Touch</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Have a question, feedback, or partnership inquiry? We'd love to hear from you.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-12">
          {/* Contact Info */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }} 
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 space-y-8"
          >
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-6">Contact Information</h2>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-cyan-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Email</p>
                    <a href="mailto:support@naxora.ai" className="text-gray-500 hover:text-cyan-600 transition-colors">support@naxora.ai</a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Live Chat</p>
                    <p className="text-gray-500">Available inside the Naxora app</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Response Time</p>
                    <p className="text-gray-500">We typically respond within 24 hours</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Location</p>
                    <p className="text-gray-500">San Francisco, California</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="border-t border-gray-100 pt-8">
              <h3 className="font-semibold text-gray-900 mb-4">Quick Links</h3>
              <div className="space-y-2">
                <Link href="/#faq" className="block text-gray-500 hover:text-cyan-600 transition-colors text-sm">→ Frequently Asked Questions</Link>
                <Link href="/#pricing" className="block text-gray-500 hover:text-cyan-600 transition-colors text-sm">→ Pricing Plans</Link>
                <Link href="/download" className="block text-gray-500 hover:text-cyan-600 transition-colors text-sm">→ Download Naxora</Link>
                <Link href="/privacy" className="block text-gray-500 hover:text-cyan-600 transition-colors text-sm">→ Privacy Policy</Link>
                <Link href="/terms" className="block text-gray-500 hover:text-cyan-600 transition-colors text-sm">→ Terms of Service</Link>
              </div>
            </div>
          </motion.div>

          {/* Contact Form */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-3"
          >
            {sent ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gray-50 rounded-2xl p-12 text-center"
              >
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Message Sent!</h3>
                <p className="text-gray-500 mb-6">Thank you for reaching out. We'll get back to you within 24 hours.</p>
                <button 
                  onClick={() => { setSent(false); setForm({ name: "", email: "", subject: "", message: "" }); }}
                  className="text-cyan-600 font-medium hover:text-cyan-700 transition-colors"
                >
                  Send another message →
                </button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-gray-50 rounded-2xl p-8 md:p-10 space-y-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Your Name *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Subject *</label>
                  <select
                    required
                    value={form.subject}
                    onChange={e => setForm({ ...form, subject: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                  >
                    <option value="">Select a topic...</option>
                    <option value="general">General Inquiry</option>
                    <option value="sales">Sales & Pricing</option>
                    <option value="support">Technical Support</option>
                    <option value="partnership">Partnership Opportunity</option>
                    <option value="enterprise">Enterprise Plan</option>
                    <option value="bug">Bug Report</option>
                    <option value="feature">Feature Request</option>
                    <option value="billing">Billing Question</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Message *</label>
                  <textarea
                    required
                    rows={6}
                    value={form.message}
                    onChange={e => setForm({ ...form, message: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all resize-none"
                    placeholder="Tell us how we can help..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={sending}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-semibold hover:from-cyan-400 hover:to-purple-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
                >
                  {sending ? (
                    <>Sending...</>
                  ) : (
                    <>Send Message <Send className="w-4 h-4" /></>
                  )}
                </button>

                <p className="text-xs text-gray-400 text-center">
                  By submitting, you agree to our <Link href="/privacy" className="text-cyan-600 hover:underline">Privacy Policy</Link>.
                </p>
              </form>
            )}
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-gray-400">
          © 2026 Naxora. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
