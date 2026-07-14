import { z } from "zod/v4";

// No body: mark-paid always self-declares (or, for the owner, records) the
// target attendance as fully paid — there's nothing for the client to
// submit besides the ids already in the URL. `confirm-payment`'s owner-only
// endpoint is the one that accepts a `{ paid }` toggle.
export const MarkPaidParams = z.object({ id: z.uuid(), attId: z.uuid() });
export type MarkPaidParams = z.infer<typeof MarkPaidParams>;
