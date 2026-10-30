# Bruno SSE walkthrough

1. Start the backend from the repository root: `pnpm docker:up`.
2. In Bruno, choose **Open Collection** and select this `bruno` folder.
3. Select the **Local** environment. Update its email/password if the default seeded admin credentials were changed.
4. Send **01 Login**. Its script captures the access/refresh tokens as runtime variables, without saving them to collection files.
5. Send **02 Watch SSE** and leave it running. Expect `ready`, then `heartbeat` about every 15 seconds.
6. In other request tabs, send **03–11** in order. These requests clear the current cart, create test data, place and cancel an order, and delete the test product. Product/order IDs are captured automatically.
7. Send **12 Logout** last to verify that the stream closes. **13 Reject unauthenticated SSE** independently checks HTTP 401.

The stream uses `Accept: text/event-stream` and disables its request timeout.
Bruno displays notifications in the response panel; use **Cancel** to stop it.
After expiry or logout, log in again and resend **Watch SSE** manually.

Expected events:

| Request | SSE event |
| --- | --- |
| Clear/add/update cart | `cart.updated` with `{}` |
| Create order | `order.created` with `{ "orderId": "..." }`, followed independently by `cart.updated` |
| Cancel order | `order.cancelled` with `{ "orderId": "..." }` |

SSE notifications contain refresh hints, not full resources. Use **Get order** and
**Get cart** to inspect current data. Repeated events are harmless. Product CRUD
has no SSE feed in this release. Payment/shipping tests require a real captured
PayPal sandbox payment and are outside this walkthrough.

Run these requests manually to observe the open stream. Bruno's Collection Runner
and CLI skip requests with `Accept: text/event-stream`; the walkthrough also has
side effects, including clearing your current user's cart. Use a development account.

To verify user isolation, open a second copy of Watch SSE with a different user's
bearer token entered directly in its Authorization header. Changes made by your
first user should not appear in that stream.

References: [Bruno SSE](https://docs.usebruno.com/send-requests/REST/sse),
[script variables](https://docs.usebruno.com/testing/script/javascript-reference).
