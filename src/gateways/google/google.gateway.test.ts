import { describe, expect, it } from "vitest";
import { createGoogleGateway } from "./google.gateway";

describe("createGoogleGateway", () => {
  it("rejects a malformed idToken with AUTH-T0005 (no real network call needed)", async () => {
    const google = createGoogleGateway({ clientIds: ["test-client-id"] });

    await expect(google.verifyIdToken("not-a-real-jwt")).rejects.toMatchObject({
      code: "AUTH-T0005",
    });
  });

  it("rejects an empty idToken with AUTH-T0005", async () => {
    const google = createGoogleGateway({ clientIds: ["test-client-id"] });

    await expect(google.verifyIdToken("")).rejects.toMatchObject({ code: "AUTH-T0005" });
  });
});
