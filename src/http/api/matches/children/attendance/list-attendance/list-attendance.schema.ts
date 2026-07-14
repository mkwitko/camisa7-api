import { z } from "zod/v4";

export const ListAttendanceParams = z.object({ id: z.uuid() });
export type ListAttendanceParams = z.infer<typeof ListAttendanceParams>;
