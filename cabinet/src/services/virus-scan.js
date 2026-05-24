// Virus / safety scan facade — HARDENED.
//
// Modes:
//   - 'clamav' (env CLAMAV_ENABLED=1) — calls clamdscan via local socket
//   - 'lite' (default) — magic-bytes + full-file shell signature scan +
//                        executable-format reject + filename-ext blocklist
//
// The actual byte-level sanitisation happens AFTER this scan in
// services/secure-upload.js (sharp re-encode → webp) and services/video-pipeline.js
// (ffmpeg transcode → mp4 H.264), so polyglot payloads appended after image data
// are stripped regardless. This scan is the front-door check.
//
// Returns { ok: true, scanner } or { ok: false, threat, scanner }.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileP = promisify(execFile);

const CLAMAV_ENABLED = String(process.env.CLAMAV_ENABLED || '0') === '1';
const CLAMDSCAN_BIN = process.env.CLAMDSCAN_BIN || 'clamdscan';

// Magic byte signatures we accept for media uploads
const MAGIC = {
  png:  [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  jpeg: [0xFF, 0xD8, 0xFF],
  webp: [0x52, 0x49, 0x46, 0x46],   // RIFF (4) + 4 bytes size + WEBP at offset 8 — checked separately
  gif:  [0x47, 0x49, 0x46, 0x38],
  mp4:  [0x66, 0x74, 0x79, 0x70],   // 'ftyp' at offset 4
};

// Hard-block magic bytes (executables, archives, scripts) — never allowed as media
const BLOCKED_MAGIC = [
  { name: 'pe_exe',   bytes: [0x4D, 0x5A] },                                     // MZ — Windows EXE/DLL
  { name: 'elf',      bytes: [0x7F, 0x45, 0x4C, 0x46] },                         // 7F ELF — Linux executable
  { name: 'macho_32', bytes: [0xFE, 0xED, 0xFA, 0xCE] },                         // Mach-O 32-bit
  { name: 'macho_64', bytes: [0xFE, 0xED, 0xFA, 0xCF] },                         // Mach-O 64-bit
  { name: 'macho_uni',bytes: [0xCA, 0xFE, 0xBA, 0xBE] },                         // Mach-O universal binary / Java class
  { name: 'zip',      bytes: [0x50, 0x4B, 0x03, 0x04] },                         // PK.. — ZIP/JAR/DOCX/APK
  { name: 'zip_empty',bytes: [0x50, 0x4B, 0x05, 0x06] },                         // empty ZIP
  { name: 'rar4',     bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00] },       // RAR 1.5+
  { name: 'rar5',     bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00] }, // RAR 5+
  { name: '7z',       bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] },
  { name: 'gz',       bytes: [0x1F, 0x8B] },
  { name: 'bz2',      bytes: [0x42, 0x5A, 0x68] },
  { name: 'xz',       bytes: [0xFD, 0x37, 0x7A, 0x58, 0x5A] },
  { name: 'class',    bytes: [0xCA, 0xFE, 0xBA, 0xBE] },                         // Java .class (same as Mach-O univ)
  { name: 'swf',      bytes: [0x46, 0x57, 0x53] },                               // Flash FWS / CWS / ZWS
  { name: 'swf_cws',  bytes: [0x43, 0x57, 0x53] },
  { name: 'swf_zws',  bytes: [0x5A, 0x57, 0x53] },
  { name: 'pdf',      bytes: [0x25, 0x50, 0x44, 0x46] },                         // %PDF — JS can be embedded
  { name: 'msi',      bytes: [0xD0, 0xCF, 0x11, 0xE0] },                         // OLE compound (.doc/.xls/.msi)
];

// Filename extension blocklist (defense in depth — the upload buffer would still be
// scanned, but if the original filename is .php / .sh / .py we reject early)
const BLOCKED_EXTENSIONS = new Set([
  'php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'phps', 'pht',
  'jsp', 'jspx', 'asp', 'aspx', 'cer', 'asa',
  'sh', 'bash', 'zsh', 'fish', 'csh', 'ksh',
  'py', 'pyc', 'pyo', 'pyw',
  'pl', 'pm', 'cgi',
  'rb', 'rbw',
  'ps1', 'psm1', 'psd1', 'bat', 'cmd', 'vbs', 'vbe', 'wsf', 'wsh',
  'exe', 'dll', 'msi', 'scr', 'com', 'jar', 'class',
  'so', 'dylib',
  'svg', 'html', 'htm', 'xhtml', 'mhtml', 'xml',  // SVG can carry <script>; HTML obvious
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
  'pdf',
]);

// Shell / webshell / RCE signatures scanned across ENTIRE file
const SHELL_SIGNATURES = [
  // Script tags
  '<script', '</script', 'javascript:', 'data:text/html', 'data:application',
  // PHP
  '<?php', '<?=', '<? ', 'php://', 'eval(', 'assert(', 'system(', 'shell_exec',
  'passthru(', 'pcntl_exec', 'exec(', 'popen(', 'proc_open', 'preg_replace_callback',
  'create_function', 'base64_decode', 'gzinflate(', 'str_rot13(', '$_get[', '$_post[',
  '$_request[', '$_cookie[', '$_files[', '$_server[', '$_session[', 'fputs(', 'fwrite(',
  // ASP/JSP
  '<%=', '<%@', 'runtime.getruntime', 'processbuilder', 'response.write',
  // Shell
  '#!/bin/sh', '#!/bin/bash', '#!/usr/bin/env', '#!/usr/bin/perl', '#!/usr/bin/python',
  'bash -c', 'sh -c', 'cmd.exe', '/c ', 'powershell -', 'iex ', 'invoke-expression',
  'curl -', 'wget ', '&& nc ', '/dev/tcp/', 'reverse shell', 'msfvenom',
  // Common webshell strings
  'c99shell', 'r57shell', 'b374k', 'wso shell', 'webshell',
  // SVG XSS
  'xlink:href="javascript', 'onload=', 'onerror=', 'onclick=', 'onmouseover=',
  // Other dangerous
  'document.cookie', 'window.location', 'fromcharcode(', 'unescape(',
];

const MAX_SCAN_BYTES = 8 * 1024 * 1024; // 8MB — cap to bound CPU even on large videos

function _matchPrefix(buf, sig) {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (buf[i] !== sig[i]) return false;
  return true;
}

async function detectMime(filePath) {
  const fd = await fs.promises.open(filePath, 'r');
  const buf = Buffer.alloc(32);
  await fd.read(buf, 0, 32, 0);
  await fd.close();

  if (_matchPrefix(buf, MAGIC.png)) return 'image/png';
  if (_matchPrefix(buf, MAGIC.jpeg)) return 'image/jpeg';
  if (_matchPrefix(buf, MAGIC.webp) && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (_matchPrefix(buf, MAGIC.gif)) return 'image/gif';
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return 'video/webm';
  return 'application/octet-stream';
}

function checkBlockedMagic(buf) {
  for (const { name, bytes } of BLOCKED_MAGIC) {
    if (_matchPrefix(buf, bytes)) return name;
  }
  return null;
}

function checkBlockedExtension(originalName) {
  if (!originalName || typeof originalName !== 'string') return null;
  const ext = (originalName.split('.').pop() || '').toLowerCase().trim();
  if (BLOCKED_EXTENSIONS.has(ext)) return ext;
  // Also reject double-extension tricks: foo.jpg.php
  const parts = originalName.toLowerCase().split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (BLOCKED_EXTENSIONS.has(parts[i + 1])) return parts[i + 1];
  }
  return null;
}

async function clamdScan(filePath) {
  try {
    const { stdout } = await execFileP(CLAMDSCAN_BIN, ['--no-summary', '--fdpass', filePath], {
      timeout: 60_000,
      maxBuffer: 256 * 1024,
    });
    if (/FOUND/i.test(stdout)) {
      const threat = (stdout.match(/:\s*([^\s]+)\s+FOUND/i) || [])[1] || 'unknown';
      return { ok: false, threat, scanner: 'clamav' };
    }
    return { ok: true, scanner: 'clamav' };
  } catch (e) {
    const output = (e.stdout || '') + (e.stderr || '');
    if (e.code === 1 && /FOUND/i.test(output)) {
      const threat = (output.match(/:\s*([^\s]+)\s+FOUND/i) || [])[1] || 'unknown';
      return { ok: false, threat, scanner: 'clamav' };
    }
    console.warn('[virus-scan] clamdscan failed, falling back to lite:', e.message);
    return null;
  }
}

async function liteCheck(filePath, kind, originalName) {
  // 0) Filename extension blocklist (cheap pre-check)
  const badExt = checkBlockedExtension(originalName);
  if (badExt) return { ok: false, threat: 'blocked_ext:' + badExt, scanner: 'lite' };

  // 1) Read first 64 bytes for magic detection (faster than detectMime read)
  const fd = await fs.promises.open(filePath, 'r');
  const head = Buffer.alloc(64);
  await fd.read(head, 0, 64, 0);
  await fd.close();

  // 2) Hard-blocked magic bytes (PE/ELF/ZIP/etc.) regardless of kind
  const blockedMagic = checkBlockedMagic(head);
  if (blockedMagic) return { ok: false, threat: 'blocked_magic:' + blockedMagic, scanner: 'lite' };

  // 3) Magic-byte/MIME match the declared kind
  const mime = await detectMime(filePath);
  if (kind === 'image' && !/^image\/(png|jpeg|webp|gif)$/.test(mime)) {
    return { ok: false, threat: 'mime_mismatch:' + mime, scanner: 'lite' };
  }
  if (kind === 'video' && !/^video\/(mp4|webm)$/.test(mime)) {
    return { ok: false, threat: 'mime_mismatch:' + mime, scanner: 'lite' };
  }

  // 4) Full-file shell signature scan (capped at MAX_SCAN_BYTES to bound CPU).
  //    Polyglot trick: image header + appended PHP. Sharp re-encode kills this on
  //    output, but rejecting up-front means we don't even try to decode.
  const stat = await fs.promises.stat(filePath);
  const scanLen = Math.min(stat.size, MAX_SCAN_BYTES);
  const fd2 = await fs.promises.open(filePath, 'r');
  const body = Buffer.alloc(scanLen);
  await fd2.read(body, 0, scanLen, 0);
  await fd2.close();
  // case-insensitive ASCII match (latin1 preserves byte-positions)
  const text = body.toString('latin1').toLowerCase();
  for (const sig of SHELL_SIGNATURES) {
    const idx = text.indexOf(sig);
    if (idx >= 0) {
      return { ok: false, threat: 'embedded:' + sig + '@' + idx, scanner: 'lite' };
    }
  }

  return { ok: true, scanner: 'lite', mime };
}

async function scanFile(filePath, kind = 'image', originalName = null) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, threat: 'file_not_found', scanner: 'none' };
  }
  if (CLAMAV_ENABLED) {
    const r = await clamdScan(filePath);
    if (r) {
      // Even if clamav passes, run lite-check for shell signatures + ext blocklist
      // (clamav signatures focus on AV definitions, not webshells/PHP fragments).
      if (r.ok) {
        const lite = await liteCheck(filePath, kind, originalName);
        if (!lite.ok) return lite;
      }
      return r;
    }
  }
  return liteCheck(filePath, kind, originalName);
}

module.exports = { scanFile, detectMime };
