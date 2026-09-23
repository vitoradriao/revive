-- This must fail because direct client access to private data is forbidden.
set role anon;
select id from public.usuarios limit 1;
