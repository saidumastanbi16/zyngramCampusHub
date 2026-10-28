import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

const apiSchema = z.object({
  name: z.string().trim().min(2).max(100),
  identifier: z.string().trim().regex(/^[a-z][a-z0-9-]{2,62}$/),
  description: z.string().trim().max(1000).default(''),
  ownerModule: z.string().trim().min(2).max(80),
  baseUrl: z.string().trim().regex(/^\/(?!\/)[a-zA-Z0-9/_:-]*$/).max(200).default('/api'),
  endpointPath: z.string().trim().regex(/^\/(?!\/)[a-zA-Z0-9/_:-]*$/).max(200),
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
  version: z.string().trim().regex(/^v\d+(\.\d+){0,2}$/),
  environment: z.enum(['development', 'staging', 'production']),
  authRequired: z.boolean(),
  status: z.enum(['active', 'archived']).default('active'),
  parameters: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    location: z.enum(['query', 'path', 'header']),
    required: z.boolean().default(false),
    description: z.string().trim().max(500).default(''),
    example: z.string().max(500).optional()
  })).max(30).default([]),
  requestExample: z.record(z.string(), z.unknown()).default({}),
  responseExample: z.record(z.string(), z.unknown()).default({ ok: true }),
  errorCodes: z.array(z.object({
    status: z.enum(['400', '401', '403', '404', '405', '413', '429', '500']),
    description: z.string().trim().min(1).max(300)
  })).max(8).default([
    { status: '400', description: 'Invalid request input' },
    { status: '401', description: 'Authentication required' },
    { status: '403', description: 'Insufficient permission' },
    { status: '429', description: 'Rate limit exceeded where enforced' }
  ])
});
const consumerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(''),
  rateLimit: z.number().int().min(1).max(6000).default(60)
});
const apiMethods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
const defaultApis = [
  { name: 'Health check', identifier: 'campus-health', description: 'Reports the API and database health status.', owner_module: 'Platform', base_url: '/api', endpoint_path: '/health', method: 'GET', version: 'v1', environment: 'development', auth_required: false },
  { name: 'Campus dashboard', identifier: 'campus-dashboard', description: 'Returns role-aware dashboard data for the signed-in user.', owner_module: 'Dashboard', base_url: '/api', endpoint_path: '/dashboard', method: 'GET', version: 'v1', environment: 'development', auth_required: true },
  { name: 'Course catalogue', identifier: 'course-catalogue', description: 'Lists courses visible to the signed-in campus user.', owner_module: 'Academic courses', base_url: '/api', endpoint_path: '/courses', method: 'GET', version: 'v1', environment: 'development', auth_required: true },
  { name: 'Learner tasks', identifier: 'learner-tasks', description: 'Lists assignments visible to the signed-in campus user.', owner_module: 'Tasks & feedback', base_url: '/api', endpoint_path: '/tasks', method: 'GET', version: 'v1', environment: 'development', auth_required: true },
  { name: 'Attendance records', identifier: 'attendance-records', description: 'Lists attendance visible to the signed-in campus user.', owner_module: 'Attendance', base_url: '/api', endpoint_path: '/attendance', method: 'GET', version: 'v1', environment: 'development', auth_required: true },
  { name: 'Campus notifications', identifier: 'campus-notifications', description: 'Lists notifications for the signed-in campus user.', owner_module: 'Notifications', base_url: '/api', endpoint_path: '/notifications', method: 'GET', version: 'v1', environment: 'development', auth_required: true }
].map((api) => ({
  ...api,
  parameters: [],
  request_example: {},
  response_example: { ok: true },
  error_codes: [
    { status: '400', description: 'Invalid request input where applicable' },
    { status: '401', description: api.auth_required ? 'Campus session authentication required' : 'Not applicable' },
    { status: '403', description: api.auth_required ? 'Insufficient role permission' : 'Not applicable' },
    { status: '429', description: 'Rate limit exceeded where enforced' }
  ],
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  status: 'active'
}));

export async function initializeApiManagement(db) {
  const apis = db.collection('managed_apis');
  await Promise.all([
    apis.createIndex({ identifier: 1 }, { unique: true }),
    db.collection('api_consumers').createIndex({ name: 1 }, { unique: true }),
    db.collection('api_consumers').createIndex({ key_hash: 1 }, { unique: true, partialFilterExpression: { key_hash: { $type: 'string' } } }),
    db.collection('api_activity').createIndex({ created_at: -1 }),
    db.collection('api_activity').createIndex({ api_id: 1, created_at: -1 }),
    db.collection('api_activity').createIndex({ consumer_id: 1, created_at: -1 })
  ]);
  const now = new Date().toISOString();
  await Promise.all(defaultApis.map((api) => apis.updateOne(
    { identifier: api.identifier },
    { $setOnInsert: { ...api, created_at: now, updated_at: now } },
    { upsert: true }
  )));
  const firstPartyApis = await apis.find({ identifier: { $in: defaultApis.map((api) => api.identifier) } }, { projection: { _id: 1 } }).toArray();
  await db.collection('api_consumers').updateOne(
    { _id: 'campus-hub-web-app' },
    {
      $setOnInsert: {
        name: 'Campus Hub web application (built-in)',
        description: 'First-party browser client authenticated with the existing HTTP-only campus session.',
        rateLimit: 6000,
        status: 'active',
        permitted_api_ids: firstPartyApis.map((api) => String(api._id)),
        built_in: true,
        created_at: now,
        updated_at: now
      }
    },
    { upsert: true }
  );
}

function documentId(document) {
  const { _id, ...fields } = document;
  return { ...fields, id: String(_id) };
}
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}
function issueKey() {
  return `zch_${crypto.randomBytes(32).toString('base64url')}`;
}
function normalizeConsumer(consumer) {
  const { key_hash, key_prefix, ...safe } = documentId(consumer);
  return { ...safe, keyPrefix: key_prefix || null, hasKey: Boolean(key_hash) };
}
function routePath(api) {
  return `${api.base_url.replace(/\/$/, '')}${api.endpoint_path}`;
}
function registryIdFilter(id) {
  return ObjectId.isValid(id) ? { _id: { $in: [id, new ObjectId(id)] } } : { _id: id };
}

export function registerApiManagement({ app, db, requireUser, requireRoles, recordAudit }) {
  const apis = db.collection('managed_apis');
  const consumers = db.collection('api_consumers');
  const activity = db.collection('api_activity');
  const rateBuckets = new Map();

  app.use('/api', (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const requestApi = req.apiManagement?.api || null;
      const requestConsumer = req.apiManagement?.consumer || null;
      const firstPartyRequest = !req.apiManagement;
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const findApi = requestApi
        ? Promise.resolve(requestApi)
        : apis.findOne({ method: req.method, endpoint_path: req.path, status: 'active' });
      findApi.then((matchedApi) => {
        if (!matchedApi) return null;
        return activity.insertOne({
          api_id: matchedApi._id,
          api_identifier: matchedApi.identifier,
          consumer_id: requestConsumer?._id || (firstPartyRequest ? 'campus-hub-web-app' : null),
          consumer_name: requestConsumer?.name || (firstPartyRequest ? 'Campus Hub web application' : 'Unauthenticated API consumer'),
          method: req.method,
          endpoint: routePath(matchedApi),
          request_path: req.originalUrl.split('?')[0],
          response_status: res.statusCode,
          duration_ms: Math.max(0, Math.round(elapsedMs)),
          outcome: res.statusCode >= 400 ? 'failure' : 'success',
          created_at: new Date().toISOString()
        });
      }).catch((error) => console.error('API activity could not be recorded:', error));
    });
    next();
  });

  app.get('/api/admin/api-management/apis', requireUser, requireRoles('admin'), async (req, res) => {
    const parsed = z.object({
      search: z.string().max(200).optional().default(''),
      method: z.enum(apiMethods).optional(),
      status: z.enum(['active', 'archived']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(10)
    }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid API registry filters.' });
    const { search, method, status, page, limit } = parsed.data;
    const filter = {
      ...(method ? { method } : {}),
      ...(status ? { status } : {}),
      ...(search ? { $or: ['name', 'identifier', 'description', 'owner_module', 'endpoint_path'].map((field) => ({ [field]: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } })) } : {})
    };
    const [rows, total] = await Promise.all([
      apis.find(filter).sort({ updated_at: -1, name: 1 }).skip((page - 1) * limit).limit(limit).toArray(),
      apis.countDocuments(filter)
    ]);
    res.json({ items: rows.map(documentId), page, limit, total, pages: Math.ceil(total / limit) });
  });
  app.post('/api/admin/api-management/apis', requireUser, requireRoles('admin'), async (req, res) => {
    const parsed = apiSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter valid API details; the identifier must be unique and use lowercase letters, numbers, and hyphens.' });
    const now = new Date().toISOString();
    const { ownerModule, baseUrl, endpointPath, authRequired, requestExample, responseExample, errorCodes, ...fields } = parsed.data;
    const record = {
      ...fields, owner_module: ownerModule, base_url: baseUrl, endpoint_path: endpointPath,
      auth_required: authRequired, request_example: requestExample, response_example: responseExample,
      error_codes: errorCodes, created_at: now, updated_at: now
    };
    try {
      const inserted = await apis.insertOne(record);
      await recordAudit(req.user._id, 'api_registry.create', 'managed_api', inserted.insertedId, { identifier: record.identifier });
      res.status(201).json(documentId({ ...record, _id: inserted.insertedId }));
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ error: 'That API identifier is already registered.' });
      throw error;
    }
  });
  app.patch('/api/admin/api-management/apis/:id', requireUser, requireRoles('admin'), async (req, res) => {
    const parsed = apiSchema.partial().safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data || {}).length) return res.status(400).json({ error: 'Enter valid API details to update.' });
    const existing = await apis.findOne(registryIdFilter(req.params.id));
    if (!existing) return res.status(404).json({ error: 'API not found.' });
    const { ownerModule, baseUrl, endpointPath, authRequired, requestExample, responseExample, errorCodes, ...fields } = parsed.data;
    const update = {
      ...fields,
      ...(ownerModule !== undefined ? { owner_module: ownerModule } : {}),
      ...(baseUrl !== undefined ? { base_url: baseUrl } : {}),
      ...(endpointPath !== undefined ? { endpoint_path: endpointPath } : {}),
      ...(authRequired !== undefined ? { auth_required: authRequired } : {}),
      ...(requestExample !== undefined ? { request_example: requestExample } : {}),
      ...(responseExample !== undefined ? { response_example: responseExample } : {}),
      ...(errorCodes !== undefined ? { error_codes: errorCodes } : {}),
      updated_at: new Date().toISOString()
    };
    try {
      await apis.updateOne({ _id: existing._id }, { $set: update });
      await recordAudit(req.user._id, 'api_registry.update', 'managed_api', existing._id, { identifier: existing.identifier });
      res.json(documentId({ ...existing, ...update }));
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ error: 'That API identifier is already registered.' });
      throw error;
    }
  });
  app.delete('/api/admin/api-management/apis/:id', requireUser, requireRoles('admin'), async (req, res) => {
    const existing = await apis.findOne(registryIdFilter(req.params.id));
    if (!existing) return res.status(404).json({ error: 'API not found.' });
    await apis.updateOne({ _id: existing._id }, { $set: { status: 'archived', updated_at: new Date().toISOString() } });
    await recordAudit(req.user._id, 'api_registry.archive', 'managed_api', existing._id, { identifier: existing.identifier });
    res.json({ ok: true, status: 'archived' });
  });

  app.get('/api/admin/api-management/consumers', requireUser, requireRoles('admin'), async (_req, res) => {
    const rows = await consumers.find({}).sort({ created_at: -1 }).toArray();
    res.json(rows.map(normalizeConsumer));
  });
  app.post('/api/admin/api-management/consumers', requireUser, requireRoles('admin'), async (req, res) => {
    const parsed = consumerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a consumer name and a rate limit from 1 to 6,000 requests per minute.' });
    const now = new Date().toISOString();
    const record = {
      _id: `consumer-${crypto.randomUUID()}`, ...parsed.data, status: 'active',
      permitted_api_ids: [], created_at: now, updated_at: now
    };
    try {
      await consumers.insertOne(record);
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ error: 'A consumer with that name already exists.' });
      throw error;
    }
    await recordAudit(req.user._id, 'api_consumer.create', 'api_consumer', record._id);
    res.status(201).json(normalizeConsumer(record));
  });
  app.patch('/api/admin/api-management/consumers/:id', requireUser, requireRoles('admin'), async (req, res) => {
    const parsed = z.object({
      status: z.enum(['active', 'suspended']).optional(),
      rateLimit: z.number().int().min(1).max(6000).optional()
    }).strict().safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data || {}).length) return res.status(400).json({ error: 'Set an active or suspended status and/or a valid rate limit.' });
    const consumer = await consumers.findOne({ _id: req.params.id });
    if (!consumer) return res.status(404).json({ error: 'Consumer not found.' });
    if (consumer.built_in) return res.status(409).json({ error: 'The first-party session consumer cannot be changed here.' });
    const { rateLimit, ...fields } = parsed.data;
    const update = { ...fields, ...(rateLimit === undefined ? {} : { rateLimit }), updated_at: new Date().toISOString() };
    await consumers.updateOne({ _id: consumer._id }, { $set: update });
    if (parsed.data.status === 'suspended') {
      await consumers.updateOne({ _id: consumer._id }, { $unset: { key_hash: '', key_prefix: '' } });
      rateBuckets.delete(String(consumer._id));
    }
    await recordAudit(req.user._id, parsed.data.status === 'suspended' ? 'api_consumer.suspend_revoke' : 'api_consumer.policy_update', 'api_consumer', consumer._id, parsed.data);
    res.json(normalizeConsumer({ ...consumer, ...update, ...(parsed.data.status === 'suspended' ? { key_hash: undefined, key_prefix: undefined } : {}) }));
  });
  app.put('/api/admin/api-management/consumers/:id/permissions', requireUser, requireRoles('admin'), async (req, res) => {
    const parsed = z.object({ apiIds: z.array(z.string().min(1)).max(500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Choose valid API permissions.' });
    const consumer = await consumers.findOne({ _id: req.params.id });
    if (!consumer) return res.status(404).json({ error: 'Consumer not found.' });
    if (consumer.built_in) return res.status(409).json({ error: 'The first-party session consumer permissions are managed by the application.' });
    const distinctIds = [...new Set(parsed.data.apiIds)];
    const activeApiIds = new Set((await apis.find({ status: 'active' }, { projection: { _id: 1 } }).toArray()).map((api) => String(api._id)));
    if (distinctIds.some((id) => !activeApiIds.has(id))) return res.status(400).json({ error: 'Permissions can only be granted to active registered APIs.' });
    await consumers.updateOne({ _id: consumer._id }, { $set: { permitted_api_ids: distinctIds, updated_at: new Date().toISOString() } });
    await recordAudit(req.user._id, 'api_consumer.permissions_update', 'api_consumer', consumer._id, { api_ids: distinctIds });
    res.json({ ok: true, permitted_api_ids: distinctIds });
  });
  app.post('/api/admin/api-management/consumers/:id/key', requireUser, requireRoles('admin'), async (req, res) => {
    const consumer = await consumers.findOne({ _id: req.params.id });
    if (!consumer) return res.status(404).json({ error: 'Consumer not found.' });
    if (consumer.built_in) return res.status(409).json({ error: 'The first-party session consumer uses campus sessions, not API keys.' });
    if (consumer.status !== 'active') return res.status(409).json({ error: 'Activate this consumer before issuing a key.' });
    const key = issueKey();
    await consumers.updateOne({ _id: consumer._id }, { $set: { key_hash: hashKey(key), key_prefix: key.slice(0, 12), updated_at: new Date().toISOString() } });
    rateBuckets.delete(String(consumer._id));
    await recordAudit(req.user._id, 'api_consumer.key_issue_or_rotate', 'api_consumer', consumer._id);
    res.status(201).json({ key, message: 'Copy this key now. It cannot be retrieved again.' });
  });
  app.delete('/api/admin/api-management/consumers/:id/key', requireUser, requireRoles('admin'), async (req, res) => {
    const consumer = await consumers.findOne({ _id: req.params.id });
    if (!consumer) return res.status(404).json({ error: 'Consumer not found.' });
    if (consumer.built_in) return res.status(409).json({ error: 'The first-party session consumer does not have an API key to revoke.' });
    await consumers.updateOne({ _id: consumer._id }, {
      $set: { updated_at: new Date().toISOString() },
      $unset: { key_hash: '', key_prefix: '' }
    });
    rateBuckets.delete(String(consumer._id));
    await recordAudit(req.user._id, 'api_consumer.key_revoke', 'api_consumer', consumer._id);
    res.json({ ok: true });
  });

  app.get('/api/admin/api-management/analytics', requireUser, requireRoles('admin'), async (_req, res) => {
    const [total, failures, recent] = await Promise.all([
      activity.countDocuments({}),
      activity.countDocuments({ outcome: 'failure' }),
      activity.find({}).sort({ created_at: -1 }).limit(50).toArray()
    ]);
    res.json({
      totalRequests: total,
      failedRequests: failures,
      errorRate: total ? Math.round((failures / total) * 10000) / 100 : 0,
      recent: recent.map(documentId)
    });
  });
  app.get('/api/admin/api-management/openapi.json', requireUser, requireRoles('admin'), async (_req, res) => {
    const rows = await apis.find({ status: 'active' }).sort({ endpoint_path: 1, method: 1 }).toArray();
    const paths = {};
    for (const api of rows) {
      const path = routePath(api);
      paths[path] ||= {};
      paths[path][api.method.toLowerCase()] = {
        operationId: api.identifier,
        summary: api.name,
        description: api.description,
        tags: [api.owner_module],
        parameters: (api.parameters || []).map((parameter) => ({
          name: parameter.name,
          in: parameter.location,
          required: parameter.required,
          description: parameter.description,
          schema: { type: 'string', ...(parameter.example === undefined ? {} : { example: parameter.example }) }
        })),
        security: api.auth_required ? [{ campusSession: [] }] : [],
        ...(['POST', 'PUT', 'PATCH'].includes(api.method) ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' }, example: api.request_example || {} } }
          }
        } : {}),
        responses: {
          '200': { description: 'Successful response', content: { 'application/json': { schema: { type: 'object' }, example: api.response_example || { ok: true } } } },
          ...Object.fromEntries((api.error_codes || []).map(({ status, description }) => [status, { description }]))
        }
      };
    }
    const gatewayOperation = {
      summary: 'Controlled API-key demonstration gateway',
      description: 'Authenticates a consumer key, checks the registered API permission and per-consumer rate limit, and returns a controlled mock response. It does not proxy to Campus Hub session routes.',
      tags: ['API Management demonstration'],
      parameters: [{ name: 'identifier', in: 'path', required: true, schema: { type: 'string' } }],
      security: [{ apiKeyDemo: [] }],
      responses: {
        '200': { description: 'Controlled demonstration response', content: { 'application/json': { example: { ok: true, message: 'Controlled API Management demonstration response.' } } } },
        '401': { description: 'Missing, invalid, revoked, or suspended API key' },
        '403': { description: 'Consumer lacks permission for the registered API' },
        '404': { description: 'API registration not found or archived' },
        '405': { description: 'Request method does not match the API registration' },
        '429': { description: 'Consumer rate limit exceeded' }
      }
    };
    paths['/api/managed/{identifier}'] = Object.fromEntries(apiMethods.map((method) => [
      method.toLowerCase(), { ...gatewayOperation, operationId: `managedApiKeyDemo${method}` }
    ]));
    res.json({
      openapi: '3.0.3',
      info: { title: 'Zyngram Campus Hub API', version: '1.0.0', description: 'Generated from registered routes verified in the Campus Hub Express server.' },
      servers: [{ url: '/' }],
      components: { securitySchemes: {
        campusSession: { type: 'apiKey', in: 'cookie', name: 'campus_session' },
        apiKeyDemo: { type: 'apiKey', in: 'header', name: 'X-API-Key' }
      } },
      paths
    });
  });

  app.all('/api/managed/:identifier', async (req, res) => {
    const api = await apis.findOne({ identifier: req.params.identifier, status: 'active' });
    if (!api) return res.status(404).json({ error: 'Managed API not found.' });
    if (!apiMethods.includes(req.method)) return res.status(405).json({ error: 'HTTP method is not supported.' });
    req.apiManagement = { api, consumer: null };
    if (req.method !== api.method) return res.status(405).json({ error: `Use ${api.method} for this registered API.` });
    if (!api.auth_required) {
      return res.json({ ok: true, api: api.identifier, message: 'Controlled API Management demonstration endpoint.' });
    }
    const key = req.get('x-api-key');
    if (!key || key.length > 200) return res.status(401).json({ error: 'A valid X-API-Key credential is required.' });
    const consumer = await consumers.findOne({ key_hash: hashKey(key), status: 'active' });
    if (!consumer) return res.status(401).json({ error: 'API key is invalid, revoked, or suspended.' });
    req.apiManagement.consumer = consumer;
    if (!consumer.permitted_api_ids.includes(String(api._id))) {
      return res.status(403).json({ error: 'This consumer does not have permission to access this API.' });
    }
    const now = Date.now();
    const bucket = rateBuckets.get(String(consumer._id));
    if (!bucket || now - bucket.startedAt >= 60_000) {
      rateBuckets.set(String(consumer._id), { startedAt: now, count: 1 });
    } else {
      if (bucket.count >= consumer.rateLimit) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((60_000 - (now - bucket.startedAt)) / 1000))));
        return res.status(429).json({ error: 'Consumer request limit exceeded. Try again after the current 60-second window.' });
      }
      bucket.count += 1;
    }
    res.json({
      ok: true, api: api.identifier, consumer: consumer.name,
      message: 'Controlled API Management demonstration response.',
      example: { method: api.method, endpoint: routePath(api), note: 'This gateway route demonstrates API-key permissions and rate limiting; it does not proxy to the Campus Hub session endpoint.' }
    });
  });
}
