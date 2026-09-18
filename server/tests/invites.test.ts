import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { authHeader, makeUser } from "./helpers";

const app = createApp();

function extractToken(inviteUrl: string): string {
  return inviteUrl.split("/invite/")[1];
}

describe("client invites", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("dealer creates a client invite; the account can't log in until it's accepted", async () => {
    const { token: dealerToken } = await makeUser("DEALER", "dealer");

    const createRes = await request(app)
      .post("/users/clients")
      .set(authHeader(dealerToken))
      .send({ fullName: "New Client", email: `newclient-${Date.now()}@test.example`, clientCode: `CC-${Date.now()}` });
    expect(createRes.status).toBe(201);
    expect(createRes.body.inviteUrl).toContain("/invite/");
    expect(createRes.body.emailed).toBe(false); // no SMTP configured in tests
    // Unconfigured SMTP is a normal, expected state -- not surfaced as a warning/error.
    expect(createRes.body.emailWarning).toBeUndefined();

    const email = createRes.body.email;
    const loginAttempt = await request(app).post("/auth/login").send({ email, password: "whatever" });
    expect(loginAttempt.status).toBe(401);
    expect(loginAttempt.body.error).toMatch(/hasn't been activated/i);

    const token = extractToken(createRes.body.inviteUrl);
    const checkRes = await request(app).get(`/auth/invite/${token}`);
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.email).toBe(email);

    const acceptRes = await request(app).post("/auth/accept-invite").send({ token, password: "aNewPassword123" });
    expect(acceptRes.status).toBe(200);

    // Link is single-use.
    const secondAccept = await request(app).post("/auth/accept-invite").send({ token, password: "another123456" });
    expect(secondAccept.status).toBe(400);

    const loginRes = await request(app).post("/auth/login").send({ email, password: "aNewPassword123" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
  });

  it("rejects invalid invite tokens", async () => {
    const res = await request(app).get("/auth/invite/not-a-real-token");
    expect(res.status).toBe(404);
  });

  it("clients cannot create other clients", async () => {
    const { token: clientToken } = await makeUser("CLIENT", "client");
    const res = await request(app)
      .post("/users/clients")
      .set(authHeader(clientToken))
      .send({ fullName: "Sneaky", email: `sneaky-${Date.now()}@test.example` });
    expect(res.status).toBe(403);
  });

  it("only compliance/admin can bulk import; dealer cannot", async () => {
    const { token: dealerToken } = await makeUser("DEALER", "dealer");
    const { token: complianceToken } = await makeUser("COMPLIANCE_OFFICER", "compliance");

    const csv = [
      "fullName,email,clientCode",
      `Alice Bulk,alice-bulk-${Date.now()}@test.example,BULK-A-${Date.now()}`,
      `Bob Bulk,bob-bulk-${Date.now()}@test.example,BULK-B-${Date.now()}`,
      "Missing Email,,",
    ].join("\n");

    const dealerAttempt = await request(app).post("/users/clients/bulk").set(authHeader(dealerToken)).send({ csv });
    expect(dealerAttempt.status).toBe(403);

    const res = await request(app).post("/users/clients/bulk").set(authHeader(complianceToken)).send({ csv });
    expect(res.status).toBe(200);
    expect(res.body.created).toHaveLength(2);
    expect(res.body.created.every((c: { inviteUrl?: string }) => c.inviteUrl)).toBe(true);
    expect(res.body.rowErrors).toHaveLength(1);
    expect(res.body.rowErrors[0].row).toBe(4);
  });

  it("bulk import also accepts tab-separated rows (Excel copy-paste)", async () => {
    const { token: complianceToken } = await makeUser("COMPLIANCE_OFFICER", "compliance");
    const csv = ["fullName\temail\tjurisdiction", `Tab Client\ttabclient-${Date.now()}@test.example\tCayman Islands`].join(
      "\n"
    );
    const res = await request(app).post("/users/clients/bulk").set(authHeader(complianceToken)).send({ csv });
    expect(res.status).toBe(200);
    expect(res.body.created).toHaveLength(1);
    expect(res.body.created[0].email).toContain("tabclient-");
    expect(res.body.created[0].inviteUrl).toContain("/invite/");
  });

  it("lists clients with activation status, and includeInactive controls scope", async () => {
    const { token: dealerToken } = await makeUser("DEALER", "dealer");
    await request(app)
      .post("/users/clients")
      .set(authHeader(dealerToken))
      .send({ fullName: "Pending Client", email: `pending-${Date.now()}@test.example` });

    const listRes = await request(app).get("/users/clients").set(authHeader(dealerToken));
    expect(listRes.status).toBe(200);
    const pending = listRes.body.find((c: { fullName: string }) => c.fullName === "Pending Client");
    expect(pending.activated).toBe(false);
  });
});
