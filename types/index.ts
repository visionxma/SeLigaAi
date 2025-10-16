export interface AlertPoint {
  id: string;
  alert_type: string;
  street: string;
  city: string;
  latitude: number;
  longitude: number;
  radius: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationHistoryItem {
  id: string;
  user_device_id: string;
  alert_point_id: string;
  alert_type: string;
  street: string;
  city: string;
  notified_at: string;
  created_at: string;
}
