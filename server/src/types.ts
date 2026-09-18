// SQLite has no native enum type, so Prisma enums aren't usable with the sqlite connector.
// These are the application-level enums (stored as plain strings in the DB, validated at the
// API boundary with zod). Swapping the datasource provider to `postgresql` in production lets
// you reintroduce real Prisma enums if desired — see prisma/schema.prisma's header comment.

export const ROLES = ["CLIENT", "DEALER", "COMPLIANCE_OFFICER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_SIDES = ["BUY", "SELL"] as const;
export type OrderSide = (typeof ORDER_SIDES)[number];

export const ORDER_TYPES = ["MARKET", "LIMIT", "STOP"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const TIME_IN_FORCE = ["DAY", "GTC", "IOC", "FOK"] as const;
export type TimeInForce = (typeof TIME_IN_FORCE)[number];

export const ORDER_STATUSES = [
  "PENDING_REVIEW",
  "ACCEPTED",
  "PENDING_COMPLIANCE_APPROVAL",
  "COMPLIANCE_APPROVED",
  "EXECUTED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const FEE_CONFIRMATION_STATUSES = ["NONE", "PENDING", "CONFIRMED", "DISPUTED"] as const;
export type FeeConfirmationStatus = (typeof FEE_CONFIRMATION_STATUSES)[number];
