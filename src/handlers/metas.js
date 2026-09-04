const db = require('../db');
const { garantirCategoria } = require('./categorias');

async function definirMetas(usuario, dados) {
  const { metas } = dados;
  const somaPercentuais = metas.reduce((s, m) => s + Number(m.percentual), 0);
  const metasSalvas = [];

  for (const m of metas) {
    const { nome: categoria } = await garantirCategoria(usuario.familia_id, m.categoria);
    await db.query(
      `INSERT INTO metas (familia_id, categoria, percentual)
       VALUES ($1, $2, $3)
       ON CONFLICT (familia_id, categoria) DO UPDATE SET percentual = EXCLUDED.percentual`,
      [usuario.familia_id, categoria, m.percentual]
    );
    metasSalvas.push({ categoria, percentual: m.percentual });
  }

  const linhas = metasSalvas.map((m) => `• ${m.categoria}: ${m.percentual}%`).join('\n');
  let msg = `🎯 Metas atualizadas:\n${linhas}`;

  if (somaPercentuais > 100) {
    msg += `\n\n⚠️ Atenção: a soma de todas as suas metas passa de 100% (${somaPercentuais}%). Vale revisar.`;
  }

  return msg;
}

module.exports = { definirMetas };
