-- Viralizei: teste de permissões. Rodar depois de toda migração que mexe em
-- política ou grant (execute_sql do Supabase). Tudo dentro de rollback.
-- Esperado: 1 >= 1 (controle), 2-5 false, 6 = 0, 7 false, 8-9 false, 10 = 0.
begin;
create temp table r (caso text, resultado text) on commit drop;
grant all on r to anon, authenticated;
insert into public.formatos (id, nome) values ('teste', 'Teste');
insert into public.dias (id, numero, gancho, formato_id) values ('dteste', 999, 'Gancho de teste', 'teste');
insert into r select '1 controle: dono do banco vê dias', count(*)::text from public.dias;
insert into r select '2 anon pode ler dias', has_table_privilege('anon', 'public.dias', 'select')::text;
insert into r select '3 anon pode ler socios', has_table_privilege('anon', 'public.socios', 'select')::text;
insert into r select '4 logado pode ler socios', has_table_privilege('authenticated', 'public.socios', 'select')::text;
insert into r select '5 logado pode gravar user_id no progresso', has_column_privilege('authenticated', 'public.progresso', 'user_id', 'insert')::text;
insert into r select '8 logado pode escrever no radar', (has_table_privilege('authenticated', 'public.radar', 'insert') or has_table_privilege('authenticated', 'public.radar', 'update') or has_table_privilege('authenticated', 'public.radar', 'delete'))::text;
insert into r select '9 logado pode conferir o segredo do cron', has_function_privilege('authenticated', 'public.radar_segredo_confere(text)', 'execute')::text;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
insert into r select '6 logado fora da lista vê dias', count(*)::text from public.dias;
insert into r select '7 logado fora da lista é sócio', public.sou_socio()::text;
insert into r select '10 logado fora da lista vê radar', count(*)::text from public.radar;
reset role;
select * from r order by caso;
rollback;
