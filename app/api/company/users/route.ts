import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { getCurrentUser } from "@/lib/supabase/server-auth";

const allowedRoles = new Set(["company_admin", "user"]);
const allowedStatuses = new Set(["active", "disabled"]);

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(value: unknown) {
  const role = String(value || "user").trim();

  if (!allowedRoles.has(role)) {
    return null;
  }

  return role;
}

function normalizeStatus(value: unknown) {
  const status = String(value || "").trim();

  if (!allowedStatuses.has(status)) {
    return null;
  }

  return status;
}

async function findAuthUserByEmail(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  email: string
) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw error;
  }

  return (
    data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    ) || null
  );
}

async function countActiveCompanyAdmins(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string
) {
  const { count, error } = await supabase
    .from("company_memberships")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("company_id", companyId)
    .eq("role", "company_admin")
    .eq("status", "active");

  if (error) {
    throw error;
  }

  return count || 0;
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();

    const email = normalizeEmail(body.email);
    const role = normalizeRole(body.role);

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid user email is required." },
        { status: 400 }
      );
    }

    if (!role) {
      return NextResponse.json(
        { error: "Role must be company_admin or user." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const company = await getCurrentCompanyForUser(supabase, currentUser.id);

    if (company.role !== "company_admin") {
      return NextResponse.json(
        { error: "Only company admins can add users." },
        { status: 403 }
      );
    }

    let authUser = await findAuthUserByEmail(supabase, email);

    if (!authUser) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          source: "mmav_company_user_add",
          company_id: company.companyId,
          company_name: company.companyName,
        },
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      authUser = data.user;
    }

    if (!authUser?.id) {
      return NextResponse.json(
        { error: "Could not create or locate auth user." },
        { status: 500 }
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .upsert(
        {
          company_id: company.companyId,
          user_id: authUser.id,
          role,
          status: "active",
          created_by: currentUser.id,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "company_id,user_id",
        }
      )
      .select("id, company_id, user_id, role, status, created_at, updated_at")
      .single();

    if (membershipError) {
      return NextResponse.json(
        { error: membershipError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      user: {
        id: authUser.id,
        email: authUser.email,
      },
      membership,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to add company user.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();

    const membershipId = String(body.membershipId || "").trim();

    let role: string | undefined;
    let status: string | undefined;

    if (body.role !== undefined) {
      const normalizedRole = normalizeRole(body.role);

      if (!normalizedRole) {
        return NextResponse.json(
          { error: "Role must be company_admin or user." },
          { status: 400 }
        );
      }

      role = normalizedRole;
    }

    if (body.status !== undefined) {
      const normalizedStatus = normalizeStatus(body.status);

      if (!normalizedStatus) {
        return NextResponse.json(
          { error: "Status must be active or disabled." },
          { status: 400 }
        );
      }

      status = normalizedStatus;
    }

    if (!membershipId) {
      return NextResponse.json(
        { error: "Membership id is required." },
        { status: 400 }
      );
    }

    if (role === undefined && status === undefined) {
      return NextResponse.json(
        { error: "No user changes were provided." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const company = await getCurrentCompanyForUser(supabase, currentUser.id);

    if (company.role !== "company_admin") {
      return NextResponse.json(
        { error: "Only company admins can manage users." },
        { status: 403 }
      );
    }

    const { data: targetMembership, error: targetError } = await supabase
      .from("company_memberships")
      .select("id, company_id, user_id, role, status")
      .eq("id", membershipId)
      .eq("company_id", company.companyId)
      .single();

    if (targetError || !targetMembership) {
      return NextResponse.json(
        { error: "Company membership not found." },
        { status: 404 }
      );
    }

    const targetIsCurrentUser = targetMembership.user_id === currentUser.id;

    if (targetIsCurrentUser && status === "disabled") {
      return NextResponse.json(
        { error: "You cannot disable your own company access." },
        { status: 400 }
      );
    }

    if (targetIsCurrentUser && role === "user") {
      return NextResponse.json(
        { error: "You cannot demote your own admin role." },
        { status: 400 }
      );
    }

    const targetCurrentlyActiveAdmin =
      targetMembership.role === "company_admin" &&
      targetMembership.status === "active";

    const wouldStopBeingActiveAdmin =
      targetCurrentlyActiveAdmin &&
      (role === "user" || status === "disabled");

    if (wouldStopBeingActiveAdmin) {
      const activeAdminCount = await countActiveCompanyAdmins(
        supabase,
        company.companyId
      );

      if (activeAdminCount <= 1) {
        return NextResponse.json(
          {
            error: "This company must keep at least one active company admin.",
          },
          { status: 400 }
        );
      }
    }

    const update: {
      role?: string;
      status?: string;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (role !== undefined) {
      update.role = role;
    }

    if (status !== undefined) {
      update.status = status;
    }

    const { data, error } = await supabase
      .from("company_memberships")
      .update(update)
      .eq("id", membershipId)
      .eq("company_id", company.companyId)
      .select("id, company_id, user_id, role, status, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      membership: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update company user.",
      },
      { status: 500 }
    );
  }
}
