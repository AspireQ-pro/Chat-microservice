-- Per-user "delete for me" support
CREATE TABLE "MessageDeletion" (
    "messageId" TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageDeletion_pkey" PRIMARY KEY ("messageId", "userId")
);

-- Foreign keys
ALTER TABLE "MessageDeletion"
  ADD CONSTRAINT "MessageDeletion_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE;

ALTER TABLE "MessageDeletion"
  ADD CONSTRAINT "MessageDeletion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "ChatUser"("id") ON DELETE CASCADE;

-- Index for looking up deletions by user (used when fetching messages)
CREATE INDEX "MessageDeletion_userId_idx" ON "MessageDeletion"("userId");
