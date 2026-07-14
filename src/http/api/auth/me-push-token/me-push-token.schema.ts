import { z } from "zod/v4";

export const UpdatePushTokenBody = z.object({
  expoPushToken: z.string().nullable(),
});
export type UpdatePushTokenBody = z.infer<typeof UpdatePushTokenBody>;

export const UpdatePushTokenResponse = z.object({
  expoPushToken: z.string().nullable(),
});
export type UpdatePushTokenResponse = z.infer<typeof UpdatePushTokenResponse>;
