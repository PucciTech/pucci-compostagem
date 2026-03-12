import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
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
};

interface Leira {
  id: string;
  numeroLeira: number;
  lote: string;
  dataFormacao: string;
  status: string;
  totalBiossólido: number;
  biossólidos: any[];
  bagaço: number;
  monitoramentosCount?: number;
}

export default function SelecionarLeiraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [leiras, setLeiras] = useState<Leira[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ===== FILTROS EM CASCATA =====
  const [searchText, setSearchText] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedAno, setSelectedAno] = useState<string | null>(null);
  const [selectedLote, setSelectedLote] = useState<string | null>(null);
  const [selectedNumero, setSelectedNumero] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      carregarLeiras();
    }, [])
  );
    const carregarLeiras = async () => {
    try {
      setLoading(true);
      const leirasData = await AsyncStorage.getItem('leirasFormadas');
      const leirasArray = leirasData ? JSON.parse(leirasData) : [];

      // 🔥 FILTRO: Apenas leiras no pátio (ignorar pronta, finalizada, arquivada)
      const leirasAtivas = leirasArray.filter((l: Leira) => {
        const status = l.status?.toLowerCase() || '';
        return !['pronta', 'finalizada', 'arquivada'].includes(status);
      });

      const monitoramentosData = await AsyncStorage.getItem('leirasMonitoramento');
      const monitoramentosArray = monitoramentosData ? JSON.parse(monitoramentosData) : [];

      const leirasComContagem = leirasAtivas.map((leira: Leira) => ({
        ...leira,
        monitoramentosCount: monitoramentosArray.filter(
          (m: any) => m.leiraId === leira.id
        ).length,
      }));

      setLeiras(leirasComContagem);
    } catch (error) {
      console.error('❌ Erro ao carregar leiras:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    carregarLeiras();
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  // ===== EXTRAIR ANOS ÚNICOS =====
  const anosUnicos = useMemo(() => {
    const anos = new Set<string>();
    leiras.forEach((l) => {
      if (l.lote && l.lote.includes('/')) {
        anos.add(l.lote.split('/')[1]); // Pega a parte do ano (ex: "2025" de "01/2025")
      }
    });
    // Ordena do mais recente para o mais antigo
    return Array.from(anos).sort((a, b) => b.localeCompare(a));
  }, [leiras]);

  // ===== EXTRAIR LOTES ÚNICOS DO ANO SELECIONADO =====
  const lotesDoAno = useMemo(() => {
    if (!selectedAno) return [];
    const lotes = new Set<string>();
    leiras.forEach((l) => {
      if (l.lote && l.lote.endsWith(`/${selectedAno}`)) {
        lotes.add(l.lote);
      }
    });
    return Array.from(lotes).sort();
  }, [leiras, selectedAno]);

  // ===== EXTRAIR NÚMEROS ÚNICOS DO LOTE SELECIONADO =====
  const numerosUnicos = useMemo(() => {
    if (!selectedLote) return [];
    const numeros = leiras
      .filter((l) => l.lote === selectedLote)
      .map((l) => l.numeroLeira)
      .sort((a, b) => a - b);
    return numeros;
  }, [leiras, selectedLote]);

  // ===== EXTRAIR STATUS ÚNICOS =====
  const statusUnicos = useMemo(() => {
    const status = [...new Set(leiras.map((l) => l.status))];
    return status;
  }, [leiras]);

  // ===== FILTRAR LEIRAS =====
  const leirasFiltradas = useMemo(() => {
    return leiras.filter((leira) => {
      // Busca Textual
      if (searchText.trim()) {
        const search = searchText.toLowerCase();
        const matchLote = leira.lote.toLowerCase().includes(search);
        const matchNumero = leira.numeroLeira.toString().includes(search);
        if (!matchLote && !matchNumero) return false;
      }
      
      // Filtro por Ano
      if (selectedAno && !leira.lote.endsWith(`/${selectedAno}`)) return false;
      
      // Filtro por Lote
      if (selectedLote && leira.lote !== selectedLote) return false;
      
      // Filtro por Número
      if (selectedNumero && leira.numeroLeira !== selectedNumero) return false;
      
      // Filtro por Status
      if (selectedStatus && leira.status !== selectedStatus) return false;
      
      return true;
    });
  }, [leiras, searchText, selectedAno, selectedLote, selectedNumero, selectedStatus]);

  // ===== LIMPAR FILTROS =====
  const limparFiltros = () => {
    setSearchText('');
    setSelectedAno(null);
    setSelectedLote(null);
    setSelectedNumero(null);
    setSelectedStatus(null);
  };

  const temFiltrosAtivos = !!(searchText || selectedAno || selectedLote || selectedNumero || selectedStatus);

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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PALETTE.verdePrimario} />
          <Text style={styles.loadingText}>Carregando leiras...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (leiras.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={PALETTE.preto} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Monitorar Leira</Text>
          <View style={styles.backButton} />
        </View>

        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="tractor" size={64} color={PALETTE.cinzaClaro} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyText}>Nenhuma leira cadastrada</Text>
          <Text style={styles.emptySubtext}>Crie uma leira em "Nova Leira"</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Monitorar Leira</Text>
        <View style={styles.backButton} />
      </View>

      {/* ===== SEARCH BAR ===== */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color={PALETTE.cinza} style={styles.searchIcon} />
          <RNTextInput
            style={styles.searchInput}
            placeholder="Buscar por lote ou número..."
            placeholderTextColor={PALETTE.cinza}
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText ? (
            <TouchableOpacity onPress={() => setSearchText('')} style={styles.searchClearBtn}>
              <MaterialCommunityIcons name="close" size={16} color={PALETTE.branco} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.filterButton, temFiltrosAtivos ? styles.filterButtonActive : null]}
          onPress={() => setShowFilterModal(true)}
        >
          <MaterialCommunityIcons 
            name="tune-variant" 
            size={22} 
            color={temFiltrosAtivos ? PALETTE.branco : PALETTE.verdePrimario} 
          />
          {temFiltrosAtivos ? <View style={styles.filterBadge} /> : null}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={PALETTE.verdePrimario}
          />
        }
      >
        {/* ===== FILTROS ATIVOS ===== */}
        {temFiltrosAtivos && (
          <View style={styles.filtrosAtivosBox}>
            <View style={styles.filtrosAtivosContent}>
              <Text style={styles.filtrosAtivosText}>
                Exibindo <Text style={{fontWeight: '800'}}>{leirasFiltradas.length}</Text> resultado(s)
              </Text>
              <TouchableOpacity onPress={limparFiltros} style={styles.limparFiltrosBtn}>
                <MaterialCommunityIcons name="filter-remove-outline" size={16} color={PALETTE.terracota} style={{marginRight: 4}} />
                <Text style={styles.limparFiltrosText}>Limpar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ===== LEIRAS FILTRADAS ===== */}
        {leirasFiltradas.length === 0 ? (
          <View style={styles.emptyFilterContainer}>
            <MaterialCommunityIcons name="text-search" size={48} color={PALETTE.cinzaClaro} style={{ marginBottom: 16 }} />
            <Text style={styles.emptyFilterText}>Nenhuma leira encontrada</Text>
            <Text style={styles.emptyFilterSubtext}>
              {searchText ? 'Tente ajustar sua busca' : 'Tente ajustar os filtros'}
            </Text>
          </View>
        ) : (
          <View style={styles.leirasContainer}>
            {leirasFiltradas.map((leira) => {
              const statusColor = getStatusColor(leira.status);
              
              return (
                <TouchableOpacity
                  key={leira.id}
                  style={[styles.leiraCard, { borderLeftColor: statusColor }]}
                  activeOpacity={0.8}
                  onPress={() => {
                    router.push({
                      pathname: '/(app)/detalhes-leira',
                      params: { leiraId: leira.id },
                    });
                  }}
                >
                  <View style={styles.leiraCardHeader}>
                    <View style={styles.leiraTitleRow}>
                      <Text style={styles.leiraNumber}>Leira #{leira.numeroLeira}</Text>
                      <View style={[styles.loteBadge, { backgroundColor: `${PALETTE.terracota}15` }]}>
                        <MaterialCommunityIcons name="tag" size={12} color={PALETTE.terracota} style={{marginRight: 4}} />
                        <Text style={styles.leireLote}>Lote {leira.lote}</Text>
                      </View>
                    </View>
                    
                    <View style={[styles.leiraCardStatus, { backgroundColor: `${statusColor}15` }]}>
                      <MaterialCommunityIcons name={getStatusIcon(leira.status)} size={14} color={statusColor} style={{marginRight: 4}} />
                      <Text style={[styles.leiraCardStatusText, { color: statusColor }]}>{getStatusLabel(leira.status)}</Text>
                    </View>
                  </View>

                  <View style={styles.leiraCardMetrics}>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Formação</Text>
                      <Text style={styles.metricValue}>{leira.dataFormacao}</Text>
                    </View>

                    <View style={styles.metricDivider} />

                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Dias</Text>
                      <Text style={styles.metricValue}>{getDiasPassados(leira.dataFormacao)}</Text>
                    </View>

                    <View style={styles.metricDivider} />

                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Total</Text>
                      <Text style={styles.metricValue}>
                        {(leira.totalBiossólido + 12).toFixed(0)} <Text style={{fontSize: 10}}>ton</Text>
                      </Text>
                    </View>

                    <View style={styles.metricDivider} />

                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Monit.</Text>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <MaterialCommunityIcons name="clipboard-text-outline" size={12} color={PALETTE.cinza} style={{marginRight: 2}} />
                        <Text style={styles.metricValue}>{leira.monitoramentosCount || 0}</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ===== MODAL DE FILTROS CASCATA ===== */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtros Avançados</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color={PALETTE.cinza} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              
              {/* FILTRO 1: ANO */}
              <View style={styles.modalFilterGroup}>
                <View style={styles.modalFilterLabelRow}>
                  <MaterialCommunityIcons name="calendar" size={18} color={PALETTE.verdePrimario} />
                  <Text style={styles.modalFilterLabel}>Ano da Formação</Text>
                </View>
                <View style={styles.modalFilterOptions}>
                  <TouchableOpacity
                    style={[styles.modalFilterBtn, !selectedAno && styles.modalFilterBtnActive]}
                    onPress={() => { 
                      setSelectedAno(null); 
                      setSelectedLote(null); 
                      setSelectedNumero(null); 
                    }}
                  >
                    <Text style={[styles.modalFilterBtnText, !selectedAno && styles.modalFilterBtnTextActive]}>
                      Todos os Anos
                    </Text>
                  </TouchableOpacity>

                  {anosUnicos.map((ano) => (
                    <TouchableOpacity
                      key={ano}
                      style={[styles.modalFilterBtn, selectedAno === ano && styles.modalFilterBtnActive]}
                      onPress={() => { 
                        setSelectedAno(ano); 
                        setSelectedLote(null); 
                        setSelectedNumero(null); 
                      }}
                    >
                      <Text style={[styles.modalFilterBtnText, selectedAno === ano && styles.modalFilterBtnTextActive]}>
                        {ano}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* FILTRO 2: LOTE (Só aparece se um ano for selecionado) */}
              {selectedAno && lotesDoAno.length > 0 && (
                <View style={styles.modalFilterGroup}>
                  <View style={styles.modalFilterLabelRow}>
                    <MaterialCommunityIcons name="calendar-month" size={18} color={PALETTE.verdePrimario} />
                    <Text style={styles.modalFilterLabel}>Lote ({selectedAno})</Text>
                  </View>
                  <View style={styles.modalFilterOptions}>
                    <TouchableOpacity
                      style={[styles.modalFilterBtn, !selectedLote && styles.modalFilterBtnActive]}
                      onPress={() => { setSelectedLote(null); setSelectedNumero(null); }}
                    >
                      <Text style={[styles.modalFilterBtnText, !selectedLote && styles.modalFilterBtnTextActive]}>
                        Todos os Lotes
                      </Text>
                    </TouchableOpacity>

                    {lotesDoAno.map((lote) => {
                      const mes = lote.split('/')[0]; // Pega apenas o mês (ex: 01)
                      return (
                        <TouchableOpacity
                          key={lote}
                          style={[styles.modalFilterBtn, selectedLote === lote && styles.modalFilterBtnActive]}
                          onPress={() => { setSelectedLote(lote); setSelectedNumero(null); }}
                        >
                          <Text style={[styles.modalFilterBtnText, selectedLote === lote && styles.modalFilterBtnTextActive]}>
                            Lote {mes}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* FILTRO 3: NÚMERO DA LEIRA (Só aparece se um lote for selecionado) */}
              {selectedLote && numerosUnicos.length > 0 && (
                <View style={styles.modalFilterGroup}>
                  <View style={styles.modalFilterLabelRow}>
                    <MaterialCommunityIcons name="sprout" size={18} color={PALETTE.verdePrimario} />
                    <Text style={styles.modalFilterLabel}>Número da Leira</Text>
                  </View>
                  <View style={styles.modalFilterOptions}>
                    <TouchableOpacity
                      style={[styles.modalFilterBtn, !selectedNumero && styles.modalFilterBtnActive]}
                      onPress={() => setSelectedNumero(null)}
                    >
                      <Text style={[styles.modalFilterBtnText, !selectedNumero && styles.modalFilterBtnTextActive]}>
                        Todas
                      </Text>
                    </TouchableOpacity>

                    {numerosUnicos.map((numero) => (
                      <TouchableOpacity
                        key={numero}
                        style={[styles.modalFilterBtn, selectedNumero === numero && styles.modalFilterBtnActive]}
                        onPress={() => setSelectedNumero(numero)}
                      >
                        <Text style={[styles.modalFilterBtnText, selectedNumero === numero && styles.modalFilterBtnTextActive]}>
                          #{numero}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* FILTRO 4: STATUS */}
              <View style={styles.modalFilterGroup}>
                <View style={styles.modalFilterLabelRow}>
                  <MaterialCommunityIcons name="chart-pie" size={18} color={PALETTE.verdePrimario} />
                  <Text style={styles.modalFilterLabel}>Status Operacional</Text>
                </View>
                <View style={styles.modalFilterOptions}>
                  <TouchableOpacity
                    style={[styles.modalFilterBtn, !selectedStatus && styles.modalFilterBtnActive]}
                    onPress={() => setSelectedStatus(null)}
                  >
                    <Text style={[styles.modalFilterBtnText, !selectedStatus && styles.modalFilterBtnTextActive]}>
                      Todos
                    </Text>
                  </TouchableOpacity>

                  {statusUnicos.map((status) => {
                    return (
                      <TouchableOpacity
                        key={status}
                        style={[styles.modalFilterBtn, selectedStatus === status && styles.modalFilterBtnActive]}
                        onPress={() => setSelectedStatus(status)}
                      >
                        <Text style={[styles.modalFilterBtnText, selectedStatus === status && styles.modalFilterBtnTextActive]}>
                          {getStatusLabel(status)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalLimparBtn} onPress={limparFiltros}>
                <Text style={styles.modalLimparBtnText}>Limpar Tudo</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalAplicarBtn} onPress={() => setShowFilterModal(false)}>
                <Text style={styles.modalAplicarBtnText}>Aplicar Filtros</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ===== ESTILOS PADRONIZADOS =====
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.verdeClaro },
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
  
  // SEARCH BAR
  searchSection: { 
    flexDirection: 'row', 
    paddingHorizontal: 24, 
    paddingVertical: 16, 
    backgroundColor: PALETTE.branco, 
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.cinzaClaro,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  searchBox: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: PALETTE.verdeClaro, 
    borderRadius: 12, 
    paddingHorizontal: 16, 
    height: 48,
    borderWidth: 1,
    borderColor: PALETTE.cinzaClaro
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, color: PALETTE.preto, fontWeight: '500' },
  searchClearBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: PALETTE.cinza, justifyContent: 'center', alignItems: 'center' },
  
  filterButton: { 
    width: 48, 
    height: 48, 
    backgroundColor: PALETTE.verdeClaro, 
    borderRadius: 12, 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PALETTE.cinzaClaro
  },
  filterButtonActive: {
    backgroundColor: PALETTE.verdePrimario,
    borderColor: PALETTE.verdePrimario
  },
  filterBadge: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: PALETTE.terracota, borderWidth: 1, borderColor: PALETTE.branco },

  scrollContent: { paddingBottom: 40 },
  
  // FILTROS ATIVOS
  filtrosAtivosBox: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  filtrosAtivosContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: PALETTE.verdeCard, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: PALETTE.verdePrimario },
  filtrosAtivosText: { fontSize: 13, color: PALETTE.verdePrimario, fontWeight: '600' },
  limparFiltrosBtn: { flexDirection: 'row', alignItems: 'center' },
  limparFiltrosText: { fontSize: 12, color: PALETTE.terracota, fontWeight: '700' },

  // LISTAGEM
  leirasContainer: { paddingHorizontal: 24, paddingTop: 16 },
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
  leiraTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  leiraNumber: { fontSize: 18, fontWeight: '900', color: PALETTE.preto },
  loteBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  leireLote: { fontSize: 11, fontWeight: '800', color: PALETTE.terracota },
  
  leiraCardStatus: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  leiraCardStatusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  
  leiraCardMetrics: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: PALETTE.cinzaClaro },
  metricItem: { flex: 1, alignItems: 'center' },
  metricDivider: { width: 1, height: 24, backgroundColor: PALETTE.cinzaClaro },
  metricLabel: { fontSize: 10, color: PALETTE.cinza, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontSize: 14, fontWeight: '800', color: PALETTE.preto },

  // EMPTY STATES
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 18, fontWeight: '800', color: PALETTE.preto, marginBottom: 8, textAlign: 'center' },
  emptySubtext: { fontSize: 14, color: PALETTE.cinza, textAlign: 'center', fontWeight: '500' },
  
  emptyFilterContainer: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyFilterText: { fontSize: 16, fontWeight: '800', color: PALETTE.preto, marginBottom: 8, marginTop: 16 },
  emptyFilterSubtext: { fontSize: 14, color: PALETTE.cinza, fontWeight: '500' },

  // MODAL
  modalOverlay: { flex: 1, backgroundColor: 'rgba(26, 43, 34, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: PALETTE.branco, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: PALETTE.preto },
  modalCloseBtn: { width: 36, height: 36, backgroundColor: PALETTE.verdeClaro, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  
  modalFilterGroup: { marginBottom: 24 },
  modalFilterLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  modalFilterLabel: { fontSize: 14, fontWeight: '800', color: PALETTE.preto, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalFilterOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  modalFilterBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: PALETTE.verdeClaro, borderWidth: 1, borderColor: PALETTE.cinzaClaro },
  modalFilterBtnActive: { backgroundColor: `${PALETTE.verdePrimario}15`, borderColor: PALETTE.verdePrimario, borderWidth: 1.5 },
  modalFilterBtnText: { fontSize: 13, color: PALETTE.cinza, fontWeight: '600' },
  modalFilterBtnTextActive: { color: PALETTE.verdePrimario, fontWeight: '800' },
  
  modalFooter: { flexDirection: 'row', gap: 12, marginTop: 10, paddingTop: 20, borderTopWidth: 1, borderTopColor: PALETTE.cinzaClaro },
  modalLimparBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: PALETTE.verdeClaro, alignItems: 'center', borderWidth: 1, borderColor: PALETTE.cinzaClaro },
  modalLimparBtnText: { color: PALETTE.cinza, fontWeight: '700', fontSize: 15 },
  modalAplicarBtn: { flex: 2, paddingVertical: 16, borderRadius: 14, backgroundColor: PALETTE.verdePrimario, alignItems: 'center' },
  modalAplicarBtnText: { color: PALETTE.branco, fontWeight: '700', fontSize: 15 },
});