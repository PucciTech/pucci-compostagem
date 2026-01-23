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
    destino: string;
    sincronizado?: boolean;
    deletado?: boolean;
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
    
    const [destinos, setDestinos] = useState([
        'Pátio', 
        'Piscinão 1', 
        'Piscinão 2', 
        'Piscinão 3', 
        'Estoque Bagaço'
    ]);
    
    const [editingId, setEditingId] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        data: new Date().toLocaleDateString('pt-BR'),
        tipoMaterial: 'Biossólido',
        numeroMTR: '',
        peso: '',
        origem: 'Sabesp',
        destino: 'Pátio'
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
            
            const destinosSalvos = await AsyncStorage.getItem('listaDestinos');
            if (destinosSalvos) setDestinos(JSON.parse(destinosSalvos));

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
        let destinoSugerido = 'Pátio';
        if (tipo === 'Bagaço de Cana') {
            destinoSugerido = 'Estoque Bagaço';
        } else {
            destinoSugerido = 'Pátio';
        }

        setFormData({
            ...formData,
            tipoMaterial: tipo,
            numeroMTR: '',
            origem: 'Sabesp',
            destino: destinoSugerido
        });
    };

    const getDestinosFiltrados = () => {
        return destinos.filter(dest => {
            const nome = dest.toLowerCase();
            if (formData.tipoMaterial === 'Biossólido') {
                return !nome.includes('bagaço');
            } else {
                return nome.includes('bagaço');
            }
        });
    };

    // ✅ VERIFICA SE É PISCINÃO (Para saber se MTR é opcional)
    const isDestinoPiscinao = (destino: string) => {
        return destino.toLowerCase().includes('piscin') || destino.toLowerCase().includes('tanque');
    };

    const handleSaveMaterial = async () => {
        if (!formData.data.trim()) { Alert.alert('Erro', 'Digite a data'); return; }
        if (!validarData(formData.data)) { Alert.alert('Erro', 'Data inválida'); return; }
        
        // ✅ LÓGICA DE VALIDAÇÃO DO MTR ATUALIZADA
        const ehPiscinao = isDestinoPiscinao(formData.destino);
        
        if (formData.tipoMaterial === 'Biossólido') {
            // Se NÃO for piscinão (ou seja, é Pátio), o MTR é obrigatório
            if (!ehPiscinao && !formData.numeroMTR.trim()) { 
                Alert.alert('Erro', 'Para o Pátio, o número do MTR é obrigatório.'); 
                return; 
            }
        }
        
        const pesoNumerico = parseFloat(formData.peso.replace(',', '.').trim());
        if (!formData.peso.trim() || isNaN(pesoNumerico) || pesoNumerico <= 0) { 
            Alert.alert('Erro', 'Peso inválido'); return; 
        }

        const newEntry: MaterialEntry = {
            id: editingId || Date.now().toString(),
            data: formData.data,
            tipoMaterial: formData.tipoMaterial,
            numeroMTR: formData.numeroMTR || 'S/N', // Salva S/N se estiver vazio
            peso: formData.peso,
            origem: formData.origem,
            destino: formData.destino,
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
            destino: 'Pátio'
        });
        setEditingId(null);
        setShowForm(false);
    };

    const getDestinoColor = (destino: string) => {
        const d = destino.toLowerCase();
        if (d.includes('piscin') || d.includes('tanque')) return PALETTE.azulPiscinao;
        if (d.includes('bagaço') || d.includes('estoque')) return '#FFA000';
        return PALETTE.sucesso;
    };

    if (loading) return <ActivityIndicator style={{flex:1}} color={PALETTE.verdePrimario} />;

    // Helper para saber se mostra "Opcional" na label
    const mtrIsOptional = isDestinoPiscinao(formData.destino);

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
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

                {showForm ? (
                    <View style={styles.formCard}>
                        <Text style={styles.formTitle}>
                            {editingId ? '✏️ Editar Material' : 'Registrar Entrada'}
                        </Text>

                        {/* DATA */}
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
                                        <Text style={[styles.optionText, formData.tipoMaterial === tipo && styles.optionTextActive]}>
                                            {tipo === 'Biossólido' ? '💩' : '🌾'} {tipo}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* DESTINO (FILTRADO) */}
                        <View style={styles.formGroup}>
                            <View style={styles.labelHeader}>
                                <Text style={styles.label}>Destino do Material</Text>
                                <TouchableOpacity onPress={() => setShowModalNovoDestino(true)} style={styles.addBtnSmall}>
                                    <Text style={styles.addBtnSmallIcon}>+</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.optionsColumn}>
                                {getDestinosFiltrados().map((dest) => (
                                    <TouchableOpacity
                                        key={dest}
                                        style={[styles.optionBtn, formData.destino === dest && styles.optionBtnActive]}
                                        onPress={() => setFormData({ ...formData, destino: dest })}
                                    >
                                        <Text style={[styles.optionText, formData.destino === dest && styles.optionTextActive]}>
                                            {dest.includes('Piscin') ? '💧' : dest.includes('Bagaço') ? '🌾' : '🌱'} {dest}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* MTR (Só para Biossólido) */}
                        {formData.tipoMaterial === 'Biossólido' && (
                            <View style={styles.formGroup}>
                                <Text style={styles.label}>
                                    Número do MTR {mtrIsOptional ? <Text style={styles.optionalText}>(Opcional)</Text> : ''}
                                </Text>
                                <View style={styles.inputBox}>
                                    <Text style={styles.inputIcon}>🔢</Text>
                                    <RNTextInput
                                        style={styles.input}
                                        value={formData.numeroMTR}
                                        onChangeText={t => setFormData({ ...formData, numeroMTR: t })}
                                        placeholder={mtrIsOptional ? "S/N" : "Obrigatório para Pátio"}
                                    />
                                </View>
                            </View>
                        )}

                        {/* PESO */}
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

                        {/* ORIGEM (Só para Biossólido) */}
                        {formData.tipoMaterial === 'Biossólido' && (
                            <View style={styles.formGroup}>
                                <View style={styles.labelHeader}>
                                    <Text style={styles.label}>Origem</Text>
                                    <TouchableOpacity onPress={() => setShowModalNovaOrigem(true)} style={styles.addBtnSmall}>
                                        <Text style={styles.addBtnSmallIcon}>+</Text>
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
                        <Text style={styles.addBtnText}>Registrar Entrada</Text>
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
                                color={getDestinoColor(item.destino)}
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

function MaterialCard({ item, onEdit, onDelete, color }: any) {
    return (
        <View style={[styles.materialCard, { borderLeftColor: color }]}>
            <View style={styles.materialCardHeader}>
                <View style={styles.materialCardLeft}>
                    <Text style={styles.materialCardIcon}>
                        {item.tipoMaterial === 'Biossólido' ? '💩' : '🌾'}
                    </Text>
                    <View style={styles.materialCardInfo}>
                        <Text style={styles.materialCardTitle}>{item.tipoMaterial}</Text>
                        <Text style={styles.materialCardDate}>{item.data}</Text>
                    </View>
                </View>

                <View style={styles.actionButtons}>
                    <TouchableOpacity style={styles.iconButton} onPress={onEdit}>
                        <Text style={{fontSize: 18}}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.iconButton, {backgroundColor: '#FFEBEE'}]} onPress={onDelete}>
                        <Text style={{fontSize: 18}}>🗑️</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={[styles.destinoBadge, { backgroundColor: color + '20' }]}>
                <Text style={[styles.destinoBadgeText, { color: color }]}>📍 {item.destino}</Text>
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

    formCard: { margin: 20, padding: 20, backgroundColor: PALETTE.branco, borderRadius: 16 },
    formTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
    formGroup: { marginBottom: 18 },
    label: { fontSize: 12, fontWeight: 'bold', color: PALETTE.verdePrimario, marginBottom: 8, textTransform: 'uppercase' },
    optionalText: { color: PALETTE.cinza, fontSize: 10, textTransform: 'none', fontWeight: 'normal' },
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
    
    addBtnSmall: { backgroundColor: PALETTE.terracota, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    addBtnSmallIcon: { color: PALETTE.branco, fontWeight: 'bold' },
    
    buttonGroup: { marginTop: 20 },
    buttonSpacer: { height: 10 },
    addBtn: { flexDirection: 'row', margin: 20, backgroundColor: PALETTE.verdePrimario, padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
    addBtnIcon: { color: PALETTE.branco, fontSize: 24, fontWeight: 'bold' },
    addBtnText: { color: PALETTE.branco, fontWeight: 'bold' },

    listSection: { paddingHorizontal: 20 },
    listTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
    materialCard: { backgroundColor: PALETTE.branco, borderRadius: 12, padding: 14, marginBottom: 12, borderLeftWidth: 4 },
    materialCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    materialCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    materialCardIcon: { fontSize: 24, marginRight: 10 },
    materialCardInfo: { flex: 1 },
    materialCardTitle: { fontWeight: 'bold' },
    materialCardDate: { fontSize: 11, color: PALETTE.cinza },
    
    actionButtons: { flexDirection: 'row', gap: 10 },
    iconButton: { padding: 8, borderRadius: 8, backgroundColor: PALETTE.cinzaClaro2, alignItems: 'center', justifyContent: 'center', minWidth: 40, minHeight: 40 },

    destinoBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 10 },
    destinoBadgeText: { fontSize: 10, fontWeight: 'bold' },

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