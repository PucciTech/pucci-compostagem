// app/(app)/relatorios.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  TextInput,
  Modal,
  Platform // Importante para detectar o sistema
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'; // Importante para áreas seguras
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const PALETTE = {
  verdePrimario: '#5D7261',
  verdeClaro: '#F0F5F0',
  verdeClaro2: '#E8F0E8',
  terracota: '#B16338',
  branco: '#FFFFFF',
  preto: '#1A1A1A',
  cinza: '#666666',
  cinzaClaro: '#EEEEEE',
  cinzaClaro2: '#F5F5F5',
  sucesso: '#4CAF50',
  warning: '#FF9800',
  erro: '#D32F2F',
  azul: '#2196F3'
};

interface BiossólidoEntry {
  id: string;
  data: string;
  numeroMTR: string;
  peso: string;
  origem: string;
  tipoMaterial: string;
}

interface Leira {
  id: string;
  numeroLeira: number;
  lote: string;
  dataFormacao: string;
  biossólidos: BiossólidoEntry[];
  bagaço: number;
  status: string;
  totalBiossólido: number;
  temperature?: number;
  enriquecimentos?: any[];
}

interface MonitoramentoLeira {
  id: string;
  leiraId: string;
  data: string;
  hora?: string;
  temperaturas: any[];
  revolveu: boolean;
  observacoes?: string;
  statusNovo?: string;
  timestamp: number;
}

// ===== FUNÇÕES UTILITÁRIAS =====
const getDiasPassados = (data: string): number => {
  try {
    const [dia, mês, ano] = data.split('/').map(Number);
    const dataObj = new Date(ano, mês - 1, dia);
    const agora = new Date();
    const diferença = agora.getTime() - dataObj.getTime();
    return Math.floor(diferença / (1000 * 60 * 60 * 24));
  } catch (error) {
    return 0;
  }
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'formada': return PALETTE.terracota;
    case 'secando': return PALETTE.warning;
    case 'compostando': return PALETTE.verdePrimario;
    case 'maturando': return PALETTE.verdeClaro2;
    case 'pronta': return PALETTE.sucesso;
    default: return PALETTE.cinza;
  }
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'formada': return '📦 Formada';
    case 'secando': return '💨 Secando';
    case 'compostando': return '🔄 Compostando';
    case 'maturando': return '🌱 Maturando';
    case 'pronta': return '✅ Pronta';
    default: return 'Indefinido';
  }
};

const getTemperaturaMedia = (monitoramentos: MonitoramentoLeira[]): number => {
  if (monitoramentos.length === 0) return 0;
  const todasAsTemperaturas = monitoramentos.flatMap((m) => m.temperaturas.map((t) => t.temperatura));
  const soma = todasAsTemperaturas.reduce((acc, temp) => acc + temp, 0);
  return soma / todasAsTemperaturas.length;
};

const getTemperaturaMaxima = (monitoramentos: MonitoramentoLeira[]): number => {
  if (monitoramentos.length === 0) return 0;
  const todasAsTemperaturas = monitoramentos.flatMap((m) => m.temperaturas.map((t) => t.temperatura));
  return Math.max(...todasAsTemperaturas);
};

const verificarNecessidadeRevolvimento = (monitoramentos: MonitoramentoLeira[]): boolean => {
  if (monitoramentos.length < 2) return false;
  const ultimos2Dias = monitoramentos.sort((a, b) => b.timestamp - a.timestamp).slice(0, 2);
  if (ultimos2Dias.length < 2) return false;
  const temAlta = ultimos2Dias.every((m) => {
    const maxTemp = Math.max(...m.temperaturas.map((t) => t.temperatura));
    return maxTemp > 65;
  });
  if (temAlta && !ultimos2Dias[0].revolveu) return true;
  return false;
};

export default function RelatoriosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // Hook para pegar o tamanho da área segura
  const [leiras, setLeiras] = useState<Leira[]>([]);
  const [monitoramentos, setMonitoramentos] = useState<MonitoramentoLeira[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [filtroBusca, setFiltroBusca] = useState<string>('');
  const [mostrarBusca, setMostrarBusca] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<string>('todas');
  
  // Novos Filtros (Lote/Leira)
  const [filtroLote, setFiltroLote] = useState('');
  const [filtroLeira, setFiltroLeira] = useState('');
  const [showModalFiltro, setShowModalFiltro] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState<'lote' | 'leira'>('lote');

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const leirasRegistradas = await AsyncStorage.getItem('leirasFormadas');
      const leirasData = leirasRegistradas ? JSON.parse(leirasRegistradas) : [];
      setLeiras(leirasData);

      const monitoramentosRegistrados = await AsyncStorage.getItem('leirasMonitoramento');
      const monitoramentosData = monitoramentosRegistrados ? JSON.parse(monitoramentosRegistrados) : [];
      setMonitoramentos(monitoramentosData);
    } catch (error) {
      console.error('❌ Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // ===== LÓGICA DE FILTRAGEM UNIFICADA =====
  const leirasFiltradasCompletas = React.useMemo(() => {
    let resultado = [...leiras];

    if (filtroStatus !== 'todas') {
      resultado = resultado.filter((leira) => leira.status === filtroStatus);
    }

    if (filtroLote) {
      resultado = resultado.filter((leira) => leira.lote === filtroLote);
    }

    if (filtroLeira) {
      resultado = resultado.filter((leira) => leira.numeroLeira.toString() === filtroLeira);
    }

    if (filtroBusca.trim()) {
      const textoBusca = filtroBusca.toLowerCase().trim();
      resultado = resultado.filter((leira) => {
        return (
          `leira ${leira.numeroLeira}`.toLowerCase().includes(textoBusca) ||
          `leira#${leira.numeroLeira}`.toLowerCase().includes(textoBusca) ||
          `#${leira.numeroLeira}`.toLowerCase().includes(textoBusca) ||
          leira.numeroLeira.toString().includes(textoBusca) ||
          leira.lote.toLowerCase().includes(textoBusca) ||
          leira.dataFormacao.includes(textoBusca) ||
          leira.status.toLowerCase().includes(textoBusca) ||
          getStatusLabel(leira.status).toLowerCase().includes(textoBusca) ||
          leira.biossólidos.some(bio =>
            bio.numeroMTR.toLowerCase().includes(textoBusca) ||
            bio.origem.toLowerCase().includes(textoBusca) ||
            bio.data.includes(textoBusca)
          )
        );
      });
    }

    return resultado;
  }, [leiras, filtroStatus, filtroBusca, filtroLote, filtroLeira]);

  const leirasOrdenadas = [...leirasFiltradasCompletas].sort((a, b) => {
    const dataA = new Date(a.dataFormacao.split('/').reverse().join('-'));
    const dataB = new Date(b.dataFormacao.split('/').reverse().join('-'));
    return dataB.getTime() - dataA.getTime();
  });

  const lotesUnicos = Array.from(new Set(leiras.map(l => l.lote))).sort();
  const leirasUnicas = leiras
      .filter(l => !filtroLote || l.lote === filtroLote)
      .map(l => l.numeroLeira.toString())
      .sort((a, b) => Number(a) - Number(b));

  const abrirFiltro = (tipo: 'lote' | 'leira') => {
      setTipoFiltro(tipo);
      setShowModalFiltro(true);
  };

  const selecionarFiltro = (valor: string) => {
      if (tipoFiltro === 'lote') {
          setFiltroLote(valor);
          setFiltroLeira('');
      } else {
          setFiltroLeira(valor);
      }
      setShowModalFiltro(false);
  };

  const limparTodosFiltros = () => {
    setFiltroBusca('');
    setFiltroStatus('todas');
    setFiltroLote('');
    setFiltroLeira('');
    setMostrarBusca(false);
  };

  const totalLeiras = leiras.length;
  const leirasFormadas = leiras.filter((l) => l.status === 'formada').length;
  const leirasSecando = leiras.filter((l) => l.status === 'secando').length;
  const leirasCompostando = leiras.filter((l) => l.status === 'compostando').length;
  const leirasMaturando = leiras.filter((l) => l.status === 'maturando').length;
  const leirasProtas = leiras.filter((l) => l.status === 'pronta').length;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PALETTE.verdePrimario} />
          <Text style={styles.loadingText}>Carregando relatório...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Relatório de Leiras</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={loadData}>
            <Text style={styles.refreshIcon}>🔄</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filterContainer}>
            <Text style={styles.filterLabel}>Filtragem Rápida:</Text>
            <View style={styles.filterRow}>
                <TouchableOpacity 
                    style={[styles.filterBtn, filtroLote ? styles.filterBtnActive : null]} 
                    onPress={() => abrirFiltro('lote')}
                >
                    <Text style={[styles.filterBtnText, filtroLote ? styles.filterBtnTextActive : null]}>
                        {filtroLote ? `Lote: ${filtroLote}` : 'Todos Lotes'}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={filtroLote ? PALETTE.branco : PALETTE.cinza} />
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.filterBtn, filtroLeira ? styles.filterBtnActive : null]} 
                    onPress={() => abrirFiltro('leira')}
                >
                    <Text style={[styles.filterBtnText, filtroLeira ? styles.filterBtnTextActive : null]}>
                        {filtroLeira ? `Leira #${filtroLeira}` : 'Todas Leiras'}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={filtroLeira ? PALETTE.branco : PALETTE.cinza} />
                </TouchableOpacity>
            </View>
            
            {(filtroLote || filtroLeira) && (
                <TouchableOpacity onPress={() => { setFiltroLote(''); setFiltroLeira(''); }} style={styles.clearFilterBtn}>
                    <Text style={styles.clearFilterText}>Limpar Seleção ✕</Text>
                </TouchableOpacity>
            )}
        </View>

        <View style={styles.statsGeraisBox}>
          <Text style={styles.statsGeraisTitle}>📊 Estatísticas Gerais</Text>
          <View style={styles.statsGeraisContent}>
            <Text style={styles.statsGeraisValue}>{totalLeiras}</Text>
            <Text style={styles.statsGeraisLabel}>Total de Leiras</Text>
          </View>
        </View>

        <View style={styles.statsStatusContainer}>
          <Text style={styles.statsStatusTitle}>📈 Por Status</Text>
          <View style={styles.statsStatusGrid}>
            <StatBoxStatus label="Formadas" value={leirasFormadas.toString()} icon="📦" color={PALETTE.terracota} status="formada" onPress={() => setFiltroStatus('formada')} />
            <StatBoxStatus label="Secagem" value={leirasSecando.toString()} icon="💨" color={PALETTE.warning} status="secando" onPress={() => setFiltroStatus('secando')} />
            <StatBoxStatus label="Compostagem" value={leirasCompostando.toString()} icon="🔄" color={PALETTE.verdePrimario} status="compostando" onPress={() => setFiltroStatus('compostando')} />
            <StatBoxStatus label="Maturação" value={leirasMaturando.toString()} icon="🌱" color={PALETTE.verdeClaro2} status="maturando" onPress={() => setFiltroStatus('maturando')} />
            <StatBoxStatus label="Venda" value={leirasProtas.toString()} icon="✅" color={PALETTE.sucesso} status="pronta" onPress={() => setFiltroStatus('pronta')} />
          </View>
        </View>

        <View style={styles.filtrosContainer}>
          <View style={styles.filtrosHeaderContainer}>
            <Text style={styles.filtrosTitle}>Busca Textual</Text>
            <TouchableOpacity style={styles.botaoToggleBusca} onPress={() => setMostrarBusca(!mostrarBusca)}>
              <Text style={styles.textoToggleBusca}>{mostrarBusca ? '🔼 Ocultar' : '🔍 Buscar'}</Text>
            </TouchableOpacity>
          </View>

          {mostrarBusca && (
            <View style={styles.containerBusca}>
              <View style={styles.wrapperInputBusca}>
                <TextInput
                  style={styles.inputBuscaTexto}
                  placeholder="Buscar por número, lote, MTR, origem..."
                  value={filtroBusca}
                  onChangeText={setFiltroBusca}
                  placeholderTextColor={PALETTE.cinza}
                  autoCapitalize="none"
                />
                {filtroBusca.length > 0 && (
                  <TouchableOpacity style={styles.botaoLimparBusca} onPress={() => setFiltroBusca('')}>
                    <Text style={styles.textoLimparBusca}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.containerResultados}>
                <Text style={styles.textoResultados}>
                  {leirasOrdenadas.length} de {leiras.length} leiras
                  {(filtroBusca || filtroStatus !== 'todas' || filtroLote || filtroLeira) && ' (filtradas)'}
                </Text>

                {(filtroBusca || filtroStatus !== 'todas' || filtroLote || filtroLeira) && (
                  <TouchableOpacity style={styles.botaoLimparTudo} onPress={limparTodosFiltros}>
                    <Text style={styles.textoLimparTudo}>Limpar Tudo</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>

        <View style={styles.listSection}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Leiras ({leirasOrdenadas.length})</Text>
            <Text style={styles.listSubtitle}>
              {filtroStatus === 'todas' ? 'Todas as leiras' : `Status: ${getStatusLabel(filtroStatus)}`}
            </Text>
          </View>

          {leirasOrdenadas.length > 0 ? (
            <FlatList
              data={leirasOrdenadas}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <LeiraCard
                  leira={item}
                  monitoramentos={monitoramentos.filter((m) => m.leiraId === item.id)}
                  onPress={() => router.push({ pathname: '/detalhes-leira', params: { leiraId: item.id } })}
                />
              )}
            />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🚜</Text>
              <Text style={styles.emptyText}>Nenhuma leira encontrada</Text>
              <Text style={styles.emptySubtext}>Tente limpar os filtros</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ✅ MODAL DE FILTRO CORRIGIDO */}
      <Modal visible={showModalFiltro} transparent animationType="slide" onRequestClose={() => setShowModalFiltro(false)}>
          <View style={styles.modalOverlay}>
              {/* Adicionamos paddingBottom seguro para não colar na barra do celular */}
              <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
                  <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Selecione {tipoFiltro === 'lote' ? 'o Lote' : 'a Leira'}</Text>
                      <TouchableOpacity onPress={() => setShowModalFiltro(false)}>
                          <Ionicons name="close" size={24} color={PALETTE.cinza} />
                      </TouchableOpacity>
                  </View>
                  
                  {/* Lista com altura máxima para não estourar a tela */}
                  <View style={{ maxHeight: '80%' }}>
                    <FlatList
                        data={tipoFiltro === 'lote' ? lotesUnicos : leirasUnicas}
                        keyExtractor={(item) => item}
                        // Adiciona padding no final da lista interna também
                        contentContainerStyle={{ paddingBottom: 20 }}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.modalItem} onPress={() => selecionarFiltro(item)}>
                                <Text style={styles.modalItemText}>
                                    {tipoFiltro === 'lote' ? `Lote ${item}` : `Leira #${item}`}
                                </Text>
                                <Ionicons name="chevron-forward" size={20} color={PALETTE.cinzaClaro} />
                            </TouchableOpacity>
                        )}
                    />
                  </View>
              </View>
          </View>
      </Modal>
    </SafeAreaView>
  );
}

function StatBoxStatus({ label, value, icon, color, status, onPress }: any) {
  return (
    <TouchableOpacity style={[styles.statBoxStatus, { borderTopColor: color }]} onPress={onPress}>
      <Text style={styles.statBoxStatusIcon}>{icon}</Text>
      <Text style={styles.statBoxStatusLabel}>{label}</Text>
      <Text style={[styles.statBoxStatusValue, { color }]}>{value}</Text>
    </TouchableOpacity>
  );
}

function LeiraCard({ leira, monitoramentos, onPress }: any) {
  const diasPassados = getDiasPassados(leira.dataFormacao);
  const tempMedia = getTemperaturaMedia(monitoramentos);
  const tempMaxima = getTemperaturaMaxima(monitoramentos);
  const precisaRevolver = verificarNecessidadeRevolvimento(monitoramentos);

  return (
    <TouchableOpacity style={styles.leiraCard} onPress={onPress}>
      <View style={styles.leiraCardHeader}>
        <View style={styles.leiraCardLeft}>
          <Text style={styles.leiraCardIcon}>🌾</Text>
          <View style={styles.leiraCardInfo}>
            <View style={styles.leiraNumberRow}>
              <Text style={styles.leiraNumber}>Leira #{leira.numeroLeira}</Text>
              <View style={styles.loteBadge}>
                <Text style={styles.loteBadgeText}>Lote {leira.lote}</Text>
              </View>
            </View>
            <Text style={styles.leiraData}>{leira.dataFormacao}</Text>
            <Text style={styles.leiraSubtitle}>{diasPassados} dia{diasPassados !== 1 ? 's' : ''} atrás</Text>
          </View>
        </View>
        <View style={[styles.leiraStatusBadge, { backgroundColor: getStatusColor(leira.status) }]}>
          <Text style={styles.leiraStatusText}>{getStatusLabel(leira.status)}</Text>
        </View>
      </View>

      {precisaRevolver && (
        <View style={styles.alertaRevolvimento}>
          <Text style={styles.alertaIcon}>⚠️</Text>
          <View style={styles.alertaContent}>
            <Text style={styles.alertaTitle}>Revolvimento Necessário</Text>
            <Text style={styles.alertaText}>Temperatura {'>'} 65°C por 2+ dias</Text>
          </View>
        </View>
      )}

      <View style={styles.leiraCardDetails}>
        <DetailItem label="Biossólido" value={`${leira.totalBiossólido.toFixed(1)} ton`} />
        <DetailItem label="Bagaço" value={`${leira.bagaço} ton`} />
        <DetailItem label="Total" value={`${(leira.totalBiossólido + leira.bagaço).toFixed(1)} ton`} />
      </View>

      {monitoramentos.length > 0 && (
        <View style={styles.temperaturaBox}>
          <View style={styles.temperaturaItem}>
            <Text style={styles.temperaturaLabel}>Média</Text>
            <Text style={styles.temperaturaValue}>{tempMedia.toFixed(1)}°C</Text>
          </View>
          <View style={styles.temperaturaItem}>
            <Text style={styles.temperaturaLabel}>Máxima</Text>
            <Text style={[styles.temperaturaValue, tempMaxima > 65 && styles.temperaturaAlta]}>{tempMaxima.toFixed(1)}°C</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

function DetailItem({ label, value }: any) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.verdeClaro },
  scrollContent: { flexGrow: 1, paddingBottom: 30 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: PALETTE.cinza },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: PALETTE.branco, borderBottomWidth: 1, borderBottomColor: PALETTE.cinzaClaro2 },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: PALETTE.preto },
  refreshButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  refreshIcon: { fontSize: 20 },
  
  filterContainer: { backgroundColor: PALETTE.branco, padding: 15, marginHorizontal: 20, marginTop: 15, borderRadius: 12, borderWidth: 1, borderColor: PALETTE.cinzaClaro2 },
  filterLabel: { fontSize: 11, fontWeight: '700', color: PALETTE.cinza, marginBottom: 8, textTransform: 'uppercase' },
  filterRow: { flexDirection: 'row', gap: 10 },
  filterBtn: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: PALETTE.cinzaClaro2, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: PALETTE.cinzaClaro },
  filterBtnActive: { backgroundColor: PALETTE.verdePrimario, borderColor: PALETTE.verdePrimario },
  filterBtnText: { fontSize: 12, fontWeight: '600', color: PALETTE.cinza },
  filterBtnTextActive: { color: PALETTE.branco },
  clearFilterBtn: { alignSelf: 'flex-end', marginTop: 8 },
  clearFilterText: { fontSize: 11, fontWeight: '700', color: PALETTE.erro },

  statsGeraisBox: { marginHorizontal: 20, marginVertical: 20, backgroundColor: PALETTE.branco, borderRadius: 14, padding: 16, borderLeftWidth: 4, borderLeftColor: PALETTE.verdePrimario, alignItems: 'center' },
  statsGeraisTitle: { fontSize: 14, fontWeight: '700', color: PALETTE.preto, marginBottom: 12 },
  statsGeraisContent: { alignItems: 'center' },
  statsGeraisValue: { fontSize: 32, fontWeight: '800', color: PALETTE.verdePrimario },
  statsGeraisLabel: { fontSize: 12, color: PALETTE.cinza, fontWeight: '600', marginTop: 4 },
  
  statsStatusContainer: { paddingHorizontal: 20, marginBottom: 20 },
  statsStatusTitle: { fontSize: 14, fontWeight: '700', color: PALETTE.preto, marginBottom: 12 },
  statsStatusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBoxStatus: { flex: 1, minWidth: '48%', backgroundColor: PALETTE.branco, borderRadius: 12, padding: 12, borderTopWidth: 3, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: PALETTE.cinzaClaro2 },
  statBoxStatusIcon: { fontSize: 24, marginBottom: 6 },
  statBoxStatusLabel: { fontSize: 11, color: PALETTE.cinza, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  statBoxStatusValue: { fontSize: 20, fontWeight: '800', marginBottom: 4 },

  filtrosContainer: { paddingHorizontal: 20, marginBottom: 20 },
  filtrosHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  filtrosTitle: { fontSize: 12, fontWeight: '700', color: PALETTE.verdePrimario, textTransform: 'uppercase' },
  botaoToggleBusca: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: PALETTE.verdeClaro2, borderRadius: 8, borderWidth: 1, borderColor: PALETTE.verdePrimario },
  textoToggleBusca: { fontSize: 10, fontWeight: '600', color: PALETTE.verdePrimario },
  containerBusca: { backgroundColor: PALETTE.branco, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: PALETTE.cinzaClaro2 },
  wrapperInputBusca: { position: 'relative', marginBottom: 8 },
  inputBuscaTexto: { height: 44, borderWidth: 1, borderColor: PALETTE.cinzaClaro, borderRadius: 8, paddingHorizontal: 16, fontSize: 14, backgroundColor: PALETTE.cinzaClaro2, paddingRight: 40 },
  botaoLimparBusca: { position: 'absolute', right: 12, top: 10, width: 24, height: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: PALETTE.cinzaClaro, borderRadius: 12 },
  textoLimparBusca: { fontSize: 14, color: PALETTE.cinza, fontWeight: '600' },
  containerResultados: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: PALETTE.cinzaClaro2 },
  textoResultados: { fontSize: 11, color: PALETTE.cinza, fontWeight: '600' },
  botaoLimparTudo: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: PALETTE.terracota, borderRadius: 6 },
  textoLimparTudo: { fontSize: 10, color: PALETTE.branco, fontWeight: '700' },

  listSection: { paddingHorizontal: 20 },
  listHeader: { marginBottom: 14 },
  listTitle: { fontSize: 16, fontWeight: '700', color: PALETTE.preto },
  listSubtitle: { fontSize: 12, color: PALETTE.cinza, marginTop: 4 },
  
  leiraCard: { backgroundColor: PALETTE.branco, borderRadius: 14, padding: 16, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: PALETTE.verdePrimario },
  leiraCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  leiraCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  leiraCardIcon: { fontSize: 32, marginRight: 12 },
  leiraCardInfo: { flex: 1 },
  leiraNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  leiraNumber: { fontSize: 14, fontWeight: '800', color: PALETTE.preto },
  loteBadge: { backgroundColor: PALETTE.terracota, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  loteBadgeText: { fontSize: 10, fontWeight: '700', color: PALETTE.branco },
  leiraData: { fontSize: 11, color: PALETTE.cinza },
  leiraSubtitle: { fontSize: 10, color: PALETTE.cinza, fontStyle: 'italic', marginTop: 2 },
  leiraStatusBadge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  leiraStatusText: { fontSize: 10, fontWeight: '700', color: PALETTE.branco },
  alertaRevolvimento: { flexDirection: 'row', backgroundColor: '#FFF3E0', borderRadius: 10, padding: 12, marginBottom: 12, alignItems: 'center', borderLeftWidth: 4, borderLeftColor: PALETTE.warning },
  alertaIcon: { fontSize: 24, marginRight: 10 },
  alertaContent: { flex: 1 },
  alertaTitle: { fontSize: 12, fontWeight: '700', color: PALETTE.preto },
  alertaText: { fontSize: 11, color: PALETTE.cinza, marginTop: 2 },
  leiraCardDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: PALETTE.cinzaClaro2 },
  detailItem: { flex: 1, minWidth: '45%' },
  detailLabel: { fontSize: 10, color: PALETTE.cinza, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  detailValue: { fontSize: 12, fontWeight: '700', color: PALETTE.preto },
  temperaturaBox: { flexDirection: 'row', backgroundColor: PALETTE.verdeClaro2, borderRadius: 10, padding: 12, marginBottom: 12, gap: 12 },
  temperaturaItem: { flex: 1, alignItems: 'center' },
  temperaturaLabel: { fontSize: 10, color: PALETTE.cinza, fontWeight: '600', marginBottom: 4 },
  temperaturaValue: { fontSize: 14, fontWeight: '700', color: PALETTE.verdePrimario },
  temperaturaAlta: { color: PALETTE.erro },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, fontWeight: '700', color: PALETTE.preto, marginBottom: 6 },
  emptySubtext: { fontSize: 12, color: PALETTE.cinza },

  // 🔥 ESTILOS DO MODAL CORRIGIDOS
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { 
    backgroundColor: PALETTE.branco, 
    borderTopLeftRadius: 20, 
    borderTopRightRadius: 20, 
    padding: 20, 
    maxHeight: '70%' 
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: PALETTE.preto },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: PALETTE.cinzaClaro2, flexDirection: 'row', justifyContent: 'space-between' },
  modalItemText: { fontSize: 16, color: PALETTE.preto },
});