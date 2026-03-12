import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { syncService } from '@/services/sync';

// ===== NOVO DESIGN SYSTEM (PALETA REFINADA) =====
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

export default function DashboardScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  // ===== STATES DE LEIRAS =====
  const [totalLeiras, setTotalLeiras] = useState(0);
  const [leirasProntas, setLeirasProntas] = useState(0);
  const [leirasEmProducao, setLeirasEmProducao] = useState(0);
  const [leirasFormadas, setLeirasFormadas] = useState(0);
  const [leirasSecando, setLeirasSecando] = useState(0);
  const [leirasCompostando, setLeirasCompostando] = useState(0);
  const [leirasMaturando, setLeirasMaturando] = useState(0);

  // ===== STATES DE SINCRONIZAÇÃO =====
  const [tamanhoFila, setTamanhoFila] = useState(0);
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState('');
  const [sincronizando, setSincronizando] = useState(false);

  // ===== FUNÇÃO DE CARREGAMENTO =====
  const carregarTotalLeiras = async () => {
    try {
      const leirasData = await AsyncStorage.getItem('leirasFormadas');
      if (leirasData) {
        const leiras = JSON.parse(leirasData);
        
        // 🔥 FILTRO: Apenas leiras que ESTÃO NO PÁTIO (ignora arquivada e finalizada)
        const leirasAtivas = leiras.filter((l: any) => {
          const status = l.status?.toLowerCase() || '';
          return !['arquivada', 'finalizada'].includes(status);
        });

        const formadas = leirasAtivas.filter((l: any) => l.status === 'formada').length;
        const secando = leirasAtivas.filter((l: any) => l.status === 'secando').length;
        const compostando = leirasAtivas.filter((l: any) => l.status === 'compostando').length;
        const maturando = leirasAtivas.filter((l: any) => l.status === 'maturando').length;
        const prontas = leirasAtivas.filter((l: any) => l.status === 'pronta').length;
        const emProducao = formadas + secando + compostando + maturando;

        setTotalLeiras(leirasAtivas.length);
        setLeirasProntas(prontas);
        setLeirasEmProducao(emProducao);
        setLeirasFormadas(formadas);
        setLeirasSecando(secando);
        setLeirasCompostando(compostando);
        setLeirasMaturando(maturando);
      } else {
        setTotalLeiras(0); setLeirasProntas(0); setLeirasEmProducao(0);
        setLeirasFormadas(0); setLeirasSecando(0); setLeirasCompostando(0); setLeirasMaturando(0);
      }

      // Status da Fila
      const tamanho = await syncService.obterTamanhoFila();
      setTamanhoFila(tamanho);

      // Última Sincronização
      const ultimoSync = await AsyncStorage.getItem('ultimaSincronizacao');
      setUltimaSincronizacao(ultimoSync || 'Nunca');

    } catch (error) {
      console.error('❌ Erro ao carregar dashboard:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      carregarTotalLeiras();
    }, [])
  );

  // ===== SINCRONIZAR MANUALMENTE (PUSH) =====
  const handleSincronizarAgora = async () => {
    try {
      setSincronizando(true);
      const sucesso = await syncService.sincronizar();
      if (sucesso) {
        Alert.alert('Sucesso', 'Dados enviados com sucesso!');
        const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setUltimaSincronizacao(agora);
        await AsyncStorage.setItem('ultimaSincronizacao', agora);
        await carregarTotalLeiras();
      } else {
        Alert.alert('Aviso', 'Não há itens para sincronizar ou ocorreu um erro na conexão');
      }
    } catch (error) {
      Alert.alert('Erro', 'Erro ao sincronizar dados');
    } finally {
      setSincronizando(false);
    }
  };

  // ===== RESTAURAR DADOS (PULL) =====
  const handleRestaurarDados = async () => {
    Alert.alert(
      'Baixar Dados',
      'Isso vai atualizar o celular com os dados mais recentes do servidor. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Baixar',
          onPress: async () => {
            try {
              setSincronizando(true);
              const sucesso = await syncService.restaurarDadosDoServidor();
              if (sucesso) {
                Alert.alert('Sucesso', 'Dados restaurados com sucesso!');
                await carregarTotalLeiras();
              } else {
                Alert.alert('Erro', 'Não foi possível baixar os dados. Verifique a internet.');
              }
            } catch (error) {
              Alert.alert('Erro', 'Falha na comunicação com o servidor.');
            } finally {
              setSincronizando(false);
            }
          }
        }
      ]
    );
  };

  // ===== FUNÇÕES DE RESET E LOGOUT =====
  const handleReset = () => {
    Alert.alert(
      '⚠️ ATENÇÃO: Limpar Dados', 
      'Isso vai deletar TODOS os dados locais. Essa ação NÃO pode ser desfeita. Tem certeza?', 
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deletar Tudo',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove([
              'materiaisRegistrados', 'leirasFormadas', 'leirasMonitoramento',
              'leirasClimatica', 'leirasEnriquecimentos', 'filaSync', 'ultimaSincronizacao', 'fila_sincronizacao'
            ]);
            Alert.alert('Sucesso', 'App resetado!');
            carregarTotalLeiras();
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Desconectar', 'Deseja sair do sistema?', [
      { text: 'Cancelar', style: 'cancel' },
      { 
        text: 'Sair', 
        style: 'destructive', 
        onPress: async () => {
          try {
            // 1. Remove o token de acesso
            await AsyncStorage.removeItem('userToken');
            
            // 2. Força o redirecionamento. 
            // Tente '/(auth)' primeiro. Se não for, mude para '/(auth)/login' ou '/'
            router.replace('/(auth)/login'); 
            
          } catch (error) {
            console.error('Erro ao fazer logout:', error);
            Alert.alert('Erro', 'Não foi possível desconectar. Tente novamente.');
          }
        } 
      },
    ]);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    carregarTotalLeiras();
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.greeting}>Pucci Ambiental</Text>
          <Text style={styles.appTitle}>Campos Solo</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={24} color={PALETTE.terracota} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={PALETTE.verdePrimario} />}
      >
        {/* ===== STATS CARDS ===== */}
        <View style={styles.statsContainer}>
          <StatCard
            icon="tractor"
            title="Total de Leiras"
            value={totalLeiras.toString()}
            color={PALETTE.branco}
            bgColor={PALETTE.verdePrimario}
          />
          <StatCard
            icon="check-decagram"
            title="Leiras Prontas"
            value={leirasProntas.toString()}
            color={PALETTE.branco}
            bgColor={PALETTE.sucesso}
          />
          <StatCard
            icon="progress-clock"
            title="Em Produção"
            value={leirasEmProducao.toString()}
            color={PALETTE.branco}
            bgColor={PALETTE.terracota}
          />
        </View>

        {/* ===== STATS DETALHADOS ===== */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalhes do Processo</Text>
          <View style={styles.detailsGrid}>
            <DetailCard icon="shape-outline" label="Formadas" value={leirasFormadas.toString()} color={PALETTE.terracota} />
            <DetailCard icon="weather-windy" label="Secando" value={leirasSecando.toString()} color={PALETTE.warning} />
            <DetailCard icon="recycle" label="Compostando" value={leirasCompostando.toString()} color={PALETTE.info} />
            <DetailCard icon="leaf" label="Maturando" value={leirasMaturando.toString()} color={PALETTE.verdePrimario} />
          </View>
        </View>

        {/* ===== SINCRONIZAÇÃO ===== */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sistema & Nuvem</Text>
          <View style={styles.syncCard}>
            <View style={styles.syncHeader}>
              <View style={[styles.syncIconBox, { backgroundColor: tamanhoFila > 0 ? PALETTE.warningClaro : PALETTE.cinzaClaro }]}>
                <MaterialCommunityIcons 
                  name={tamanhoFila > 0 ? "cloud-sync" : "cloud-check"} 
                  size={28} 
                  color={tamanhoFila > 0 ? PALETTE.verdePrimario : PALETTE.verdePrimario} 
                />
              </View>
              <View style={styles.syncInfo}>
                <Text style={styles.syncLabel}>Status da Fila</Text>
                <Text style={[styles.syncValue, tamanhoFila > 0 ? { color: PALETTE.warning } : { color: PALETTE.verdePrimario }]}>
                  {tamanhoFila > 0 ? `${tamanhoFila} registros pendentes` : 'Tudo sincronizado'}
                </Text>
              </View>
            </View>
            
            <View style={styles.syncButtonsRow}>
              <TouchableOpacity 
                style={[styles.btnSyncPush, sincronizando && styles.btnDisabled]} 
                onPress={handleSincronizarAgora} 
                disabled={sincronizando}
              >
                {sincronizando ? <ActivityIndicator size="small" color={PALETTE.branco} /> : <MaterialCommunityIcons name="cloud-upload" size={20} color={PALETTE.branco} />}
                <Text style={styles.btnSyncText}>Enviar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.btnSyncPull, sincronizando && styles.btnDisabled]} 
                onPress={handleRestaurarDados} 
                disabled={sincronizando}
              >
                {sincronizando ? <ActivityIndicator size="small" color={PALETTE.branco} /> : <MaterialCommunityIcons name="cloud-download" size={20} color={PALETTE.branco} />}
                <Text style={[styles.btnSyncText, { color: PALETTE.branco }]}>Baixar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.lastSyncDivider} />
            <Text style={styles.lastSyncText}>
              Última atualização: <Text style={{ fontWeight: '700', color: PALETTE.preto }}>{ultimaSincronizacao}</Text>
            </Text>
          </View>
        </View>

        {/* ===== QUICK ACTIONS ===== */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ações Operacionais</Text>
          <View style={styles.actionsGrid}>
            <ActionCard icon="truck-fast" title="Entrada" subtitle="Receber material" onPress={() => router.push('/(app)/entrada-material')} />
            <ActionCard icon="sprout" title="Nova Leira" subtitle="Formar leira" onPress={() => router.push('/(app)/nova-leira')} />
            <ActionCard icon="clipboard-text-outline" title="Monitorar" subtitle="Temperaturas" onPress={() => router.push('/(app)/selecionar-leira')} />
            <ActionCard icon="weather-partly-cloudy" title="Clima" subtitle="Registrar chuva" onPress={() => router.push('/(app)/monitorar-clima')} />
            <ActionCard icon="chart-pie" title="Relatórios" subtitle="Visão geral" onPress={() => router.push('/(app)/relatorios')} />
          </View>
        </View>

        {/* ===== DANGER ZONE ===== */}
        <View style={styles.dangerSection}>
          <TouchableOpacity style={styles.dangerCard} onPress={handleReset} activeOpacity={0.7}>
            <View style={styles.dangerIconBox}>
              <MaterialCommunityIcons name="database-remove" size={24} color={PALETTE.erro} />
            </View>
            <View style={styles.dangerTextCol}>
              <Text style={styles.dangerTitle}>Limpar Dados Locais</Text>
              <Text style={styles.dangerSubtitle}>Apaga todo o histórico do aparelho</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={PALETTE.erro} />
          </TouchableOpacity>
        </View>

        {/* ===== FOOTER ===== */}
        <View style={styles.footerInfo}>
          <Text style={styles.footerVersion}>Campos Solo v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ===== COMPONENTES AUXILIARES =====

function StatCard({ icon, title, value, color, bgColor }: any) {
  return (
    <View style={[styles.statCard, { backgroundColor: bgColor, borderColor: color }]}>
      <MaterialCommunityIcons name={icon} size={28} color={color} style={{ marginBottom: 8 }} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statTitle, { color }]}>{title}</Text>
    </View>
  );
}

function DetailCard({ icon, label, value, color }: any) {
  return (
    <View style={styles.detailCard}>
      <View style={[styles.detailIconBox, { backgroundColor: `${color}15` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.detailValue}>{value}</Text>
      <Text style={styles.detailLabel}>{label}</Text>
    </View>
  );
}

function ActionCard({ icon, title, subtitle, onPress }: any) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.actionIconBox}>
        <MaterialCommunityIcons name={icon} size={28} color={PALETTE.verdePrimario} />
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

// ===== ESTILOS =====
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.verdeClaro },
  scrollContent: { paddingBottom: 40 },
  
  // HEADER
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 24, 
    paddingTop: 20,
    paddingBottom: 24,
  },
  headerContent: { flex: 1 },
  greeting: { fontSize: 24, fontWeight: '900', color: PALETTE.preto, letterSpacing: -0.5 },
  appTitle: { fontSize: 14, color: PALETTE.cinza, fontWeight: '600', marginTop: 2 },
  logoutButton: { width: 44, height: 44, backgroundColor: PALETTE.branco, borderRadius: 22, justifyContent: 'center', alignItems: 'center', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 }, android: { elevation: 2 } }) },

  section: { paddingHorizontal: 24, marginBottom: 28 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: PALETTE.preto, marginBottom: 16, letterSpacing: -0.5 },

  // STATS PRINCIPAIS
  statsContainer: { flexDirection: 'row', paddingHorizontal: 24, marginBottom: 28, gap: 12 },
  statCard: { 
    flex: 1, 
    padding: 16, 
    borderRadius: 16, 
    borderWidth: 1,
    alignItems: 'center',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 }, android: { elevation: 2 } }) 
  },
  statValue: { fontSize: 24, fontWeight: '900', marginBottom: 4 },
  statTitle: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  // DETAILS GRID
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detailCard: { 
    width: '48%', 
    backgroundColor: PALETTE.branco, 
    borderRadius: 16, 
    padding: 16, 
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 }, android: { elevation: 2 } }) 
  },
  detailIconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  detailValue: { fontSize: 22, fontWeight: '900', color: PALETTE.preto, marginBottom: 2 },
  detailLabel: { fontSize: 12, fontWeight: '600', color: PALETTE.cinza },

  // SYNC CARD
  syncCard: {
    backgroundColor: PALETTE.branco,
    borderRadius: 16,
    padding: 20,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 3 } })
  },
  syncHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  syncIconBox: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  syncInfo: { flex: 1 },
  syncLabel: { fontSize: 13, fontWeight: '700', color: PALETTE.cinza, marginBottom: 2 },
  syncValue: { fontSize: 15, fontWeight: '800' },
  
  syncButtonsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  btnSyncPush: { flex: 1, flexDirection: 'row', backgroundColor: PALETTE.verdePrimario, paddingVertical: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnSyncPull: { flex: 1, flexDirection: 'row', backgroundColor: PALETTE.terracota, paddingVertical: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: PALETTE.terracotaClaro },
  btnSyncText: { fontSize: 14, fontWeight: '800', color: PALETTE.branco },
  btnDisabled: { opacity: 0.6 },
  
  lastSyncDivider: { height: 1, backgroundColor: PALETTE.cinzaClaro, marginBottom: 12 },
  lastSyncText: { fontSize: 12, color: PALETTE.cinza, textAlign: 'center' },

  // ACTION GRID
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { 
    width: '48%', 
    backgroundColor: PALETTE.branco, 
    borderRadius: 16, 
    padding: 16, 
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 }, android: { elevation: 2 } }) 
  },
  actionIconBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: PALETTE.verdeClaro, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  actionTitle: { fontSize: 14, fontWeight: '800', color: PALETTE.preto, marginBottom: 2 },
  actionSubtitle: { fontSize: 11, fontWeight: '600', color: PALETTE.cinza },

  // DANGER ZONE
  dangerSection: { paddingHorizontal: 24, marginTop: 10, marginBottom: 20 },
  dangerCard: {
    flexDirection: 'row',
    backgroundColor: PALETTE.erroClaro,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(220, 53, 69, 0.2)',
  },
  dangerIconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(220, 53, 69, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  dangerTextCol: { flex: 1 },
  dangerTitle: { fontSize: 14, fontWeight: '800', color: PALETTE.erro, marginBottom: 2 },
  dangerSubtitle: { fontSize: 12, fontWeight: '500', color: PALETTE.erro, opacity: 0.8 },

  // FOOTER
  footerInfo: { alignItems: 'center', marginTop: 10 },
  footerVersion: { fontSize: 12, fontWeight: '600', color: PALETTE.cinza, opacity: 0.7 },
});