import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput as RNTextInput, Alert, ActivityIndicator, StyleSheet, Modal } from 'react-native';
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

    // 🔥 NOVO: Estados para Edição da Mistura
    const [showModalEdit, setShowModalEdit] = useState(false);
    const [misturaEditando, setMisturaEditando] = useState<MaterialEntry | null>(null);
    const [novoPesoBagaco, setNovoPesoBagaco] = useState('');

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
                            // 🔥 CORREÇÃO: Pega apenas o MAIS RECENTE (maior ID = mais novo)
                            bagaco = peso;
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
    // 1. Validações Iniciais
    if (!pesoTransferencia) return Alert.alert('Atenção', 'Informe o peso.');
    
    const pesoTransfNum = parseFloat(pesoTransferencia.replace(',', '.'));
    if (isNaN(pesoTransfNum) || pesoTransfNum <= 0) {
        return Alert.alert('Atenção', 'Informe um peso válido para transferir.');
    }
    if (pesoTransfNum > estoquePatio) {
        return Alert.alert('Atenção', 'Você não tem esse saldo disponível no Pátio de Mistura.');
    }

    try {
        setLoading(true);
        const registros = await AsyncStorage.getItem('materiaisRegistrados');
        let todosMateriais: MaterialEntry[] = registros ? JSON.parse(registros) : [];
        const itensParaSincronizar: MaterialEntry[] = [];

        // 2. Filtra os lotes disponíveis no Pátio
        const lotesPatio = todosMateriais.filter(m => {
            const destinoItem = m.destino ? m.destino.trim() : '';
            return m.tipoMaterial === 'Mistura Preparada' && 
                   destinoItem === 'Pátio de Mistura' && 
                   !m.usado && 
                   !m.deletado;
        });

        // Ordena por ID (FIFO - os mais antigos primeiro)
        lotesPatio.sort((a, b) => Number(a.id) - Number(b.id));

        let pesoRestanteParaTransferir = pesoTransfNum;
        const mtrsContribuintes: string[] = [];

        // 3. Loop FIFO: Desconta o volume dos lotes sem apagá-los (a menos que zerem)
        for (const lote of lotesPatio) {
            if (pesoRestanteParaTransferir <= 0) break;

            const pesoLoteAtual = parseFloat(lote.peso.replace(',', '.'));
            
            // Pula lotes que por algum motivo tenham peso 0
            if (pesoLoteAtual <= 0) continue;

            const pesoADeduzir = Math.min(pesoRestanteParaTransferir, pesoLoteAtual);
            const novoPesoLote = pesoLoteAtual - pesoADeduzir;

            // Atualiza o lote original
            lote.peso = novoPesoLote.toFixed(2).replace('.', ',');
            
            // 🔥 A MÁGICA ACONTECE AQUI: Só marca como usado se o lote zerar!
            if (novoPesoLote === 0) {
                lote.usado = true; 
            }
            
            lote.sincronizado = false; // Precisa sincronizar a alteração de peso
            itensParaSincronizar.push(lote);

            // Guarda a rastreabilidade
            if (lote.mtrsOriginais) {
                mtrsContribuintes.push(...lote.mtrsOriginais);
            } else if (lote.numeroMTR) {
                mtrsContribuintes.push(lote.numeroMTR);
            }

            pesoRestanteParaTransferir -= pesoADeduzir;
        }

        // 4. Cria o NOVO lote no destino (Depósito) com o volume exato transferido
        const timestamp = Date.now();
        const mtrsUnicos = [...new Set(mtrsContribuintes)];

        const loteDeposito: MaterialEntry = {
            id: timestamp.toString(),
            data: new Date().toLocaleDateString('pt-BR'),
            tipoMaterial: 'Mistura Preparada',
            numeroMTR: `TRANSF-${timestamp.toString().slice(-4)}`,
            peso: pesoTransfNum.toFixed(2).replace('.', ','), // Apenas o volume transferido
            origem: 'Pátio de Mistura',
            destino: destinoTransferencia,
            sincronizado: false,
            usado: false,
            deletado: false,
            mtrsOriginais: mtrsUnicos // Rastreabilidade de onde veio
        };

        todosMateriais.push(loteDeposito);
        itensParaSincronizar.push(loteDeposito);

        // 5. Salva no banco local e envia para a fila de sincronização
        await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(todosMateriais));
        
        for (const item of itensParaSincronizar) {
            await syncService.adicionarFila('material', item);
        }

        // 6. Limpa a tela e recarrega
        setPesoTransferencia('');
        await loadData();
        
        Alert.alert('Transferência Concluída! 🔄', `${pesoTransfNum}t enviadas para o ${destinoTransferencia}.`);

    } catch (error) {
        console.error("Erro na transferência:", error);
        Alert.alert('Erro', 'Falha ao realizar a transferência.');
    } finally {
        setLoading(false);
    }
};
    // 🔥 NOVA FUNÇÃO: EDITAR MISTURA (BAGAÇO)
    const handleEditarMistura = async () => {
        if (!misturaEditando) return;

        const novoPesoBag = parseFloat(novoPesoBagaco.replace(',', '.'));
        if (isNaN(novoPesoBag) || novoPesoBag < 0) {
            return Alert.alert('Erro', 'Informe um peso válido para o bagaço.');
        }

        const pesoBagacoAntigo = misturaEditando.pesoBagacoUtilizado || 0;
        const diferencaBagaco = novoPesoBag - pesoBagacoAntigo;

        // Se aumentou o bagaço, verifica se tem estoque
        if (diferencaBagaco > 0 && diferencaBagaco > estoqueBagaco) {
            return Alert.alert('Estoque Insuficiente', `Você precisa de mais ${diferencaBagaco.toFixed(2)}t de bagaço, mas só tem ${estoqueBagaco.toFixed(2)}t no estoque.`);
        }

        try {
            setLoading(true);
            const registros = await AsyncStorage.getItem('materiaisRegistrados');
            let todosMateriais: MaterialEntry[] = registros ? JSON.parse(registros) : [];
            const itensParaSincronizar: MaterialEntry[] = [];

            // 1. Atualiza a mistura original
            const pesoBioOriginal = parseFloat(misturaEditando.peso.replace(',', '.')) - pesoBagacoAntigo;
            const novoPesoTotal = pesoBioOriginal + novoPesoBag;

            const misturaAtualizada = {
                ...misturaEditando,
                peso: novoPesoTotal.toFixed(2),
                pesoBagacoUtilizado: novoPesoBag,
                sincronizado: false
            };

            todosMateriais = todosMateriais.map(m => m.id === misturaEditando.id ? misturaAtualizada : m);
            itensParaSincronizar.push(misturaAtualizada);

            // 2. Lida com a diferença de Bagaço (Devolve ou Retira)
            const timestamp = Date.now();

            if (diferencaBagaco !== 0) {
                const extratoSalvo = await AsyncStorage.getItem('extratoBagaco');
                const extrato = extratoSalvo ? JSON.parse(extratoSalvo) : [];

                if (diferencaBagaco < 0) {
                    // Devolve bagaço para o estoque (ENTRADA)
                    const qtdDevolvida = Math.abs(diferencaBagaco);
                    const devolucaoBagaco: MaterialEntry = {
                        id: timestamp.toString(),
                        data: new Date().toLocaleDateString('pt-BR'),
                        tipoMaterial: 'Bagaço de Cana',
                        numeroMTR: 'AJUSTE',
                        peso: qtdDevolvida.toFixed(2),
                        origem: 'Ajuste de Mistura',
                        destino: 'Estoque Bagaço',
                        sincronizado: false,
                        usado: false
                    };
                    todosMateriais.push(devolucaoBagaco);
                    itensParaSincronizar.push(devolucaoBagaco);

                    extrato.push({
                        id: timestamp.toString(),
                        data: new Date().toLocaleDateString('pt-BR'),
                        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                        tipo: 'ENTRADA',
                        quantidade: qtdDevolvida,
                        motivo: 'Ajuste de Mistura (Devolução)'
                    });
                } else {
                    // Retira mais bagaço do estoque (SAÍDA)
                    const consumoBagaco: MaterialEntry = {
                        id: timestamp.toString(),
                        data: new Date().toLocaleDateString('pt-BR'),
                        tipoMaterial: 'Bagaço de Cana',
                        numeroMTR: 'AJUSTE',
                        peso: diferencaBagaco.toFixed(2),
                        origem: 'Ajuste de Mistura',
                        destino: 'Consumo Ajuste',
                        sincronizado: false,
                        usado: true // Já nasce usado para descontar do montante
                    };
                    todosMateriais.push(consumoBagaco);
                    itensParaSincronizar.push(consumoBagaco);

                    extrato.push({
                        id: timestamp.toString(),
                        data: new Date().toLocaleDateString('pt-BR'),
                        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                        tipo: 'SAIDA',
                        quantidade: diferencaBagaco,
                        motivo: 'Ajuste de Mistura (Consumo Extra)'
                    });
                }
                await AsyncStorage.setItem('extratoBagaco', JSON.stringify(extrato));
            }

            await AsyncStorage.setItem('materiaisRegistrados', JSON.stringify(todosMateriais));

            for (const item of itensParaSincronizar) {
                await syncService.adicionarFila('material', item);
            }

            setShowModalEdit(false);
            setMisturaEditando(null);
            setNovoPesoBagaco('');
            await loadData();

            Alert.alert('Sucesso ✅', 'Mistura atualizada com sucesso!');
        } catch (error) {
            console.error("Erro na edição:", error);
            Alert.alert('Erro', 'Falha ao editar a mistura.');
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
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Mistura e Estoque</Text>
                    <View style={styles.backButton} />
                </View>

                {/* PAINEL DE ESTOQUE VIVO (MONTANTES) */}
                <View style={[styles.formCard, { backgroundColor: PALETTE.cinza, borderColor: PALETTE.verdePrimario, marginTop: 24 }]}>
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
                        <View style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.15)', padding: 12, borderRadius: 12 }}>
                            <Text style={{ color: PALETTE.branco, fontSize: 11, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                <MaterialCommunityIcons name="text-box-search-outline" size={12} /> MTRs NESTE MONTANTE:
                            </Text>
                            <Text style={{ color: PALETTE.branco, fontSize: 13, fontWeight: '600', lineHeight: 20 }}>
                                {mtrsNoPatio.join(', ')}
                            </Text>
                        </View>
                    )}
                </View>

                {/* ÁREA DE TRANSFERÊNCIA */}
                {estoquePatio > 0 && (
                    <View style={[styles.formCard, { borderColor: PALETTE.verdePrimario, borderWidth: 1 }]}>
                        <Text style={[styles.formTitle, { color: PALETTE.cinza }]}>Transferir do Pátio para Depósito</Text>

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
                                        <MaterialCommunityIcons name="warehouse" size={20} color={destinoTransferencia === dest ? PALETTE.cinza : PALETTE.cinza} style={{ marginBottom: 4 }} />
                                        <Text style={[styles.optionText, destinoTransferencia === dest && styles.optionTextActive]}>{dest}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[styles.btnSave, { backgroundColor: PALETTE.cinza, marginTop: 8 }]}
                            onPress={handleTransferir}
                        >
                            <Text style={styles.btnSaveText}>Confirmar Transferência</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View style={{ height: 1, backgroundColor: PALETTE.cinzaClaro, marginVertical: 24, marginHorizontal: 24 }} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: PALETTE.preto, marginBottom: 16, marginHorizontal: 24 }}>
                    ➕ Preparar Nova Mistura
                </Text>

                {/* PASSO 1: SELECIONAR BIOSSÓLIDOS */}
                <View style={styles.formCard}>
                    <Text style={styles.formTitle}>1. Selecione os Biossólidos</Text>
                    {materiaisPatio.length === 0 ? (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="truck-check-outline" size={40} color={PALETTE.cinzaClaro} />
                            <Text style={styles.emptyText}>Nenhum biossólido aguardando no Pátio de Mistura.</Text>
                        </View>
                    ) : (
                        materiaisPatio.map(item => {
                            const isSelected = selecionados.includes(item.id);
                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    style={[
                                        styles.biossolidoItem,
                                        isSelected && styles.biossolidoItemActive
                                    ]}
                                    onPress={() => toggleSelecao(item.id)}
                                    activeOpacity={0.7}
                                >
                                    <MaterialCommunityIcons name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"} size={24} color={isSelected ? PALETTE.verdePrimario : PALETTE.cinza} style={{ marginRight: 12 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontWeight: '800', color: PALETTE.preto, fontSize: 15 }}>{item.data} - {item.origem}</Text>
                                        <Text style={{ color: PALETTE.cinza, fontSize: 12, fontWeight: '600', marginTop: 2 }}>MTR: {item.numeroMTR}</Text>
                                    </View>
                                    <Text style={{ fontWeight: '900', color: isSelected ? PALETTE.verdePrimario : PALETTE.preto, fontSize: 16 }}>{item.peso} t</Text>
                                </TouchableOpacity>
                            );
                        })
                    )}
                </View>

                {/* PASSO 2: BAGAÇO */}
                <View style={styles.formCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={styles.formTitle}>2. Adicionar Bagaço</Text>
                        <View style={{ backgroundColor: PALETTE.terracotaClaro, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                            <Text style={{ color: PALETTE.terracota, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>Estoque: {estoqueBagaco.toFixed(2)}t</Text>
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
                            <Text style={{ color: PALETTE.erro, fontSize: 12, marginTop: 8, fontWeight: '600' }}>
                                ⚠️ Você não tem bagaço no estoque. Registre a entrada primeiro.
                            </Text>
                        )}
                        {resumoCalculo.pesoBagaco > estoqueBagaco && (
                            <Text style={{ color: PALETTE.erro, fontSize: 12, marginTop: 8, fontWeight: '600' }}>
                                ⚠️ O peso informado é maior que o estoque disponível.
                            </Text>
                        )}
                    </View>
                </View>

                {/* RESUMO E BOTÃO DE SALVAR */}
                <View style={[styles.formCard, { backgroundColor: PALETTE.verdeCard, borderColor: PALETTE.verdePrimario, borderWidth: 1.5 }]}>
                    <Text style={[styles.formTitle, { color: PALETTE.verdePrimario }]}>Resumo da Mistura</Text>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                        <Text style={{ color: PALETTE.preto, fontWeight: '600' }}>Biossólido ({resumoCalculo.qtdCaminhoes} caminhões):</Text>
                        <Text style={{ fontWeight: '800', color: PALETTE.preto }}>{resumoCalculo.pesoBiossolido.toFixed(2)} t</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text style={{ color: PALETTE.preto, fontWeight: '600' }}>Bagaço Consumido:</Text>
                        <Text style={{ fontWeight: '800', color: PALETTE.preto }}>{resumoCalculo.pesoBagaco.toFixed(2)} t</Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: 'rgba(46, 79, 54, 0.1)', marginVertical: 12 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontWeight: '800', fontSize: 15, color: PALETTE.preto, textTransform: 'uppercase' }}>Total no Pátio:</Text>
                        <Text style={{ fontWeight: '900', fontSize: 20, color: PALETTE.verdePrimario }}>+ {resumoCalculo.pesoTotal.toFixed(2)} t</Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.btnSave, { marginTop: 24 }, isSaveDisabled && { opacity: 0.5 }]}
                        onPress={handleSalvarMistura}
                        disabled={isSaveDisabled}
                    >
                        <Text style={styles.btnSaveText}>{textoBotaoSalvar}</Text>
                    </TouchableOpacity>
                </View>

                {/* 🔥 3. NOVO: HISTÓRICO DE MISTURAS */}
                <View style={{ height: 1, backgroundColor: PALETTE.cinzaClaro, marginVertical: 24, marginHorizontal: 24 }} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: PALETTE.preto, marginBottom: 16, marginHorizontal: 24 }}>
                    🕒 Histórico de Misturas (Pátio)
                </Text>

                {historicoMisturas.length === 0 ? (
                    <View style={[styles.emptyState, { marginHorizontal: 24, marginBottom: 24 }]}>
                        <MaterialCommunityIcons name="history" size={40} color={PALETTE.cinzaClaro} />
                        <Text style={[styles.emptyText, { marginTop: 12 }]}>Nenhuma mistura registrada recentemente.</Text>
                    </View>
                ) : (
                    historicoMisturas.map(mistura => {
                        const bioUtilizado = parseFloat(mistura.peso) - (mistura.pesoBagacoUtilizado || 0);
                        const bagUtilizado = mistura.pesoBagacoUtilizado || 0;

                        return (
                            <View key={mistura.id} style={styles.historicoCard}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontWeight: '900', color: PALETTE.preto, fontSize: 16 }}>
                                        {mistura.data} - {mistura.peso}t
                                    </Text>
                                    <Text style={{ color: PALETTE.cinza, fontSize: 13, marginTop: 4, fontWeight: '600' }}>
                                        Biossólido: {bioUtilizado.toFixed(2)}t | Bagaço: {bagUtilizado.toFixed(2)}t
                                    </Text>
                                    {mistura.usado && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: PALETTE.warningClaro, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' }}>
                                            <MaterialCommunityIcons name="alert" size={12} color={PALETTE.warning} style={{ marginRight: 4 }} />
                                            <Text style={{ color: PALETTE.warning, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>
                                                Já transferido
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {!mistura.usado && (
                                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                        <TouchableOpacity
                                            style={styles.iconButton}
                                            onPress={() => {
                                                setMisturaEditando(mistura);
                                                setNovoPesoBagaco(String(mistura.pesoBagacoUtilizado || 0));
                                                setShowModalEdit(true);
                                            }}
                                        >
                                            <MaterialCommunityIcons name="pencil" size={20} color={PALETTE.cinza} />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[styles.iconButton, { backgroundColor: PALETTE.erroClaro }]}
                                            onPress={() => handleExcluirMistura(mistura)}
                                        >
                                            <MaterialCommunityIcons name="delete-outline" size={20} color={PALETTE.erro} />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        );
                    })
                )}

            </ScrollView>

            {/* 🔥 MODAL DE EDIÇÃO DE BAGAÇO */}
            <Modal visible={showModalEdit} transparent animationType="fade" onRequestClose={() => setShowModalEdit(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>
                            Editar Bagaço da Mistura
                        </Text>

                        <Text style={{ color: PALETTE.cinza, marginBottom: 20, fontSize: 14, fontWeight: '500', textAlign: 'center' }}>
                            Mistura de {misturaEditando?.data}. Altere a quantidade de bagaço utilizada nesta mistura.
                        </Text>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Novo Peso do Bagaço (Ton)</Text>
                            <View style={styles.inputBox}>
                                <MaterialCommunityIcons name="scale-balance" size={20} color={PALETTE.cinza} style={styles.inputIcon} />
                                <RNTextInput
                                    style={styles.input}
                                    value={novoPesoBagaco}
                                    onChangeText={setNovoPesoBagaco}
                                    keyboardType="decimal-pad"
                                    autoFocus
                                />
                            </View>
                            <Text style={{ color: PALETTE.cinza, fontSize: 12, marginTop: 8, fontWeight: '600', textAlign: 'right' }}>
                                Estoque disponível: <Text style={{ color: PALETTE.cinza, fontWeight: '800' }}>{estoqueBagaco.toFixed(2)}t</Text>
                            </Text>
                        </View>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={styles.modalBtnCancelar}
                                onPress={() => {
                                    setShowModalEdit(false);
                                    setMisturaEditando(null);
                                }}
                            >
                                <Text style={styles.modalBtnCancelarText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.modalBtnConfirmar}
                                onPress={handleEditarMistura}
                            >
                                <Text style={styles.modalBtnConfirmarText}>Salvar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
}

// ===== NOVO DESIGN SYSTEM (PADRÃO PUCCI) =====
export const PALETTE = {
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

export const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: PALETTE.verdeClaro },
    scrollContent: { paddingBottom: 40 },

    // HEADER PADRÃO
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20, backgroundColor: PALETTE.branco, borderBottomWidth: 1, borderBottomColor: PALETTE.cinzaClaro },
    backButton: { width: 40, alignItems: 'flex-start' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: PALETTE.preto },

    // FORMULÁRIOS E CARDS
    formCard: { backgroundColor: PALETTE.branco, marginHorizontal: 24, borderRadius: 16, padding: 20, marginBottom: 20, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8 },
    formTitle: { fontSize: 16, fontWeight: '800', color: PALETTE.preto, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
    formGroup: { marginBottom: 16 },
    label: { fontSize: 12, fontWeight: '700', color: PALETTE.cinza, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },

    // INPUTS
    inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.verdeClaro, borderRadius: 12, paddingHorizontal: 16, height: 52, borderWidth: 1, borderColor: PALETTE.cinzaClaro },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, fontSize: 15, fontWeight: '600', color: PALETTE.preto },

    // BOTÕES DE OPÇÃO
    optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    optionBtn: { flex: 1, minWidth: '45%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderWidth: 1, borderColor: PALETTE.cinzaClaro, borderRadius: 12, backgroundColor: PALETTE.verdeClaro },
    optionBtnActive: { borderColor: PALETTE.verdePrimario, backgroundColor: PALETTE.cinzaClaro, borderWidth: 1.5 },
    optionText: { fontSize: 13, color: PALETTE.cinza, fontWeight: '700' },
    optionTextActive: { color: PALETTE.cinza, fontWeight: '800' },

    // BOTÃO SALVAR
    btnSave: { height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, backgroundColor: PALETTE.verdePrimario },
    btnSaveText: { color: PALETTE.branco, fontSize: 16, fontWeight: '800' },

    // EMPTY STATE
    emptyState: { alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: PALETTE.branco, borderRadius: 16, borderWidth: 1, borderColor: PALETTE.cinzaClaro },
    emptyText: { color: PALETTE.cinza, fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 12 },

    // ESTOQUE VIVO
    stockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    stockItem: { flex: 1, alignItems: 'center' },
    stockLabel: { color: PALETTE.cinzaClaro, fontSize: 11, marginBottom: 6, textAlign: 'center', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    stockValue: { color: PALETTE.branco, fontSize: 20, fontWeight: '900' },
    stockDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)' },

    // LISTA BIOSSÓLIDOS
    biossolidoItem: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: PALETTE.cinzaClaro, marginBottom: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.branco },
    biossolidoItemActive: { borderColor: PALETTE.verdePrimario, backgroundColor: PALETTE.verdeCard, borderWidth: 1.5 },

    // HISTÓRICO
    historicoCard: { backgroundColor: PALETTE.branco, marginHorizontal: 24, borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, borderWidth: 1, borderColor: PALETTE.cinzaClaro },
    iconButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: PALETTE.cinzaClaro, alignItems: 'center', justifyContent: 'center' },

    // MODAL
    modalOverlay: { flex: 1, backgroundColor: 'rgba(26, 43, 34, 0.6)', justifyContent: 'center', padding: 24 },
    modalContent: { backgroundColor: PALETTE.branco, borderRadius: 20, padding: 24 },
    modalTitle: { fontSize: 18, fontWeight: '900', color: PALETTE.preto, textAlign: 'center', marginBottom: 8 },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
    modalBtnCancelar: { flex: 1, paddingVertical: 14, backgroundColor: PALETTE.verdeClaro, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: PALETTE.cinzaClaro },
    modalBtnCancelarText: { fontWeight: '700', color: PALETTE.cinza, fontSize: 15 },
    modalBtnConfirmar: { flex: 1, paddingVertical: 14, backgroundColor: PALETTE.verdePrimario, borderRadius: 12, alignItems: 'center' },
    modalBtnConfirmarText: { fontWeight: '700', color: PALETTE.branco, fontSize: 15 },
});