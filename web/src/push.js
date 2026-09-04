import { api } from './api';

function urlBase64ParaUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = window.atob(base64);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

export async function ativarNotificacoes() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, motivo: 'Este navegador não suporta notificações push.' };
  }

  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') {
    return { ok: false, motivo: 'Você precisa permitir as notificações pra receber os avisos.' };
  }

  const registro = await navigator.serviceWorker.register('/sw.js');
  const { chave } = await api.chavePublicaPush();
  if (!chave) return { ok: false, motivo: 'Servidor ainda não configurou as notificações.' };

  const inscricao = await registro.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ParaUint8Array(chave),
  });

  await api.inscreverPush(inscricao.toJSON());
  return { ok: true };
}

export function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}
