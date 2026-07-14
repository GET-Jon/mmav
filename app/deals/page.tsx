import { AppSidebar } from "@/components/navigation/app-sidebar";
import { DealsPipelineTable } from "@/components/deals/deals-pipeline-table";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

type SavedEvaluation = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string | null;
  vin: string | null;
  vehicle_title: string | null;
  mileage: number | null;
  current_bid: number | null;
  target_resale_used: number | null;
  safe_bid: number | null;
  max_smart_bid: number | null;
  stretch_bid: number | null;
  expected_gross_profit: number | null;
  decision: string | null;
  risk_grade: string | null;
  auction_site: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_by_email?: string | null;
  updated_by_email?: string | null;
  created_by_label?: string | null;
  updated_by_label?: string | null;
};

type CompanyUserOption = {
  id: string;
  email: string | null;
  label: string;
};

function compactUserLabelFromEmail(email?: string | null) {
  const clean = String(email || "").trim();

  if (!clean) {
    return "Unknown";
  }

  const beforeAt = clean.includes("@") ? clean.split("@")[0] : clean;
  const firstPart = beforeAt.split(/[._\-\s]+/).filter(Boolean)[0] || beforeAt;

  if (!firstPart) {
    return clean.slice(0, 5);
  }

  const normalized =
    firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase();

  return normalized.length <= 10 ? normalized : normalized.slice(0, 5);
}

function getUserDisplayLabel(user: {
  email?: string | null;
  user_metadata?: {
    full_name?: unknown;
    name?: unknown;
  };
}) {
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";

  if (fullName) {
    return fullName;
  }

  const name =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : "";

  if (name) {
    return name;
  }

  return compactUserLabelFromEmail(user.email);
}


async function getSavedEvaluations(userId: string) {
  const supabase = createSupabaseAdminClient();
  const company = await getCurrentCompanyForUser(supabase, userId);

  const { data: members, error: membersError } = await supabase
    .from("company_memberships")
    .select("user_id, status")
    .eq("company_id", company.companyId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (membersError) {
    return {
      evaluations: [] as SavedEvaluation[],
      companyUsers: [] as CompanyUserOption[],
      error: membersError.message,
    };
  }

  const companyUserIds = Array.from(
    new Set(((members || []) as Array<{ user_id: string | null }>).map(
      (member) => member.user_id
    ).filter(Boolean) as string[])
  );

  const { data, error } = await supabase
    .from("auction_evaluations")
    .select(
      `
      id,
      created_at,
      updated_at,
      status,
      vin,
      vehicle_title,
      mileage,
      current_bid,
      target_resale_used,
      safe_bid,
      max_smart_bid,
      stretch_bid,
      expected_gross_profit,
      decision,
      risk_grade,
      auction_site,
      created_by,
      updated_by
    `
    )
    .eq("company_id", company.companyId)
    .order("updated_at", {
      ascending: false,
    })
    .limit(50);

  if (error) {
    return {
      evaluations: [] as SavedEvaluation[],
      companyUsers: [] as CompanyUserOption[],
      error: error.message,
    };
  }

  const evaluations = (data || []) as SavedEvaluation[];
  const evaluationUserIds = evaluations
    .flatMap((evaluation) => [evaluation.created_by, evaluation.updated_by])
    .filter(Boolean) as string[];

  const userIds = Array.from(new Set([...companyUserIds, ...evaluationUserIds]));

  const userEmailById = new Map<string, string>();
  const userLabelById = new Map<string, string>();

  if (userIds.length) {
    const { data: usersData } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    for (const authUser of usersData?.users || []) {
      if (userIds.includes(authUser.id)) {
        const email = authUser.email || authUser.id;
        userEmailById.set(authUser.id, email);
        userLabelById.set(authUser.id, getUserDisplayLabel(authUser));
      }
    }
  }

  const companyUsers = companyUserIds.map((memberUserId) => {
    const email = userEmailById.get(memberUserId) || null;

    return {
      id: memberUserId,
      email,
      label:
        userLabelById.get(memberUserId) ||
        compactUserLabelFromEmail(email) ||
        "Unknown",
    };
  });

  return {
    evaluations: evaluations.map((evaluation) => ({
      ...evaluation,
      created_by_email: evaluation.created_by
        ? userEmailById.get(evaluation.created_by) || "Unknown user"
        : null,
      updated_by_email: evaluation.updated_by
        ? userEmailById.get(evaluation.updated_by) || "Unknown user"
        : null,
      created_by_label: evaluation.created_by
        ? userLabelById.get(evaluation.created_by) ||
          compactUserLabelFromEmail(userEmailById.get(evaluation.created_by))
        : null,
      updated_by_label: evaluation.updated_by
        ? userLabelById.get(evaluation.updated_by) ||
          compactUserLabelFromEmail(userEmailById.get(evaluation.updated_by))
        : null,
    })),
    companyUsers,
    error: null as string | null,
  };
}

export default async function DealsPage() {
  const user = await getCurrentUser();
  let evaluations: SavedEvaluation[] = [];
  let companyUsers: CompanyUserOption[] = [];
  let loadError: string | null = null;

  try {
    if (!user) {
      throw new Error("You must be signed in to view saved searches.");
    }

    const result = await getSavedEvaluations(user.id);
    evaluations = result.evaluations;
    companyUsers = result.companyUsers;
    loadError = result.error;
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Deal Pipeline failed to load.";
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <AppSidebar active="saved" userEmail={user?.email} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 p-6">
            <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Deal Pipeline
                </h1>
                <p className="mt-1 text-slate-600">
                  Track watched vehicles, bids, passes, wins, losses, and
                  purchases.
                </p>
              </div>

              <div className="rounded-xl bg-white px-4 py-3 text-sm font-semibold shadow-sm">
                {evaluations.length} saved evaluations
              </div>
            </div>

            {loadError ? (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                Deal Pipeline could not load: {loadError}
              </div>
            ) : null}

            <DealsPipelineTable
              evaluations={evaluations}
              companyUsers={companyUsers}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
