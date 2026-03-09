import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { authService } from '@/services/auth';
import { syncService } from '@/services/sync'; // ✅ Importação atualizada
import AsyncStorage from '@react-native-async-storage/async-storage';

const PALETTE = {
  verdePrimario: '#5D7261',
  verdeClaro: '#F0F5F0',
  verdeClaro2: '#E8F0E8',
  verdeHover: '#4F6154',
  verdeSuave: '#7A8A7E',
  terracota: '#B16338',
  terracotaClaro: '#F5E8E0',
  branco: '#FFFFFF',
  preto: '#1A1A1A',
  cinza: '#666666',
  cinzaClaro: '#EEEEEE',
  cinzaClaro2: '#F5F5F5',
  erro: '#D32F2F',
  sucesso: '#4CAF50',
  warning: '#FF9800',
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
      console.log('🔄 Carregando estatísticas do dashboard...');

      const leirasData = await AsyncStorage.getItem('leirasFormadas');
      if (leirasData) {
        const leiras = JSON.parse(leirasData);
        console.log(`📊 Total de leiras encontradas: ${leiras.length}`);

        // Calcular estatísticas por status
        const formadas = leiras.filter((l: any) => l.status === 'formada').length;
        const secando = leiras.filter((l: any) => l.status === 'secando').length;
        const compostando = leiras.filter((l: any) => l.status === 'compostando').length;
        const maturando = leiras.filter((l: any) => l.status === 'maturando').length;
        const prontas = leiras.filter((l: any) => l.status === 'pronta').length;

        // Leiras em produção (formação até maturação)
        const emProducao = formadas + secando + compostando + maturando;

        // Atualizar todos os estados
        setTotalLeiras(leiras.length);
        setLeirasProntas(prontas);
        setLeirasEmProducao(emProducao);
        setLeirasFormadas(formadas);
        setLeirasSecando(secando);
        setLeirasCompostando(compostando);
        setLeirasMaturando(maturando);

        console.log('✅ Estatísticas carregadas:');
        console.log(`   📊 Total: ${leiras.length}`);
        console.log(`   ✅ Prontas para Venda: ${prontas}`);
        console.log(`   🔄 Em Produção: ${emProducao}`);
      } else {
        console.log('📭 Nenhuma leira encontrada no AsyncStorage');
        // Reset todos os valores
        setTotalLeiras(0);
        setLeirasProntas(0);
        setLeirasEmProducao(0);
        setLeirasFormadas(0);
        setLeirasSecando(0);
        setLeirasCompostando(0);
        setLeirasMaturando(0);
      }

      // ===== CARREGAR TAMANHO DA FILA =====
      const tamanho = await syncService.obterTamanhoFila(); // ✅ Atualizado
      setTamanhoFila(tamanho);
      console.log(`📦 Fila de sincronização: ${tamanho} itens`);

      // ===== CARREGAR ÚLTIMA SINCRONIZAÇÃO =====
      const ultimoSync = await AsyncStorage.getItem('ultimaSincronizacao');
      if (ultimoSync) {
        setUltimaSincronizacao(ultimoSync);
      } else {
        setUltimaSincronizacao('Nunca');
      }
    } catch (error) {
      console.error('❌ Erro ao carregar dashboard:', error);
    }
  };

  // ===== CARREGA DADOS AO FOCAR NA TELA =====
  useFocusEffect(
    React.useCallback(() => {
      carregarTotalLeiras();
    }, [])
  );

  // ===== SINCRONIZAR MANUALMENTE (PUSH) =====
  const handleSincronizarAgora = async () => {
    try {
      setSincronizando(true);
      console.log('🔄 Sincronizando manualmente...');

      const sucesso = await syncService.sincronizar(); // ✅ Atualizado

      if (sucesso) {
        Alert.alert('✅ Sucesso', 'Dados sincronizados com sucesso!');

        // Atualizar timestamp
        const agora = new Date().toLocaleTimeString('pt-BR');
        setUltimaSincronizacao(agora);
        await AsyncStorage.setItem('ultimaSincronizacao', agora);

        // Recarregar dados
        await carregarTotalLeiras();
      } else {
        Alert.alert('⚠️ Aviso', 'Não há itens para sincronizar ou ocorreu um erro na conexão');
      }
    } catch (error) {
      console.error('❌ Erro ao sincronizar:', error);
      Alert.alert('❌ Erro', 'Erro ao sincronizar dados');
    } finally {
      setSincronizando(false);
    }
  };

  // ===== RESTAURAR DADOS (PULL) =====
  const handleRestaurarDados = async () => {
    Alert.alert(
      '📥 Baixar Dados',
      'Isso vai puxar todo o histórico do servidor para este celular. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Baixar',
          onPress: async () => {
            try {
              setSincronizando(true);
              console.log('📥 Iniciando download de dados...');
              
              const sucesso = await syncService.restaurarDadosDoServidor();
              
              if (sucesso) {
                Alert.alert('✅ Sucesso', 'Todos os dados foram restaurados!');
                await carregarTotalLeiras(); // Atualiza a tela na hora
              } else {
                Alert.alert('❌ Erro', 'Não foi possível baixar os dados. Verifique a internet.');
              }
            } catch (error) {
              Alert.alert('❌ Erro', 'Falha na comunicação com o servidor.');
            } finally {
              setSincronizando(false);
            }
          }
        }
      ]
    );
  };

  // ===== FUNÇÃO DE RESET =====
  const handleReset = () => {
    Alert.alert(
      '⚠️ Resetar App',
      'Isso vai deletar TODOS os dados locais. Tem certeza?',
      [
        {
          text: 'Cancelar',
          onPress: () => { },
          style: 'cancel',
        },
        {
          text: 'Deletar Tudo',
          onPress: async () => {
            try {
              console.log('🗑️ Limpando dados...');

              await AsyncStorage.removeItem('materiaisRegistrados');
              await AsyncStorage.removeItem('leirasFormadas');
              await AsyncStorage.removeItem('leirasMonitoramento');
              await AsyncStorage.removeItem('leirasClimatica');
              await AsyncStorage.removeItem('leirasEnriquecimentos');
              await AsyncStorage.removeItem('filaSync');
              await AsyncStorage.removeItem('ultimaSincronizacao');

              console.log('✅ Dados deletados com sucesso!');
              Alert.alert('Sucesso', 'App resetado! Reinicie o app para ver as mudanças.');

              // Recarregar a tela
              carregarTotalLeiras();
            } catch (error) {
              console.error('❌ Erro ao resetar:', error);
              Alert.alert('Erro', 'Falha ao resetar dados');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  // ===== FUNÇÃO DE LOGOUT =====
  const handleLogout = () => {
    Alert.alert(
      'Desconectar',
      'Tem certeza que deseja sair do sistema?',
      [
        {
          text: 'Cancelar',
          onPress: () => { },
          style: 'cancel',
        },
        {
          text: 'Sair',
          onPress: async () => {
            try {
              router.replace('/(auth)/login');
            } catch (error) {
              Alert.alert('Erro', 'Erro ao desconectar');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  // ===== FUNÇÃO DE REFRESH =====
  const handleRefresh = () => {
    setRefreshing(true);
    carregarTotalLeiras();
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={PALETTE.verdePrimario}
            title="Atualizando..."
            titleColor={PALETTE.verdePrimario}
          />
        }
      >
        {/* ===== HEADER ===== */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.greeting}>Bem-vindo 👋</Text>
            <Text style={styles.appTitle}>Campos Solo</Text>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutIcon}>🚪</Text>
          </TouchableOpacity>
        </View>

        {/* ===== STATS CARDS ===== */}
        <View style={styles.statsContainer}>
          <StatCard
            icon="🌱"
            title="Total de Leiras"
            value={totalLeiras.toString()}
            color={PALETTE.verdePrimario}
          />
          <StatCard
            icon="✅"
            title="Leiras Prontas"
            value={leirasProntas.toString()}
            color={PALETTE.sucesso}
          />
          <StatCard
            icon="🔄"
            title="Em Produção"
            value={leirasEmProducao.toString()}
            color={PALETTE.warning}
          />
        </View>

        {/* ===== STATS DETALHADOS ===== */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalhes das Leiras</Text>
          <View style={styles.detailsGrid}>
            <DetailCard
              icon="📦"
              label="Formadas"
              value={leirasFormadas.toString()}
              color={PALETTE.cinza}
            />
            <DetailCard
              icon="💨"
              label="Secando"
              value={leirasSecando.toString()}
              color="#FF9800"
            />
            <DetailCard
              icon="🔄"
              label="Compostando"
              value={leirasCompostando.toString()}
              color="#2196F3"
            />
            <DetailCard
              icon="🌱"
              label="Maturando"
              value={leirasMaturando.toString()}
              color="#8BC34A"
            />
          </View>
        </View>

        {/* ===== SINCRONIZAÇÃO ===== */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sincronização</Text>
          <View style={styles.syncCard}>
            <View style={styles.syncInfo}>
              <Text style={styles.syncLabel}>Fila de Sincronização:</Text>
              <Text style={styles.syncValue}>
                {tamanhoFila > 0 ? `${tamanhoFila} itens pendentes` : '✅ Tudo sincronizado'}
              </Text>
            </View>
            
            {/* Botão de Enviar (Push) */}
            <TouchableOpacity
              style={[styles.syncButton, sincronizando && styles.syncButtonDisabled]}
              onPress={handleSincronizarAgora}
              disabled={sincronizando}
            >
              <Text style={styles.syncButtonText}>
                {sincronizando ? '⏳ Processando...' : '📤 Enviar para Servidor'}
              </Text>
            </TouchableOpacity>

            {/* ✅ NOVO: Botão de Baixar (Pull) */}
            <TouchableOpacity
              style={[styles.pullButton, sincronizando && styles.syncButtonDisabled]}
              onPress={handleRestaurarDados}
              disabled={sincronizando}
            >
              <Text style={styles.pullButtonText}>
                📥 Baixar do Servidor (Restore)
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.lastSyncCard}>
            <Text style={styles.lastSyncLabel}>Última Sincronização:</Text>
            <Text style={styles.lastSyncTime}>{ultimaSincronizacao}</Text>
          </View>
        </View>

        {/* ===== QUICK ACTIONS ===== */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ações Rápidas</Text>
          <View style={styles.actionsGrid}>
            <ActionCard
              icon="🚚"
              title="Entrada de Material"
              onPress={() => router.push('/(app)/entrada-material')}
            />
            <ActionCard
              icon="🌱"
              title="Nova Leira"
              onPress={() => router.push('/(app)/nova-leira')}
            />
            <ActionCard
              icon="📊"
              title="Relatório"
              onPress={() => router.push('/(app)/relatorios')}
            />
            <ActionCard
              icon="📋"
              title="Monitoramento"
              onPress={() => router.push('/(app)/selecionar-leira')}
            />
            <ActionCard
              icon="🌧️"
              title="Clima"
              onPress={() => router.push('/(app)/monitorar-clima')}
            />
          </View>
        </View>

        {/* ===== BOTÕES PERIGOSOS (RESET + LOGOUT) ===== */}
        <View style={styles.dangerSection}>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <Text style={styles.resetButtonText}>🗑️ Resetar App</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButtonFull}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Text style={styles.logoutButtonText}>🚪 Sair</Text>
          </TouchableOpacity>
        </View>

        {/* ===== FOOTER INFO ===== */}
        <View style={styles.footerInfo}>
          <Text style={styles.footerVersion}>v1.0.0 • Campos Solo</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ===== COMPONENTE: STAT CARD =====
interface StatCardProps {
  icon: string;
  title: string;
  value: string;
  color: string;
}

function StatCard({ icon, title, value, color }: StatCardProps) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={styles.statIcon}>{icon}</Text>
      <View style={styles.statContent}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statTitle}>{title}</Text>
      </View>
    </View>
  );
}

// ===== COMPONENTE: DETAIL CARD =====
interface DetailCardProps {
  icon: string;
  label: string;
  value: string;
  color: string;
}

function DetailCard({ icon, label, value, color }: DetailCardProps) {
  return (
    <View style={styles.detailCard}>
      <Text style={styles.detailIcon}>{icon}</Text>
      <Text style={styles.detailValue}>{value}</Text>
      <Text style={[styles.detailLabel, { color }]}>{label}</Text>
    </View>
  );
}

// ===== COMPONENTE: ACTION CARD =====
interface ActionCardProps {
  icon: string;
  title: string;
  onPress: () => void;
}

function ActionCard({ icon, title, onPress }: ActionCardProps) {
  return (
    <TouchableOpacity
      style={styles.actionCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.actionIconBox}>
        <Text style={styles.actionIcon}>{icon}</Text>
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
    </TouchableOpacity>
  );
}

// ===== ESTILOS =====
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.verdeClaro,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 30,
  },

  // ===== HEADER =====
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: PALETTE.branco,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.cinzaClaro2,
  },
  headerContent: {
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    color: PALETTE.cinza,
    fontWeight: '500',
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: PALETTE.verdePrimario,
    marginTop: 4,
  },
  logoutButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: PALETTE.cinzaClaro2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutIcon: {
    fontSize: 20,
  },

  // ===== STATS =====
  statsContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.branco,
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  statIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  statContent: {
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: PALETTE.preto,
  },
  statTitle: {
    fontSize: 12,
    color: PALETTE.cinza,
    fontWeight: '500',
    marginTop: 2,
  },

  // ===== SECTIONS =====
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PALETTE.preto,
    marginBottom: 12,
  },

  // ===== DETAIL CARDS =====
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  detailCard: {
    width: '48%',
    backgroundColor: PALETTE.branco,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  detailIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 20,
    fontWeight: '700',
    color: PALETTE.preto,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },

  // ===== SINCRONIZAÇÃO =====
  syncCard: {
    backgroundColor: PALETTE.branco,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: PALETTE.verdePrimario,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  syncInfo: {
    marginBottom: 12,
  },
  syncLabel: {
    fontSize: 12,
    color: PALETTE.cinza,
    fontWeight: '500',
    marginBottom: 4,
  },
  syncValue: {
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.preto,
  },
  syncButton: {
    backgroundColor: PALETTE.verdePrimario,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncButtonDisabled: {
    backgroundColor: PALETTE.cinza,
    opacity: 0.6,
  },
  syncButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: PALETTE.branco,
  },
  pullButton: {
    backgroundColor: '#2196F3', // Azul para diferenciar
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  pullButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: PALETTE.branco,
  },
  lastSyncCard: {
    backgroundColor: PALETTE.verdeClaro2,
    borderRadius: 10,
    padding: 12,
  },
  lastSyncLabel: {
    fontSize: 12,
    color: PALETTE.cinza,
    fontWeight: '500',
    marginBottom: 4,
  },
  lastSyncTime: {
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.verdePrimario,
  },

  // ===== ACTIONS =====
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionCard: {
    width: '48%',
    backgroundColor: PALETTE.branco,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  actionIconBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: PALETTE.verdeClaro2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionIcon: {
    fontSize: 28,
  },
  actionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.preto,
    textAlign: 'center',
  },

  // ===== DANGER SECTION (RESET + LOGOUT) =====
  dangerSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 10,
  },
  resetButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.branco,
  },
  logoutButtonFull: {
    backgroundColor: PALETTE.erro,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.branco,
  },

  // ===== FOOTER =====
  footerInfo: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: PALETTE.cinzaClaro,
  },
  footerVersion: {
    fontSize: 11,
    color: PALETTE.cinza,
    opacity: 0.6,
  },
});