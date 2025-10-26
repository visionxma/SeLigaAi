import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { calculateDistance } from '@/utils/haversine';
import { scheduleNotification, checkZoneEntry } from './notificationService';
import { getAllAlertPoints } from './storageService';
import { AlertPoint } from '@/types';

const LOCATION_TASK_NAME = 'background-location-task';

export async function requestLocationPermissions() {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();

  if (foregroundStatus !== 'granted') {
    console.warn('Foreground location permission denied');
    return false;
  }

  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

  if (backgroundStatus !== 'granted') {
    console.warn('Background location permission denied');
  }

  return backgroundStatus === 'granted';
}

export async function startLocationTracking() {
  try {
    const hasPermissions = await requestLocationPermissions();

    if (!hasPermissions) {
      console.warn('Location permissions not granted');
      return false;
    }

    // Inicia o monitoramento de localização em background
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 10000, // Atualiza a cada 10 segundos
      distanceInterval: 50, // Ou quando mover 50 metros
      foregroundService: {
        notificationTitle: 'SE LIGA AÍ',
        notificationBody: 'Monitorando alertas próximos',
        notificationColor: '#EF4444',
      },
    });

    console.log('Location tracking started');
    return true;
  } catch (error) {
    console.error('Error starting location tracking:', error);
    return false;
  }
}

export async function stopLocationTracking() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      console.log('Location tracking stopped');
    }
  } catch (error) {
    console.error('Error stopping location tracking:', error);
  }
}

/**
 * ✅ CORRIGIDO: Agora verifica se o usuário ENTROU na zona antes de notificar
 */
export async function checkProximityToAlerts(
  userLat: number,
  userLng: number,
  alertPoints: AlertPoint[]
) {
  for (const point of alertPoints) {
    const distance = calculateDistance(
      userLat,
      userLng,
      point.latitude,
      point.longitude
    );

    const isInside = distance <= point.radius;

    // Verifica se acabou de entrar na zona
    const shouldNotify = await checkZoneEntry(point.id, isInside);

    if (shouldNotify) {
      console.log(`User entered alert zone: ${point.alert_type} (${distance.toFixed(0)}m)`);
      await scheduleNotification(point);
    }
  }
}

// Define a tarefa em background que monitora a localização
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Location task error:', error);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };

    if (locations && locations.length > 0) {
      const location = locations[0];

      try {
        // Carrega os pontos de alerta do AsyncStorage
        const alertPoints = await getAllAlertPoints();

        // Verifica proximidade com alertas
        await checkProximityToAlerts(
          location.coords.latitude,
          location.coords.longitude,
          alertPoints
        );
      } catch (err) {
        console.error('Error processing location in background:', err);
      }
    }
  }
});