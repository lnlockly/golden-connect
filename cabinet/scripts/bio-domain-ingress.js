#!/usr/bin/env node
// Usage: node scripts/bio-domain-ingress.js mybiz.com 42
// Outputs YAML for Ingress + Certificate. Admin pipes to:
//   kubectl -n trendex apply -f -
const [domain, bioId] = process.argv.slice(2);
if (!domain || !bioId) { console.error('Usage: node bio-domain-ingress.js DOMAIN BIO_ID'); process.exit(1); }
const safe = domain.replace(/[^a-z0-9-]/g, '-');
process.stdout.write(`---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: tls-bio-${safe}
  namespace: trendex
spec:
  secretName: tls-bio-${safe}
  dnsNames: ["${domain}"]
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: bio-${safe}
  namespace: trendex
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "8m"
spec:
  ingressClassName: nginx
  tls:
    - hosts: ["${domain}"]
      secretName: tls-bio-${safe}
  rules:
    - host: ${domain}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: trendex-cabinet
                port:
                  number: 80
`);
