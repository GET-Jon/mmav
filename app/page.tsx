import { EvaluationWorkspace } from "@/components/evaluation/evaluation-workspace";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export default async function Home() {
  const user = await getCurrentUser();

  return <EvaluationWorkspace userEmail={user?.email} />;
}
