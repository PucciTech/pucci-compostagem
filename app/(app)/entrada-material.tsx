import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    TextInput as RNTextInput,
    Modal,
    Switch,
    ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '@/components/Button';
import { syncService } from '@/services/sync';
import { useFocusEffect } from '@react-navigation/native';
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
    azulPiscinao: '#2196F3',
    azulClaro: '#E3F2FD'
};

interface MaterialEntry {
    id: string;
    data: string;
    tipoMaterial: string;
    numeroMTR: string;
    peso: string;
    origem: string;
    destino?: 'patio' | 'piscinao';
    sincronizado?: boolean;
    deletado?: boolean;
}

export default function EntradaMaterialScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showModalNovaOrigem, setShowModalNovaOrigem] = useState(false);
    const [novaOrigemText, setNovaOrigemText] = useState('');
    const [entries, setEntries] = useState<MaterialEntry[]>([]);
    const [origens, setOrigens] = useState(['Sabesp', 'Ambient']);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        data: new Date().toLocaleDateString('pt-BR'),
        tipoMaterial: 'Biossólido',
        numeroMTR: '',
        peso: '',
        origem: 'Sabesp',
        destino: 'patio'
    });

    useFocusEffect(
        React.useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        try {
            setLoading(true);
            const registrosExistentes = await AsyncStorage.getItem('materiaisRegistrados');
            if (registrosExistentes) {
                setEntries(JSON.parse(registrosExistentes));
            }
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

    const validarData = (data: string): boolean => {
        if (data.length !== 10) return false;
        const [dia, mês, ano] = data.split('/').map(Number);
        if (dia < 1 || dia > 31) return false;
        if (mês < 1 || mês > 12) return false;
        if (ano < 2025 || ano > 2100) return false;
        return true;
    };

    const handleAddNovaOrigem = () => {
        if (!novaOrigemText.trim()) {
            Alert.alert('Erro', 'Digite o nome da origem');
            return;
        }
        if (origens.includes(novaOrigemText)) {
            Alert.alert('Aviso', 'Esta origem já existe');
            setNovaOrigemText('');
            return;
        }
        setOrigens([...origens, novaOrigemText]);
        setFormData({ ...formData, origem: novaOrigemText });
        setNovaOrigemText('');
        setShowModalNovaOrigem(false);
    };

    const handleTipoChange = (tipo: string) => {
        setFormData({
            ...formData,
            tipoMaterial: tipo,
            numeroMTR: '',
            origem: 'Sabesp',
            destino: 'patio'
        });
    };

    const handleSaveMaterial = async () => {
        if (!formData.data.trim()) { Alert.alert('Erro', 'Digite a data'); return; }
        if (!validarData(formData.data)) { Alert.alert('Erro', 'Data inválida'); return; }
        if (formData.tipoMaterial === 'Biossólido' && !formData.numeroMTR.trim()) { Alert.alert('Erro', 'Digite o MTR'); return; }
        if (!formData.peso.trim() || parseFloat(formData.peso) <= 0) { Alert.alert('Erro', 'Peso inválido'); return; }

        const newEntry: MaterialEntry = {
            id: editingId || Date.now().toString(),
            data: formData.data,
            tipoMaterial: formData.tipoMaterial,
            numeroMTR: formData.numeroMTR,
            peso: formData.peso,
            origem: formData.origem,
            destino: formData.tipoMaterial === 'Biossólido' ? (formData.destino as 'patio' | 'piscinao') : 'patio',
            sincronizado: false
        };

        try {
            let novaLista = [...entries];

            if (editingId) {
                novaLista = novaLista.map(item => item.id === editingId ? newEntry : item);
            } else {
                novaLista = [newEntry, ...novaLista];
            }

            await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(novaLista));
            await syncService.adicionarFila('material', newEntry);

            setEntries(novaLista);
            resetForm();
            
            const msgDestino = newEntry.destino === 'piscinao' ? 'no PISCINÃO 💧' : 'no PÁTIO 🌱';
            Alert.alert('Sucesso! ✅', editingId ? 'Registro atualizado!' : `Material registrado ${msgDestino}!`);

        } catch (error) {
            Alert.alert('Erro', 'Não foi possível salvar o material');
        }
    };

    const handleEdit = (item: MaterialEntry) => {
        setFormData({
            data: item.data,
            tipoMaterial: item.tipoMaterial,
            numeroMTR: item.numeroMTR,
            peso: item.peso,
            origem: item.origem,
            destino: item.destino || 'patio'
        });
        setEditingId(item.id);
        setShowForm(true);
    };

    const handleDelete = (id: string) => {
        Alert.alert(
            'Excluir Registro',
            'Tem certeza que deseja apagar este material?',
            [
                { text: 'Cancelar', style: 'cancel' },
                { 
                    text: 'Apagar', 
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const itemParaDeletar = entries.find(i => i.id === id);
                            if (itemParaDeletar) {
                                const itemMorto = { ...itemParaDeletar, deletado: true, sincronizado: false };
                                await syncService.adicionarFila('material', itemMorto);
                            }
                            const novaLista = entries.filter(item => item.id !== id);
                            setEntries(novaLista);
                            await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(novaLista));
                            if (editingId === id) resetForm();
                        } catch (error) {
                            Alert.alert("Erro", "Falha ao excluir item");
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
            destino: 'patio'
        });
        setEditingId(null);
        setShowForm(false);
    };

    const getTotalBiossólido = () => entries.filter(i => i.tipoMaterial === 'Biossólido').reduce((acc, i) => acc + (parseFloat(i.peso) || 0), 0);
    const getTotalBagaço = () => entries.filter(i => i.tipoMaterial === 'Bagaço de Cana').reduce((acc, i) => acc + (parseFloat(i.peso) || 0), 0);
    const getTotalPiscinao = () => entries.filter(i => i.destino === 'piscinao').reduce((acc, i) => acc + (parseFloat(i.peso) || 0), 0);

    if (loading) return <ActivityIndicator style={{flex:1}} color={PALETTE.verdePrimario} />;

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color={PALETTE.verdePrimario} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Entrada de Material</Text>
                    <View style={styles.backButton} />
                </View>

                <View style={styles.infoBox}>
                    <Text style={styles.infoIcon}>🚚</Text>
                    <View style={styles.infoContent}>
                        <Text style={styles.infoTitle}>Registre cada entrada</Text>
                        <Text style={styles.infoText}>Biossólido ou Bagaço de Cana</Text>
                    </View>
                </View>

                <View style={styles.statsContainer}>
                    <View style={{flexDirection: 'row', gap: 10}}>
                        <StatBox label="Biossólido (Total)" value={getTotalBiossólido().toFixed(1)} unit="ton" color={PALETTE.terracota} />
                        <StatBox label="Bagaço" value={getTotalBagaço().toFixed(1)} unit="ton" color={PALETTE.sucesso} />
                    </View>
                    <View style={{marginTop: 10}}>
                        <StatBox label="Estoque Piscinão" value={getTotalPiscinao().toFixed(1)} unit="ton" color={PALETTE.azulPiscinao} />
                    </View>
                </View>

                {showForm ? (
                    <View style={styles.formCard}>
                        <Text style={styles.formTitle}>
                            {editingId ? '✏️ Editar Material' : 'Registrar Novo Material'}
                        </Text>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Data</Text>
                            <View style={styles.inputBox}>
                                <Text style={styles.inputIcon}>📅</Text>
                                <RNTextInput
                                    style={styles.input}
                                    value={formData.data}
                                    onChangeText={t => setFormData({ ...formData, data: formatarData(t) })}
                                    maxLength={10}
                                    keyboardType="numeric"
                                />
                            </View>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Tipo de Material</Text>
                            <View style={styles.optionsRow}>
                                {['Biossólido', 'Bagaço de Cana'].map((tipo) => (
                                    <TouchableOpacity
                                        key={tipo}
                                        style={[styles.optionBtn, formData.tipoMaterial === tipo && styles.optionBtnActive]}
                                        onPress={() => handleTipoChange(tipo)}
                                    >
                                        <Text style={[styles.optionText, formData.tipoMaterial === tipo && styles.optionTextActive]}>
                                            {tipo === 'Biossólido' ? '💧' : '🌾'} {tipo}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {formData.tipoMaterial === 'Biossólido' && (
                            <View style={styles.piscinaoBox}>
                                <View style={{flex: 1}}>
                                    <Text style={styles.piscinaoTitle}>Destino: Piscinão?</Text>
                                    <Text style={styles.piscinaoDesc}>
                                        {formData.destino === 'piscinao' 
                                            ? 'Material será armazenado no tanque.' 
                                            : 'Material irá para o pátio (Leira).'}
                                    </Text>
                                </View>
                                <Switch
                                    trackColor={{ false: PALETTE.cinzaClaro, true: PALETTE.azulPiscinao }}
                                    thumbColor={PALETTE.branco}
                                    onValueChange={(val) => setFormData({...formData, destino: val ? 'piscinao' : 'patio'})}
                                    value={formData.destino === 'piscinao'}
                                />
                            </View>
                        )}

                        {formData.tipoMaterial === 'Biossólido' && (
                            <View style={styles.formGroup}>
                                <Text style={styles.label}>Número do MTR</Text>
                                <View style={styles.inputBox}>
                                    <Text style={styles.inputIcon}>🔢</Text>
                                    <RNTextInput
                                        style={styles.input}
                                        value={formData.numeroMTR}
                                        onChangeText={t => setFormData({ ...formData, numeroMTR: t })}
                                    />
                                </View>
                            </View>
                        )}

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Peso (Ton)</Text>
                            <View style={styles.inputBox}>
                                <Text style={styles.inputIcon}>⚖️</Text>
                                <RNTextInput
                                    style={styles.input}
                                    value={formData.peso}
                                    onChangeText={t => setFormData({ ...formData, peso: t })}
                                    keyboardType="decimal-pad"
                                />
                            </View>
                        </View>

                        {formData.tipoMaterial === 'Biossólido' && (
                            <View style={styles.formGroup}>
                                <View style={styles.labelHeader}>
                                    <Text style={styles.label}>Origem</Text>
                                    <TouchableOpacity onPress={() => setShowModalNovaOrigem(true)} style={styles.addOrigemBtn}>
                                        <Text style={styles.addOrigemIcon}>+</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.optionsColumn}>
                                    {origens.map((origem) => (
                                        <TouchableOpacity
                                            key={origem}
                                            style={[styles.optionBtn, formData.origem === origem && styles.optionBtnActive]}
                                            onPress={() => setFormData({ ...formData, origem })}
                                        >
                                            <Text style={[styles.optionText, formData.origem === origem && styles.optionTextActive]}>
                                                {origem}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        <View style={styles.buttonGroup}>
                            <Button title="Cancelar" onPress={resetForm} fullWidth />
                            <View style={styles.buttonSpacer} />
                            <Button 
                                title={editingId ? "Atualizar" : "Salvar"} 
                                onPress={handleSaveMaterial} 
                                fullWidth 
                                variant="primary" 
                            />
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
                        <Text style={styles.addBtnIcon}>+</Text>
                        <Text style={styles.addBtnText}>Adicionar Novo Material</Text>
                    </TouchableOpacity>
                )}

                <View style={styles.listSection}>
                    <Text style={styles.listTitle}>Últimas Entradas</Text>
                    {entries.length > 0 ? (
                        entries.map((item) => (
                            <MaterialCard 
                                key={item.id} 
                                item={item} 
                                onEdit={() => handleEdit(item)}
                                onDelete={() => handleDelete(item.id)}
                            />
                        ))
                    ) : (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>📭</Text>
                            <Text style={styles.emptyText}>Nenhum material registrado</Text>
                        </View>
                    )}
                </View>
            </ScrollView>

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
        </SafeAreaView>
    );
}

function StatBox({ label, value, unit, color }: any) {
    return (
        <View style={[styles.statBox, { borderTopColor: color, flex: 1 }]}>
            <Text style={styles.statBoxLabel}>{label}</Text>
            <View style={styles.statBoxValue}>
                <Text style={[styles.statBoxNumber, { color }]}>{value}</Text>
                <Text style={styles.statBoxUnit}>{unit}</Text>
            </View>
        </View>
    );
}

// ✅ COMPONENTE ATUALIZADO COM ÍCONES IDÊNTICOS AO DE LEIRAS
function MaterialCard({ item, onEdit, onDelete }: { item: MaterialEntry, onEdit: () => void, onDelete: () => void }) {
    const isPiscinao = item.destino === 'piscinao';
    
    return (
        <View style={[
            styles.materialCard, 
            isPiscinao && styles.materialCardPiscinao
        ]}>
            <View style={styles.materialCardHeader}>
                <View style={styles.materialCardLeft}>
                    <Text style={styles.materialCardIcon}>
                        {item.tipoMaterial === 'Biossólido' ? '💧' : '🌾'}
                    </Text>
                    <View style={styles.materialCardInfo}>
                        <Text style={styles.materialCardTitle}>{item.tipoMaterial}</Text>
                        <Text style={styles.materialCardDate}>{item.data}</Text>
                    </View>
                </View>

                {/* ✅ BOTÕES DE AÇÃO PADRONIZADOS */}
                <View style={styles.actionButtons}>
                    <TouchableOpacity style={styles.iconButton} onPress={onEdit}>
                        <Text style={{fontSize: 18}}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.iconButton, {backgroundColor: '#FFEBEE'}]} onPress={onDelete}>
                        <Text style={{fontSize: 18}}>🗑️</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {isPiscinao && (
                <View style={styles.piscinaoBadge}>
                    <Text style={styles.piscinaoBadgeText}>💧 Armazenado no Piscinão</Text>
                </View>
            )}

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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: PALETTE.verdeClaro },
    scrollContent: { flexGrow: 1, paddingBottom: 30 },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, backgroundColor: PALETTE.branco },
    backButton: { width: 40, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    infoBox: { flexDirection: 'row', margin: 20, padding: 15, backgroundColor: PALETTE.branco, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: PALETTE.terracota, alignItems: 'center' },
    infoIcon: { fontSize: 24, marginRight: 10 },
    infoContent: { flex: 1 },
    infoTitle: { fontWeight: 'bold' },
    infoText: { color: PALETTE.cinza, fontSize: 12 },
    statsContainer: { paddingHorizontal: 20, marginBottom: 20 },
    statBox: { backgroundColor: PALETTE.branco, borderRadius: 12, padding: 14, borderTopWidth: 3 },
    statBoxLabel: { fontSize: 11, color: PALETTE.cinza, fontWeight: 'bold', textTransform: 'uppercase' },
    statBoxValue: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    statBoxNumber: { fontSize: 22, fontWeight: '800' },
    statBoxUnit: { fontSize: 11, color: PALETTE.cinza },
    
    formCard: { margin: 20, padding: 20, backgroundColor: PALETTE.branco, borderRadius: 16 },
    formTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
    formGroup: { marginBottom: 18 },
    label: { fontSize: 12, fontWeight: 'bold', color: PALETTE.verdePrimario, marginBottom: 8, textTransform: 'uppercase' },
    labelHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.cinzaClaro2, borderRadius: 10, padding: 12, borderWidth: 1.5, borderColor: PALETTE.verdePrimario },
    inputIcon: { fontSize: 18, marginRight: 10 },
    input: { flex: 1, fontWeight: '600' },
    optionsRow: { flexDirection: 'row', gap: 10 },
    optionsColumn: { gap: 10 },
    optionBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: PALETTE.cinzaClaro2, alignItems: 'center' },
    optionBtnActive: { backgroundColor: PALETTE.verdeClaro2, borderColor: PALETTE.verdePrimario, borderWidth: 1 },
    optionText: { fontSize: 12, fontWeight: '600', color: PALETTE.cinza },
    optionTextActive: { color: PALETTE.verdePrimario },
    addOrigemBtn: { backgroundColor: PALETTE.terracota, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    addOrigemIcon: { color: PALETTE.branco, fontWeight: 'bold' },
    buttonGroup: { marginTop: 20 },
    buttonSpacer: { height: 10 },
    addBtn: { flexDirection: 'row', margin: 20, backgroundColor: PALETTE.verdePrimario, padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
    addBtnIcon: { color: PALETTE.branco, fontSize: 24, fontWeight: 'bold' },
    addBtnText: { color: PALETTE.branco, fontWeight: 'bold' },

    piscinaoBox: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: PALETTE.azulClaro, 
        padding: 12, 
        borderRadius: 8, 
        marginBottom: 15,
        borderWidth: 1,
        borderColor: PALETTE.azulPiscinao
    },
    piscinaoTitle: { fontWeight: 'bold', color: PALETTE.azulPiscinao, fontSize: 14 },
    piscinaoDesc: { fontSize: 11, color: PALETTE.cinza },
    piscinaoBadge: { 
        marginTop: 8, 
        backgroundColor: PALETTE.azulClaro, 
        paddingVertical: 4, 
        paddingHorizontal: 8, 
        borderRadius: 4, 
        alignSelf: 'flex-start',
        marginBottom: 8
    },
    piscinaoBadgeText: { color: PALETTE.azulPiscinao, fontSize: 11, fontWeight: 'bold' },

    listSection: { paddingHorizontal: 20 },
    listTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
    materialCard: { backgroundColor: PALETTE.branco, borderRadius: 12, padding: 14, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: PALETTE.verdePrimario },
    materialCardPiscinao: { borderLeftColor: PALETTE.azulPiscinao, backgroundColor: '#F8FDFF' },
    materialCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    materialCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    materialCardIcon: { fontSize: 24, marginRight: 10 },
    materialCardInfo: { flex: 1 },
    materialCardTitle: { fontWeight: 'bold' },
    materialCardDate: { fontSize: 11, color: PALETTE.cinza },
    
    // ✅ ESTILOS ATUALIZADOS PARA OS BOTÕES (IGUAIS AO DE LEIRAS)
    actionButtons: { flexDirection: 'row', gap: 10 },
    iconButton: { 
        padding: 8, 
        borderRadius: 8, 
        backgroundColor: PALETTE.cinzaClaro2, 
        alignItems: 'center', 
        justifyContent: 'center', 
        minWidth: 40, 
        minHeight: 40 
    },

    materialCardDetails: { flexDirection: 'row', gap: 15, marginTop: 5 },
    detailItem: { flex: 1 },
    detailLabel: { fontSize: 10, color: PALETTE.cinza, fontWeight: 'bold', textTransform: 'uppercase' },
    detailValue: { fontWeight: 'bold' },
    originBadge: { backgroundColor: PALETTE.verdeClaro2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 2 },
    originBadgeText: { fontSize: 10, color: PALETTE.verdePrimario, fontWeight: 'bold' },

    emptyState: { alignItems: 'center', padding: 40 },
    emptyIcon: { fontSize: 40, marginBottom: 10 },
    emptyText: { fontWeight: 'bold' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: PALETTE.branco, borderRadius: 16, padding: 20 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
    modalInputBox: { backgroundColor: PALETTE.cinzaClaro2, borderRadius: 10, padding: 12, marginBottom: 20 },
    modalInput: { fontSize: 16 },
    modalButtons: { flexDirection: 'row', gap: 10 },
    modalBtnCancelar: { flex: 1, padding: 12, backgroundColor: PALETTE.cinzaClaro2, borderRadius: 10, alignItems: 'center' },
    modalBtnCancelarText: { fontWeight: 'bold', color: PALETTE.cinza },
    modalBtnConfirmar: { flex: 1, padding: 12, backgroundColor: PALETTE.verdePrimario, borderRadius: 10, alignItems: 'center' },
    modalBtnConfirmarText: { fontWeight: 'bold', color: PALETTE.branco },
});