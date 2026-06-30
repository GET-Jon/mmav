import { notFound } from "next/navigation";
import { EvaluationWorkspace } from "@/components/evaluation/evaluation-workspace";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SavedEvaluationPage({ params }: PageProps) {
  const { id } = await params;

  const user = await getCurrentUser();

  if (!user) {
    notFound();
  }

  const supabase = createSupabaseAdminClient();
  const company = await getCurrentCompanyForUser(supabase, user.id);

  const { data, error } = await supabase
    .from("auction_evaluations")
    .select("id, payload")
    .eq("id", id)
    .eq("company_id", company.companyId)
    .single();

  if (error || !data) {
    notFound();
  }

  return (
    <EvaluationWorkspace
      initialSavedEvaluationId={data.id}
      initialSavedPayload={data.payload}
      userEmail={user.email}
    />
  );
}
