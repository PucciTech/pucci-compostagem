import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput as RNTextInput,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { syncService } from '@/services/sync';

const PALETTE = {
  verdePrimario: '#5D7261',
  verdeClaro: '#F0F5F0',
  branco: '#FFFFFF',
  preto: '#1A1A1A',
  cinza: '#9E9E9E',
  cinzaEscuro: '#424242',
  cinzaClaro: '#E0E0E0',
  cinzaClaro2: '#F5F5F5',
  alerta: '#F57C00',
};

// 🌟 CONFIGURAÇÃO DE MATERIAIS (Agora com Depósito 1 e 2 separados)
const TIPOS_MATERIAL = [
  { 
    id: 'Biossólido', 
    nome: 'Biossólido', 
    icone: 'recycle', 
    cor: PALETTE.verdePrimario, 
    bg: '#E8F5E9', 
    exigeMTR: true 
  },
  { 
    id: 'Bagaço', 
    nome: 'Bagaço de Cana', 
    icone: 'barley', 
    cor: '#F57C00', 
    bg: '#FFF3E0', 
    exigeMTR: false 
  },
  { 
    id: 'PatioMistura', 
    nome: 'Pátio de Mistura', 
    icone: 'pot-mix', 
    cor: '#8D6E63',
    bg: '#EFEBE9', 
    exigeMTR: false 
  },
  { 
    id: 'Deposito1', 
    nome: 'Depósito 1', 
    icone: 'warehouse', 
    cor: '#5C6BC0',
    bg: '#E8EAF6', 
    exigeMTR: false 
  },
  { 
    id: 'Deposito2', 
    nome: 'Depósito 2', 
    icone: 'warehouse', 
    cor: '#3949AB',
    bg: '#E8EAF6', 
    exigeMTR: false 
  }
];

export default function EnriquecerLeiraScreen() {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [leiras, setLeiras] = useState<any[]>([]);
  const [leiraSelecionada, setLeiraSelecionada] = useState<any>(null);
  const [materialSelecionado, setMaterialSelecionado] = useState(TIPOS_MATERIAL[0]);
  const [estoqueDisponivel, setEstoqueDisponivel] = useState<number | null>(null);
  
  const [buscaLeira, setBuscaLeira] = useState('');

  const [formData, setFormData] = useState({
    data: new Date().toLocaleDateString('pt-BR'),
    pesoAdicionado: '',
    numeroMTR: '',
    origem: '',
    observacoes: '',
  });

  useEffect(() => {
    carregarLeiras();
  }, []);

  useEffect(() => {
    calcularEstoqueDisponivel();
  }, [materialSelecionado]);

  // 🔥 NOVA: Função que calcula quanto tem no estoque (Separando os depósitos)
   // 🔥 NOVA: Função que calcula quanto tem no estoque (Com Normalizador)
  const calcularEstoqueDisponivel = async () => {
    if (materialSelecionado.id === 'Biossólido') {
      setEstoqueDisponivel(null);
      return;
    }

    try {
      const registros = await AsyncStorage.getItem('materiaisRegistrados');
      if (registros) {
        const materiais = JSON.parse(registros);
        let total = 0;

        materiais.forEach((mat: any) => {
          if (mat.usado) return; // Ignora o que já foi gasto

          // 🔥 NORMALIZADOR: Tira acentos, espaços e deixa minúsculo
          const destinoNorm = mat.destino ? String(mat.destino).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '') : '';
          const tipoNorm = mat.tipoMaterial ? String(mat.tipoMaterial).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '') : '';

          let atendeFiltro = false;
          if (materialSelecionado.id === 'Bagaço' && tipoNorm.includes('bagaco')) {
            atendeFiltro = true;
          } else if (materialSelecionado.id === 'PatioMistura' && destinoNorm.includes('patio')) {
            atendeFiltro = true;
          } else if (materialSelecionado.id === 'Deposito1' && (destinoNorm.includes('deposito1') || tipoNorm.includes('deposito1'))) {
            atendeFiltro = true;
          } else if (materialSelecionado.id === 'Deposito2' && (destinoNorm.includes('deposito2') || tipoNorm.includes('deposito2'))) {
            atendeFiltro = true;
          }

          if (atendeFiltro) {
            total += parseFloat(String(mat.peso).replace(',', '.'));
          }
        });

        setEstoqueDisponivel(total);
      } else {
        setEstoqueDisponivel(0);
      }
    } catch (error) {
      console.error("Erro ao calcular estoque:", error);
      setEstoqueDisponivel(0);
    }
  };

  const carregarLeiras = async () => {
    try {
      setLoading(true);
      const leirasRegistradas = await AsyncStorage.getItem('leirasFormadas');
      if (leirasRegistradas) {
        const leirasData = JSON.parse(leirasRegistradas);
        const leirasAtivas = leirasData.filter((l: any) => l.status !== 'pronta');
        leirasAtivas.sort((a: any, b: any) => Number(b.id) - Number(a.id));
        setLeiras(leirasAtivas);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Falha ao carregar as leiras.');
    } finally {
      setLoading(false);
    }
  };

  const formatarData = (text: string) => {
    let numeros = text.replace(/\D/g, '');
    numeros = numeros.slice(0, 8);
    if (numeros.length <= 2) return numeros;
    if (numeros.length <= 4) return numeros.slice(0, 2) + '/' + numeros.slice(2);
    return numeros.slice(0, 2) + '/' + numeros.slice(2, 4) + '/' + numeros.slice(4, 8);
  };

  const calcularTotalComEnriquecimentos = (leiraObj: any) => {
    if (!leiraObj) return 0;
    let total = leiraObj.totalBiossólido || 0;
    if (leiraObj.enriquecimentos && leiraObj.enriquecimentos.length > 0) {
      total += leiraObj.enriquecimentos.reduce((sum: number, enr: any) => sum + enr.pesoAdicionado, 0);
    }
    return total;
  };

    
  const handleSalvar = async () => {
    if (!leiraSelecionada) return Alert.alert('Erro', 'Selecione uma leira primeiro.');
    if (!formData.data.trim()) return Alert.alert('Erro', 'Digite a data.');
    if (!formData.pesoAdicionado.trim()) return Alert.alert('Erro', 'Digite o peso adicionado.');
    
    const pesoAdicionado = parseFloat(formData.pesoAdicionado.replace(',', '.'));
    if (isNaN(pesoAdicionado) || pesoAdicionado <= 0) {
      return Alert.alert('Erro', 'Peso deve ser um número maior que 0.');
    }

    if (materialSelecionado.exigeMTR && !formData.numeroMTR.trim()) {
      return Alert.alert('Atenção', `O número do MTR é obrigatório para ${materialSelecionado.nome}.`);
    }

    if (estoqueDisponivel !== null && pesoAdicionado > estoqueDisponivel) {
      return Alert.alert(
        'Estoque Insuficiente ⚠️', 
        `Você está tentando adicionar ${pesoAdicionado} ton, mas só há ${estoqueDisponivel.toFixed(2)} ton disponíveis de ${materialSelecionado.nome} no estoque.`
      );
    }

    Alert.alert("Processando", "Salvando dados e atualizando estoque...");

    try {
      // 🔥 LÓGICA: DESCONTAR DO ESTOQUE (FIFO)
      if (materialSelecionado.id !== 'Biossólido') {
        const registros = await AsyncStorage.getItem('materiaisRegistrados');
        if (registros) {
          let materiais = JSON.parse(registros);
          let pesoRestante = pesoAdicionado;
          let materiaisAtualizados = [];

          materiais.sort((a: any, b: any) => Number(a.id) - Number(b.id));

          for (let i = 0; i < materiais.length; i++) {
            if (pesoRestante <= 0) break;
            
            let mat = materiais[i];
            if (mat.usado) continue;

            // 🔥 NORMALIZADOR: Tira acentos, espaços e deixa minúsculo
            const destinoNorm = mat.destino ? String(mat.destino).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '') : '';
            const tipoNorm = mat.tipoMaterial ? String(mat.tipoMaterial).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '') : '';

            let atendeFiltro = false;
            if (materialSelecionado.id === 'Bagaço' && tipoNorm.includes('bagaco')) {
              atendeFiltro = true;
            } else if (materialSelecionado.id === 'PatioMistura' && destinoNorm.includes('patio')) {
              atendeFiltro = true;
            } else if (materialSelecionado.id === 'Deposito1' && (destinoNorm.includes('deposito1') || tipoNorm.includes('deposito1'))) {
              atendeFiltro = true;
            } else if (materialSelecionado.id === 'Deposito2' && (destinoNorm.includes('deposito2') || tipoNorm.includes('deposito2'))) {
              atendeFiltro = true;
            }

            if (atendeFiltro) {
              let pesoDisponivel = parseFloat(String(mat.peso).replace(',', '.'));
              
              if (pesoDisponivel > pesoRestante) {
                mat.peso = (pesoDisponivel - pesoRestante).toFixed(2);
                pesoRestante = 0;
                materiaisAtualizados.push(mat);
              } else {
                pesoRestante -= pesoDisponivel;
                mat.peso = '0';
                mat.usado = true;
                materiaisAtualizados.push(mat);
              }
            }
          }

          await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(materiais));

          for (const mat of materiaisAtualizados) {
            await syncService.adicionarFila('material', mat);
          }
        }
      }

      const pesoAnterior = calcularTotalComEnriquecimentos(leiraSelecionada);
      const pesoNovo = pesoAnterior + pesoAdicionado;

      const novoEnriquecimento = {
        id: Date.now().toString(),
        leiraId: leiraSelecionada.id,
        dataEnriquecimento: formData.data,
        horaEnriquecimento: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        tipoMaterial: materialSelecionado.id,
        pesoAdicionado,
        numeroMTR: materialSelecionado.exigeMTR ? formData.numeroMTR : 'N/A',
        origem: formData.origem || undefined,
        observacoes: formData.observacoes || undefined,
        pesoAnterior,
        pesoNovo,
        timestamp: Date.now(),
      };

      const enriquecimentosRegistrados = await AsyncStorage.getItem('leirasEnriquecimentos');
      const enriquecimentosDataArray = enriquecimentosRegistrados ? JSON.parse(enriquecimentosRegistrados) : [];
      enriquecimentosDataArray.push(novoEnriquecimento);
      await AsyncStorage.setItem('leirasEnriquecimentos', JSON.stringify(enriquecimentosDataArray));

      const leirasRegistradas = await AsyncStorage.getItem('leirasFormadas');
      const leirasData = leirasRegistradas ? JSON.parse(leirasRegistradas) : [];
      const leiraIndex = leirasData.findIndex((l: any) => l.id === leiraSelecionada.id);

      if (leiraIndex !== -1) {
        if (!leirasData[leiraIndex].enriquecimentos) {
          leirasData[leiraIndex].enriquecimentos = [];
        }
        leirasData[leiraIndex].enriquecimentos.push(novoEnriquecimento);
        await AsyncStorage.setItem('leirasFormadas', JSON.stringify(leirasData));
      }

      await syncService.adicionarFila('enriquecimento', novoEnriquecimento);
      const temInternet = await syncService.verificarInternet();
      
      if (temInternet) {
        await syncService.sincronizar();
      }

      Alert.alert(
        'Sucesso! ✅', 
        `${pesoAdicionado} ton adicionadas na Leira #${leiraSelecionada.numeroLeira}.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );

    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível salvar.');
    }
  };

  const leirasFiltradas = leiras.filter(leira => {
    const termoBusca = buscaLeira.toLowerCase();
    return (
      leira.numeroLeira.toString().includes(termoBusca) || 
      (leira.lote && leira.lote.toLowerCase().includes(termoBusca))
    );
  });

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={PALETTE.verdePrimario} />
        <Text style={{ marginTop: 12, color: PALETTE.cinza }}>Carregando leiras...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={PALETTE.cinzaEscuro} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Enriquecer Leira</Text>
          <View style={styles.backButton} />
        </View>

        {/* 1. SELEÇÃO DE LEIRA */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Selecione a Leira</Text>
          
          {/* Barra de Busca */}
          {leiras.length > 0 && (
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={20} color={PALETTE.cinza} style={styles.searchIcon} />
              <RNTextInput
                style={styles.searchInput}
                placeholder="Buscar por número ou lote..."
                value={buscaLeira}
                onChangeText={setBuscaLeira}
                placeholderTextColor={PALETTE.cinza}
              />
              {buscaLeira.length > 0 && (
                <TouchableOpacity onPress={() => setBuscaLeira('')} style={{ padding: 4 }}>
                  <MaterialCommunityIcons name="close-circle" size={20} color={PALETTE.cinza} />
                </TouchableOpacity>
              )}
            </View>
          )}
          
          {leiras.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{ color: PALETTE.cinza }}>Nenhuma leira ativa encontrada.</Text>
            </View>
          ) : leirasFiltradas.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{ color: PALETTE.cinza }}>Nenhuma leira encontrada para "{buscaLeira}".</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {leirasFiltradas.map((leira) => {
                const isSelected = leiraSelecionada?.id === leira.id;
                return (
                  <TouchableOpacity
                    key={leira.id}
                    style={[
                      styles.leiraCard,
                      isSelected && styles.leiraCardActive
                    ]}
                    onPress={() => setLeiraSelecionada(leira)}
                  >
                    <Text style={[styles.leiraNumber, isSelected && { color: PALETTE.branco }]}>
                      #{leira.numeroLeira}
                    </Text>
                    <Text style={[styles.leiraLote, isSelected && { color: '#E8F5E9' }]}>
                      Lote {leira.lote}
                    </Text>
                    <View style={[styles.statusBadge, isSelected && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                      <Text style={[styles.statusText, isSelected && { color: PALETTE.branco }]}>
                        {leira.status}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* SÓ MOSTRA O FORMULÁRIO SE UMA LEIRA FOR SELECIONADA */}
        {leiraSelecionada && (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>2. Dados do Enriquecimento</Text>
            
            {/* SELETOR DE MATERIAL DINÂMICO */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>O que será adicionado?</Text>
              <View style={styles.materialsGrid}>
                {TIPOS_MATERIAL.map((mat) => {
                  const isSelected = materialSelecionado.id === mat.id;
                  return (
                    <TouchableOpacity
                      key={mat.id}
                      style={[
                        styles.materialBtn,
                        isSelected && { borderColor: mat.cor, backgroundColor: mat.bg, borderWidth: 2 }
                      ]}
                      onPress={() => setMaterialSelecionado(mat)}
                    >
                      <MaterialCommunityIcons 
                        name={mat.icone as any} 
                        size={28} 
                        color={isSelected ? mat.cor : PALETTE.cinza} 
                        style={{ marginBottom: 8 }} 
                      />
                      <Text style={[
                        styles.materialBtnText, 
                        isSelected && { color: mat.cor, fontWeight: 'bold' }
                      ]}>
                        {mat.nome}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* DATA */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>📅 Data</Text>
              <View style={styles.inputBox}>
                <RNTextInput
                  style={styles.input}
                  placeholder="DD/MM/YYYY"
                  value={formData.data}
                  onChangeText={(text) => setFormData({ ...formData, data: formatarData(text) })}
                  maxLength={10}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* PESO COM ESTOQUE DINÂMICO */}
            <View style={styles.formGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[styles.label, { marginBottom: 0 }]}>⚖️ Peso Adicionado (ton)</Text>
                
                {/* 🔥 NOVO: Mostrador de Estoque Dinâmico */}
                {estoqueDisponivel !== null && (
                  <View style={{ backgroundColor: estoqueDisponivel <= 0 ? '#FFEBEE' : '#E3F2FD', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: estoqueDisponivel <= 0 ? '#D32F2F' : '#1976D2' }}>
                      Disponível: {estoqueDisponivel.toFixed(2)} ton
                    </Text>
                  </View>
                )}
              </View>
              
              <View style={styles.inputBox}>
                <RNTextInput
                  style={styles.input}
                  placeholder="Ex: 15"
                  value={formData.pesoAdicionado}
                  onChangeText={(text) => setFormData({ ...formData, pesoAdicionado: text })}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* MTR DINÂMICO */}
            {materialSelecionado.exigeMTR && (
               <View style={styles.formGroup}>
                 <Text style={styles.label}>🔢 Número MTR *</Text>
                 <View style={styles.inputBox}>
                   <RNTextInput
                     style={styles.input}
                     placeholder="Ex: MTR-2025-0001"
                     value={formData.numeroMTR}
                     onChangeText={(text) => setFormData({ ...formData, numeroMTR: text })}
                   />
                 </View>
               </View>
            )}

            {/* ORIGEM */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>📍 Origem (Opcional)</Text>
              <View style={styles.inputBox}>
                <RNTextInput
                  style={styles.input}
                  placeholder="Ex: Sabesp, Usina..."
                  value={formData.origem}
                  onChangeText={(text) => setFormData({ ...formData, origem: text })}
                />
              </View>
            </View>

            {/* OBSERVAÇÕES */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>📝 Observações (Opcional)</Text>
              <View style={[styles.inputBox, { height: 100, alignItems: 'flex-start', paddingTop: 12 }]}>
                <RNTextInput
                  style={[styles.input, { textAlignVertical: 'top', width: '100%' }]}
                  placeholder="Motivo do enriquecimento..."
                  value={formData.observacoes}
                  onChangeText={(text) => setFormData({ ...formData, observacoes: text })}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </View>

            {/* BOTÃO SALVAR INTELIGENTE */}
            <TouchableOpacity 
              style={[
                styles.submitBtn, 
                { backgroundColor: materialSelecionado.cor },
                (estoqueDisponivel !== null && estoqueDisponivel <= 0) && { opacity: 0.5 }
              ]} 
              onPress={handleSalvar}
              disabled={estoqueDisponivel !== null && estoqueDisponivel <= 0}
            >
              <Text style={styles.submitBtnText}>
                {estoqueDisponivel !== null && estoqueDisponivel <= 0 ? 'Estoque Zerado' : 'Confirmar Enriquecimento'}
              </Text>
            </TouchableOpacity>

          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.verdeClaro },
  scrollContent: { paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: PALETTE.branco, borderBottomWidth: 1, borderColor: PALETTE.cinzaClaro2 },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: PALETTE.preto },
  
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: PALETTE.preto, marginLeft: 20, marginBottom: 12 },
  
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.branco,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PALETTE.cinzaClaro,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: PALETTE.preto },

  emptyBox: { marginHorizontal: 20, padding: 20, backgroundColor: PALETTE.branco, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: PALETTE.cinzaClaro },
  
  leiraCard: { width: 120, backgroundColor: PALETTE.branco, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: PALETTE.cinzaClaro, alignItems: 'center' },
  leiraCardActive: { backgroundColor: PALETTE.verdePrimario, borderColor: PALETTE.verdePrimario },
  leiraNumber: { fontSize: 24, fontWeight: 'bold', color: PALETTE.preto },
  leiraLote: { fontSize: 12, color: PALETTE.cinza, marginTop: 4, marginBottom: 8 },
  statusBadge: { backgroundColor: PALETTE.cinzaClaro2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: 'bold', color: PALETTE.cinzaEscuro, textTransform: 'capitalize' },

  formCard: { backgroundColor: PALETTE.branco, margin: 20, borderRadius: 16, padding: 20, elevation: 2 },
  formGroup: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: 'bold', color: PALETTE.cinzaEscuro, marginBottom: 8, textTransform: 'uppercase' },
  inputBox: { backgroundColor: PALETTE.cinzaClaro2, borderRadius: 10, paddingHorizontal: 16, height: 50, justifyContent: 'center', borderWidth: 1, borderColor: PALETTE.cinzaClaro },
  input: { fontSize: 15, color: PALETTE.preto },
  
  materialsGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  materialBtn: { flex: 1, minWidth: '45%', backgroundColor: PALETTE.cinzaClaro2, padding: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: PALETTE.cinzaClaro },
  materialBtnText: { fontSize: 14, color: PALETTE.cinza, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  
  submitBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  submitBtnText: { color: PALETTE.branco, fontSize: 16, fontWeight: 'bold' }
});