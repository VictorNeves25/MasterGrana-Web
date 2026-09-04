-- Rode isso se você JÁ tinha o banco criado antes (ex: Supabase configurado na conversa anterior).
-- Se for banco novo, não precisa rodar isso — só o schema.sql já tem tudo.

ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS numero INTEGER;

-- Preenche numero pras transações que já existem, em ordem de criação, por família
WITH numeradas AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY familia_id ORDER BY criado_em) AS rn
  FROM transacoes
)
UPDATE transacoes t
SET numero = n.rn
FROM numeradas n
WHERE t.id = n.id AND t.numero IS NULL;

ALTER TABLE transacoes ALTER COLUMN numero SET NOT NULL;
ALTER TABLE transacoes ADD CONSTRAINT transacoes_familia_numero_unique UNIQUE (familia_id, numero);

-- Atualiza a view pra incluir o número do lançamento
CREATE OR REPLACE VIEW vw_transacoes_completas AS
SELECT
  t.id, t.numero, t.familia_id, f.nome AS familia_nome,
  t.usuario_id, u.nome AS usuario_nome, u.telefone,
  t.tipo, t.valor, t.categoria, t.descricao, t.data,
  date_trunc('month', t.data) AS mes_referencia
FROM transacoes t
JOIN usuarios u ON u.id = t.usuario_id
JOIN familias f ON f.id = t.familia_id;
