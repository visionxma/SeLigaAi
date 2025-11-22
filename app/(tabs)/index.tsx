import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { MapPin, Navigation, RefreshCw, Cloud, BellOff } from 'lucide-react-native';
import { AlertPoint } from '@/types';
import { getAllAlertPoints } from '@/services/storageService';
import { startLocationTracking, requestLocationPermissions } from '@/services/locationService';
import { 
  registerForPushNotificationsAsync, 
  isNotificationsMuted, 
  getMutedTimeRemaining,
  dismissAllActiveNotifications,
  clearInsideZones,
} from '@/services/notificationService';
import { syncAlertPointsFromSheets, isSheetsConfigured } from '@/services/sheetsService';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

export default function MapScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [alertPoints, setAlertPoints] = useState<AlertPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  const [mutedTimeRemaining, setMutedTimeRemaining] = useState<number | null>(null);
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkNotificationStatus();
    }, [])
  );

  async function checkNotificationStatus() {
    const muted = await isNotificationsMuted();
    setNotificationsMuted(muted);

    const timeRemaining = await getMutedTimeRemaining();
    setMutedTimeRemaining(timeRemaining);
  }

  async function initializeApp() {
    try {
      await registerForPushNotificationsAsync();
      await dismissAllActiveNotifications();
      await clearInsideZones();

      const hasPermissions = await requestLocationPermissions();

      if (!hasPermissions) {
        Alert.alert(
          'Permissão necessária',
          'Este app precisa de permissão de localização para funcionar.'
        );
        setLoading(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(currentLocation);

      if (isSheetsConfigured()) {
        console.log('Syncing from Google Sheets...');
        const synced = await syncAlertPointsFromSheets();
        if (synced) {
          console.log('Successfully synced from Google Sheets');
        }
      }

      await loadAlertPoints();

      const started = await startLocationTracking();
      setTracking(started);

      await checkNotificationStatus();

      setLoading(false);
    } catch (error) {
      console.error('Error initializing app:', error);
      Alert.alert('Erro', 'Erro ao inicializar o app. Verifique as permissões.');
      setLoading(false);
    }
  }

  async function loadAlertPoints() {
    try {
      const points = await getAllAlertPoints();
      setAlertPoints(points);
      console.log(`Loaded ${points.length} alert points`);
    } catch (error) {
      console.error('Error loading alert points:', error);
    }
  }

  async function handleSyncFromSheets() {
    if (!isSheetsConfigured()) {
      Alert.alert(
        'Google Sheets não configurado',
        'Configure o ID da planilha no arquivo sheetsService.ts'
      );
      return;
    }

    setSyncing(true);
    try {
      const synced = await syncAlertPointsFromSheets();
      
      if (synced) {
        await loadAlertPoints();
        
        if (webViewRef.current) {
          webViewRef.current.reload();
        }
        
        Alert.alert('Sucesso', 'Pontos de alerta sincronizados do Google Sheets!');
      } else {
        Alert.alert('Aviso', 'Nenhum ponto encontrado na planilha.');
      }
    } catch (error) {
      console.error('Error syncing from sheets:', error);
      Alert.alert('Erro', 'Falha ao sincronizar. Verifique sua conexão e se a planilha está pública.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleRefresh() {
    try {
      if (isSheetsConfigured()) {
        setSyncing(true);
        await syncAlertPointsFromSheets();
        setSyncing(false);
      }
      
      await loadAlertPoints();
      await checkNotificationStatus();
      
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(currentLocation);
      
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          if (window.updateUserLocation) {
            window.updateUserLocation(${currentLocation.coords.latitude}, ${currentLocation.coords.longitude});
          }
        `);
      }
      
      Alert.alert('Atualizado', 'Dados atualizados com sucesso!');
    } catch (error) {
      console.error('Error refreshing:', error);
      Alert.alert('Erro', 'Erro ao atualizar dados');
    }
  }

  function centerOnUserLocation() {
    if (location && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (window.centerOnUser) {
          window.centerOnUser();
        }
      `);
    }
  }

  function formatTimeRemaining(minutes: number): string {
    if (minutes < 60) {
      return `${minutes}min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days}d`;
    }
    return `${hours}h${mins > 0 ? `${mins}m` : ''}`;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; }
        #map { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        const map = L.map('map', {
          zoomControl: true,
          attributionControl: false
        }).setView([${location?.coords.latitude || -4.5667}, ${location?.coords.longitude || -44.6}], 15);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        const userIcon = L.divIcon({
          className: 'user-marker',
          html: '<div style="width: 20px; height: 20px; background: #EF4444; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        let userMarker = L.marker([${location?.coords.latitude || -4.5667}, ${location?.coords.longitude || -44.6}], { icon: userIcon }).addTo(map);

        const alertPoints = ${JSON.stringify(alertPoints)};
        
        alertPoints.forEach(point => {
          L.circle([point.latitude, point.longitude], {
            color: '#EF4444',
            fillColor: '#EF4444',
            fillOpacity: 0.2,
            radius: point.radius,
            weight: 2
          }).addTo(map);

          const marker = L.marker([point.latitude, point.longitude], {
            icon: L.divIcon({
              className: 'alert-marker',
              html: '<div style="width: 30px; height: 30px; background: #EF4444; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-size: 18px;">⚠️</span></div>',
              iconSize: [30, 30],
              iconAnchor: [15, 15]
            })
          }).addTo(map);

          marker.bindPopup(\`
            <div style="font-family: Arial; padding: 8px;">
              <strong style="color: #EF4444; font-size: 14px;">\${point.alert_type}</strong><br/>
              <span style="font-size: 12px; color: #333;">\${point.street}, \${point.city}</span>
            </div>
          \`);
        });

        window.updateUserLocation = (lat, lng) => {
          userMarker.setLatLng([lat, lng]);
          map.setView([lat, lng]);
        };

        window.centerOnUser = () => {
          map.setView(userMarker.getLatLng(), 15);
        };
      </script>
    </body>
    </html>
  `;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {location && (
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent }}
          style={styles.map}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          originWhitelist={['*']}
        />
      )}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>SE LIGA AÍ</Text>
        <View style={styles.headerBadges}>
          {tracking && (
            <View style={styles.trackingBadge}>
              <View style={styles.trackingDot} />
              <Text style={styles.trackingText}>Monitorando</Text>
            </View>
          )}
          {notificationsMuted && (
            <View style={styles.mutedBadge}>
              <BellOff size={12} color="#EF4444" />
              <Text style={styles.mutedText}>
                {mutedTimeRemaining ? formatTimeRemaining(mutedTimeRemaining) : 'Silenciado'}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={centerOnUserLocation}
          activeOpacity={0.7}
        >
          <Navigation size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, syncing && styles.controlButtonDisabled]}
          onPress={handleSyncFromSheets}
          activeOpacity={0.7}
          disabled={syncing}
        >
          <Cloud size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleRefresh}
          activeOpacity={0.7}
        >
          <RefreshCw size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <MapPin size={20} color="#EF4444" />
          <Text style={styles.statNumber}>{alertPoints.length}</Text>
          <Text style={styles.statLabel}>Pontos de Alerta</Text>
        </View>
      </View>

      <View style={styles.bottomBadges}>
        <View style={styles.osmBadge}>
          <Text style={styles.osmText}>🗺️ OpenStreetMap</Text>
        </View>
        {syncing && (
          <View style={styles.syncingBadge}>
            <Text style={styles.syncingText}>☁️ Sincronizando...</Text>
          </View>
        )}
      </View>
    </View>
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
  map: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#EF4444',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  headerBadges: {
    gap: 8,
  },
  trackingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  trackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  trackingText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
  },
  mutedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  mutedText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  controls: {
    position: 'absolute',
    right: 20,
    bottom: 120,
    gap: 12,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 8,
  },
  controlButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  statsContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  bottomBadges: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    gap: 8,
    alignItems: 'flex-end',
  },
  osmBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  osmText: {
    color: '#1F2937',
    fontSize: 10,
    fontWeight: '600',
  },
  syncingBadge: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  syncingText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
});