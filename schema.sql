-- ============================================================
-- Schema: Controle Financeiro via WhatsApp
-- ============================================================

CREATE TABLE familias (
  id            SERIAL PRIMARY KEY,
  nome          TEXT NOT NULL DEFAULT 'Minha Família',
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usuarios (
  id            SERIAL PRIMARY KEY,
  telefone      TEXT UNIQUE,                -- opcional agora: só usado por quem usa via WhatsApp
  email         TEXT UNIQUE,                -- opcional: só usado por quem usa via site/app
  senha_hash    TEXT,                       -- só preenchido pra login via site/app
  nome          TEXT,
  familia_id    INTEGER NOT NULL REFERENCES familias(id),
  dono          BOOLEAN NOT NULL DEFAULT false, -- dono = quem pode aprovar vínculos
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (telefone IS NOT NULL OR email IS NOT NULL)
);

-- Categorias: existe um conjunto padrão (familia_id NULL, visível pra todo mundo)
-- e cada família pode ir criando as próprias categorias extras a qualquer momento.
CREATE TABLE categorias (
  id            SERIAL PRIMARY KEY,
  familia_id    INTEGER REFERENCES familias(id), -- NULL = categoria padrão global
  nome          TEXT NOT NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_categorias_familia_nome ON categorias (COALESCE(familia_id, 0), lower(nome));

INSERT INTO categorias (familia_id, nome) VALUES
  (NULL, 'Mercado'), (NULL, 'Viagem'), (NULL, 'Farmácia'), (NULL, 'Cuidado Pessoal'),
  (NULL, 'Casa'), (NULL, 'Pet'), (NULL, 'Combustível'), (NULL, 'Compras na Net'),
  (NULL, 'Comida'), (NULL, 'Roupa/Sapato'), (NULL, 'Lazer'), (NULL, 'Acessórios'),
  (NULL, 'Presente'), (NULL, 'Saúde'), (NULL, 'Salário'), (NULL, 'Estudo'),
  (NULL, 'Contas Fixas'), (NULL, 'Doação'), (NULL, 'Carro'), (NULL, 'Moto'),
  (NULL, 'Investimento'), (NULL, 'Rendimentos extras'), (NULL, 'Impostos');

CREATE TABLE transacoes (
  id              SERIAL PRIMARY KEY,
  familia_id      INTEGER NOT NULL REFERENCES familias(id),
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  numero          INTEGER NOT NULL, -- identificador sequencial visível ao usuário, por família (00001, 00002...)
  tipo            TEXT NOT NULL CHECK (tipo IN ('receita','despesa')),
  valor           NUMERIC(12,2) NOT NULL,
  categoria       TEXT NOT NULL,
  forma_pagamento TEXT NOT NULL DEFAULT 'Não informado', -- Dinheiro, Débito, Crédito, Pix, Boleto, Transferência...
  quem_gastou     TEXT, -- nome/apelido de quem gastou, ou "Casal" se foi conjunto
  descricao       TEXT,
  data            DATE NOT NULL DEFAULT CURRENT_DATE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(familia_id, numero)
);

CREATE INDEX idx_transacoes_familia_data ON transacoes(familia_id, data);

CREATE TABLE metas (
  id            SERIAL PRIMARY KEY,
  familia_id    INTEGER NOT NULL REFERENCES familias(id),
  categoria     TEXT NOT NULL,
  percentual    NUMERIC(5,2) NOT NULL, -- ex: 30.00 = 30%
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(familia_id, categoria)
);

-- Compras parceladas: lança a 1ª parcela na hora da compra, e as seguintes
-- automaticamente (com confirmação) nos meses seguintes.
CREATE TABLE parcelamentos (
  id                    SERIAL PRIMARY KEY,
  familia_id            INTEGER NOT NULL REFERENCES familias(id),
  usuario_id            INTEGER NOT NULL REFERENCES usuarios(id),
  descricao             TEXT NOT NULL,
  categoria             TEXT NOT NULL,
  forma_pagamento       TEXT NOT NULL DEFAULT 'Crédito',
  valor_parcela         NUMERIC(12,2) NOT NULL,
  numero_parcelas       INTEGER NOT NULL,
  parcelas_lancadas     INTEGER NOT NULL DEFAULT 0,
  dia_vencimento        INTEGER NOT NULL, -- dia do mês (1-31)
  ultimo_mes_processado DATE,             -- evita lançar 2x no mesmo mês
  ativo                 BOOLEAN NOT NULL DEFAULT true,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lembretes recorrentes mensais. "modo" define o que acontece no dia:
-- avisar = só manda mensagem; lancar_automatico = já lança a despesa;
-- perguntar = avisa e, se não responder em 30min, lança sozinho.
CREATE TABLE lembretes (
  id                    SERIAL PRIMARY KEY,
  familia_id            INTEGER NOT NULL REFERENCES familias(id),
  usuario_id            INTEGER NOT NULL REFERENCES usuarios(id),
  descricao             TEXT NOT NULL,
  categoria             TEXT,
  forma_pagamento       TEXT DEFAULT 'Não informado',
  valor                 NUMERIC(12,2),
  dia_do_mes            INTEGER NOT NULL,
  modo                  TEXT NOT NULL CHECK (modo IN ('avisar','lancar_automatico','perguntar')),
  ultimo_mes_processado DATE,
  ativo                 BOOLEAN NOT NULL DEFAULT true,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lembretes pontuais (só uma vez): "me lembra de fazer um pix pro Antonio daqui 3 horas".
-- status: aguardando_modo (esperando o usuário escolher o que fazer no disparo),
--         agendado (já sabe o modo, esperando a hora), aguardando_confirmacao
--         (disparou e perguntou "já fez?", esperando resposta), concluido, cancelado.
CREATE TABLE lembretes_pontuais (
  id              SERIAL PRIMARY KEY,
  familia_id      INTEGER NOT NULL REFERENCES familias(id),
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  descricao       TEXT NOT NULL,
  categoria       TEXT,
  forma_pagamento TEXT DEFAULT 'Não informado',
  valor           NUMERIC(12,2),
  dispara_em      TIMESTAMPTZ NOT NULL,
  modo            TEXT CHECK (modo IN ('avisar','lancar_automatico','perguntar')),
  status          TEXT NOT NULL DEFAULT 'aguardando_modo'
                    CHECK (status IN ('aguardando_modo','agendado','aguardando_confirmacao','concluido','cancelado')),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lembretes_pontuais_status ON lembretes_pontuais(status, dispara_em);

-- Fila de itens aguardando confirmação do usuário (parcela ou lembrete no modo "perguntar")
CREATE TABLE confirmacoes_pendentes (
  id            SERIAL PRIMARY KEY,
  tipo          TEXT NOT NULL CHECK (tipo IN ('parcela','lembrete')),
  referencia_id INTEGER NOT NULL, -- id do parcelamento ou lembrete de origem
  familia_id    INTEGER NOT NULL REFERENCES familias(id),
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
  descricao     TEXT NOT NULL,
  categoria     TEXT NOT NULL,
  forma_pagamento TEXT NOT NULL DEFAULT 'Não informado',
  valor         NUMERIC(12,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','confirmado','auto_confirmado','cancelado','quitado')),
  expira_em     TIMESTAMPTZ NOT NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_confirmacoes_usuario_status ON confirmacoes_pendentes(usuario_id, status);

-- Contas fixas recorrentes (água, luz, internet...), com o último valor pago
-- guardado pra sugerir no lembrete do mês seguinte.
CREATE TABLE contas_fixas (
  id                    SERIAL PRIMARY KEY,
  familia_id            INTEGER NOT NULL REFERENCES familias(id),
  usuario_id            INTEGER NOT NULL REFERENCES usuarios(id), -- quem cadastrou
  descricao             TEXT NOT NULL,
  categoria             TEXT NOT NULL DEFAULT 'Contas Fixas',
  forma_pagamento       TEXT DEFAULT 'Não informado',
  ultimo_valor          NUMERIC(12,2), -- sugestão pro próximo lembrete; NULL na primeira vez
  ativa                 BOOLEAN NOT NULL DEFAULT true,
  ultimo_mes_processado DATE,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fila de contas fixas aguardando o usuário resolver (botões ou novo valor)
CREATE TABLE contas_fixas_pendentes (
  id              SERIAL PRIMARY KEY,
  conta_fixa_id   INTEGER NOT NULL REFERENCES contas_fixas(id),
  familia_id      INTEGER NOT NULL REFERENCES familias(id),
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id), -- quem está resolvendo agora
  descricao       TEXT NOT NULL,
  categoria       TEXT NOT NULL,
  forma_pagamento TEXT NOT NULL DEFAULT 'Não informado',
  valor_sugerido  NUMERIC(12,2),
  status          TEXT NOT NULL DEFAULT 'aguardando_resposta'
                    CHECK (status IN ('aguardando_resposta','aguardando_novo_valor','concluido')),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contas_fixas_pendentes_usuario ON contas_fixas_pendentes(usuario_id, status);

-- Guarda, por família e por mês, qual dia foi combinado como "5º dia útil"
-- (perguntado todo dia 1º, pra já considerar feriados locais sem precisar de calendário).
CREATE TABLE config_contas_fixas (
  id             SERIAL PRIMARY KEY,
  familia_id     INTEGER NOT NULL REFERENCES familias(id),
  mes_referencia DATE NOT NULL, -- primeiro dia do mês em questão
  dia_lembrete   INTEGER,       -- NULL até o usuário responder
  status         TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','confirmado')),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(familia_id, mes_referencia)
);

CREATE TABLE solicitacoes_vinculo (
  id                  SERIAL PRIMARY KEY,
  familia_id          INTEGER NOT NULL REFERENCES familias(id),
  telefone_solicitante TEXT NOT NULL,   -- quem está pedindo pra entrar
  telefone_aprovador   TEXT NOT NULL,   -- dono da conta que recebe o código
  codigo              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','expirado','negado')),
  expira_em           TIMESTAMPTZ NOT NULL,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_solicitacoes_aprovador ON solicitacoes_vinculo(telefone_aprovador, status);

-- Inscrições de notificação push do navegador (uma por dispositivo/navegador)
CREATE TABLE push_subscriptions (
  id            SERIAL PRIMARY KEY,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_usuario ON push_subscriptions(usuario_id);

-- Convites pra vincular uma segunda pessoa à mesma família, pelo app web
-- (equivalente ao "vincular numero" do WhatsApp, mas com código gerado na tela)
CREATE TABLE convites_familia (
  id            SERIAL PRIMARY KEY,
  familia_id    INTEGER NOT NULL REFERENCES familias(id),
  codigo        TEXT NOT NULL UNIQUE,
  usado         BOOLEAN NOT NULL DEFAULT false,
  expira_em     TIMESTAMPTZ NOT NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
