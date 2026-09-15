export type Role = 'PEMBELI' | 'KASIR' | 'CHEF' | 'FINANCE' | 'ADMIN' | 'SUPERADMIN';
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  mustChangePassword: boolean;
  isActive: boolean;
  loyaltyPoints?: number;
}
export interface Category {
  id: string;
  name: string;
}
export interface Menu {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  isAvailable: boolean;
  imageUrl: string | null;
  categoryId: string;
  category: Category;
}
export interface Order {
  id: string;
  number: number;
  customerName: string;
  tableNumber: string | null;
  orderType: string;
  status: string;
  totalPrice: number;
  createdAt: string;
  items: { id: string; name: string; qty: number; note?: string; subtotal: number }[];
  payment?: { method: string; status: string; amount: number };
  trackingToken?: string;
}
export interface Settings {
  storeName: string;
  address: string;
  contact: string;
  openingHours: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  iconUrl: string | null;
  bankInfo: string;
  qrisUrl: string | null;
}
export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}
