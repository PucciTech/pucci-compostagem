import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput as RNTextInput, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncService } from '@/services/sync';

interface MaterialEntry {
    id: string;
    data: string;
    tipoMaterial: string;
    numeroMTR: string;
    peso: string;
    origem: string;
    destino: string;
    sincronizado: boolean;
    usado?: boolean;
    deletado?: boolean;
    mtrsOriginais?: string[];
    itensOriginaisIds?: string[]; // 🔥 NOVO: Guarda os IDs dos caminhões usados
    pesoBagacoUtilizado?: number; // 🔥 NOVO: Guarda quanto bagaço foi usado na mistura
}

export default function PrepararMisturaScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    
    // Estados da Mistura
    const [materiaisPatio, setMateriaisPatio] = useState<MaterialEntry[]>([]);
    const [selecionados, setSelecionados] = useState<string[]>([]);
    const [pesoBagaco, setPesoBagaco] = useState('');
    
    // 🔥 NOVO: Estado do Histórico
    const [historicoMisturas, setHistoricoMisturas] = useState<MaterialEntry[]>([]);
    
    // Estados DO ESTOQUE (MONTANTE)
    const [estoquePatio, setEstoquePatio] = useState(0);
    const [estoqueDep1, setEstoqueDep1] = useState(0);
    const [estoqueDep2, setEstoqueDep2] = useState(0);
    const [estoqueBagaco, setEstoqueBagaco] = useState(0);
    const [mtrsNoPatio, setMtrsNoPatio] = useState<string[]>([]);

    // Estados da Transferência
    const [pesoTransferencia, setPesoTransferencia] = useState('');
    const [destinoTransferencia, setDestinoTransferencia] = useState('Depósito 1');

    // ===== CARREGAR DADOS =====
    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        try {
            setLoading(true);
            const registros = await AsyncStorage.getItem('materiaisRegistrados');
            if (registros) {
                const materiais: MaterialEntry[] = JSON.parse(registros);
                
                // 1. Busca Biossólido puro aguardando mistura
                const disponiveis = materiais.filter(m => 
                    m.tipoMaterial === 'Biossólido' && 
                    m.destino === 'Pátio de Mistura' && 
                    !m.usado && 
                    !m.deletado
                );
                setMateriaisPatio(disponiveis.sort((a, b) => Number(a.id) - Number(b.id)));

                // 2. Calcula os Montantes (Estoque Vivo)
                let patio = 0;
                let dep1 = 0;
                let dep2 = 0;
                let bagaco = 0;

                materiais.forEach(m => {
                    if (!m.usado && !m.deletado) {
                        const pesoStr = m.peso ? m.peso.toString().replace(',', '.') : '0';
                        const peso = parseFloat(pesoStr) || 0;
                        const destinoItem = m.destino ? m.destino.trim() : '';

                        if (m.tipoMaterial === 'Mistura Preparada') {
                            if (destinoItem === 'Pátio de Mistura') patio += peso;
                            else if (destinoItem === 'Depósito 1') dep1 += peso;
                            else if (destinoItem === 'Depósito 2') dep2 += peso;
                        } else if (m.tipoMaterial && m.tipoMaterial.includes('Bagaço')) {
                            bagaco += peso;
                        }
                    }
                });

                setEstoquePatio(patio);
                setEstoqueDep1(dep1);
                setEstoqueDep2(dep2);
                setEstoqueBagaco(bagaco);

                // 3. Captura MTRs
                const lotesNoPatio = materiais.filter(m => {
                    const destinoItem = m.destino ? m.destino.trim() : '';
                    return m.tipoMaterial === 'Mistura Preparada' && destinoItem === 'Pátio de Mistura' && !m.usado && !m.deletado;
                });
                const todosMtrs = lotesNoPatio.flatMap(l => l.mtrsOriginais || []);
                setMtrsNoPatio([...new Set(todosMtrs)]);

                // 🔥 4. Carrega o Histórico de Misturas
                const misturas = materiais.filter(m => m.tipoMaterial === 'Mistura Preparada' && m.origem === 'Processo Interno' && !m.deletado);
                setHistoricoMisturas(misturas.sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 15)); // Pega as últimas 15
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Erro', 'Não foi possível carregar os dados.');
        } finally {
            setLoading(false);
        }
    };

    const toggleSelecao = (id: string) => {
        if (selecionados.includes(id)) {
            setSelecionados(selecionados.filter(item => item !== id));
        } else {
            setSelecionados([...selecionados, id]);
        }
    };

    const resumoCalculo = useMemo(() => {
        const itensSelecionados = materiaisPatio.filter(m => selecionados.includes(m.id));
        const pesoBio = itensSelecionados.reduce((acc, item) => acc + parseFloat(item.peso.replace(',', '.')), 0);
        const pesoBag = parseFloat(pesoBagaco.replace(',', '.') || '0');
        return {
            qtdCaminhoes: itensSelecionados.length,
            pesoBiossolido: pesoBio,
            pesoBagaco: pesoBag,
            pesoTotal: pesoBio + pesoBag
        };
    }, [selecionados, materiaisPatio, pesoBagaco]);

    // ===== 1. SALVAR NOVA MISTURA NO PÁTIO =====
        const handleSalvarMistura = async () => {
        if (selecionados.length === 0 && (!pesoBagaco.trim() || resumoCalculo.pesoBagaco <= 0)) {
            return Alert.alert('Atenção', 'Selecione ao menos um caminhão ou informe o peso do bagaço.');
        }
        
        if (resumoCalculo.pesoBagaco > estoqueBagaco) {
            return Alert.alert('Estoque Insuficiente', `Você tem apenas ${estoqueBagaco.toFixed(2)}t de bagaço disponível.`);
        }

        try {
            setLoading(true);
            const registros = await AsyncStorage.getItem('materiaisRegistrados');
            let todosMateriais: MaterialEntry[] = registros ? JSON.parse(registros) : [];
            const itensParaSincronizar: MaterialEntry[] = [];
            
            const mtrsDosCaminhoes = materiaisPatio
                .filter(m => selecionados.includes(m.id))
                .map(m => m.numeroMTR)
                .filter(mtr => mtr && mtr !== 'N/A');

            const bagacoDisponivel = todosMateriais.filter(m => m.tipoMaterial.includes('Bagaço') && !m.usado && !m.deletado);

            todosMateriais = todosMateriais.map(m => {
                if (selecionados.includes(m.id)) {
                    const atualizado = { ...m, usado: true, sincronizado: false };
                    itensParaSincronizar.push(atualizado);
                    return atualizado;
                }
                if (resumoCalculo.pesoBagaco > 0 && bagacoDisponivel.some(b => b.id === m.id)) {
                    const atualizado = { ...m, usado: true, sincronizado: false };
                    itensParaSincronizar.push(atualizado);
                    return atualizado;
                }
                return m;
            });

            const timestamp = Date.now();

            const novaMistura: MaterialEntry = {
                id: timestamp.toString(),
                data: new Date().toLocaleDateString('pt-BR'),
                tipoMaterial: 'Mistura Preparada',
                numeroMTR: `LOTE-${timestamp.toString().slice(-4)}`,
                peso: resumoCalculo.pesoTotal.toFixed(2),
                origem: 'Processo Interno',
                destino: 'Pátio de Mistura', 
                sincronizado: false,
                usado: false,
                mtrsOriginais: mtrsDosCaminhoes,
                itensOriginaisIds: selecionados, 
                pesoBagacoUtilizado: resumoCalculo.pesoBagaco 
            };

            todosMateriais.push(novaMistura);
            itensParaSincronizar.push(novaMistura);

            if (resumoCalculo.pesoBagaco > 0) {
                const saldoRestanteBagaco = estoqueBagaco - resumoCalculo.pesoBagaco;
                if (saldoRestanteBagaco > 0) {
                    const loteRestanteBagaco: MaterialEntry = {
                        id: (timestamp + 1).toString(),
                        data: new Date().toLocaleDateString('pt-BR'),
                        tipoMaterial: 'Bagaço de Cana',
                        numeroMTR: 'SALDO REMANESCENTE',
                        peso: saldoRestanteBagaco.toFixed(2),
                        origem: 'Estoque Interno',
                        destino: 'Depósito',
                        sincronizado: false,
                        usado: false
                    };
                    todosMateriais.push(loteRestanteBagaco);
                    itensParaSincronizar.push(loteRestanteBagaco);
                }
            }

            await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(todosMateriais));

            // 🔥 SENSOR 1: SAÍDA DE BAGAÇO PARA MISTURA
            if (resumoCalculo.pesoBagaco > 0) {
                const extratoSalvo = await AsyncStorage.getItem('extratoBagaco');
                const extrato = extratoSalvo ? JSON.parse(extratoSalvo) : [];
                extrato.push({
                    id: Date.now().toString(),
                    data: new Date().toLocaleDateString('pt-BR'),
                    hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    tipo: 'SAIDA',
                    quantidade: resumoCalculo.pesoBagaco,
                    motivo: 'Preparação de Mistura no Pátio'
                });
                await AsyncStorage.setItem('extratoBagaco', JSON.stringify(extrato));
            }

            for (const item of itensParaSincronizar) await syncService.adicionarFila('material', item);

            setSelecionados([]);
            setPesoBagaco('');
            await loadData();
            
            let msgSucesso = `${resumoCalculo.pesoTotal.toFixed(2)}t adicionadas ao Pátio.`;
            if (resumoCalculo.pesoBagaco > 0) msgSucesso += `\n\nBagaço: ${resumoCalculo.pesoBagaco.toFixed(2)}t`;
            if (selecionados.length > 0) msgSucesso += `\nBiossólido: ${resumoCalculo.pesoBiossolido.toFixed(2)}t`;

            Alert.alert('Sucesso! ✅', msgSucesso);

        } catch (error) {
            Alert.alert('Erro', 'Ocorreu um erro ao processar a mistura.');
            setLoading(false);
        }
    };

    // 🔥 2. NOVA FUNÇÃO: ESTORNAR MISTURA
        const handleExcluirMistura = (mistura: MaterialEntry) => {
        if (mistura.usado) {
            return Alert.alert('Atenção', 'Esta mistura já foi transferida para um depósito e não pode mais ser estornada.');
        }

        Alert.alert(
            'Confirmar Estorno ⚠️',
            `Deseja realmente desfazer esta mistura de ${mistura.peso}t?\n\nO Biossólido e o Bagaço voltarão separados para os seus estoques de origem.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                { 
                    text: 'Sim, Estornar', 
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            const registros = await AsyncStorage.getItem('materiaisRegistrados');
                            let todosMateriais: MaterialEntry[] = registros ? JSON.parse(registros) : [];
                            const itensParaSincronizar: MaterialEntry[] = [];

                            // 🔥 BLINDAGEM MATEMÁTICA: Garante que os números serão calculados corretamente mesmo se tiverem vírgula
                            const pesoTotal = parseFloat(String(mistura.peso).replace(',', '.'));
                            const pesoBagacoDevolver = parseFloat(String(mistura.pesoBagacoUtilizado || 0).replace(',', '.'));
                            const pesoBioDevolver = pesoTotal - pesoBagacoDevolver;

                            // 1. Marca a mistura como deletada
                            const misturaDeletada = { ...mistura, deletado: true, sincronizado: false };
                            itensParaSincronizar.push(misturaDeletada);
                            todosMateriais = todosMateriais.map(m => m.id === mistura.id ? misturaDeletada : m);

                            // 2. Restaura os Biossólidos originais (ou cria um lote de devolução)
                            if (mistura.itensOriginaisIds && mistura.itensOriginaisIds.length > 0) {
                                todosMateriais = todosMateriais.map(m => {
                                    if (mistura.itensOriginaisIds!.includes(m.id)) {
                                        const restaurado = { ...m, usado: false, sincronizado: false };
                                        itensParaSincronizar.push(restaurado);
                                        return restaurado;
                                    }
                                    return m;
                                });
                            } else if (pesoBioDevolver > 0) {
                                const timestamp = Date.now();
                                const devolucaoBio: MaterialEntry = {
                                    id: timestamp.toString(),
                                    data: new Date().toLocaleDateString('pt-BR'),
                                    tipoMaterial: 'Biossólido',
                                    numeroMTR: mistura.mtrsOriginais ? mistura.mtrsOriginais.join(', ') : 'ESTORNO',
                                    peso: pesoBioDevolver.toFixed(2),
                                    origem: 'Estorno de Mistura',
                                    destino: 'Pátio de Mistura',
                                    sincronizado: false,
                                    usado: false
                                };
                                todosMateriais.push(devolucaoBio);
                                itensParaSincronizar.push(devolucaoBio);
                            }

                            // 3. Devolve o Bagaço para o estoque
                            if (pesoBagacoDevolver > 0) {
                                const timestamp = Date.now() + 1;
                                const devolucaoBagaco: MaterialEntry = {
                                    id: timestamp.toString(),
                                    data: new Date().toLocaleDateString('pt-BR'),
                                    tipoMaterial: 'Bagaço de Cana',
                                    numeroMTR: 'ESTORNO',
                                    peso: pesoBagacoDevolver.toFixed(2),
                                    origem: 'Estorno de Mistura',
                                    destino: 'Estoque Bagaço',
                                    sincronizado: false,
                                    usado: false
                                };
                                todosMateriais.push(devolucaoBagaco);
                                itensParaSincronizar.push(devolucaoBagaco);
                                
                                // 📝 SENSOR 2: ESTORNO DE MISTURA (ENTRADA DE BAGAÇO NO EXTRATO)
                                const extratoSalvo = await AsyncStorage.getItem('extratoBagaco');
                                const extrato = extratoSalvo ? JSON.parse(extratoSalvo) : [];
                                extrato.push({
                                    id: Date.now().toString(),
                                    data: new Date().toLocaleDateString('pt-BR'),
                                    hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                                    tipo: 'ENTRADA',
                                    quantidade: pesoBagacoDevolver,
                                    motivo: 'Estorno de Mistura Cancelada'
                                });
                                await AsyncStorage.setItem('extratoBagaco', JSON.stringify(extrato));
                            }

                            await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(todosMateriais));

                            for (const item of itensParaSincronizar) {
                                await syncService.adicionarFila('material', item);
                            }

                            if (typeof loadData === 'function') {
                                await loadData();
                            }
                            
                            // 🔥 Mostra exatamente quanto devolveu de cada um
                            Alert.alert('Sucesso ✅', `Mistura estornada!\n\nBiossólido devolvido: ${pesoBioDevolver.toFixed(2)}t\nBagaço devolvido: ${pesoBagacoDevolver.toFixed(2)}t`);
                        } catch (error) {
                            console.error("Erro no estorno:", error);
                            Alert.alert('Erro', 'Falha ao estornar a mistura.');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };
    // ===== 3. TRANSFERIR DO PÁTIO PARA O DEPÓSITO =====
    const handleTransferir = async () => {
        const pesoTransf = parseFloat(pesoTransferencia.replace(',', '.'));
        if (isNaN(pesoTransf) || pesoTransf <= 0) return Alert.alert('Atenção', 'Informe um peso válido para transferir.');
        if (pesoTransf > estoquePatio) return Alert.alert('Atenção', 'Você não tem esse saldo disponível no Pátio de Mistura.');

        try {
            setLoading(true);
            const registros = await AsyncStorage.getItem('materiaisRegistrados');
            let todosMateriais: MaterialEntry[] = registros ? JSON.parse(registros) : [];
            const itensParaSincronizar: MaterialEntry[] = [];

            const lotesPatio = todosMateriais.filter(m => {
                const destinoItem = m.destino ? m.destino.trim() : '';
                return m.tipoMaterial === 'Mistura Preparada' && destinoItem === 'Pátio de Mistura' && !m.usado && !m.deletado;
            });
            
            const todosMtrsDoPatio = lotesPatio.flatMap(l => l.mtrsOriginais || []);
            const mtrsUnicos = [...new Set(todosMtrsDoPatio)];

            todosMateriais = todosMateriais.map(m => {
                if (lotesPatio.some(l => l.id === m.id)) {
                    const atualizado = { ...m, usado: true, sincronizado: false };
                    itensParaSincronizar.push(atualizado);
                    return atualizado;
                }
                return m;
            });

            const timestamp = Date.now();

            const loteDeposito: MaterialEntry = {
                id: timestamp.toString(),
                data: new Date().toLocaleDateString('pt-BR'),
                tipoMaterial: 'Mistura Preparada',
                numeroMTR: `TRANSF-${timestamp.toString().slice(-4)}`,
                peso: pesoTransf.toFixed(2),
                origem: 'Pátio de Mistura',
                destino: destinoTransferencia,
                sincronizado: false,
                usado: false,
                mtrsOriginais: mtrsUnicos
            };
            todosMateriais.push(loteDeposito);
            itensParaSincronizar.push(loteDeposito);

            const saldoRestante = estoquePatio - pesoTransf;
            if (saldoRestante > 0) {
                const loteRestante: MaterialEntry = {
                    id: (timestamp + 1).toString(),
                    data: new Date().toLocaleDateString('pt-BR'),
                    tipoMaterial: 'Mistura Preparada',
                    numeroMTR: 'SALDO REMANESCENTE',
                    peso: saldoRestante.toFixed(2),
                    origem: 'Processo Interno',
                    destino: 'Pátio de Mistura',
                    sincronizado: false,
                    usado: false,
                    mtrsOriginais: mtrsUnicos
                };
                todosMateriais.push(loteRestante);
                itensParaSincronizar.push(loteRestante);
            }

            await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(todosMateriais));
            for (const item of itensParaSincronizar) await syncService.adicionarFila('material', item);

            setPesoTransferencia('');
            await loadData();
            Alert.alert('Transferência Concluída! 🔄', `${pesoTransf}t enviadas para o ${destinoTransferencia}.`);

        } catch (error) {
            Alert.alert('Erro', 'Falha ao realizar a transferência.');
            setLoading(false);
        }
    };

    if (loading) return <ActivityIndicator style={{ flex: 1 }} color={PALETTE.verdePrimario} />;

    const isSaveDisabled = (selecionados.length === 0 && resumoCalculo.pesoBagaco <= 0) || resumoCalculo.pesoBagaco > estoqueBagaco;

    let textoBotaoSalvar = "Adicionar ao Pátio";
    if (selecionados.length > 0 && resumoCalculo.pesoBagaco > 0) {
        textoBotaoSalvar = "Misturar e Adicionar";
    } else if (selecionados.length > 0) {
        textoBotaoSalvar = "Adicionar Biossólido";
    } else if (resumoCalculo.pesoBagaco > 0) {
        textoBotaoSalvar = "Adicionar Bagaço";
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <MaterialCommunityIcons name="arrow-left" size={24} color={PALETTE.cinzaEscuro} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Mistura e Estoque</Text>
                    <View style={styles.backButton} />
                </View>

                {/* PAINEL DE ESTOQUE VIVO (MONTANTES) */}
                <View style={[styles.formCard, { backgroundColor: '#1A237E', borderColor: '#1A237E' }]}>
                    <Text style={[styles.formTitle, { color: PALETTE.branco, marginBottom: 16 }]}>📦 Visão Geral do Estoque</Text>
                    
                    <View style={styles.stockRow}>
                        <View style={styles.stockItem}>
                            <Text style={styles.stockLabel}>Pátio de Mistura</Text>
                            <Text style={styles.stockValue}>{estoquePatio.toFixed(2)} t</Text>
                        </View>
                        <View style={styles.stockDivider} />
                        <View style={styles.stockItem}>
                            <Text style={styles.stockLabel}>Depósito 1</Text>
                            <Text style={styles.stockValue}>{estoqueDep1.toFixed(2)} t</Text>
                        </View>
                        <View style={styles.stockDivider} />
                        <View style={styles.stockItem}>
                            <Text style={styles.stockLabel}>Depósito 2</Text>
                            <Text style={styles.stockValue}>{estoqueDep2.toFixed(2)} t</Text>
                        </View>
                    </View>

                    {mtrsNoPatio.length > 0 && (
                        <View style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.1)', padding: 12, borderRadius: 8 }}>
                            <Text style={{ color: '#E8EAF6', fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>
                                <MaterialCommunityIcons name="text-box-search-outline" size={12} /> MTRs NESTE MONTANTE:
                            </Text>
                            <Text style={{ color: PALETTE.branco, fontSize: 12, lineHeight: 18 }}>
                                {mtrsNoPatio.join(', ')}
                            </Text>
                        </View>
                    )}
                </View>

                {/* ÁREA DE TRANSFERÊNCIA */}
                {estoquePatio > 0 && (
                    <View style={[styles.formCard, { borderColor: '#0288D1', borderWidth: 1 }]}>
                        <Text style={[styles.formTitle, { color: '#0288D1' }]}>🔄 Transferir do Pátio para Depósito</Text>
                        
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Quantidade (Ton)</Text>
                            <View style={styles.inputBox}>
                                <MaterialCommunityIcons name="weight" size={20} color={PALETTE.cinza} style={styles.inputIcon} />
                                <RNTextInput
                                    style={styles.input}
                                    value={pesoTransferencia}
                                    onChangeText={setPesoTransferencia}
                                    keyboardType="decimal-pad"
                                    placeholder={`Máx: ${estoquePatio.toFixed(2)}`}
                                />
                            </View>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Para onde?</Text>
                            <View style={styles.optionsRow}>
                                {['Depósito 1', 'Depósito 2'].map((dest) => (
                                    <TouchableOpacity
                                        key={dest}
                                        style={[styles.optionBtn, destinoTransferencia === dest && styles.optionBtnActive]}
                                        onPress={() => setDestinoTransferencia(dest)}
                                    >
                                        <MaterialCommunityIcons name="warehouse" size={20} color={destinoTransferencia === dest ? PALETTE.verdePrimario : PALETTE.cinza} style={{ marginBottom: 4 }} />
                                        <Text style={[styles.optionText, destinoTransferencia === dest && styles.optionTextActive]}>{dest}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <TouchableOpacity 
                            style={[styles.btnSave, { backgroundColor: '#0288D1', marginTop: 8 }]} 
                            onPress={handleTransferir}
                        >
                            <Text style={styles.btnSaveText}>Confirmar Transferência</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View style={{ height: 1, backgroundColor: PALETTE.cinzaClaro, marginVertical: 20 }} />
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: PALETTE.cinzaEscuro, marginBottom: 16 }}>
                    ➕ Preparar Nova Mistura
                </Text>

                {/* PASSO 1: SELECIONAR BIOSSÓLIDOS */}
                <View style={styles.formCard}>
                    <Text style={styles.formTitle}>1. Selecione os Biossólidos</Text>
                    {materiaisPatio.length === 0 ? (
                        <View style={[styles.emptyState, { padding: 20 }]}>
                            <MaterialCommunityIcons name="truck-check-outline" size={40} color={PALETTE.cinzaClaro} />
                            <Text style={[styles.emptyText, { marginTop: 10 }]}>Nenhum biossólido aguardando no Pátio de Mistura.</Text>
                        </View>
                    ) : (
                        materiaisPatio.map(item => {
                            const isSelected = selecionados.includes(item.id);
                            return (
                                <TouchableOpacity 
                                    key={item.id} 
                                    style={[
                                        { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: PALETTE.cinzaClaro, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
                                        isSelected && { borderColor: PALETTE.verdePrimario, backgroundColor: '#E8F5E9' }
                                    ]}
                                    onPress={() => toggleSelecao(item.id)}
                                    activeOpacity={0.7}
                                >
                                    <MaterialCommunityIcons name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"} size={24} color={isSelected ? PALETTE.verdePrimario : PALETTE.cinza} style={{ marginRight: 12 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontWeight: 'bold', color: PALETTE.cinzaEscuro }}>{item.data} - {item.origem}</Text>
                                        <Text style={{ color: PALETTE.cinza, fontSize: 12 }}>MTR: {item.numeroMTR}</Text>
                                    </View>
                                    <Text style={{ fontWeight: 'bold', color: PALETTE.verdePrimario }}>{item.peso} t</Text>
                                </TouchableOpacity>
                            );
                        })
                    )}
                </View>

                {/* PASSO 2: BAGAÇO */}
                <View style={styles.formCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={styles.formTitle}>2. Adicionar Bagaço</Text>
                        <View style={{ backgroundColor: '#FFF3E0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                            <Text style={{ color: '#F57C00', fontSize: 12, fontWeight: 'bold' }}>Estoque: {estoqueBagaco.toFixed(2)}t</Text>
                        </View>
                    </View>
                    
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Peso do Bagaço a utilizar (Ton)</Text>
                        <View style={styles.inputBox}>
                            <MaterialCommunityIcons name="scale-balance" size={20} color={PALETTE.cinza} style={styles.inputIcon} />
                            <RNTextInput
                                style={styles.input}
                                value={pesoBagaco}
                                onChangeText={setPesoBagaco}
                                keyboardType="decimal-pad"
                                placeholder={`Máx: ${estoqueBagaco.toFixed(2)}`}
                            />
                        </View>
                        {estoqueBagaco <= 0 && (
                            <Text style={{ color: PALETTE.terracota, fontSize: 12, marginTop: 8 }}>
                                ⚠️ Você não tem bagaço no estoque. Registre a entrada primeiro.
                            </Text>
                        )}
                        {resumoCalculo.pesoBagaco > estoqueBagaco && (
                            <Text style={{ color: PALETTE.terracota, fontSize: 12, marginTop: 8 }}>
                                ⚠️ O peso informado é maior que o estoque disponível.
                            </Text>
                        )}
                    </View>
                </View>

                {/* RESUMO E BOTÃO DE SALVAR */}
                <View style={[styles.formCard, { backgroundColor: '#F8F9FA', borderColor: PALETTE.verdePrimario, borderWidth: 1 }]}>
                    <Text style={[styles.formTitle, { color: PALETTE.verdePrimario }]}>Resumo da Mistura</Text>
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ color: PALETTE.cinzaEscuro }}>Biossólido ({resumoCalculo.qtdCaminhoes} caminhões):</Text>
                        <Text style={{ fontWeight: 'bold' }}>{resumoCalculo.pesoBiossolido.toFixed(2)} t</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ color: PALETTE.cinzaEscuro }}>Bagaço Consumido:</Text>
                        <Text style={{ fontWeight: 'bold' }}>{resumoCalculo.pesoBagaco.toFixed(2)} t</Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: PALETTE.cinzaClaro, marginVertical: 8 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontWeight: 'bold', fontSize: 16, color: PALETTE.cinzaEscuro }}>Total a adicionar no Pátio:</Text>
                        <Text style={{ fontWeight: 'bold', fontSize: 18, color: PALETTE.verdePrimario }}>+ {resumoCalculo.pesoTotal.toFixed(2)} t</Text>
                    </View>

                    <TouchableOpacity 
                        style={[styles.btnSave, { marginTop: 20 }, isSaveDisabled && { opacity: 0.5 }]} 
                        onPress={handleSalvarMistura}
                        disabled={isSaveDisabled}
                    >
                        <Text style={styles.btnSaveText}>{textoBotaoSalvar}</Text>
                    </TouchableOpacity>
                </View>

                {/* 🔥 3. NOVO: HISTÓRICO DE MISTURAS */}
                <View style={{ height: 1, backgroundColor: PALETTE.cinzaClaro, marginVertical: 20 }} />
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: PALETTE.cinzaEscuro, marginBottom: 16 }}>
                    🕒 Histórico de Misturas (Pátio)
                </Text>

                {historicoMisturas.length === 0 ? (
                    <View style={[styles.emptyState, { padding: 20, backgroundColor: PALETTE.branco, borderRadius: 12 }]}>
                        <MaterialCommunityIcons name="history" size={40} color={PALETTE.cinzaClaro} />
                        <Text style={[styles.emptyText, { marginTop: 10 }]}>Nenhuma mistura registrada recentemente.</Text>
                    </View>
                ) : (
                    historicoMisturas.map(mistura => {
                        const bioUtilizado = parseFloat(mistura.peso) - (mistura.pesoBagacoUtilizado || 0);
                        const bagUtilizado = mistura.pesoBagacoUtilizado || 0;
                        
                        return (
                            <View key={mistura.id} style={[styles.formCard, { padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontWeight: 'bold', color: PALETTE.cinzaEscuro, fontSize: 16 }}>
                                        {mistura.data} - {mistura.peso}t
                                    </Text>
                                    <Text style={{ color: PALETTE.cinza, fontSize: 12, marginTop: 2 }}>
                                        Biossólido: {bioUtilizado.toFixed(2)}t | Bagaço: {bagUtilizado.toFixed(2)}t
                                    </Text>
                                    {mistura.usado && (
                                        <Text style={{ color: PALETTE.warning, fontSize: 11, marginTop: 4, fontWeight: 'bold' }}>
                                            ⚠️ Já transferido (Não pode ser estornado)
                                        </Text>
                                    )}
                                </View>
                                
                                {!mistura.usado && (
                                    <TouchableOpacity 
                                        style={{ padding: 10, backgroundColor: '#FFEBEE', borderRadius: 8 }}
                                        onPress={() => handleExcluirMistura(mistura)}
                                    >
                                        <MaterialCommunityIcons name="delete-outline" size={24} color={PALETTE.terracota} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        );
                    })
                )}

            </ScrollView>
        </SafeAreaView>
    );
}

// ===== ESTILOS E PALETA =====
export const PALETTE = {
    verdePrimario: '#2E7D32',
    cinza: '#9E9E9E',
    cinzaClaro: '#E0E0E0',
    cinzaEscuro: '#424242',
    branco: '#FFFFFF',
    terracota: '#BF360C',
    sucesso: '#4CAF50',
    warning: '#FF9800',
    azulPiscinao: '#0288D1'
};

export const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F5F5' },
    scrollContent: { padding: 16, paddingBottom: 40 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: PALETTE.cinzaEscuro },
    infoBox: { flexDirection: 'row', backgroundColor: '#FFF3E0', padding: 16, borderRadius: 12, marginBottom: 20, alignItems: 'center' },
    infoIcon: { marginRight: 16 },
    infoContent: { flex: 1 },
    infoTitle: { fontSize: 16, fontWeight: 'bold', color: PALETTE.terracota },
    infoText: { fontSize: 14, color: PALETTE.cinzaEscuro, marginTop: 4 },
    formCard: { backgroundColor: PALETTE.branco, borderRadius: 12, padding: 16, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    formTitle: { fontSize: 18, fontWeight: 'bold', color: PALETTE.cinzaEscuro, marginBottom: 0 },
    formGroup: { marginBottom: 16 },
    label: { fontSize: 14, fontWeight: 'bold', color: PALETTE.cinzaEscuro, marginBottom: 8 },
    inputBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: PALETTE.cinzaClaro, borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#FAFAFA' },
    inputIcon: { marginRight: 8 },
    input: { flex: 1, height: 48, fontSize: 16, color: PALETTE.cinzaEscuro },
    optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    optionBtn: { flex: 1, minWidth: '45%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderWidth: 1, borderColor: PALETTE.cinzaClaro, borderRadius: 8, backgroundColor: '#FAFAFA' },
    optionBtnActive: { borderColor: PALETTE.verdePrimario, backgroundColor: '#E8F5E9' },
    optionText: { fontSize: 14, color: PALETTE.cinza, fontWeight: '500' },
    optionTextActive: { color: PALETTE.verdePrimario, fontWeight: 'bold' },
    btnSave: { backgroundColor: PALETTE.verdePrimario, padding: 16, borderRadius: 8, alignItems: 'center' },
    btnSaveText: { color: PALETTE.branco, fontSize: 16, fontWeight: 'bold' },
    emptyState: { alignItems: 'center', justifyContent: 'center', padding: 20 },
    emptyText: { color: PALETTE.cinza, fontSize: 16, textAlign: 'center' },
    
    stockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    stockItem: { flex: 1, alignItems: 'center' },
    stockLabel: { color: '#E8EAF6', fontSize: 12, marginBottom: 4, textAlign: 'center' },
    stockValue: { color: PALETTE.branco, fontSize: 18, fontWeight: 'bold' },
    stockDivider: { width: 1, height: 40, backgroundColor: '#3F51B5' }
});