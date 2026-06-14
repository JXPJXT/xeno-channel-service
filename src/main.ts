import * as http from 'http';
import * as crypto from 'crypto';

const PORT = parseInt(process.env.CHANNEL_PORT || '3001', 10);

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/deliver') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { logId, recipient, message, channel, callbackUrl } = payload;

        if (!logId || !recipient || !channel || !callbackUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Missing required fields: logId, recipient, channel, callbackUrl',
            }),
          );
          return;
        }

        const providerMessageId = crypto.randomUUID();
        console.log(
          `[Channel Service] Accepted delivery request for log ${logId} (Channel: ${channel}, Recipient: ${recipient})`,
        );

        // Send 202 Accepted immediately
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, providerMessageId }));

        // Start asynchronously simulating the delivery events lifecycle
        simulateLifecycle(logId, recipient, channel, callbackUrl, providerMessageId);
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload: ' + err.message }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'mock-channel-service' }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

function simulateLifecycle(
  logId: string,
  recipient: string,
  channel: string,
  callbackUrl: string,
  providerMessageId: string,
) {
  // Realism simulation: Fail if recipient string contains 'fail' or 5% chance
  const shouldFail = recipient.includes('fail') || Math.random() < 0.05;

  if (shouldFail) {
    // Event: FAILED (after 1s)
    setTimeout(async () => {
      await sendCallback(callbackUrl, {
        logId,
        providerMessageId,
        eventType: 'FAILED',
        errorCode: 'UNDELIVERABLE',
        errorMessage: 'Simulated carrier delivery failure',
        occurredAt: new Date().toISOString(),
      });
    }, 1000);
  } else {
    // Event 1: DELIVERED (after 1s)
    setTimeout(async () => {
      const deliveredSent = await sendCallback(callbackUrl, {
        logId,
        providerMessageId,
        eventType: 'DELIVERED',
        occurredAt: new Date().toISOString(),
      });

      if (!deliveredSent) return;

      // Event 2: OPENED (after 2s) - 60% probability
      if (Math.random() < 0.6) {
        setTimeout(async () => {
          const openedSent = await sendCallback(callbackUrl, {
            logId,
            providerMessageId,
            eventType: 'OPENED',
            occurredAt: new Date().toISOString(),
          });

          if (!openedSent) return;

          // Event 3: CLICKED (after 2s more) - 30% probability
          if (Math.random() < 0.3) {
            setTimeout(async () => {
              await sendCallback(callbackUrl, {
                logId,
                providerMessageId,
                eventType: 'CLICKED',
                occurredAt: new Date().toISOString(),
              });
            }, 2000);
          }
        }, 2000);
      }
    }, 1000);
  }
}

async function sendCallback(url: string, payload: any): Promise<boolean> {
  try {
    console.log(
      `[Channel Service] Dispatching callback ${payload.eventType} for log ${payload.logId} to ${url}`,
    );
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(
        `[Channel Service] Webhook callback failed with status ${res.status} for log ${payload.logId}`,
      );
      return false;
    }
    return true;
  } catch (err: any) {
    console.error(
      `[Channel Service] Error posting webhook callback for log ${payload.logId}: ${err.message}`,
    );
    return false;
  }
}

server.listen(PORT, () => {
  console.log(`🚀 Mock Channel Service listening on port ${PORT}`);
});
