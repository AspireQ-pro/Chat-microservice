-- Add fileName and fileSize columns to Message for WhatsApp-style file sharing
ALTER TABLE "Message" ADD COLUMN "fileName" TEXT;
ALTER TABLE "Message" ADD COLUMN "fileSize" INTEGER;
