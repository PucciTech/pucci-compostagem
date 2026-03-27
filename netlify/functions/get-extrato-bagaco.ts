import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || 'https://xpcxuonqffewtsmwlato.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwY3h1b25xZmZld3RzbXdsYXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDkzNDU3MywiZXhwIjoyMDgwNTEwNTczfQ.CV9ccsDAX4ZJzFOG79GhE4aP-6CRTz64_Uwz0nHPCtE';
const supabase = createClient(supabaseUrl, supabaseKey);

export const handler: Handler = async (event) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    // Busca todos os registros do extrato no Supabase
    const { data, error } = await supabase
      .from("extrato_bagaco")
      .select("*")
      .order('id', { ascending: false });

    if (error) throw error;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
          sucesso: true, 
          dados: data || []
      }),
    };

  } catch (error: any) {
    console.error("Erro ao buscar extrato:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ erro: error.message }) };
  }
};