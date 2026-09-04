import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mastergrana.app',
  appName: 'MasterGrana',
  webDir: 'dist',
  backgroundColor: '#0B0F0C',
  android: {
    backgroundColor: '#0B0F0C',
  },
  // Em produção, o app native carrega o site direto do Railway (mesmo domínio da API),
  // assim não precisamos empacotar o backend junto nem reconfigurar CORS por versão.
  server: {
    androidScheme: 'https',
    // Troque pela URL real do Railway antes de gerar o build final:
    // url: 'https://mastergrana-production.up.railway.app',
    cleartext: false,
  },
};

export default config;
