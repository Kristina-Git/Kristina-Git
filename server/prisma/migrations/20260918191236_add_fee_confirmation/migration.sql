-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "agreedFeePercent" DOUBLE PRECISION,
ADD COLUMN     "feeConfirmationNote" TEXT,
ADD COLUMN     "feeConfirmationRequestedAt" TIMESTAMP(3),
ADD COLUMN     "feeConfirmationRespondedAt" TIMESTAMP(3),
ADD COLUMN     "feeConfirmationStatus" TEXT NOT NULL DEFAULT 'NONE';
