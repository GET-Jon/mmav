import { notFound } from "next/navigation";
import { EvaluationWorkspace } from "@/components/evaluation/evaluation-workspace";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getDefaultCompanyId } from "@/lib/supabase/company";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SavedEvaluationPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const companyId = await getDefaultCompanyId(supabase);

  const { data, error } = await supabase
    .from("auction_evaluations")
    .select("id, payload")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (error || !data) {
    notFound();
  }

  return (
    <EvaluationWorkspace
      initialSavedEvaluationId={data.id}
      initialSavedPayload={data.payload}
    />
  );
}
