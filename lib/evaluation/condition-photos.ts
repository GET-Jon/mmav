import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const CONDITION_PHOTO_BUCKET = "lot-logic-condition-photos";
export const CONDITION_PHOTO_LIMIT = 3;
export const CONDITION_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const CONDITION_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function photoScope(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9:_-]{1,120}$/.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

export function photoBase(companyId: string, userId: string, evaluationUsageId: string, issueId: string) {
  // All storage operations are scoped to the authenticated user and company;
  // user-submitted path components cannot contain separators.
  return [companyId, userId,
    photoScope(evaluationUsageId, "evaluation identifier"),
    createHash("sha256").update(photoIssueId(issueId)).digest("hex").slice(0, 32)].join("/");
}

export function photoIssueId(value: unknown) {
  if (typeof value !== "string" || value.length < 1 || value.length > 1500) {
    throw new Error("Invalid issue identifier.");
  }
  return value;
}

export type StoredIssuePhoto = {
  slot: number;
  path: string;
  url: string;
};

export async function listIssuePhotos(
  companyId: string, userId: string, evaluationUsageId: string, issueId: string,
): Promise<StoredIssuePhoto[]> {
  const admin = createSupabaseAdminClient();
  const prefix = photoBase(companyId, userId, evaluationUsageId, issueId);
  const { data, error } = await admin.storage.from(CONDITION_PHOTO_BUCKET).list(prefix, {
    limit: 20, sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;
  const result: StoredIssuePhoto[] = [];
  for (const item of data || []) {
    const match = /^([012])\.(jpg|png|webp)$/.exec(item.name);
    if (!match) continue;
    const path = `${prefix}/${item.name}`;
    const signed = await admin.storage.from(CONDITION_PHOTO_BUCKET).createSignedUrl(path, 300);
    if (signed.error || !signed.data) throw signed.error || new Error("Could not sign photo.");
    result.push({ slot: Number(match[1]), path, url: signed.data.signedUrl });
  }
  return result.sort((a, b) => a.slot - b.slot);
}

export function photoMime(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export const photoExtension = (mime: string) =>
  mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
