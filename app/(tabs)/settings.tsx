import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { Bell, BellOff, Clock, Volume2, VolumeX, X } from 'lucide-react-native';
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
  const [showMuteModal, setShowMuteModal] = useState(false);

  const muteTimeOptions = [
    { label: '15 minutos', minutes: 15, icon: '⏱️' },
    { label: '1 hora', minutes: 60, icon: '⏰' },
    { label: '8 horas', minutes: 480, icon: '🕐' },
    { label: '1 dia', minutes: 1440, icon: '📅' },
  ];

  useEffect(() => {
    loadSettings();
    
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
      setShowMuteModal(false);

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
            style={[styles.openModalButton, isMutedPermanently && styles.openModalButtonDisabled]}
            onPress={() => setShowMuteModal(true)}
            disabled={isMutedPermanently}
          >
            <Clock size={24} color={isMutedPermanently ? '#9CA3AF' : '#EF4444'} />
            <View style={styles.optionContent}>
              <Text style={[styles.optionTitle, isMutedPermanently && styles.textDisabled]}>
                Escolher período de silêncio
              </Text>
              <Text style={[styles.optionDescription, isMutedPermanently && styles.textDisabled]}>
                Toque para ver as opções
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Silenciar Permanentemente</Text>
        
        <View style={styles.optionButton}>
          <BellOff size={24} color={isMutedPermanently ? '#EF4444' : '#9CA3AF'} />
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
            trackColor={{ false: '#E5E7EB', true: '#FCA5A5' }}
            thumbColor={isMutedPermanently ? '#EF4444' : '#FFFFFF'}
          />
        </View>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>ℹ️ Como Funciona</Text>
        <Text style={styles.infoText}>
          • Você recebe notificações apenas ao <Text style={styles.infoBold}>entrar</Text> em uma área de alerta{'\n'}
          • Não há notificações repetidas enquanto estiver na área{'\n'}
          • Ao sair e entrar novamente, você será notificado novamente{'\n'}
          • Silencie temporariamente quando não quiser ser perturbado
        </Text>
      </View>

      <Modal
        visible={showMuteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMuteModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowMuteModal(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔕 Silenciar por quanto tempo?</Text>
              <TouchableOpacity
                onPress={() => setShowMuteModal(false)}
                style={styles.closeButton}
              >
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.timeOptionsGrid}>
              {muteTimeOptions.map((option) => (
                <TouchableOpacity
                  key={option.minutes}
                  style={styles.timeOptionCard}
                  onPress={() => handleMuteTemporary(option.minutes)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.timeOptionIcon}>{option.icon}</Text>
                  <Text style={styles.timeOptionLabel}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowMuteModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    fontSize: 18,
    color: '#1F2937',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
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
    backgroundColor: '#FFFFFF',
  },
  statusActive: {
    borderColor: '#10B981',
  },
  statusMuted: {
    borderColor: '#EF4444',
  },
  statusText: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  openModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  openModalButtonDisabled: {
    opacity: 0.5,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  textDisabled: {
    color: '#9CA3AF',
  },
  mutedInfo: {
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
  },
  infoBold: {
    fontWeight: '600',
    color: '#EF4444',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  timeOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  timeOptionCard: {
    width: '48%',
    backgroundColor: '#F9FAFB',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  timeOptionIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  timeOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
});