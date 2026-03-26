import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    TextInput as RNTextInput,
    Modal,
    ActivityIndicator,
    Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncService } from '@/services/sync';
import { useFocusEffect } from '@react-navigation/native';
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
    warning: '#F59E0B',
    warningClaro: '#FEF5E7',
    info: '#0D6EFD',
    infoClaro: '#E7F1FF',
    azulPiscinao: '#0D6EFD',
};

interface MaterialEntry {
    id: string;
    data: string;
    tipoMaterial: string;
    numeroMTR: string;
    peso: string;
    origem: string;
    destino: string;
    sincronizado?: boolean;
    deletado?: boolean;
    usado?: boolean;
}

export default function EntradaMaterialScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);



    

    // Modais

    const [showModalNovaOrigem, setShowModalNovaOrigem] = useState(false);
    const [novaOrigemText, setNovaOrigemText] = useState('');

    const [showModalNovoDestino, setShowModalNovoDestino] = useState(false);
    const [novoDestinoText, setNovoDestinoText] = useState('');

    const [entries, setEntries] = useState<MaterialEntry[]>([]);

    // Listas de Opções
    const [origens, setOrigens] = useState(['Sabesp', 'Ambient']);

    // 1. Atualize a lista de destinos com os novos locais
    const [destinos, setDestinos] = useState([
        'Pátio Normal',
        'Pátio de Mistura',
        'Piscinão 1',
        'Piscinão 2',
        'Piscinão 3',
        'Piscinão 4',
        'Depósito 1',
        'Depósito 2',
        'Estoque Bagaço'
    ]);
        // 🔥 NOVO ESTADO: Filtro de Período (Padrão: 30 dias)
    const [filtroPeriodo, setFiltroPeriodo] = useState('mes'); // 'hoje', 'semana', 'mes', 'todos'
    const [buscaMTR, setBuscaMTR] = useState(''); // <-- ADICIONE ESTA LINHA

    const [editingId, setEditingId] = useState<string | null>(null);

    // 2. 🔥 ADICIONE ESTE NOVO ESTADO AQUI
    const [categoriaDestino, setCategoriaDestino] = useState('Pátio Normal');

    // 3. Atualize o destino inicial do formData
    const [formData, setFormData] = useState({
        data: new Date().toLocaleDateString('pt-BR'),
        tipoMaterial: 'Biossólido',
        numeroMTR: '',
        peso: '',
        origem: 'Sabesp',
        destino: 'Pátio Normal' // <-- Mude de 'Pátio' para 'Pátio Normal'
    });


    // ===== CARREGAR DADOS =====

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

        const loadData = async () => {
        try {
            setLoading(true);

            const registrosExistentes = await AsyncStorage.getItem('materiaisRegistrados');
            if (registrosExistentes) {
                const materiais = JSON.parse(registrosExistentes);

                // 🔥 NOVO FILTRO: Traz TODOS os materiais (usados e não usados)
                // MAS continua ignorando as "Misturas Preparadas" para não poluir a tela de entrada
                const materiaisParaMostrar = materiais.filter((m: any) => m.tipoMaterial !== 'Mistura Preparada');      

                // Ordena do mais recente para o mais antigo
                const materiaisOrdenados = materiaisParaMostrar.sort((a: any, b: any) => Number(b.id) - Number(a.id));

                // Atualiza a tela com todos os materiais
                setEntries(materiaisOrdenados);
            } else {
                setEntries([]);
            }

            // Carregar destinos garantindo que as novas opções padrão existam
            const destinosSalvos = await AsyncStorage.getItem('listaDestinos');
            if (destinosSalvos) {
                const saved = JSON.parse(destinosSalvos);
                const defaults = [
                    'Pátio Normal',
                    'Pátio de Mistura',
                    'Piscinão 1',
                    'Piscinão 2',
                    'Piscinão 3',
                    'Piscinão 4',
                    'Depósito 1',
                    'Depósito 2',
                    'Estoque Bagaço'
                ];
                // Junta os padrões com os que o usuário já tinha criado, sem duplicar
                const merged = Array.from(new Set([...defaults, ...saved]));
                setDestinos(merged);
            }

            const origensSalvas = await AsyncStorage.getItem('listaOrigens');
            if (origensSalvas) setOrigens(JSON.parse(origensSalvas));

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const formatarData = (text: string) => {
        let formatted = text.replace(/\D/g, '');
        if (formatted.length <= 2) return formatted;
        if (formatted.length <= 4) return formatted.slice(0, 2) + '/' + formatted.slice(2);
        return formatted.slice(0, 2) + '/' + formatted.slice(2, 4) + '/' + formatted.slice(4, 8);
    };
       
        // ===== 🔥 LÓGICA DE FILTRAGEM POR DATA E MTR =====
    const entradasFiltradas = useMemo(() => {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        return entries.filter(entry => {
            // 1. Filtro de Busca por MTR (Se tiver algo digitado)
            if (buscaMTR.trim() !== '') {
                const mtr = entry.numeroMTR ? entry.numeroMTR.toLowerCase() : '';
                // Se o MTR não contiver o texto buscado, já descarta este item
                if (!mtr.includes(buscaMTR.toLowerCase().trim())) {
                    return false; 
                }
            }

            // 2. Filtro de Período
            if (filtroPeriodo === 'todos') return true;

            const [dia, mes, ano] = entry.data.split('/');
            if (!dia || !mes || !ano) return true;

            const dataEntry = new Date(Number(ano), Number(mes) - 1, Number(dia));
            dataEntry.setHours(0, 0, 0, 0);

            const diffTime = hoje.getTime() - dataEntry.getTime();
            const diffDias = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (filtroPeriodo === 'hoje') return diffDias === 0;
            if (filtroPeriodo === 'semana') return diffDias >= 0 && diffDias <= 7;
            if (filtroPeriodo === 'mes') return diffDias >= 0 && diffDias <= 30;
            
            return true;
        });
    }, [entries, filtroPeriodo, buscaMTR]); // <-- Não esqueça de adicionar o buscaMTR aqui no array de dependências

    const validarData = (data: string): boolean => {
        if (data.length !== 10) return false;
        const [dia, mês, ano] = data.split('/').map(Number);
        if (dia < 1 || dia > 31) return false;
        if (mês < 1 || mês > 12) return false;
        if (ano < 2020 || ano > 2100) return false;
        return true;
    };

    const handleAddNovaOrigem = async () => {
        if (!novaOrigemText.trim()) { Alert.alert('Erro', 'Digite o nome da origem'); return; }
        if (origens.includes(novaOrigemText)) { Alert.alert('Aviso', 'Esta origem já existe'); setNovaOrigemText(''); return; }

        const novaLista = [...origens, novaOrigemText];
        setOrigens(novaLista);
        setFormData({ ...formData, origem: novaOrigemText });
        await AsyncStorage.setItem('listaOrigens', JSON.stringify(novaLista));

        setNovaOrigemText('');
        setShowModalNovaOrigem(false);
    };

    const handleAddNovoDestino = async () => {
        if (!novoDestinoText.trim()) { Alert.alert('Erro', 'Digite o nome do destino'); return; }
        if (destinos.includes(novoDestinoText)) { Alert.alert('Aviso', 'Este destino já existe'); setNovoDestinoText(''); return; }

        const novaLista = [...destinos, novoDestinoText];
        setDestinos(novaLista);
        setFormData({ ...formData, destino: novoDestinoText });
        await AsyncStorage.setItem('listaDestinos', JSON.stringify(novaLista));

        setNovoDestinoText('');
        setShowModalNovoDestino(false);
    };

    const handleTipoChange = (tipo: string) => {
        if (tipo === 'Bagaço de Cana') {
            setFormData({
                ...formData,
                tipoMaterial: tipo,
                numeroMTR: '',
                origem: 'Sabesp',
                destino: 'Estoque Bagaço'
            });
        } else {
            setCategoriaDestino('Pátio Normal'); // 🔥 Define a categoria padrão
            setFormData({
                ...formData,
                tipoMaterial: tipo,
                numeroMTR: '',
                origem: 'Sabesp',
                destino: 'Pátio Normal' // 🔥 Atualizado para Pátio Normal
            });
        }
    };

    const getDestinosFiltrados = () => {
        if (formData.tipoMaterial === 'Biossólido') {
            if (categoriaDestino === 'Depósito') {
                return destinos.filter(d =>
                    d.toLowerCase().includes('piscin') ||
                    d.toLowerCase().includes('depósito') ||
                    d.toLowerCase().includes('mistura') ||
                    d.toLowerCase().includes('tanque')
                );
            }
            return []; // Pátio Normal não tem sub-lista
        } else {
            return destinos.filter(d => d.toLowerCase().includes('bagaço') || d.toLowerCase().includes('estoque'));
        }
    };

    const isMtrObrigatorio = () => {
        if (formData.tipoMaterial !== 'Biossólido') return false;
        if (categoriaDestino === 'Pátio Normal') return true;
        if (categoriaDestino === 'Depósito' && formData.destino === 'Pátio de Mistura') return true;
        return false;
    };

    const isDestinoPiscinao = (destino: string) => {
        return destino.toLowerCase().includes('piscin') || destino.toLowerCase().includes('tanque');
    };

    const handleSaveMaterial = async () => {
        if (!formData.data.trim()) { Alert.alert('Erro', 'Digite a data'); return; }
        if (!validarData(formData.data)) { Alert.alert('Erro', 'Data inválida'); return; }

        // 🔥 NOVA LÓGICA DE VALIDAÇÃO DO MTR
        const mtrObrigatorio = isMtrObrigatorio();

        if (mtrObrigatorio && !formData.numeroMTR.trim()) {
            Alert.alert('Erro', 'O número do MTR é obrigatório para este destino.');
            return;
        }

        const pesoNumerico = parseFloat(formData.peso.replace(',', '.').trim());
        if (!formData.peso.trim() || isNaN(pesoNumerico) || pesoNumerico < 0) {
            Alert.alert('Erro', 'Peso inválido'); return;
        }

        const newEntry: MaterialEntry = {
            id: editingId || Date.now().toString(),
            data: formData.data,
            tipoMaterial: formData.tipoMaterial,
            numeroMTR: formData.numeroMTR || 'S/N',
            peso: formData.peso,
            origem: formData.origem,
            destino: formData.destino,
            sincronizado: false,
            usado: false // 🔥 GARANTIA: Todo material novo nasce como "não usado"
        };

        try {
            // 🔥 CORREÇÃO CRÍTICA: Buscar TODOS os materiais do banco primeiro
            const registrosExistentes = await AsyncStorage.getItem('materiaisRegistrados');
            let todosMateriais: MaterialEntry[] = registrosExistentes ? JSON.parse(registrosExistentes) : [];

            if (editingId) {
                // Atualiza o item no banco completo
                todosMateriais = todosMateriais.map(item => item.id === editingId ? newEntry : item);
            } else {
                // Adiciona o novo item no banco completo
                todosMateriais.push(newEntry);
            }

            // Salva o banco completo (sem perder os usados e as misturas)
            await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(todosMateriais));
            
            // 📝 ==========================================
            // SENSOR 3: ENTRADA DE MATERIAL NOVO (BAGAÇO)
            // ==========================================
            if (!editingId && formData.tipoMaterial.includes('Bagaço')) {
                const extratoSalvo = await AsyncStorage.getItem('extratoBagaco');
                const extrato = extratoSalvo ? JSON.parse(extratoSalvo) : [];
                extrato.push({
                    id: Date.now().toString(),
                    data: new Date().toLocaleDateString('pt-BR'),
                    hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    tipo: 'ENTRADA',
                    quantidade: pesoNumerico,
                    motivo: `Entrada de Material - Origem: ${formData.origem}`
                });
                await AsyncStorage.setItem('extratoBagaco', JSON.stringify(extrato));
            }
            // ==========================================

            await syncService.adicionarFila('material', newEntry);

            // Atualiza apenas a lista visual da tela (entries)
            let novaListaVisual = [...entries];
            if (editingId) {
                novaListaVisual = novaListaVisual.map(item => item.id === editingId ? newEntry : item);
            } else {
                novaListaVisual = [newEntry, ...novaListaVisual]; // Adiciona no topo da lista visual
            }

            setEntries(novaListaVisual);
            resetForm();

            Alert.alert('Sucesso! ✅', editingId ? 'Registro atualizado!' : 'Material registrado!');

        } catch (error) {
            Alert.alert('Erro', 'Não foi possível salvar o material');
        }
    };
    const handleEdit = (item: MaterialEntry) => {
        setFormData({
            data: item.data,
            tipoMaterial: item.tipoMaterial,
            numeroMTR: item.numeroMTR === 'S/N' ? '' : item.numeroMTR,
            peso: item.peso,
            origem: item.origem,
            destino: item.destino
        });
        setEditingId(item.id);
        setShowForm(true);
    };

    
    // ===== LÓGICA DE EXCLUSÃO DE MATERIAL =====
    const handleDelete = (id: string) => {
        Alert.alert(
            'Excluir Material',
            'Como deseja excluir este registro?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Apenas Local',
                    onPress: async () => {
                        try {
                            const registrosExistentes = await AsyncStorage.getItem('materiaisRegistrados');
                            if (registrosExistentes) {
                                const materiais = JSON.parse(registrosExistentes);
                                
                                // 🔥 Captura o item antes de deletar para o Sensor
                                const itemDeletado = materiais.find((m: any) => m.id === id);
                                
                                const novosMateriais = materiais.filter((m: any) => m.id !== id);
                                await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(novosMateriais));
                                setEntries(novosMateriais);

                                // 📝 ==========================================
                                // SENSOR: ESTORNO DE ENTRADA (SAÍDA DE CORREÇÃO)
                                // ==========================================
                                if (itemDeletado && itemDeletado.tipoMaterial.includes('Bagaço')) {
                                    const extratoSalvo = await AsyncStorage.getItem('extratoBagaco');
                                    const extrato = extratoSalvo ? JSON.parse(extratoSalvo) : [];
                                    extrato.push({
                                        id: Date.now().toString(),
                                        data: new Date().toLocaleDateString('pt-BR'),
                                        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                                        tipo: 'SAIDA',
                                        quantidade: parseFloat(itemDeletado.peso.replace(',', '.')),
                                        motivo: 'Exclusão de Registro de Entrada (Correção)'
                                    });
                                    await AsyncStorage.setItem('extratoBagaco', JSON.stringify(extrato));
                                }
                                // ==========================================

                                Alert.alert('Sucesso', 'Material excluído apenas deste aparelho.');
                            }
                        } catch (error) {
                            Alert.alert('Erro', 'Não foi possível excluir o material localmente.');
                        }
                    }
                },
                {
                    text: 'Excluir Total (Nuvem)',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const registrosExistentes = await AsyncStorage.getItem('materiaisRegistrados');
                            if (registrosExistentes) {
                                const materiais = JSON.parse(registrosExistentes);
                                
                                // 🔥 Captura o item antes de deletar para o Sensor
                                const itemDeletado = materiais.find((m: any) => m.id === id);
                                
                                const novosMateriais = materiais.filter((m: any) => m.id !== id);
                                await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(novosMateriais));
                                setEntries(novosMateriais);

                                // 📝 ==========================================
                                // SENSOR: ESTORNO DE ENTRADA (SAÍDA DE CORREÇÃO)
                                // ==========================================
                                if (itemDeletado && itemDeletado.tipoMaterial.includes('Bagaço')) {
                                    const extratoSalvo = await AsyncStorage.getItem('extratoBagaco');
                                    const extrato = extratoSalvo ? JSON.parse(extratoSalvo) : [];
                                    extrato.push({
                                        id: Date.now().toString(),
                                        data: new Date().toLocaleDateString('pt-BR'),
                                        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                                        tipo: 'SAIDA',
                                        quantidade: parseFloat(itemDeletado.peso.replace(',', '.')),
                                        motivo: 'Exclusão de Registro de Entrada (Correção)'
                                    });
                                    await AsyncStorage.setItem('extratoBagaco', JSON.stringify(extrato));
                                }
                                // ==========================================

                                await syncService.adicionarFila('material' as any, { 
                                    id: id,
                                    deletado: true 
                                });

                                Alert.alert('Sucesso', 'Material excluído e exclusão enviada para a nuvem.');
                            }
                        } catch (error) {
                            Alert.alert('Erro', 'Não foi possível excluir o material.');
                        }
                    }
                }
            ]
        );
    };

    const resetForm = () => {
        setFormData({
            data: new Date().toLocaleDateString('pt-BR'),
            tipoMaterial: 'Biossólido',
            numeroMTR: '',
            peso: '',
            origem: 'Sabesp',
            destino: 'Pátio'
        });
        setEditingId(null);
        setShowForm(false);
    };

    const getDestinoColor = (destino: string) => {
        const d = destino.toLowerCase();
        if (d.includes('piscin') || d.includes('tanque')) return PALETTE.azulPiscinao;
        if (d.includes('bagaço') || d.includes('estoque')) return PALETTE.warning;
        return PALETTE.sucesso;
    };

    if (loading) return <ActivityIndicator style={{ flex: 1 }} color={PALETTE.verdePrimario} />;

    const mtrIsOptional = isDestinoPiscinao(formData.destino);
    const mtrObrigatorio = isMtrObrigatorio();

       return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* HEADER PADRÃO */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Entrada de Material</Text>
                    <View style={styles.backButton} />
                </View>

                {/* INFO BOX */}
                <View style={styles.infoBox}>
                    <MaterialCommunityIcons name="truck-fast" size={32} color={PALETTE.terracota} style={styles.infoIcon} />
                    <View style={styles.infoContent}>
                        <Text style={styles.infoTitle}>Registre cada entrada</Text>
                        <Text style={styles.infoText}>Biossólido ou Bagaço de Cana</Text>
                    </View>
                </View>

                {showForm ? (
                    <View style={styles.formCard}>
                        <Text style={styles.formTitle}>
                            {editingId ? 'Editar Material' : 'Registrar Entrada'}
                        </Text>

                        {/* DATA */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Data</Text>
                            <View style={styles.inputBox}>
                                <MaterialCommunityIcons name="calendar" size={20} color={PALETTE.cinza} style={styles.inputIcon} />
                                <RNTextInput
                                    style={styles.input}
                                    value={formData.data}
                                    onChangeText={t => setFormData({ ...formData, data: formatarData(t) })}
                                    maxLength={10}
                                    keyboardType="numeric"
                                />
                            </View>
                        </View>

                        {/* TIPO DE MATERIAL */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>O que chegou?</Text>
                            <View style={styles.optionsRow}>
                                {['Biossólido', 'Bagaço de Cana'].map((tipo) => (
                                    <TouchableOpacity
                                        key={tipo}
                                        style={[styles.optionBtn, formData.tipoMaterial === tipo && styles.optionBtnActive]}
                                        onPress={() => handleTipoChange(tipo)}
                                    >
                                        <MaterialCommunityIcons
                                            name={tipo === 'Biossólido' ? 'recycle' : 'barley'}
                                            size={20}
                                            color={formData.tipoMaterial === tipo ? PALETTE.verdePrimario : PALETTE.cinza}
                                            style={{ marginBottom: 4 }}
                                        />
                                        <Text style={[styles.optionText, formData.tipoMaterial === tipo && styles.optionTextActive]}>
                                            {tipo}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* 🔥 CATEGORIA DE DESTINO (Apenas para Biossólido) */}
                        {formData.tipoMaterial === 'Biossólido' && (
                            <View style={styles.formGroup}>
                                <Text style={styles.label}>Categoria de Destino</Text>
                                <View style={styles.optionsRow}>
                                    <TouchableOpacity
                                        style={[styles.optionBtn, categoriaDestino === 'Pátio Normal' && styles.optionBtnActive]}
                                        onPress={() => {
                                            setCategoriaDestino('Pátio Normal');
                                            setFormData({ ...formData, destino: 'Pátio Normal' });
                                        }}
                                    >
                                        <MaterialCommunityIcons name="map-marker" size={20} color={categoriaDestino === 'Pátio Normal' ? PALETTE.verdePrimario : PALETTE.cinza} style={{ marginBottom: 4 }} />
                                        <Text style={[styles.optionText, categoriaDestino === 'Pátio Normal' && styles.optionTextActive]}>Pátio Normal</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.optionBtn, categoriaDestino === 'Depósito' && styles.optionBtnActive]}
                                        onPress={() => {
                                            setCategoriaDestino('Depósito');
                                            setFormData({ ...formData, destino: 'Pátio de Mistura' });
                                        }}
                                    >
                                        <MaterialCommunityIcons name="warehouse" size={20} color={categoriaDestino === 'Depósito' ? PALETTE.verdePrimario : PALETTE.cinza} style={{ marginBottom: 4 }} />
                                        <Text style={[styles.optionText, categoriaDestino === 'Depósito' && styles.optionTextActive]}>Depósito / Piscinão</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* 🔥 LOCAL ESPECÍFICO (Aparece se for Depósito ou Bagaço) */}
                        {(categoriaDestino === 'Depósito' || formData.tipoMaterial === 'Bagaço de Cana') && (
                            <View style={styles.formGroup}>
                                <View style={styles.labelHeader}>
                                    <Text style={styles.label}>Local Específico</Text>
                                    <TouchableOpacity onPress={() => setShowModalNovoDestino(true)} style={styles.addBtnSmall}>
                                        <MaterialCommunityIcons name="plus" size={16} color={PALETTE.branco} />
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.optionsColumn}>
                                    {getDestinosFiltrados().map((dest) => (
                                        <TouchableOpacity
                                            key={dest}
                                            style={[styles.optionBtn, formData.destino === dest && styles.optionBtnActive, { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 16 }]}
                                            onPress={() => setFormData({ ...formData, destino: dest })}
                                        >
                                            <MaterialCommunityIcons
                                                name={dest.includes('Piscin') ? 'water' : dest.includes('Mistura') ? 'pot-mix' : dest.includes('Bagaço') ? 'barley' : 'warehouse'}
                                                size={20}
                                                color={formData.destino === dest ? PALETTE.verdePrimario : PALETTE.cinza}
                                                style={{ marginRight: 12 }}
                                            />
                                            <Text style={[styles.optionText, formData.destino === dest && styles.optionTextActive]}>
                                                {dest}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* 🔥 MTR COM VALIDAÇÃO DINÂMICA */}
                        {formData.tipoMaterial === 'Biossólido' && (
                            <View style={styles.formGroup}>
                                <Text style={styles.label}>
                                    Número do MTR {!mtrObrigatorio ? <Text style={styles.optionalText}>(Opcional)</Text> : <Text style={{ color: 'red' }}> *</Text>}
                                </Text>
                                <View style={styles.inputBox}>
                                    <MaterialCommunityIcons name="numeric" size={20} color={PALETTE.cinza} style={styles.inputIcon} />
                                    <RNTextInput
                                        style={styles.input}
                                        value={formData.numeroMTR}
                                        onChangeText={t => setFormData({ ...formData, numeroMTR: t })}
                                        placeholder={!mtrObrigatorio ? "S/N" : "Obrigatório para este destino"}
                                        placeholderTextColor={PALETTE.cinza}
                                    />
                                </View>
                            </View>
                        )}

                        {/* PESO */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Peso (Ton)</Text>
                            <View style={styles.inputBox}>
                                <MaterialCommunityIcons name="scale-balance" size={20} color={PALETTE.cinza} style={styles.inputIcon} />
                                <RNTextInput
                                    style={styles.input}
                                    value={formData.peso}
                                    onChangeText={t => setFormData({ ...formData, peso: t })}
                                    keyboardType="decimal-pad"
                                    placeholder="Ex: 15.5"
                                    placeholderTextColor={PALETTE.cinza}
                                />
                            </View>
                        </View>

                        {/* ORIGEM */}
                        {formData.tipoMaterial === 'Biossólido' && (
                            <View style={styles.formGroup}>
                                <View style={styles.labelHeader}>
                                    <Text style={styles.label}>Origem</Text>
                                    <TouchableOpacity onPress={() => setShowModalNovaOrigem(true)} style={styles.addBtnSmall}>
                                        <MaterialCommunityIcons name="plus" size={16} color={PALETTE.branco} />
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.optionsColumn}>
                                    {origens.map((origem) => (
                                        <TouchableOpacity
                                            key={origem}
                                            style={[styles.optionBtn, formData.origem === origem && styles.optionBtnActive, { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 16 }]}
                                            onPress={() => setFormData({ ...formData, origem })}
                                        >
                                            <MaterialCommunityIcons
                                                name="factory"
                                                size={20}
                                                color={formData.origem === origem ? PALETTE.verdePrimario : PALETTE.cinza}
                                                style={{ marginRight: 12 }}
                                            />
                                            <Text style={[styles.optionText, formData.origem === origem && styles.optionTextActive]}>
                                                {origem}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* BOTÕES DE AÇÃO DO FORMULÁRIO */}
                        <View style={styles.buttonGroup}>
                            <TouchableOpacity style={styles.btnCancel} onPress={resetForm}>
                                <Text style={styles.btnCancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <View style={styles.buttonSpacer} />
                            <TouchableOpacity style={styles.btnSave} onPress={handleSaveMaterial}>
                                <Text style={styles.btnSaveText}>{editingId ? "Atualizar" : "Salvar"}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)} activeOpacity={0.8}>
                        <MaterialCommunityIcons name="plus" size={24} color={PALETTE.branco} />
                        <Text style={styles.addBtnText}>Registrar Entrada</Text>
                    </TouchableOpacity>
                )}

                {/* 🔥 LISTAGEM ATUALIZADA COM FILTROS */}
                {/* 🔥 LISTAGEM ATUALIZADA COM FILTROS E BUSCA */}
                <View style={styles.listSection}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={[styles.listTitle, { marginBottom: 0 }]}>Últimos Registros</Text>
                        <Text style={{ color: PALETTE.cinza, fontSize: 13, fontWeight: 'bold' }}>
                            {entradasFiltradas.length} {entradasFiltradas.length === 1 ? 'item' : 'itens'}
                        </Text>
                    </View>

                    {/* 🔥 NOVO: CAMPO DE BUSCA POR MTR */}
                    <View style={[styles.inputBox, { marginBottom: 12, height: 48, backgroundColor: PALETTE.branco }]}>
                        <MaterialCommunityIcons name="magnify" size={20} color={PALETTE.cinza} style={styles.inputIcon} />
                        <RNTextInput
                            style={[styles.input, { fontSize: 14 }]}
                            placeholder="Buscar por número do MTR..."
                            placeholderTextColor={PALETTE.cinza}
                            value={buscaMTR}
                            onChangeText={setBuscaMTR}
                        />
                        {/* Botão de limpar busca (só aparece se tiver texto) */}
                        {buscaMTR.length > 0 && (
                            <TouchableOpacity onPress={() => setBuscaMTR('')} style={{ padding: 4 }}>
                                <MaterialCommunityIcons name="close-circle" size={20} color={PALETTE.cinzaClaro} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* BOTÕES DE FILTRO */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, paddingBottom: 4 }}>
                        <TouchableOpacity 
                            style={[styles.filterChip, filtroPeriodo === 'hoje' && styles.filterChipActive]} 
                            onPress={() => setFiltroPeriodo('hoje')}
                        >
                            <Text style={[styles.filterChipText, filtroPeriodo === 'hoje' && styles.filterChipTextActive]}>Hoje</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.filterChip, filtroPeriodo === 'semana' && styles.filterChipActive]} 
                            onPress={() => setFiltroPeriodo('semana')}
                        >
                            <Text style={[styles.filterChipText, filtroPeriodo === 'semana' && styles.filterChipTextActive]}>7 Dias</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.filterChip, filtroPeriodo === 'mes' && styles.filterChipActive]} 
                            onPress={() => setFiltroPeriodo('mes')}
                        >
                            <Text style={[styles.filterChipText, filtroPeriodo === 'mes' && styles.filterChipTextActive]}>30 Dias</Text>
                        </TouchableOpacity>
                        
                    </ScrollView>

                    {/* LISTA RENDERIZADA */}
                    {entradasFiltradas.length > 0 ? (
                        entradasFiltradas.map((item) => (
                            <MaterialCard
                                key={item.id}
                                item={item}
                                onEdit={() => handleEdit(item)}
                                onDelete={() => handleDelete(item.id)}
                                color={getDestinoColor(item.destino)}
                            />
                        ))
                    ) : (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name={buscaMTR ? "text-search" : "inbox-remove"} size={48} color={PALETTE.cinzaClaro} style={{ marginBottom: 16 }} />
                            <Text style={styles.emptyText}>
                                {buscaMTR ? `Nenhum MTR encontrado com "${buscaMTR}"` : 'Nenhum material encontrado neste período.'}
                            </Text>
                        </View>
                    )}
                </View>

            </ScrollView>

            {/* MODAL NOVA ORIGEM */}
            <Modal visible={showModalNovaOrigem} transparent animationType="fade" onRequestClose={() => setShowModalNovaOrigem(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Nova Origem</Text>
                        <View style={styles.modalInputBox}>
                            <RNTextInput
                                style={styles.modalInput}
                                placeholder="Nome da origem"
                                value={novaOrigemText}
                                onChangeText={setNovaOrigemText}
                                autoFocus
                            />
                        </View>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.modalBtnCancelar} onPress={() => setShowModalNovaOrigem(false)}>
                                <Text style={styles.modalBtnCancelarText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalBtnConfirmar} onPress={handleAddNovaOrigem}>
                                <Text style={styles.modalBtnConfirmarText}>Adicionar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* MODAL NOVO DESTINO */}
            <Modal visible={showModalNovoDestino} transparent animationType="fade" onRequestClose={() => setShowModalNovoDestino(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Novo Destino</Text>
                        <View style={styles.modalInputBox}>
                            <RNTextInput
                                style={styles.modalInput}
                                placeholder="Ex: Piscinão 4, Pátio C..."
                                value={novoDestinoText}
                                onChangeText={setNovoDestinoText}
                                autoFocus
                            />
                        </View>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.modalBtnCancelar} onPress={() => setShowModalNovoDestino(false)}>
                                <Text style={styles.modalBtnCancelarText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalBtnConfirmar} onPress={handleAddNovoDestino}>
                                <Text style={styles.modalBtnConfirmarText}>Adicionar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// ===== COMPONENTE DE CARD =====
function MaterialCard({ item, onEdit, onDelete, color }: any) {
    return (
        <View style={[styles.materialCard, { borderLeftColor: color }]}>
            <View style={styles.materialCardHeader}>
                <View style={styles.materialCardLeft}>
                    <View style={[styles.materialCardIconBox, { backgroundColor: `${color}15` }]}>
                        <MaterialCommunityIcons
                            name={item.tipoMaterial === 'Biossólido' ? 'recycle' : 'barley'}
                            size={24}
                            color={color}
                        />
                    </View>
                    <View style={styles.materialCardInfo}>
                        <Text style={styles.materialCardTitle}>{item.tipoMaterial}</Text>
                        <Text style={styles.materialCardDate}>{item.data}</Text>
                    </View>
                </View>

                <View style={styles.actionButtons}>
                    <TouchableOpacity style={styles.iconButton} onPress={onEdit}>
                        <MaterialCommunityIcons name="pencil" size={20} color={PALETTE.cinza} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.iconButton, { backgroundColor: PALETTE.erroClaro }]} onPress={onDelete}>
                        <MaterialCommunityIcons name="delete" size={20} color={PALETTE.erro} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={[styles.destinoBadge, { backgroundColor: `${color}15` }]}>
                <MaterialCommunityIcons name="map-marker" size={12} color={color} style={{ marginRight: 4 }} />
                <Text style={[styles.destinoBadgeText, { color: color }]}>{item.destino}</Text>
            </View>

            <View style={styles.materialCardDetails}>
                {item.tipoMaterial === 'Biossólido' && (
                    <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>MTR</Text>
                        <Text style={styles.detailValue}>{item.numeroMTR}</Text>
                        <View style={styles.originBadge}>
                            <Text style={styles.originBadgeText}>{item.origem}</Text>
                        </View>
                    </View>
                )}
                <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Peso</Text>
                    <Text style={styles.detailValue}>{item.peso} ton</Text>
                </View>
            </View>
        </View>
    );
}

// ===== ESTILOS PADRONIZADOS =====
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: PALETTE.verdeClaro },
    scrollContent: { flexGrow: 1, paddingBottom: 40 },

    // HEADER (Padrão Dashboard)
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 20,
        backgroundColor: PALETTE.branco,
        borderBottomWidth: 1,
        borderBottomColor: PALETTE.cinzaClaro,
    },
    backButton: { width: 40, alignItems: 'flex-start' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: PALETTE.preto },

    // INFO BOX
    infoBox: {
        flexDirection: 'row',
        marginHorizontal: 24,
        marginTop: 24,
        marginBottom: 16,
        padding: 16,
        backgroundColor: PALETTE.branco,
        borderRadius: 16,
        borderLeftWidth: 4,
        borderLeftColor: PALETTE.terracota,
        alignItems: 'center',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
            android: { elevation: 2 },
        }),
    },
    infoIcon: { marginRight: 16 },
    infoContent: { flex: 1 },
    infoTitle: { fontWeight: '700', color: PALETTE.preto, fontSize: 15 },
    infoText: { color: PALETTE.cinza, fontSize: 13, marginTop: 2 },

    // FORMULÁRIO
    formCard: {
        marginHorizontal: 24,
        marginBottom: 24,
        padding: 20,
        backgroundColor: PALETTE.branco,
        borderRadius: 16,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8 },
            android: { elevation: 3 },
        }),
    },
    formTitle: { fontSize: 18, fontWeight: '800', color: PALETTE.preto, marginBottom: 20 },
    formGroup: { marginBottom: 20 },
    label: { fontSize: 12, fontWeight: '700', color: PALETTE.cinza, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    optionalText: { color: PALETTE.cinza, fontSize: 10, textTransform: 'none', fontWeight: 'normal' },
    labelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },

    inputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: PALETTE.verdeClaro,
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 52,
        borderWidth: 1,
        borderColor: PALETTE.cinzaClaro
    },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, fontWeight: '600', color: PALETTE.preto, fontSize: 15 },

    optionsRow: { flexDirection: 'row', gap: 12 },
    optionsColumn: { gap: 10 },
    optionBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: PALETTE.verdeClaro,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: PALETTE.cinzaClaro
    },
    optionBtnActive: {
        backgroundColor: PALETTE.verdeCard,
        borderColor: PALETTE.verdePrimario,
        borderWidth: 1.5
    },
    optionText: { fontSize: 13, fontWeight: '600', color: PALETTE.cinza },
    optionTextActive: { color: PALETTE.verdePrimario, fontWeight: '700' },

    addBtnSmall: {
        backgroundColor: PALETTE.terracota,
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center'
    },

    // BOTÕES DO FORMULÁRIO
    buttonGroup: { marginTop: 10 },
    buttonSpacer: { height: 12 },
    btnSave: {
        backgroundColor: PALETTE.verdePrimario,
        height: 52,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnSaveText: { color: PALETTE.branco, fontWeight: '700', fontSize: 15 },
    btnCancel: {
        backgroundColor: PALETTE.verdeClaro,
        height: 52,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: PALETTE.cinzaClaro
    },
    btnCancelText: { color: PALETTE.cinza, fontWeight: '700', fontSize: 15 },

    addBtn: {
        flexDirection: 'row',
        marginHorizontal: 24,
        marginBottom: 24,
        backgroundColor: PALETTE.verdePrimario,
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...Platform.select({
            ios: { shadowColor: PALETTE.verdePrimario, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
            android: { elevation: 4 },
        }),
    },
    addBtnText: { color: PALETTE.branco, fontWeight: '700', fontSize: 16 },

    // LISTAGEM
    listSection: { paddingHorizontal: 24 },
    listTitle: { fontSize: 18, fontWeight: '700', color: PALETTE.preto, marginBottom: 16, letterSpacing: -0.5 },

    materialCard: {
        backgroundColor: PALETTE.branco,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
            android: { elevation: 2 },
        }),
    },
    materialCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    materialCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    materialCardIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    materialCardInfo: { flex: 1 },
    materialCardTitle: { fontWeight: '700', fontSize: 15, color: PALETTE.preto },
    materialCardDate: { fontSize: 12, color: PALETTE.cinza, marginTop: 2 },

    actionButtons: { flexDirection: 'row', gap: 8 },
    iconButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: PALETTE.verdeClaro, alignItems: 'center', justifyContent: 'center' },

    destinoBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 12 },
    destinoBadgeText: { fontSize: 11, fontWeight: '700' },

    materialCardDetails: { flexDirection: 'row', gap: 16, marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: PALETTE.cinzaClaro },
    detailItem: { flex: 1 },
    detailLabel: { fontSize: 11, color: PALETTE.cinza, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
    detailValue: { fontWeight: '800', color: PALETTE.preto, fontSize: 14 },
    originBadge: { backgroundColor: PALETTE.verdeCard, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', marginTop: 6 },
    originBadgeText: { fontSize: 11, color: PALETTE.verdePrimario, fontWeight: '700' },

    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyText: { fontWeight: '600', color: PALETTE.cinza, fontSize: 15 },

    // MODAIS
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

        // Estilos dos Filtros
    filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: PALETTE.verdeClaro, borderWidth: 1, borderColor: PALETTE.cinzaClaro, marginRight: 8 },
    filterChipActive: { backgroundColor: PALETTE.verdeCard, borderColor: PALETTE.verdePrimario, borderWidth: 1.5 },
    filterChipText: { fontSize: 13, color: PALETTE.cinza, fontWeight: '600' },
    filterChipTextActive: { color: PALETTE.verdePrimario, fontWeight: 'bold' },
});

 