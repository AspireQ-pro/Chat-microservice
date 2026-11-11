-- AddColumn: mimeType to Message
-- Stores the original MIME type of the uploaded file so the frontend can
-- render/open attachments correctly without guessing from the extension.
-- Nullable for backward compatibility with existing message records.
ALTER TABLE "Message" ADD COLUMN "mimeType" TEXT;
