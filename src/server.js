require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const db = require('./db');
const { enviarMensagem, extrairMensagemRecebida } = require('./whatsapp');
const { classificarMensagem } = require('./ai/classifier');
const { listarCategorias } = require('./handlers/categorias');
const { processarIntencao } = require('./intencoes');
const { tentarResolverPendencias } = require('./pendencias');
const { iniciarAgendador } = require('./scheduler');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// ---------- API web (autenticada) ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/api'));

// ---------- Verificação do webhook (Meta exige isso na configuração) ----------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ---------- Recebimento de mensagens do WhatsApp ----------
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // responde rápido pra Meta, processa depois

  const msg = extrairMensagemRecebida(req.body);
  if (!msg) return;

  try {
    const { usuario, novo } = await obterOuCriarUsuarioPorTelefone(msg.telefone);

    if (novo) {
      await enviarMensagem(
        msg.telefone,
        '👋 Oi! Antes de começar, como você quer ser chamado(a)? Me manda seu nome ou apelido.'
      );
      return;
    }

    if (!usuario.nome) {
      const nome = msg.texto.trim().slice(0, 50);
      await db.query(`UPDATE usuarios SET nome=$1 WHERE id=$2`, [nome, usuario.id]);
      await enviarMensagem(
        msg.telefone,
        `Prazer, ${nome}! 😊 Agora é só mandar seus gastos, receitas e perguntas por aqui. Ex: "Gastei 50 no mercado".`
      );
      return;
    }

    const pendencia = await tentarResolverPendencias(usuario, msg.texto);
    if (pendencia.resolvido) {
      if (pendencia.texto) await enviarMensagem(msg.telefone, pendencia.texto);
      return;
    }

    const categoriasExistentes = await listarCategorias(usuario.familia_id);
    const dados = await classificarMensagem(msg.texto, categoriasExistentes);
    const resultado = await processarIntencao(usuario, dados, 'whatsapp');

    if (resultado.tipo === 'texto' && resultado.texto) {
      await enviarMensagem(msg.telefone, resultado.texto);
    }
    // tipo 'grafico'/'arquivo' via WhatsApp já são enviados dentro dos próprios handlers (ver intencoes.js)
  } catch (err) {
    console.error('Erro processando mensagem:', err);
    await enviarMensagem(msg.telefone, '⚠️ Deu um erro aqui do meu lado. Pode tentar de novo?');
  }
});

async function obterOuCriarUsuarioPorTelefone(telefone) {
  const { rows } = await db.query('SELECT * FROM usuarios WHERE telefone=$1', [telefone]);
  if (rows.length) return { usuario: rows[0], novo: false };

  const familia = await db.query('INSERT INTO familias DEFAULT VALUES RETURNING id');
  const novoUsuario = await db.query(
    `INSERT INTO usuarios (telefone, nome, familia_id, dono) VALUES ($1,NULL,$2,true) RETURNING *`,
    [telefone, familia.rows[0].id]
  );
  return { usuario: novoUsuario.rows[0], novo: true };
}

// ---------- Frontend (build do React, servido pelo mesmo backend) ----------
const FRONTEND_DIST = path.join(__dirname, '..', 'web', 'dist');
app.use(express.static(FRONTEND_DIST));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) return next();
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) res.status(404).send('Frontend ainda não foi compilado (rode "npm run build" na pasta web).');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  iniciarAgendador();
});
