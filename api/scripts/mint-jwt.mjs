import 'dotenv/config';
import { signSession } from '../src/services/jwt.ts';
const uid = Number(process.argv[2] ?? 3);
const addr = process.argv[3] ?? '0x0000000000000000000000000000000000000000';
console.log(signSession({ sub: uid, addr, tg: null }));
