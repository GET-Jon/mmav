import { notFound } from "next/navigation";
import { EvaluationWorkspace } from "@/components/evaluation/evaluation-workspace";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SavedEvaluationPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("auction_evaluations")
    .select("id, payload")
    .eq("id", id)
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
