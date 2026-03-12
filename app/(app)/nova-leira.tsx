import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncService } from '@/services/sync';
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
  destino?: string;
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
  tipoFormacao: string;
  origemPiscinao?: string;
}

// ===== FUNÇÕES AUXILIARES =====
const parsePeso = (valor: string | number): number => {
  if (!valor) return 0;
  if (typeof valor === 'number') return valor;
  const stringLimpa = valor.toString().replace(',', '.').trim();
  const numero = parseFloat(stringLimpa);
  return isNaN(numero) ? 0 : numero;
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
    case 'pronta': return 'Pronta para Venda';
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

const calcularLote = (biossólidos: BiossólidoEntry[]): string => {
  if (biossólidos.length === 0) {
    const hoje = new Date();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    return `${mes}/${hoje.getFullYear()}`;
  }
  const datasEmMs = biossólidos.map((item) => {
    const [dia, mês, ano] = item.data.split('/').map(Number);
    return new Date(ano, mês - 1, dia).getTime();
  });
  const dataMaisRecente = new Date(Math.max(...datasEmMs));
  const mês = String(dataMaisRecente.getMonth() + 1).padStart(2, '0');
  const ano = dataMaisRecente.getFullYear();
  return `${mês}/${ano}`;
};

export default function NovaLeiraScreen() {
  const router = useRouter();
  const [leiras, setLeiras] = useState<Leira[]>([]);
  const [filtroLeiras, setFiltroLeiras] = useState<'hoje' | 'todas'>('hoje');
  const [biossólidos, setBiossólidos] = useState<BiossólidoEntry[]>([]);
  const [selectedBiossólidos, setSelectedBiossólidos] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buscaLeira, setBuscaLeira] = useState('');

  // Estados Modo Manual
  const [modoManual, setModoManual] = useState(false);
  const [pesoManualBio, setPesoManualBio] = useState('');
  const [pesoManualBagaco, setPesoManualBagaco] = useState('12');
  const [dataManual, setDataManual] = useState(new Date().toLocaleDateString('pt-BR'));

  // Estados Seleção de Piscinão
  const [piscinaoSelecionado, setPiscinaoSelecionado] = useState('Piscinão 1');
  const [listaPiscinoes, setListaPiscinoes] = useState(['Piscinão 1', 'Piscinão 2', 'Piscinão 3', 'Piscinão 4']);

  // Modal Novo Piscinão
  const [showModalNovoPiscinao, setShowModalNovoPiscinao] = useState(false);
  const [novoPiscinaoText, setNovoPiscinaoText] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

    const loadData = async () => {
    try {
      setLoading(true);

      // 
      // 1. CARREGAR MATERIAIS (100% LOCAL)
      // 
      const materiaisRegistrados = await AsyncStorage.getItem('materiaisRegistrados');
      const materiais = materiaisRegistrados ? JSON.parse(materiaisRegistrados) : [];

      const biossolidosDisponiveis = materiais.filter((item: any) => {
        const tipo = item.tipoMaterial ? item.tipoMaterial.toLowerCase() : '';
        const origem = item.origem ? item.origem.toLowerCase() : '';
        const destino = item.destino ? item.destino.toLowerCase() : '';
        const mtr = item.numeroMTR ? item.numeroMTR.toLowerCase() : '';

        const ehBiossolido = tipo.includes('bio') || tipo.includes('lodo');
        
        const ehPiscinao =
          destino.includes('piscin') ||
          destino.includes('estoque') ||
          origem.includes('piscin') ||
          origem.includes('manual') ||
          tipo.includes('piscin') ||
          mtr.includes('manual');

        // 🔥 REGRA NOVA: Só traz o material se ele AINDA NÃO FOI USADO
        const naoFoiUsado = !item.usado;

        // Retorna apenas se for biossólido, não for de piscinão e NÃO ESTIVER USADO
        return ehBiossolido && !ehPiscinao && naoFoiUsado;
      });

      // Ordena os disponíveis (mais novos no topo)
      const biossolidosOrdenados = biossolidosDisponiveis.sort((a: any, b: any) => Number(b.id) - Number(a.id));
      
      // Atualiza a tela com os materiais filtrados
      setBiossólidos(biossolidosOrdenados);

      // 
      // 2. CARREGAR LEIRAS PARA A LISTA INFERIOR (Apenas ativas)
      // 
      const leirasRegistradas = await AsyncStorage.getItem('leirasFormadas');
      const leirasData = leirasRegistradas ? JSON.parse(leirasRegistradas) : [];

      const leirasAtivas = leirasData.filter((l: any) => {
        const status = l.status?.toLowerCase() || '';
        return !['arquivada', 'finalizada'].includes(status);
      });
     
      const leirasOrdenadas = leirasAtivas.sort((a: any, b: any) => Number(b.id) - Number(a.id));
      setLeiras(leirasOrdenadas);

      // 
      // 3. LÓGICA DE DESTINOS/PISCINÕES
      // 
      const destinosSalvos = await AsyncStorage.getItem('listaDestinos');
      if (destinosSalvos) {
        const todos = JSON.parse(destinosSalvos);
        const soPiscinoes = todos.filter((d: string) =>
          d.toLowerCase().includes('piscin') || d.toLowerCase().includes('tanque')
        );

        if (soPiscinoes.length > 0) {
          const padroes = ['Piscinão 1', 'Piscinão 2', 'Piscinão 3', 'Piscinão 4'];
          const listaFinal = Array.from(new Set([...padroes, ...soPiscinoes]));
          setListaPiscinoes(listaFinal);

          if (!listaFinal.includes(piscinaoSelecionado)) {
            setPiscinaoSelecionado(listaFinal[0]);
          }
        }
      }

    } catch (error) {
      Alert.alert('Erro', 'Não foi possível carregar os dados');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNovoPiscinao = async () => {
    if (!novoPiscinaoText.trim()) { Alert.alert('Erro', 'Digite o nome do piscinão'); return; }

    const novaListaLocal = [...listaPiscinoes, novoPiscinaoText];
    setListaPiscinoes(novaListaLocal);
    setPiscinaoSelecionado(novoPiscinaoText);

    try {
      const destinosSalvos = await AsyncStorage.getItem('listaDestinos');
      const listaGlobal = destinosSalvos ? JSON.parse(destinosSalvos) : ['Pátio', 'Piscinão 1', 'Piscinão 2', 'Piscinão 3', 'Piscinão 4', 'Estoque Bagaço'];

      if (!listaGlobal.includes(novoPiscinaoText)) {
        const novaListaGlobal = [...listaGlobal, novoPiscinaoText];
        await AsyncStorage.setItem('listaDestinos', JSON.stringify(novaListaGlobal));
      }
    } catch (e) {
      console.error("Erro ao salvar destino global", e);
    }

    setNovoPiscinaoText('');
    setShowModalNovoPiscinao(false);
  };

  const handleSelectBiossólido = (id: string) => {
    if (selectedBiossólidos.includes(id)) {
      setSelectedBiossólidos(selectedBiossólidos.filter((item) => item !== id));
    } else {
      if (selectedBiossólidos.length < 4) {
        setSelectedBiossólidos([...selectedBiossólidos, id]);
      } else {
        Alert.alert('Limite', 'Máximo de 4 itens por leira');
      }
    }
  };
  

    const handleFormarLeira = async () => {
    let novaLeira: Leira;

    if (modoManual) {
      const pesoBio = parsePeso(pesoManualBio);
      const pesoBagaco = parsePeso(pesoManualBagaco);

      if (pesoBio <= 0) { Alert.alert('Atenção', 'Informe o peso do Biossólido/Piscinão.'); return; }
      if (pesoBagaco <= 0) { Alert.alert('Atenção', 'Informe o peso do Bagaço.'); return; }
      if (!dataManual.trim()) { Alert.alert('Atenção', 'Informe a data de formação.'); return; }

      const tipoFormacaoReal = piscinaoSelecionado;

      const itemManual: BiossólidoEntry = {
        id: `manual-${Date.now()}`,
        data: dataManual,
        numeroMTR: 'MANUAL',
        peso: pesoBio.toString(),
        origem: 'Estoque Interno',
        destino: piscinaoSelecionado,
        tipoMaterial: 'Biossólido'
      };

      novaLeira = {
        id: Date.now().toString(),
        numeroLeira: leiras.length + 1,
        lote: calcularLote([]),
        dataFormacao: dataManual,
        biossólidos: [itemManual],
        bagaço: pesoBagaco,
        status: 'formada',
        totalBiossólido: pesoBio,
        tipoFormacao: tipoFormacaoReal,
        origemPiscinao: tipoFormacaoReal
      };

    } else {
      if (selectedBiossólidos.length < 3 || selectedBiossólidos.length > 4) {
        Alert.alert('Atenção', 'Selecione 3 ou 4 viagens para formar a leira.');
        return;
      }

      const biossólidosSelecionados = biossólidos.filter((item) => selectedBiossólidos.includes(item.id));
      const totalBiossólido = biossólidosSelecionados.reduce((acc, item) => acc + parsePeso(item.peso), 0);
      const lote = calcularLote(biossólidosSelecionados);

      novaLeira = {
        id: Date.now().toString(),
        numeroLeira: leiras.length + 1,
        lote: lote,
        dataFormacao: new Date().toLocaleDateString('pt-BR'),
        biossólidos: biossólidosSelecionados,
        bagaço: 12,
        status: 'formada',
        totalBiossólido: totalBiossólido,
        tipoFormacao: 'MTR'
      };
    }

    try {
      // 1. Salva a nova leira no banco local
      const leirasRegistradas = await AsyncStorage.getItem('leirasFormadas');
      const leirasData = leirasRegistradas ? JSON.parse(leirasRegistradas) : [];
      leirasData.push(novaLeira);
      await AsyncStorage.setItem('leirasFormadas', JSON.stringify(leirasData));

      // 2. Adiciona a leira na fila de sincronização
      await syncService.adicionarFila('leira', novaLeira);

      // 3. ATUALIZA OS MATERIAIS (APLICA O CARIMBO)
      if (!modoManual) {
        const materiaisRegistrados = await AsyncStorage.getItem('materiaisRegistrados');
        if (materiaisRegistrados) {
          let materiais = JSON.parse(materiaisRegistrados);
          
          // 🔥 MUDANÇA AQUI: Em vez de filtrar (apagar), nós mapeamos (atualizamos)
          materiais = materiais.map((item: any) => {
            if (selectedBiossólidos.includes(item.id)) {
              return { ...item, usado: true }; // 👈 Aplica o carimbo mágico!
            }
            return item; // Mantém os outros intactos
          });
          
          // Salva o banco de materiais com os itens agora carimbados
          await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(materiais));
          
          // 💡 Opcional: Se você quiser que o Supabase atualize o material na nuvem agora, 
          // você pode adicionar os materiais carimbados na fila de sync também:
          const materiaisCarimbados = materiais.filter((m: any) => selectedBiossólidos.includes(m.id));
          for (const mat of materiaisCarimbados) {
            await syncService.adicionarFila('material', mat);
          }
        }
        
        // Remove visualmente da tela de Nova Leira
        setBiossólidos(biossólidos.filter((item) => !selectedBiossólidos.includes(item.id)));
      }

      // 4. Atualiza a UI e limpa o formulário
      setLeiras([...leiras, novaLeira]);
      setSelectedBiossólidos([]);
      setPesoManualBio('');
      setPesoManualBagaco('12');
      setDataManual(new Date().toLocaleDateString('pt-BR'));
      setShowForm(false);

      Alert.alert('Sucesso! ✅', `Leira #${novaLeira.numeroLeira} formada com sucesso!`);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível formar a leira');
    }
  };

  const handleExcluirLeira = (leira: Leira) => {
    Alert.alert(
      'Excluir Leira',
      `O que deseja fazer com os biossólidos da Leira #${leira.numeroLeira}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir Definitivamente',
          style: 'destructive',
          onPress: async () => {
            await executarExclusao(leira, false);
          }
        },
        {
          text: 'Retornar ao Estoque',
          onPress: async () => {
            await executarExclusao(leira, true);
          }
        }
      ]
    );
  };

  const executarExclusao = async (leira: Leira, devolverAoEstoque: boolean) => {
    try {
      const novasLeiras = leiras.filter(l => l.id !== leira.id);
      await AsyncStorage.setItem('leirasFormadas', JSON.stringify(novasLeiras));
      setLeiras(novasLeiras);

      if (devolverAoEstoque && leira.tipoFormacao === 'MTR') {
        const materiaisRegistrados = await AsyncStorage.getItem('materiaisRegistrados');
        const materiais = materiaisRegistrados ? JSON.parse(materiaisRegistrados) : [];
        const novosMateriais = [...materiais, ...leira.biossólidos];
        await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(novosMateriais));
        loadData();
        Alert.alert('Sucesso', 'Leira excluída e materiais devolvidos ao estoque.');
      } else {
        Alert.alert('Sucesso', 'Leira e materiais excluídos definitivamente.');
      }

      await syncService.adicionarFila('leira_deletada' as any, { id: leira.id });

    } catch (error) {
      Alert.alert('Erro', 'Falha ao excluir leira.');
    }
  };

  
  const totalBioSelecionado = modoManual
    ? parsePeso(pesoManualBio)
    : biossólidos.filter((item) => selectedBiossólidos.includes(item.id)).reduce((acc, item) => acc + parsePeso(item.peso), 0);

    
  const totalBagaco = modoManual ? parsePeso(pesoManualBagaco) : 12;
  // ===== LÓGICA DE FILTRO E BUSCA =====
  const dataDeHoje = new Date().toLocaleDateString('pt-BR');
  
  const leirasFiltradas = leiras.filter((leira) => {
    // 1. Filtro dos Botões (Chips)
    if (filtroLeiras === 'hoje' && leira.dataFormacao !== dataDeHoje) {
      return false; // Se o botão for "Hoje" e a leira não for de hoje, esconde.
    }

    // 2. Filtro da Barra de Busca (Texto)
    if (!buscaLeira.trim()) return true;

    const termoBusca = buscaLeira.toLowerCase().trim();
    const termoLimpo = termoBusca.replace(/leira/g, '').replace(/#/g, '').trim();

    const numeroStr = leira.numeroLeira?.toString() || '';
    const loteStr = leira.lote?.toLowerCase() || '';

    return numeroStr === termoLimpo || numeroStr.includes(termoLimpo) || loteStr.includes(termoBusca);
  });

  // 🔥 Como agora temos os botões, não precisamos mais limitar a 5.
  // Mostramos todas que passarem no filtro, ordenadas da mais nova para a mais velha.
  const leirasParaExibir = buscaLeira.trim() 
    ? leirasFiltradas 
    : [...leirasFiltradas].sort((a, b) => b.numeroLeira - a.numeroLeira).slice(0, 5);
  

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PALETTE.verdePrimario} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* HEADER */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Formação de Leira</Text>
            <View style={styles.backButton} />
          </View>

          {/* INFO BOX */}
          <View style={styles.infoBox}>
            <MaterialCommunityIcons name="leaf" size={32} color={PALETTE.terracota} style={styles.infoIcon} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Nova Leira</Text>
              <Text style={styles.infoText}>Use MTRs do estoque ou registre manualmente (Piscinão)</Text>
            </View>
          </View>

          <View style={styles.statsContainer}>
            <StatBox label="Leiras Criadas" value={leiras.length.toString()} color={PALETTE.verdePrimario} />
            <StatBox label="Mat. Disponível" value={biossólidos.length.toString()} color={biossólidos.length >= 3 ? PALETTE.sucesso : PALETTE.warning} />
          </View>

          {showForm ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Nova Leira #{leiras.length + 1}</Text>

              <View style={styles.modeSelector}>
                <TouchableOpacity
                  style={[styles.modeBtn, !modoManual && styles.modeBtnActive]}
                  onPress={() => setModoManual(false)}
                >
                  <Text style={[styles.modeBtnText, !modoManual && styles.modeBtnTextActive]}>Selecionar MTRs</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeBtn, modoManual && styles.modeBtnActive]}
                  onPress={() => setModoManual(true)}
                >
                  <Text style={[styles.modeBtnText, modoManual && styles.modeBtnTextActive]}>Manual / Piscinão</Text>
                </TouchableOpacity>
              </View>

              {modoManual ? (
                <View style={styles.manualInputContainer}>

                  <View style={styles.labelHeader}>
                    <Text style={styles.inputLabel}>Origem do Material</Text>
                    <TouchableOpacity onPress={() => setShowModalNovoPiscinao(true)} style={styles.addBtnSmall}>
                      <MaterialCommunityIcons name="plus" size={16} color={PALETTE.branco} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.piscinaoGrid}>
                    {listaPiscinoes.map((piscinao) => (
                      <TouchableOpacity
                        key={piscinao}
                        style={[
                          styles.piscinaoBtn,
                          piscinaoSelecionado === piscinao && styles.piscinaoBtnActive
                        ]}
                        onPress={() => setPiscinaoSelecionado(piscinao)}
                      >
                        <MaterialCommunityIcons
                          name="water"
                          size={24}
                          color={piscinaoSelecionado === piscinao ? PALETTE.azulPiscinao : PALETTE.cinza}
                          style={styles.piscinaoIcon}
                        />
                        <Text style={[
                          styles.piscinaoText,
                          piscinaoSelecionado === piscinao && styles.piscinaoTextActive
                        ]}>
                          {piscinao}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.inputLabel, { marginTop: 20 }]}>Data de Formação</Text>
                  <View style={styles.inputWrapper}>
                    <RNTextInput
                      style={styles.input}
                      value={dataManual}
                      onChangeText={setDataManual}
                      placeholder="DD/MM/AAAA"
                      keyboardType="numbers-and-punctuation"
                    />
                    <MaterialCommunityIcons name="calendar" size={20} color={PALETTE.cinza} />
                  </View>

                  <Text style={styles.inputLabel}>Peso do Material (Piscinão/Bio)</Text>
                  <View style={styles.inputWrapper}>
                    <RNTextInput
                      style={styles.input}
                      value={pesoManualBio}
                      onChangeText={setPesoManualBio}
                      placeholder="0.0"
                      keyboardType="numeric"
                    />
                    <Text style={styles.unitText}>ton</Text>
                  </View>

                  <Text style={styles.inputLabel}>Peso do Bagaço</Text>
                  <View style={styles.inputWrapper}>
                    <RNTextInput
                      style={styles.input}
                      value={pesoManualBagaco}
                      onChangeText={setPesoManualBagaco}
                      placeholder="12.0"
                      keyboardType="numeric"
                    />
                    <Text style={styles.unitText}>ton</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.biossólidosList}>
                  <Text style={styles.subLabel}>Selecione 3 ou 4 itens da lista:</Text>
                  {biossólidos.length > 0 ? (
                    biossólidos.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.biossólidoItem,
                          selectedBiossólidos.includes(item.id) && styles.biossólidoItemSelected
                        ]}
                        onPress={() => handleSelectBiossólido(item.id)}
                      >
                        <View style={styles.biossólidoCheckbox}>
                          {selectedBiossólidos.includes(item.id) && <MaterialCommunityIcons name="check" size={16} color={PALETTE.verdePrimario} />}
                        </View>
                        <View style={styles.biossólidoInfo}>
                          <View style={styles.biossólidoHeader}>
                            <Text style={styles.biossólidoMTR}>{item.numeroMTR || 'S/ MTR'}</Text>
                            <Text style={styles.biossólidoData}>{item.data}</Text>
                          </View>
                          <View style={styles.biossólidoFooter}>
                            <Text style={styles.biossólidoOrigem}>
                              <MaterialCommunityIcons name={item.origem?.includes('Piscin') ? 'water' : 'factory'} size={14} color={PALETTE.cinza} /> {item.origem}
                            </Text>
                            <Text style={styles.biossólidoPeso}>{item.peso} ton</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.emptyBiossólidos}>
                      <Text style={styles.emptyText}>Estoque vazio.</Text>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>Resumo da Leira</Text>
                <View style={styles.previewItem}>
                  <Text style={styles.previewLabel}>Material Total</Text>
                  <Text style={styles.previewValue}>{totalBioSelecionado.toFixed(1)} ton</Text>
                </View>
                <View style={styles.previewItem}>
                  <Text style={styles.previewLabel}>Bagaço</Text>
                  <Text style={styles.previewValue}>{totalBagaco} ton</Text>
                </View>
                <View style={styles.previewItem}>
                  <Text style={styles.previewLabel}>Total Estimado</Text>
                  <Text style={styles.previewValue}>{(totalBioSelecionado + Number(totalBagaco)).toFixed(1)} ton</Text>
                </View>
              </View>

              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={{ backgroundColor: PALETTE.verdeClaro, height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: PALETTE.cinzaClaro }}
                  onPress={() => { setShowForm(false); setSelectedBiossólidos([]); }}
                >
                  <Text style={{ color: PALETTE.cinza, fontWeight: '700', fontSize: 15 }}>Cancelar</Text>
                </TouchableOpacity>

                <View style={styles.buttonSpacer} />

                <TouchableOpacity
                  style={{ backgroundColor: PALETTE.verdePrimario, height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}
                  onPress={handleFormarLeira}
                >
                  <Text style={{ color: PALETTE.branco, fontWeight: '700', fontSize: 15 }}>Confirmar Formação</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setShowForm(true)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="plus" size={24} color={PALETTE.branco} />
              <Text style={styles.addBtnText}>Formar Nova Leira</Text>
            </TouchableOpacity>
          )}

                    <View style={styles.listSection}>
            
            {/* 🔥 CABEÇALHO COM TÍTULO E BOTÕES DE FILTRO */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={[styles.listTitle, { marginBottom: 0, flex: 1 }]}>
                {buscaLeira.trim() ? `Resultados (${leirasParaExibir.length})` : 'Leiras Formadas'}
              </Text>
              
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.filterChip, filtroLeiras === 'hoje' && styles.filterChipActive]}
                  onPress={() => setFiltroLeiras('hoje')}
                >
                  <Text style={[styles.filterChipText, filtroLeiras === 'hoje' && styles.filterChipTextActive]}>
                    Criadas Hoje
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterChip, filtroLeiras === 'todas' && styles.filterChipActive]}
                  onPress={() => setFiltroLeiras('todas')}
                >
                  <Text style={[styles.filterChipText, filtroLeiras === 'todas' && styles.filterChipTextActive]}>
                    Todas Ativas
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 🔥 BARRA DE BUSCA (Mantida intacta) */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: PALETTE.branco,
              borderWidth: 1,
              borderColor: PALETTE.cinzaClaro,
              borderRadius: 12,
              paddingHorizontal: 12,
              marginBottom: 16,
              height: 48
            }}>
              <MaterialCommunityIcons name="magnify" size={22} color={PALETTE.cinza} />
              <RNTextInput
                style={{ flex: 1, marginLeft: 8, fontSize: 15, color: PALETTE.preto }}
                placeholder="Buscar por número ou lote..."
                placeholderTextColor={PALETTE.cinza}
                value={buscaLeira}
                onChangeText={setBuscaLeira}
              />
              {buscaLeira.length > 0 && (
                <TouchableOpacity onPress={() => setBuscaLeira('')} style={{ padding: 4 }}>
                  <MaterialCommunityIcons name="close-circle" size={20} color={PALETTE.cinza} />
                </TouchableOpacity>
              )}
            </View>

            {/* 🔥 LISTA RENDERIZADA */}
            {leirasParaExibir.length > 0 ? (
              leirasParaExibir.map((leira) => (
                <LeiraCard
                  key={leira.id}
                  leira={leira}
                  onDelete={() => handleExcluirLeira(leira)}
                />
              ))
            ) : (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <MaterialCommunityIcons name="magnify-close" size={40} color={PALETTE.cinzaClaro} style={{ marginBottom: 8 }} />
                <Text style={{ color: PALETTE.cinza, fontSize: 15, textAlign: 'center' }}>
                  Nenhuma leira {filtroLeiras === 'hoje' ? 'criada hoje' : 'ativa encontrada'}.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showModalNovoPiscinao} transparent animationType="fade" onRequestClose={() => setShowModalNovoPiscinao(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Piscinão</Text>
            <View style={styles.modalInputBox}>
              <RNTextInput
                style={styles.modalInput}
                placeholder="Ex: Piscinão 5, Tanque Extra..."
                value={novoPiscinaoText}
                onChangeText={setNovoPiscinaoText}
                autoFocus
              />
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancelar} onPress={() => setShowModalNovoPiscinao(false)}>
                <Text style={styles.modalBtnCancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnConfirmar} onPress={handleAddNovoPiscinao}>
                <Text style={styles.modalBtnConfirmarText}>Adicionar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ===== COMPONENTES DE UI =====

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.statBox, { borderTopColor: color }]}>
      <Text style={styles.statBoxLabel}>{label}</Text>
      <Text style={[styles.statBoxValue, { color }]}>{value}</Text>
    </View>
  );
}

function LeiraCard({ leira, onDelete }: { leira: Leira, onDelete: () => void }) {
  const router = useRouter();
  const diasPassados = getDiasPassados(leira.dataFormacao);

  return (
    <View style={styles.leiraCard}>
      <View style={styles.leiraHeader}>
        <View>
          <View style={styles.leiraNumberRow}>
            <Text style={styles.leiraNumber}>Leira #{leira.numeroLeira}</Text>
            {leira.tipoFormacao !== 'MTR' ? (
              <View style={[styles.loteBadge, { backgroundColor: `${PALETTE.azulPiscinao}15` }]}>
                <MaterialCommunityIcons name="water" size={12} color={PALETTE.azulPiscinao} style={{ marginRight: 4 }} />
                <Text style={[styles.loteBadgeText, { color: PALETTE.azulPiscinao }]}>
                  {leira.tipoFormacao}
                </Text>
              </View>
            ) : (
              <View style={[styles.loteBadge, { backgroundColor: `${PALETTE.terracota}15` }]}>
                <MaterialCommunityIcons name="tag" size={12} color={PALETTE.terracota} style={{ marginRight: 4 }} />
                <Text style={[styles.loteBadgeText, { color: PALETTE.terracota }]}>Lote {leira.lote}</Text>
              </View>
            )}
          </View>
          <Text style={styles.leiraData}>Formada em {leira.dataFormacao}</Text>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push({ pathname: '/(app)/editar-leira', params: { id: leira.id } })}>
            <MaterialCommunityIcons name="pencil" size={20} color={PALETTE.cinza} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconButton, { backgroundColor: PALETTE.erroClaro }]} onPress={onDelete}>
            <MaterialCommunityIcons name="delete" size={20} color={PALETTE.erro} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.leiraStatusBadge, { backgroundColor: `${getStatusColor(leira.status)}15` }]}>
        <MaterialCommunityIcons name={getStatusIcon(leira.status)} size={16} color={getStatusColor(leira.status)} style={{ marginRight: 6 }} />
        <Text style={[styles.leiraStatusText, { color: getStatusColor(leira.status) }]}>{getStatusLabel(leira.status)}</Text>
      </View>

      <View style={styles.timeline}>
        <TimelineStep label="Formação" status="completed" dias={diasPassados} />
        <TimelineStep label="Secagem" status={diasPassados > 2 ? 'completed' : 'pending'} dias={3} />
        <TimelineStep label="Compostagem" status={leira.status === 'compostando' ? 'active' : 'pending'} dias={21} />
        <TimelineStep label="Maturação" status={leira.status === 'maturando' ? 'active' : 'pending'} dias={21} />
        <TimelineStep label="Venda" status={leira.status === 'pronta' ? 'completed' : 'pending'} />
      </View>

      <View style={styles.leiraDetails}>
        <DetailItem label="Origem" value={leira.tipoFormacao !== 'MTR' ? leira.tipoFormacao : 'Estoque (MTR)'} />
        <DetailItem label="Peso Bio" value={`${leira.totalBiossólido.toFixed(1)} ton`} />
        <DetailItem label="Bagaço" value={`${leira.bagaço} ton`} />
      </View>
    </View>
  );
}

function TimelineStep({ label, status, dias }: { label: string; status: 'pending' | 'active' | 'completed'; dias?: number }) {
  const getColor = () => {
    switch (status) {
      case 'completed': return PALETTE.sucesso;
      case 'active': return PALETTE.verdePrimario;
      default: return PALETTE.cinzaClaro;
    }
  };

  const renderIcon = () => {
    switch (status) {
      case 'completed': return <MaterialCommunityIcons name="check" size={12} color={PALETTE.branco} />;
      case 'active': return <MaterialCommunityIcons name="circle-medium" size={16} color={PALETTE.branco} />;
      default: return <MaterialCommunityIcons name="circle-outline" size={14} color={PALETTE.cinza} />;
    }
  };

  return (
    <View style={styles.timelineStep}>
      <View style={[
        styles.timelineIcon,
        {
          backgroundColor: status === 'pending' ? PALETTE.branco : getColor(),
          borderColor: getColor(),
          borderWidth: status === 'pending' ? 2 : 0
        }
      ]}>
        {renderIcon()}
      </View>
      <View style={styles.timelineContent}>
        <Text style={[
          styles.timelineLabel,
          status === 'active' && { color: PALETTE.verdePrimario, fontWeight: '800' }
        ]}>
          {label}
        </Text>
        {dias !== undefined && <Text style={styles.timelineDias}>~{dias} dias</Text>}
      </View>
    </View>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
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
  backIcon: { fontSize: 24, fontWeight: '700', color: PALETTE.preto },
  headerTitle: { fontSize: 18, fontWeight: '800', color: PALETTE.preto },

  // INFO BOX
  infoBox: {
    flexDirection: 'row',
    backgroundColor: PALETTE.branco,
    marginHorizontal: 24,
    marginTop: 24,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: PALETTE.terracota,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  infoIcon: { fontSize: 32, marginRight: 16 },
  infoContent: { flex: 1 },
  infoTitle: { fontSize: 15, fontWeight: '700', color: PALETTE.preto, marginBottom: 2 },
  infoText: { fontSize: 13, color: PALETTE.cinza },

  // STATS
  statsContainer: { paddingHorizontal: 24, marginBottom: 24, flexDirection: 'row', gap: 12 },
  statBox: {
    flex: 1,
    backgroundColor: PALETTE.branco,
    borderRadius: 16,
    padding: 16,
    borderTopWidth: 4,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  statBoxLabel: { fontSize: 11, color: PALETTE.cinza, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  statBoxValue: { fontSize: 24, fontWeight: '800' },

  // FORMULÁRIO
  formCard: {
    backgroundColor: PALETTE.branco,
    marginHorizontal: 24,
    marginBottom: 24,
    borderRadius: 16,
    padding: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  formTitle: { fontSize: 18, fontWeight: '800', color: PALETTE.preto, marginBottom: 20 },

  modeSelector: { flexDirection: 'row', backgroundColor: PALETTE.verdeClaro, borderRadius: 12, padding: 4, marginBottom: 24, borderWidth: 1, borderColor: PALETTE.cinzaClaro },
  modeBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  modeBtnActive: { backgroundColor: PALETTE.branco, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: PALETTE.cinza },
  modeBtnTextActive: { color: PALETTE.verdePrimario, fontWeight: '700' },

  manualInputContainer: { marginBottom: 20 },

  labelHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' },
  addBtnSmall: { backgroundColor: PALETTE.terracota, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  addBtnSmallIcon: { color: PALETTE.branco, fontWeight: 'bold', fontSize: 16 },

  inputLabel: { fontSize: 12, fontWeight: '700', color: PALETTE.cinza, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.verdeClaro, borderRadius: 12, paddingHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: PALETTE.cinzaClaro, height: 52 },
  input: { flex: 1, fontSize: 15, fontWeight: '600', color: PALETTE.preto },
  unitText: { fontSize: 14, fontWeight: '700', color: PALETTE.cinza },

  // LISTA DE BIOSSÓLIDOS (MTR)
  biossólidosList: { gap: 12, marginBottom: 20 },
  subLabel: { fontSize: 13, color: PALETTE.cinza, fontWeight: '600', marginBottom: 8 },
  biossólidoItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.branco, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: PALETTE.cinzaClaro },
  biossólidoItemSelected: { backgroundColor: PALETTE.verdeCard, borderColor: PALETTE.verdePrimario, borderWidth: 1.5 },
  biossólidoCheckbox: { width: 24, height: 24, borderRadius: 12, backgroundColor: PALETTE.branco, justifyContent: 'center', alignItems: 'center', marginRight: 16, borderWidth: 2, borderColor: PALETTE.cinzaClaro },
  checkmark: { fontSize: 14, fontWeight: '700', color: PALETTE.verdePrimario },
  biossólidoInfo: { flex: 1 },
  biossólidoHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  biossólidoMTR: { fontSize: 14, fontWeight: '700', color: PALETTE.preto },
  biossólidoData: { fontSize: 12, color: PALETTE.cinza, fontWeight: '500' },
  biossólidoFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  biossólidoOrigem: { fontSize: 12, fontWeight: '600', color: PALETTE.cinza },
  biossólidoPeso: { fontSize: 13, fontWeight: '800', color: PALETTE.verdePrimario },

  // PREVIEW CARD
  previewCard: { backgroundColor: PALETTE.verdeCard, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: PALETTE.verdePrimario },
  previewTitle: { fontSize: 14, fontWeight: '800', color: PALETTE.verdePrimario, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(46, 79, 54, 0.1)' },
  previewLabel: { fontSize: 13, color: PALETTE.preto, fontWeight: '600' },
  previewValue: { fontSize: 15, fontWeight: '800', color: PALETTE.verdePrimario },

  buttonGroup: { marginTop: 10 },
  buttonSpacer: { height: 12 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    marginBottom: 24,
    backgroundColor: PALETTE.verdePrimario,
    borderRadius: 16,
    height: 56,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: PALETTE.verdePrimario, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  addBtnIcon: { fontSize: 24, fontWeight: '700', color: PALETTE.branco },
  addBtnText: { fontSize: 16, fontWeight: '700', color: PALETTE.branco },

  // LISTAGEM DE LEIRAS
  listSection: { paddingHorizontal: 24 },
  listTitle: { fontSize: 18, fontWeight: '800', color: PALETTE.preto, marginBottom: 16, letterSpacing: -0.5 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 15, fontWeight: '600', color: PALETTE.cinza },
  emptyBiossólidos: { alignItems: 'center', paddingVertical: 30 },

  // LEIRA CARD
  leiraCard: {
    backgroundColor: PALETTE.branco,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  leiraHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  leiraNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  leiraNumber: { fontSize: 18, fontWeight: '900', color: PALETTE.preto },
  loteBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  loteBadgeText: { fontSize: 11, fontWeight: '800' },
  leiraData: { fontSize: 12, color: PALETTE.cinza, marginTop: 6, fontWeight: '500' },

  actionButtons: { flexDirection: 'row', gap: 8 },
  iconButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: PALETTE.verdeClaro, alignItems: 'center', justifyContent: 'center' },

  leiraStatusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 20 },
  leiraStatusText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  leiraDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: PALETTE.cinzaClaro },
  detailItem: { flex: 1, minWidth: '30%' },
  detailLabel: { fontSize: 10, color: PALETTE.cinza, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 14, fontWeight: '800', color: PALETTE.preto },

  // TIMELINE
  timeline: { paddingVertical: 8, borderLeftWidth: 2, borderLeftColor: PALETTE.cinzaClaro, paddingLeft: 16, marginLeft: 8 },
  timelineStep: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  timelineIcon: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginLeft: -29, backgroundColor: PALETTE.branco },
  timelineContent: { marginLeft: 16 },
  timelineLabel: { fontSize: 13, fontWeight: '600', color: PALETTE.preto },
  timelineDias: { fontSize: 11, color: PALETTE.cinza, marginTop: 2, fontWeight: '500' },

  // PISCINÃO GRID
  piscinaoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  piscinaoBtn: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: PALETTE.verdeClaro,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PALETTE.cinzaClaro
  },
  piscinaoBtnActive: {
    backgroundColor: `${PALETTE.azulPiscinao}10`,
    borderColor: PALETTE.azulPiscinao,
    borderWidth: 1.5
  },
  piscinaoIcon: { fontSize: 24, marginBottom: 8 },
  piscinaoText: { fontSize: 13, color: PALETTE.cinza, fontWeight: '700' },
  piscinaoTextActive: { color: PALETTE.azulPiscinao, fontWeight: '800' },

  // MODAL
  modalOverlay: { flex: 1, backgroundColor: 'rgba(26, 43, 34, 0.6)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: PALETTE.branco, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: PALETTE.preto, textAlign: 'center', marginBottom: 20 },
  modalInputBox: { backgroundColor: PALETTE.verdeClaro, borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: PALETTE.cinzaClaro },
  modalInput: { fontSize: 16, color: PALETTE.preto },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtnCancelar: { flex: 1, paddingVertical: 14, backgroundColor: PALETTE.verdeClaro, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: PALETTE.cinzaClaro },
  modalBtnCancelarText: { fontWeight: '700', color: PALETTE.cinza, fontSize: 15 },
  modalBtnConfirmar: { flex: 1, paddingVertical: 14, backgroundColor: PALETTE.verdePrimario, borderRadius: 12, alignItems: 'center' },
  modalBtnConfirmarText: { fontWeight: '700', color: PALETTE.branco, fontSize: 15 },
    // 🔥 ESTILOS DOS BOTÕES DE FILTRO (CHIPS)
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  filterChipActive: {
    backgroundColor: PALETTE.verdePrimario, // Usando a cor verde do seu projeto
    borderColor: PALETTE.verdePrimario,
  },
  filterChipText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
