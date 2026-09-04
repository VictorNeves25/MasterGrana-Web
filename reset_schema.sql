-- Apaga tudo, na ordem certa, antes de rodar o schema.sql do zero.
-- Seguro de rodar mesmo num banco novo, sem tabela nenhuma (usa IF EXISTS).

DROP TABLE IF EXISTS convites_familia CASCADE;
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS solicitacoes_vinculo CASCADE;
DROP TABLE IF EXISTS config_contas_fixas CASCADE;
DROP TABLE IF EXISTS contas_fixas_pendentes CASCADE;
DROP TABLE IF EXISTS contas_fixas CASCADE;
DROP TABLE IF EXISTS confirmacoes_pendentes CASCADE;
DROP TABLE IF EXISTS lembretes_pontuais CASCADE;
DROP TABLE IF EXISTS lembretes CASCADE;
DROP TABLE IF EXISTS parcelamentos CASCADE;
DROP TABLE IF EXISTS metas CASCADE;
DROP TABLE IF EXISTS transacoes CASCADE;
DROP TABLE IF EXISTS categorias CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS familias CASCADE;
