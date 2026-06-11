import { Test } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { paypalConfig } from '@app/config';
import { PaypalService } from './paypal.service';

const API_URL = 'https://api.paypal.test';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function tokenResponse(accessToken = 'token-1'): Response {
  return jsonResponse({ access_token: accessToken, expires_in: 3600 });
}

describe('PaypalService', () => {
  let service: PaypalService;
  let fetchMock: jest.Mock;

  async function createService(
    config: Partial<ReturnType<typeof paypalConfig>> = {},
  ) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaypalService,
        {
          provide: paypalConfig.KEY,
          useValue: {
            apiUrl: API_URL,
            clientId: 'client-id',
            clientSecret: 'client-secret',
            currency: 'USD',
            returnUrl: 'https://gateway.test/return',
            cancelUrl: 'https://gateway.test/cancel',
            ...config,
          },
        },
      ],
    }).compile();

    return moduleRef.get(PaypalService);
  }

  beforeEach(async () => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    service = await createService();
  });

  describe('createOrder', () => {
    it('creates a CAPTURE order with the formatted amount and currency', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          jsonResponse({ id: 'pp-1', status: 'CREATED', links: [] }),
        );

      await service.createOrder('order-1', 20.5);

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/v2/checkout/orders`,
        expect.objectContaining({ method: 'POST' }),
      );
      const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: 'order-1',
            amount: { currency_code: 'USD', value: '20.50' },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: 'PAY_NOW',
              return_url: 'https://gateway.test/return',
              cancel_url: 'https://gateway.test/cancel',
            },
          },
        },
      });
    });

    it('returns the id, status and approve link of the PayPal order', async () => {
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
        jsonResponse({
          id: 'pp-1',
          status: 'CREATED',
          links: [
            { href: 'https://paypal.test/self', rel: 'self' },
            { href: 'https://paypal.test/approve', rel: 'approve' },
          ],
        }),
      );

      await expect(service.createOrder('order-1', 10)).resolves.toEqual({
        id: 'pp-1',
        status: 'CREATED',
        approveUrl: 'https://paypal.test/approve',
      });
    });

    it('returns the payer-action link as the approveUrl', async () => {
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
        jsonResponse({
          id: 'pp-1',
          status: 'PAYER_ACTION_REQUIRED',
          links: [
            { href: 'https://paypal.test/self', rel: 'self' },
            { href: 'https://paypal.test/checkoutnow', rel: 'payer-action' },
          ],
        }),
      );

      await expect(service.createOrder('order-1', 10)).resolves.toMatchObject({
        approveUrl: 'https://paypal.test/checkoutnow',
      });
    });

    it('returns a null approveUrl when PayPal sends no approve link', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse({ id: 'pp-1', status: 'CREATED' }));

      await expect(service.createOrder('order-1', 10)).resolves.toMatchObject({
        approveUrl: null,
      });
    });

    it('authenticates with basic credentials and reuses the cached token', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse({ id: 'pp-1', status: 'CREATED' }))
        .mockResolvedValueOnce(jsonResponse({ id: 'pp-2', status: 'CREATED' }));

      await service.createOrder('order-1', 10);
      await service.createOrder('order-2', 15);

      const tokenCalls = (
        fetchMock.mock.calls as [string, RequestInit][]
      ).filter(([url]) => url.endsWith('/v1/oauth2/token'));
      expect(tokenCalls).toHaveLength(1);
      const credentials = Buffer.from('client-id:client-secret').toString(
        'base64',
      );
      expect(tokenCalls[0][1].headers).toMatchObject({
        Authorization: `Basic ${credentials}`,
      });
    });

    it('throws RpcException when credentials are not configured', async () => {
      service = await createService({ clientId: '', clientSecret: '' });

      await expect(service.createOrder('order-1', 10)).rejects.toBeInstanceOf(
        RpcException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws RpcException when authentication fails', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));

      await expect(service.createOrder('order-1', 10)).rejects.toBeInstanceOf(
        RpcException,
      );
    });

    it('throws RpcException when PayPal responds with an error', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse({ name: 'INVALID_REQUEST' }, 422));

      await expect(service.createOrder('order-1', 10)).rejects.toBeInstanceOf(
        RpcException,
      );
    });
  });

  describe('captureOrder', () => {
    it('captures the PayPal order and returns its status', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          jsonResponse({ id: 'pp-1', status: 'COMPLETED' }),
        );

      await expect(service.captureOrder('pp-1')).resolves.toEqual({
        id: 'pp-1',
        status: 'COMPLETED',
        approveUrl: null,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/v2/checkout/orders/pp-1/capture`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws RpcException when the capture request fails', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          jsonResponse({ name: 'ORDER_NOT_APPROVED' }, 422),
        );

      await expect(service.captureOrder('pp-1')).rejects.toBeInstanceOf(
        RpcException,
      );
    });
  });
});
