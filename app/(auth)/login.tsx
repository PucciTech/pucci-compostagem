import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { authService } from '@/services/auth';

// ===== DESIGN SYSTEM CLEAN =====
const PALETTE = {
  verdeEscuro: '#2C4C3B',
  verdeCard: '#EAF2EC',
  verdeBorda: '#CDE0D4',
  branco: '#FFFFFF',
  preto: '#1A2B22',
  cinza: '#7A8C81',
  terracota: '#C06A45',
  amareloIcone: '#EAB308',
  erro: '#DC3545',
  erroClaro: '#FCEAEA',
};

const PIN_LENGTH = 4;

export default function LoginScreen() {
  const router = useRouter();
  
  const [hasPIN, setHasPIN] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [createStep, setCreateStep] = useState<'enter' | 'confirm'>('enter');

  useEffect(() => {
    checkPIN();
  }, []);

  const checkPIN = async () => {
    try {
      const exists = await authService.hasPIN();
      setHasPIN(exists);
    } catch (error) {
      Alert.alert('Erro', 'Erro ao inicializar o sistema de segurança.');
    }
  };

  const handlePinChange = (text: string) => {
    const numericText = text.replace(/[^0-9]/g, '');
    setErro('');

    if (hasPIN) {
      setPin(numericText);
    } else {
      if (createStep === 'enter') setNewPin(numericText);
      else setConfirmPin(numericText);
    }
  };

  // ===== AÇÃO DO BOTÃO ENTRAR =====
  const handleActionButton = () => {
    Keyboard.dismiss();
    
    if (hasPIN) {
      executarLogin();
    } else {
      if (createStep === 'enter') {
        if (newPin.length === PIN_LENGTH) {
          setCreateStep('confirm');
        } else {
          setErro('Digite os 4 números');
        }
      } else {
        executarCriacaoPIN();
      }
    }
  };

  const executarLogin = async () => {
    setLoading(true);
    try {
      const isValid = await authService.validatePIN(pin);
      if (isValid) {
        const operador = {
          id: 'operador-001',
          nome: 'Pucci Ambiental',
          pin: pin,
          logadoEm: new Date().toISOString(),
        };
        await AsyncStorage.setItem('operadorLogado', JSON.stringify(operador));
        router.replace('/(app)');
      } else {
        setErro('PIN incorreto. Tente novamente.');
        setPin('');
      }
    } catch (error) {
      setErro('Erro ao validar acesso.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const executarCriacaoPIN = async () => {
    if (newPin !== confirmPin) {
      setErro('Os PINs não conferem. Tente novamente.');
      setNewPin('');
      setConfirmPin('');
      setCreateStep('enter');
      return;
    }

    setLoading(true);
    try {
      await authService.setPIN(newPin);
      setNewPin('');
      setConfirmPin('');
      setHasPIN(true);
    } catch (error) {
      setErro('Erro ao salvar o novo PIN.');
      setNewPin('');
      setConfirmPin('');
      setCreateStep('enter');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPIN = () => {
    Alert.alert(
      'Redefinir Acesso',
      'Isso apagará seu PIN atual. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Redefinir',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            await authService.removePIN();
            setHasPIN(false);
            setPin('');
            setNewPin('');
            setConfirmPin('');
            setCreateStep('enter');
            setLoading(false);
          },
        },
      ]
    );
  };

  if (hasPIN === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PALETTE.verdeEscuro} />
      </View>
    );
  }

  const isLogin = hasPIN === true;
  const activePin = isLogin ? pin : (createStep === 'enter' ? newPin : confirmPin);
  
  let instructionTitle = 'Bem-vindo de Volta';
  let instructionSubtitle = 'Acesse seu sistema seguro';
  let buttonText = 'Entrar no Sistema';
  
  if (!isLogin) {
    instructionTitle = createStep === 'enter' ? 'Criar Acesso' : 'Confirmar Acesso';
    instructionSubtitle = createStep === 'enter' ? 'Crie um novo PIN de 4 dígitos' : 'Digite o PIN novamente';
    buttonText = createStep === 'enter' ? 'Continuar' : 'Salvar PIN';
  }

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          
          {/* ===== BANNER SUPERIOR CURVADO ===== */}
          <View style={styles.topBanner}>
            <SafeAreaView edges={['top']} />
          </View>

          {/* ===== HEADER & LOGO ===== */}
          <View style={styles.header}>
            <View style={styles.logoWrapper}>
              <View style={styles.logoContainer}>
                <MaterialCommunityIcons name="seed-outline" size={42} color={PALETTE.verdeEscuro} />
              </View>
            </View>
            <Text style={styles.companyName}>Campos Solo</Text>
            <Text style={styles.appSubtitle}>Gestão Inteligente de Leiras</Text>
            <View style={styles.divider} />
          </View>

          {/* ===== CARD DE LOGIN ===== */}
          <View style={styles.cardContainer}>
            <View style={styles.loginCard}>
              
              <View style={styles.cardHeader}>
                <View style={styles.iconBox}>
                  <MaterialCommunityIcons name="lock" size={24} color={PALETTE.amareloIcone} />
                </View>
                <View>
                  <Text style={styles.cardTitle}>{instructionTitle}</Text>
                  <Text style={styles.cardSubtitle}>{instructionSubtitle}</Text>
                </View>
              </View>

              <Text style={styles.pinLabel}>PIN DE SEGURANÇA</Text>
              
              {/* ===== CONTAINER DO INPUT ===== */}
              <View style={styles.inputWrapper}>
                
                {/* Input Visual (Bolinhas) */}
                <View style={[styles.pinInputBox, erro ? styles.pinInputError : null]}>
                  <MaterialCommunityIcons name="key-variant" size={20} color={PALETTE.amareloIcone} style={styles.keyIcon} />
                  
                  <View style={styles.pinDotsContainer}>
                    {[...Array(PIN_LENGTH)].map((_, i) => {
                      const isFilled = i < activePin.length;
                      return (
                        <View 
                          key={i} 
                          style={[
                            styles.pinDot, 
                            isFilled && styles.pinDotFilled,
                            erro ? styles.pinDotError : null
                          ]} 
                        />
                      );
                    })}
                  </View>
                </View>

                {/* Input Nativo Invisível sobreposto */}
                <TextInput
                  style={styles.hiddenInput}
                  value={activePin}
                  onChangeText={handlePinChange}
                  keyboardType="number-pad"
                  maxLength={PIN_LENGTH}
                  autoFocus={true}
                  caretHidden={true}
                />

              </View>

              {/* Mensagem de Erro e Link Esqueceu a Senha */}
              <View style={styles.actionRow}>
                {erro ? (
                  <Text style={styles.errorText}>{erro}</Text>
                ) : (
                  <View />
                )}
                
                {isLogin && (
                  <TouchableOpacity onPress={handleForgotPIN} style={styles.forgotBtn}>
                    <Text style={styles.forgotText}>Esqueceu seu PIN?</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* ===== BOTÃO ENTRAR ===== */}
              <TouchableOpacity 
                style={[
                  styles.enterButton, 
                  (activePin.length < PIN_LENGTH || loading) && styles.enterButtonDisabled
                ]}
                onPress={handleActionButton}
                disabled={activePin.length < PIN_LENGTH || loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color={PALETTE.branco} />
                ) : (
                  <>
                    <Text style={styles.enterButtonText}>{buttonText}</Text>
                    <MaterialCommunityIcons name="arrow-right" size={20} color={PALETTE.branco} />
                  </>
                )}
              </TouchableOpacity>

            </View>
          </View>

          {/* ===== FOOTER DE SEGURANÇA ===== */}
          <View style={styles.footer}>
            <MaterialCommunityIcons name="shield-check" size={16} color={PALETTE.cinza} />
            <Text style={styles.footerText}>Ambiente Seguro e Criptografado</Text>
          </View>

        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.branco,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: PALETTE.branco,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBanner: {
    backgroundColor: PALETTE.verdeEscuro,
    height: 160,
    width: '100%',
    position: 'absolute',
    top: 0,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  header: {
    alignItems: 'center',
    marginTop: 100,
    paddingHorizontal: 20,
  },
  logoWrapper: {
    backgroundColor: PALETTE.branco,
    padding: 6,
    borderRadius: 50,
    marginBottom: 16,
  },
  logoContainer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: PALETTE.branco,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PALETTE.verdeBorda,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  companyName: {
    fontSize: 28,
    fontWeight: '800',
    color: PALETTE.preto,
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 14,
    color: PALETTE.cinza,
    fontWeight: '500',
    marginTop: 4,
  },
  divider: {
    width: 40,
    height: 3,
    backgroundColor: PALETTE.terracota,
    borderRadius: 2,
    marginTop: 16,
    marginBottom: 8,
  },
  cardContainer: {
    paddingHorizontal: 24,
    marginTop: 24,
    zIndex: 10,
  },
  loginCard: {
    backgroundColor: PALETTE.verdeCard,
    borderRadius: 24,
    padding: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: PALETTE.branco,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: PALETTE.preto,
  },
  cardSubtitle: {
    fontSize: 13,
    color: PALETTE.cinza,
    marginTop: 2,
  },
  pinLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: PALETTE.cinza,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    position: 'relative',
    height: 60,
  },
  pinInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.branco,
    borderWidth: 1,
    borderColor: PALETTE.verdeBorda,
    borderRadius: 16,
    height: '100%',
    paddingHorizontal: 16,
  },
  pinInputError: {
    borderColor: PALETTE.erro,
    backgroundColor: PALETTE.erroClaro,
  },
  hiddenInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0,
    zIndex: 1,
  },
  keyIcon: {
    marginRight: 16,
  },
  pinDotsContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  pinDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: PALETTE.verdeBorda,
  },
  pinDotFilled: {
    backgroundColor: PALETTE.preto,
  },
  pinDotError: {
    backgroundColor: PALETTE.erro,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 24, // Espaço extra antes do botão
    height: 30,
  },
  errorText: {
    color: PALETTE.erro,
    fontSize: 13,
    fontWeight: '500',
  },
  forgotBtn: {
    padding: 4,
  },
  forgotText: {
    color: PALETTE.terracota,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  
  // ===== BOTÃO ENTRAR =====
  enterButton: {
    backgroundColor: PALETTE.verdeEscuro, // Cor Terracota solicitada
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 56,
    borderRadius: 16,
    gap: 8,
  },
  enterButtonDisabled: {
    opacity: 0.6,
    backgroundColor: PALETTE.cinza, // Fica cinza se não tiver digitado os 4 números
  },
  enterButtonText: {
    color: PALETTE.branco,
    fontSize: 16,
    fontWeight: '700',
  },

  // ===== FOOTER =====
  footer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 6,
  },
  footerText: {
    fontSize: 12,
    color: PALETTE.cinza,
    fontWeight: '500',
  }
});