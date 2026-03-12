// app/(app)/relatorios.tsx

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  TextInput as RNTextInput,
  Modal,
  Platform
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// ===== NOVO DESIGN SYSTEM (PALETA REFINADA DO DASHBOARD) =====
const PALETTE = {
  verdePrimario: '#2E4F36', 
  verdeClaro: '#F4F7F4', 
  verdeCard: '#E8EFE9', 
  terracota: '#B16338', 
  terracotaClaro: '#FDF3EE', 
  branco: '#FFFFFF',
  preto: '#1A2B22', 
  cinza: '#6B7A71', 
  cinzaClaro: '#E1E8E3', 
  erro: '#DC3545',
  erroClaro: '#FCEAEA',
  sucesso: '#28A745',
  sucessoClaro: '#EAF6EC',
  warning: '#EAB308',
  warningClaro: '#FEF5E7',
  info: '#0D6EFD',
  infoClaro: '#E7F1FF',
  azulPiscinao: '#0D6EFD',
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
    case 'compostando': return PALETTE.info;
    case 'maturando': return PALETTE.verdePrimario;
    case 'pronta': return PALETTE.sucesso;
    default: return PALETTE.cinza;
  }
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'formada': return 'Formada';
    case 'secando': return 'Secando';
    case 'compostando': return 'Compostando';
    case 'maturando': return 'Maturando';
    case 'pronta': return 'Pronta';
    default: return 'Indefinido';
  }
};

const getStatusIcon = (status: string): any => {
  switch (status) {
    case 'formada': return 'shape-outline';
    case 'secando': return 'weather-windy';
    case 'compostando': return 'recycle';
    case 'maturando': return 'leaf';
    case 'pronta': return 'check-decagram';
    default: return 'help-circle-outline';
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
  const insets = useSafeAreaInsets();
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
      if (leirasRegistradas) {
        const todasLeiras = JSON.parse(leirasRegistradas);
        
        // 🔥 FILTRO: Apenas leiras que ESTÃO NO PÁTIO (ignora arquivada e finalizada)
        const leirasAtivas = todasLeiras.filter((l: any) => {
          const status = l.status?.toLowerCase() || '';
          return !['arquivada', 'finalizada'].includes(status);
        });
        
        setLeiras(leirasAtivas);
      } else {
        setLeiras([]);
      }

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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Relatório de Leiras</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={loadData}>
            <MaterialCommunityIcons name="refresh" size={24} color={PALETTE.verdePrimario} />
          </TouchableOpacity>
        </View>

        {/* FILTRAGEM RÁPIDA */}
        <View style={styles.filterContainer}>
            <Text style={styles.filterLabel}>Filtragem Rápida</Text>
            <View style={styles.filterRow}>
                <TouchableOpacity 
                    style={[styles.filterBtn, filtroLote ? styles.filterBtnActive : null]} 
                    onPress={() => abrirFiltro('lote')}
                >
                    <Text style={[styles.filterBtnText, filtroLote ? styles.filterBtnTextActive : null]}>
                        {filtroLote ? `Lote: ${filtroLote}` : 'Todos Lotes'}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color={filtroLote ? PALETTE.branco : PALETTE.cinza} />
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.filterBtn, filtroLeira ? styles.filterBtnActive : null]} 
                    onPress={() => abrirFiltro('leira')}
                >
                    <Text style={[styles.filterBtnText, filtroLeira ? styles.filterBtnTextActive : null]}>
                        {filtroLeira ? `Leira #${filtroLeira}` : 'Todas Leiras'}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color={filtroLeira ? PALETTE.branco : PALETTE.cinza} />
                </TouchableOpacity>
            </View>
            
            {(filtroLote || filtroLeira) && (
                <TouchableOpacity onPress={() => { setFiltroLote(''); setFiltroLeira(''); }} style={styles.clearFilterBtn}>
                    <MaterialCommunityIcons name="close-circle" size={14} color={PALETTE.erro} style={{marginRight: 4}} />
                    <Text style={styles.clearFilterText}>Limpar Seleção</Text>
                </TouchableOpacity>
            )}
        </View>

        {/* ESTATÍSTICAS GERAIS */}
        <View style={styles.statsGeraisBox}>
          <View style={styles.statsGeraisHeader}>
            <MaterialCommunityIcons name="chart-box" size={20} color={PALETTE.verdePrimario} style={{marginRight: 8}} />
            <Text style={styles.statsGeraisTitle}>Estatísticas Gerais</Text>
          </View>
          <View style={styles.statsGeraisContent}>
            <Text style={styles.statsGeraisValue}>{totalLeiras}</Text>
            <Text style={styles.statsGeraisLabel}>Total de Leiras Registradas</Text>
          </View>
        </View>

        {/* POR STATUS */}
        <View style={styles.statsStatusContainer}>
          <Text style={styles.statsStatusTitle}>Desempenho por Status</Text>
          <View style={styles.statsStatusGrid}>
            <StatBoxStatus label="Formadas" value={leirasFormadas.toString()} icon="shape-outline" color={PALETTE.terracota} status="formada" isActive={filtroStatus === 'formada'} onPress={() => setFiltroStatus(filtroStatus === 'formada' ? 'todas' : 'formada')} />
            <StatBoxStatus label="Secagem" value={leirasSecando.toString()} icon="weather-windy" color={PALETTE.warning} status="secando" isActive={filtroStatus === 'secando'} onPress={() => setFiltroStatus(filtroStatus === 'secando' ? 'todas' : 'secando')} />
            <StatBoxStatus label="Compostagem" value={leirasCompostando.toString()} icon="recycle" color={PALETTE.info} status="compostando" isActive={filtroStatus === 'compostando'} onPress={() => setFiltroStatus(filtroStatus === 'compostando' ? 'todas' : 'compostando')} />
            <StatBoxStatus label="Maturação" value={leirasMaturando.toString()} icon="leaf" color={PALETTE.verdePrimario} status="maturando" isActive={filtroStatus === 'maturando'} onPress={() => setFiltroStatus(filtroStatus === 'maturando' ? 'todas' : 'maturando')} />
            <StatBoxStatus label="Venda" value={leirasProtas.toString()} icon="check-decagram" color={PALETTE.sucesso} status="pronta" isActive={filtroStatus === 'pronta'} onPress={() => setFiltroStatus(filtroStatus === 'pronta' ? 'todas' : 'pronta')} />
          </View>
        </View>

        {/* BUSCA TEXTUAL */}
        <View style={styles.filtrosContainer}>
          <View style={styles.filtrosHeaderContainer}>
            <Text style={styles.filtrosTitle}>Busca Avançada</Text>
            <TouchableOpacity style={styles.botaoToggleBusca} onPress={() => setMostrarBusca(!mostrarBusca)}>
              <MaterialCommunityIcons name={mostrarBusca ? "chevron-up" : "magnify"} size={16} color={PALETTE.verdePrimario} style={{marginRight: 4}} />
              <Text style={styles.textoToggleBusca}>{mostrarBusca ? 'Ocultar' : 'Buscar'}</Text>
            </TouchableOpacity>
          </View>

          {mostrarBusca && (
            <View style={styles.containerBusca}>
              <View style={styles.wrapperInputBusca}>
                <MaterialCommunityIcons name="magnify" size={20} color={PALETTE.cinza} style={styles.searchIconInside} />
                <RNTextInput
                  style={styles.inputBuscaTexto}
                  placeholder="Número, lote, MTR, origem..."
                  value={filtroBusca}
                  onChangeText={setFiltroBusca}
                  placeholderTextColor={PALETTE.cinza}
                  autoCapitalize="none"
                />
                {filtroBusca.length > 0 && (
                  <TouchableOpacity style={styles.botaoLimparBusca} onPress={() => setFiltroBusca('')}>
                    <MaterialCommunityIcons name="close" size={16} color={PALETTE.branco} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.containerResultados}>
                <Text style={styles.textoResultados}>
                  Exibindo {leirasOrdenadas.length} de {leiras.length} leiras
                </Text>

                {(filtroBusca || filtroStatus !== 'todas' || filtroLote || filtroLeira) && (
                  <TouchableOpacity style={styles.botaoLimparTudo} onPress={limparTodosFiltros}>
                    <Text style={styles.textoLimparTudo}>Limpar Filtros</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>

        {/* LISTAGEM */}
        <View style={styles.listSection}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Resultados ({leirasOrdenadas.length})</Text>
            <Text style={styles.listSubtitle}>
              {filtroStatus === 'todas' ? 'Exibindo todas as leiras' : `Filtrado por: ${getStatusLabel(filtroStatus)}`}
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
              <MaterialCommunityIcons name="tractor" size={48} color={PALETTE.cinzaClaro} style={{ marginBottom: 16 }} />
              <Text style={styles.emptyText}>Nenhuma leira encontrada</Text>
              <Text style={styles.emptySubtext}>Tente ajustar ou limpar os filtros</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* MODAL DE FILTRO */}
      <Modal visible={showModalFiltro} transparent animationType="slide" onRequestClose={() => setShowModalFiltro(false)}>
          <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
                  <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Selecione {tipoFiltro === 'lote' ? 'o Lote' : 'a Leira'}</Text>
                      <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowModalFiltro(false)}>
                          <MaterialCommunityIcons name="close" size={20} color={PALETTE.cinza} />
                      </TouchableOpacity>
                  </View>
                  
                  <View style={{ maxHeight: '80%' }}>
                    <FlatList
                        data={tipoFiltro === 'lote' ? lotesUnicos : leirasUnicas}
                        keyExtractor={(item) => item}
                        contentContainerStyle={{ paddingBottom: 20 }}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.modalItem} onPress={() => selecionarFiltro(item)}>
                                <Text style={styles.modalItemText}>
                                    {tipoFiltro === 'lote' ? `Lote ${item}` : `Leira #${item}`}
                                </Text>
                                <MaterialCommunityIcons name="chevron-right" size={20} color={PALETTE.cinza} />
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

// ===== COMPONENTES DE UI =====

function StatBoxStatus({ label, value, icon, color, status, isActive, onPress }: any) {
  return (
    <TouchableOpacity 
      style={[
        styles.statBoxStatus, 
        { borderTopColor: color },
        isActive && { backgroundColor: `${color}10`, borderColor: color, borderWidth: 1 }
      ]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <MaterialCommunityIcons name={icon} size={24} color={color} style={{ marginBottom: 8 }} />
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
  const statusColor = getStatusColor(leira.status);

  return (
    <TouchableOpacity style={[styles.leiraCard, { borderLeftColor: statusColor }]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.leiraCardHeader}>
        <View style={styles.leiraCardLeft}>
          <View style={[styles.leiraCardIconBox, { backgroundColor: `${statusColor}15` }]}>
            <MaterialCommunityIcons name="sprout" size={24} color={statusColor} />
          </View>
          <View style={styles.leiraCardInfo}>
            <View style={styles.leiraNumberRow}>
              <Text style={styles.leiraNumber}>Leira #{leira.numeroLeira}</Text>
              <View style={[styles.loteBadge, { backgroundColor: `${PALETTE.terracota}15` }]}>
                <MaterialCommunityIcons name="tag" size={12} color={PALETTE.terracota} style={{marginRight: 4}} />
                <Text style={[styles.loteBadgeText, {color: PALETTE.terracota}]}>Lote {leira.lote}</Text>
              </View>
            </View>
            <Text style={styles.leiraData}>Formada em {leira.dataFormacao}</Text>
            <Text style={styles.leiraSubtitle}>{diasPassados} dia{diasPassados !== 1 ? 's' : ''} atrás</Text>
          </View>
        </View>
        {/* ❌ O STATUS FOI REMOVIDO DAQUI PARA NÃO INVADIR O LOTE */}
      </View>

      {precisaRevolver && (
        <View style={styles.alertaRevolvimento}>
          <MaterialCommunityIcons name="alert" size={20} color={PALETTE.warning} style={{marginRight: 12}} />
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
        
        {/* ✅ STATUS ADICIONADO AQUI (Vai para a linha de baixo, no espaço vazio) */}
        <View style={[styles.detailItem, { marginTop: 8, minWidth: '100%' }]}>
          <Text style={styles.detailLabel}>Status Atual</Text>
          <View style={[styles.leiraStatusBadge, { backgroundColor: `${statusColor}15`, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6 }]}>
            <MaterialCommunityIcons name={getStatusIcon(leira.status)} size={14} color={statusColor} style={{marginRight: 4}} />
            <Text style={[styles.leiraStatusText, {color: statusColor}]}>{getStatusLabel(leira.status)}</Text>
          </View>
        </View>
      </View>

      {monitoramentos.length > 0 && (
        <View style={styles.temperaturaBox}>
          <View style={styles.temperaturaItem}>
            <Text style={styles.temperaturaLabel}>Média</Text>
            <Text style={styles.temperaturaValue}>{tempMedia.toFixed(1)}°C</Text>
          </View>
          <View style={styles.temperaturaDivider} />
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

// ===== ESTILOS PADRONIZADOS =====
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.verdeClaro },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 15, color: PALETTE.cinza, fontWeight: '600' },
  
  // HEADER
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 24, 
    paddingVertical: 20, 
    backgroundColor: PALETTE.branco, 
    borderBottomWidth: 1, 
    borderBottomColor: PALETTE.cinzaClaro 
  },
  backButton: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: PALETTE.preto },
  refreshButton: { width: 40, alignItems: 'flex-end' },
  
  // FILTROS RÁPIDOS
  filterContainer: { 
    backgroundColor: PALETTE.branco, 
    padding: 20, 
    marginHorizontal: 24, 
    marginTop: 24, 
    borderRadius: 16, 
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  filterLabel: { fontSize: 12, fontWeight: '700', color: PALETTE.cinza, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterRow: { flexDirection: 'row', gap: 12 },
  filterBtn: { 
    flex: 1, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    backgroundColor: PALETTE.verdeClaro, 
    padding: 14, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: PALETTE.cinzaClaro 
  },
  filterBtnActive: { backgroundColor: PALETTE.verdePrimario, borderColor: PALETTE.verdePrimario },
  filterBtnText: { fontSize: 13, fontWeight: '600', color: PALETTE.cinza },
  filterBtnTextActive: { color: PALETTE.branco, fontWeight: '700' },
  clearFilterBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 12, paddingVertical: 4 },
  clearFilterText: { fontSize: 12, fontWeight: '700', color: PALETTE.erro },

  // STATS GERAIS
  statsGeraisBox: { 
    marginHorizontal: 24, 
    marginTop: 20,
    marginBottom: 24, 
    backgroundColor: PALETTE.branco, 
    borderRadius: 16, 
    padding: 20, 
    borderLeftWidth: 4, 
    borderLeftColor: PALETTE.verdePrimario,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  statsGeraisHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, justifyContent: 'center' },
  statsGeraisTitle: { fontSize: 14, fontWeight: '800', color: PALETTE.preto, textTransform: 'uppercase', letterSpacing: 0.5 },
  statsGeraisContent: { alignItems: 'center' },
  statsGeraisValue: { fontSize: 36, fontWeight: '900', color: PALETTE.verdePrimario },
  statsGeraisLabel: { fontSize: 13, color: PALETTE.cinza, fontWeight: '600', marginTop: 4 },
  
  // STATS POR STATUS
  statsStatusContainer: { paddingHorizontal: 24, marginBottom: 24 },
  statsStatusTitle: { fontSize: 16, fontWeight: '800', color: PALETTE.preto, marginBottom: 16, letterSpacing: -0.5 },
  statsStatusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statBoxStatus: { 
    flex: 1, 
    minWidth: '47%', 
    backgroundColor: PALETTE.branco, 
    borderRadius: 16, 
    padding: 16, 
    borderTopWidth: 4, 
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  statBoxStatusLabel: { fontSize: 11, color: PALETTE.cinza, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  statBoxStatusValue: { fontSize: 22, fontWeight: '900' },

  // BUSCA AVANÇADA
  filtrosContainer: { paddingHorizontal: 24, marginBottom: 24 },
  filtrosHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  filtrosTitle: { fontSize: 13, fontWeight: '800', color: PALETTE.preto, textTransform: 'uppercase', letterSpacing: 0.5 },
  botaoToggleBusca: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: PALETTE.verdeCard, borderRadius: 8 },
  textoToggleBusca: { fontSize: 12, fontWeight: '700', color: PALETTE.verdePrimario },
  containerBusca: { backgroundColor: PALETTE.branco, borderRadius: 16, padding: 16, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 }, android: { elevation: 2 }}) },
  wrapperInputBusca: { position: 'relative', marginBottom: 12, justifyContent: 'center' },
  searchIconInside: { position: 'absolute', left: 16, zIndex: 1 },
  inputBuscaTexto: { height: 52, borderWidth: 1, borderColor: PALETTE.cinzaClaro, borderRadius: 12, paddingLeft: 44, paddingRight: 44, fontSize: 15, backgroundColor: PALETTE.verdeClaro, color: PALETTE.preto, fontWeight: '600' },
  botaoLimparBusca: { position: 'absolute', right: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: PALETTE.cinza, borderRadius: 12 },
  containerResultados: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: PALETTE.cinzaClaro },
  textoResultados: { fontSize: 12, color: PALETTE.cinza, fontWeight: '600' },
  botaoLimparTudo: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: PALETTE.terracota, borderRadius: 8 },
  textoLimparTudo: { fontSize: 11, color: PALETTE.branco, fontWeight: '700' },

  // LISTAGEM
  listSection: { paddingHorizontal: 24 },
  listHeader: { marginBottom: 16 },
  listTitle: { fontSize: 18, fontWeight: '800', color: PALETTE.preto, letterSpacing: -0.5 },
  listSubtitle: { fontSize: 13, color: PALETTE.cinza, marginTop: 4, fontWeight: '500' },
  
  // LEIRA CARD
  leiraCard: { 
    backgroundColor: PALETTE.branco, 
    borderRadius: 16, 
    padding: 20, 
    marginBottom: 16, 
    borderLeftWidth: 4,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  leiraCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  leiraCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  leiraCardIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  leiraCardInfo: { flex: 1 },
  leiraNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  leiraNumber: { fontSize: 16, fontWeight: '900', color: PALETTE.preto },
  loteBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  loteBadgeText: { fontSize: 10, fontWeight: '800' },
  leiraData: { fontSize: 12, color: PALETTE.cinza, fontWeight: '500' },
  leiraSubtitle: { fontSize: 11, color: PALETTE.cinza, marginTop: 2 },
  
  leiraStatusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  leiraStatusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  
  alertaRevolvimento: { flexDirection: 'row', backgroundColor: PALETTE.warningClaro, borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(234, 179, 8, 0.3)' },
  alertaContent: { flex: 1 },
  alertaTitle: { fontSize: 13, fontWeight: '800', color: PALETTE.preto, marginBottom: 2 },
  alertaText: { fontSize: 12, color: PALETTE.cinza, fontWeight: '500' },
  
  leiraCardDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: PALETTE.cinzaClaro },
  detailItem: { flex: 1, minWidth: '30%' },
  detailLabel: { fontSize: 10, color: PALETTE.cinza, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 14, fontWeight: '800', color: PALETTE.preto },
  
  temperaturaBox: { flexDirection: 'row', backgroundColor: PALETTE.verdeClaro, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: PALETTE.cinzaClaro },
  temperaturaItem: { flex: 1, alignItems: 'center' },
  temperaturaDivider: { width: 1, height: '100%', backgroundColor: PALETTE.cinzaClaro },
  temperaturaLabel: { fontSize: 11, color: PALETTE.cinza, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  temperaturaValue: { fontSize: 16, fontWeight: '900', color: PALETTE.verdePrimario },
  temperaturaAlta: { color: PALETTE.erro },
  
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 15, fontWeight: '700', color: PALETTE.preto, marginBottom: 6 },
  emptySubtext: { fontSize: 13, color: PALETTE.cinza, fontWeight: '500' },

  // MODAL
  modalOverlay: { flex: 1, backgroundColor: 'rgba(26, 43, 34, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: PALETTE.branco, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: PALETTE.preto },
  modalCloseBtn: { width: 32, height: 32, backgroundColor: PALETTE.verdeClaro, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: PALETTE.cinzaClaro, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalItemText: { fontSize: 16, color: PALETTE.preto, fontWeight: '600' },
});