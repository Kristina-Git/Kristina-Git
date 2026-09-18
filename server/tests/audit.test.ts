import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Role } from "../src/types";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { verifyChain } from "../src/audit/auditService";
import { authHeader, makeUser } from "./helpers";

const app = createApp();

describe("audit trail integrity", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("chains every mutating action and verifies intact", async () => {
    const { token: clientToken } = await makeUser("CLIENT", "client");
    const { token: dealerToken } = await makeUser("DEALER", "dealer");

    const createRes = await request(app)
      .post("/orders")
      .set(authHeader(clientToken))
      .send({
        instrumentSymbol: "NFLX",
        side: "BUY",
        orderType: "LIMIT",
        quantity: 2,
        limitPrice: 100,
        currency: "USD",
        timeInForce: "DAY",
      });
    const orderId = createRes.body.id;
    await request(app).post(`/orders/${orderId}/accept`).set(authHeader(dealerToken));

    const before = await verifyChain();
    expect(before.valid).toBe(true);
    expect(before.totalEntries).toBeGreaterThan(0);

    const logs = await prisma.auditLog.findMany({ where: { entityId: orderId } });
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(["ORDER_CREATED", "ORDER_ACCEPTED"]));
  });

  it("detects tampering with a historical audit row", async () => {
    const { token: clientToken } = await makeUser("CLIENT", "client");
    await request(app)
      .post("/orders")
      .set(authHeader(clientToken))
      .send({
        instrumentSymbol: "SPY",
        side: "BUY",
        orderType: "MARKET",
        quantity: 3,
        currency: "USD",
        timeInForce: "DAY",
      });

    const valid = await verifyChain();
    expect(valid.valid).toBe(true);

    const someEntry = await prisma.auditLog.findFirst({ orderBy: { sequence: "asc" } });
    // Simulate tampering: directly rewrite a historical row's afterState, bypassing the
    // application layer entirely (as a rogue DBA or compromised process might).
    await prisma.auditLog.update({
      where: { id: someEntry!.id },
      data: { afterState: JSON.stringify({ tampered: true }) },
    });

    const result = await verifyChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe(someEntry!.sequence);
  });

  it("restricts the audit API to compliance officers and admins", async () => {
    const { token: clientToken } = await makeUser("CLIENT", "client");
    const { token: dealerToken } = await makeUser("DEALER", "dealer");
    const { token: complianceToken } = await makeUser("COMPLIANCE_OFFICER", "compliance");

    expect((await request(app).get("/audit").set(authHeader(clientToken))).status).toBe(403);
    expect((await request(app).get("/audit").set(authHeader(dealerToken))).status).toBe(403);
    expect((await request(app).get("/audit").set(authHeader(complianceToken))).status).toBe(200);
  });
});
