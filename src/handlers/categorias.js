const db = require('../db');

// Lista as categorias visíveis pra uma família: as padrão (globais) + as próprias dela
async function listarCategorias(familiaId) {
  const { rows } = await db.query(
    `SELECT nome FROM categorias WHERE familia_id IS NULL OR familia_id = $1 ORDER BY nome`,
    [familiaId]
  );
  return rows.map((r) => r.nome);
}

// Verifica se a categoria já existe (padrão ou da família); se não existir, cria pra essa família.
// Retorna { nome, criada } com o nome "oficial" (mesma grafia já cadastrada, se já existir).
async function garantirCategoria(familiaId, nomeSugerido) {
  const nome = (nomeSugerido || '').trim();
  if (!nome) return { nome: 'Outros', criada: false };

  const { rows } = await db.query(
    `SELECT nome FROM categorias WHERE (familia_id IS NULL OR familia_id = $1) AND lower(nome) = lower($2)`,
    [familiaId, nome]
  );
  if (rows.length) return { nome: rows[0].nome, criada: false };

  await db.query(`INSERT INTO categorias (familia_id, nome) VALUES ($1, $2)`, [familiaId, nome]);
  return { nome, criada: true };
}

async function criarCategoria(usuario, dados) {
  const { nome } = dados;
  const resultado = await garantirCategoria(usuario.familia_id, nome);

  if (!resultado.criada) {
    return `A categoria *${resultado.nome}* já existe, pode usar ela normalmente. 👍`;
  }
  return `✅ Categoria *${resultado.nome}* criada! Já pode usar ela em gastos, receitas e metas.`;
}

module.exports = { listarCategorias, garantirCategoria, criarCategoria };
