import { type PaypalConfig, paypalConfig } from '@app/config';
import { RpcErrors } from '@app/filters';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { RpcException } from '@nestjs/microservices';

interface PaypalTokenResponse {
  access_token: string;
  expires_in: number;
}

interface PaypalLink {
  href: string;
  rel: string;
  method?: string;
}

interface PaypalCaptureResponse {
  id: string;
  status: string;
}

interface PaypalOrderResponse {
  id: string;
  status: string;
  links?: PaypalLink[];
  purchase_units?: {
    payments?: { captures?: PaypalCaptureResponse[] };
  }[];
}

export interface PaypalOrder {
  id: string;
  status: string;
  approveUrl: string | null;
  captureId: string | null;
}

export interface PaypalRefund {
  id: string;
  status: string;
}

const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export const PAYPAL_ALREADY_REFUNDED_STATUS = 'ALREADY_REFUNDED';

@Injectable()
export class PaypalService {
  private readonly logger = new Logger(PaypalService.name);

  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private accessTokenRequest: Promise<string> | null = null;

  constructor(
    @Inject(paypalConfig.KEY)
    private readonly config: PaypalConfig,
  ) {}

  async createOrder(referenceId: string, amount: number): Promise<PaypalOrder> {
    this.logger.log(
      `Creating PayPal order for ${referenceId}: ${amount} ${this.config.currency}`,
    );

    const response = await this.request<PaypalOrderResponse>(
      'POST',
      '/v2/checkout/orders',
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: referenceId,
            amount: {
              currency_code: this.config.currency,
              value: amount.toFixed(2),
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: 'PAY_NOW',
              return_url: this.config.returnUrl,
              cancel_url: this.config.cancelUrl,
            },
          },
        },
      },
    );

    this.logger.log(
      `Created PayPal order ${response.id} for ${referenceId} with status ${response.status}`,
    );
    return this.toPaypalOrder(response);
  }

  async captureOrder(paypalOrderId: string): Promise<PaypalOrder> {
    this.logger.log(`Capturing PayPal order ${paypalOrderId}`);

    const response = await this.request<PaypalOrderResponse>(
      'POST',
      `/v2/checkout/orders/${paypalOrderId}/capture`,
    );

    this.logger.log(
      `PayPal order ${paypalOrderId} capture finished with status ${response.status}`,
    );
    return this.toPaypalOrder(response);
  }

  async refundCapture(captureId: string): Promise<PaypalRefund> {
    this.logger.log(`Refunding PayPal capture ${captureId}`);

    const path = `/v2/payments/captures/${captureId}/refund`;
    const response = await this.fetchWithAuth('POST', path, {});

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      if (
        response.status === 422 &&
        details.includes('CAPTURE_FULLY_REFUNDED')
      ) {
        this.logger.warn(`PayPal capture ${captureId} is already refunded`);
        return { id: captureId, status: PAYPAL_ALREADY_REFUNDED_STATUS };
      }
      throw this.toRpcError('POST', path, response.status, details);
    }

    const refund = (await response.json()) as PaypalRefund;
    this.logger.log(
      `PayPal capture ${captureId} refund ${refund.id} finished with status ${refund.status}`,
    );
    return { id: refund.id, status: refund.status };
  }

  private toPaypalOrder(response: PaypalOrderResponse): PaypalOrder {
    const approveUrl =
      response.links?.find(
        ({ rel }) => rel === 'approve' || rel === 'payer-action',
      )?.href ?? null;
    const captureId =
      response.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
    return { id: response.id, status: response.status, approveUrl, captureId };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.fetchWithAuth(method, path, body);

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw this.toRpcError(method, path, response.status, details);
    }

    return (await response.json()) as T;
  }

  private async fetchWithAuth(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    if (!this.config.clientId || !this.config.clientSecret) {
      this.logger.error('PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is not set');
      throw RpcErrors.badRequest('PayPal payments are not configured');
    }

    const accessToken = await this.getAccessToken();
    return fetch(`${this.config.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  private toRpcError(
    method: string,
    path: string,
    status: number,
    details: string,
  ): RpcException {
    this.logger.error(
      `PayPal ${method} ${path} failed with status ${status}: ${details}`,
    );

    if (status === 401 || status === 403 || status >= 500) {
      return RpcErrors.badGateway(
        `PayPal request failed with status ${status}`,
      );
    }
    return RpcErrors.badRequest(`PayPal request failed with status ${status}`);
  }

  private getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return Promise.resolve(this.accessToken);
    }

    this.accessTokenRequest ??= this.fetchAccessToken().finally(() => {
      this.accessTokenRequest = null;
    });
    return this.accessTokenRequest;
  }

  private async fetchAccessToken(): Promise<string> {
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    const response = await fetch(`${this.config.apiUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      this.logger.error(
        `PayPal authentication failed with status ${response.status}`,
      );
      throw RpcErrors.badGateway('Failed to authenticate with PayPal');
    }

    const token = (await response.json()) as PaypalTokenResponse;
    this.accessToken = token.access_token;
    this.accessTokenExpiresAt =
      Date.now() + token.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS;

    return this.accessToken;
  }
}
