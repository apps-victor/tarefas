// Configuração do Supabase. Vazio = modo local (tudo em localStorage).
// Preencha com a URL e a chave anon do projeto para sincronizar.
const config = {
  supabaseUrl: 'https://reoknzixfkyftvlwnwuz.supabase.co',
  supabaseAnonKey: 'sb_publishable_riQBoDvYWeRU6fZK08a52g_xwLtIdba',
};

export const supabaseUrl = config.supabaseUrl;
export const supabaseAnonKey = config.supabaseAnonKey;
export default config;
