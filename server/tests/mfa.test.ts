import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { authenticator } from "otplib";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { authHeader, makeUser } from "./helpers";

const app = createApp();
const PASSWORD = "password";

describe("MFA (TOTP)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("logs in normally when MFA is not enabled", async () => {
    const { user } = await makeUser("COMPLIANCE_OFFICER", "nomfa");
    const res = await request(app).post("/auth/login").send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.mfaRequired).toBeUndefined();
  });

  it("enrolls, requires MFA on next login, and blocks a full session until the code is verified", async () => {
    const { user, token } = await makeUser("COMPLIANCE_OFFICER", "mfa-flow");

    // Enrollment: setup returns a secret, /enable requires proving possession of it.
    const setupRes = await request(app).post("/auth/mfa/setup").set(authHeader(token));
    expect(setupRes.status).toBe(200);
    const { secret } = setupRes.body;
    expect(secret).toBeTruthy();

    const badEnable = await request(app)
      .post("/auth/mfa/enable")
      .set(authHeader(token))
      .send({ code: "000000" });
    expect(badEnable.status).toBe(400);

    const goodCode = authenticator.generate(secret);
    const enableRes = await request(app).post("/auth/mfa/enable").set(authHeader(token)).send({ code: goodCode });
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.mfaEnabled).toBe(true);

    // Next login: password alone only yields a pre-auth challenge, not a session token.
    const loginRes = await request(app).post("/auth/login").send({ email: user.email, password: PASSWORD });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.mfaRequired).toBe(true);
    expect(loginRes.body.token).toBeUndefined();
    const preAuthToken = loginRes.body.preAuthToken;

    // The pre-auth token cannot be used as a real session token.
    const rejected = await request(app).get("/users/me").set(authHeader(preAuthToken));
    expect(rejected.status).toBe(401);

    // Wrong code is rejected.
    const wrongVerify = await request(app).post("/auth/mfa/verify").send({ preAuthToken, code: "123456" });
    expect(wrongVerify.status).toBe(401);

    // Correct code completes login.
    const verifyRes = await request(app)
      .post("/auth/mfa/verify")
      .send({ preAuthToken, code: authenticator.generate(secret) });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.token).toBeDefined();

    const me = await request(app).get("/users/me").set(authHeader(verifyRes.body.token));
    expect(me.status).toBe(200);
    expect(me.body.mfaEnabled).toBe(true);
  });

  it("requires the current password to disable MFA", async () => {
    const { token, user } = await makeUser("DEALER", "mfa-disable");

    const setupRes = await request(app).post("/auth/mfa/setup").set(authHeader(token));
    await request(app)
      .post("/auth/mfa/enable")
      .set(authHeader(token))
      .send({ code: authenticator.generate(setupRes.body.secret) });

    const wrongPassword = await request(app)
      .post("/auth/mfa/disable")
      .set(authHeader(token))
      .send({ password: "not-the-password" });
    expect(wrongPassword.status).toBe(401);

    const disableRes = await request(app)
      .post("/auth/mfa/disable")
      .set(authHeader(token))
      .send({ password: PASSWORD });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.mfaEnabled).toBe(false);

    const loginRes = await request(app).post("/auth/login").send({ email: user.email, password: PASSWORD });
    expect(loginRes.body.mfaRequired).toBeUndefined();
    expect(loginRes.body.token).toBeDefined();
  });
});
