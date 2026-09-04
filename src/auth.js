const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = '30d';

async function gerarHash(senha) {
  return bcrypt.hash(senha, 10);
}

async function conferirSenha(senha, hash) {
  return bcrypt.compare(senha, hash);
}

function gerarToken(usuarioId) {
  return jwt.sign({ usuarioId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verificarToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = { gerarHash, conferirSenha, gerarToken, verificarToken };
