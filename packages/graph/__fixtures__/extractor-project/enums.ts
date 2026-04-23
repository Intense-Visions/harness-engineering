export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export const PaymentMethod = {
  CREDIT_CARD: 'credit_card',
  DEBIT_CARD: 'debit_card',
  PAYPAL: 'paypal',
  BANK_TRANSFER: 'bank_transfer',
} as const;

export type UserRole = 'admin' | 'editor' | 'viewer' | 'guest';

export enum Priority {
  LOW,
  MEDIUM,
  HIGH,
  CRITICAL,
}
