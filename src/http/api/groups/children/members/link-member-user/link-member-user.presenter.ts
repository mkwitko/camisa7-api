import { presentMember } from "../members.presenter";
import type { LinkMemberUserResponse } from "./link-member-user.schema";
import type { LinkMemberUserResult } from "./link-member-user.service";

/** Flattens the service's domain result into the API response shape. */
export function presentLinkMemberUserResult(result: LinkMemberUserResult): LinkMemberUserResponse {
  return {
    member: presentMember(result.member),
    summary: result.summary,
  };
}
