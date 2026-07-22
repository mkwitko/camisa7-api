import { z } from "zod/v4";

export const CreateSubaccountParams = z.object({ id: z.uuid() });
export type CreateSubaccountParams = z.infer<typeof CreateSubaccountParams>;

export const CreateSubaccountBody = z.object({ pixKey: z.string().min(1) });
export type CreateSubaccountBody = z.infer<typeof CreateSubaccountBody>;

export const CreateSubaccountResponse = z.object({ pixKey: z.string() });
export type CreateSubaccountResponse = z.infer<typeof CreateSubaccountResponse>;
