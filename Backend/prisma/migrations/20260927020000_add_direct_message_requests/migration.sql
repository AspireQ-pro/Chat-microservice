-- Direct rooms created for a new contact start as a message request.
-- Existing rooms remain accepted so active conversations are unaffected.
ALTER TABLE "ChatRoom"
ADD COLUMN "directStatus" TEXT NOT NULL DEFAULT 'accepted',
ADD COLUMN "requestedById" TEXT;