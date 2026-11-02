-- AddColumn: adminOnlyMessages to ChatRoom
ALTER TABLE "ChatRoom" ADD COLUMN "adminOnlyMessages" BOOLEAN NOT NULL DEFAULT false;
