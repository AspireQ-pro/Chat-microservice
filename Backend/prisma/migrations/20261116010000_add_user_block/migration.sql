-- CreateTable: UserBlock stores one-directional block relationships.
-- blockerId blocked blockedId within a specific project.
CREATE TABLE "UserBlock" (
    "id"        TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- Unique: a blocker can only block the same person once per project.
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_projectId_key"
    ON "UserBlock"("blockerId", "blockedId", "projectId");

-- Indexes for the two most common lookup patterns.
CREATE INDEX "UserBlock_blockerId_projectId_idx" ON "UserBlock"("blockerId", "projectId");
CREATE INDEX "UserBlock_blockedId_projectId_idx" ON "UserBlock"("blockedId", "projectId");
