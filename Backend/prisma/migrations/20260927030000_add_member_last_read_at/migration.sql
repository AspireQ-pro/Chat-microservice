ALTER TABLE "ChatRoomMember"
ADD COLUMN "lastReadAt" TIMESTAMP(3);

-- Preserve the best available read position from the legacy room-wide
-- Message.isRead/readAt fields. New reads are tracked per member from now on.
UPDATE "ChatRoomMember" AS member
SET "lastReadAt" = (
  SELECT MAX(message."readAt")
  FROM "Message" AS message
  WHERE message."roomId" = member."roomId"
    AND message."senderId" <> member."userId"
    AND message."isRead" = true
);