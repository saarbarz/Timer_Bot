export const defaultUserId = "local-user";

export const chunk13TestUserIds = ["test-user-a", "test-user-b"] as const;

export type Chunk13TestUserId = (typeof chunk13TestUserIds)[number];

export function isChunk13TestUserId(value: string): value is Chunk13TestUserId {
  return (chunk13TestUserIds as readonly string[]).includes(value);
}

export function assertKnownLocalUserId(value: string): string {
  if (value === defaultUserId || isChunk13TestUserId(value)) {
    return value;
  }

  throw new Error("Unknown local user id.");
}
