-- Track the real group creator instead of guessing it from member join order.
-- When a group is created, the creator and all invitees are inserted in one
-- transaction with identical `joinedAt` timestamps, so sorting members by
-- joinedAt was non-deterministic and the wrong member got labeled "Admin".

ALTER TABLE "ChatRoom" ADD COLUMN "createdById" TEXT;

-- Backfill existing group rooms: pick the earliest-joining member, breaking
-- ties deterministically by userId so the UI badge and backend authorization
-- always agree. (The true original creator can't be recovered for legacy
-- groups, but this makes the chosen admin stable and consistent everywhere.)
UPDATE "ChatRoom" cr
SET "createdById" = sub.user_id
FROM (
  SELECT DISTINCT ON (crm."roomId")
         crm."roomId",
         crm."userId" AS user_id
  FROM "ChatRoomMember" crm
  ORDER BY crm."roomId" ASC, crm."joinedAt" ASC, crm."userId" ASC
) sub
WHERE cr."id" = sub."roomId"
  AND cr."isGroup" = true
  AND cr."createdById" IS NULL;
