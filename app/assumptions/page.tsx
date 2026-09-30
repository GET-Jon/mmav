import { redirect } from "next/navigation";

export default function AssumptionsPage() {
  redirect("/settings?tab=evaluator");
}
