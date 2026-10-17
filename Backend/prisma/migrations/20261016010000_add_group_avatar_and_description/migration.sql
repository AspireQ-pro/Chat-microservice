-- AlterTable: add avatarUrl and description to ChatRoom
ALTER TABLE "ChatRoom" ADD COLUMN "avatarUrl"   TEXT;
ALTER TABLE "ChatRoom" ADD COLUMN "description" TEXT;
