const db = require('../db');
const { verificarToken } = require('../auth');

async function autenticar(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ erro: 'Não autenticado' });

  const payload = verificarToken(token);
  if (!payload) return res.status(401).json({ erro: 'Sessão inválida ou expirada' });

  const { rows } = await db.query('SELECT * FROM usuarios WHERE id=$1', [payload.usuarioId]);
  if (rows.length === 0) return res.status(401).json({ erro: 'Usuário não encontrado' });

  req.usuario = rows[0];
  next();
}

module.exports = { autenticar };
