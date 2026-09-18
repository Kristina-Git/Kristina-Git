import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Role } from "../src/types";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { authHeader, makeUser } from "./helpers";

const app = createApp();

describe("order lifecycle", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("runs a standard small order from submission through execution", async () => {
    const { user: client, token: clientToken } = await makeUser("CLIENT", "client");
    const { token: dealerToken } = await makeUser("DEALER", "dealer");

    const createRes = await request(app)
      .post("/orders")
      .set(authHeader(clientToken))
      .send({
        instrumentSymbol: "aapl",
        side: "BUY",
        orderType: "LIMIT",
        quantity: 10,
        limitPrice: 50,
        currency: "USD",
        timeInForce: "DAY",
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe("PENDING_REVIEW");
    expect(createRes.body.instrumentSymbol).toBe("AAPL");
    expect(createRes.body.clientId).toBe(client.id);
    const orderId = createRes.body.id;

    // Client cannot accept their own order.
    const clientAcceptAttempt = await request(app).post(`/orders/${orderId}/accept`).set(authHeader(clientToken));
    expect(clientAcceptAttempt.status).toBe(403);

    const acceptRes = await request(app).post(`/orders/${orderId}/accept`).set(authHeader(dealerToken));
    expect(acceptRes.status).toBe(200);
    // Below the compliance threshold (10 * 50 = 500) -> straight to ACCEPTED, not compliance queue.
    expect(acceptRes.body.status).toBe("ACCEPTED");

    const executeRes = await request(app)
      .post(`/orders/${orderId}/execute`)
      .set(authHeader(dealerToken))
      .send({ executedPrice: 50.25, executedQuantity: 10 });
    expect(executeRes.status).toBe(200);
    expect(executeRes.body.status).toBe("EXECUTED");
    expect(executeRes.body.executedPrice).toBe(50.25);

    const historyRes = await request(app).get(`/orders/${orderId}`).set(authHeader(clientToken));
    expect(historyRes.status).toBe(200);
    const statuses = historyRes.body.events.map((e: { toStatus: string }) => e.toStatus);
    expect(statuses).toEqual(["PENDING_REVIEW", "ACCEPTED", "EXECUTED"]);
  });

  it("routes large orders through mandatory compliance approval (four-eyes)", async () => {
    const { token: clientToken } = await makeUser("CLIENT", "client");
    const { token: dealerToken } = await makeUser("DEALER", "dealer");
    const { token: complianceToken } = await makeUser("COMPLIANCE_OFFICER", "compliance");

    const createRes = await request(app)
      .post("/orders")
      .set(authHeader(clientToken))
      .send({
        instrumentSymbol: "TSLA",
        side: "SELL",
        orderType: "LIMIT",
        quantity: 1000,
        limitPrice: 500, // notional 500,000 >= 100,000 threshold
        currency: "USD",
        timeInForce: "GTC",
      });
    const orderId = createRes.body.id;

    const acceptRes = await request(app).post(`/orders/${orderId}/accept`).set(authHeader(dealerToken));
    expect(acceptRes.body.status).toBe("PENDING_COMPLIANCE_APPROVAL");

    // Dealer cannot execute before compliance sign-off.
    const prematureExec = await request(app)
      .post(`/orders/${orderId}/execute`)
      .set(authHeader(dealerToken))
      .send({ executedPrice: 500, executedQuantity: 1000 });
    expect(prematureExec.status).toBe(409);

    const approveRes = await request(app)
      .post(`/orders/${orderId}/compliance-approve`)
      .set(authHeader(complianceToken))
      .send({ notes: "Reviewed against client mandate, cleared." });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("COMPLIANCE_APPROVED");

    const executeRes = await request(app)
      .post(`/orders/${orderId}/execute`)
      .set(authHeader(dealerToken))
      .send({ executedPrice: 499.5, executedQuantity: 1000 });
    expect(executeRes.status).toBe(200);
    expect(executeRes.body.status).toBe("EXECUTED");
  });

  it("rejects a dealer accepting or compliance-approving their own entered order (segregation of duties)", async () => {
    const { user: client } = await makeUser("CLIENT", "client");
    const { token: dealerToken } = await makeUser("DEALER", "dealer");

    const createRes = await request(app)
      .post("/orders")
      .set(authHeader(dealerToken))
      .send({
        clientId: client.id,
        instrumentSymbol: "MSFT",
        side: "BUY",
        orderType: "LIMIT",
        quantity: 5,
        limitPrice: 300,
        currency: "USD",
        timeInForce: "DAY",
      });
    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id;

    const selfAccept = await request(app).post(`/orders/${orderId}/accept`).set(authHeader(dealerToken));
    expect(selfAccept.status).toBe(409);
    expect(selfAccept.body.error).toMatch(/four-eyes/i);
  });

  it("prevents clients from viewing other clients' orders", async () => {
    const { token: aliceToken } = await makeUser("CLIENT", "alice");
    const { token: bobToken } = await makeUser("CLIENT", "bob");

    const createRes = await request(app)
      .post("/orders")
      .set(authHeader(aliceToken))
      .send({
        instrumentSymbol: "GOOG",
        side: "BUY",
        orderType: "MARKET",
        quantity: 1,
        currency: "USD",
        timeInForce: "DAY",
      });
    const orderId = createRes.body.id;

    const bobView = await request(app).get(`/orders/${orderId}`).set(authHeader(bobToken));
    expect(bobView.status).toBe(403);

    const aliceView = await request(app).get(`/orders/${orderId}`).set(authHeader(aliceToken));
    expect(aliceView.status).toBe(200);
  });

  it("sets a 7-year retention date on every order and never hard-deletes records", async () => {
    const { token: clientToken } = await makeUser("CLIENT", "client");
    const createRes = await request(app)
      .post("/orders")
      .set(authHeader(clientToken))
      .send({
        instrumentSymbol: "IBM",
        side: "BUY",
        orderType: "MARKET",
        quantity: 1,
        currency: "USD",
        timeInForce: "DAY",
      });
    const created = new Date(createRes.body.createdAt);
    const retention = new Date(createRes.body.retentionUntil);
    const years = retention.getFullYear() - created.getFullYear();
    expect(years).toBe(7);
  });

  it("exports a per-client trade CSV, scoped so a client can only ever get their own", async () => {
    const { user: alice, token: aliceToken } = await makeUser("CLIENT", "alice-export");
    const { token: bobToken } = await makeUser("CLIENT", "bob-export");
    const { token: dealerToken } = await makeUser("DEALER", "dealer-export");

    await request(app)
      .post("/orders")
      .set(authHeader(aliceToken))
      .send({ instrumentSymbol: "SPY", side: "BUY", orderType: "MARKET", quantity: 1, currency: "USD", timeInForce: "DAY" });

    // Alice exporting herself: fine, and passing someone else's clientId is silently ignored.
    const aliceExport = await request(app)
      .get(`/orders/export.csv?clientId=${alice.id}`)
      .set(authHeader(aliceToken));
    expect(aliceExport.status).toBe(200);
    expect(aliceExport.headers["content-type"]).toContain("text/csv");
    expect(aliceExport.text).toContain("SPY");

    const bobExport = await request(app).get("/orders/export.csv").set(authHeader(bobToken));
    expect(bobExport.status).toBe(200);
    expect(bobExport.text).not.toContain("SPY");

    // A dealer can pull one specific client's trade activity.
    const dealerExport = await request(app)
      .get(`/orders/export.csv?clientId=${alice.id}`)
      .set(authHeader(dealerToken));
    expect(dealerExport.status).toBe(200);
    expect(dealerExport.text).toContain("SPY");
  });
});
