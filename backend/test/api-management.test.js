import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ||= 'mongodb://localhost:27017/';
process.env.MONGODB_DATABASE = `zyngram_api_management_test_${process.pid}`;
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
process.env.MAIL_HOST = '';
process.env.MAIL_USER = '';
process.env.MAIL_PASSWORD = '';
process.env.MAIL_FROM = '';
process.env.ADMIN_NOTIFICATION_EMAIL = '';
const { app, client, db } = await import('../server/index.js');

const password = 'api-management-test-password';
function passwordHash(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(value, salt, 64).toString('hex')}`;
}

let server;
let base;
let adminCookie;
before(async () => {
  await db.collection('users').updateOne(
    { _id: 'api-management-admin' },
    { $set: { _id: 'api-management-admin', name: 'API Admin', email: 'api-admin@example.test', role: 'admin', password_hash: passwordHash(password) } },
    { upsert: true }
  );
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
  const login = await request('/auth/login', { method: 'POST', body: { email: 'api-admin@example.test', password, role: 'admin' } });
  assert.equal(login.status, 200);
  adminCookie = login.cookie;
  assert.ok(adminCookie, 'Admin login should issue a session cookie.');
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.dropDatabase();
  await client.close();
});

async function request(path, { method = 'GET', body, cookie = adminCookie, key } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { 'X-API-Key': key } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
    cookie: response.headers.get('set-cookie')?.split(';')[0]
  };
}

test('registry, hashed consumer keys, permissions, rate limits, revocation, and monitoring', async () => {
  assert.equal((await request('/admin/api-management/apis', { cookie: '' })).status, 401);
  assert.equal((await request('/admin/api-management/apis', {
    method: 'POST',
    body: { name: 'Invalid API', identifier: 'bad', ownerModule: 'Test', endpointPath: 'no-leading-slash', method: 'BREW' }
  })).status, 400);
  const duplicate = await request('/admin/api-management/apis', {
    method: 'POST',
    body: {
      name: 'Duplicate API', identifier: 'course-catalogue', description: 'duplicate', ownerModule: 'Academics',
      baseUrl: '/api', endpointPath: '/duplicate', method: 'GET', version: 'v1',
      environment: 'development', authRequired: true
    }
  });
  assert.equal(duplicate.status, 409, JSON.stringify(duplicate.body));

  const createdApi = await request('/admin/api-management/apis', {
    method: 'POST',
    body: {
      name: 'Test gateway API', identifier: 'test-gateway-api', description: 'Controlled security test endpoint.',
      ownerModule: 'Test module', baseUrl: '/api', endpointPath: '/managed/test-gateway-api',
      method: 'GET', version: 'v1', environment: 'development', authRequired: true,
      parameters: [{ name: 'scope', location: 'query', required: false, description: 'Requested scope', example: 'active' }],
      responseExample: { ok: true, data: [] },
      errorCodes: [{ status: '401', description: 'Credential required' }, { status: '403', description: 'Permission denied' }]
    }
  });
  assert.equal(createdApi.status, 201);
  const apiId = createdApi.body.id;
  assert.equal((await request('/managed/test-gateway-api', { cookie: '' })).status, 401);
  assert.equal((await request('/managed/test-gateway-api', { cookie: '', key: 'invalid-key' })).status, 401);

  const createdConsumer = await request('/admin/api-management/consumers', {
    method: 'POST',
    body: { name: 'Test consumer', description: 'API management test client', rateLimit: 2 }
  });
  assert.equal(createdConsumer.status, 201);
  const consumerId = createdConsumer.body.id;
  const issued = await request(`/admin/api-management/consumers/${consumerId}/key`, { method: 'POST', body: {} });
  assert.equal(issued.status, 201);
  const key = issued.body.key;
  const storedConsumer = await db.collection('api_consumers').findOne({ _id: consumerId });
  assert.equal(storedConsumer.key_hash, crypto.createHash('sha256').update(key).digest('hex'));
  assert.equal(storedConsumer.key_hash.includes(key), false);
  assert.equal(storedConsumer.rateLimit, 2);
  const listedConsumers = await request('/admin/api-management/consumers');
  assert.equal(listedConsumers.body.find((consumer) => consumer.id === consumerId).key, undefined);
  assert.ok(listedConsumers.body.some((consumer) => consumer.id === 'campus-hub-web-app'));

  assert.equal((await request('/managed/test-gateway-api', { cookie: '', key })).status, 403);
  assert.equal((await request(`/admin/api-management/consumers/${consumerId}/permissions`, {
    method: 'PUT', body: { apiIds: [apiId] }
  })).status, 200);
  assert.equal((await request('/managed/test-gateway-api', { cookie: '', key })).status, 200);
  assert.equal((await request('/managed/test-gateway-api', { cookie: '', key })).status, 200);
  const limited = await request('/managed/test-gateway-api', { cookie: '', key });
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));

  assert.equal((await request(`/admin/api-management/consumers/${consumerId}`, {
    method: 'PATCH', body: { status: 'suspended' }
  })).status, 200);
  assert.equal((await request('/managed/test-gateway-api', { cookie: '', key })).status, 401);
  assert.equal((await db.collection('api_consumers').findOne({ _id: consumerId })).key_hash, undefined);

  const spec = await request('/admin/api-management/openapi.json');
  assert.equal(spec.status, 200);
  assert.ok(spec.body.paths['/api/courses']);
  assert.equal(spec.body.paths['/api/managed/test-gateway-api'].get.parameters[0].name, 'scope');
  assert.deepEqual(spec.body.paths['/api/managed/test-gateway-api'].get.responses['200'].content['application/json'].example, { ok: true, data: [] });
  assert.ok(spec.body.paths['/api/managed/{identifier}'].get.security[0].apiKeyDemo);
  assert.equal((await request(`/admin/api-management/apis/${apiId}`, { method: 'DELETE' })).body.status, 'archived');
  const activityRows = await db.collection('api_activity').find({ api_identifier: 'test-gateway-api' }).toArray();
  assert.ok(activityRows.some((entry) => entry.response_status === 200));
  assert.ok(activityRows.some((entry) => entry.response_status === 401));
  assert.ok(activityRows.some((entry) => entry.response_status === 403));
  assert.ok(activityRows.some((entry) => entry.response_status === 429));
  const analytics = await request('/admin/api-management/analytics');
  assert.equal(analytics.status, 200);
  assert.ok(analytics.body.totalRequests >= activityRows.length);
  const audit = await db.collection('audit_log').find({ entity: { $in: ['managed_api', 'api_consumer'] } }).toArray();
  assert.ok(audit.some((entry) => entry.action === 'api_registry.create'));
  assert.ok(audit.some((entry) => entry.action === 'api_consumer.key_issue_or_rotate'));
  assert.ok(audit.some((entry) => entry.action === 'api_consumer.permissions_update'));
  assert.ok(audit.some((entry) => entry.action === 'api_consumer.suspend_revoke'));
});
