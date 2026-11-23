-- AlterTable: add optional soft-delete timestamp to ChatUser.
-- A non-null deletedAt marks a user as removed from the project's source
-- system (Society Management). Such users are hidden from the chat user
-- list and cannot be added to rooms, but their message history is retained.
ALTER TABLE "ChatUser" ADD COLUMN "deletedAt" TIMESTAMP(3);
