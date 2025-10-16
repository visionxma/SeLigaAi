import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertPoint, NotificationHistoryItem } from '@/types';

const ALERT_POINTS_KEY = 'alert_points';
const NOTIFICATION_HISTORY_KEY = 'notification_history';
const DEVICE_ID_KEY = 'device_id';

// ========== ALERT POINTS ==========

export async function saveAlertPoints(points: AlertPoint[]): Promise<void> {
  try {
    await AsyncStorage.setItem(ALERT_POINTS_KEY, JSON.stringify(points));
  } catch (error) {
    console.error('Error saving alert points:', error);
  }
}

export async function getAllAlertPoints(): Promise<AlertPoint[]> {
  try {
    const stored = await AsyncStorage.getItem(ALERT_POINTS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    // Se não tem dados, retorna pontos de exemplo
    return getDefaultAlertPoints();
  } catch (error) {
    console.error('Error loading alert points:', error);
    return getDefaultAlertPoints();
  }
}

export async function addAlertPoint(point: Omit<AlertPoint, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  try {
    const points = await getAllAlertPoints();
    const newPoint: AlertPoint = {
      ...point,
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    points.push(newPoint);
    await saveAlertPoints(points);
  } catch (error) {
    console.error('Error adding alert point:', error);
  }
}

export async function deleteAlertPoint(id: string): Promise<void> {
  try {
    const points = await getAllAlertPoints();
    const filtered = points.filter(p => p.id !== id);
    await saveAlertPoints(filtered);
  } catch (error) {
    console.error('Error deleting alert point:', error);
  }
}

// ========== NOTIFICATION HISTORY ==========

export async function saveNotificationToHistory(alertPoint: AlertPoint): Promise<void> {
  try {
    const history = await getNotificationHistory();
    const deviceId = await getDeviceId();
    
    const notification: NotificationHistoryItem = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_device_id: deviceId,
      alert_point_id: alertPoint.id,
      alert_type: alertPoint.alert_type,
      street: alertPoint.street,
      city: alertPoint.city,
      notified_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    
    history.unshift(notification);
    await AsyncStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Error saving notification to history:', error);
  }
}

export async function getNotificationHistory(): Promise<NotificationHistoryItem[]> {
  try {
    const stored = await AsyncStorage.getItem(NOTIFICATION_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading notification history:', error);
    return [];
  }
}

export async function deleteNotification(id: string): Promise<void> {
  try {
    const history = await getNotificationHistory();
    const filtered = history.filter(n => n.id !== id);
    await AsyncStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting notification:', error);
  }
}

export async function clearNotificationHistory(): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify([]));
  } catch (error) {
    console.error('Error clearing notification history:', error);
  }
}

// ========== DEVICE ID ==========

export async function getDeviceId(): Promise<string> {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch (error) {
    return `device_${Date.now()}`;
  }
}

// ========== DADOS DE EXEMPLO ==========

function getDefaultAlertPoints(): AlertPoint[] {
  return [
    // PEDREIRAS - MA
    {
      id: '1',
      alert_type: 'Área de Assalto',
      street: 'Avenida Getúlio Vargas',
      city: 'Pedreiras',
      latitude: -4.5667,
      longitude: -44.6,
      radius: 200,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '2',
      alert_type: 'Zona de Risco',
      street: 'Rua São Pedro',
      city: 'Pedreiras',
      latitude: -4.5700,
      longitude: -44.6050,
      radius: 150,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '3',
      alert_type: 'Alerta de Furto',
      street: 'Praça da Matriz',
      city: 'Pedreiras',
      latitude: -4.5650,
      longitude: -44.5980,
      radius: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // TRIZIDELA DO VALE - MA
    {
      id: '4',
      alert_type: 'Área Perigosa',
      street: 'Rua Principal',
      city: 'Trizidela do Vale',
      latitude: -4.9833,
      longitude: -44.6667,
      radius: 180,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '5',
      alert_type: 'Alerta de Assalto',
      street: 'Avenida Central',
      city: 'Trizidela do Vale',
      latitude: -4.9800,
      longitude: -44.6700,
      radius: 150,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '6',
      alert_type: 'Zona de Risco',
      street: 'Rua do Comércio',
      city: 'Trizidela do Vale',
      latitude: -4.9850,
      longitude: -44.6650,
      radius: 120,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
}

// ========== IMPORTAR/EXPORTAR DADOS ==========

export async function exportAllData(): Promise<string> {
  try {
    const alertPoints = await getAllAlertPoints();
    const history = await getNotificationHistory();
    
    const data = {
      alertPoints,
      history,
      exportedAt: new Date().toISOString(),
    };
    
    return JSON.stringify(data, null, 2);
  } catch (error) {
    console.error('Error exporting data:', error);
    return '';
  }
}

export async function importData(jsonString: string): Promise<boolean> {
  try {
    const data = JSON.parse(jsonString);
    
    if (data.alertPoints) {
      await saveAlertPoints(data.alertPoints);
    }
    
    if (data.history) {
      await AsyncStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(data.history));
    }
    
    return true;
  } catch (error) {
    console.error('Error importing data:', error);
    return false;
  }
}

// ========== LIMPAR TUDO ==========

export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      ALERT_POINTS_KEY,
      NOTIFICATION_HISTORY_KEY,
    ]);
  } catch (error) {
    console.error('Error clearing all data:', error);
  }
}