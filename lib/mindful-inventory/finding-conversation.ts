import type { SupabaseClient } from "@supabase/supabase-js";

export type FindingConversationMessage = {
  id: string;
  role: "owner" | "partner";
  message: string;
  createdAt: string;
};

type ConversationHistoryRow = {
  id: string;
  entity_id: string | null;
  event_type: string;
  metadata: unknown;
  created_at: string;
};

function cleanMessage(value: unknown) {
  return String(value ?? "").trim();
}

function addRows(
  byFinding: Map<string, FindingConversationMessage[]>,
  rows: ConversationHistoryRow[],
) {
  for (const row of rows) {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const message = cleanMessage(metadata.notes ?? metadata.message);
    if (!message || !row.entity_id) continue;

    const role =
      row.event_type === "mechanical_finding_clarification_requested"
        ? "owner"
        : "partner";
    const current = byFinding.get(row.entity_id) || [];

    // Avoid duplicates if a fallback query returns a row already loaded by the
    // normal batched query.
    if (!current.some((entry) => entry.id === row.id)) {
      current.push({ id: row.id, role, message, createdAt: row.created_at });
      current.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      byFinding.set(row.entity_id, current);
    }
  }
}

export async function loadFindingConversation(
  supabase: SupabaseClient,
  findingIds: string[],
): Promise<Map<string, FindingConversationMessage[]>> {
  const byFinding = new Map<string, FindingConversationMessage[]>();
  const ids = [...new Set(findingIds.filter(Boolean))];
  if (!ids.length) return byFinding;

  try {
    const { data, error } = await supabase
      .from("mindful_inventory_history")
      .select("id,entity_id,event_type,metadata,created_at")
      .eq("entity_type", "finding")
      .in("entity_id", ids)
      .in("event_type", [
        "mechanical_finding_clarification_requested",
        "mechanical_finding_clarification_answered",
      ])
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Could not batch-load finding conversation history:", error.message);
    } else {
      addRows(byFinding, (data || []) as ConversationHistoryRow[]);
    }

    // PostgREST should handle the batched UUID IN query above. In practice we
    // have seen the Partner portal receive an empty batch even though the same
    // history rows are present and visible to the Owner. If any requested
    // finding is still empty, query that finding directly so a transient/batch
    // mismatch cannot erase project context from one side of the conversation.
    const missingIds = ids.filter((id) => !(byFinding.get(id)?.length));
    if (missingIds.length) {
      const fallbackResults = await Promise.all(
        missingIds.map(async (findingId) => {
          const result = await supabase
            .from("mindful_inventory_history")
            .select("id,entity_id,event_type,metadata,created_at")
            .eq("entity_type", "finding")
            .eq("entity_id", findingId)
            .in("event_type", [
              "mechanical_finding_clarification_requested",
              "mechanical_finding_clarification_answered",
            ])
            .order("created_at", { ascending: true });
          return { findingId, ...result };
        }),
      );

      for (const result of fallbackResults) {
        if (result.error) {
          console.error(
            `Could not directly load finding conversation history for ${result.findingId}:`,
            result.error.message,
          );
          continue;
        }
        addRows(byFinding, (result.data || []) as ConversationHistoryRow[]);
      }
    }
  } catch (error) {
    console.error(
      "Could not load finding conversation history:",
      error instanceof Error ? error.message : error,
    );
  }

  return byFinding;
}
