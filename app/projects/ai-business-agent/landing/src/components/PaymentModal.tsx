"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, CheckCircle, Loader2, Zap, CreditCard, Clock, Link } from "lucide-react";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: {
    name: string;
    monthly: number;
    yearly: number;
    lightning?: number;
  };
  yearly: boolean;
}

type Tab = "card" | "lightning" | "onchain";

interface OnChainInvoice {
  address: string;
  amountBTC: number;
  amountUSD: number;
  btcRate: number;
  confirmationsRequired: number;
  uri: string;
  status: string;
  confirmations: number;
}

export default function PaymentModal({ isOpen, onClose, plan, yearly }: PaymentModalProps) {
  const [tab, setTab] = useState<Tab>("card");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedOnChain, setCopiedOnChain] = useState(false);
  const [invoiceStatus, setInvoiceStatus] = useState<"waiting" | "confirmed" | "expired">("waiting");
  const [timeLeft, setTimeLeft] = useState(900); // 15 min for lightning

  // On-chain state
  const [onChainInvoice, setOnChainInvoice] = useState<OnChainInvoice | null>(null);
  const [onChainLoading, setOnChainLoading] = useState(false);
  const [onChainStatus, setOnChainStatus] = useState<"idle" | "waiting" | "confirming" | "confirmed">("idle");
  const [onChainConfirmations, setOnChainConfirmations] = useState(0);

  const price = yearly ? plan.yearly : plan.monthly;
  const lightningPrice = plan.lightning ?? Math.round(price * 0.9);
  const onChainPrice = Math.round(price * 0.9);
  const satsAmount = Math.round(lightningPrice * 100_000); // rough USD→sats mock

  // Countdown timer for lightning
  useEffect(() => {
    if (!isOpen || tab !== "lightning" || invoiceStatus !== "waiting") return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setInvoiceStatus("expired");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, tab, invoiceStatus]);

  // Fetch on-chain invoice when tab selected
  useEffect(() => {
    if (!isOpen || tab !== "onchain" || onChainInvoice) return;
    setOnChainLoading(true);
    fetch("/api/bitcoin/invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: plan.name.toLowerCase(), yearly }),
    })
      .then((r) => r.json())
      .then((data) => {
        setOnChainInvoice(data);
        setOnChainStatus("waiting");
      })
      .catch(() => {
        // Use fallback mock data
        const mockRate = 95000;
        const amt = parseFloat((onChainPrice / mockRate).toFixed(8));
        const addr = "bc1qexample" + "x".repeat(30);
        setOnChainInvoice({
          address: addr,
          amountBTC: amt,
          amountUSD: onChainPrice,
          btcRate: mockRate,
          confirmationsRequired: 3,
          uri: `bitcoin:${addr}?amount=${amt}`,
          status: "waiting",
          confirmations: 0,
        });
        setOnChainStatus("waiting");
      })
      .finally(() => setOnChainLoading(false));
  }, [isOpen, tab, onChainInvoice, plan.name, yearly, onChainPrice]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setTab("card");
      setLoading(false);
      setCopied(false);
      setCopiedOnChain(false);
      setInvoiceStatus("waiting");
      setTimeLeft(900);
      setOnChainInvoice(null);
      setOnChainStatus("idle");
      setOnChainConfirmations(0);
      setOnChainLoading(false);
    }
  }, [isOpen]);

  const handleStripeCheckout = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.name.toLowerCase(), yearly }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [plan.name, yearly]);

  const mockInvoice = "lnbc" + "x".repeat(60) + "mock_invoice_placeholder";

  const copyInvoice = () => {
    navigator.clipboard.writeText(mockInvoice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyOnChainAddress = () => {
    if (!onChainInvoice) return;
    navigator.clipboard.writeText(onChainInvoice.address);
    setCopiedOnChain(true);
    setTimeout(() => setCopiedOnChain(false), 2000);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: boolean }[] = [
    { key: "card", label: "Card", icon: <CreditCard size={14} /> },
    { key: "lightning", label: "Lightning", icon: <Zap size={14} />, badge: true },
    { key: "onchain", label: "On-Chain", icon: <Link size={14} />, badge: true },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="bg-dark-card border border-white/[0.06] rounded-2xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>

          <h3 className="text-xl font-bold text-white mb-1">
            Subscribe to {plan.name}
          </h3>
          <p className="text-white/40 text-sm mb-6">
            ${price}/mo {yearly && "(billed yearly)"}
          </p>

          {/* Tabs */}
          <div className="flex bg-white/5 rounded-xl p-1 mb-6">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  tab === t.key
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                {t.icon}
                {t.label}
                {t.badge && (
                  <span className="text-cyan text-[10px]">-10%</span>
                )}
              </button>
            ))}
          </div>

          {/* Card Tab */}
          {tab === "card" && (
            <div className="space-y-4">
              <p className="text-white/50 text-sm">
                You&apos;ll be redirected to Stripe&apos;s secure checkout.
              </p>
              <button
                onClick={handleStripeCheckout}
                disabled={loading}
                className="w-full py-3.5 gradient-btn rounded-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>Pay ${price}/mo with Card</>
                )}
              </button>
              <div className="flex items-center justify-center gap-4 text-white/20 text-xs">
                <span>🔒 SSL Encrypted</span>
                <span>•</span>
                <span>Powered by Stripe</span>
              </div>
            </div>
          )}

          {/* Lightning Tab */}
          {tab === "lightning" && (
            <div className="space-y-4">
              {invoiceStatus === "waiting" && (
                <>
                  <div className="bg-white rounded-xl p-6 flex items-center justify-center">
                    <div className="w-48 h-48 bg-[#f0f0f0] rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                      <div className="text-center text-gray-400 text-xs">
                        <Zap size={32} className="mx-auto mb-2 text-[#f7931a]" />
                        Lightning QR
                        <br />
                        (mock)
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-bold text-lg">
                      {satsAmount.toLocaleString()} sats
                    </p>
                    <p className="text-cyan text-sm font-medium">
                      ${lightningPrice}/mo — Save 10%!
                    </p>
                  </div>
                  <button
                    onClick={copyInvoice}
                    className="w-full py-3 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    {copied ? (
                      <>
                        <CheckCircle size={16} className="text-cyan" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        Copy Invoice
                      </>
                    )}
                  </button>
                  <div className="flex items-center justify-center gap-2 text-white/30 text-xs">
                    <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    Waiting for payment • Expires in {formatTime(timeLeft)}
                  </div>
                </>
              )}
              {invoiceStatus === "confirmed" && (
                <div className="text-center py-8">
                  <CheckCircle size={48} className="mx-auto text-cyan mb-4" />
                  <p className="text-white font-bold text-lg">Payment Confirmed!</p>
                  <p className="text-white/50 text-sm">Your plan is now active.</p>
                </div>
              )}
              {invoiceStatus === "expired" && (
                <div className="text-center py-8">
                  <p className="text-white/50 text-lg mb-4">Invoice expired</p>
                  <button
                    onClick={() => {
                      setInvoiceStatus("waiting");
                      setTimeLeft(900);
                    }}
                    className="px-6 py-2 bg-white/10 text-white rounded-full text-sm hover:bg-white/20"
                  >
                    Generate New Invoice
                  </button>
                </div>
              )}
            </div>
          )}

          {/* On-Chain Tab */}
          {tab === "onchain" && (
            <div className="space-y-4">
              {onChainLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={32} className="animate-spin text-[#f7931a]" />
                </div>
              )}

              {!onChainLoading && onChainInvoice && onChainStatus === "waiting" && (
                <>
                  {/* QR Code area */}
                  <div className="bg-white rounded-xl p-6 flex items-center justify-center">
                    <div className="w-48 h-48 bg-[#f0f0f0] rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                      <div className="text-center text-gray-400 text-xs">
                        <svg className="mx-auto mb-2 w-8 h-8 text-[#f7931a]" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.546z" />
                          <path fill="white" d="M17.204 10.796c.234-1.576-.964-2.424-2.605-2.99l.533-2.136-1.3-.324-.518 2.08c-.342-.085-.693-.166-1.042-.245l.522-2.092-1.3-.324-.532 2.135a84 84 0 01-.832-.196l.001-.007-1.793-.448-.346 1.389s.964.221.944.235c.527.131.622.48.606.757l-.607 2.435c.036.009.083.023.135.043l-.137-.034-.85 3.412c-.065.16-.228.399-.596.308.013.019-.944-.236-.944-.236l-.645 1.489 1.692.422c.315.079.623.161.927.238l-.537 2.158 1.299.324.533-2.138c.355.096.7.185 1.036.27l-.531 2.127 1.3.324.537-2.153c2.211.419 3.874.25 4.573-1.75.563-1.612-.028-2.542-1.193-3.15.849-.195 1.487-.754 1.658-1.906zm-2.967 4.159c-.4 1.612-3.114.74-3.994.522l.712-2.855c.88.22 3.7.655 3.282 2.333zm.401-4.183c-.366 1.466-2.625.721-3.357.539l.646-2.589c.732.183 3.09.524 2.711 2.05z" />
                        </svg>
                        On-Chain QR
                        <br />
                        <span className="text-[10px] break-all">{onChainInvoice.uri.slice(0, 30)}...</span>
                      </div>
                    </div>
                  </div>

                  {/* Amount info */}
                  <div className="text-center">
                    <p className="text-white font-bold text-lg">
                      {onChainInvoice.amountBTC} BTC
                    </p>
                    <p className="text-cyan text-sm font-medium">
                      ${onChainInvoice.amountUSD}/mo — Save 10%!
                    </p>
                    <p className="text-white/20 text-xs mt-1">
                      1 BTC = ${onChainInvoice.btcRate.toLocaleString()} • Exchange rate updates every 60s
                    </p>
                  </div>

                  {/* Address with copy */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">Send exactly {onChainInvoice.amountBTC} BTC to:</p>
                    <div className="flex items-center gap-2">
                      <code className="text-white text-xs break-all flex-1 font-mono">
                        {onChainInvoice.address}
                      </code>
                      <button
                        onClick={copyOnChainAddress}
                        className="flex-shrink-0 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        {copiedOnChain ? (
                          <CheckCircle size={14} className="text-cyan" />
                        ) : (
                          <Copy size={14} className="text-white/60" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center justify-center gap-2 text-white/30 text-xs">
                    <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    Waiting for transaction...
                  </div>

                  {/* Note */}
                  <div className="flex items-start gap-2 bg-white/5 rounded-xl p-3">
                    <Clock size={14} className="text-white/30 mt-0.5 flex-shrink-0" />
                    <p className="text-white/30 text-xs">
                      On-chain payments may take 10–60 minutes to confirm. Requires {onChainInvoice.confirmationsRequired} confirmation{onChainInvoice.confirmationsRequired > 1 ? "s" : ""}.
                    </p>
                  </div>
                </>
              )}

              {!onChainLoading && onChainStatus === "confirming" && (
                <div className="text-center py-8">
                  <Loader2 size={48} className="mx-auto text-[#f7931a] mb-4 animate-spin" />
                  <p className="text-white font-bold text-lg">
                    {onChainConfirmations}/{onChainInvoice?.confirmationsRequired ?? 3} confirmations...
                  </p>
                  <p className="text-white/50 text-sm">Transaction detected. Waiting for confirmations.</p>
                </div>
              )}

              {!onChainLoading && onChainStatus === "confirmed" && (
                <div className="text-center py-8">
                  <CheckCircle size={48} className="mx-auto text-cyan mb-4" />
                  <p className="text-white font-bold text-lg">✅ Payment Confirmed!</p>
                  <p className="text-white/50 text-sm">Your plan is now active.</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
