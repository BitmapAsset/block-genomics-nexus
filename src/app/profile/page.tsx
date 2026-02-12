"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import GenomeMini from "@/components/auth/GenomeMini";
import { useAuth } from "@/context/AuthContext";

export default function ProfilePage() {
  const router = useRouter();
  const {
    isConnected,
    walletAddress,
    walletType,
    profile,
    getBitmapBlocks,
    signMessage,
    updateProfile,
    deleteProfile,
    generateGenomeHash,
  } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [website, setWebsite] = useState("");
  const [bitmapBlocks, setBitmapBlocks] = useState<number[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || profile.handle);
    setBio(profile.bio || "");
    setXHandle(profile.links?.x || "");
    setWebsite(profile.links?.website || "");
    setSelectedBlock(profile.bitmapBlock);
  }, [profile]);

  useEffect(() => {
    if (!isConnected) return;
    const loadBlocks = async () => {
      const blocks = await getBitmapBlocks();
      const heights = blocks.map((block) => block.blockHeight);
      setBitmapBlocks(heights);
    };
    loadBlocks();
  }, [isConnected, getBitmapBlocks]);

  const trimmedBio = useMemo(() => bio.slice(0, 280), [bio]);

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold mb-2">Connect your wallet</h1>
        <p className="text-text-secondary mb-6">
          Sign in to view and edit your Block Genomics profile.
        </p>
        <button
          onClick={() => router.push("/connect")}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-6 py-2.5 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25"
        >
          Go to Connect
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="text-5xl mb-4">🧬</div>
        <h1 className="text-2xl font-bold mb-2">No profile yet</h1>
        <p className="text-text-secondary mb-6">
          Create a new profile to start anchoring your agent identity.
        </p>
        <button
          onClick={() => router.push("/connect")}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-6 py-2.5 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25"
        >
          Create Profile
        </button>
      </div>
    );
  }

  const handleSave = async () => {
    setBusy(true);
    updateProfile({
      displayName: displayName || profile.handle,
      bio: trimmedBio,
      links: {
        x: xHandle || undefined,
        website: website || undefined,
      },
    });
    setBusy(false);
  };

  const handleBlockUpdate = async () => {
    if (!selectedBlock || !walletAddress) return;
    setBusy(true);
    await signMessage(`Re-verify anchor block ${selectedBlock}`);
    const genomeHash = await generateGenomeHash(selectedBlock, walletAddress);
    updateProfile({ bitmapBlock: selectedBlock, genomeHash });
    setBusy(false);
  };

  const handleDelete = async () => {
    if (deleteInput !== profile.handle) return;
    setBusy(true);
    await signMessage(`Delete Block Genomics profile @${profile.handle}`);
    deleteProfile();
    setBusy(false);
    router.push("/connect");
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
          <p className="text-text-secondary">Manage your Block Genomics identity.</p>
        </div>
        <div className="flex items-center gap-3">
          <GenomeMini genomeHash={profile.genomeHash} />
          <div className="text-xs text-text-muted">
            Genome Hash
            <div className="font-mono text-text-primary text-sm">
              {profile.genomeHash.slice(0, 10)}…
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="glass-panel p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-4">Identity</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">Handle</label>
                <div className="relative">
                  <input
                    type="text"
                    value={`@${profile.handle}`}
                    disabled
                    className="w-full rounded-lg border border-border bg-bg-tertiary/40 px-4 py-3 text-sm text-text-muted"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
                    🔒
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/25"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={280}
                  rows={4}
                  className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/25"
                />
                <div className="text-xs text-text-muted mt-1">{trimmedBio.length}/280</div>
              </div>
            </div>
          </section>

          <section className="glass-panel p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-4">Links</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">X Handle</label>
                <input
                  type="text"
                  value={xHandle}
                  onChange={(e) => setXHandle(e.target.value.replace(/^@/, ""))}
                  placeholder="satoshi"
                  className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/25"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">Website</label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/25"
                />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="glass-panel p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-4">Anchor Block</h2>
            <p className="text-xs text-text-muted mb-3">
              Current block: #{profile.bitmapBlock.toLocaleString()}
            </p>
            {bitmapBlocks.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {bitmapBlocks.map((block) => (
                  <button
                    key={block}
                    onClick={() => setSelectedBlock(block)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-mono border transition-all ${
                      selectedBlock === block
                        ? "border-bitcoin/50 bg-bitcoin/10 text-bitcoin"
                        : "border-border bg-bg-tertiary/30 text-text-secondary hover:border-border-hover"
                    }`}
                  >
                    {block.toLocaleString()}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={handleBlockUpdate}
              disabled={!selectedBlock || busy}
              className="w-full rounded-lg bg-accent-purple/15 border border-accent-purple/40 px-4 py-2.5 text-sm font-medium text-accent-purple hover:bg-accent-purple/25 hover:border-accent-purple/60 disabled:opacity-40"
            >
              Re-verify anchor block
            </button>
            <p className="text-xs text-text-muted mt-3">
              Wallet: {walletAddress?.slice(0, 8)}… ({walletType})
            </p>
          </section>

          <section className="glass-panel p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-4">Genome Hash</h2>
            <div className="bg-bg-primary/60 rounded-lg border border-border p-4">
              <p className="font-mono text-xs text-text-primary break-all">
                {profile.genomeHash}
              </p>
            </div>
          </section>

          <section className="glass-panel p-6">
            <button
              onClick={handleSave}
              disabled={busy}
              className="w-full rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-4 py-2.5 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 hover:border-accent-cyan/60 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </section>
        </div>
      </div>

      <section className="mt-10 glass-panel p-6 border-red-500/20">
        <h2 className="text-sm font-semibold text-red-300 mb-2">Delete profile</h2>
        <p className="text-xs text-text-muted mb-4">
          This permanently removes your handle and frees it for others. This action
          cannot be undone.
        </p>
        <button
          onClick={() => setShowDelete(true)}
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20"
        >
          Delete Profile
        </button>
      </section>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="glass-panel max-w-md w-full p-6 border-red-500/30">
            <h3 className="text-lg font-semibold text-red-300 mb-2">Confirm deletion</h3>
            <p className="text-sm text-text-secondary mb-4">
              Type <span className="font-mono text-red-200">{profile.handle}</span> to
              confirm. We&apos;ll request a wallet signature before deletion.
            </p>
            <input
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              className="w-full rounded-lg border border-red-500/30 bg-bg-secondary px-4 py-3 text-sm text-text-primary focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-500/30"
            />
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDelete(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-bg-tertiary/50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteInput !== profile.handle || busy}
                className="rounded-lg bg-red-500/20 border border-red-500/50 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/30 disabled:opacity-40"
              >
                {busy ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
