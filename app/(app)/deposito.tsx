import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput as RNTextInput, ActivityIndicator, StyleSheet, Alert } from 'react-native';
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

export default function DepositoScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    
    // Estados de Estoque
    const [estoqueDep1, setEstoqueDep1] = useState(0);
    const [estoqueDep2, setEstoqueDep2] = useState(0);
    const [estoqueBagaco, setEstoqueBagaco] = useState(0);
    
    const [lotes, setLotes] = useState<MaterialEntry[]>([]);
    
    // Estado para controlar qual filtro está ativo
    const [filtroAtivo, setFiltroAtivo] = useState <'Todos' | 'Depósito 1' | 'Depósito 2' | 'Bagaço'>('Todos');

    // Estados para Transferência de Bagaço
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
                
                let dep1 = 0;
                let dep2 = 0;
                let bagacoGeral = 0;

                // Pega apenas o que não foi usado
                const lotesAtivos = materiais.filter(m => !m.usado);

                lotesAtivos.forEach(m => {
                    const peso = parseFloat(m.peso.replace(',', '.'));
                    // Se está no depósito, soma no depósito (seja mistura ou bagaço)
                    if (m.destino === 'Depósito 1') {
                        dep1 += peso;
                    } else if (m.destino === 'Depósito 2') {
                        dep2 += peso;
                    } else if (m.tipoMaterial.includes('Bagaço')) {
                        // Se é bagaço e não está nos depósitos, é estoque geral
                        bagacoGeral += peso;
                    }
                });

                setEstoqueDep1(dep1);
                setEstoqueDep2(dep2);
                setEstoqueBagaco(bagacoGeral);
                
                // Lotes para a lista (apenas o que está nos depósitos ou é bagaço geral)
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

    // Lógica que filtra a lista baseada no card clicado
    const lotesFiltrados = useMemo(() => {
        if (filtroAtivo === 'Todos') return lotes;
        if (filtroAtivo === 'Bagaço') {
            return lotes.filter(l => l.tipoMaterial.includes('Bagaço') && l.destino !== 'Depósito 1' && l.destino !== 'Depósito 2');
        }
        return lotes.filter(l => l.destino === filtroAtivo);
    }, [lotes, filtroAtivo]);

    // Função para alternar o filtro ao clicar no card
    const toggleFiltro = (filtro: 'Depósito 1' | 'Depósito 2' | 'Bagaço') => {
        if (filtroAtivo === filtro) {
            setFiltroAtivo('Todos'); // Se clicar no que já está ativo, volta a mostrar todos
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

            // Pega os lotes de bagaço do estoque geral
            const lotesBagacoGeral = todosMateriais.filter(m => 
                m.tipoMaterial.includes('Bagaço') && !m.usado && m.destino !== 'Depósito 1' && m.destino !== 'Depósito 2'
            );

            // Marca como usados
            todosMateriais = todosMateriais.map(m => {
                if (lotesBagacoGeral.some(l => l.id === m.id)) {
                    const atualizado = { ...m, usado: true, sincronizado: false };
                    itensParaSincronizar.push(atualizado);
                    return atualizado;
                }
                return m;
            });

            // Cria o novo lote no depósito
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

            // Calcula o saldo restante e devolve pro estoque geral
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

                {/* CARDS DOS DEPÓSITOS DE MISTURA (AGORA SÃO CLICÁVEIS) */}
                <View style={styles.depositsRow}>
                    {/* Depósito 1 */}
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

                    {/* Depósito 2 */}
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

                {/* CARD DO DEPÓSITO DE BAGAÇO (AGORA É CLICÁVEL) */}
                <TouchableOpacity 
                    style={[
                        styles.depositCard, 
                        { borderTopColor: '#F57C00', borderTopWidth: 4, marginTop: 12 },
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

                {/* 🔥 ÁREA DE TRANSFERÊNCIA DE BAGAÇO */}
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
                        
                        {/* Botão para limpar o filtro se houver algum ativo */}
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
                                        
                                        {!isBagaco && item.mtrsOriginais && item.mtrsOriginais.length > 0 && (
                                            <View style={{ marginTop: 6, backgroundColor: '#F5F5F5', padding: 6, borderRadius: 4 }}>
                                                <Text style={{ color: PALETTE.cinzaEscuro, fontSize: 10, fontWeight: 'bold' }}>MTRs RASTREADOS:</Text>
                                                <Text style={{ color: PALETTE.cinza, fontSize: 11 }}>
                                                    {item.mtrsOriginais.join(', ')}
                                                </Text>
                                            </View>
                                        )}
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
    emptyText: { color: PALETTE.cinza, fontSize: 14, textAlign: 'center', marginTop: 12 }
});