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

function unreadableErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new Error('read failed')),
    text: () => Promise.reject(new Error('read failed')),
  } as Response;
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
        captureId: null,
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

    it('throws RpcException when the error body cannot be read', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(unreadableErrorResponse(422));

      await expect(service.createOrder('order-1', 10)).rejects.toBeInstanceOf(
        RpcException,
      );
    });

    it('maps a PayPal server error to a 502 Bad Gateway', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse({ name: 'INTERNAL_ERROR' }, 500));

      const error: unknown = await service
        .createOrder('order-1', 10)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toMatchObject({
        statusCode: 502,
      });
    });

    it('requests the token only once for concurrent calls', async () => {
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          url.endsWith('/v1/oauth2/token')
            ? tokenResponse()
            : jsonResponse({ id: 'pp-1', status: 'CREATED' }),
        ),
      );

      await Promise.all([
        service.createOrder('order-1', 10),
        service.createOrder('order-2', 15),
      ]);

      const tokenCalls = (fetchMock.mock.calls as [string][]).filter(([url]) =>
        url.endsWith('/v1/oauth2/token'),
      );
      expect(tokenCalls).toHaveLength(1);
    });
  });

  describe('captureOrder', () => {
    it('captures the PayPal order and returns its status and capture id', async () => {
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
        jsonResponse({
          id: 'pp-1',
          status: 'COMPLETED',
          purchase_units: [
            { payments: { captures: [{ id: 'cap-1', status: 'COMPLETED' }] } },
          ],
        }),
      );

      await expect(service.captureOrder('pp-1')).resolves.toEqual({
        id: 'pp-1',
        status: 'COMPLETED',
        approveUrl: null,
        captureId: 'cap-1',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/v2/checkout/orders/pp-1/capture`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('returns a null captureId when the response has no captures', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          jsonResponse({ id: 'pp-1', status: 'COMPLETED' }),
        );

      await expect(service.captureOrder('pp-1')).resolves.toMatchObject({
        captureId: null,
      });
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

  describe('refundCapture', () => {
    it('refunds the capture and returns the refund status', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          jsonResponse({ id: 'ref-1', status: 'COMPLETED' }),
        );

      await expect(service.refundCapture('cap-1')).resolves.toEqual({
        id: 'ref-1',
        status: 'COMPLETED',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/v2/payments/captures/cap-1/refund`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('treats an already refunded capture as a successful refund', async () => {
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
        jsonResponse(
          {
            name: 'UNPROCESSABLE_ENTITY',
            details: [{ issue: 'CAPTURE_FULLY_REFUNDED' }],
          },
          422,
        ),
      );

      await expect(service.refundCapture('cap-1')).resolves.toEqual({
        id: 'cap-1',
        status: 'ALREADY_REFUNDED',
      });
    });

    it('throws RpcException when the 422 error body cannot be read', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(unreadableErrorResponse(422));

      await expect(service.refundCapture('cap-1')).rejects.toBeInstanceOf(
        RpcException,
      );
    });

    it('throws RpcException when the refund request fails', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse({ name: 'INVALID_REQUEST' }, 422));

      await expect(service.refundCapture('cap-1')).rejects.toBeInstanceOf(
        RpcException,
      );
    });
  });
});
