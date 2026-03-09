import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "https://xpcxuonqffewtsmwlato.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwY3h1b25xZmZld3RzbXdsYXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDkzNDU3MywiZXhwIjoyMDgwNTEwNTczfQ.CV9ccsDAX4ZJzFOG79GhE4aP-6CRTz64_Uwz0nHPCtE" // Mantenha sua chave real
);

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ error: "Método não permitido" }) };

  try {
    // 🎯 TODOS OS NOMES AGORA ESTÃO 100% EXATOS COM SEU BANCO DE DADOS:
    const { data: materiais } = await supabase.from("materiais_registrados").select("*").eq("deletado", false);
    const { data: leiras } = await supabase.from("leiras_formadas").select("*");
    const { data: leiraMtrs } = await supabase.from("leira_mtrs").select("*");
    const { data: monitoramentos } = await supabase.from("monitoramento_leira").select("*");
    const { data: enriquecimentos } = await supabase.from("enriquecimento_leira").select("*");
    const { data: clima } = await supabase.from("clima_leira").select("*");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        sucesso: true,
        dados: {
          materiais: materiais || [],
          leiras: leiras || [],
          leiraMtrs: leiraMtrs || [],
          monitoramentos: monitoramentos || [],
          enriquecimentos: enriquecimentos || [],
          clima: clima || []
        }
      }),
    };
  } catch (error: any) {
    return { statusCode: 500, headers, body: JSON.stringify({ sucesso: false, erro: error.message }) };
  }
};