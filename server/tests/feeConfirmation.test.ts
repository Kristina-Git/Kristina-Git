import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { authHeader, makeUser } from "./helpers";

const app = createApp();

async function executedOrder() {
  const { user: client, token: clientToken } = await makeUser("CLIENT", "client");
  const { token: dealerToken } = await makeUser("DEALER", "dealer");
  const { token: complianceToken } = await makeUser("COMPLIANCE_OFFICER", "compliance-setup");

  const createRes = await request(app)
    .post("/orders")
    .set(authHeader(clientToken))
    .send({
      // Real figures from an actual audit-sample transaction (quantity/price -> ~$900k
      // notional), which is exactly why this needs to go through compliance approval first --
      // it's over COMPLIANCE_APPROVAL_THRESHOLD.
      instrumentSymbol: "GOAI",
      side: "SELL",
      orderType: "LIMIT",
      quantity: 102868,
      limitPrice: 8.756969,
      currency: "USD",
      timeInForce: "DAY",
    });
  const orderId = createRes.body.id;
  await request(app).post(`/orders/${orderId}/accept`).set(authHeader(dealerToken));
  await request(app).post(`/orders/${orderId}/compliance-approve`).set(authHeader(complianceToken));
  await request(app)
    .post(`/orders/${orderId}/execute`)
    .set(authHeader(dealerToken))
    .send({ executedPrice: 8.756969, executedQuantity: 102868 });

  return { orderId, client, clientToken, dealerToken };
}

describe("fee confirmation (audit sampling)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("full happy path: compliance requests, client confirms", async () => {
    const { orderId, clientToken } = await executedOrder();
    const { token: complianceToken } = await makeUser("COMPLIANCE_OFFICER", "compliance");

    const requestRes = await request(app)
      .post(`/orders/${orderId}/request-fee-confirmation`)
      .set(authHeader(complianceToken))
      .send({ agreedFeePercent: 5 });
    expect(requestRes.status).toBe(200);
    expect(requestRes.body.feeConfirmationStatus).toBe("PENDING");
    expect(requestRes.body.agreedFeePercent).toBe(5);

    const confirmRes = await request(app)
      .post(`/orders/${orderId}/fee-confirmation-response`)
      .set(authHeader(clientToken))
      .send({ confirmed: true });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.feeConfirmationStatus).toBe("CONFIRMED");
    expect(confirmRes.body.feeConfirmationRespondedAt).toBeDefined();

    const logs = await prisma.auditLog.findMany({ where: { entityId: orderId }, orderBy: { sequence: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining(["FEE_CONFIRMATION_REQUESTED", "FEE_CONFIRMED"])
    );
  });

  it("client can dispute with a required note", async () => {
    const { orderId, clientToken } = await executedOrder();
    const { token: complianceToken } = await makeUser("COMPLIANCE_OFFICER", "compliance");

    await request(app)
      .post(`/orders/${orderId}/request-fee-confirmation`)
      .set(authHeader(complianceToken))
      .send({ agreedFeePercent: 5 });

    const missingNote = await request(app)
      .post(`/orders/${orderId}/fee-confirmation-response`)
      .set(authHeader(clientToken))
      .send({ confirmed: false });
    expect(missingNote.status).toBe(400);

    const disputeRes = await request(app)
      .post(`/orders/${orderId}/fee-confirmation-response`)
      .set(authHeader(clientToken))
      .send({ confirmed: false, note: "We agreed 3%, not 5%" });
    expect(disputeRes.status).toBe(200);
    expect(disputeRes.body.feeConfirmationStatus).toBe("DISPUTED");
    expect(disputeRes.body.feeConfirmationNote).toBe("We agreed 3%, not 5%");
  });

  it("only compliance/admin can request; only the order's own client can respond", async () => {
    const { orderId, dealerToken } = await executedOrder();
    const { token: otherClientToken } = await makeUser("CLIENT", "other-client");
    const { token: complianceToken } = await makeUser("COMPLIANCE_OFFICER", "compliance");

    const dealerAttempt = await request(app)
      .post(`/orders/${orderId}/request-fee-confirmation`)
      .set(authHeader(dealerToken))
      .send({ agreedFeePercent: 5 });
    expect(dealerAttempt.status).toBe(403);

    await request(app)
      .post(`/orders/${orderId}/request-fee-confirmation`)
      .set(authHeader(complianceToken))
      .send({ agreedFeePercent: 5 });

    const wrongClientAttempt = await request(app)
      .post(`/orders/${orderId}/fee-confirmation-response`)
      .set(authHeader(otherClientToken))
      .send({ confirmed: true });
    expect(wrongClientAttempt.status).toBe(403);
  });

  it("cannot request fee confirmation on an order that hasn't been executed yet", async () => {
    const { token: clientToken } = await makeUser("CLIENT", "client");
    const { token: complianceToken } = await makeUser("COMPLIANCE_OFFICER", "compliance");

    const createRes = await request(app)
      .post("/orders")
      .set(authHeader(clientToken))
      .send({ instrumentSymbol: "AAPL", side: "BUY", orderType: "MARKET", quantity: 1, currency: "USD", timeInForce: "DAY" });

    const res = await request(app)
      .post(`/orders/${createRes.body.id}/request-fee-confirmation`)
      .set(authHeader(complianceToken))
      .send({ agreedFeePercent: 5 });
    expect(res.status).toBe(409);
  });

  it("cannot respond when there is no pending request", async () => {
    const { orderId, clientToken } = await executedOrder();
    const res = await request(app)
      .post(`/orders/${orderId}/fee-confirmation-response`)
      .set(authHeader(clientToken))
      .send({ confirmed: true });
    expect(res.status).toBe(409);
  });
});
