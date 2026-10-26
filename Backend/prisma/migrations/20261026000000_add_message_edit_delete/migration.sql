-- Add edit and soft-delete support to Message
ALTER TABLE "Message" ADD COLUMN "editedAt"  TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
