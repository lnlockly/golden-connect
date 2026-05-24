// Minimal Kubernetes API client for in-pod use.
// Reads ServiceAccount token + CA from the well-known mount paths.
// Used to auto-provision Ingress + cert-manager Certificate when a custom
// bio domain is verified.
const https = require('https');
const fs = require('fs');

const SA_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';
let _cached = null;

function loadSA() {
  if (_cached) return _cached;
  try {
    _cached = {
      token: fs.readFileSync(`${SA_DIR}/token`, 'utf8').trim(),
      ca: fs.readFileSync(`${SA_DIR}/ca.crt`),
      namespace: fs.readFileSync(`${SA_DIR}/namespace`, 'utf8').trim(),
      host: process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc',
      port: process.env.KUBERNETES_SERVICE_PORT || '443',
    };
    return _cached;
  } catch (e) {
    return null;
  }
}

function isAvailable() { return !!loadSA(); }

function k8sRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const sa = loadSA();
    if (!sa) return reject(new Error('kubernetes ServiceAccount not mounted'));
    const data = body ? JSON.stringify(body) : '';
    const headers = {
      Authorization: `Bearer ${sa.token}`,
      Accept: 'application/json',
    };
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = https.request({
      method,
      hostname: sa.host,
      port: sa.port,
      path,
      headers,
      ca: sa.ca,
      timeout: 15000,
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(chunks); } catch (_) { parsed = { raw: chunks }; }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed);
        const err = new Error(`k8s ${method} ${path} → HTTP ${res.statusCode}: ${parsed.message || chunks}`);
        err.status = res.statusCode;
        err.body = parsed;
        reject(err);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('k8s request timeout')));
    if (data) req.write(data);
    req.end();
  });
}

function safe(name) { return String(name).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 50); }

async function createIngressForBioDomain(domain) {
  const sa = loadSA();
  const ns = sa.namespace;
  const name = `bio-${safe(domain)}`;
  const secretName = `tls-bio-${safe(domain)}`;
  const body = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name,
      namespace: ns,
      annotations: {
        'cert-manager.io/cluster-issuer': 'letsencrypt-prod',
        'nginx.ingress.kubernetes.io/proxy-body-size': '8m',
        'app.kubernetes.io/managed-by': 'goldenConnect-cabinet',
      },
      labels: { 'app': 'goldenConnect-cabinet', 'bio-domain': safe(domain) },
    },
    spec: {
      ingressClassName: 'nginx',
      tls: [{ hosts: [domain], secretName }],
      rules: [{
        host: domain,
        http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: 'goldenConnect-cabinet', port: { number: 80 } } } }] },
      }],
    },
  };
  try {
    return await k8sRequest('POST', `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses`, body);
  } catch (e) {
    if (e.status === 409) return await k8sRequest('GET', `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses/${name}`);
    throw e;
  }
}

async function createCertificateForBioDomain(domain) {
  const sa = loadSA();
  const ns = sa.namespace;
  const name = `tls-bio-${safe(domain)}`;
  const body = {
    apiVersion: 'cert-manager.io/v1',
    kind: 'Certificate',
    metadata: {
      name,
      namespace: ns,
      labels: { 'app': 'goldenConnect-cabinet', 'bio-domain': safe(domain) },
    },
    spec: {
      secretName: name,
      dnsNames: [domain],
      issuerRef: { name: 'letsencrypt-prod', kind: 'ClusterIssuer' },
    },
  };
  try {
    return await k8sRequest('POST', `/apis/cert-manager.io/v1/namespaces/${ns}/certificates`, body);
  } catch (e) {
    if (e.status === 409) return await k8sRequest('GET', `/apis/cert-manager.io/v1/namespaces/${ns}/certificates/${name}`);
    throw e;
  }
}

async function getCertificateStatus(domain) {
  const sa = loadSA();
  const ns = sa.namespace;
  const name = `tls-bio-${safe(domain)}`;
  try {
    const cert = await k8sRequest('GET', `/apis/cert-manager.io/v1/namespaces/${ns}/certificates/${name}`);
    const ready = (cert.status?.conditions || []).find((c) => c.type === 'Ready');
    return { exists: true, ready: ready && ready.status === 'True', message: ready ? ready.message : '' };
  } catch (e) {
    if (e.status === 404) return { exists: false, ready: false };
    throw e;
  }
}

async function deleteBioDomain(domain) {
  const sa = loadSA();
  const ns = sa.namespace;
  const ingressName = `bio-${safe(domain)}`;
  const certName = `tls-bio-${safe(domain)}`;
  const errs = [];
  try { await k8sRequest('DELETE', `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses/${ingressName}`); }
  catch (e) { if (e.status !== 404) errs.push('ingress: ' + e.message); }
  try { await k8sRequest('DELETE', `/apis/cert-manager.io/v1/namespaces/${ns}/certificates/${certName}`); }
  catch (e) { if (e.status !== 404) errs.push('certificate: ' + e.message); }
  return { ok: errs.length === 0, errors: errs };
}

module.exports = {
  isAvailable,
  createIngressForBioDomain,
  createCertificateForBioDomain,
  getCertificateStatus,
  deleteBioDomain,
};
