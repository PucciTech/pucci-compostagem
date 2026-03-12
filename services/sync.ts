import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

interface SyncQueue {
  tipo: 'material' | 'leira' | 'monitoramento' | 'clima' | 'enriquecimento' | 'leira_deletada' | 'clima_deletado';
  dados: any;
  timestamp: number;
  tentativas: number;
}

export const syncService = {
  // ===== DETECTAR INTERNET =====
  async verificarInternet(): Promise<boolean> {
    try {
      const state = await Network.getNetworkStateAsync();
      return state.isConnected ?? false;
    } catch {
      return false;
    }
  },

  // 🔥 NOVA FUNÇÃO: RESTAURAR DADOS DO SERVIDOR (BACKUP)
  async restaurarDadosDoServidor(): Promise<boolean> {
    try {
      console.log('🔄 Iniciando restauração de dados do servidor...');
      const netlifyUrl = process.env.EXPO_PUBLIC_NETLIFY_URL || 'http://localhost:9999';
      
      const response = await fetch(`${netlifyUrl}/.netlify/functions/sync-pull`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();

      if (result.sucesso && result.dados) {
        
        // 1. MATERIAIS
        if (result.dados.materiais?.length > 0) {
          const materiaisFormatados = result.dados.materiais.map((m: any) => ({
            id: m.id,
            data: m.data || '',
            tipoMaterial: m.tipomaterial || 'Biossólido', // Proteção contra null
            numeroMTR: m.numeromtr || '',
            peso: String(m.peso || '0'),
            origem: m.origem || 'Não informada', // Proteção contra null
            destino: m.destino || 'patio',
            usado: m.usado 
          }));
          await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(materiaisFormatados));
        }

        // 2. LEIRAS + MTRs (BLINDADO)
        if (result.dados.leiras?.length > 0) {
          const leirasFormatadas = result.dados.leiras.map((l: any) => {
            
            const mtrsDaLeira = (result.dados.leiraMtrs || []).filter((mtr: any) => mtr.leira_id === l.id);
            
            const biossolidosFormatados = mtrsDaLeira.map((mtr: any) => ({
              id: mtr.id,
              data: mtr.criado_em ? new Date(mtr.criado_em).toLocaleDateString('pt-BR') : '',
              numeroMTR: mtr.numero_mtr || '',
              peso: String(mtr.peso || '0'),
              origem: mtr.origem || 'Não informada', // Proteção contra null
              tipoMaterial: mtr.tipo_material || 'Biossólido' // Proteção contra null
            }));

            return {
              id: l.id,
              numeroLeira: l.numeroleira || 0,
              lote: l.lote || 'Sem Lote',
              dataFormacao: l.dataformacao || '',
              biossólidos: biossolidosFormatados,
              bagaço: Number(l.bagaço) || 12,
              status: l.status || 'formada', // 🔥 AQUI ESTAVA O MAIOR RISCO DE QUEBRAR A TELA
              totalBiossólido: Number(l.totalbiossólido) || 0
            };
          });
          await AsyncStorage.setItem('leirasFormadas', JSON.stringify(leirasFormatadas));
        }

        // 3. MONITORAMENTOS
        if (result.dados.monitoramentos.length > 0) {
          const monitoramentosFormatados = result.dados.monitoramentos.map((m: any) => {
            const temperaturas = [];
            if (m.temperatura_topo !== null) temperaturas.push({ ponto: 'topo', temperatura: Number(m.temperatura_topo) });
            if (m.temperatura_meio !== null) temperaturas.push({ ponto: 'meio', temperatura: Number(m.temperatura_meio) });
            if (m.temperatura_fundo !== null) temperaturas.push({ ponto: 'fundo', temperatura: Number(m.temperatura_fundo) });

            return {
              id: m.id,
              leiraId: m.leiraid,
              data: m.data,
              hora: m.hora,
              temperaturas: temperaturas,
              revolveu: m.revolveu,
              observacoes: m.observacoes,
              statusNovo: m.status,
              localDeposito: m.local_deposito,
              volumeOriginal: m.volume_original,
              volumeFinal: m.volume_final,
              diasDesdeFormacao: m.dias_desde_formacao,
              timestamp: m.criado_em ? new Date(m.criado_em).getTime() : Date.now()
            };
          });
          await AsyncStorage.setItem('leirasMonitoramento', JSON.stringify(monitoramentosFormatados));
        }

        // 4. ENRIQUECIMENTOS
        if (result.dados.enriquecimentos.length > 0) {
          const enriquecimentosFormatados = result.dados.enriquecimentos.map((e: any) => ({
            id: e.id,
            leiraId: e.leiraid || e.leiraId,
            dataEnriquecimento: e.data_enriquecimento || e.dataEnriquecimento,
            horaEnriquecimento: e.hora_enriquecimento || e.horaEnriquecimento,
            pesoAdicionado: Number(e.peso_adicionado || e.pesoAdicionado),
            numeroMTR: e.numero_mtr || e.numeroMTR,
            origem: e.origem,
            observacoes: e.observacoes,
            pesoAnterior: Number(e.peso_anterior || e.pesoAnterior || 0),
            pesoNovo: Number(e.peso_novo || e.pesoNovo || 0),
            timestamp: e.criado_em ? new Date(e.criado_em).getTime() : Date.now()
          }));
          await AsyncStorage.setItem('leirasEnriquecimentos', JSON.stringify(enriquecimentosFormatados));
        }

        // 5. CLIMA
        if (result.dados.clima.length > 0) {
          const climaFormatado = result.dados.clima.map((c: any) => ({
            id: c.id,
            leiraId: c.leiraid || c.leiraId,
            data: c.data,
            precipitacao: Number(c.precipitacao),
            observacao: c.observacao,
            timestamp: c.criado_em ? new Date(c.criado_em).getTime() : Date.now()
          }));
          await AsyncStorage.setItem('leirasClimatica', JSON.stringify(climaFormatado));
        }

        console.log('🎉 RESTAURAÇÃO TOTAL CONCLUÍDA COM SUCESSO!');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Erro crítico ao restaurar dados:', error);
      return false;
    }
  },

  // ===== OBTER OPERADOR LOGADO =====
  async obterOperadorLogado(): Promise<any> {
    try {
      const operadorSalvo = await AsyncStorage.getItem('operadorLogado');
      if (!operadorSalvo) {
        console.error('❌ Nenhum operador logado');
        return null;
      }
      return JSON.parse(operadorSalvo);
    } catch (error) {
      console.error('❌ Erro ao obter operador:', error);
      return null;
    }
  },

  // ===== OBTER TAMANHO DA FILA =====
  async obterTamanhoFila(): Promise<number> {
    try {
      const fila = await AsyncStorage.getItem('filaSync') || '[]';
      const filaArray: SyncQueue[] = JSON.parse(fila);
      return filaArray.length;
    } catch (error) {
      return 0;
    }
  },

  // ===== ADICIONAR À FILA =====
  async adicionarFila(tipo: SyncQueue['tipo'], dados: any): Promise<void> {
    try {
      const fila = await AsyncStorage.getItem('filaSync') || '[]';
      const filaArray: SyncQueue[] = JSON.parse(fila);

      filaArray.push({ tipo, dados, timestamp: Date.now(), tentativas: 0 });

      await AsyncStorage.setItem('filaSync', JSON.stringify(filaArray));
      console.log(`📝 Adicionado à fila: ${tipo} (ID: ${dados.id || '?'})`);

      const temInternet = await this.verificarInternet();
      if (temInternet) {
        await this.sincronizar();
      }
    } catch (error) {
      console.error('❌ Erro ao adicionar à fila:', error);
    }
  },

  // ===== SINCRONIZAR (PRINCIPAL) =====
  async sincronizar(): Promise<boolean> {
    try {
      const temInternet = await this.verificarInternet();
      if (!temInternet) return false;

      const operador = await this.obterOperadorLogado();
      if (!operador) return false;

      const fila = await AsyncStorage.getItem('filaSync') || '[]';
      const filaArray: SyncQueue[] = JSON.parse(fila);

      if (filaArray.length === 0) return true;

      console.log(`🔄 Sincronizando ${filaArray.length} itens...`);

      const grupos = {
        material: filaArray.filter(f => f.tipo === 'material').map(f => ({...f.dados, deletado: f.dados.deletado === true})),
        leira: filaArray.filter(f => f.tipo === 'leira').map(f => f.dados),
        monitoramento: filaArray.filter(f => f.tipo === 'monitoramento').map(f => f.dados),
        clima: filaArray.filter(f => f.tipo === 'clima').map(f => f.dados),
        enriquecimento: filaArray.filter(f => f.tipo === 'enriquecimento').map(f => f.dados),
        leira_deletada: filaArray.filter(f => f.tipo === 'leira_deletada').map(f => f.dados),
        clima_deletado: filaArray.filter(f => f.tipo === 'clima_deletado').map(f => f.dados),
      };

      let erros = 0;

      if (grupos.material.length) await this.sincronizarGenerico('sync-materiais', { materiais: grupos.material }, operador).catch(() => erros++);
      if (grupos.leira.length) await this.sincronizarGenerico('sync-leiras', { leiras: grupos.leira }, operador).catch(() => erros++);
      if (grupos.monitoramento.length) await this.sincronizarGenerico('sync-monitoramento', { monitoramentos: grupos.monitoramento }, operador).catch(() => erros++);
      
      if (grupos.clima.length) {
        const payloadClima = grupos.clima.map(i => ({ ...i, umidade: i.umidade || null, observacao: i.observacao || '' }));
        await this.sincronizarGenerico('sync-clima', { clima: payloadClima }, operador).catch(() => erros++);
      }

      if (grupos.enriquecimento.length) await this.sincronizarGenerico('sync-enriquecimento', { enriquecimentos: grupos.enriquecimento }, operador).catch(() => erros++);

      if (grupos.leira_deletada.length) await this.sincronizarDelecoes('leiras', grupos.leira_deletada, operador).catch(() => erros++);
      if (grupos.clima_deletado.length) await this.sincronizarDelecoes('clima', grupos.clima_deletado, operador).catch(() => erros++);

      if (erros === 0) {
        await AsyncStorage.removeItem('filaSync');
        console.log('✅ Sincronização concluída - Fila limpa');
        return true;
      } else {
        console.log(`⚠️ Sincronização parcial (${erros} erros) - Mantendo fila para tentar depois`);
        return false;
      }
    } catch (error) {
      console.error('❌ Erro geral no sync:', error);
      return false;
    }
  },

  // ===== FUNÇÃO GENÉRICA DE ENVIO =====
  async sincronizarGenerico(endpoint: string, body: any, operador: any): Promise<void> {
    const netlifyUrl = process.env.EXPO_PUBLIC_NETLIFY_URL || 'http://localhost:9999';
    
    const response = await fetch(`${netlifyUrl}/.netlify/functions/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, operadorId: operador.id, operadorNome: operador.nome }),
    });

    if (!response.ok) {
        const textoErro = await response.text();
        console.error(`❌ ERRO SERVIDOR [${endpoint}]:`, textoErro);
        throw new Error(`Erro ${response.status} em ${endpoint}`);
    }
  },

  // ===== FUNÇÃO DE DELEÇÃO =====
  async sincronizarDelecoes(tabela: string, itens: any[], operador: any): Promise<void> {
    try {
      const netlifyUrl = process.env.EXPO_PUBLIC_NETLIFY_URL || 'http://localhost:9999';
      const fullUrl = `${netlifyUrl}/.netlify/functions/sync-delete`;

      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabela, itens, operadorId: operador.id }),
      });

      const responseText = await response.text();
      let result;
      try { result = JSON.parse(responseText); } catch (e) { return; }

      if (!response.ok) return;

    } catch (error) {
      if (String(error).includes('Network request failed')) throw error;
    }
  }
};