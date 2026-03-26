import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// Inicializa o cliente do Supabase usando as variáveis de ambiente da Netlify
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export const handler: Handler = async (event) => {
  // Configuração de CORS para permitir que o aplicativo mobile acesse a função
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Responde ao preflight request (padrão de requisições web/mobile)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    // Pega os dados enviados pelo aplicativo (sync.ts)
    const body = JSON.parse(event.body || '{}');
    const { extrato, operadorId, operadorNome } = body;

    if (!extrato || !Array.isArray(extrato) || extrato.length === 0) {
      return { 
        statusCode: 200, 
        headers, 
        body: JSON.stringify({ message: 'Nenhum dado para sincronizar' }) 
      };
    }

    // Formata os dados exatamente como a tabela do Supabase espera
    const payload = extrato.map((item: any) => ({
      id: item.id,
      data: item.data,
      hora: item.hora,
      tipo: item.tipo,
      quantidade: Number(item.quantidade),
      motivo: item.motivo,
      operador_id: operadorId || null,
      operador_nome: operadorNome || null
    }));

    // Usa UPSERT para evitar erros caso o app mande o mesmo ID duas vezes
    const { error } = await supabase
      .from('extrato_bagaco')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      throw error;
    }

    console.log(`✅ Extrato de bagaço sincronizado: ${payload.length} registros.`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sucesso: true, inseridos: payload.length })
    };

  } catch (error: any) {
    console.error('❌ Erro no sync-extrato-bagaco:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ sucesso: false, erro: error.message })
    };
  }
};