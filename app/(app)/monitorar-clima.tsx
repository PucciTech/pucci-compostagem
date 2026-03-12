import React, { useState, useCallback } from 'react';
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
    FlatList,
    Platform
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '@/components/Button';
import { syncService } from '@/services/sync';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
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
    lote: string;
    status: string;
}

export default function MonitorarClimaScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);

    // Dados
    const [leiras, setLeiras] = useState<Leira[]>([]);
    const [registros, setRegistros] = useState<MonitoramentoChuva[]>([]);

    // Filtros
     const [filtroAno, setFiltroAno] = useState(''); 
    const [filtroLote, setFiltroLote] = useState('');
    const [filtroLeira, setFiltroLeira] = useState('');
    const [showModalFiltro, setShowModalFiltro] = useState(false);
    const [tipoFiltro, setTipoFiltro] = useState<'ano' | 'lote' | 'leira'>('ano'); 

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
                
                // 🔥 FILTRO: Apenas leiras no pátio
                const ativas = todas
                    .filter((l: any) => {
                        const status = l.status?.toLowerCase() || '';
                        return !['pronta', 'finalizada', 'arquivada'].includes(status);
                    })
                    .map((l: any) => ({
                        id: l.id,
                        nome: `Leira #${l.numeroLeira}`,
                        numeroLeira: l.numeroLeira,
                        lote: l.lote || 'S/L',
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
    // 0. Identifica apenas as leiras que já possuem algum registro de chuva
    const leirasComRegistro = leiras.filter(leira => 
        registros.some(reg => reg.leiraId === leira.id)
    );
    
    // 1. Extrai Anos Únicos (baseado apenas nas leiras COM registro)
    const anosUnicos = Array.from(new Set(leirasComRegistro.map(l => {
        const partes = l.lote.split('/');
        return partes.length === 2 ? partes[1] : '';
    }).filter(a => a !== ''))).sort((a, b) => Number(b) - Number(a));

    // 2. Extrai Lotes Únicos (respeitando o Ano selecionado, apenas leiras COM registro)
    const lotesUnicos = Array.from(new Set(
        leirasComRegistro
            .filter(l => !filtroAno || l.lote.endsWith(`/${filtroAno}`))
            .map(l => l.lote)
    )).sort();

    // 3. Extrai Leiras Únicas (respeitando Ano e Lote selecionados, apenas leiras COM registro)
    const leirasUnicas = leirasComRegistro
        .filter(l => !filtroAno || l.lote.endsWith(`/${filtroAno}`))
        .filter(l => !filtroLote || l.lote === filtroLote)
        .map(l => l.numeroLeira.toString())
        .sort((a, b) => Number(a) - Number(b));

    // 4. Aplica os filtros na lista de registros
        // 4. Aplica os filtros na lista de registros
    const registrosFiltrados = registros.filter(reg => {
        const leiraAssociada = leiras.find(l => l.id === reg.leiraId);
        
        // 🔥 MUDANÇA AQUI: Se a leira não existe mais (foi excluída ou finalizada), NÃO traz o registro
        if (!leiraAssociada) return false;
        
        // Aplica os filtros em cascata
        if (filtroAno && !leiraAssociada.lote.endsWith(`/${filtroAno}`)) return false;
        if (filtroLote && leiraAssociada.lote !== filtroLote) return false;
        if (filtroLeira && leiraAssociada.numeroLeira.toString() !== filtroLeira) return false;
        
        return true;
    });
        const abrirFiltro = (tipo: 'ano' | 'lote' | 'leira') => {
        setTipoFiltro(tipo);
        setShowModalFiltro(true);
    };

    const selecionarFiltro = (valor: string) => {
        if (tipoFiltro === 'ano') {
            setFiltroAno(valor);
            setFiltroLote(''); // Limpa os filhos ao mudar o pai
            setFiltroLeira('');
        } else if (tipoFiltro === 'lote') {
            setFiltroLote(valor);
            setFiltroLeira(''); // Limpa o filho ao mudar o pai
        } else {
            setFiltroLeira(valor);
        }
        setShowModalFiltro(false);
    };

    const limparFiltros = () => {
        setFiltroAno('');
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
                precipitacao: parseFloat(formData.precipitacao.replace(',', '.')),
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
        if (tipo === 'Encharcada') return PALETTE.info;
        return PALETTE.cinza;
    };

    const getPrecipitacaoColor = (valor: number) => {
        if (valor === 0) return PALETTE.terracota;
        if (valor <= 10) return PALETTE.warning;
        return PALETTE.info;
    };
    if (loading) return <ActivityIndicator style={{ flex: 1 }} color={PALETTE.verdePrimario} />;

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* ===== HEADER ===== */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Monitorar Clima</Text>
                    <View style={styles.backButton} />
                </View>

                {/* ===== BARRA DE FILTROS ===== */}
                                {/* ===== BARRA DE FILTROS ===== */}
                <View style={styles.filterContainer}>
                    <Text style={styles.filterLabel}>Filtrar Registros</Text>
                    <View style={styles.filterRow}>
                        {/* NOVO BOTÃO DE ANO */}
                        <TouchableOpacity
                            style={[styles.filterBtn, filtroAno ? styles.filterBtnActive : null]}
                            onPress={() => abrirFiltro('ano')}
                        >
                            <Text style={[styles.filterBtnText, filtroAno ? styles.filterBtnTextActive : null]}>
                                {filtroAno ? `Ano: ${filtroAno}` : 'Todos Anos'}
                            </Text>
                            <MaterialCommunityIcons name="chevron-down" size={18} color={filtroAno ? PALETTE.branco : PALETTE.cinza} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.filterBtn, filtroLote ? styles.filterBtnActive : null]}
                            onPress={() => abrirFiltro('lote')}
                        >
                            <Text style={[styles.filterBtnText, filtroLote ? styles.filterBtnTextActive : null]}>
                                {filtroLote ? `Lote: ${filtroLote}` : 'Todos Lotes'}
                            </Text>
                            <MaterialCommunityIcons name="chevron-down" size={18} color={filtroLote ? PALETTE.branco : PALETTE.cinza} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.filterBtn, filtroLeira ? styles.filterBtnActive : null]}
                            onPress={() => abrirFiltro('leira')}
                        >
                            <Text style={[styles.filterBtnText, filtroLeira ? styles.filterBtnTextActive : null]}>
                                {filtroLeira ? `Leira #${filtroLeira}` : 'Todas Leiras'}
                            </Text>
                            <MaterialCommunityIcons name="chevron-down" size={18} color={filtroLeira ? PALETTE.branco : PALETTE.cinza} />
                        </TouchableOpacity>
                    </View>

                    {/* ATUALIZADO: Agora verifica também o filtroAno */}
                    {(filtroAno || filtroLote || filtroLeira) && (
                        <TouchableOpacity onPress={limparFiltros} style={styles.clearFilterBtn}>
                            <MaterialCommunityIcons name="close-circle" size={14} color={PALETTE.erro} style={{ marginRight: 4 }} />
                            <Text style={styles.clearFilterText}>Limpar Filtros</Text>
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
                        color={PALETTE.info}
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
                                <MaterialCommunityIcons name="calendar" size={20} color={PALETTE.cinza} style={styles.inputIcon} />
                                <RNTextInput
                                    style={styles.input}
                                    value={formData.data}
                                    onChangeText={(text) => setFormData({ ...formData, data: formatarData(text) })}
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
                                <MaterialCommunityIcons
                                    name={aplicarParaTodas ? "check-circle" : "checkbox-blank-outline"}
                                    size={20}
                                    color={aplicarParaTodas ? PALETTE.verdePrimario : PALETTE.cinza}
                                    style={{ marginRight: 8 }}
                                />
                                <Text style={[styles.optionText, aplicarParaTodas && styles.optionTextActive]}>
                                    Todas as Leiras Ativas
                                </Text>
                            </TouchableOpacity>

                            {!aplicarParaTodas && (
                                <View style={[styles.inputBox, { marginTop: 12, paddingVertical: 0 }]}>
                                    <Picker
                                        selectedValue={formData.leiraId}
                                        onValueChange={(val) => setFormData({ ...formData, leiraId: val })}
                                        style={{ flex: 1, color: PALETTE.preto }}
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
                                <MaterialCommunityIcons name="weather-pouring" size={20} color={PALETTE.cinza} style={styles.inputIcon} />
                                <RNTextInput
                                    style={styles.input}
                                    placeholder="Ex: 15"
                                    value={formData.precipitacao}
                                    onChangeText={(text) => setFormData({ ...formData, precipitacao: text })}
                                    keyboardType="decimal-pad"
                                    placeholderTextColor={PALETTE.cinzaClaro}
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
                                            styles.optionBtnSmall,
                                            formData.umidade === tipo && {
                                                backgroundColor: getUmidadeColor(tipo) + '15',
                                                borderColor: getUmidadeColor(tipo)
                                            }
                                        ]}
                                        onPress={() => setFormData({ ...formData, umidade: formData.umidade === tipo ? '' : tipo })}
                                    >
                                        <Text style={[
                                            styles.optionTextSmall,
                                            formData.umidade === tipo && { color: getUmidadeColor(tipo), fontWeight: '700' }
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
                                <MaterialCommunityIcons name="text-box-edit-outline" size={20} color={PALETTE.cinza} style={styles.inputIcon} />
                                <RNTextInput
                                    style={styles.input}
                                    placeholder="Opcional..."
                                    value={formData.observacao}
                                    onChangeText={(text) => setFormData({ ...formData, observacao: text })}
                                    placeholderTextColor={PALETTE.cinzaClaro}
                                />
                            </View>
                        </View>

                        {/* BUTTONS */}
                        <View style={styles.buttonGroup}>
                            <TouchableOpacity
                                style={{ backgroundColor: PALETTE.verdeClaro, height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: PALETTE.cinzaClaro }}
                                onPress={() => setShowForm(false)}
                            >
                                <Text style={{ color: PALETTE.cinza, fontWeight: '700', fontSize: 15 }}>Cancelar</Text>
                            </TouchableOpacity>
                            <View style={styles.buttonSpacer} />
                            <Button title="Salvar Registro" onPress={handleSave} fullWidth variant="primary" />
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)} activeOpacity={0.8}>
                        <MaterialCommunityIcons name="plus" size={24} color={PALETTE.branco} />
                        <Text style={styles.addBtnText}>Adicionar Novo Monitoramento</Text>
                    </TouchableOpacity>
                )}

                {/* ===== LIST SECTION ===== */}
                <View style={styles.listSection}>
                    <Text style={styles.listTitle}>
                        {filtroLeira ? `Registros da Leira #${filtroLeira}` : 'Últimos 5 Registros'}
                    </Text>

                    {registrosFiltrados.length > 0 ? (
                        // 🔥 MUDANÇA AQUI: Adicionado .slice(0, 5) para limitar a 5 itens
                        registrosFiltrados.slice(0, 5).map((item) => {
                            const leira = leiras.find(l => l.id === item.leiraId);
                            const nomeLeira = leira ? `${leira.nome} (Lote ${leira.lote})` : 'Leira Excluída';
                            const corChuva = getPrecipitacaoColor(item.precipitacao);

                            return (
                                <View key={item.id} style={[styles.materialCard, { borderLeftColor: corChuva }]}>
                                    <View style={styles.materialCardHeader}>
                                        <View style={styles.materialCardLeft}>
                                            <View style={[styles.materialCardIconBox, { backgroundColor: `${corChuva}15` }]}>
                                                <MaterialCommunityIcons name={item.precipitacao > 0 ? "weather-pouring" : "weather-sunny"} size={24} color={corChuva} />
                                            </View>
                                            <View style={styles.materialCardInfo}>
                                                <Text style={styles.materialCardTitle}>{nomeLeira}</Text>
                                                <Text style={styles.materialCardDate}>{item.data}</Text>
                                            </View>
                                        </View>

                                        <View style={[styles.materialCardBadge, { backgroundColor: `${corChuva}15` }]}>
                                            <Text style={[styles.materialCardBadgeText, { color: corChuva }]}>
                                                {item.precipitacao} mm
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.materialCardDetails}>
                                        {item.umidade && (
                                            <View style={styles.detailItem}>
                                                <Text style={styles.detailLabel}>Umidade</Text>
                                                <Text style={[styles.detailValue, { color: getUmidadeColor(item.umidade) }]}>
                                                    {item.umidade}
                                                </Text>
                                            </View>
                                        )}
                                        {item.observacao && (
                                            <View style={[styles.detailItem, { flex: 2 }]}>
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
                            <MaterialCommunityIcons name="weather-partly-cloudy" size={48} color={PALETTE.cinzaClaro} style={{ marginBottom: 16 }} />
                            <Text style={styles.emptyText}>Nenhum registro encontrado</Text>
                            <Text style={styles.emptySubtext}>Tente ajustar os filtros ou adicione um novo</Text>
                        </View>
                    )}
                </View>
                
            </ScrollView>

            {/* 🔥 MODAL DE FILTRO */}
            <Modal visible={showModalFiltro} transparent animationType="slide" onRequestClose={() => setShowModalFiltro(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                Selecione {tipoFiltro === 'ano' ? 'o Ano' : tipoFiltro === 'lote' ? 'o Lote' : 'a Leira'}
                            </Text>
                            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowModalFiltro(false)}>
                                <MaterialCommunityIcons name="close" size={20} color={PALETTE.cinza} />
                            </TouchableOpacity>
                        </View>

                        <View style={{ maxHeight: '80%' }}>
                            <FlatList
                                // Define qual array usar baseado no tipoFiltro
                                data={tipoFiltro === 'ano' ? anosUnicos : tipoFiltro === 'lote' ? lotesUnicos : leirasUnicas}
                                keyExtractor={(item) => item}
                                contentContainerStyle={{ paddingBottom: 20 }}
                                renderItem={({ item }) => (
                                    <TouchableOpacity style={styles.modalItem} onPress={() => selecionarFiltro(item)}>
                                        <Text style={styles.modalItemText}>
                                            {tipoFiltro === 'ano' ? `Ano ${item}` : tipoFiltro === 'lote' ? `Lote ${item}` : `Leira #${item}`}
                                        </Text>
                                        <MaterialCommunityIcons name="chevron-right" size={20} color={PALETTE.cinza} />
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
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

// ===== ESTILOS PADRONIZADOS =====
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: PALETTE.verdeClaro },
    scrollContent: { flexGrow: 1, paddingBottom: 40 },

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
    headerTitle: { fontSize: 18, fontWeight: '800', color: PALETTE.preto },

    // FILTROS
    filterContainer: {
        backgroundColor: PALETTE.branco,
        padding: 20,
        marginHorizontal: 24,
        marginTop: 24,
        borderRadius: 16,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
            android: { elevation: 2 },
        }),
    },
    filterLabel: { fontSize: 12, fontWeight: '700', color: PALETTE.cinza, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    filterRow: { flexDirection: 'row', gap: 12 },
    filterBtn: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: PALETTE.verdeClaro,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: PALETTE.cinzaClaro
    },
    filterBtnActive: { backgroundColor: PALETTE.info, borderColor: PALETTE.info },
    filterBtnText: { fontSize: 13, fontWeight: '600', color: PALETTE.cinza },
    filterBtnTextActive: { color: PALETTE.branco, fontWeight: '700' },
    clearFilterBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 12, paddingVertical: 4 },
    clearFilterText: { fontSize: 12, fontWeight: '700', color: PALETTE.erro },

    // STATS
    statsContainer: { flexDirection: 'row', paddingHorizontal: 24, marginTop: 24, marginBottom: 24, gap: 12 },
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
    statBoxValue: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    statBoxNumber: { fontSize: 24, fontWeight: '900' },
    statBoxUnit: { fontSize: 12, color: PALETTE.cinza, fontWeight: '600' },

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
    formGroup: { marginBottom: 20 },
    label: { fontSize: 12, fontWeight: '700', color: PALETTE.cinza, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
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
    input: { flex: 1, fontSize: 15, color: PALETTE.preto, fontWeight: '600' },

    optionsRow: { flexDirection: 'row', gap: 10 },
    optionBtn: {
        flexDirection: 'row',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: PALETTE.verdeClaro,
        borderWidth: 1,
        borderColor: PALETTE.cinzaClaro,
        alignItems: 'center'
    },
    optionBtnActive: { backgroundColor: `${PALETTE.verdePrimario}10`, borderColor: PALETTE.verdePrimario, borderWidth: 1.5 },
    optionText: { fontSize: 14, fontWeight: '600', color: PALETTE.cinza },
    optionTextActive: { color: PALETTE.verdePrimario, fontWeight: '700' },

    optionBtnSmall: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        backgroundColor: PALETTE.verdeClaro,
        borderWidth: 1,
        borderColor: PALETTE.cinzaClaro,
        alignItems: 'center'
    },
    optionTextSmall: { fontSize: 13, fontWeight: '600', color: PALETTE.cinza },

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
    addBtnText: { fontSize: 16, fontWeight: '700', color: PALETTE.branco },

    // LISTAGEM
    listSection: { paddingHorizontal: 24 },
    listTitle: { fontSize: 18, fontWeight: '800', color: PALETTE.preto, marginBottom: 16, letterSpacing: -0.5 },

    materialCard: {
        backgroundColor: PALETTE.branco,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderLeftWidth: 4,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8 },
            android: { elevation: 3 },
        }),
    },
    materialCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    materialCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    materialCardIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    materialCardInfo: { flex: 1 },
    materialCardTitle: { fontSize: 15, fontWeight: '800', color: PALETTE.preto, marginBottom: 4 },
    materialCardDate: { fontSize: 12, color: PALETTE.cinza, fontWeight: '500' },
    materialCardBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    materialCardBadgeText: { fontSize: 12, fontWeight: '800' },

    materialCardDetails: { flexDirection: 'row', gap: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: PALETTE.cinzaClaro },
    detailItem: { flex: 1 },
    detailLabel: { fontSize: 10, color: PALETTE.cinza, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    detailValue: { fontSize: 14, fontWeight: '800', color: PALETTE.preto },

    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyText: { fontSize: 15, fontWeight: '700', color: PALETTE.preto, marginBottom: 6 },
    emptySubtext: { fontSize: 13, color: PALETTE.cinza, fontWeight: '500' },

    // MODAL
    modalOverlay: { flex: 1, backgroundColor: 'rgba(26, 43, 34, 0.6)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: PALETTE.branco, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '70%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: PALETTE.preto },
    modalCloseBtn: { width: 32, height: 32, backgroundColor: PALETTE.verdeClaro, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    modalItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: PALETTE.cinzaClaro, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalItemText: { fontSize: 16, color: PALETTE.preto, fontWeight: '600' },
});