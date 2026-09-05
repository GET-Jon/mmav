import type { SupabaseClient } from "@supabase/supabase-js";

export type FindingConversationMessage = {
  id: string;
  role: "owner" | "partner";
  message: string;
  createdAt: string;
};

function cleanMessage(value: unknown) {
  return String(value ?? "").trim();
}

export async function loadFindingConversation(
  supabase: SupabaseClient,
  findingIds: string[],
): Promise<Map<string, FindingConversationMessage[]>> {
  const byFinding = new Map<string, FindingConversationMessage[]>();
  if (!findingIds.length) return byFinding;

  try {
    const { data, error } = await supabase
      .from("mindful_inventory_history")
      .select("id,entity_id,event_type,metadata,created_at")
      .eq("entity_type", "finding")
      .in("entity_id", findingIds)
      .in("event_type", [
        "mechanical_finding_clarification_requested",
        "mechanical_finding_clarification_answered",
      ])
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Could not load finding conversation history:", error.message);
      return byFinding;
    }

    for (const row of data || []) {
      const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {};
      const message = cleanMessage(metadata.notes ?? metadata.message);
      if (!message || !row.entity_id) continue;
      const role = row.event_type === "mechanical_finding_clarification_requested" ? "owner" : "partner";
      const current = byFinding.get(row.entity_id) || [];
      current.push({ id: row.id, role, message, createdAt: row.created_at });
      byFinding.set(row.entity_id, current);
    }
  } catch (error) {
    console.error(
      "Could not load finding conversation history:",
      error instanceof Error ? error.message : error,
    );
  }

  return byFinding;
}
