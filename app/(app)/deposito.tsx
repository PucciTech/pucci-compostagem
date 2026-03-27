import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput as RNTextInput, ActivityIndicator, StyleSheet, Alert, Modal } from 'react-native';
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
    mtrsOriginais?: string[];
}

// 🔥 NOVA INTERFACE PARA O EXTRATO
interface ExtratoBagacoEntry {
    id: string;
    data: string;
    hora: string;
    tipo: 'ENTRADA' | 'SAIDA';
    quantidade: number;
    motivo: string;
}

export default function DepositoScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    
    // Estados de Estoque
    const [estoqueDep1, setEstoqueDep1] = useState(0);
    const [estoqueDep2, setEstoqueDep2] = useState(0);
    const [estoqueBagaco, setEstoqueBagaco] = useState(0);
    
    const [lotes, setLotes] = useState<MaterialEntry[]>([]);
    
    const [filtroAtivo, setFiltroAtivo] = useState < 'Todos' | 'Depósito 1' | 'Depósito 2' | 'Bagaço'>('Todos');

    // Estados para Transferência de Bagaço
    const [pesoTransferencia, setPesoTransferencia] = useState('');
    const [destinoTransferencia, setDestinoTransferencia] = useState('Depósito 1');

    // 🔥 ESTADOS DO EXTRATO
    const [modalExtratoVisivel, setModalExtratoVisivel] = useState(false);
    const [extratoList, setExtratoList] = useState<ExtratoBagacoEntry[]>([]);

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
                
                let dep1 = 0;
                let dep2 = 0;
                let bagacoGeral = 0;

                const lotesAtivos = materiais.filter(m => !m.usado);

                lotesAtivos.forEach(m => {
                    const peso = parseFloat(m.peso.replace(',', '.'));
                    if (m.destino === 'Depósito 1') {
                        dep1 += peso;
                    } else if (m.destino === 'Depósito 2') {
                        dep2 += peso;
                    } else if (m.tipoMaterial.includes('Bagaço')) {
                        bagacoGeral += peso;
                    }
                });

                setEstoqueDep1(dep1);
                setEstoqueDep2(dep2);
                setEstoqueBagaco(bagacoGeral);
                
                const todosLotes = lotesAtivos.filter(m => 
                    m.destino === 'Depósito 1' || 
                    m.destino === 'Depósito 2' || 
                    (m.tipoMaterial.includes('Bagaço') && m.destino !== 'Depósito 1' && m.destino !== 'Depósito 2')
                );
                
                setLotes(todosLotes.sort((a, b) => Number(b.id) - Number(a.id)));
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    
    //🔥 FUNÇÃO PARA ABRIR O EXTRATO (BUSCANDO DIRETO DA NUVEM)
    const abrirExtrato = async () => {
        try {
            setLoading(true); // Mostra o loading enquanto busca na nuvem
            
            const netlifyUrl = process.env.EXPO_PUBLIC_NETLIFY_URL || 'http://localhost:9999';
            
            // Faz a requisição para a nuvem
            const response = await fetch(`${netlifyUrl}/.netlify/functions/get-extrato-bagaco`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const result = await response.json();
                
                if (result.sucesso && result.dados) {
                    // Ordena do mais recente para o mais antigo
                    const extratoNuvem = result.dados.sort((a: any, b: any) => Number(b.id) - Number(a.id));
                    
                    // Formata os dados para a tela
                    const extratoFormatado = extratoNuvem.map((item: any) => ({
                        id: item.id,
                        data: item.data,
                        hora: item.hora,
                        tipo: item.tipo,
                        quantidade: Number(item.quantidade),
                        motivo: item.motivo
                    }));

                    setExtratoList(extratoFormatado);
                    
                    // 🔥 Opcional: Atualiza o cache local com os dados limpos da nuvem
                    await AsyncStorage.setItem('extratoBagaco', JSON.stringify(extratoFormatado));
                } else {
                    setExtratoList([]);
                }
            } else {
                throw new Error('Falha na resposta do servidor');
            }

            setModalExtratoVisivel(true);
        } catch (error) {
            console.error("Erro ao buscar extrato da nuvem:", error);
            Alert.alert('Erro', 'Não foi possível buscar o extrato da nuvem. Verifique sua conexão.');
        } finally {
            setLoading(false);
        }
    };

    const lotesFiltrados = useMemo(() => {
        if (filtroAtivo === 'Todos') return lotes;
        if (filtroAtivo === 'Bagaço') {
            return lotes.filter(l => l.tipoMaterial.includes('Bagaço') && l.destino !== 'Depósito 1' && l.destino !== 'Depósito 2');
        }
        return lotes.filter(l => l.destino === filtroAtivo);
    }, [lotes, filtroAtivo]);

    const toggleFiltro = (filtro: 'Depósito 1' | 'Depósito 2' | 'Bagaço') => {
        if (filtroAtivo === filtro) {
            setFiltroAtivo('Todos');
        } else {
            setFiltroAtivo(filtro);
        }
    };

    // ===== TRANSFERIR BAGAÇO PARA DEPÓSITO =====
    const handleTransferirBagaco = async () => {
        const pesoTransf = parseFloat(pesoTransferencia.replace(',', '.'));
        if (isNaN(pesoTransf) || pesoTransf <= 0) return Alert.alert('Atenção', 'Informe um peso válido.');
        if (pesoTransf > estoqueBagaco) return Alert.alert('Atenção', 'Saldo de bagaço insuficiente no estoque geral.');

        try {
            setLoading(true);
            const registros = await AsyncStorage.getItem('materiaisRegistrados');
            let todosMateriais: MaterialEntry[] = registros ? JSON.parse(registros) : [];
            const itensParaSincronizar: MaterialEntry[] = [];
            const timestamp = Date.now();

            const lotesBagacoGeral = todosMateriais.filter(m => 
                m.tipoMaterial.includes('Bagaço') && !m.usado && m.destino !== 'Depósito 1' && m.destino !== 'Depósito 2'
            );

            todosMateriais = todosMateriais.map(m => {
                if (lotesBagacoGeral.some(l => l.id === m.id)) {
                    const atualizado = { ...m, usado: true, sincronizado: false };
                    itensParaSincronizar.push(atualizado);
                    return atualizado;
                }
                return m;
            });

            const loteDeposito: MaterialEntry = {
                id: timestamp.toString(),
                data: new Date().toLocaleDateString('pt-BR'),
                tipoMaterial: 'Bagaço de Cana',
                numeroMTR: `TRANSF-${timestamp.toString().slice(-4)}`,
                peso: pesoTransf.toFixed(2),
                origem: 'Estoque Geral',
                destino: destinoTransferencia,
                sincronizado: false,
                usado: false
            };
            todosMateriais.push(loteDeposito);
            itensParaSincronizar.push(loteDeposito);

            const saldoRestante = estoqueBagaco - pesoTransf;
            if (saldoRestante > 0) {
                const loteRestante: MaterialEntry = {
                    id: (timestamp + 1).toString(),
                    data: new Date().toLocaleDateString('pt-BR'),
                    tipoMaterial: 'Bagaço de Cana',
                    numeroMTR: 'SALDO REMANESCENTE',
                    peso: saldoRestante.toFixed(2),
                    origem: 'Estoque Interno',
                    destino: 'Estoque Bagaço',
                    sincronizado: false,
                    usado: false
                };
                todosMateriais.push(loteRestante);
                itensParaSincronizar.push(loteRestante);
            }

            await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(todosMateriais));

            // 📝 
            // SENSOR 6: TRANSFERÊNCIA DE BAGAÇO PARA DEPÓSITO
            // 
            const extratoSalvo = await AsyncStorage.getItem('extratoBagaco');
            const extrato = extratoSalvo ? JSON.parse(extratoSalvo) : [];
            extrato.push({
                id: Date.now().toString(),
                data: new Date().toLocaleDateString('pt-BR'),
                hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                tipo: 'SAIDA',
                quantidade: pesoTransf,
                motivo: `Transferência para ${destinoTransferencia}`
            });
            await AsyncStorage.setItem('extratoBagaco', JSON.stringify(extrato));
            // 

            for (const item of itensParaSincronizar) await syncService.adicionarFila('material', item);

            setPesoTransferencia('');
            await loadData();
            Alert.alert('Sucesso! 🔄', `${pesoTransf}t de Bagaço enviadas para o ${destinoTransferencia}.`);

        } catch (error) {
            Alert.alert('Erro', 'Falha ao transferir o bagaço.');
            setLoading(false);
        }
    };

    if (loading) return <ActivityIndicator style={{ flex: 1 }} color={PALETTE.verdePrimario} />;

    const totalMisturas = estoqueDep1 + estoqueDep2;

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* HEADER */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <MaterialCommunityIcons name="arrow-left" size={24} color={PALETTE.cinzaEscuro} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Gestão de Depósitos</Text>
                    <View style={styles.backButton} />
                </View>

                {/* RESUMO GERAL */}
                <View style={styles.summaryCard}>
                    <MaterialCommunityIcons name="warehouse" size={40} color={PALETTE.branco} style={{ opacity: 0.8 }} />
                    <View style={{ marginLeft: 16 }}>
                        <Text style={{ color: '#E3F2FD', fontSize: 14 }}>Mistura Preparada Total</Text>
                        <Text style={{ color: PALETTE.branco, fontSize: 28, fontWeight: 'bold' }}>
                            {totalMisturas.toFixed(2)} <Text style={{ fontSize: 16, fontWeight: 'normal' }}>toneladas</Text>
                        </Text>
                    </View>
                </View>

                {/* CARDS DOS DEPÓSITOS */}
                <View style={styles.depositsRow}>
                    <TouchableOpacity 
                        style={[
                            styles.depositCard, 
                            { borderTopColor: '#0288D1', borderTopWidth: 4 },
                            filtroAtivo === 'Depósito 1' && { backgroundColor: '#E1F5FE', borderColor: '#0288D1', borderWidth: 1 }
                        ]}
                        onPress={() => toggleFiltro('Depósito 1')}
                        activeOpacity={0.7}
                    >
                        <View style={styles.depositHeader}>
                            <MaterialCommunityIcons name="numeric-1-box-multiple" size={24} color="#0288D1" />
                            <Text style={styles.depositTitle}>Depósito 1</Text>
                        </View>
                        <Text style={styles.depositValue}>{estoqueDep1.toFixed(2)} t</Text>
                        <Text style={styles.depositSubtitle}>Material Armazenado</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[
                            styles.depositCard, 
                            { borderTopColor: '#0097A7', borderTopWidth: 4 },
                            filtroAtivo === 'Depósito 2' && { backgroundColor: '#E0F7FA', borderColor: '#0097A7', borderWidth: 1 }
                        ]}
                        onPress={() => toggleFiltro('Depósito 2')}
                        activeOpacity={0.7}
                    >
                        <View style={styles.depositHeader}>
                            <MaterialCommunityIcons name="numeric-2-box-multiple" size={24} color="#0097A7" />
                            <Text style={styles.depositTitle}>Depósito 2</Text>
                        </View>
                        <Text style={styles.depositValue}>{estoqueDep2.toFixed(2)} t</Text>
                        <Text style={styles.depositSubtitle}>Material Armazenado</Text>
                    </TouchableOpacity>
                </View>

                {/* CARD DO DEPÓSITO DE BAGAÇO */}
                <View style={{ marginTop: 12 }}>
                    <TouchableOpacity 
                        style={[
                            styles.depositCard, 
                            { borderTopColor: '#F57C00', borderTopWidth: 4 },
                            filtroAtivo === 'Bagaço' && { backgroundColor: '#FFF3E0', borderColor: '#F57C00', borderWidth: 1 }
                        ]}
                        onPress={() => toggleFiltro('Bagaço')}
                        activeOpacity={0.7}
                    >
                        <View style={styles.depositHeader}>
                            <MaterialCommunityIcons name="sprout" size={24} color="#F57C00" />
                            <Text style={styles.depositTitle}>Estoque de Bagaço</Text>
                        </View>
                        <Text style={styles.depositValue}>{estoqueBagaco.toFixed(2)} t</Text>
                        <Text style={styles.depositSubtitle}>Matéria-prima disponível</Text>
                    </TouchableOpacity>

                    {/* 🔥 BOTÃO DO EXTRATO */}
                    <TouchableOpacity 
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, padding: 12, backgroundColor: '#FFF8E1', borderRadius: 8, borderWidth: 1, borderColor: '#FFCA28' }}
                        onPress={abrirExtrato}
                    >
                        <MaterialCommunityIcons name="text-box-search-outline" size={20} color="#F57C00" style={{ marginRight: 8 }} />
                        <Text style={{ color: '#F57C00', fontSize: 14, fontWeight: 'bold' }}>Ver Extrato do Bagaço</Text>
                    </TouchableOpacity>
                </View>

                {/* ÁREA DE TRANSFERÊNCIA DE BAGAÇO */}
                {estoqueBagaco > 0 && (
                    <View style={[styles.summaryCard, { backgroundColor: PALETTE.branco, flexDirection: 'column', alignItems: 'stretch', padding: 16, marginTop: 16, borderColor: '#F57C00', borderWidth: 1 }]}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#F57C00', marginBottom: 12 }}>
                            🔄 Enviar Bagaço para Depósito
                        </Text>
                        
                        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, fontWeight: 'bold', color: PALETTE.cinzaEscuro, marginBottom: 4 }}>Quantidade (Ton)</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: PALETTE.cinzaClaro, borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#FAFAFA', height: 44 }}>
                                    <MaterialCommunityIcons name="weight" size={18} color={PALETTE.cinza} style={{ marginRight: 8 }} />
                                    <RNTextInput
                                        style={{ flex: 1, fontSize: 14, color: PALETTE.cinzaEscuro }}
                                        value={pesoTransferencia}
                                        onChangeText={setPesoTransferencia}
                                        keyboardType="decimal-pad"
                                        placeholder={`Máx: ${estoqueBagaco.toFixed(2)}`}
                                    />
                                </View>
                            </View>

                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, fontWeight: 'bold', color: PALETTE.cinzaEscuro, marginBottom: 4 }}>Para onde?</Text>
                                <View style={{ flexDirection: 'row', gap: 4 }}>
                                    {['Depósito 1', 'Depósito 2'].map((dest) => (
                                        <TouchableOpacity
                                            key={dest}
                                            style={[
                                                { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderWidth: 1, borderColor: PALETTE.cinzaClaro, borderRadius: 8, backgroundColor: '#FAFAFA' },
                                                destinoTransferencia === dest && { borderColor: '#F57C00', backgroundColor: '#FFF3E0' }
                                            ]}
                                            onPress={() => setDestinoTransferencia(dest)}
                                        >
                                            <Text style={[
                                                { fontSize: 11, color: PALETTE.cinza, fontWeight: '500' },
                                                destinoTransferencia === dest && { color: '#F57C00', fontWeight: 'bold' }
                                            ]}>
                                                {dest.replace('Depósito ', 'Dep ')}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity 
                            style={{ backgroundColor: '#F57C00', padding: 12, borderRadius: 8, alignItems: 'center' }}
                            onPress={handleTransferirBagaco}
                        >
                            <Text style={{ color: PALETTE.branco, fontSize: 14, fontWeight: 'bold' }}>Confirmar Transferência</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* LISTAGEM DE LOTES FILTRADOS */}
                <View style={{ marginTop: 24 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: PALETTE.cinzaEscuro }}>
                            {filtroAtivo === 'Todos' ? 'Histórico Geral' : `Lotes: ${filtroAtivo}`} ({lotesFiltrados.length})
                        </Text>
                        
                        {filtroAtivo !== 'Todos' && (
                            <TouchableOpacity onPress={() => setFiltroAtivo('Todos')} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEEEEE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                                <Text style={{ color: PALETTE.cinzaEscuro, fontSize: 12, fontWeight: 'bold', marginRight: 4 }}>Ver todos</Text>
                                <MaterialCommunityIcons name="close-circle" size={14} color={PALETTE.cinzaEscuro} />
                            </TouchableOpacity>
                        )}
                    </View>
                    
                    {lotesFiltrados.length > 0 ? (
                        lotesFiltrados.map(item => {
                            const isBagaco = item.tipoMaterial.includes('Bagaço');
                            const iconName = isBagaco ? 'sprout' : 'texture';
                            const iconColor = isBagaco ? '#F57C00' : (item.destino === 'Depósito 1' ? '#0288D1' : '#0097A7');
                            const bgColor = isBagaco ? '#FFF3E0' : (item.destino === 'Depósito 1' ? '#E1F5FE' : '#E0F7FA');
                            const title = isBagaco ? 'Bagaço de Cana' : item.destino;

                            return (
                                <View key={item.id} style={styles.loteCard}>
                                    <View style={[styles.loteIcon, { backgroundColor: bgColor }]}>
                                        <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontWeight: 'bold', fontSize: 16, color: PALETTE.cinzaEscuro }}>{title}</Text>
                                        <Text style={{ color: PALETTE.cinza, fontSize: 12, marginTop: 2 }}>Entrada: {item.data}</Text>
                                        <Text style={{ color: PALETTE.cinza, fontSize: 12 }}>Origem: {item.origem}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end', justifyContent: 'center', marginLeft: 8 }}>
                                        <Text style={{ fontWeight: 'bold', fontSize: 18, color: PALETTE.verdePrimario }}>{item.peso} t</Text>
                                        <View style={[styles.badgePronto, isBagaco && { backgroundColor: '#FFF3E0' }]}>
                                            <Text style={[styles.badgeText, isBagaco && { color: '#F57C00' }]}>
                                                {isBagaco ? 'Matéria-prima' : 'Pronto'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        })
                    ) : (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="filter-variant-remove" size={48} color={PALETTE.cinzaClaro} />
                            <Text style={styles.emptyText}>Nenhum lote encontrado para este filtro.</Text>
                        </View>
                    )}
                </View>

            </ScrollView>

            {/* 🔥 MODAL DO EXTRATO DE BAGAÇO */}
            <Modal visible={modalExtratoVisivel} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>Extrato de Bagaço</Text>
                                <Text style={{ color: PALETTE.cinza, fontSize: 12 }}>Histórico de Entradas e Saídas</Text>
                            </View>
                            <TouchableOpacity onPress={() => setModalExtratoVisivel(false)} style={{ padding: 4 }}>
                                <MaterialCommunityIcons name="close-circle" size={28} color={PALETTE.cinza} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {extratoList.length === 0 ? (
                                <View style={{ alignItems: 'center', padding: 40 }}>
                                    <MaterialCommunityIcons name="text-box-remove-outline" size={48} color={PALETTE.cinzaClaro} />
                                    <Text style={{ color: PALETTE.cinza, marginTop: 12 }}>Nenhuma movimentação registrada.</Text>
                                </View>
                            ) : (
                                extratoList.map(item => (
                                    <View key={item.id} style={styles.extratoItem}>
                                        <View style={[styles.extratoIcon, { backgroundColor: item.tipo === 'ENTRADA' ? '#E8F5E9' : '#FFEBEE' }]}>
                                            <MaterialCommunityIcons 
                                                name={item.tipo === 'ENTRADA' ? 'arrow-down-bold' : 'arrow-up-bold'} 
                                                size={20} 
                                                color={item.tipo === 'ENTRADA' ? PALETTE.verdePrimario : PALETTE.terracota} 
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 14, fontWeight: 'bold', color: PALETTE.cinzaEscuro }}>{item.motivo}</Text>
                                            <Text style={{ fontSize: 12, color: PALETTE.cinza }}>{item.data} às {item.hora}</Text>
                                        </View>
                                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: item.tipo === 'ENTRADA' ? PALETTE.verdePrimario : PALETTE.terracota }}>
                                            {item.tipo === 'ENTRADA' ? '+' : '-'} {item.quantidade.toFixed(2)}t
                                        </Text>
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F5F5' },
    scrollContent: { padding: 16, paddingBottom: 40 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: PALETTE.cinzaEscuro },
    
    summaryCard: { backgroundColor: '#0277BD', borderRadius: 16, padding: 24, flexDirection: 'row', alignItems: 'center', marginBottom: 20, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
    
    depositsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    depositCard: { flex: 1, backgroundColor: PALETTE.branco, borderRadius: 12, padding: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
    depositHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    depositTitle: { fontSize: 14, fontWeight: 'bold', color: PALETTE.cinzaEscuro, marginLeft: 8 },
    depositValue: { fontSize: 24, fontWeight: 'bold', color: PALETTE.cinzaEscuro },
    depositSubtitle: { fontSize: 11, color: PALETTE.cinza, marginTop: 4 },
    
    loteCard: { backgroundColor: PALETTE.branco, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: PALETTE.cinzaClaro, flexDirection: 'row', alignItems: 'center' },
    loteIcon: { padding: 12, borderRadius: 8, marginRight: 16 },
    badgePronto: { backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginTop: 4 },
    badgeText: { color: PALETTE.verdePrimario, fontSize: 10, fontWeight: 'bold' },
    
    emptyState: { alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: PALETTE.branco, borderRadius: 12, borderWidth: 1, borderColor: PALETTE.cinzaClaro },
    emptyText: { color: PALETTE.cinza, fontSize: 14, textAlign: 'center', marginTop: 12 },

    // Estilos do Modal de Extrato
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: PALETTE.branco, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '80%', padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: PALETTE.cinzaClaro },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: PALETTE.cinzaEscuro },
    extratoItem: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', alignItems: 'center' },
    extratoIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 16 }
});