-- Align existing databases with the private function grants of the baseline.
-- Existing triggers continue to execute; only direct client EXECUTE is removed.
revoke all on function public.atualizar_data_modificacao()
  from public, anon, authenticated;
grant execute on function public.atualizar_data_modificacao() to service_role;
