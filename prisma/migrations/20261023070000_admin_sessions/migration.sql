CREATE TABLE "AdminSession" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "user" TEXT NOT NULL,
    "credentialHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
