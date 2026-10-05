import { FeesTab } from '../deliveries/FeesTab';

/**
 * Settings -> Delivery fees: default fee, delivery estimate, and area fee overrides.
 * Reuses the FeesTab component so delivery settings can be managed directly in Settings.
 */
export function DeliveryTab() {
  return <DeliveryTabContent />;
}

export function DeliveryTabContent() {
  return <FeesTab />;
}
