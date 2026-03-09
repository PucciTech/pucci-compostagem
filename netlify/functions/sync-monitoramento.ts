import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "https://xpcxuonqffewtsmwlato.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwY3h1b25xZmZld3RzbXdsYXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDkzNDU3MywiZXhwIjoyMDgwNTEwNTczfQ.CV9ccsDAX4ZJzFOG79GhE4aP-6CRTz64_Uwz0nHPCtE"
);

interface PontoTemperatura {
  ponto: string;
  temperatura: number | string; 
}

interface MonitoramentoLeira {
  id: string;
  leiraId: string;
  data: string;
  hora?: string;
  temperaturas: PontoTemperatura[];
  revolveu: boolean;
  observacoes?: string;
  statusNovo?: string;
  localDeposito?: string;
  volumeOriginal?: number;
  volumeFinal?: number;
  diasDesdeFormacao?: number;
  timestamp: number;
}

const USUARIO_ID = '116609f9-53c2-4289-9a63-0174fad8148e';

function safeParseFloat(valor: any): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string') {
    const valorLimpo = valor.replace(',', '.').trim();
    const numero = parseFloat(valorLimpo);
    return isNaN(numero) ? null : numero;
  }
  return null;
}

function extrairTemperaturas(temperaturas: PontoTemperatura[]) {
  let topo = null;
  let meio = null;
  let fundo = null;

  if (temperaturas && temperaturas.length > 0) {
    for (const pontoTemp of temperaturas) {
      if (pontoTemp.ponto === 'topo') topo = safeParseFloat(pontoTemp.temperatura);
      if (pontoTemp.ponto === 'meio') meio = safeParseFloat(pontoTemp.temperatura);
      if (pontoTemp.ponto === 'fundo') fundo = safeParseFloat(pontoTemp.temperatura);
    }
  }

  console.log(`🌡️ Temperaturas processadas - Topo: ${topo}, Meio: ${meio}, Fundo: ${fundo}`);
  return { topo, meio, fundo };
}

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Método não permitido" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const monitoramentos: MonitoramentoLeira[] = body.monitoramentos || [];
    
    if (monitoramentos.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ sucesso: true, sincronizados: 0 }) };
    }

    const resultados = [];
    let sincronizados = 0;
    const agora = new Date().toISOString();

    for (const monitoramento of monitoramentos) {
      try {
        const { topo, meio, fundo } = extrairTemperaturas(monitoramento.temperaturas);

        const { error } = await supabase
          .from("monitoramento_leira")
          .upsert({
            id: monitoramento.id,
            usuario_id: USUARIO_ID,
            leiraid: monitoramento.leiraId,
            data: monitoramento.data,
            hora: monitoramento.hora || null,
            temperatura_topo: topo,
            temperatura_meio: meio,
            temperatura_fundo: fundo,
            revolveu: monitoramento.revolveu,
            observacoes: monitoramento.observacoes || null,
            status: monitoramento.statusNovo || null,
            local_deposito: monitoramento.localDeposito || null,
            volume_original: monitoramento.volumeOriginal || null,
            volume_final: monitoramento.volumeFinal || null,
        
            dias_desde_formacao: monitoramento.diasDesdeFormacao || null,
            sincronizado: true,
            sincronizado_em: agora,
            criado_em: agora,
            atualizado_em: agora,
          }, { onConflict: 'id' });

        if (error) {
          console.error(`❌ Erro Sync:`, error.message);
          resultados.push({ id: monitoramento.id, status: "erro", erro: error.message });
        } else {
          sincronizados++;
          resultados.push({ id: monitoramento.id, status: "sincronizado" });
        }
      } catch (err) {
        resultados.push({ id: monitoramento.id, status: "erro", erro: String(err) });
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        sucesso: true,
        sincronizados,
        erros: resultados.filter(r => r.status === "erro").length
      }),
    };

  } catch (error: any) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ sucesso: false, erro: error.message }),
    };
  }
};