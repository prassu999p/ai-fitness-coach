export type EquipmentCategory = 'free_weights' | 'machines' | 'cardio' | 'accessories'

export interface EquipmentItem {
  name: string
  category: EquipmentCategory
}

export const EQUIPMENT_CATEGORIES: Record<EquipmentCategory, string> = {
  free_weights: 'Free Weights',
  machines: 'Machines',
  cardio: 'Cardio',
  accessories: 'Accessories',
}

export const EQUIPMENT_CATALOG: EquipmentItem[] = [
  { name: 'Barbell', category: 'free_weights' },
  { name: 'Dumbbells', category: 'free_weights' },
  { name: 'EZ-bar', category: 'free_weights' },
  { name: 'Kettlebells', category: 'free_weights' },
  { name: 'Plates', category: 'free_weights' },
  { name: 'Bench', category: 'free_weights' },
  { name: 'Rack', category: 'free_weights' },

  { name: 'Smith Machine', category: 'machines' },
  { name: 'Cables', category: 'machines' },
  { name: 'Lat Pulldown', category: 'machines' },
  { name: 'Leg Press', category: 'machines' },
  { name: 'Leg Curl', category: 'machines' },
  { name: 'Leg Extension', category: 'machines' },
  { name: 'Hack Squat', category: 'machines' },
  { name: 'Pec Deck', category: 'machines' },
  { name: 'Chest Press', category: 'machines' },
  { name: 'Row Machine', category: 'machines' },
  { name: 'Hyperextension', category: 'machines' },

  { name: 'Treadmill', category: 'cardio' },
  { name: 'Stationary Bike', category: 'cardio' },
  { name: 'Rowing Machine', category: 'cardio' },
  { name: 'Stairmaster', category: 'cardio' },
  { name: 'Assault Bike', category: 'cardio' },
  { name: 'Elliptical', category: 'cardio' },

  { name: 'Pull-up Bar', category: 'accessories' },
  { name: 'Dip Bars', category: 'accessories' },
  { name: 'Resistance Bands', category: 'accessories' },
  { name: 'TRX', category: 'accessories' },
  { name: 'Battle Ropes', category: 'accessories' },
  { name: 'Medicine Balls', category: 'accessories' },
  { name: 'Foam Roller', category: 'accessories' },
  { name: 'Box', category: 'accessories' },
]

export function isPreset(name: string): boolean {
  const lower = name.toLowerCase()
  return EQUIPMENT_CATALOG.some(item => item.name.toLowerCase() === lower)
}
