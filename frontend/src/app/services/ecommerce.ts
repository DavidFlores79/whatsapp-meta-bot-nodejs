import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface OrderItem {
  product_id: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface Order {
  _id: string;
  orderId: string;
  customer: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  items: OrderItem[];
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  total: number;
  createdAt: Date;
  updatedAt: Date;
  notes?: string;
}

export interface OrderResponse {
  success: boolean;
  count: number;
  orders: Order[];
}

export interface SendOrderUpdateResponse {
  success: boolean;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class EcommerceService {
  private apiUrl = '/api/v2/ecommerce';

  constructor(private http: HttpClient) {}

  /**
   * Get active orders for a customer by phone number
   */
  getActiveOrders(phoneNumber: string): Observable<OrderResponse> {
    return this.http.get<OrderResponse>(`${this.apiUrl}/orders/active/${phoneNumber}`);
  }

  /**
   * Send order update/summary to customer via WhatsApp
   */
  sendOrderUpdate(orderId: string, conversationId: string): Observable<SendOrderUpdateResponse> {
    return this.http.post<SendOrderUpdateResponse>(
      `${this.apiUrl}/orders/${orderId}/send-update`,
      { conversationId }
    );
  }
}
