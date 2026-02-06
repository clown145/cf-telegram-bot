import type { ActionHandler } from "../../handlers";

function normalizeStatus(value: unknown): string {
  const status = String(value || "").trim().toLowerCase();
  if (status === "creator") {
    return "owner";
  }
  return status;
}

function buildFlags(status: string): Record<string, boolean> {
  const normalized = normalizeStatus(status);
  const isOwner = normalized === "owner";
  const isAdmin = normalized === "administrator" || isOwner;
  const isRestricted = normalized === "restricted";
  const isLeft = normalized === "left";
  const isBanned = normalized === "kicked";
  const isMember = !isLeft && !isBanned;

  return {
    is_admin: isAdmin,
    is_owner: isOwner,
    is_member: isMember,
    is_restricted: isRestricted,
    is_left: isLeft,
    is_banned: isBanned,
  };
}

export const handler: ActionHandler = async (params) => {
  const normalizedStatus = normalizeStatus(params.status);
  const check = String(params.check || "is_admin").trim().toLowerCase();
  const expected = params.expected === undefined ? true : Boolean(params.expected);
  const flags = buildFlags(normalizedStatus);
  const actual = Boolean((flags as Record<string, boolean>)[check]);
  const matched = actual === expected;

  return {
    __flow__: matched ? "true" : "false",
    matched,
    normalized_status: normalizedStatus,
    ...flags,
  };
};