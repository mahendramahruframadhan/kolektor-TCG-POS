import type { users } from "@kolektapos/db/schema";

type UserRow = typeof users.$inferSelect;

export type UserDto = Omit<UserRow, "passwordHash">;

/** Project a user row to its safe external representation (never includes passwordHash). */
export function userDto(row: UserRow): UserDto {
  const { passwordHash: _omit, ...rest } = row;
  return rest;
}
