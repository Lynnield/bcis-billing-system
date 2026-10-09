/**
 * Payment API integration via IPC.
 */

import type {
  PaymentListResponse,
  PaymentDetailResponse,
  PaymentCreateResponse,
  ReversePaymentResponse,
  VerifyPaymentResponse,
  RejectPaymentResponse,
  CreatePaymentRequest,
  PaymentStatus,
} from "@/shared/types";

export async function getPayments(params: {
  page?: number;
  pageSize?: number;
  serviceAccountId?: number;
  status?: PaymentStatus;
}): Promise<PaymentListResponse> {
  return window.bcis.payments.getList(params);
}

export async function getPaymentById(id: number): Promise<PaymentDetailResponse> {
  return window.bcis.payments.getById(id);
}

export async function createPayment(data: CreatePaymentRequest): Promise<PaymentCreateResponse> {
  return window.bcis.payments.create(data);
}

export async function reversePayment(id: number, reason: string): Promise<ReversePaymentResponse> {
  return window.bcis.payments.reverse(id, reason);
}

export async function verifyGcashPayment(id: number, note?: string): Promise<VerifyPaymentResponse> {
  return window.bcis.payments.verify(id, note);
}

export async function rejectGcashPayment(id: number, reason: string): Promise<RejectPaymentResponse> {
  return window.bcis.payments.reject(id, reason);
}
