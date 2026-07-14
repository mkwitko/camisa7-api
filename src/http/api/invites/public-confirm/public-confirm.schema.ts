import { z } from "zod/v4";
import { AttendanceStatusSchema } from "@/http/api/matches/children/attendance/attendance.schema";

export const PublicConfirmBody = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(1).optional(),
});
export type PublicConfirmBody = z.infer<typeof PublicConfirmBody>;

// Deliberately narrow — just enough for the guest's own WhatsApp confirm UI
// (their slot/waitlist outcome). No player list, no ratings.
export const PublicConfirmResponse = z.object({
  attendanceId: z.uuid(),
  status: AttendanceStatusSchema,
  waitlistPos: z.number().int().nullable(),
});
export type PublicConfirmResponse = z.infer<typeof PublicConfirmResponse>;
