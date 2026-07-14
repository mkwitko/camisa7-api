import type { FastifyPluginAsync } from "fastify";
import { cancelPresenceRoute } from "./cancel-presence/cancel-presence.controller";
import { confirmPaymentRoute } from "./confirm-payment/confirm-payment.controller";
import { confirmPresenceRoute } from "./confirm-presence/confirm-presence.controller";
import { listAttendanceRoute } from "./list-attendance/list-attendance.controller";
import { markPaidRoute } from "./mark-paid/mark-paid.controller";

/** Registers the `attendance` child-resource routes under `/matches/:id/attendance`. */
export const attendanceRoutes: FastifyPluginAsync = async (app) => {
  await app.register(confirmPresenceRoute);
  await app.register(cancelPresenceRoute);
  await app.register(listAttendanceRoute);
  await app.register(markPaidRoute);
  await app.register(confirmPaymentRoute);
};
