/**
 * Domain `InviteToken` — not the Prisma row. A shareable link an owner mints
 * for one `Match` (`invites.repository.ts`'s `create`, reused across repeat
 * calls rather than minting a new token each time). Resolved by anonymous
 * guests via the public `GET /invite/:token` and `POST /invite/confirm` —
 * the viral-loop surface (WhatsApp share -> guest confirms, no app/account).
 */
export type InviteToken = {
  id: string;
  matchId: string;
  token: string;
  createdAt: string;
};
