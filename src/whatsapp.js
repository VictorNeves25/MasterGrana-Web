const axios = require('axios');
const FormData = require('form-data');

const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GRAPH_URL = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;
const MEDIA_URL = `https://graph.facebook.com/v20.0/${PHONE_ID}/media`;

function headers() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function enviarMensagem(telefoneDestino, texto) {
  try {
    await axios.post(
      GRAPH_URL,
      { messaging_product: 'whatsapp', to: telefoneDestino, type: 'text', text: { body: texto } },
      { headers: headers() }
    );
  } catch (err) {
    console.error('Erro ao enviar mensagem WhatsApp:', err.response?.data || err.message);
  }
}

// Envia um arquivo (ex: planilha .xlsx) como documento. Faz upload direto pra Meta
// (não precisa de URL pública) e depois manda a mensagem referenciando o arquivo.
async function enviarDocumento(telefoneDestino, buffer, nomeArquivo, legenda) {
  try {
    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const form = new FormData();
    form.append('file', buffer, { filename: nomeArquivo, contentType: mimeType });
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);

    const upload = await axios.post(MEDIA_URL, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    });
    const mediaId = upload.data.id;

    await axios.post(
      GRAPH_URL,
      {
        messaging_product: 'whatsapp',
        to: telefoneDestino,
        type: 'document',
        document: { id: mediaId, filename: nomeArquivo, caption: legenda },
      },
      { headers: headers() }
    );
  } catch (err) {
    console.error('Erro ao enviar documento WhatsApp:', err.response?.data || err.message);
    await enviarMensagem(telefoneDestino, `Não consegui enviar o arquivo agora. ${legenda}`);
  }
}

// Envia uma imagem por URL pública (ex: gráfico gerado pelo QuickChart)
async function enviarImagemPorLink(telefoneDestino, url, legenda) {
  try {
    await axios.post(
      GRAPH_URL,
      { messaging_product: 'whatsapp', to: telefoneDestino, type: 'image', image: { link: url, caption: legenda } },
      { headers: headers() }
    );
  } catch (err) {
    console.error('Erro ao enviar imagem WhatsApp:', err.response?.data || err.message);
    await enviarMensagem(telefoneDestino, `Não consegui gerar a imagem do gráfico agora. ${legenda}`);
  }
}

// Envia mensagem com botões clicáveis (máx. 3 botões, título de cada um até 20 caracteres —
// a API da Meta rejeita a mensagem se passar disso).
// botoes: [{ id: 'confirmar', titulo: 'Sim' }, ...]
async function enviarBotoes(telefoneDestino, corpoTexto, botoes) {
  try {
    await axios.post(
      GRAPH_URL,
      {
        messaging_product: 'whatsapp',
        to: telefoneDestino,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: corpoTexto },
          action: {
            buttons: botoes.slice(0, 3).map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: b.titulo.slice(0, 20) },
            })),
          },
        },
      },
      { headers: headers() }
    );
  } catch (err) {
    console.error('Erro ao enviar botões WhatsApp:', err.response?.data || err.message);
    // se der erro (ex: mais de 24h desde a última mensagem do usuário), cai pra texto simples como reserva
    await enviarMensagem(telefoneDestino, corpoTexto);
  }
}

// Extrai o texto e o telefone de origem do payload do webhook da Meta.
// Cobre tanto mensagem de texto normal quanto clique em botão (interactive.button_reply).
function extrairMensagemRecebida(body) {
  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];
    if (!msg) return null;

    const nomePerfil = value.contacts?.[0]?.profile?.name || null;

    if (msg.type === 'text') {
      return { telefone: msg.from, texto: msg.text.body, nomePerfil };
    }

    if (msg.type === 'interactive' && msg.interactive?.type === 'button_reply') {
      return { telefone: msg.from, texto: msg.interactive.button_reply.title, nomePerfil };
    }

    return null;
  } catch {
    return null;
  }
}

module.exports = { enviarMensagem, enviarBotoes, enviarImagemPorLink, enviarDocumento, extrairMensagemRecebida };
