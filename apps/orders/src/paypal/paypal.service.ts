import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { paypalConfig } from '@app/config';
import { RpcErrors } from '@app/filters';

interface PaypalTokenResponse {
  access_token: string;
  expires_in: number;
}

interface PaypalLink {
  href: string;
  rel: string;
  method?: string;
}

interface PaypalOrderResponse {
  id: string;
  status: string;
  links?: PaypalLink[];
}

export interface PaypalOrder {
  id: string;
  status: string;
  approveUrl: string | null;
}

const TOKEN_EXPIRY_MARGIN_MS = 60_000;

@Injectable()
export class PaypalService {
  private readonly logger = new Logger(PaypalService.name);

  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(
    @Inject(paypalConfig.KEY)
    private readonly config: ConfigType<typeof paypalConfig>,
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

  private toPaypalOrder(response: PaypalOrderResponse): PaypalOrder {
    const approveUrl =
      response.links?.find(({ rel }) => rel === 'approve')?.href ?? null;
    return { id: response.id, status: response.status, approveUrl };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.config.clientId || !this.config.clientSecret) {
      this.logger.error('PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is not set');
      throw RpcErrors.badRequest('PayPal payments are not configured');
    }

    const accessToken = await this.getAccessToken();
    const response = await fetch(`${this.config.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      this.logger.error(
        `PayPal ${method} ${path} failed with status ${response.status}: ${details}`,
      );
      throw RpcErrors.badRequest(
        `PayPal request failed with status ${response.status}`,
      );
    }

    return (await response.json()) as T;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken;
    }

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
      throw RpcErrors.badRequest('Failed to authenticate with PayPal');
    }

    const token = (await response.json()) as PaypalTokenResponse;
    this.accessToken = token.access_token;
    this.accessTokenExpiresAt =
      Date.now() + token.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS;

    return this.accessToken;
  }
}
