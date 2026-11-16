-- Add role column to ChatRoomMember.
-- Existing rows default to "member"; the creator's membership will be
-- backfilled to "admin" via the follow-up UPDATE below.
ALTER TABLE "ChatRoomMember" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'member';

-- Backfill: promote the creator of every group to admin.
UPDATE "ChatRoomMember" cm
SET    "role" = 'admin'
FROM   "ChatRoom" cr
WHERE  cm."roomId" = cr."id"
  AND  cr."isGroup" = TRUE
  AND  cr."createdById" IS NOT NULL
  AND  cm."userId" = cr."createdById";
