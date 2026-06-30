import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { getCurrentUser } from "@/lib/supabase/server-auth";

const allowedRoles = new Set(["company_admin", "user"]);

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
