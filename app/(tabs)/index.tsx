import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { MapPin, Navigation, RefreshCw, Download } from 'lucide-react-native';
import { AlertPoint } from '@/types';
import { getAllAlertPoints } from '@/services/storageService';
import { startLocationTracking, requestLocationPermissions } from '@/services/locationService';
import { registerForPushNotificationsAsync } from '@/services/notificationService';
import { downloadOfflineTiles, hasOfflineTiles } from '@/services/offlineMapService';

export default function MapScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [alertPoints, setAlertPoints] = useState<AlertPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [offlineAvailable, setOfflineAvailable] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  async function initializeApp() {
    try {
      await registerForPushNotificationsAsync();

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

      await loadAlertPoints();

      const started = await startLocationTracking();
      setTracking(started);

      const hasOffline = await hasOfflineTiles();
      setOfflineAvailable(hasOffline);

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

  async function handleRefresh() {
    try {
      await loadAlertPoints();
      
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(currentLocation);
      
      // Atualiza o mapa no WebView
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

  async function handleDownloadOfflineMaps() {
    Alert.alert(
      'Baixar Mapas Offline',
      'Deseja baixar os mapas de Pedreiras e Trizidela do Vale para uso offline? Isso pode levar alguns minutos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Baixar',
          onPress: async () => {
            setDownloading(true);
            try {
              await downloadOfflineTiles();
              setOfflineAvailable(true);
              Alert.alert('Sucesso', 'Mapas baixados! Agora você pode usar o app offline.');
            } catch (error) {
              console.error('Error downloading tiles:', error);
              Alert.alert('Erro', 'Falha ao baixar mapas. Verifique sua conexão.');
            } finally {
              setDownloading(false);
            }
          },
        },
      ]
    );
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
        // Inicializa o mapa
        const map = L.map('map', {
          zoomControl: true,
          attributionControl: false
        }).setView([${location?.coords.latitude || -4.5667}, ${location?.coords.longitude || -44.6}], 15);

        // Camada do OpenStreetMap
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        // Ícone personalizado para o usuário
        const userIcon = L.divIcon({
          className: 'user-marker',
          html: '<div style="width: 20px; height: 20px; background: #3B82F6; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        // Marcador do usuário
        let userMarker = L.marker([${location?.coords.latitude || -4.5667}, ${location?.coords.longitude || -44.6}], { icon: userIcon }).addTo(map);

        // Adiciona os pontos de alerta
        const alertPoints = ${JSON.stringify(alertPoints)};
        
        alertPoints.forEach(point => {
          // Círculo de raio
          L.circle([point.latitude, point.longitude], {
            color: '#EF4444',
            fillColor: '#EF4444',
            fillOpacity: 0.2,
            radius: point.radius,
            weight: 2
          }).addTo(map);

          // Marcador
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

        // Funções globais para controle externo
        window.updateUserLocation = (lat, lng) => {
          userMarker.setLatLng([lat, lng]);
          map.setView([lat, lng]);
        };

        window.centerOnUser = () => {
          map.setView(userMarker.getLatLng(), 15);
        };

        window.updateAlertPoints = (points) => {
          // Remove marcadores antigos (implementar se necessário)
          // Adiciona novos (implementar se necessário)
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
      {/* Mapa com OpenStreetMap via WebView */}
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

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SE LIGA AÍ</Text>
        {tracking && (
          <View style={styles.trackingBadge}>
            <View style={styles.trackingDot} />
            <Text style={styles.trackingText}>Monitorando</Text>
          </View>
        )}
      </View>

      {/* Controles do Mapa */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={centerOnUserLocation}
          activeOpacity={0.7}
        >
          <Navigation size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleRefresh}
          activeOpacity={0.7}
        >
          <RefreshCw size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            downloading && styles.controlButtonDisabled,
            offlineAvailable && styles.controlButtonSuccess,
          ]}
          onPress={handleDownloadOfflineMaps}
          activeOpacity={0.7}
          disabled={downloading}
        >
          <Download size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Card de Estatísticas */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <MapPin size={20} color="#3B82F6" />
          <Text style={styles.statNumber}>{alertPoints.length}</Text>
          <Text style={styles.statLabel}>Pontos de Alerta</Text>
        </View>
      </View>

      {/* Badge de Status */}
      <View style={styles.bottomBadges}>
        <View style={styles.osmBadge}>
          <Text style={styles.osmText}>🗺️ OpenStreetMap</Text>
        </View>
        {offlineAvailable && (
          <View style={styles.offlineBadge}>
            <View style={styles.offlineDot} />
            <Text style={styles.offlineText}>Offline Disponível</Text>
          </View>
        )}
        {downloading && (
          <View style={styles.downloadingBadge}>
            <Text style={styles.downloadingText}>⬇️ Baixando...</Text>
          </View>
        )}
      </View>
    </View>
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
    color: '#FFFFFF',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  trackingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
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
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  controlButtonDisabled: {
    backgroundColor: '#64748B',
    opacity: 0.6,
  },
  controlButtonSuccess: {
    backgroundColor: '#10B981',
  },
  statsContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
  },
  statCard: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  bottomBadges: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    gap: 8,
    alignItems: 'flex-end',
  },
  osmBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  osmText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  offlineText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '600',
  },
  downloadingBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  downloadingText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
});