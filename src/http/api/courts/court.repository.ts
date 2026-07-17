import type { PrismaLike } from "@/infra/db/client";
import type { BookingMode, Court, CourtWithVenue, Modality, PriceRule } from "./court.types";

type CourtRow = {
  id: string;
  venueId: string;
  name: string;
  modality: Modality;
  surface: string | null;
  slotMinutes: number;
  bookingMode: BookingMode;
  depositPercent: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type PriceRuleRow = {
  id: string;
  courtId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  priceCents: number;
};

function toDomainCourt(row: CourtRow): Court {
  return {
    id: row.id,
    venueId: row.venueId,
    name: row.name,
    modality: row.modality,
    surface: row.surface ?? null,
    slotMinutes: row.slotMinutes,
    bookingMode: row.bookingMode,
    depositPercent: row.depositPercent ?? null,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDomainPriceRule(row: PriceRuleRow): PriceRule {
  return {
    id: row.id,
    courtId: row.courtId,
    weekday: row.weekday,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    priceCents: row.priceCents,
  };
}

export type InsertCourtInput = {
  venueId: string;
  name: string;
  modality: Modality;
  surface?: string | null | undefined;
  slotMinutes: number;
  bookingMode: BookingMode;
  depositPercent?: number | null | undefined;
};

export type UpdateCourtPatch = {
  name?: string | undefined;
  modality?: Modality | undefined;
  surface?: string | null | undefined;
  slotMinutes?: number | undefined;
  bookingMode?: BookingMode | undefined;
  depositPercent?: number | null | undefined;
  active?: boolean | undefined;
};

export type PriceRuleInput = {
  weekday: number;
  startMinute: number;
  endMinute: number;
  priceCents: number;
};

export interface CourtRepository {
  insert(input: InsertCourtInput): Promise<Court>;
  findById(id: string): Promise<Court | null>;
  /** `Court` joined with its `Venue.ownerId` — the shape `assertCourtOwner` needs. */
  findByIdWithVenue(id: string): Promise<CourtWithVenue | null>;
  update(id: string, patch: UpdateCourtPatch): Promise<Court>;
  /**
   * Courts of a `Venue`, newest first. `includeInactive` false (default)
   * hides `active:false` rows — the public court list a non-owner sees.
   */
  listByVenue(venueId: string, opts?: { includeInactive?: boolean }): Promise<Court[]>;
  /**
   * Replaces all of a court's price rules atomically: `deleteMany` then
   * `createMany` inside an interactive transaction when `db` is the top-level
   * client (composes as a single step when `db` is already a `tx`).
   */
  replacePriceRules(courtId: string, rules: PriceRuleInput[]): Promise<PriceRule[]>;
  listPriceRules(courtId: string): Promise<PriceRule[]>;
}

/** Factory `createCourtRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createCourtRepository(db: PrismaLike): CourtRepository {
  return {
    async insert(input) {
      const row = await db.court.create({
        data: {
          venueId: input.venueId,
          name: input.name,
          modality: input.modality,
          surface: input.surface ?? null,
          slotMinutes: input.slotMinutes,
          bookingMode: input.bookingMode,
          depositPercent: input.depositPercent ?? null,
        },
      });
      return toDomainCourt(row);
    },

    async findById(id) {
      const row = await db.court.findUnique({ where: { id } });
      return row ? toDomainCourt(row) : null;
    },

    async findByIdWithVenue(id) {
      const row = await db.court.findUnique({
        where: { id },
        include: { venue: { select: { ownerId: true } } },
      });
      if (!row) return null;
      return { ...toDomainCourt(row), venue: { ownerId: row.venue.ownerId } };
    },

    async update(id, patch) {
      const row = await db.court.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.modality !== undefined ? { modality: patch.modality } : {}),
          ...(patch.surface !== undefined ? { surface: patch.surface } : {}),
          ...(patch.slotMinutes !== undefined ? { slotMinutes: patch.slotMinutes } : {}),
          ...(patch.bookingMode !== undefined ? { bookingMode: patch.bookingMode } : {}),
          ...(patch.depositPercent !== undefined ? { depositPercent: patch.depositPercent } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        },
      });
      return toDomainCourt(row);
    },

    async listByVenue(venueId, opts) {
      const rows = await db.court.findMany({
        where: { venueId, ...(opts?.includeInactive ? {} : { active: true }) },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(toDomainCourt);
    },

    async replacePriceRules(courtId, rules) {
      const run = async (client: PrismaLike) => {
        await client.courtPriceRule.deleteMany({ where: { courtId } });
        if (rules.length > 0) {
          await client.courtPriceRule.createMany({
            data: rules.map((rule) => ({ courtId, ...rule })),
          });
        }
        return client.courtPriceRule.findMany({
          where: { courtId },
          orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        });
      };

      // `db` is either the top-level `PrismaClient` (has `$transaction`) or
      // an interactive-tx `Prisma.TransactionClient` (doesn't, per
      // `ITXClientDenyList` — nested transactions aren't a thing). Wrap in
      // `$transaction` only in the former case; in the latter, the two
      // writes are already atomic as part of the caller's tx.
      const rows = "$transaction" in db ? await db.$transaction((tx) => run(tx)) : await run(db);
      return rows.map(toDomainPriceRule);
    },

    async listPriceRules(courtId) {
      const rows = await db.courtPriceRule.findMany({
        where: { courtId },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      });
      return rows.map(toDomainPriceRule);
    },
  };
}
