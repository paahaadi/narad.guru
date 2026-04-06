const crypto = require('crypto');
const fs = require('fs');

if (!fs.existsSync('keys/jwt_private.pem')) {
  console.error('keys/jwt_private.pem not found');
  process.exit(1);
}

const privateKey = fs.readFileSync('keys/jwt_private.pem', 'utf8');
const header = { alg: 'RS256', typ: 'JWT' };
const now = Math.floor(Date.now() / 1000);
const payload = {
  sub: 'dev-user-001',
  tenant_id: '00000000-0000-0000-0000-000000000001',
  role: 'admin',
  clearance_level: 'sovereign',
  iss: 'narad.guru',
  iat: now,
  exp: now + (365 * 24 * 60 * 60),
};

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const unsigned = base64url(header) + '.' + base64url(payload);
const sign = crypto.createSign('RSA-SHA256');
sign.update(unsigned);
const signature = sign.sign(privateKey, 'base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const token = unsigned + '.' + signature;
fs.writeFileSync('keys/dev_token.txt', token);
console.log('Dev token generated in keys/dev_token.txt');
