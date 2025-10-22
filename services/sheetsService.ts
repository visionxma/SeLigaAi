import { AlertPoint } from '@/types';
import { saveAlertPoints } from './storageService';

// ✅ IMPORTANTE: Configure sua planilha do Google Sheets como "Público" 
// e cole o ID da planilha aqui
const SHEET_ID: string = '1UWV6NZfn2c_47A0ea8dAVFs6HA-D3ArFHv4LA5FLfeo';

// URL da API do Google Sheets (não requer autenticação para sheets públicos)
// ✅ IMPORTANTE: Use o nome EXATO da aba da sua planilha (URL encoded)
const SHEET_NAME = encodeURIComponent('SE LIGA AÍ - Pontos de Alerta');
const SHEETS_API_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;

/**
 * Busca os pontos de alerta da planilha do Google Sheets
 * 
 * Formato esperado da planilha (colunas):
 * A: alert_type (ex: "Área de Assalto")
 * B: street (ex: "Avenida Getúlio Vargas")
 * C: city (ex: "Pedreiras")
 * D: latitude (ex: -4.5667)
 * E: longitude (ex: -44.6)
 * F: radius (ex: 200)
 */
export async function fetchAlertPointsFromSheets(): Promise<AlertPoint[]> {
  try {
    console.log('Fetching alert points from Google Sheets...');
    console.log('Using Sheet ID:', SHEET_ID);

    const response = await fetch(SHEETS_API_URL);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();
    
    // Remove o prefixo que o Google adiciona
    const jsonString = text.substring(47).slice(0, -2);
    const data = JSON.parse(jsonString);

    const rows = data.table.rows;
    const alertPoints: AlertPoint[] = [];

    // Pula a primeira linha (cabeçalho)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // Verifica se a linha tem dados
      if (!row.c || !row.c[0] || !row.c[0].v) continue;

      try {
        const alertPoint: AlertPoint = {
          id: `sheet_${i}_${Date.now()}`,
          alert_type: row.c[0]?.v || 'Alerta',
          street: row.c[1]?.v || '',
          city: row.c[2]?.v || '',
          latitude: parseFloat(row.c[3]?.v || '0'),
          longitude: parseFloat(row.c[4]?.v || '0'),
          radius: parseInt(row.c[5]?.v || '100'),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Valida se tem coordenadas válidas
        if (alertPoint.latitude !== 0 && alertPoint.longitude !== 0) {
          alertPoints.push(alertPoint);
        }
      } catch (error) {
        console.error(`Error parsing row ${i}:`, error);
      }
    }

    console.log(`Successfully fetched ${alertPoints.length} alert points from Sheets`);
    return alertPoints;

  } catch (error) {
    console.error('Error fetching from Google Sheets:', error);
    throw error;
  }
}

/**
 * Sincroniza os pontos de alerta do Google Sheets com o storage local
 */
export async function syncAlertPointsFromSheets(): Promise<boolean> {
  try {
    const points = await fetchAlertPointsFromSheets();
    
    if (points.length > 0) {
      await saveAlertPoints(points);
      console.log('Alert points synced successfully');
      return true;
    }
    
    console.warn('No alert points found in Google Sheets');
    return false;
  } catch (error) {
    console.error('Error syncing alert points:', error);
    return false;
  }
}

/**
 * Verifica se o Google Sheets está configurado corretamente
 * ✅ CORRIGIDO: Agora verifica se o ID NÃO é vazio e tem tamanho mínimo
 */
export function isSheetsConfigured(): boolean {
  const isConfigured = SHEET_ID !== '' && SHEET_ID.length > 10;
  console.log('Sheets configured:', isConfigured, 'ID:', SHEET_ID);
  return isConfigured;
}

/**
 * Retorna o URL da planilha para o usuário visualizar
 */
export function getSheetsUrl(): string {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
}