const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { gerarHash, conferirSenha, gerarToken } = require('../auth');
const { autenticar } = require('../middleware/autenticar');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias
};

function normalizarEmail(email) {
  return (email || '').trim().toLowerCase();
}

// Cria conta nova. Se vier "codigoConvite", entra na família de quem convidou;
// senão, cria uma família nova e vira dono dela.
router.post('/registrar', async (req, res) => {
  try {
    const { nome, email, senha, codigoConvite } = req.body;
    const emailNorm = normalizarEmail(email);

    if (!nome || !emailNorm || !senha || senha.length < 6) {
      return res.status(400).json({ erro: 'Preencha nome, email e uma senha com pelo menos 6 caracteres.' });
    }

    const existente = await db.query('SELECT id FROM usuarios WHERE email=$1', [emailNorm]);
    if (existente.rows.length > 0) {
      return res.status(409).json({ erro: 'Já existe uma conta com esse email.' });
    }

    let familiaId;
    let dono = true;

    if (codigoConvite) {
      const { rows } = await db.query(
        `SELECT * FROM convites_familia WHERE codigo=$1 AND usado=false AND expira_em > now()`,
        [codigoConvite.trim()]
      );
      if (rows.length === 0) {
        return res.status(400).json({ erro: 'Código de convite inválido ou expirado.' });
      }
      familiaId = rows[0].familia_id;
      dono = false;
      await db.query('UPDATE convites_familia SET usado=true WHERE id=$1', [rows[0].id]);
    } else {
      const familia = await db.query('INSERT INTO familias DEFAULT VALUES RETURNING id');
      familiaId = familia.rows[0].id;
    }

    const senhaHash = await gerarHash(senha);
    const novo = await db.query(
      `INSERT INTO usuarios (nome, email, senha_hash, familia_id, dono) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [nome.trim(), emailNorm, senhaHash, familiaId, dono]
    );

    const token = gerarToken(novo.rows[0].id);
    res.cookie('token', token, COOKIE_OPTS);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro no registro:', err);
    res.status(500).json({ erro: 'Erro ao criar conta.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const emailNorm = normalizarEmail(req.body.email);
    const { senha } = req.body;

    const { rows } = await db.query('SELECT * FROM usuarios WHERE email=$1', [emailNorm]);
    if (rows.length === 0 || !rows[0].senha_hash) {
      return res.status(401).json({ erro: 'Email ou senha incorretos.' });
    }

    const confere = await conferirSenha(senha, rows[0].senha_hash);
    if (!confere) {
      return res.status(401).json({ erro: 'Email ou senha incorretos.' });
    }

    const token = gerarToken(rows[0].id);
    res.cookie('token', token, COOKIE_OPTS);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ erro: 'Erro ao entrar.' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', autenticar, (req, res) => {
  res.json({ id: req.usuario.id, nome: req.usuario.nome, email: req.usuario.email, dono: req.usuario.dono });
});

// Dono gera um código de convite pra outra pessoa entrar na mesma família
router.post('/convite', autenticar, async (req, res) => {
  const codigo = crypto.randomBytes(4).toString('hex').toUpperCase(); // ex: A1B2C3D4
  const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await db.query(
    `INSERT INTO convites_familia (familia_id, codigo, expira_em) VALUES ($1,$2,$3)`,
    [req.usuario.familia_id, codigo, expiraEm]
  );

  res.json({ codigo, expiraEm });
});

module.exports = router;
