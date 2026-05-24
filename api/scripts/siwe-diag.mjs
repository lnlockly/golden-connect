import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { SiweMessage } from 'siwe';
import { createApp } from '../src/server.ts';

const app = createApp();
const pk = generatePrivateKey();
const account = privateKeyToAccount(pk);
const address = account.address;

const nonceRes = await app.request('/auth/nonce', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ address }),
});
const { nonce } = await nonceRes.json();
console.log('nonce:', nonce);

const siwe = new SiweMessage({
  domain: 'trendex.ai',
  address,
  statement: 'Sign in to TrendeX',
  uri: 'https://trendex.ai',
  version: '1',
  chainId: 56,
  nonce,
  issuedAt: new Date().toISOString(),
  expirationTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
});
const message = siwe.prepareMessage();
console.log('\n=== message ===\n' + message + '\n=== end ===');

const signature = await account.signMessage({ message });
console.log('signature:', signature.slice(0, 30), '...');

const verifyRes = await app.request('/auth/verify', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ address, signature, message }),
});
console.log('\nverify status:', verifyRes.status);
console.log('verify body:', await verifyRes.text());
