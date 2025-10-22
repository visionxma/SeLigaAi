import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
} from 'react-native';
import { Bell, BellOff, Clock, Volume2, VolumeX } from 'lucide-react-native';
import {
  getNotificationSettings,
  muteNotifications,
  setMuteUntil,
  getMutedTimeRemaining,
  NotificationSettings,
} from '@/services/notificationService';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<NotificationSettings>({
    isMuted: false,
    mutedUntil: null,
    mutedAlertIds: [],
  });
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
    
    // Atualiza o tempo restante a cada minuto
    const interval = setInterval(loadSettings, 60000);
    return () => clearInterval(interval);
  }, []);

  async function loadSettings() {
    try {
      const currentSettings = await getNotificationSettings();
      setSettings(currentSettings);

      const remaining = await getMutedTimeRemaining();
      setTimeRemaining(remaining);

      setLoading(false);
    } catch (error) {
      console.error('Error loading settings:', error);
      setLoading(false);
    }
  }

  async function handleToggleMute(value: boolean) {
    try {
      await muteNotifications(value);
      await loadSettings();

      if (value) {
        Alert.alert('✅ Notificações Silenciadas', 'Todas as notificações foram desativadas permanentemente.');
      } else {
        Alert.alert('✅ Notificações Ativadas', 'Você voltará a receber alertas de área.');
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível alterar as configurações.');
    }
  }

  async function handleMuteTemporary(minutes: number) {
    try {
      await setMuteUntil(minutes);
      await loadSettings();

      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const timeText = hours > 0 ? `${hours}h${mins > 0 ? mins + 'min' : ''}` : `${mins} minutos`;

      Alert.alert(
        '🔕 Silenciado Temporariamente',
        `Notificações silenciadas por ${timeText}`
      );
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível silenciar temporariamente.');
    }
  }

  async function handleUnmuteTemporary() {
    try {
      await setMuteUntil(null);
      await loadSettings();
      Alert.alert('✅ Silenciamento Removido', 'Notificações reativadas!');
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível reativar.');
    }
  }

  function showMuteOptions() {
    Alert.alert(
      '🔕 Silenciar Por Quanto Tempo?',
      'Escolha por quanto tempo deseja silenciar as notificações:',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: '15 minutos', onPress: () => handleMuteTemporary(15) },
        { text: '1 hora', onPress: () => handleMuteTemporary(60) },
        { text: '8 horas', onPress: () => handleMuteTemporary(480) },
        { text: '1 dia', onPress: () => handleMuteTemporary(1440) },
      ]
    );
  }

  function formatTimeRemaining(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d${remainingHours > 0 ? ` ${remainingHours}h` : ''}`;
    }
    return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  const isMutedTemporarily = timeRemaining !== null && timeRemaining > 0;
  const isMutedPermanently = settings.isMuted;
  const isAnyMuted = isMutedTemporarily || isMutedPermanently;

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          {isAnyMuted ? (
            <BellOff size={28} color="#EF4444" />
          ) : (
            <Bell size={28} color="#10B981" />
          )}
          <Text style={styles.headerTitle}>Notificações</Text>
        </View>
      </View>

      {/* Status Atual */}
      <View style={styles.section}>
        <View style={[
          styles.statusCard,
          isAnyMuted ? styles.statusMuted : styles.statusActive
        ]}>
          {isAnyMuted ? (
            <VolumeX size={32} color="#EF4444" />
          ) : (
            <Volume2 size={32} color="#10B981" />
          )}
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>
              {isAnyMuted ? 'Silenciado' : 'Ativo'}
            </Text>
            <Text style={styles.statusSubtitle}>
              {isMutedPermanently && 'Notificações desativadas permanentemente'}
              {isMutedTemporarily && `Reativa em ${formatTimeRemaining(timeRemaining!)}`}
              {!isAnyMuted && 'Você receberá alertas ao entrar em áreas de risco'}
            </Text>
          </View>
        </View>
      </View>

      {/* Silenciamento Temporário */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Silenciar Temporariamente</Text>
        
        {isMutedTemporarily ? (
          <View style={styles.mutedInfo}>
            <View style={styles.mutedInfoHeader}>
              <Clock size={20} color="#F59E0B" />
              <Text style={styles.mutedInfoText}>
                Silenciado por mais {formatTimeRemaining(timeRemaining!)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.unmuteButton}
              onPress={handleUnmuteTemporary}
            >
              <Text style={styles.unmuteButtonText}>Reativar Agora</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.optionButton, isMutedPermanently && styles.optionButtonDisabled]}
            onPress={showMuteOptions}
            disabled={isMutedPermanently}
          >
            <Clock size={24} color={isMutedPermanently ? '#64748B' : '#3B82F6'} />
            <View style={styles.optionContent}>
              <Text style={[styles.optionTitle, isMutedPermanently && styles.textDisabled]}>
                Silenciar por um período
              </Text>
              <Text style={[styles.optionDescription, isMutedPermanently && styles.textDisabled]}>
                15 min, 1h, 8h ou 1 dia
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Silenciamento Permanente */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Silenciar Permanentemente</Text>
        
        <View style={styles.optionButton}>
          <BellOff size={24} color={isMutedPermanently ? '#EF4444' : '#64748B'} />
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>
              Desativar todas as notificações
            </Text>
            <Text style={styles.optionDescription}>
              Você não receberá mais alertas até reativar manualmente
            </Text>
          </View>
          <Switch
            value={isMutedPermanently}
            onValueChange={handleToggleMute}
            trackColor={{ false: '#334155', true: '#EF4444' }}
            thumbColor={isMutedPermanently ? '#FFFFFF' : '#94A3B8'}
          />
        </View>
      </View>

      {/* Informações */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>ℹ️ Como Funciona</Text>
        <Text style={styles.infoText}>
          • Você recebe notificações apenas ao <Text style={styles.infoBold}>entrar</Text> em uma área de alerta{'\n'}
          • Não há notificações repetidas enquanto estiver na área{'\n'}
          • Ao sair e entrar novamente, você será notificado novamente{'\n'}
          • Silencie temporariamente quando não quiser ser perturbado
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  loadingText: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#1E293B',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
  },
  statusActive: {
    backgroundColor: '#1E293B',
    borderColor: '#10B981',
  },
  statusMuted: {
    backgroundColor: '#1E293B',
    borderColor: '#EF4444',
  },
  statusText: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  optionButtonDisabled: {
    opacity: 0.5,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#94A3B8',
  },
  textDisabled: {
    color: '#64748B',
  },
  mutedInfo: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  mutedInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  mutedInfoText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F59E0B',
    flex: 1,
  },
  unmuteButton: {
    backgroundColor: '#F59E0B',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  unmuteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  infoSection: {
    margin: 20,
    padding: 16,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 22,
  },
  infoBold: {
    fontWeight: '600',
    color: '#3B82F6',
  },
});