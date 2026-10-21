-- Viralizei: teste de permissões. Rodar depois de toda migração que mexe em
-- política ou grant (execute_sql do Supabase). Tudo dentro de rollback.
-- Esperado: 1 >= 1 (controle), 2-5 false, 6 = 0, 7 false, 8-9 false, 10 = 0,
-- 11-13 false, 14 = 0, 15 >= 1 (controle das trilhas), 16 = "1500 <hoje>",
-- 17-18 false, 19 = 0, 20 >= 1 (controle das ideias), 21-23 false, 24 = 0,
-- 25 >= 1 (controle das métricas), 26-28 false, 29 = 0, 30 >= 1 (controle
-- dos planos), 31 >= 1 (controle de canais e persona), 32-38 false, 39 = 0,
-- 40 >= 1 (controle dos favoritos), 41-43 false, 44 = 0.
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
insert into r select '11 anon pode ler trilhas', has_table_privilege('anon', 'public.trilhas', 'select')::text;
insert into r select '12 logado pode gravar user_id no uso de trilha', has_column_privilege('authenticated', 'public.trilha_usos', 'user_id', 'insert')::text;
insert into r select '13 logado pode forjar a contagem de reels', (has_column_privilege('authenticated', 'public.trilhas', 'reels_numero', 'update') or has_column_privilege('authenticated', 'public.trilhas', 'criado_por', 'update'))::text;
insert into public.ideias (texto) values ('Ideia de controle do teste');
insert into r select '17 anon pode ler ideias', has_table_privilege('anon', 'public.ideias', 'select')::text;
insert into r select '18 logado pode forjar autor da ideia', (has_column_privilege('authenticated', 'public.ideias', 'criado_por', 'insert') or has_column_privilege('authenticated', 'public.ideias', 'criado_por', 'update'))::text;
insert into r select '20 controle: dono do banco vê ideias', count(*)::text from public.ideias;
insert into r select '21 anon pode ler métricas ou recomendações', (has_table_privilege('anon', 'public.metricas_publicacoes', 'select') or has_table_privilege('anon', 'public.metricas_publico', 'select') or has_table_privilege('anon', 'public.recomendacoes', 'select'))::text;
insert into r select '22 logado pode escrever nas métricas', (has_table_privilege('authenticated', 'public.metricas_publicacoes', 'insert') or has_table_privilege('authenticated', 'public.metricas_publicacoes', 'update') or has_table_privilege('authenticated', 'public.metricas_conta', 'insert') or has_table_privilege('authenticated', 'public.metricas_publico', 'insert') or has_table_privilege('authenticated', 'public.metricas_horarios', 'insert'))::text;
insert into r select '23 logado pode escrever recomendações', (has_table_privilege('authenticated', 'public.recomendacoes', 'insert') or has_table_privilege('authenticated', 'public.recomendacoes', 'update') or has_table_privilege('authenticated', 'public.recomendacoes', 'delete'))::text;
insert into r select '25 controle: dono do banco vê métricas', count(*)::text from public.metricas_publicacoes;
insert into public.planos (titulo, temas, formatos, celulas) values ('Plano de controle', '["a","b","c"]', '["lista","erro","caso"]', '[]');
insert into r select '26 anon pode ler planos', has_table_privilege('anon', 'public.planos', 'select')::text;
insert into r select '27 logado pode forjar autor do plano', (has_column_privilege('authenticated', 'public.planos', 'criado_por', 'insert') or has_column_privilege('authenticated', 'public.planos', 'criado_por', 'update'))::text;
insert into r select '28 logado pode escrever classificação das métricas', (has_column_privilege('authenticated', 'public.metricas_publicacoes', 'formato', 'update') or has_column_privilege('authenticated', 'public.metricas_publicacoes', 'tipo_gancho', 'update'))::text;
insert into r select '30 controle: dono do banco vê planos', count(*)::text from public.planos;
insert into public.canais (rede, handle, nome) values ('youtube', 'teste_permissoes', 'Teste');
insert into public.roteiros (titulo) values ('Roteiro de controle do teste');
insert into r select '31 controle: dono do banco vê canais, persona e roteiros', ((select count(*) from public.canais) + (select count(*) from public.persona) + (select count(*) from public.roteiros))::text;
insert into r select '32 anon pode ler persona, canais, vídeos, roteiros ou versões', (has_table_privilege('anon', 'public.persona', 'select') or has_table_privilege('anon', 'public.canais', 'select') or has_table_privilege('anon', 'public.canal_videos', 'select') or has_table_privilege('anon', 'public.roteiros', 'select') or has_table_privilege('anon', 'public.roteiro_versoes', 'select'))::text;
insert into r select '33 logado pode escrever vídeos de canal', (has_table_privilege('authenticated', 'public.canal_videos', 'insert') or has_table_privilege('authenticated', 'public.canal_videos', 'update') or has_table_privilege('authenticated', 'public.canal_videos', 'delete'))::text;
insert into r select '34 logado pode rodar carregar_canal ou carregar_coleta', (has_function_privilege('authenticated', 'public.carregar_canal(jsonb)', 'execute') or has_function_privilege('authenticated', 'public.carregar_coleta(jsonb)', 'execute') or has_function_privilege('anon', 'public.carregar_coleta(jsonb)', 'execute'))::text;
insert into r select '35 logado pode forjar números do canal', (has_column_privilege('authenticated', 'public.canais', 'mediana_views', 'update') or has_column_privilege('authenticated', 'public.canais', 'seguidores', 'update') or has_column_privilege('authenticated', 'public.canais', 'criado_por', 'insert'))::text;
insert into r select '36 logado pode forjar autor da persona ou criar outra', (has_column_privilege('authenticated', 'public.persona', 'atualizado_por', 'update') or has_table_privilege('authenticated', 'public.persona', 'insert') or has_table_privilege('authenticated', 'public.persona', 'delete'))::text;
insert into r select '37 logado pode forjar autor do roteiro ou da versão', (has_column_privilege('authenticated', 'public.roteiros', 'criado_por', 'insert') or has_column_privilege('authenticated', 'public.roteiro_versoes', 'criado_por', 'insert'))::text;
insert into r select '38 logado pode escolher o número ou mudar versão', (has_column_privilege('authenticated', 'public.roteiro_versoes', 'numero', 'insert') or has_table_privilege('authenticated', 'public.roteiro_versoes', 'update'))::text;
insert into public.ganchos_favoritos (video_id) select id from public.canal_videos limit 1;
insert into r select '40 controle: dono do banco vê favoritos', count(*)::text from public.ganchos_favoritos;
insert into r select '41 anon pode ler favoritos ou recalcular notas', (has_table_privilege('anon', 'public.ganchos_favoritos', 'select') or has_function_privilege('anon', 'public.recalcular_outliers_servico(uuid)', 'execute') or has_function_privilege('authenticated', 'public.recalcular_outliers_servico(uuid)', 'execute'))::text;
insert into r select '42 logado pode forjar autor do favorito ou editar favorito', (has_column_privilege('authenticated', 'public.ganchos_favoritos', 'criado_por', 'insert') or has_column_privilege('authenticated', 'public.ganchos_favoritos', 'criado_em', 'insert') or has_table_privilege('authenticated', 'public.ganchos_favoritos', 'update'))::text;
insert into r select '43 logado pode escrever análise, capa ou coleta dos vídeos', (has_any_column_privilege('authenticated', 'public.canal_videos', 'insert') or has_any_column_privilege('authenticated', 'public.canal_videos', 'update'))::text;
insert into r select '15 controle: dono do banco vê trilhas', count(*)::text from public.trilhas;
insert into public.trilhas (id, titulo, reels_texto) values ('tteste', 'Teste', '1,5k');
insert into r select '16 gatilho: 1,5k vira 1500 com data', reels_numero::text || ' ' || coalesce(conferido_em::text, 'sem data') from public.trilhas where id = 'tteste';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
insert into r select '6 logado fora da lista vê dias', count(*)::text from public.dias;
insert into r select '7 logado fora da lista é sócio', public.sou_socio()::text;
insert into r select '10 logado fora da lista vê radar', count(*)::text from public.radar;
insert into r select '14 logado fora da lista vê trilhas', count(*)::text from public.trilhas;
insert into r select '19 logado fora da lista vê ideias', count(*)::text from public.ideias;
insert into r select '24 logado fora da lista vê métricas ou recomendações', ((select count(*) from public.metricas_publicacoes) + (select count(*) from public.metricas_publico) + (select count(*) from public.recomendacoes))::text;
insert into r select '29 logado fora da lista vê planos', count(*)::text from public.planos;
insert into r select '44 logado fora da lista vê favoritos', count(*)::text from public.ganchos_favoritos;
insert into r select '39 logado fora da lista vê persona, canais, vídeos ou roteiros', ((select count(*) from public.persona) + (select count(*) from public.canais) + (select count(*) from public.canal_videos) + (select count(*) from public.roteiros) + (select count(*) from public.roteiro_versoes))::text;
reset role;
select * from r order by caso;
rollback;

-- Controle positivo das trilhas, com um sócio real (o primeiro da lista).
-- Esperado: true, 45 ou mais, 1, 12000, "lapidada true", métricas 1 ou mais,
-- "plano true 1", "persona true", "canal true", "versões 1 2 true",
-- "favorito true", "sobrou 0".
begin;
create temp table r (caso text, resultado text) on commit drop;
grant all on r to authenticated;
select set_config('request.jwt.claims', (select json_build_object('sub', u.id::text, 'role', 'authenticated', 'email', u.email)::text from auth.users u join public.socios s on lower(s.email)=lower(u.email) limit 1), true);
set local role authenticated;
insert into r select 'socio é sócio', public.sou_socio()::text;
insert into r select 'socio vê trilhas', count(*)::text from public.trilhas;
insert into public.trilha_usos (trilha_id) values ((select id from public.trilhas limit 1));
insert into r select 'socio registrou uso', count(*)::text from public.trilha_usos where user_id = auth.uid();
insert into public.trilhas (titulo, artista, clima, reels_texto) values ('Teste sócio', 'X', 'leve', '12K');
insert into r select 'socio criou trilha (12K vira 12000)', reels_numero::text from public.trilhas where titulo = 'Teste sócio';
insert into public.ideias (texto) values ('Ideia do sócio no teste');
update public.ideias set status = 'lapidada', lapidacao = '{"resumo":"x"}' where texto = 'Ideia do sócio no teste';
insert into r select 'socio vê métricas', count(*)::text from public.metricas_publicacoes;
insert into r select 'socio lapidou ideia (autor é ele)', status || ' ' || (criado_por = auth.uid())::text from public.ideias where texto = 'Ideia do sócio no teste';
insert into public.planos (titulo, temas, formatos, celulas) values ('Plano do sócio no teste', '["a","b","c"]', '["lista","erro","caso"]', '[]');
update public.planos set decimo = '{"titulo":"x"}' where titulo = 'Plano do sócio no teste';
insert into r select 'socio criou plano (autor é ele, 10º salvo)', 'plano ' || (criado_por = auth.uid())::text || ' ' || (decimo is not null)::int::text from public.planos where titulo = 'Plano do sócio no teste';
update public.persona set tom = 'tom de teste' where id;
insert into r select 'socio editou persona (autor é ele)', 'persona ' || (atualizado_por = auth.uid())::text from public.persona where tom = 'tom de teste';
insert into public.canais (rede, handle, nome) values ('tiktok', '@Teste.Socio', 'Teste');
insert into r select 'socio adicionou canal (@ normalizado, autor é ele)', 'canal ' || (criado_por = auth.uid())::text from public.canais where rede = 'tiktok' and handle = 'teste.socio';
insert into public.roteiros (titulo) values ('Roteiro do sócio no teste');
insert into public.roteiro_versoes (roteiro_id, origem, conteudo) select id, 'ia', '{}' from public.roteiros where titulo = 'Roteiro do sócio no teste';
insert into public.roteiro_versoes (roteiro_id, origem, conteudo) select id, 'duracao', '{}' from public.roteiros where titulo = 'Roteiro do sócio no teste';
insert into r select 'socio salvou versões (numeradas, autor é ele)', 'versões ' || string_agg(numero::text, ' ' order by numero) || ' ' || bool_and(v.criado_por = auth.uid())::text from public.roteiro_versoes v join public.roteiros t on t.id = v.roteiro_id where t.titulo = 'Roteiro do sócio no teste';
insert into public.ganchos_favoritos (video_id) select id from public.canal_videos where id not in (select video_id from public.ganchos_favoritos) order by outlier desc nulls last limit 1;
insert into r select 'socio favoritou (autor é ele)', 'favorito ' || bool_and(criado_por = auth.uid())::text from public.ganchos_favoritos where criado_em = now();
delete from public.ganchos_favoritos where criado_em = now();
insert into r select 'socio desfez o favorito', 'sobrou ' || count(*)::text from public.ganchos_favoritos where criado_em = now();
reset role;
select * from r;
rollback;
