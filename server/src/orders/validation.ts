import { z } from "zod";

export const createOrderSchema = z
  .object({
    clientId: z.string().uuid().optional(), // required when a DEALER enters on behalf of a client
    instrumentSymbol: z.string().min(1).max(20),
    instrumentName: z.string().max(200).optional(),
    side: z.enum(["BUY", "SELL"]),
    orderType: z.enum(["MARKET", "LIMIT", "STOP"]),
    quantity: z.number().positive(),
    limitPrice: z.number().positive().optional(),
    currency: z.string().length(3).default("USD"),
    timeInForce: z.enum(["DAY", "GTC", "IOC", "FOK"]).default("DAY"),
  })
  .refine((data) => data.orderType === "MARKET" || data.limitPrice !== undefined, {
    message: "limitPrice is required for LIMIT and STOP orders",
    path: ["limitPrice"],
  });

export const rejectOrderSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export const complianceDecisionSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const executeOrderSchema = z.object({
  executedPrice: z.number().positive(),
  executedQuantity: z.number().positive(),
  // Execution happens on the custodian's own platform, outside this system; these tie the
  // internal record to the custodian's trade confirmation for reconciliation.
  custodianName: z.string().min(1).max(200).optional(),
  custodianReference: z.string().min(1).max(200).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(1).max(1000).optional(),
});

export const flagOrderSchema = z.object({
  notes: z.string().min(1).max(2000),
});

export const requestFeeConfirmationSchema = z.object({
  agreedFeePercent: z.number().min(0).max(100),
});

export const feeConfirmationResponseSchema = z.object({
  confirmed: z.boolean(),
  note: z.string().max(2000).optional(),
});
