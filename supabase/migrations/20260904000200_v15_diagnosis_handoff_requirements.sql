-- V15: unresolved diagnosis is executable only when the inspector defines the handoff.
-- Existing historical rows are allowed to remain as-is; the NOT VALID constraint is
-- enforced for new/updated rows and can be validated after legacy cleanup.

alter table public.mindful_inventory_findings
  add constraint mindful_inventory_findings_needs_diagnosis_handoff_check
  check (
    mechanical_validation_status <> 'needs_diagnosis'
    or (
      nullif(btrim(coalesce(mechanical_validation_notes, '')), '') is not null
      and nullif(btrim(coalesce(mechanical_recommended_action, '')), '') is not null
    )
  ) not valid;

comment on constraint mindful_inventory_findings_needs_diagnosis_handoff_check on public.mindful_inventory_findings is
  'Future needs_diagnosis findings must explain what remains unknown and the next diagnostic action so the Work Plan can create a diagnosis-only handoff.';
