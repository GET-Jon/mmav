// The legacy global key is intentionally not read: it may belong to another user.
export const evaluationDraftStorageKey = "mmav:evaluationDraft:v1";

export function evaluationDraftStorageKeyForUser(userId: string): string {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error("A valid authenticated user ID is required for evaluation drafts.");
  }
  return `mmav:evaluationDraft:v2:${userId}`;
}
