import { useCallback, useEffect, useState } from 'react';
import { Activity, Archive, BookOpen, Check, Copy, KeyRound, Plus, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import { apiUrl } from './api-base.js';

async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The API management request failed.');
  return result;
}

const emptyApi = {
  name: '', identifier: '', description: '', ownerModule: '', baseUrl: '/api', endpointPath: '',
  method: 'GET', version: 'v1', environment: 'development', authRequired: true, status: 'active',
  parametersText: '[]', requestExampleText: '{}', responseExampleText: '{\n  "ok": true\n}',
  errorCodesText: '[\n  { "status": "400", "description": "Invalid request input" },\n  { "status": "401", "description": "Authentication required" },\n  { "status": "403", "description": "Insufficient permission" },\n  { "status": "429", "description": "Rate limit exceeded where enforced" }\n]'
};
const methods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

function OpenApiDocumentation({ specification, search, setSearch, loading, onRefresh }) {
  const operations = Object.entries(specification?.paths || {}).flatMap(([path, pathOperations]) =>
    Object.entries(pathOperations).map(([method, operation]) => ({ path, method, ...operation }))
  ).filter((operation) =>
    `${operation.path} ${operation.summary || ''} ${operation.description || ''} ${(operation.tags || []).join(' ')}`
      .toLowerCase().includes(search.toLowerCase())
  );
  const serverUrl = specification?.servers?.[0]?.url || '/';

  return <section className="api-documentation">
    <div className="api-docs-header panel">
      <div><p className="eyebrow">OPENAPI {specification?.openapi || '3.0'}</p><h2>{specification?.info?.title || 'Campus Hub API'}</h2><p>{specification?.info?.description}</p><small>Version {specification?.info?.version} · Server {serverUrl}</small></div>
      <button className="button-secondary" onClick={onRefresh}><RefreshCw size={14} /> Refresh specification</button>
    </div>
    <div className="api-docs-toolbar">
      <div className="api-search"><Search size={15} /><input aria-label="Search API documentation" placeholder="Search endpoints, modules, or descriptions" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <a className="button-secondary" href="/api/admin/api-management/openapi.json" target="_blank" rel="noreferrer">View raw JSON</a>
    </div>
    {loading && <div className="panel empty-state">Loading API documentation…</div>}
    {!loading && operations.length === 0 && <div className="panel empty-state">{specification ? 'No endpoints match your search.' : 'API documentation could not be loaded.'}</div>}
    {!loading && <div className="api-doc-operation-list">{operations.map((operation, index) => {
      const responses = Object.entries(operation.responses || {});
      const security = operation.security?.length ? operation.security.flatMap((entry) => Object.keys(entry)).map((name) => specification.components?.securitySchemes?.[name]?.name || name).join(', ') : 'No authentication required';
      const requestContent = operation.requestBody?.content?.['application/json'];
      const isGateway = operation.path.startsWith('/api/managed/{identifier}');
      const previousIsGateway = index > 0 && operations[index - 1].path.startsWith('/api/managed/{identifier}');
      return <>
        {index === 0 && <h3 className="api-doc-group-title">{isGateway ? 'API-Key Demonstration Gateway' : 'Campus Hub APIs'}</h3>}
        {index > 0 && isGateway !== previousIsGateway && <h3 className="api-doc-group-title">{isGateway ? 'API-Key Demonstration Gateway' : 'Campus Hub APIs'}</h3>}
        <details className="panel api-doc-operation" key={`${operation.method}-${operation.path}`}>
        <summary><span className={`api-method-badge ${operation.method}`}>{operation.method.toUpperCase()}</span><code>{operation.path}</code><span className="api-doc-summary">{operation.summary || operation.operationId}</span><span className="api-doc-chevron">⌄</span></summary>
        <div className="api-doc-details">
          {operation.description && <p className="api-doc-description">{operation.description}</p>}
          <div className="api-doc-meta"><span><b>Authentication</b>{security}</span><span><b>Module</b>{(operation.tags || ['Campus Hub']).join(', ')}</span><span><b>Operation ID</b><code>{operation.operationId || 'Not specified'}</code></span></div>
          {operation.parameters?.length > 0 && <section className="api-doc-section"><h3>Parameters</h3><div className="api-doc-parameters">{operation.parameters.map((parameter) => <div className="api-doc-parameter" key={`${parameter.in}-${parameter.name}`}><b>{parameter.name}</b><span>{parameter.in}{parameter.required ? ' · required' : ' · optional'}</span><p>{parameter.description || 'No description supplied.'}</p>{parameter.schema?.example !== undefined && <code>Example: {String(parameter.schema.example)}</code>}</div>)}</div></section>}
          {requestContent && <section className="api-doc-section"><h3>Request body</h3>{requestContent.example !== undefined && <pre>{JSON.stringify(requestContent.example, null, 2)}</pre>}</section>}
          <section className="api-doc-section"><h3>Responses</h3><div className="api-doc-responses">{responses.map(([status, response]) => <div className="api-doc-response" key={status}><code className={Number(status) >= 400 ? 'failure' : ''}>{status}</code><span>{response.description}</span>{response.content?.['application/json']?.example !== undefined && <pre>{JSON.stringify(response.content['application/json'].example, null, 2)}</pre>}</div>)}</div></section>
        </div>
      </details></>;
    })}</div>}
    <p className="fine-print"><ShieldCheck size={14} /> Generated from the administrator’s active OpenAPI registry. The API-key gateway is a controlled demonstration and does not proxy existing session endpoints.</p>
  </section>;
}

export default function ApiManagement() {
  const [tab, setTab] = useState('overview');
  const [openApi, setOpenApi] = useState(null);
  const [docsQuery, setDocsQuery] = useState('');
  const [docsLoading, setDocsLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [selectableApis, setSelectableApis] = useState([]);
  const [consumers, setConsumers] = useState([]);
  const [analytics, setAnalytics] = useState({ totalRequests: 0, failedRequests: 0, successfulRequests: 0, activeApis: 0, archivedApis: 0, averageResponseTime: 0, errorRate: 0, recent: [] });
  const [search, setSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState(emptyApi);
  const [consumerDraft, setConsumerDraft] = useState({ name: '', identifier: '', description: '', rateLimit: 60 });
  const [showApiForm, setShowApiForm] = useState(false);
  const [showConsumerForm, setShowConsumerForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issuedKey, setIssuedKey] = useState('');
  const [testApiId, setTestApiId] = useState('');
  const [testKey, setTestKey] = useState('');
  const [testResult, setTestResult] = useState('');
  const [viewApi, setViewApi] = useState(null);
  const [viewConsumer, setViewConsumer] = useState(null);

  const loadRegistry = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), limit: '10', ...(search ? { search } : {}), ...(filterMethod ? { method: filterMethod } : {}), ...(filterStatus ? { status: filterStatus } : {}) });
    const result = await request(`/admin/api-management/apis?${query}`);
    setItems(result.items);
    setPages(Math.max(1, result.pages));
    setTotal(result.total);
  }, [page, search, filterMethod, filterStatus]);
  const loadConsumers = useCallback(async () => {
    const [consumerRows, apiPage] = await Promise.all([
      request('/admin/api-management/consumers'),
      request('/admin/api-management/apis?page=1&limit=100&status=active')
    ]);
    setConsumers(consumerRows);
    setSelectableApis(apiPage.items);
  }, []);
  const loadAnalytics = useCallback(async () => setAnalytics(await request('/admin/api-management/analytics')), []);
  const loadOpenApi = useCallback(async () => {
    setDocsLoading(true);
    setError('');
    try { setOpenApi(await request('/admin/api-management/openapi.json')); }
    catch (loadError) { setError(loadError.message); }
    finally { setDocsLoading(false); }
  }, []);
  const reload = useCallback(async () => {
    setError('');
    try { await Promise.all([loadRegistry(), loadConsumers(), loadAnalytics()]); }
    catch (loadError) { setError(loadError.message); }
  }, [loadRegistry, loadConsumers, loadAnalytics]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (tab === 'docs' && !openApi && !docsLoading) loadOpenApi();
  }, [tab, openApi, docsLoading, loadOpenApi]);

  async function saveApi(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const payload = {
        ...draft,
        parameters: JSON.parse(draft.parametersText),
        requestExample: JSON.parse(draft.requestExampleText),
        responseExample: JSON.parse(draft.responseExampleText),
        errorCodes: JSON.parse(draft.errorCodesText)
      };
      delete payload.parametersText;
      delete payload.requestExampleText;
      delete payload.responseExampleText;
      delete payload.errorCodesText;
      await request(`/admin/api-management/apis${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload)
      });
      setDraft(emptyApi); setEditingId(''); setShowApiForm(false);
      setNotice(editingId ? 'API registration updated.' : 'API registered.');
      await reload();
    } catch (saveError) { setError(saveError.message); }
    finally { setBusy(false); }
  }
  function editApi(item) {
    setEditingId(item.id);
    setDraft({
      name: item.name, identifier: item.identifier, description: item.description, ownerModule: item.owner_module,
      baseUrl: item.base_url, endpointPath: item.endpoint_path, method: item.method, version: item.version,
      environment: item.environment, authRequired: item.auth_required, status: item.status,
      parametersText: JSON.stringify(item.parameters || [], null, 2),
      requestExampleText: JSON.stringify(item.request_example || {}, null, 2),
      responseExampleText: JSON.stringify(item.response_example || { ok: true }, null, 2),
      errorCodesText: JSON.stringify(item.error_codes || [], null, 2)
    });
    setShowApiForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function archiveApi(item) {
    if (!window.confirm(`Archive ${item.name}? The record and request history will be retained.`)) return;
    setError('');
    try { await request(`/admin/api-management/apis/${item.id}`, { method: 'DELETE' }); setNotice('API archived; its history was retained.'); await reload(); }
    catch (archiveError) { setError(archiveError.message); }
  }
  async function createConsumer(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await request('/admin/api-management/consumers', { method: 'POST', body: JSON.stringify({ ...consumerDraft, identifier: consumerDraft.identifier || undefined, rateLimit: Number(consumerDraft.rateLimit) }) });
      setConsumerDraft({ name: '', identifier: '', description: '', rateLimit: 60 }); setShowConsumerForm(false);
      setNotice('Consumer registered. Grant API access before issuing its key.');
      await loadConsumers();
    } catch (createError) { setError(createError.message); }
    finally { setBusy(false); }
  }
  async function updateConsumer(consumer, patch) {
    setError('');
    try { await request(`/admin/api-management/consumers/${consumer.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); await loadConsumers(); setNotice('Consumer policy updated.'); }
    catch (updateError) { setError(updateError.message); }
  }
  async function updatePermissions(consumer, apiIds) {
    setError('');
    try {
      await request(`/admin/api-management/consumers/${consumer.id}/permissions`, { method: 'PUT', body: JSON.stringify({ apiIds }) });
      await loadConsumers(); setNotice(`API permissions updated for ${consumer.name}.`);
    } catch (permissionError) { setError(permissionError.message); }
  }
  async function issueKey(consumer) {
    setError(''); setIssuedKey('');
    try {
      const result = await request(`/admin/api-management/consumers/${consumer.id}/key`, { method: 'POST', body: '{}' });
      setIssuedKey(result.key); setTestKey(result.key); setNotice(`One-time key issued for ${consumer.name}. Copy it now.`);
      await loadConsumers();
    } catch (issueError) { setError(issueError.message); }
  }
  async function revokeKey(consumer) {
    if (!window.confirm(`Revoke the API key for ${consumer.name}?`)) return;
    setError('');
    try { await request(`/admin/api-management/consumers/${consumer.id}/key`, { method: 'DELETE' }); setIssuedKey(''); await loadConsumers(); setNotice('API key revoked.'); }
    catch (revokeError) { setError(revokeError.message); }
  }
  async function runTest(event) {
    event.preventDefault(); setError(''); setTestResult('');
    const selected = items.find((item) => item.identifier === testApiId);
    if (!selected) { setError('Choose an active API to test.'); return; }
    try {
      const response = await fetch(apiUrl(`/managed/${encodeURIComponent(selected.identifier)}`), {
        method: selected.method,
        headers: testKey ? { 'X-API-Key': testKey } : {}
      });
      const result = await response.json().catch(() => ({}));
      setTestResult(JSON.stringify({ status: response.status, response: result }, null, 2));
      await loadAnalytics();
    } catch (testError) { setError(testError.message); }
  }
  return <div className="page-content api-management">
    <div className="page-heading"><div><p className="eyebrow">ADMINISTRATION · API PLATFORM</p><h1>API management.</h1><p className="muted heading-desc">Register real Campus Hub routes, control service access, and inspect live request outcomes.</p></div><button className="button-secondary" onClick={reload}><RefreshCw size={14} /> Refresh</button></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {notice && <p className="success-message" role="status"><Check size={15} />{notice}<button className="api-dismiss" onClick={() => setNotice('')}>Dismiss</button></p>}
    <div className="stat-grid api-stat-grid">
      {tab === 'consumers' ? <>
      <article className="stat-card"><div className="stat-card-top"><span>Registered consumers</span><span className="stat-icon lilac-bg"><Users size={17} /></span></div><strong className="stat-number">{consumers.length}</strong><div className="stat-meta">Applications and services</div></article>
      <article className="stat-card"><div className="stat-card-top"><span>Active consumers</span><span className="stat-icon mint-bg"><ShieldCheck size={17} /></span></div><strong className="stat-number">{consumers.filter((consumer) => consumer.status === 'active').length}</strong><div className="stat-meta">Currently allowed API access</div></article>
      <article className="stat-card"><div className="stat-card-top"><span>Suspended consumers</span><span className="stat-icon peach-bg"><Activity size={17} /></span></div><strong className="stat-number">{consumers.filter((consumer) => consumer.status === 'suspended').length}</strong><div className="stat-meta">Temporarily blocked</div></article>
      <article className="stat-card"><div className="stat-card-top"><span>Revoked keys</span><span className="stat-icon yellow-bg"><KeyRound size={17} /></span></div><strong className="stat-number">{consumers.filter((consumer) => consumer.keyStatus === 'revoked').length}</strong><div className="stat-meta">Permanently invalidated</div></article>
      </> : <>
      <article className="stat-card"><div className="stat-card-top"><span>Registered APIs</span><span className="stat-icon lilac-bg"><BookOpen size={17} /></span></div><strong className="stat-number">{analytics.activeApis + analytics.archivedApis}</strong><div className="stat-meta">{analytics.activeApis} active · {analytics.archivedApis} archived</div></article>
      <article className="stat-card"><div className="stat-card-top"><span>Registered consumers</span><span className="stat-icon mint-bg"><Users size={17} /></span></div><strong className="stat-number">{consumers.length}</strong><div className="stat-meta">Applications and services</div></article>
      <article className="stat-card"><div className="stat-card-top"><span>Recorded requests</span><span className="stat-icon peach-bg"><Activity size={17} /></span></div><strong className="stat-number">{analytics.totalRequests}</strong><div className="stat-meta">Matched routes and gateway tests</div></article>
      <article className="stat-card"><div className="stat-card-top"><span>Error rate</span><span className="stat-icon yellow-bg"><ShieldCheck size={17} /></span></div><strong className="stat-number">{analytics.errorRate}<small>%</small></strong><div className="stat-meta">{analytics.failedRequests} failed responses</div></article>
      </>}
    </div>
    <div className="api-tabs" role="tablist" aria-label="API management sections">
      {[['overview', 'Overview'], ['registry', 'API registry'], ['consumers', 'Consumers & access'], ['monitoring', 'Monitoring'], ['docs', 'API documentation']].map(([value, label]) => <button role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} key={value} onClick={() => setTab(value)}>{label}</button>)}
    </div>
    {tab === 'overview' && <>
      <section className="api-overview-grid">
        <article className="panel api-overview-panel"><p className="eyebrow">API HEALTH</p><h2>Request performance</h2><div className="api-overview-metrics"><div><strong>{analytics.successfulRequests}</strong><span>Successful</span></div><div><strong>{analytics.failedRequests}</strong><span>Failed</span></div><div><strong>{analytics.averageResponseTime}<small> ms</small></strong><span>Avg. response</span></div></div></article>
        <article className="panel api-overview-panel"><p className="eyebrow">QUICK ACTIONS</p><h2>Manage the API platform</h2><div className="api-overview-actions"><button className="button-primary" onClick={() => { setTab('registry'); setDraft(emptyApi); setEditingId(''); setShowApiForm(true); }}><Plus size={14} /> Register API</button><button className="button-secondary" onClick={() => setTab('monitoring')}><Activity size={14} /> View logs</button><button className="button-secondary" onClick={() => setTab('docs')}><BookOpen size={14} /> Browse documentation</button></div></article>
      </section>
      <div className="section-title-row"><div><h2>Recent API requests</h2><p>Live activity recorded by the backend.</p></div><button className="text-link" onClick={loadAnalytics}>Refresh activity <RefreshCw size={13} /></button></div>
      <div className="api-activity-list">{analytics.recent.slice(0, 8).map((entry) => <article className="panel api-activity-row" key={entry.id}><span className={`api-outcome ${entry.outcome}`}>{entry.response_status}</span><div><b>{entry.method} {entry.endpoint}</b><small>{entry.consumer_name || entry.consumer_id}</small></div><span>{entry.duration_ms} ms</span><span>{new Date(entry.created_at).toLocaleString()}</span></article>)}{analytics.recent.length === 0 && <div className="panel empty-state">No API requests have been recorded yet.</div>}</div>
    </>}
    {tab === 'registry' && <>
      <div className="api-toolbar"><div className="api-search"><Search size={15} /><input aria-label="Search API registry" placeholder="Search APIs, modules, or paths" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} /></div><select aria-label="Filter by method" value={filterMethod} onChange={(event) => { setPage(1); setFilterMethod(event.target.value); }}><option value="">All methods</option>{methods.map((method) => <option key={method}>{method}</option>)}</select><select aria-label="Filter by status" value={filterStatus} onChange={(event) => { setPage(1); setFilterStatus(event.target.value); }}><option value="">All statuses</option><option value="active">Active</option><option value="archived">Archived</option></select><button className="button-primary" onClick={() => { setDraft(emptyApi); setEditingId(''); setShowApiForm((open) => !open); }}><Plus size={14} /> Register API</button></div>
      {showApiForm && <form className="panel api-editor" onSubmit={saveApi}><div className="panel-heading"><div><h2>{editingId ? 'Edit API registration' : 'Register an API'}</h2><p>Only add endpoints that exist in the Campus Hub application.</p></div></div><div className="form-grid api-form-grid">
        <label>API name<input required minLength={2} maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Unique identifier<input required pattern="[a-z][a-z0-9-]{2,62}" value={draft.identifier} onChange={(event) => setDraft({ ...draft, identifier: event.target.value })} placeholder="course-catalogue" /></label>
        <label>Owning module/service<input required maxLength={80} value={draft.ownerModule} onChange={(event) => setDraft({ ...draft, ownerModule: event.target.value })} /></label>
        <label>Base URL<input required pattern="/(?!/)[A-Za-z0-9/_:-]*" value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} /></label>
        <label>Endpoint path<input required pattern="/(?!/)[A-Za-z0-9/_:-]*" value={draft.endpointPath} onChange={(event) => setDraft({ ...draft, endpointPath: event.target.value })} placeholder="/courses" /></label>
        <label>HTTP method<select value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })}>{methods.map((method) => <option key={method}>{method}</option>)}</select></label>
        <label>Version<input required pattern="v[0-9]+(\.[0-9]+){0,2}" value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} /></label>
        <label>Environment<select value={draft.environment} onChange={(event) => setDraft({ ...draft, environment: event.target.value })}><option>development</option><option>staging</option><option>production</option></select></label>
        {editingId && <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="active">active</option><option value="archived">archived</option></select></label>}
        <label className="api-description-field">Description<textarea maxLength={1000} rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label className="api-check-field"><input type="checkbox" checked={draft.authRequired} onChange={(event) => setDraft({ ...draft, authRequired: event.target.checked })} /> Authentication required</label>
        <label className="api-description-field">Documented parameters · JSON array<textarea rows={4} value={draft.parametersText} onChange={(event) => setDraft({ ...draft, parametersText: event.target.value })} /></label>
        <label>Request example · JSON object<textarea rows={4} value={draft.requestExampleText} onChange={(event) => setDraft({ ...draft, requestExampleText: event.target.value })} /></label>
        <label>Response example · JSON object<textarea rows={4} value={draft.responseExampleText} onChange={(event) => setDraft({ ...draft, responseExampleText: event.target.value })} /></label>
        <label className="api-description-field">Documented error codes · JSON array<textarea rows={4} value={draft.errorCodesText} onChange={(event) => setDraft({ ...draft, errorCodesText: event.target.value })} /></label>
      </div><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => { setShowApiForm(false); setEditingId(''); }}>Cancel</button><button className="button-primary" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Register API'}</button></div></form>}
      {viewApi && <section className="panel api-details"><div className="panel-heading"><div><p className="eyebrow">{viewApi.owner_module}</p><h2>{viewApi.name}</h2></div><button className="button-secondary" onClick={() => setViewApi(null)}>Close</button></div><code>{viewApi.method} {viewApi.base_url}{viewApi.endpoint_path}</code><p>{viewApi.description || 'No description supplied.'}</p><dl><div><dt>Unique ID</dt><dd>{viewApi.identifier}</dd></div><div><dt>Authentication</dt><dd>{viewApi.auth_required ? 'campus_session / API key where applicable' : 'None'}</dd></div><div><dt>Version / environment</dt><dd>{viewApi.version} · {viewApi.environment}</dd></div><div><dt>Status</dt><dd>{viewApi.status}</dd></div></dl></section>}
      <div className="api-list">{items.map((item) => <article className="panel api-card" key={item.id}><div className="api-card-main"><div className="api-card-heading"><h2>{item.name}</h2><span className={`api-status ${item.status}`}>{item.status}</span></div><code>{item.method} {item.base_url}{item.endpoint_path}</code><p>{item.description || 'No description supplied.'}</p><div className="api-meta"><span>{item.identifier}</span><span>{item.owner_module}</span><span>{item.version} · {item.environment}</span><span>{item.auth_required ? 'Authentication required' : 'Public route'}</span></div><small>Updated {new Date(item.updated_at).toLocaleString()}</small></div><div className="api-card-actions"><button className="button-secondary" onClick={() => setViewApi(item)}>View</button><button className="button-secondary" onClick={() => editApi(item)}>Edit</button>{item.status === 'active' && <button className="button-secondary" onClick={() => archiveApi(item)}><Archive size={13} /> Archive</button>}</div></article>)}{items.length === 0 && <div className="panel empty-state">No APIs match these filters.</div>}</div>
      <div className="api-pagination"><span>{total} API records</span><div><button className="button-secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="button-secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
    </>}
    {tab === 'consumers' && <>
      <div className="api-toolbar api-consumer-toolbar"><p>Issue keys only after granting endpoint permissions. Keys are shown once and stored as SHA-256 hashes.</p><button className="button-primary" onClick={() => setShowConsumerForm((open) => !open)}><Plus size={14} /> Register consumer</button></div>
      {showConsumerForm && <form className="panel api-editor" onSubmit={createConsumer}><div className="panel-heading"><div><h2>Register an application or service</h2><p>Set an initial per-consumer request limit.</p></div></div><div className="form-grid"><label>Consumer name<input required minLength={2} maxLength={100} value={consumerDraft.name} onChange={(event) => setConsumerDraft({ ...consumerDraft, name: event.target.value })} /></label><label>Unique consumer identifier<input pattern="[a-z][a-z0-9-]{2,62}" value={consumerDraft.identifier} onChange={(event) => setConsumerDraft({ ...consumerDraft, identifier: event.target.value })} placeholder="demo-consumer" /></label><label>Requests per minute<input required type="number" min="1" max="6000" value={consumerDraft.rateLimit} onChange={(event) => setConsumerDraft({ ...consumerDraft, rateLimit: event.target.value })} /></label><label className="api-description-field">Description<textarea maxLength={500} rows={2} value={consumerDraft.description} onChange={(event) => setConsumerDraft({ ...consumerDraft, description: event.target.value })} /></label></div><div className="modal-actions"><button className="button-primary" disabled={busy}>{busy ? 'Saving…' : 'Create consumer'}</button></div></form>}
      {issuedKey && <section className="panel api-key-once"><div><b>Copy this API key now</b><p>It will not be displayed again. Store it in a secret manager, not in source code.</p><code>{issuedKey}</code></div><button className="button-secondary" onClick={() => navigator.clipboard.writeText(issuedKey).then(() => setNotice('Key copied to clipboard.')).catch(() => setError('Clipboard access was denied; select and copy the key manually.'))}><Copy size={14} /> Copy key</button></section>}
      {viewConsumer && <section className="panel api-details"><div className="panel-heading"><div><p className="eyebrow">{viewConsumer.identifier}</p><h2>{viewConsumer.name}</h2></div><button className="button-secondary" onClick={() => setViewConsumer(null)}>Close</button></div><p>{viewConsumer.description || 'No description supplied.'}</p><dl><div><dt>Consumer type</dt><dd>{viewConsumer.built_in ? 'Built-in Campus Hub session' : 'API key consumer'}</dd></div><div><dt>Status</dt><dd>{viewConsumer.status}</dd></div><div><dt>Key status</dt><dd>{viewConsumer.keyStatus}</dd></div><div><dt>Rate limit</dt><dd>{viewConsumer.rateLimit} requests/minute</dd></div><div><dt>Permitted APIs</dt><dd>{viewConsumer.permitted_api_ids.length}</dd></div></dl></section>}
      <div className="api-consumer-list">{consumers.map((consumer) => <article className="panel api-consumer-card" key={consumer.id}><div className="api-consumer-top"><div><div className="api-card-heading"><h2>{consumer.name}</h2><span className={`api-status ${consumer.status}`}>{consumer.status}</span></div><p>{consumer.description || 'No description supplied.'}</p><small>{consumer.built_in ? 'Built-in session consumer' : consumer.keyPrefix ? `Key prefix ${consumer.keyPrefix}…` : `Key ${consumer.keyStatus}`} · Created {new Date(consumer.created_at).toLocaleDateString()}</small></div><div className="api-consumer-controls"><button className="button-secondary" onClick={() => setViewConsumer(consumer)}>View</button>{!consumer.built_in && <><label>Limit/min<input type="number" min="1" max="6000" defaultValue={consumer.rateLimit} onBlur={(event) => { const rateLimit = Number(event.target.value); if (rateLimit !== consumer.rateLimit && rateLimit >= 1 && rateLimit <= 6000) updateConsumer(consumer, { rateLimit }); }} /></label><button className="button-secondary" onClick={() => updateConsumer(consumer, { status: consumer.status === 'active' ? 'suspended' : 'active' })}>{consumer.status === 'active' ? 'Suspend' : 'Activate'}</button><button className="button-secondary" disabled={consumer.status !== 'active'} onClick={() => issueKey(consumer)}><KeyRound size={13} /> {consumer.hasKey ? 'Rotate key' : 'Issue key'}</button>{consumer.hasKey && <button className="button-secondary" onClick={() => revokeKey(consumer)}>Revoke key</button>}</>}</div></div>
        <details className="api-permissions"><summary>Endpoint permissions ({consumer.permitted_api_ids.length})</summary><div>{selectableApis.map((item) => <label key={item.id}><input type="checkbox" disabled={consumer.built_in} checked={consumer.permitted_api_ids.includes(item.id)} onChange={(event) => updatePermissions(consumer, event.target.checked ? [...consumer.permitted_api_ids, item.id] : consumer.permitted_api_ids.filter((id) => id !== item.id))} /> {item.name} <code>{item.method} {item.endpoint_path}</code></label>)}</div></details>
      </article>)}{consumers.length === 0 && <div className="panel empty-state">No consumers registered yet.</div>}</div>
    </>}
    {tab === 'monitoring' && <>
      <section className="panel api-test-console"><div className="panel-heading"><div><h2>API-key test console</h2><p>Calls the controlled demonstration gateway; this does not proxy to the Campus Hub session routes.</p></div></div><form onSubmit={runTest} className="api-test-form"><label>Registered API<select required value={testApiId} onChange={(event) => setTestApiId(event.target.value)}><option value="">Choose an API</option>{selectableApis.map((item) => <option value={item.identifier} key={item.id}>{item.name} · {item.method} {item.endpoint_path}</option>)}</select></label><label>X-API-Key<input autoComplete="off" type="password" value={testKey} onChange={(event) => setTestKey(event.target.value)} placeholder="zch_…" /></label><button className="button-primary">Send test request <Activity size={14} /></button></form>{testResult && <pre className="api-test-result">{testResult}</pre>}</section>
      <div className="api-docs-link"><div><h2>OpenAPI specification</h2><p>Browse readable endpoint documentation, or open the raw JSON for API tools.</p></div><div className="api-doc-actions"><button className="button-primary" onClick={() => setTab('docs')}><BookOpen size={14} /> Browse documentation</button><a className="button-secondary" href="/api/admin/api-management/openapi.json" target="_blank" rel="noreferrer">View raw JSON</a></div></div>
      <div className="section-title-row"><div><h2>Recent API activity</h2><p>Actual responses from registered routes and API-key gateway requests.</p></div><button className="text-link" onClick={loadAnalytics}>Refresh activity <RefreshCw size={13} /></button></div>
      <div className="api-activity-list">{analytics.recent.map((entry) => <article className="panel api-activity-row" key={entry.id}><span className={`api-outcome ${entry.outcome}`}>{entry.response_status}</span><div><b>{entry.method} {entry.endpoint}</b><small>{entry.api_identifier} · {entry.consumer_name}</small></div><span>{entry.duration_ms} ms</span><span>{new Date(entry.created_at).toLocaleString()}</span></article>)}{analytics.recent.length === 0 && <div className="panel empty-state">No matched API requests have been recorded yet.</div>}</div>
      <p className="fine-print"><ShieldCheck size={14} /> API keys are hashed at rest; protected gateway calls require active consumer permission and respect that consumer’s rolling one-minute request window.</p>
    </>}
    {tab === 'docs' && <OpenApiDocumentation specification={openApi} search={docsQuery} setSearch={setDocsQuery} loading={docsLoading} onRefresh={loadOpenApi} />}
  </div>;
}
