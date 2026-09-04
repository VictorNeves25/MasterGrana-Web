const webpush = require('web-push');
const db = require('./db');

async function enviarPush(usuarioId, { titulo, corpo }) {
  const { rows } = await db.query('SELECT * FROM push_subscriptions WHERE usuario_id=$1', [usuarioId]);
  if (rows.length === 0) return;

  const payload = JSON.stringify({ titulo, corpo });

  for (const sub of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // inscrição expirada/inválida — remove pra não tentar de novo
        await db.query('DELETE FROM push_subscriptions WHERE id=$1', [sub.id]);
      } else {
        console.error('Erro ao enviar push:', err.message);
      }
    }
  }
}

// Notifica o usuário pelo canal certo: WhatsApp se tiver telefone, push se for usuário web
async function notificar(usuario, texto, tituloPush = 'MasterGrana') {
  if (usuario.telefone) {
    const { enviarMensagem } = require('./whatsapp');
    await enviarMensagem(usuario.telefone, texto);
  } else {
    await enviarPush(usuario.id, { titulo: tituloPush, corpo: texto.replace(/[*_~`]/g, '').slice(0, 150) });
  }
}

// Igual notificar(), mas pra mensagens com opções/botões. No WhatsApp usa os botões
// nativos; no app/web só avisa por push — quem responde de fato é o cartão de
// pendência dentro do app (ver /api/pendencias).
async function notificarComOpcoes(usuario, texto, botoes, tituloPush = 'MasterGrana') {
  if (usuario.telefone) {
    const { enviarBotoes } = require('./whatsapp');
    await enviarBotoes(usuario.telefone, texto, botoes);
  } else {
    await enviarPush(usuario.id, { titulo: tituloPush, corpo: texto.replace(/[*_~`]/g, '').slice(0, 150) });
  }
}

module.exports = { enviarPush, notificar, notificarComOpcoes };
