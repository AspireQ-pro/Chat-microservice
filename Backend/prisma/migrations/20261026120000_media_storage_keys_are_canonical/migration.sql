-- Object keys are the canonical database references. Download URLs are signed
-- on each authorized API response and must not be persisted with an IP/host.
UPDATE "Message"
SET "fileUrl" = NULL
WHERE "fileStorageKey" IS NOT NULL;

UPDATE "ChatUser"
SET "avatarUrl" = NULL
WHERE "avatarStorageKey" IS NOT NULL;

UPDATE "ChatRoom"
SET "avatarUrl" = NULL
WHERE "avatarStorageKey" IS NOT NULL;
