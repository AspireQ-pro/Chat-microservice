-- AlterTable: add optional groupId to Message for media album grouping
ALTER TABLE "Message" ADD COLUMN "groupId" TEXT;

-- Index to quickly fetch all messages that belong to the same album
CREATE INDEX "Message_groupId_idx" ON "Message"("groupId");
