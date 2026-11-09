import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createSupabaseServerAuthClient, getCurrentUser } from "@/lib/supabase/server-auth";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import {
  CONDITION_PHOTO_BUCKET, CONDITION_PHOTO_LIMIT, CONDITION_PHOTO_MAX_BYTES,
  listIssuePhotos, photoBase, photoExtension, photoIssueId, photoMime, photoScope,
} from "@/lib/evaluation/condition-photos";

export const runtime = "nodejs";

async function scope(request: Request) {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createSupabaseServerAuthClient();
  const company = await getCurrentCompanyForUser(supabase, user.id);
  const url = new URL(request.url);
  return { userId: user.id, companyId: company.companyId,
    evaluationUsageId: photoScope(url.searchParams.get("evaluationUsageId"), "evaluation identifier"),
    issueId: photoIssueId(url.searchParams.get("issueId")) };
}
function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "Photo request failed.";
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const ctx = await scope(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    return NextResponse.json({ photos: await listIssuePhotos(
      ctx.companyId, ctx.userId, ctx.evaluationUsageId, ctx.issueId) });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    const ctx = await scope(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose one image." }, { status: 400 });
    }
    if (file.size === 0 || file.size > CONDITION_PHOTO_MAX_BYTES) {
      return NextResponse.json({ error: "Photo must be between 1 byte and 4 MB." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = photoMime(bytes);
    if (!mime || mime !== file.type) {
      return NextResponse.json({ error: "Only valid JPG, PNG, and WebP photos are accepted." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const existing = await listIssuePhotos(ctx.companyId, ctx.userId, ctx.evaluationUsageId, ctx.issueId);
    if (existing.length >= CONDITION_PHOTO_LIMIT) {
      return NextResponse.json({ error: "Maximum three photos per issue. Remove one first." }, { status: 409 });
    }
    const slot = [0, 1, 2].find((n) => !existing.some((item) => item.slot === n));
    if (slot === undefined) {
      return NextResponse.json({ error: "Maximum three photos per issue." }, { status: 409 });
    }
    const prefix = photoBase(ctx.companyId, ctx.userId, ctx.evaluationUsageId, ctx.issueId);
    const objectPath = `${prefix}/${slot}.${photoExtension(mime)}`;
    const { error } = await admin.storage.from(CONDITION_PHOTO_BUCKET).upload(objectPath, bytes, {
      contentType: mime, cacheControl: "60", upsert: false,
    });
    if (error) {
      return NextResponse.json({ error: "Could not store photo. Retry or remove an existing photo." }, { status: 409 });
    }
    return NextResponse.json({ photos: await listIssuePhotos(
      ctx.companyId, ctx.userId, ctx.evaluationUsageId, ctx.issueId) });
  } catch (error) { return fail(error); }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await scope(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const slotText = new URL(request.url).searchParams.get("slot");
    if (!slotText || !/^[012]$/.test(slotText)) {
      return NextResponse.json({ error: "Invalid photo slot." }, { status: 400 });
    }
    const slot = Number(slotText);
    const existing = await listIssuePhotos(ctx.companyId, ctx.userId, ctx.evaluationUsageId, ctx.issueId);
    const photo = existing.find((item) => item.slot === slot);
    if (!photo) return NextResponse.json({ photos: existing });
    const admin = createSupabaseAdminClient();
    const { error } = await admin.storage.from(CONDITION_PHOTO_BUCKET).remove([photo.path]);
    if (error) throw error;
    return NextResponse.json({ photos: await listIssuePhotos(
      ctx.companyId, ctx.userId, ctx.evaluationUsageId, ctx.issueId) });
  } catch (error) { return fail(error); }
}
