import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertPoint } from '@/types';
import { saveNotificationToHistory } from './storageService';

const NOTIFIED_ALERTS_KEY = 'notified_alerts';

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
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
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

export async function scheduleNotification(alertPoint: AlertPoint) {
  try {
    // Verifica se já notificou hoje sobre este alerta
    const notifiedAlerts = await getNotifiedAlerts();
    const alertKey = `${alertPoint.id}_${new Date().toDateString()}`;

    if (notifiedAlerts.includes(alertKey)) {
      console.log('Already notified about this alert today');
      return;
    }

    // Envia a notificação
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `⚠️ ${alertPoint.alert_type}`,
        body: `Você está próximo a uma área de alerta!\n${alertPoint.street}, ${alertPoint.city}`,
        data: { alertPointId: alertPoint.id },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // Notificação imediata
    });

    // Marca como notificado
    await addNotifiedAlert(alertKey);
    
    // Salva no histórico
    await saveNotificationToHistory(alertPoint);
    
    console.log('Notification sent for:', alertPoint.alert_type);
  } catch (error) {
    console.error('Error scheduling notification:', error);
  }
}

async function getNotifiedAlerts(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(NOTIFIED_ALERTS_KEY);
    if (stored) {
      const alerts = JSON.parse(stored);
      // Limpa alertas antigos (mais de 7 dias)
      return cleanOldAlerts(alerts);
    }
    return [];
  } catch {
    return [];
  }
}

async function addNotifiedAlert(alertKey: string) {
  try {
    const notifiedAlerts = await getNotifiedAlerts();
    notifiedAlerts.push(alertKey);
    await AsyncStorage.setItem(NOTIFIED_ALERTS_KEY, JSON.stringify(notifiedAlerts));
  } catch (error) {
    console.error('Error saving notified alert:', error);
  }
}

function cleanOldAlerts(alerts: string[]): string[] {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  return alerts.filter(alert => {
    const datePart = alert.split('_').slice(-3).join(' ');
    const alertDate = new Date(datePart);
    return alertDate > sevenDaysAgo;
  });
}