ALTER TABLE "ChatUser" ADD COLUMN "avatarStorageKey" TEXT;
ALTER TABLE "ChatRoom" ADD COLUMN "avatarStorageKey" TEXT;
ALTER TABLE "Message" ADD COLUMN "fileStorageKey" TEXT;
