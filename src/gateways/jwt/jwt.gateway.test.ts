import { describe, expect, it } from "vitest";
import { createJwtGateway } from "./jwt.gateway";

const config = {
  accessSecret: "test-access-secret-at-least-16-chars",
  refreshSecret: "test-refresh-secret-at-least-16-chars",
  accessTtl: "15m",
  refreshTtl: "30d",
};

describe("createJwtGateway", () => {
  it("round-trips an access token back to the same sub", async () => {
    const jwt = createJwtGateway(config);

    const token = await jwt.signAccess({ sub: "user-1" });
    const { sub } = await jwt.verifyAccess(token);

    expect(sub).toBe("user-1");
  });

  it("round-trips a refresh token back to the same sub", async () => {
    const jwt = createJwtGateway(config);

    const token = await jwt.signRefresh({ sub: "user-1" });
    const { sub } = await jwt.verifyRefresh(token);

    expect(sub).toBe("user-1");
  });

  it("rejects a refresh token presented as an access token (different secrets)", async () => {
    const jwt = createJwtGateway(config);

    const refreshToken = await jwt.signRefresh({ sub: "user-1" });

    await expect(jwt.verifyAccess(refreshToken)).rejects.toMatchObject({ code: "AUTH-T0001" });
  });

  it("rejects a garbage token with AUTH-T0001", async () => {
    const jwt = createJwtGateway(config);

    await expect(jwt.verifyAccess("not-a-real-token")).rejects.toMatchObject({
      code: "AUTH-T0001",
    });
  });

  it("rejects a token signed with a different access secret", async () => {
    const jwt = createJwtGateway(config);
    const otherJwt = createJwtGateway({
      ...config,
      accessSecret: "a-completely-different-secret!!",
    });

    const token = await otherJwt.signAccess({ sub: "user-1" });

    await expect(jwt.verifyAccess(token)).rejects.toMatchObject({ code: "AUTH-T0001" });
  });

  it("rejects an already-expired access token", async () => {
    const jwt = createJwtGateway({ ...config, accessTtl: "-1s" });

    const token = await jwt.signAccess({ sub: "user-1" });

    await expect(jwt.verifyAccess(token)).rejects.toMatchObject({ code: "AUTH-T0001" });
  });
});
