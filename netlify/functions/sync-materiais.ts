import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "https://xpcxuonqffewtsmwlato.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwY3h1b25xZmZld3RzbXdsYXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDkzNDU3MywiZXhwIjoyMDgwNTEwNTczfQ.CV9ccsDAX4ZJzFOG79GhE4aP-6CRTz64_Uwz0nHPCtE"
);

interface Material {
  id: string;
  data: string;
  tipoMaterial: string;
  numeroMTR: string;
  peso: number;
  origem: string;
  destino?: string;
  deletado?: boolean;
  usado?: boolean; 
}

const USUARIO_ID = '116609f9-53c2-4289-9a63-0174fad8148e'; 

export const handler: Handler = async (event) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body || "{}");
    const materiais: Material[] = body.materiais || [];

    // ===== ESPIÃO DE DEBUG =====
    if (materiais.length > 0) {
        console.log(`🕵️ DEBUG - Processando ${materiais.length} itens.`);
        console.log("Primeiro item deletado?", materiais[0].deletado);
    }
    // ===========================

    const agora = new Date().toISOString();
    let sincronizados = 0;
    let deletados = 0;

    for (const material of materiais) {
        
        // 🚨 CENÁRIO 1: EXCLUSÃO
        if (material.deletado === true) {
            const { error } = await supabase
                .from("materiais_registrados")
                .delete()
                .eq('id', material.id); 
            
            if (!error) deletados++;
            continue; 
        }

        // 💾 CENÁRIO 2: CRIAÇÃO OU EDIÇÃO (UPSERT)
        // 🔥 Atualizado para o novo padrão
        const destinoFinal = material.destino || 'Pátio Normal';

        const { error } = await supabase
          .from("materiais_registrados")
          .upsert({
            id: material.id,
            usuario_id: USUARIO_ID,
            data: material.data,
            tipomaterial: material.tipoMaterial,
            numeromtr: material.numeroMTR || null,
            peso: material.peso,
            origem: material.origem,
            destino: destinoFinal,
            usado: material.usado || false, 
            
            // Campos de controle
            sincronizado: true,
            sincronizado_em: agora,
            atualizado_em: agora,
          }, { onConflict: 'id' }); 

        if (!error) sincronizados++;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
          sucesso: true, 
          sincronizados, 
          deletados,
          mensagem: `Processado: ${sincronizados} salvos, ${deletados} excluídos.`
      }),
    };

  } catch (error: any) {
    console.error("Erro Geral:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ erro: error.message }) };
  }
};