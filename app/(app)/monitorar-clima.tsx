import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    TextInput as RNTextInput,
    ActivityIndicator,
    Modal,
    FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '@/components/Button';
import { syncService } from '@/services/sync';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';

const PALETTE = {
    verdePrimario: '#5D7261',
    verdeClaro: '#F0F5F0',
    verdeClaro2: '#E8F0E8',
    terracota: '#B16338',
    branco: '#FFFFFF',
    preto: '#1A1A1A',
    cinza: '#666666',
    cinzaClaro: '#EEEEEE',
    cinzaClaro2: '#F5F5F5',
    erro: '#D32F2F',
    sucesso: '#4CAF50',
    azul: '#2196F3',
    azulEscuro: '#1565C0',
    laranja: '#FF9800'
};

interface MonitoramentoChuva {
    id: string;
    leiraId: string;
    data: string;
    precipitacao: number;
    umidade?: string;
    observacao?: string;
    timestamp: number;
}

interface Leira {
    id: string;
    nome: string;
    numeroLeira: number;
    lote: string; // Adicionado campo lote
    status: string;
}

export default function MonitorarClimaScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    
    // Dados
    const [leiras, setLeiras] = useState<Leira[]>([]);
    const [registros, setRegistros] = useState<MonitoramentoChuva[]>([]);
    
    // Filtros
    const [filtroLote, setFiltroLote] = useState('');
    const [filtroLeira, setFiltroLeira] = useState('');
    const [showModalFiltro, setShowModalFiltro] = useState(false);
    const [tipoFiltro, setTipoFiltro] = useState<'lote' | 'leira'>('lote');

    // Formulário
    const [formData, setFormData] = useState({
        data: new Date().toLocaleDateString('pt-BR'),
        leiraId: '',
        precipitacao: '',
        umidade: '',
        observacao: ''
    });

    const [aplicarParaTodas, setAplicarParaTodas] = useState(false);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        try {
            setLoading(true);
            
            // 1. Carregar Leiras
            const storedLeiras = await AsyncStorage.getItem('leirasFormadas');
            if (storedLeiras) {
                const todas = JSON.parse(storedLeiras);
                const ativas = todas
                    .filter((l: any) => l.status !== 'pronta')
                    .map((l: any) => ({
                        id: l.id,
                        nome: `Leira #${l.numeroLeira}`,
                        numeroLeira: l.numeroLeira,
                        lote: l.lote || 'S/L', // Garante que tenha lote
                        status: l.status
                    }));
                
                setLeiras(ativas);
                if (ativas.length > 0 && !formData.leiraId) {
                    setFormData(prev => ({ ...prev, leiraId: ativas[0].id }));
                }
            }

            // 2. Carregar Registros
            const storedRegistros = await AsyncStorage.getItem('leirasClimatica');
            if (storedRegistros) {
                const parsed = JSON.parse(storedRegistros);
                setRegistros(parsed.sort((a: any, b: any) => b.timestamp - a.timestamp));
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // ===== LÓGICA DE FILTRAGEM =====
    const registrosFiltrados = registros.filter(reg => {
        // Encontra a leira associada a este registro
        const leiraAssociada = leiras.find(l => l.id === reg.leiraId);
        
        // Se a leira foi excluída mas o registro existe, mostramos se não houver filtro
        if (!leiraAssociada) return !filtroLote && !filtroLeira;

        // Filtro de Lote
        if (filtroLote && leiraAssociada.lote !== filtroLote) return false;

        // Filtro de Leira (Número)
        if (filtroLeira && leiraAssociada.numeroLeira.toString() !== filtroLeira) return false;

        return true;
    });

    // Listas únicas para os modais de filtro
    const lotesUnicos = Array.from(new Set(leiras.map(l => l.lote))).sort();
    const leirasUnicas = leiras
        .filter(l => !filtroLote || l.lote === filtroLote) // Se tem lote selecionado, mostra só leiras dele
        .map(l => l.numeroLeira.toString())
        .sort((a, b) => Number(a) - Number(b));

    const abrirFiltro = (tipo: 'lote' | 'leira') => {
        setTipoFiltro(tipo);
        setShowModalFiltro(true);
    };

    const selecionarFiltro = (valor: string) => {
        if (tipoFiltro === 'lote') {
            setFiltroLote(valor);
            setFiltroLeira(''); // Reseta leira ao mudar lote
        } else {
            setFiltroLeira(valor);
        }
        setShowModalFiltro(false);
    };

    const limparFiltros = () => {
        setFiltroLote('');
        setFiltroLeira('');
    };

    // ===== FORMATAR DATA =====
    const formatarData = (text: string) => {
        let formatted = text.replace(/\D/g, '');
        if (formatted.length <= 2) return formatted;
        if (formatted.length <= 4) return formatted.slice(0, 2) + '/' + formatted.slice(2);
        return formatted.slice(0, 2) + '/' + formatted.slice(2, 4) + '/' + formatted.slice(4, 8);
    };

    // ===== SALVAR =====
    const handleSave = async () => {
        if (!formData.data.trim()) { Alert.alert('Erro', 'Digite a data'); return; }
        if (!formData.precipitacao.trim()) { Alert.alert('Erro', 'Digite a precipitação'); return; }

        const leirasAlvo = aplicarParaTodas ? leiras.map(l => l.id) : [formData.leiraId];
        
        if (leirasAlvo.length === 0) { Alert.alert('Erro', 'Nenhuma leira selecionada'); return; }

        const novosRegistros: MonitoramentoChuva[] = [];
        const [dia, mes, ano] = formData.data.split('/').map(Number);
        const timestamp = new Date(ano, mes - 1, dia).getTime();

        for (const leiraId of leirasAlvo) {
            novosRegistros.push({
                id: `${Date.now()}-${leiraId}`,
                leiraId,
                data: formData.data,
                precipitacao: parseFloat(formData.precipitacao),
                umidade: formData.umidade || undefined,
                observacao: formData.observacao || undefined,
                timestamp
            });
        }

        try {
            const listaAtualizada = [...registros, ...novosRegistros];
            await AsyncStorage.setItem('leirasClimatica', JSON.stringify(listaAtualizada));
            setRegistros(listaAtualizada.sort((a, b) => b.timestamp - a.timestamp));

            for (const rec of novosRegistros) {
                await syncService.adicionarFila('clima', rec);
            }

            setFormData({
                data: new Date().toLocaleDateString('pt-BR'),
                leiraId: leiras.length > 0 ? leiras[0].id : '',
                precipitacao: '',
                umidade: '',
                observacao: ''
            });
            setAplicarParaTodas(false);
            setShowForm(false);
            Alert.alert('Sucesso! ✅', 'Monitoramento registrado com sucesso!');
        } catch (error) {
            Alert.alert('Erro', 'Falha ao salvar');
        }
    };

    // ===== HELPERS =====
    const getUmidadeColor = (tipo: string) => {
        if (tipo === 'Seca') return PALETTE.terracota;
        if (tipo === 'Ideal') return PALETTE.sucesso;
        if (tipo === 'Encharcada') return PALETTE.azul;
        return PALETTE.cinza;
    };

    const getPrecipitacaoColor = (valor: number) => {
        if (valor === 0) return PALETTE.terracota;
        if (valor <= 10) return PALETTE.laranja;
        return PALETTE.azul;
    };

    if (loading) return <ActivityIndicator style={{flex:1}} color={PALETTE.verdePrimario} />;

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* ===== HEADER ===== */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color={PALETTE.verdePrimario} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Monitorar Clima</Text>
                    <View style={styles.backButton} />
                </View>

                {/* ===== BARRA DE FILTROS (NOVO) ===== */}
                <View style={styles.filterContainer}>
                    <Text style={styles.filterLabel}>Filtrar Registros:</Text>
                    <View style={styles.filterRow}>
                        <TouchableOpacity 
                            style={[styles.filterBtn, filtroLote ? styles.filterBtnActive : null]} 
                            onPress={() => abrirFiltro('lote')}
                        >
                            <Text style={[styles.filterBtnText, filtroLote ? styles.filterBtnTextActive : null]}>
                                {filtroLote ? `Lote: ${filtroLote}` : 'Todos Lotes'}
                            </Text>
                            <Ionicons name="chevron-down" size={14} color={filtroLote ? PALETTE.branco : PALETTE.cinza} />
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={[styles.filterBtn, filtroLeira ? styles.filterBtnActive : null]} 
                            onPress={() => abrirFiltro('leira')}
                        >
                            <Text style={[styles.filterBtnText, filtroLeira ? styles.filterBtnTextActive : null]}>
                                {filtroLeira ? `Leira #${filtroLeira}` : 'Todas Leiras'}
                            </Text>
                            <Ionicons name="chevron-down" size={14} color={filtroLeira ? PALETTE.branco : PALETTE.cinza} />
                        </TouchableOpacity>
                    </View>
                    
                    {(filtroLote || filtroLeira) && (
                        <TouchableOpacity onPress={limparFiltros} style={styles.clearFilterBtn}>
                            <Text style={styles.clearFilterText}>Limpar Filtros ✕</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* ===== STATS ===== */}
                <View style={styles.statsContainer}>
                    <StatBox
                        label="Leiras Ativas"
                        value={leiras.length.toString()}
                        unit="unid"
                        color={PALETTE.verdePrimario}
                    />
                    <StatBox
                        label="Registros Hoje"
                        value={registros.filter(r => r.data === new Date().toLocaleDateString('pt-BR')).length.toString()}
                        unit="regs"
                        color={PALETTE.azul}
                    />
                </View>

                {/* ===== FORM SECTION ===== */}
                {showForm ? (
                    <View style={styles.formCard}>
                        <Text style={styles.formTitle}>Novo Monitoramento</Text>

                        {/* DATA */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Data do Registro</Text>
                            <View style={styles.inputBox}>
                                <Text style={styles.inputIcon}>📅</Text>
                                <RNTextInput
                                    style={styles.input}
                                    value={formData.data}
                                    onChangeText={(text) => setFormData({...formData, data: formatarData(text)})}
                                    keyboardType="numeric"
                                    maxLength={10}
                                />
                            </View>
                        </View>

                        {/* SELEÇÃO DE LEIRA */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Aplicar Para</Text>
                            
                            <TouchableOpacity 
                                style={[styles.optionBtn, aplicarParaTodas && styles.optionBtnActive]}
                                onPress={() => setAplicarParaTodas(!aplicarParaTodas)}
                            >
                                <Text style={[styles.optionText, aplicarParaTodas && styles.optionTextActive]}>
                                    {aplicarParaTodas ? '✅ Todas as Leiras Ativas' : '☐ Aplicar para Todas'}
                                </Text>
                            </TouchableOpacity>

                            {!aplicarParaTodas && (
                                <View style={[styles.inputBox, {marginTop: 10}]}>
                                    <Picker
                                        selectedValue={formData.leiraId}
                                        onValueChange={(val) => setFormData({...formData, leiraId: val})}
                                        style={{flex: 1, color: PALETTE.preto}}
                                    >
                                        {leiras.map(l => (
                                            <Picker.Item key={l.id} label={`${l.nome} (Lote ${l.lote})`} value={l.id} />
                                        ))}
                                    </Picker>
                                </View>
                            )}
                        </View>

                        {/* PRECIPITAÇÃO */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Precipitação (mm)</Text>
                            <View style={styles.inputBox}>
                                <Text style={styles.inputIcon}>🌧️</Text>
                                <RNTextInput
                                    style={styles.input}
                                    placeholder="Ex: 15"
                                    value={formData.precipitacao}
                                    onChangeText={(text) => setFormData({...formData, precipitacao: text})}
                                    keyboardType="decimal-pad"
                                />
                            </View>
                        </View>

                        {/* UMIDADE */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Umidade do Solo</Text>
                            <View style={styles.optionsRow}>
                                {['Seca', 'Ideal', 'Encharcada'].map((tipo) => (
                                    <TouchableOpacity
                                        key={tipo}
                                        style={[
                                            styles.optionBtn,
                                            formData.umidade === tipo && {
                                                backgroundColor: getUmidadeColor(tipo) + '20', // 20% opacity
                                                borderColor: getUmidadeColor(tipo)
                                            }
                                        ]}
                                        onPress={() => setFormData({...formData, umidade: formData.umidade === tipo ? '' : tipo})}
                                    >
                                        <Text style={[
                                            styles.optionText,
                                            formData.umidade === tipo && { color: getUmidadeColor(tipo) }
                                        ]}>
                                            {tipo}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* OBSERVAÇÃO */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Observação</Text>
                            <View style={styles.inputBox}>
                                <Text style={styles.inputIcon}>📝</Text>
                                <RNTextInput
                                    style={styles.input}
                                    placeholder="Opcional..."
                                    value={formData.observacao}
                                    onChangeText={(text) => setFormData({...formData, observacao: text})}
                                />
                            </View>
                        </View>

                        {/* BUTTONS */}
                        <View style={styles.buttonGroup}>
                            <Button title="Cancelar" onPress={() => setShowForm(false)} fullWidth />
                            <View style={styles.buttonSpacer} />
                            <Button title="Salvar Registro" onPress={handleSave} fullWidth variant="primary" />
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
                        <Text style={styles.addBtnIcon}>+</Text>
                        <Text style={styles.addBtnText}>Adicionar Novo Monitoramento</Text>
                    </TouchableOpacity>
                )}

                {/* ===== LIST SECTION ===== */}
                <View style={styles.listSection}>
                    <Text style={styles.listTitle}>
                        {filtroLeira ? `Registros da Leira #${filtroLeira}` : 'Últimos Registros'}
                    </Text>

                    {registrosFiltrados.length > 0 ? (
                        registrosFiltrados.map((item) => {
                            const leira = leiras.find(l => l.id === item.leiraId);
                            const nomeLeira = leira ? `${leira.nome} (Lote ${leira.lote})` : 'Leira Excluída';
                            
                            return (
                                <View key={item.id} style={styles.materialCard}>
                                    <View style={styles.materialCardHeader}>
                                        <View style={styles.materialCardLeft}>
                                            <Text style={styles.materialCardIcon}>🌧️</Text>
                                            <View style={styles.materialCardInfo}>
                                                <Text style={styles.materialCardTitle}>{nomeLeira}</Text>
                                                <Text style={styles.materialCardDate}>{item.data}</Text>
                                            </View>
                                        </View>

                                        <View style={[styles.materialCardBadge, {backgroundColor: getPrecipitacaoColor(item.precipitacao) + '20'}]}>
                                            <Text style={[styles.materialCardBadgeText, {color: getPrecipitacaoColor(item.precipitacao)}]}>
                                                {item.precipitacao} mm
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.materialCardDetails}>
                                        {item.umidade && (
                                            <View style={styles.detailItem}>
                                                <Text style={styles.detailLabel}>Umidade</Text>
                                                <Text style={[styles.detailValue, {color: getUmidadeColor(item.umidade)}]}>
                                                    {item.umidade}
                                                </Text>
                                            </View>
                                        )}
                                        {item.observacao && (
                                            <View style={[styles.detailItem, {flex: 2}]}>
                                                <Text style={styles.detailLabel}>Obs</Text>
                                                <Text style={styles.detailValue} numberOfLines={1}>{item.observacao}</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            );
                        })
                    ) : (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>🌤️</Text>
                            <Text style={styles.emptyText}>Nenhum registro encontrado</Text>
                            <Text style={styles.emptySubtext}>Tente mudar os filtros ou adicione um novo</Text>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* MODAL DE FILTRO */}
            <Modal visible={showModalFiltro} transparent animationType="slide" onRequestClose={() => setShowModalFiltro(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Selecione {tipoFiltro === 'lote' ? 'o Lote' : 'a Leira'}</Text>
                            <TouchableOpacity onPress={() => setShowModalFiltro(false)}>
                                <Ionicons name="close" size={24} color={PALETTE.cinza} />
                            </TouchableOpacity>
                        </View>
                        
                        <FlatList
                            data={tipoFiltro === 'lote' ? lotesUnicos : leirasUnicas}
                            keyExtractor={(item) => item}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={styles.modalItem} onPress={() => selecionarFiltro(item)}>
                                    <Text style={styles.modalItemText}>
                                        {tipoFiltro === 'lote' ? `Lote ${item}` : `Leira #${item}`}
                                    </Text>
                                    <Ionicons name="chevron-forward" size={20} color={PALETTE.cinzaClaro} />
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// ===== COMPONENTE: STAT BOX =====
function StatBox({ label, value, unit, color }: any) {
    return (
        <View style={[styles.statBox, { borderTopColor: color }]}>
            <Text style={styles.statBoxLabel}>{label}</Text>
            <View style={styles.statBoxValue}>
                <Text style={[styles.statBoxNumber, { color }]}>{value}</Text>
                <Text style={styles.statBoxUnit}>{unit}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: PALETTE.verdeClaro },
    scrollContent: { flexGrow: 1, paddingBottom: 30 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: PALETTE.branco, borderBottomWidth: 1, borderBottomColor: PALETTE.cinzaClaro2 },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: PALETTE.preto },
    
    // FILTROS
    filterContainer: { backgroundColor: PALETTE.branco, padding: 15, marginBottom: 15, borderBottomWidth: 1, borderBottomColor: PALETTE.cinzaClaro2 },
    filterLabel: { fontSize: 11, fontWeight: '700', color: PALETTE.cinza, marginBottom: 8, textTransform: 'uppercase' },
    filterRow: { flexDirection: 'row', gap: 10 },
    filterBtn: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: PALETTE.cinzaClaro2, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: PALETTE.cinzaClaro },
    filterBtnActive: { backgroundColor: PALETTE.azul, borderColor: PALETTE.azul },
    filterBtnText: { fontSize: 12, fontWeight: '600', color: PALETTE.cinza },
    filterBtnTextActive: { color: PALETTE.branco },
    clearFilterBtn: { alignSelf: 'flex-end', marginTop: 8 },
    clearFilterText: { fontSize: 11, fontWeight: '700', color: PALETTE.erro },

    statsContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 20, gap: 10 },
    statBox: { flex: 1, backgroundColor: PALETTE.branco, borderRadius: 12, padding: 14, borderTopWidth: 3 },
    statBoxLabel: { fontSize: 11, color: PALETTE.cinza, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    statBoxValue: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    statBoxNumber: { fontSize: 22, fontWeight: '800' },
    statBoxUnit: { fontSize: 11, color: PALETTE.cinza, fontWeight: '600' },
    formCard: { backgroundColor: PALETTE.branco, marginHorizontal: 20, marginBottom: 20, borderRadius: 16, padding: 20, borderTopWidth: 3, borderTopColor: PALETTE.verdePrimario },
    formTitle: { fontSize: 18, fontWeight: '700', color: PALETTE.preto, marginBottom: 20 },
    formGroup: { marginBottom: 18 },
    label: { fontSize: 12, fontWeight: '700', color: PALETTE.verdePrimario, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.cinzaClaro2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1.5, borderColor: PALETTE.verdePrimario },
    inputIcon: { fontSize: 18, marginRight: 10 },
    input: { flex: 1, fontSize: 14, color: PALETTE.preto, fontWeight: '600' },
    optionsRow: { flexDirection: 'row', gap: 10 },
    optionBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: PALETTE.cinzaClaro2, borderWidth: 1.5, borderColor: PALETTE.cinzaClaro2, alignItems: 'center' },
    optionBtnActive: { backgroundColor: PALETTE.verdeClaro2, borderColor: PALETTE.verdePrimario },
    optionText: { fontSize: 12, fontWeight: '600', color: PALETTE.cinza },
    optionTextActive: { color: PALETTE.verdePrimario },
    buttonGroup: { marginTop: 20 },
    buttonSpacer: { height: 10 },
    addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, marginBottom: 20, backgroundColor: PALETTE.verdePrimario, borderRadius: 12, paddingVertical: 14, gap: 8 },
    addBtnIcon: { fontSize: 24, fontWeight: '700', color: PALETTE.branco },
    addBtnText: { fontSize: 14, fontWeight: '700', color: PALETTE.branco },
    listSection: { paddingHorizontal: 20 },
    listTitle: { fontSize: 16, fontWeight: '700', color: PALETTE.preto, marginBottom: 12 },
    materialCard: { backgroundColor: PALETTE.branco, borderRadius: 12, padding: 14, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: PALETTE.verdePrimario },
    materialCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    materialCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    materialCardIcon: { fontSize: 28, marginRight: 12 },
    materialCardInfo: { flex: 1 },
    materialCardTitle: { fontSize: 13, fontWeight: '700', color: PALETTE.preto },
    materialCardDate: { fontSize: 11, color: PALETTE.cinza, marginTop: 2 },
    materialCardBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 },
    materialCardBadgeText: { fontSize: 11, fontWeight: '600' },
    materialCardDetails: { flexDirection: 'row', gap: 12 },
    detailItem: { flex: 1 },
    detailLabel: { fontSize: 10, color: PALETTE.cinza, fontWeight: '500', marginBottom: 4, textTransform: 'uppercase' },
    detailValue: { fontSize: 13, fontWeight: '700', color: PALETTE.preto },
    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyText: { fontSize: 14, fontWeight: '700', color: PALETTE.preto, marginBottom: 6 },
    emptySubtext: { fontSize: 12, color: PALETTE.cinza },

    // MODAL
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: PALETTE.branco, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: PALETTE.preto },
    modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: PALETTE.cinzaClaro2, flexDirection: 'row', justifyContent: 'space-between' },
    modalItemText: { fontSize: 16, color: PALETTE.preto },
});