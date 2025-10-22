import AsyncStorage from '@react-native-async-storage/async-storage';
// ✅ SOLUÇÃO: Usar a API LEGADA que tem documentDirectory e cacheDirectory
import * as FileSystem from 'expo-file-system/legacy';

const OFFLINE_TILES_KEY = 'offline_tiles_downloaded';

// ✅ Agora sim! documentDirectory existe na API legada
const TILES_DIR = (FileSystem.documentDirectory || FileSystem.cacheDirectory || '') + 'tiles/';

// Coordenadas das cidades do Maranhão
const REGIONS = {
  pedreiras: {
    name: 'Pedreiras',
    lat: -4.5667,
    lng: -44.6,
    bounds: {
      north: -4.4667,
      south: -4.6667,
      east: -44.5,
      west: -44.7,
    },
  },
  trizidelaDovale: {
    name: 'Trizidela do Vale',
    lat: -4.9833,
    lng: -44.6667,
    bounds: {
      north: -4.8833,
      south: -5.0833,
      east: -44.5667,
      west: -44.7667,
    },
  },
};

// Níveis de zoom a baixar (reduzido para testes - só 13-15)
const ZOOM_LEVELS = [13, 14, 15];

interface TileCoord {
  x: number;
  y: number;
  z: number;
}

/**
 * Converte lat/lng para coordenadas de tile
 */
function latLngToTile(lat: number, lng: number, zoom: number): TileCoord {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  const y = Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
  return { x, y, z: zoom };
}

/**
 * Gera lista de tiles para uma região específica
 */
function getTilesForRegion(bounds: any, zoom: number): TileCoord[] {
  const topLeft = latLngToTile(bounds.north, bounds.west, zoom);
  const bottomRight = latLngToTile(bounds.south, bounds.east, zoom);

  const tiles: TileCoord[] = [];

  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }

  return tiles;
}

/**
 * Baixa um tile específico
 */
async function downloadTile(tile: TileCoord): Promise<boolean> {
  try {
    const url = `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
    const fileUri = `${TILES_DIR}${tile.z}/${tile.x}/${tile.y}.png`;

    // Cria diretórios se não existirem
    const dirUri = `${TILES_DIR}${tile.z}/${tile.x}/`;
    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    }

    // Pequeno delay para não sobrecarregar
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const download = await FileSystem.downloadAsync(url, fileUri);

    if (download.status === 200) {
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error downloading tile ${tile.z}/${tile.x}/${tile.y}:`, error);
    return false;
  }
}

/**
 * Baixa todos os tiles das regiões configuradas
 */
export async function downloadOfflineTiles(): Promise<void> {
  try {
    console.log('Starting offline tiles download...');
    console.log('Tiles directory:', TILES_DIR);

    if (!TILES_DIR) {
      throw new Error('FileSystem directory not available');
    }

    // Cria diretório principal
    const mainDirInfo = await FileSystem.getInfoAsync(TILES_DIR);
    if (!mainDirInfo.exists) {
      await FileSystem.makeDirectoryAsync(TILES_DIR, { intermediates: true });
    }

    const allTiles: TileCoord[] = [];

    // Gera lista de tiles para cada região e zoom
    for (const region of Object.values(REGIONS)) {
      for (const zoom of ZOOM_LEVELS) {
        const tiles = getTilesForRegion(region.bounds, zoom);
        allTiles.push(...tiles);
        console.log(`Region ${region.name}, zoom ${zoom}: ${tiles.length} tiles`);
      }
    }

    console.log(`Total tiles to download: ${allTiles.length}`);

    // Baixa tiles em lotes de 3 (muito conservador para evitar rate limit)
    const BATCH_SIZE = 3;
    let downloaded = 0;
    let failed = 0;

    for (let i = 0; i < allTiles.length; i += BATCH_SIZE) {
      const batch = allTiles.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((tile) => downloadTile(tile))
      );

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          downloaded++;
        } else {
          failed++;
        }
      });

      const progress = Math.round(((i + batch.length) / allTiles.length) * 100);
      console.log(`Progress: ${progress}% (${downloaded} ok, ${failed} failed)`);

      // Delay de 2s entre batches
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Marca como baixado
    await AsyncStorage.setItem(OFFLINE_TILES_KEY, JSON.stringify({
      downloaded: true,
      date: new Date().toISOString(),
      totalTiles: allTiles.length,
      downloadedTiles: downloaded,
      failedTiles: failed,
      regions: Object.keys(REGIONS),
    }));

    console.log(`Download completed! ${downloaded} tiles downloaded, ${failed} failed`);
  } catch (error) {
    console.error('Error downloading offline tiles:', error);
    throw error;
  }
}

/**
 * Verifica se os tiles offline estão disponíveis
 */
export async function hasOfflineTiles(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(OFFLINE_TILES_KEY);
    if (!stored) return false;

    const data = JSON.parse(stored);
    return data.downloaded === true;
  } catch {
    return false;
  }
}

/**
 * Obtém informações sobre os tiles offline
 */
export async function getOfflineTilesInfo(): Promise<any> {
  try {
    const stored = await AsyncStorage.getItem(OFFLINE_TILES_KEY);
    if (!stored) return null;

    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Remove todos os tiles offline
 */
export async function clearOfflineTiles(): Promise<void> {
  try {
    // Remove diretório de tiles
    const dirInfo = await FileSystem.getInfoAsync(TILES_DIR);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(TILES_DIR, { idempotent: true });
    }

    // Remove flag de download
    await AsyncStorage.removeItem(OFFLINE_TILES_KEY);

    console.log('Offline tiles cleared');
  } catch (error) {
    console.error('Error clearing offline tiles:', error);
  }
}

/**
 * Obtém URI local de um tile (se existir)
 */
export async function getLocalTileUri(z: number, x: number, y: number): Promise<string | null> {
  try {
    const fileUri = `${TILES_DIR}${z}/${x}/${y}.png`;
    const fileInfo = await FileSystem.getInfoAsync(fileUri);

    if (fileInfo.exists) {
      return fileUri;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Calcula tamanho total dos tiles baixados (em MB)
 */
export async function getOfflineTilesSize(): Promise<number> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(TILES_DIR);
    if (!dirInfo.exists) return 0;

    // Função recursiva para calcular tamanho
    async function getDirSize(uri: string): Promise<number> {
      let totalSize = 0;
      
      try {
        const items = await FileSystem.readDirectoryAsync(uri);

        for (const item of items) {
          const itemUri = `${uri}${item}`;
          const itemInfo = await FileSystem.getInfoAsync(itemUri);

          if (itemInfo.exists && itemInfo.isDirectory) {
            totalSize += await getDirSize(`${itemUri}/`);
          } else if (itemInfo.exists && 'size' in itemInfo) {
            totalSize += itemInfo.size || 0;
          }
        }
      } catch (error) {
        console.error('Error reading directory:', error);
      }

      return totalSize;
    }

    const sizeBytes = await getDirSize(TILES_DIR);
    return Math.round(sizeBytes / (1024 * 1024)); // Retorna em MB
  } catch (error) {
    console.error('Error calculating tiles size:', error);
    return 0;
  }
}