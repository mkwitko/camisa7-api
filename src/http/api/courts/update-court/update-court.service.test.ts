import { describe, expect, it, vi } from "vitest";
import type { CourtRepository } from "../court.repository";
import type { CourtWithVenue } from "../court.types";
import { createUpdateCourtService } from "./update-court.service";

const aCourt = (overrides: Partial<CourtWithVenue> = {}): CourtWithVenue => ({
  id: "c1",
  venueId: "v1",
  name: "Quadra 1",
  modality: "futsal",
  surface: null,
  slotMinutes: 60,
  bookingMode: "instant",
  depositPercent: null,
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  venue: { ownerId: "owner-1" },
  ...overrides,
});

function makeCourtRepo(overrides: Partial<CourtRepository> = {}): CourtRepository {
  return {
    insert: vi.fn(),
    findById: vi.fn(),
    findByIdWithVenue: vi.fn().mockResolvedValue(aCourt()),
    update: vi.fn().mockImplementation(async (_id, patch) => ({ ...aCourt(), ...patch })),
    listByVenue: vi.fn(),
    replacePriceRules: vi.fn(),
    listPriceRules: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("createUpdateCourtService", () => {
  it("updates when the caller owns the court (via the venue)", async () => {
    const courtRepo = makeCourtRepo();
    const service = createUpdateCourtService({ courtRepo });

    const court = await service({
      courtId: "c1",
      userId: "owner-1",
      patch: { name: "Quadra Renovada" },
    });

    expect(court.name).toBe("Quadra Renovada");
    expect(courtRepo.update).toHaveBeenCalledWith("c1", { name: "Quadra Renovada" });
  });

  it("rejects with CRT-T0001 when the court doesn't exist", async () => {
    const courtRepo = makeCourtRepo({ findByIdWithVenue: vi.fn().mockResolvedValue(null) });
    const service = createUpdateCourtService({ courtRepo });

    await expect(
      service({ courtId: "c1", userId: "owner-1", patch: { name: "X" } }),
    ).rejects.toMatchObject({ code: "CRT-T0001" });
    expect(courtRepo.update).not.toHaveBeenCalled();
  });

  it("rejects with CRT-T0002 when the caller isn't the venue owner", async () => {
    const courtRepo = makeCourtRepo();
    const service = createUpdateCourtService({ courtRepo });

    await expect(
      service({ courtId: "c1", userId: "intruder", patch: { name: "X" } }),
    ).rejects.toMatchObject({ code: "CRT-T0002" });
    expect(courtRepo.update).not.toHaveBeenCalled();
  });

  it("rejects with CRT-T0004 when switching to deposit mode without depositPercent", async () => {
    const courtRepo = makeCourtRepo();
    const service = createUpdateCourtService({ courtRepo });

    await expect(
      service({ courtId: "c1", userId: "owner-1", patch: { bookingMode: "deposit" } }),
    ).rejects.toMatchObject({ code: "CRT-T0004" });
    expect(courtRepo.update).not.toHaveBeenCalled();
  });

  it("allows switching to deposit mode when depositPercent is supplied in the same patch", async () => {
    const courtRepo = makeCourtRepo();
    const service = createUpdateCourtService({ courtRepo });

    const court = await service({
      courtId: "c1",
      userId: "owner-1",
      patch: { bookingMode: "deposit", depositPercent: 30 },
    });

    expect(court.bookingMode).toBe("deposit");
  });

  it("allows a patch that doesn't touch bookingMode on a court that's already deposit-mode", async () => {
    const courtRepo = makeCourtRepo({
      findByIdWithVenue: vi
        .fn()
        .mockResolvedValue(aCourt({ bookingMode: "deposit", depositPercent: 20 })),
    });
    const service = createUpdateCourtService({ courtRepo });

    const court = await service({ courtId: "c1", userId: "owner-1", patch: { name: "Novo nome" } });

    expect(court.name).toBe("Novo nome");
  });

  it("rejects with CRT-T0004 when clearing depositPercent while staying in deposit mode", async () => {
    const courtRepo = makeCourtRepo({
      findByIdWithVenue: vi
        .fn()
        .mockResolvedValue(aCourt({ bookingMode: "deposit", depositPercent: 20 })),
    });
    const service = createUpdateCourtService({ courtRepo });

    await expect(
      service({ courtId: "c1", userId: "owner-1", patch: { depositPercent: null } }),
    ).rejects.toMatchObject({ code: "CRT-T0004" });
  });
});
