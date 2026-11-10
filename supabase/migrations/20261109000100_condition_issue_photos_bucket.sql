-- Private, authenticated issue photographs for evaluator condition reviews.
-- Photos are accessed exclusively through authenticated server routes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lot-logic-condition-photos',
  'lot-logic-condition-photos',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 4194304,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- No direct client storage policies are granted. All object operations run
-- behind server-side authentication and tenant-scoped paths using service-role.
