-- CreateTable
CREATE TABLE "User" (
    "walletAddress" TEXT NOT NULL,
    "handle" TEXT,
    "avatar" TEXT,
    "tier" INTEGER NOT NULL DEFAULT 3,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("walletAddress")
);

-- CreateTable
CREATE TABLE "Block" (
    "height" INTEGER NOT NULL,
    "hash" TEXT,
    "ownerAddress" TEXT,
    "label" TEXT,
    "groundColor" TEXT DEFAULT '#2d5a27',
    "skyColor" TEXT DEFAULT '#87CEEB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("height")
);

-- CreateTable
CREATE TABLE "Parcel" (
    "blockHeight" INTEGER NOT NULL,
    "txIndex" INTEGER NOT NULL,
    "ownerAddress" TEXT,
    "customColor" TEXT,
    "pattern" TEXT,
    "imageUrl" TEXT,
    "rotation" DOUBLE PRECISION DEFAULT 0,
    "facing" TEXT DEFAULT 'north',
    "emissive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("blockHeight","txIndex")
);

-- CreateTable
CREATE TABLE "Delegation" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "parcelTxIndex" INTEGER,
    "ownerAddress" TEXT NOT NULL,
    "delegateeAddress" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "priceSats" INTEGER NOT NULL,
    "protocolFeeSats" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "txId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelegationListing" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "parcelTxIndex" INTEGER,
    "ownerAddress" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "spotsTotal" INTEGER NOT NULL DEFAULT -1,
    "spotsUsed" INTEGER NOT NULL DEFAULT 0,
    "price30d" INTEGER NOT NULL,
    "price365d" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DelegationListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "senderAddress" TEXT NOT NULL,
    "senderHandle" TEXT,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "mediaUrl" TEXT,
    "replyToId" TEXT,
    "reported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandleHistory" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandleHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "parcelIndices" TEXT NOT NULL,
    "glowColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Estate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BitmapAgent" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "endpointUrl" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "parcelIndex" INTEGER,
    "tier" INTEGER NOT NULL DEFAULT 3,
    "permissions" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BitmapAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentBrief" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "stats" TEXT NOT NULL,
    "pendingPermissions" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VPSLink" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "parcelIndex" INTEGER,
    "serverUrl" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL DEFAULT 'https',
    "status" TEXT NOT NULL DEFAULT 'linked',
    "tlsVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastHealthCheck" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VPSLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "bitmapAddr" TEXT NOT NULL,
    "sandboxId" TEXT NOT NULL,
    "permissions" TEXT NOT NULL,
    "activityLog" TEXT NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "Block_height_key" ON "Block"("height");

-- CreateIndex
CREATE INDEX "Block_ownerAddress_idx" ON "Block"("ownerAddress");

-- CreateIndex
CREATE INDEX "Parcel_ownerAddress_idx" ON "Parcel"("ownerAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Parcel_blockHeight_txIndex_key" ON "Parcel"("blockHeight", "txIndex");

-- CreateIndex
CREATE INDEX "Delegation_blockHeight_idx" ON "Delegation"("blockHeight");

-- CreateIndex
CREATE INDEX "Delegation_ownerAddress_idx" ON "Delegation"("ownerAddress");

-- CreateIndex
CREATE INDEX "Delegation_delegateeAddress_idx" ON "Delegation"("delegateeAddress");

-- CreateIndex
CREATE INDEX "Delegation_active_idx" ON "Delegation"("active");

-- CreateIndex
CREATE INDEX "DelegationListing_blockHeight_idx" ON "DelegationListing"("blockHeight");

-- CreateIndex
CREATE INDEX "DelegationListing_ownerAddress_idx" ON "DelegationListing"("ownerAddress");

-- CreateIndex
CREATE INDEX "DelegationListing_active_idx" ON "DelegationListing"("active");

-- CreateIndex
CREATE INDEX "ChatMessage_blockHeight_idx" ON "ChatMessage"("blockHeight");

-- CreateIndex
CREATE INDEX "ChatMessage_senderAddress_idx" ON "ChatMessage"("senderAddress");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "HandleHistory_handle_idx" ON "HandleHistory"("handle");

-- CreateIndex
CREATE INDEX "HandleHistory_walletAddress_idx" ON "HandleHistory"("walletAddress");

-- CreateIndex
CREATE INDEX "Estate_blockHeight_idx" ON "Estate"("blockHeight");

-- CreateIndex
CREATE INDEX "Estate_ownerAddress_idx" ON "Estate"("ownerAddress");

-- CreateIndex
CREATE INDEX "BitmapAgent_walletAddress_idx" ON "BitmapAgent"("walletAddress");

-- CreateIndex
CREATE INDEX "BitmapAgent_blockHeight_idx" ON "BitmapAgent"("blockHeight");

-- CreateIndex
CREATE INDEX "BitmapAgent_status_idx" ON "BitmapAgent"("status");

-- CreateIndex
CREATE INDEX "AgentEvent_agentId_idx" ON "AgentEvent"("agentId");

-- CreateIndex
CREATE INDEX "AgentEvent_type_idx" ON "AgentEvent"("type");

-- CreateIndex
CREATE INDEX "AgentEvent_timestamp_idx" ON "AgentEvent"("timestamp");

-- CreateIndex
CREATE INDEX "AgentBrief_agentId_idx" ON "AgentBrief"("agentId");

-- CreateIndex
CREATE INDEX "AgentBrief_createdAt_idx" ON "AgentBrief"("createdAt");

-- CreateIndex
CREATE INDEX "VPSLink_walletAddress_idx" ON "VPSLink"("walletAddress");

-- CreateIndex
CREATE INDEX "VPSLink_blockHeight_idx" ON "VPSLink"("blockHeight");

-- CreateIndex
CREATE INDEX "VPSLink_status_idx" ON "VPSLink"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_sandboxId_key" ON "AgentSession"("sandboxId");

-- CreateIndex
CREATE INDEX "AgentSession_agentId_idx" ON "AgentSession"("agentId");

-- CreateIndex
CREATE INDEX "AgentSession_sandboxId_idx" ON "AgentSession"("sandboxId");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_ownerAddress_fkey" FOREIGN KEY ("ownerAddress") REFERENCES "User"("walletAddress") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_blockHeight_fkey" FOREIGN KEY ("blockHeight") REFERENCES "Block"("height") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_ownerAddress_fkey" FOREIGN KEY ("ownerAddress") REFERENCES "User"("walletAddress") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_blockHeight_fkey" FOREIGN KEY ("blockHeight") REFERENCES "Block"("height") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_ownerAddress_fkey" FOREIGN KEY ("ownerAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_delegateeAddress_fkey" FOREIGN KEY ("delegateeAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegationListing" ADD CONSTRAINT "DelegationListing_blockHeight_fkey" FOREIGN KEY ("blockHeight") REFERENCES "Block"("height") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegationListing" ADD CONSTRAINT "DelegationListing_ownerAddress_fkey" FOREIGN KEY ("ownerAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_blockHeight_fkey" FOREIGN KEY ("blockHeight") REFERENCES "Block"("height") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderAddress_fkey" FOREIGN KEY ("senderAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estate" ADD CONSTRAINT "Estate_blockHeight_fkey" FOREIGN KEY ("blockHeight") REFERENCES "Block"("height") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estate" ADD CONSTRAINT "Estate_ownerAddress_fkey" FOREIGN KEY ("ownerAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "BitmapAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBrief" ADD CONSTRAINT "AgentBrief_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "BitmapAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "BitmapAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
