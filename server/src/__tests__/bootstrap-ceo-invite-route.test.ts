import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessRoutes } from "../routes/access.js";
import { errorHandler } from "../middleware/index.js";
import type { Db } from "@paperclipai/db";

const mockAccessService = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  canUser: vi.fn(),
  isInstanceAdmin: vi.fn(),
  getMembership: vi.fn(),
  ensureMembership: vi.fn(),
  listMembers: vi.fn(),
  setMemberPermissions: vi.fn(),
  promoteInstanceAdmin: vi.fn(),
  demoteInstanceAdmin: vi.fn(),
  listUserCompanyAccess: vi.fn(),
  setUserCompanyAccess: vi.fn(),
  setPrincipalGrants: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  deduplicateAgentName: vi.fn(),
  logActivity: mockLogActivity,
  notifyHireApproved: vi.fn(),
}));

function createDbStub(roleCount = 0) {
  const createdInvite = {
    id: "invite-1",
    companyId: null,
    inviteType: "bootstrap_ceo",
    allowedJoinTypes: "human",
    defaultsPayload: null,
    expiresAt: new Date("2026-03-08T00:10:00.000Z"),
    invitedByUserId: "system",
    tokenHash: "hash-1",
    revokedAt: null,
    acceptedAt: null,
    createdAt: new Date("2026-03-08T00:00:00.000Z"),
    updatedAt: new Date("2026-03-08T00:00:00.000Z"),
  };

  const inviteInsertValues = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([createdInvite]),
  });
  const inviteInsert = vi.fn().mockReturnValue({
    values: inviteInsertValues,
  });

  const selectWhere = vi.fn().mockResolvedValue([{ count: roleCount }]);
  const selectFrom = vi.fn().mockReturnValue({
    where: selectWhere,
  });

  const revokeWhere = vi.fn().mockResolvedValue(undefined);
  const revokeSet = vi.fn().mockReturnValue({
    where: revokeWhere,
  });
  const revokeUpdate = vi.fn().mockReturnValue({
    set: revokeSet,
  });

  const select = vi.fn().mockReturnValue({
    from: selectFrom,
  });

  return {
    select,
    update: revokeUpdate,
    insert: inviteInsert,
    inviteInsert,
    inviteInsertValues,
    revokeSet,
    revokeWhere,
  };
}

function createApp(
  actor: Record<string, unknown>,
  db: Pick<Db, "select" | "insert" | "update">,
  deploymentMode: "authenticated" | "local_trusted",
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: Record<string, unknown> }).actor = actor;
    next();
  });
  app.use(
    "/api",
    accessRoutes(db as unknown as Db, {
      deploymentMode,
      deploymentExposure: "private",
      bindHost: "127.0.0.1",
      allowedHostnames: [],
    }),
  );
  app.use(errorHandler);
  return app;
}

describe("POST /bootstrap-ceo/invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a bootstrap CEO invite when bootstrap setup is pending", async () => {
    const db = createDbStub(0);
    const app = createApp(
      {
        type: "none",
        source: "none",
      },
      db,
      "authenticated",
    );

    const res = await request(app).post("/api/bootstrap-ceo/invite");

    expect(res.status).toBe(201);
    expect(res.body.inviteType).toBe("bootstrap_ceo");
    expect(res.body.allowedJoinTypes).toBe("human");
    expect(typeof res.body.token).toBe("string");
    expect(typeof res.body.inviteUrl).toBe("string");
    expect(res.body.inviteUrl).toContain("/invite/");
    expect(db.inviteInsert).toHaveBeenCalled();
    expect(db.inviteInsertValues).toHaveBeenCalled();
    expect(db.revokeSet).toHaveBeenCalled();
    expect(db.revokeWhere).toHaveBeenCalled();
  });

  it("rejects when deployment mode is local_trusted", async () => {
    const db = createDbStub(0);
    const app = createApp(
      {
        type: "none",
        source: "none",
      },
      db,
      "local_trusted",
    );

    const res = await request(app).post("/api/bootstrap-ceo/invite");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("authenticated mode");
    expect(db.inviteInsert).not.toHaveBeenCalled();
  });

  it("rejects when an instance admin already exists", async () => {
    const db = createDbStub(2);
    const app = createApp(
      {
        type: "none",
        source: "none",
      },
      db,
      "authenticated",
    );

    const res = await request(app).post("/api/bootstrap-ceo/invite");

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("admin user");
    expect(db.inviteInsert).not.toHaveBeenCalled();
  });

  it("forbids agent-authenticated callers", async () => {
    const db = createDbStub(0);
    const app = createApp(
      {
        type: "agent",
        source: "agent_key",
        agentId: "agent-1",
        companyId: "company-1",
      },
      db,
      "authenticated",
    );

    const res = await request(app).post("/api/bootstrap-ceo/invite");

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Instance admin is required");
    expect(db.inviteInsert).not.toHaveBeenCalled();
  });
});
