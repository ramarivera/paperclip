import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { healthRoutes } from "../routes/health.js";

describe("GET /health", () => {
  const app = express();
  app.use("/health", healthRoutes());

  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("includes configured onboarding defaults", async () => {
    const customApp = express();
    customApp.use(
      "/health",
      healthRoutes(undefined, {
        deploymentMode: "local_trusted",
        deploymentExposure: "private",
        authReady: true,
        companyDeletionEnabled: true,
        onboardingCeoClaudeCommand: "paperclip-claude",
      }),
    );

    const res = await request(customApp).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      onboardingDefaults: {
        ceoClaudeCommand: "paperclip-claude",
      },
    });
  });
});
