import { z } from "zod/v4";

// No body: mark-paid always self-declares (or, for the owner, records) the
// target due as fully paid — mirrors `mark-paid.schema.ts` (attendance)
// exactly. `confirm-due`'s owner-only endpoint is the one that accepts a
// `{ paid }` toggle.
export const MarkPaidDueParams = z.object({ id: z.uuid() });
export type MarkPaidDueParams = z.infer<typeof MarkPaidDueParams>;
