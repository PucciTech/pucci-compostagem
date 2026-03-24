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
  const [numeroLeiraManual, setNumeroLeiraManual] = useState('');


  // Estados Modo Manual
  const [modoManual, setModoManual] = useState(false);

  const [pesoManualBio, setPesoManualBio] = useState('');
  const [pesoManualBagaco, setPesoManualBagaco] = useState('12');
  const [dataManual, setDataManual] = useState(new Date().toLocaleDateString('pt-BR'));

  
  // Estados Seleção de Piscinão / Local
  const [piscinaoSelecionado, setPiscinaoSelecionado] = useState('Piscinão 1');
  const [listaPiscinoes, setListaPiscinoes] = useState(['Piscinão 1', 'Piscinão 2', 'Piscinão 3', 'Piscinão 4', 'Pátio de Mistura', 'Depósito 1', 'Depósito 2']);
  const [showModalDestino, setShowModalDestino] = useState(false);

  // 🔥 ADICIONE ESTES ESTADOS AQUI (Eles resolvem o erro do estoquePatio)
  const [estoquePatio, setEstoquePatio] = useState(0);
  const [estoqueDep1, setEstoqueDep1] = useState(0);
  const [estoqueDep2, setEstoqueDep2] = useState(0);
  const [mtrsPatio, setMtrsPatio] = useState<string[]>([]);
  const [mtrsDep1, setMtrsDep1] = useState<string[]>([]);
  const [mtrsDep2, setMtrsDep2] = useState<string[]>([]);
  const [estoqueBagaco, setEstoqueBagaco] = useState(0); // 🔥 ADICIONE ESTA LINHA
  


  // Modal Novo Piscinão
  const [showModalNovoPiscinao, setShowModalNovoPiscinao] = useState(false);
  const [novoPiscinaoText, setNovoPiscinaoText] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  React.useEffect(() => {
    if (showForm) {
      const proximoNumero = leiras.length > 0 ? Math.max(...leiras.map(l => l.numeroLeira)) + 1 : 1;
      setNumeroLeiraManual(proximoNumero.toString());
    }
  }, [showForm, leiras]);

  const loadData = async () => {
    try {
      setLoading(true);

      const materiaisRegistrados = await AsyncStorage.getItem('materiaisRegistrados');
      const materiais = materiaisRegistrados ? JSON.parse(materiaisRegistrados) : [];

      let patio = 0; let dep1 = 0; let dep2 = 0; let bagaco = 0;
      let mPatio: string[] = []; let mDep1: string[] = []; let mDep2: string[] = [];

      const biossolidosDisponiveis = materiais.filter((item: any) => {
        if (item.usado) return false;

        const destinoItem = item.destino ? item.destino.trim() : '';

        // Lógica da Mistura
        if (item.tipoMaterial === 'Mistura Preparada' || ['Pátio de Mistura', 'Depósito 1', 'Depósito 2'].includes(destinoItem)) {
          const peso = parsePeso(item.peso); 
          if (destinoItem === 'Pátio de Mistura') { patio += peso; if (item.mtrsOriginais) mPatio.push(...item.mtrsOriginais); }
          else if (destinoItem === 'Depósito 1') { dep1 += peso; if (item.mtrsOriginais) mDep1.push(...item.mtrsOriginais); }
          else if (destinoItem === 'Depósito 2') { dep2 += peso; if (item.mtrsOriginais) mDep2.push(...item.mtrsOriginais); }
          return false; 
        }

        // 🔥 LÓGICA DO BAGAÇO: Soma o estoque e esconde da lista
        if (item.tipoMaterial && item.tipoMaterial.includes('Bagaço')) {
          bagaco += parsePeso(item.peso);
          return false;
        }

        const tipo = item.tipoMaterial ? item.tipoMaterial.toLowerCase() : '';
        const origem = item.origem ? item.origem.toLowerCase() : '';
        const mtr = item.numeroMTR ? item.numeroMTR.toLowerCase() : '';

        const ehBiossolido = tipo.includes('bio') || tipo.includes('lodo');
        const ehPiscinao = destinoItem.toLowerCase().includes('piscin') || destinoItem.toLowerCase().includes('estoque') || origem.includes('piscin') || origem.includes('manual') || tipo.includes('piscin') || mtr.includes('manual');

        return ehBiossolido && !ehPiscinao;
      });

      setEstoquePatio(patio); setEstoqueDep1(dep1); setEstoqueDep2(dep2); 
      setEstoqueBagaco(bagaco); // 🔥 ATUALIZA O ESTADO DO BAGAÇO
      
      setMtrsPatio([...new Set(mPatio)]); setMtrsDep1([...new Set(mDep1)]); setMtrsDep2([...new Set(mDep2)]);
      
      const biossolidosOrdenados = biossolidosDisponiveis.sort((a: any, b: any) => Number(b.id) - Number(a.id));
      setBiossólidos(biossolidosOrdenados);

      // Carregar Leiras
      const leirasRegistradas = await AsyncStorage.getItem('leirasFormadas');
      const leirasData = leirasRegistradas ? JSON.parse(leirasRegistradas) : [];
      const leirasAtivas = leirasData.filter((l: any) => !['arquivada', 'finalizada'].includes(l.status?.toLowerCase() || ''));
      setLeiras(leirasAtivas.sort((a: any, b: any) => Number(b.id) - Number(a.id)));

      // Destinos
      const destinosSalvos = await AsyncStorage.getItem('listaDestinos');
      if (destinosSalvos) {
        const todos = JSON.parse(destinosSalvos);
        const locaisValidos = todos.filter((d: string) => d.toLowerCase().includes('piscin') || d.toLowerCase().includes('tanque') || d.toLowerCase().includes('pátio') || d.toLowerCase().includes('depósito'));
        const padroes = ['Piscinão 1', 'Piscinão 2', 'Piscinão 3', 'Piscinão 4', 'Pátio de Mistura', 'Depósito 1', 'Depósito 2'];
        const listaFinal = Array.from(new Set([...padroes, ...locaisValidos]));
        setListaPiscinoes(listaFinal);
        if (!listaFinal.includes(piscinaoSelecionado)) setPiscinaoSelecionado(listaFinal[0]);
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
    const isGranel = ['Pátio de Mistura', 'Depósito 1', 'Depósito 2'].includes(piscinaoSelecionado);
    
    // 🔥 CAPTURA E VALIDA O NÚMERO DA LEIRA
    const numeroFinal = parseInt(numeroLeiraManual);
    if (!numeroFinal || numeroFinal <= 0) {
      Alert.alert('Atenção', 'Informe um número de leira válido.');
      return;
    }

    // 🔥 VERIFICA SE O NÚMERO JÁ EXISTE
    if (leiras.some(l => l.numeroLeira === numeroFinal)) {
      Alert.alert('Atenção', `A Leira #${numeroFinal} já existe. Por favor, escolha outro número.`);
      return;
    }

    // Variável para saber quanto de bagaço vamos descontar
    let bagacoUtilizado = 0;

    if (modoManual) {
      const pesoBio = parsePeso(pesoManualBio);
      const pesoBagaco = parsePeso(pesoManualBagaco); 
      bagacoUtilizado = pesoBagaco;

      if (pesoBio <= 0) { Alert.alert('Atenção', 'Informe o peso do material.'); return; }
      if (!dataManual.trim()) { Alert.alert('Atenção', 'Informe a data de formação.'); return; }

      // Validação do Estoque de Bagaço
      if (pesoBagaco > estoqueBagaco) {
        Alert.alert('Estoque Insuficiente', `Você tem apenas ${estoqueBagaco.toFixed(2)}t de bagaço disponível.`);
        return;
      }

      if (isGranel) {
        let estoqueDisponivel = 0;
        let mtrsHerdados: string[] = [];

        if (piscinaoSelecionado === 'Pátio de Mistura') { estoqueDisponivel = estoquePatio; mtrsHerdados = mtrsPatio; } 
        else if (piscinaoSelecionado === 'Depósito 1') { estoqueDisponivel = estoqueDep1; mtrsHerdados = mtrsDep1; } 
        else if (piscinaoSelecionado === 'Depósito 2') { estoqueDisponivel = estoqueDep2; mtrsHerdados = mtrsDep2; }

        if (pesoBio > estoqueDisponivel) {
          Alert.alert('Estoque Insuficiente', `Apenas ${estoqueDisponivel.toFixed(2)}t disponíveis no ${piscinaoSelecionado}.`);
          return;
        }

        novaLeira = {
          id: Date.now().toString(),
          numeroLeira: numeroFinal, // 🔥 USA O NÚMERO DIGITADO
          lote: calcularLote([]),
          dataFormacao: dataManual,
          status: 'formada',
          pesoFormacao: pesoBio,
          origemMaterial: piscinaoSelecionado,
          mtrsOriginais: mtrsHerdados,
          biossólidos: [],
          bagaço: pesoBagaco,
          totalBiossólido: pesoBio,
          tipoFormacao: piscinaoSelecionado 
        } as any;
      } else {
        const itemManual: BiossólidoEntry = {
          id: `manual-${Date.now()}`, data: dataManual, numeroMTR: 'MANUAL', peso: pesoBio.toString(), origem: 'Estoque Interno', destino: piscinaoSelecionado, tipoMaterial: 'Biossólido'
        };

        novaLeira = {
          id: Date.now().toString(),
          numeroLeira: numeroFinal, // 🔥 USA O NÚMERO DIGITADO
          lote: calcularLote([]),
          dataFormacao: dataManual,
          biossólidos: [itemManual],
          bagaço: pesoBagaco,
          status: 'formada',
          totalBiossólido: pesoBio,
          tipoFormacao: piscinaoSelecionado,
          origemPiscinao: piscinaoSelecionado
        };
      }
    } else {
      bagacoUtilizado = 12; // MTR usa 12t fixo
      
      if (selectedBiossólidos.length < 3 || selectedBiossólidos.length > 4) {
        Alert.alert('Atenção', 'Selecione 3 ou 4 viagens para formar a leira.');
        return;
      }

      // Validação do Estoque de Bagaço para MTR
      if (bagacoUtilizado > estoqueBagaco) {
        Alert.alert('Estoque Insuficiente', `São necessárias 12t de bagaço, mas você tem apenas ${estoqueBagaco.toFixed(2)}t.`);
        return;
      }

      const biossólidosSelecionados = biossólidos.filter((item) => selectedBiossólidos.includes(item.id));
      const totalBiossólido = biossólidosSelecionados.reduce((acc, item) => acc + parsePeso(item.peso), 0);

      novaLeira = {
        id: Date.now().toString(),
        numeroLeira: numeroFinal, // 🔥 USA O NÚMERO DIGITADO
        lote: calcularLote(biossólidosSelecionados),
        dataFormacao: new Date().toLocaleDateString('pt-BR'),
        biossólidos: biossólidosSelecionados,
        bagaço: 12,
        status: 'formada',
        totalBiossólido: totalBiossólido,
        tipoFormacao: 'MTR'
      };
    }

    try {
      const leirasRegistradas = await AsyncStorage.getItem('leirasFormadas');
      const leirasData = leirasRegistradas ? JSON.parse(leirasRegistradas) : [];
      leirasData.push(novaLeira);
      await AsyncStorage.setItem('leirasFormadas', JSON.stringify(leirasData));
      await syncService.adicionarFila('leira', novaLeira);

      const materiaisRegistrados = await AsyncStorage.getItem('materiaisRegistrados');
      if (materiaisRegistrados) {
        let materiais = JSON.parse(materiaisRegistrados);
        
        // 1. DESCONTA O BAGAÇO
        if (bagacoUtilizado > 0) {
           const bagacoDisponivel = materiais.filter((m: any) => m.tipoMaterial && m.tipoMaterial.includes('Bagaço') && !m.usado);
           
           materiais = materiais.map((m: any) => {
             if (bagacoDisponivel.some((b: any) => b.id === m.id)) {
               const atualizado = { ...m, usado: true, sincronizado: false };
               syncService.adicionarFila('material', atualizado);
               return atualizado;
             }
             return m;
           });

           const saldoRestanteBagaco = estoqueBagaco - bagacoUtilizado;
           if (saldoRestanteBagaco > 0) {
             const loteRestanteBagaco = {
               id: `bagaco-${Date.now()}`,
               data: modoManual ? dataManual : new Date().toLocaleDateString('pt-BR'),
               tipoMaterial: 'Bagaço de Cana',
               numeroMTR: 'SALDO REMANESCENTE',
               peso: saldoRestanteBagaco.toFixed(2),
               origem: 'Estoque Interno',
               destino: 'Depósito',
               sincronizado: false,
               usado: false,
               mtrsOriginais: []
             };
             materiais.push(loteRestanteBagaco);
             await syncService.adicionarFila('material', loteRestanteBagaco);
           }
        }

        // 2. DESCONTA O PÁTIO/DEPÓSITO
        if (modoManual && isGranel) {
          const lotesDaOrigem = materiais.filter((m: any) => {
            const destinoItem = m.destino ? m.destino.trim() : '';
            const isMistura = m.tipoMaterial === 'Mistura Preparada' || ['Pátio de Mistura', 'Depósito 1', 'Depósito 2'].includes(destinoItem);
            return isMistura && destinoItem === piscinaoSelecionado && !m.usado;
          });
          
          materiais = materiais.map((m: any) => {
            if (lotesDaOrigem.some((l: any) => l.id === m.id)) {
              const atualizado = { ...m, usado: true, sincronizado: false };
              syncService.adicionarFila('material', atualizado);
              return atualizado;
            }
            return m;
          });

          const saldoRestante = (piscinaoSelecionado === 'Pátio de Mistura' ? estoquePatio : piscinaoSelecionado === 'Depósito 1' ? estoqueDep1 : estoqueDep2) - parsePeso(pesoManualBio);
          
          if (saldoRestante > 0) {
            const loteRestante = {
              id: `mistura-${Date.now() + 1}`, 
              data: dataManual, 
              tipoMaterial: 'Mistura Preparada', 
              numeroMTR: 'SALDO REMANESCENTE', 
              peso: saldoRestante.toFixed(2), 
              origem: 'Processo Interno', 
              destino: piscinaoSelecionado, 
              sincronizado: false, 
              usado: false, 
              mtrsOriginais: (novaLeira as any).mtrsOriginais || []
            };
            materiais.push(loteRestante);
            await syncService.adicionarFila('material', loteRestante);
          }
        } 
        // 3. CARIMBA OS CAMINHÕES (MTR)
        else if (!modoManual) {
          materiais = materiais.map((item: any) => {
            if (selectedBiossólidos.includes(item.id)) {
              const atualizado = { ...item, usado: true }; 
              syncService.adicionarFila('material', atualizado);
              return atualizado;
            }
            return item; 
          });
        }

        // Salva tudo de uma vez no final
        await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(materiais));
      }

      setPesoManualBio(''); setPesoManualBagaco(''); setDataManual(new Date().toLocaleDateString('pt-BR'));
      setSelectedBiossólidos([]); setShowForm(false);
      
      if (typeof loadData === 'function') await loadData();

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

  const isGranel = ['Pátio de Mistura', 'Depósito 1', 'Depósito 2'].includes(piscinaoSelecionado);
  const saldoAtual = piscinaoSelecionado === 'Pátio de Mistura' ? estoquePatio : piscinaoSelecionado === 'Depósito 1' ? estoqueDep1 : piscinaoSelecionado === 'Depósito 2' ? estoqueDep2 : 0;

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
              <Text style={styles.infoText}>Use MTRs do estoque ou registre manualmente (Piscinão/Pátio)</Text>
            </View>
          </View>

          <View style={styles.statsContainer}>
            <StatBox label="Leiras Criadas" value={leiras.length.toString()} color={PALETTE.verdePrimario} />
            <StatBox label="Mat. Disponível" value={biossólidos.length.toString()} color={biossólidos.length >= 3 ? PALETTE.sucesso : PALETTE.warning} />
          </View>

          {showForm ? (
            <View style={styles.formCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={[styles.formTitle, { marginBottom: 0 }]}>Formar Nova Leira</Text>
              </View>

              {/* 🔥 CAMPO NÚMERO DA LEIRA (COMPARTILHADO PARA OS DOIS MODOS) */}
              <Text style={styles.inputLabel}>Número da Leira</Text>
              <View style={[styles.inputWrapper, { marginBottom: 20 }]}>
                <MaterialCommunityIcons name="identifier" size={20} color={PALETTE.cinza} style={{ marginRight: 8 }} />
                <RNTextInput
                  style={styles.input}
                  value={numeroLeiraManual}
                  onChangeText={setNumeroLeiraManual}
                  placeholder="Ex: 105"
                  keyboardType="numeric"
                />
              </View>

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

                  {/* CAMPO CLICÁVEL (DROPDOWN) */}
                  <TouchableOpacity 
                    style={[styles.inputWrapper, { justifyContent: 'space-between', marginBottom: isGranel ? 8 : 16 }]} 
                    onPress={() => setShowModalDestino(true)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialCommunityIcons 
                        name={piscinaoSelecionado.toLowerCase().includes('piscin') || piscinaoSelecionado.toLowerCase().includes('tanque') ? 'water' : piscinaoSelecionado.toLowerCase().includes('pátio') ? 'pot-mix' : 'warehouse'} 
                        size={20} 
                        color={PALETTE.verdePrimario} 
                        style={{ marginRight: 10 }} 
                      />
                      <Text style={styles.input}>{piscinaoSelecionado}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-down" size={24} color={PALETTE.cinza} />
                  </TouchableOpacity>

                  {/* 🔥 EXIBIÇÃO DO SALDO DISPONÍVEL (Aparece apenas para Pátio/Depósitos) */}
                  {isGranel && (
                    <Text style={{ color: PALETTE.cinza, fontSize: 13, textAlign: 'right', marginBottom: 16, marginTop: -4 }}>
                      Saldo disponível: <Text style={{ fontWeight: '900', color: PALETTE.verdePrimario }}>{saldoAtual.toFixed(2)} ton</Text>
                    </Text>
                  )}

                  <Text style={styles.inputLabel}>Data de Formação</Text>
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

                  <Text style={styles.inputLabel}>Peso do Material {isGranel ? '(Mistura Pronta)' : '(Piscinão/Bio)'}</Text>
                  <View style={styles.inputWrapper}>
                    <RNTextInput
                      style={styles.input}
                      value={pesoManualBio}
                      onChangeText={setPesoManualBio}
                      placeholder={isGranel ? `Máx: ${saldoAtual.toFixed(2)}` : "0.0"}
                      keyboardType="numeric"
                    />
                    <Text style={styles.unitText}>ton</Text>
                  </View>

                  {/* 🔥 CAMPO DE BAGAÇO COM ESTOQUE VISÍVEL */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16 }}>
                    <Text style={[styles.inputLabel, { marginTop: 0 }]}>
                      {isGranel ? 'Peso do Bagaço Extra (Opcional)' : 'Peso do Bagaço (Opcional)'}
                    </Text>
                    <Text style={{ color: PALETTE.cinza, fontSize: 12, marginBottom: 8 }}>
                      Estoque: <Text style={{ fontWeight: 'bold', color: PALETTE.terracota }}>{estoqueBagaco.toFixed(2)}t</Text>
                    </Text>
                  </View>
                  <View style={styles.inputWrapper}>
                    <RNTextInput
                      style={styles.input}
                      value={pesoManualBagaco}
                      onChangeText={setPesoManualBagaco}
                      placeholder={`Máx: ${estoqueBagaco.toFixed(2)}`}
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={[styles.listTitle, { marginBottom: 0, flex: 1 }]}>
                {buscaLeira.trim() ? `Resultados (${leirasParaExibir.length})` : 'Leiras Formadas'}
              </Text>
              
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.filterChip, filtroLeiras === 'hoje' && styles.filterChipActive]}
                  onPress={() => setFiltroLeiras('hoje')}
                >
                  <Text style={[styles.filterChipText, filtroLeiras === 'hoje' && styles.filterChipTextActive]}>Criadas Hoje</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, filtroLeiras === 'todas' && styles.filterChipActive]}
                  onPress={() => setFiltroLeiras('todas')}
                >
                  <Text style={[styles.filterChipText, filtroLeiras === 'todas' && styles.filterChipTextActive]}>Todas Ativas</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.branco, borderWidth: 1, borderColor: PALETTE.cinzaClaro, borderRadius: 12, paddingHorizontal: 12, marginBottom: 16, height: 48 }}>
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

            {leirasParaExibir.length > 0 ? (
              leirasParaExibir.map((leira) => (
                <LeiraCard key={leira.id} leira={leira} onDelete={() => handleExcluirLeira(leira)} />
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

      {/* MODAL DE NOVO PISCINÃO */}
      <Modal visible={showModalNovoPiscinao} transparent animationType="fade" onRequestClose={() => setShowModalNovoPiscinao(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Local</Text>
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

      {/* 🔥 NOVO MODAL DE SELEÇÃO DE LOCAL (CATEGORIZADO) */}
      <Modal visible={showModalDestino} transparent animationType="fade" onRequestClose={() => setShowModalDestino(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Selecione o Local</Text>
            
            <ScrollView style={{ maxHeight: 450, marginBottom: 20 }} showsVerticalScrollIndicator={false}>
              
              {/* FUNÇÃO PARA RENDERIZAR CADA ITEM */}
              {(() => {
                const renderItem = (item: string) => (
                  <TouchableOpacity 
                    key={item} 
                    style={{
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: PALETTE.cinzaClaro,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                    onPress={() => {
                      setPiscinaoSelecionado(item);
                      setShowModalDestino(false);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialCommunityIcons 
                        name={item.toLowerCase().includes('piscin') || item.toLowerCase().includes('tanque') ? 'water' : item.toLowerCase().includes('pátio') ? 'pot-mix' : 'warehouse'} 
                        size={22} 
                        color={piscinaoSelecionado === item ? PALETTE.verdePrimario : PALETTE.cinza} 
                        style={{ marginRight: 12 }} 
                      />
                      <Text style={{ 
                        fontSize: 15, 
                        color: piscinaoSelecionado === item ? PALETTE.verdePrimario : PALETTE.preto,
                        fontWeight: piscinaoSelecionado === item ? 'bold' : '500'
                      }}>
                        {item}
                      </Text>
                    </View>
                    {piscinaoSelecionado === item && (
                      <MaterialCommunityIcons name="check-circle" size={22} color={PALETTE.verdePrimario} />
                    )}
                  </TouchableOpacity>
                );

                // FILTRANDO AS CATEGORIAS
                const piscinoes = listaPiscinoes.filter(i => i.toLowerCase().includes('piscin') || i.toLowerCase().includes('tanque'));
                const patios = listaPiscinoes.filter(i => i.toLowerCase().includes('pátio'));
                const depositos = listaPiscinoes.filter(i => i.toLowerCase().includes('depósito'));
                const outros = listaPiscinoes.filter(i => !piscinoes.includes(i) && !patios.includes(i) && !depositos.includes(i));

                return (
                  <View>
                    {/* SESSÃO: PISCINÕES */}
                    {piscinoes.length > 0 && (
                      <View style={{ marginBottom: 16 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: PALETTE.cinza, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>💧 Piscinões e Tanques</Text>
                        {piscinoes.map(renderItem)}
                      </View>
                    )}

                    {/* SESSÃO: PÁTIO DE MISTURA */}
                    {patios.length > 0 && (
                      <View style={{ marginBottom: 16 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: PALETTE.cinza, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>🏗️ Pátio de Mistura</Text>
                        {patios.map(renderItem)}
                      </View>
                    )}

                    {/* SESSÃO: DEPÓSITOS */}
                    {depositos.length > 0 && (
                      <View style={{ marginBottom: 16 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: PALETTE.cinza, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>🏭 Depósitos</Text>
                        {depositos.map(renderItem)}
                      </View>
                    )}

                    {/* SESSÃO: OUTROS */}
                    {outros.length > 0 && (
                      <View style={{ marginBottom: 16 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: PALETTE.cinza, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>📍 Outros Locais</Text>
                        {outros.map(renderItem)}
                      </View>
                    )}
                  </View>
                );
              })()}

            </ScrollView>

            {/* 🔥 BOTÃO FECHAR RESTAURADO */}
            <TouchableOpacity style={styles.modalBtnCancelar} onPress={() => setShowModalDestino(false)}>
              <Text style={styles.modalBtnCancelarText}>Fechar</Text>
            </TouchableOpacity>

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