import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertPoint } from '@/types';
import { saveNotificationToHistory } from './storageService';

const INSIDE_ZONES_KEY = 'inside_zones';
const NOTIFICATION_SETTINGS_KEY = 'notification_settings';
const ACTIVE_NOTIFICATIONS_KEY = 'active_notifications'; // ✅ NOVO: Rastreia notificações ativas

// Configurações de silenciamento
export interface NotificationSettings {
  isMuted: boolean;
  mutedUntil: string | null;
  mutedAlertIds: string[];
}

// ✅ NOVO: Mapeamento de notificações ativas por zona
interface ActiveNotification {
  notificationId: string;
  alertPointId: string;
  timestamp: string;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    // ✅ MELHORADO: Canal com vibração LONGA e som alto
    await Notifications.setNotificationChannelAsync('alerts', {
      name: 'Alertas de Área de Risco',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 1000, 300, 1000, 300, 1000, 300, 1000], // ✅ Vibra 4x por 1 segundo cada
      lightColor: '#EF4444',
      sound: 'default', // ✅ Som padrão do sistema
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM, // ✅ CRÍTICO: Usa volume de ALARME
      },
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('Permission not granted for notifications');
      return null;
    }
  }

  return token;
}

/**
 * Verifica se o usuário acabou de entrar em uma zona de alerta
 */
export async function checkZoneEntry(
  alertPointId: string,
  isInside: boolean
): Promise<boolean> {
  try {
    const insideZones = await getInsideZones();
    const wasInside = insideZones.includes(alertPointId);

    // Atualiza o estado
    if (isInside && !wasInside) {
      // ✅ ENTROU na zona
      await addInsideZone(alertPointId);
      return true; // Deve notificar
    } else if (!isInside && wasInside) {
      // ✅ SAIU da zona - remove notificação persistente
      await removeInsideZone(alertPointId);
      await dismissNotificationForZone(alertPointId);
      return false;
    }

    return false; // Já estava dentro ou fora
  } catch (error) {
    console.error('Error checking zone entry:', error);
    return false;
  }
}

/**
 * Verifica se as notificações estão silenciadas
 */
export async function isNotificationsMuted(): Promise<boolean> {
  try {
    const settings = await getNotificationSettings();

    // Verifica se está permanentemente silenciado
    if (settings.isMuted) {
      return true;
    }

    // Verifica se está temporariamente silenciado
    if (settings.mutedUntil) {
      const mutedUntilDate = new Date(settings.mutedUntil);
      const now = new Date();

      if (now < mutedUntilDate) {
        return true; // Ainda está no período de silêncio
      } else {
        // Período expirou, remove o silenciamento
        await setMuteUntil(null);
        return false;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking if muted:', error);
    return false;
  }
}

/**
 * Verifica se um alerta específico está silenciado
 */
export async function isAlertMuted(alertId: string): Promise<boolean> {
  try {
    const settings = await getNotificationSettings();
    return settings.mutedAlertIds.includes(alertId);
  } catch (error) {
    return false;
  }
}

/**
 * ✅ MELHORADO: Envia notificação persistente com som ALTO e vibração LONGA
 */
export async function scheduleNotification(alertPoint: AlertPoint) {
  try {
    // Verifica se notificações estão silenciadas
    const isMuted = await isNotificationsMuted();
    if (isMuted) {
      console.log('Notifications are muted');
      return;
    }

    // Verifica se este alerta específico está silenciado
    const alertIsMuted = await isAlertMuted(alertPoint.id);
    if (alertIsMuted) {
      console.log(`Alert ${alertPoint.id} is muted`);
      return;
    }

    // ✅ NOVO: Configuração de notificação persistente
    const notificationConfig: any = {
      title: `⚠️ ALERTA: ${alertPoint.alert_type}`,
      body: `Você entrou em uma área de risco!\n📍 ${alertPoint.street}, ${alertPoint.city}\n\n⚠️ Esta notificação permanecerá até você sair da área.`,
      data: { 
        alertPointId: alertPoint.id,
        isPersistent: true,
      },
      sound: 'default', // ✅ Som padrão
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 1000, 300, 1000, 300, 1000, 300, 1000], // ✅ 4 vibrações longas (1s cada)
      badge: 1,
      sticky: true,
    };

    // Configurações específicas do Android
    if (Platform.OS === 'android') {
      notificationConfig.channelId = 'alerts';
      notificationConfig.color = '#EF4444';
      notificationConfig.ongoing = true;
      notificationConfig.autoCancel = false;
      notificationConfig.importance = Notifications.AndroidImportance.MAX;
      notificationConfig.priority = Notifications.AndroidNotificationPriority.MAX;
    }

    // ✅ IMPORTANTE: Log para debug
    console.log('📢 Sending notification with config:', {
      sound: notificationConfig.sound,
      vibrate: notificationConfig.vibrate,
      channelId: notificationConfig.channelId,
    });

    // Envia a notificação
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: notificationConfig,
      trigger: null, // Notificação imediata
    });

    // ✅ NOVO: Salva o ID da notificação para poder removê-la depois
    await saveActiveNotification(notificationId, alertPoint.id);

    // Salva no histórico
    await saveNotificationToHistory(alertPoint);

    console.log(`✅ Persistent notification sent for: ${alertPoint.alert_type} (ID: ${notificationId})`);
  } catch (error) {
    console.error('❌ Error scheduling notification:', error);
  }
}

/**
 * ✅ NOVO: Remove notificação quando o usuário sai da zona
 */
async function dismissNotificationForZone(alertPointId: string) {
  try {
    const activeNotifications = await getActiveNotifications();
    const notification = activeNotifications.find(n => n.alertPointId === alertPointId);

    if (notification) {
      // Remove a notificação
      await Notifications.dismissNotificationAsync(notification.notificationId);
      
      // Remove do registro
      await removeActiveNotification(alertPointId);
      
      console.log(`Notification dismissed for zone: ${alertPointId}`);
    }
  } catch (error) {
    console.error('Error dismissing notification:', error);
  }
}

// ========== GERENCIAMENTO DE NOTIFICAÇÕES ATIVAS ==========

async function getActiveNotifications(): Promise<ActiveNotification[]> {
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_NOTIFICATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

async function saveActiveNotification(notificationId: string, alertPointId: string) {
  try {
    const notifications = await getActiveNotifications();
    notifications.push({
      notificationId,
      alertPointId,
      timestamp: new Date().toISOString(),
    });
    await AsyncStorage.setItem(ACTIVE_NOTIFICATIONS_KEY, JSON.stringify(notifications));
  } catch (error) {
    console.error('Error saving active notification:', error);
  }
}

async function removeActiveNotification(alertPointId: string) {
  try {
    const notifications = await getActiveNotifications();
    const filtered = notifications.filter(n => n.alertPointId !== alertPointId);
    await AsyncStorage.setItem(ACTIVE_NOTIFICATIONS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error removing active notification:', error);
  }
}

/**
 * ✅ NOVO: Limpa todas as notificações ativas (útil ao reiniciar o app)
 */
export async function dismissAllActiveNotifications() {
  try {
    const activeNotifications = await getActiveNotifications();
    
    for (const notification of activeNotifications) {
      await Notifications.dismissNotificationAsync(notification.notificationId);
    }
    
    await AsyncStorage.setItem(ACTIVE_NOTIFICATIONS_KEY, JSON.stringify([]));
    console.log('All active notifications dismissed');
  } catch (error) {
    console.error('Error dismissing all notifications:', error);
  }
}

// ========== GERENCIAMENTO DE ZONAS ==========

async function getInsideZones(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(INSIDE_ZONES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

async function addInsideZone(zoneId: string) {
  try {
    const zones = await getInsideZones();
    if (!zones.includes(zoneId)) {
      zones.push(zoneId);
      await AsyncStorage.setItem(INSIDE_ZONES_KEY, JSON.stringify(zones));
    }
  } catch (error) {
    console.error('Error adding inside zone:', error);
  }
}

async function removeInsideZone(zoneId: string) {
  try {
    const zones = await getInsideZones();
    const filtered = zones.filter((id) => id !== zoneId);
    await AsyncStorage.setItem(INSIDE_ZONES_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error removing inside zone:', error);
  }
}

/**
 * Limpa todas as zonas (útil ao reiniciar o app)
 */
export async function clearInsideZones() {
  try {
    await AsyncStorage.setItem(INSIDE_ZONES_KEY, JSON.stringify([]));
  } catch (error) {
    console.error('Error clearing inside zones:', error);
  }
}

// ========== CONFIGURAÇÕES DE NOTIFICAÇÃO ==========

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const stored = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return {
      isMuted: false,
      mutedUntil: null,
      mutedAlertIds: [],
    };
  } catch {
    return {
      isMuted: false,
      mutedUntil: null,
      mutedAlertIds: [],
    };
  }
}

async function saveNotificationSettings(settings: NotificationSettings) {
  try {
    await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving notification settings:', error);
  }
}

/**
 * Silencia todas as notificações permanentemente
 */
export async function muteNotifications(mute: boolean) {
  const settings = await getNotificationSettings();
  settings.isMuted = mute;
  if (mute) {
    settings.mutedUntil = null; // Remove silenciamento temporário se houver
  }
  await saveNotificationSettings(settings);
}

/**
 * Silencia notificações por um período de tempo
 */
export async function setMuteUntil(minutes: number | null) {
  const settings = await getNotificationSettings();

  if (minutes === null) {
    settings.mutedUntil = null;
  } else {
    const futureDate = new Date();
    futureDate.setMinutes(futureDate.getMinutes() + minutes);
    settings.mutedUntil = futureDate.toISOString();
    settings.isMuted = false; // Remove silenciamento permanente
  }

  await saveNotificationSettings(settings);
}

/**
 * Silencia um alerta específico
 */
export async function muteAlert(alertId: string, mute: boolean) {
  const settings = await getNotificationSettings();

  if (mute) {
    if (!settings.mutedAlertIds.includes(alertId)) {
      settings.mutedAlertIds.push(alertId);
    }
  } else {
    settings.mutedAlertIds = settings.mutedAlertIds.filter((id) => id !== alertId);
  }

  await saveNotificationSettings(settings);
}

/**
 * Obtém o tempo restante de silenciamento (em minutos)
 */
export async function getMutedTimeRemaining(): Promise<number | null> {
  const settings = await getNotificationSettings();

  if (!settings.mutedUntil) return null;

  const mutedUntil = new Date(settings.mutedUntil);
  const now = new Date();
  const diff = mutedUntil.getTime() - now.getTime();

  if (diff <= 0) {
    await setMuteUntil(null);
    return null;
  }

  return Math.ceil(diff / 60000); // Retorna em minutos
}