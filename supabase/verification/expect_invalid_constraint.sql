-- This must fail with a foreign-key violation.
insert into public.vicios (usuario_id, nome_vicio, data_inicio)
values ('00000000-0000-4000-8000-000000000099', 'synthetic-invalid', now());
