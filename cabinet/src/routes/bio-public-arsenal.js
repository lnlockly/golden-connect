const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// ===================== CONSTANTS =====================

const SOCIAL_ICONS = {
  instagram: { svg: '<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>', color: '#E4405F' },
  tiktok: { svg: '<path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.86a8.28 8.28 0 004.76 1.5V6.83a4.84 4.84 0 01-1-.14z"/>', color: '#000000' },
  youtube: { svg: '<path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>', color: '#FF0000' },
  telegram: { svg: '<path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>', color: '#0088cc' },
  twitter: { svg: '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>', color: '#000000' },
  vk: { svg: '<path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.525-2.049-1.714-1.033-1.01-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.12-5.339-3.202-2.17-3.04-2.763-5.32-2.763-5.778 0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.678.86 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.204.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.814-.542 1.27-1.422 2.18-3.61 2.18-3.61.119-.254.305-.491.745-.491h1.744c.525 0 .643.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.78 1.203 1.253.745.847 1.32 1.558 1.473 2.049.17.49-.085.744-.576.744z"/>', color: '#4680C2' },
  facebook: { svg: '<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>', color: '#1877F2' },
  linkedin: { svg: '<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>', color: '#0A66C2' },
  whatsapp: { svg: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>', color: '#25D366' },
  github: { svg: '<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>', color: '#181717' },
  spotify: { svg: '<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>', color: '#1DB954' },
  pinterest: { svg: '<path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z"/>', color: '#E60023' },
  website: { svg: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>', color: '#4A90D9' }
};

const BTN_STYLES = {
  glass: (color) => `background:${color}22;color:#fff;border:1px solid ${color}44;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)`,
  pill: (color) => `background:${color};color:#fff;border-radius:50px`,
  rounded: (color) => `background:${color};color:#fff;border-radius:12px`,
  square: (color) => `background:${color};color:#fff;border-radius:4px`,
  outline: (color) => `background:transparent;color:${color};border:2px solid ${color};border-radius:12px`,
  filled: (color) => `background:${color};color:#fff;border-radius:8px`,
  shadow: (color) => `background:${color};color:#fff;border-radius:12px;box-shadow:0 4px 15px ${color}66`,
  neon: (color) => `background:transparent;color:${color};border:2px solid ${color};border-radius:12px;box-shadow:0 0 10px ${color}44,inset 0 0 10px ${color}22`
};

// ===================== HELPERS =====================

function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function bgCSS(bg, color, bgImage, bgVideo) {
  const c = color || '#667eea';
  switch (bg) {
    case 'solid': return `background:${c};`;
    case 'dots': return `background-color:#0f172a;background-image:radial-gradient(${c}55 1px,transparent 1px);background-size:20px 20px;`;
    case 'waves': return `background:linear-gradient(135deg,${c},${c}88,${c}44);`;
    case 'gradient-shift': return `background:linear-gradient(45deg,${c},${c}aa,#764ba2,#f5576c);background-size:400% 400%;animation:bgShift 8s ease infinite;`;
    case 'noise': return `background:linear-gradient(135deg,${c},#764ba2);`;
    case 'custom-image': return bgImage ? `background:url('${esc(bgImage)}') center/cover no-repeat fixed;` : `background:linear-gradient(135deg,${c},${c}88);`;
    case 'custom-video': return 'background:#0f172a;';
    case 'particles': case 'mesh': case 'aurora': case 'matrix': case 'confetti': case 'bokeh':
      return 'background:#0f172a;';
    default: return `background:linear-gradient(135deg,${c},${c}88,#0f172a);`;
  }
}

function canvasScript(bg, color) {
  const c = color || '#667eea';
  if (bg === 'particles') return `<canvas id="bgCanvas" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:0"></canvas>
<script>!function(){const c=document.getElementById('bgCanvas'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;const ps=[];for(let i=0;i<80;i++)ps.push({x:Math.random()*c.width,y:Math.random()*c.height,vx:(Math.random()-.5)*0.5,vy:(Math.random()-.5)*0.5,r:Math.random()*2+1});function d(){x.fillStyle='#0f172a';x.fillRect(0,0,c.width,c.height);ps.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>c.width)p.vx*=-1;if(p.y<0||p.y>c.height)p.vy*=-1;x.beginPath();x.arc(p.x,p.y,p.r,0,Math.PI*2);x.fillStyle='${c}';x.fill()});for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const dx=ps[i].x-ps[j].x,dy=ps[i].y-ps[j].y,d=Math.sqrt(dx*dx+dy*dy);if(d<120){x.beginPath();x.moveTo(ps[i].x,ps[i].y);x.lineTo(ps[j].x,ps[j].y);x.strokeStyle='${c}'+(Math.round((1-d/120)*60)).toString(16).padStart(2,'0');x.stroke()}}requestAnimationFrame(d)}d();addEventListener('resize',()=>{c.width=innerWidth;c.height=innerHeight})}()</script>`;
  if (bg === 'mesh') return `<canvas id="bgCanvas" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:0"></canvas>
<script>!function(){const c=document.getElementById('bgCanvas'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;const bs=[{x:c.width*.3,y:c.height*.3,r:200,color:'${c}',vx:.3,vy:.2},{x:c.width*.7,y:c.height*.6,r:180,color:'#764ba2',vx:-.2,vy:.3},{x:c.width*.5,y:c.height*.8,r:160,color:'#f5576c',vx:.2,vy:-.2},{x:c.width*.2,y:c.height*.7,r:140,color:'#43e97b',vx:-.3,vy:-.1}];function d(){x.fillStyle='#0f172a';x.fillRect(0,0,c.width,c.height);bs.forEach(b=>{b.x+=b.vx;b.y+=b.vy;if(b.x<-100||b.x>c.width+100)b.vx*=-1;if(b.y<-100||b.y>c.height+100)b.vy*=-1;const g=x.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);g.addColorStop(0,b.color+'88');g.addColorStop(1,b.color+'00');x.fillStyle=g;x.beginPath();x.arc(b.x,b.y,b.r,0,Math.PI*2);x.fill()});requestAnimationFrame(d)}d();addEventListener('resize',()=>{c.width=innerWidth;c.height=innerHeight})}()</script>`;
  if (bg === 'aurora') return `<canvas id="bgCanvas" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:0"></canvas>
<script>!function(){const c=document.getElementById('bgCanvas'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;let t=0;function d(){x.fillStyle='#0f172a';x.fillRect(0,0,c.width,c.height);[{c:'${c}66',o:0},{c:'#43e97b44',o:2},{c:'#764ba244',o:4}].forEach(w=>{x.beginPath();x.moveTo(0,c.height*.4);for(let i=0;i<=c.width;i+=5){const y=c.height*.4+Math.sin((i+t*50+w.o*100)*.005)*80+Math.sin((i+t*30)*.008)*40;x.lineTo(i,y)}x.lineTo(c.width,c.height);x.lineTo(0,c.height);x.fillStyle=w.c;x.fill()});t+=.016;requestAnimationFrame(d)}d();addEventListener('resize',()=>{c.width=innerWidth;c.height=innerHeight})}()</script>`;
  if (bg === 'matrix') return `<canvas id="bgCanvas" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:0"></canvas>
<script>!function(){const c=document.getElementById('bgCanvas'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;const cols=Math.floor(c.width/14),drops=new Array(cols).fill(1);const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*()アイウエオカキクケコ';function d(){x.fillStyle='rgba(0,0,0,0.05)';x.fillRect(0,0,c.width,c.height);x.fillStyle='${c}';x.font='12px monospace';for(let i=0;i<drops.length;i++){const ch=chars[Math.floor(Math.random()*chars.length)];x.fillText(ch,i*14,drops[i]*14);if(drops[i]*14>c.height&&Math.random()>.975)drops[i]=0;drops[i]++}}setInterval(d,50);addEventListener('resize',()=>{c.width=innerWidth;c.height=innerHeight})}()</script>`;
  if (bg === 'confetti') return `<canvas id="bgCanvas" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:0"></canvas>
<script>!function(){const c=document.getElementById('bgCanvas'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;const ps=[];const colors=['#f5576c','#ffd700','#43e97b','${c}','#764ba2','#00b4d8'];for(let i=0;i<60;i++)ps.push({x:Math.random()*c.width,y:Math.random()*c.height,w:Math.random()*8+4,h:Math.random()*6+2,color:colors[Math.floor(Math.random()*colors.length)],vy:Math.random()*1+.5,vx:(Math.random()-.5)*.5,rot:Math.random()*360,vr:Math.random()*4-2});function d(){x.fillStyle='#1a1a2e';x.fillRect(0,0,c.width,c.height);ps.forEach(p=>{p.y+=p.vy;p.x+=p.vx;p.rot+=p.vr;if(p.y>c.height+10){p.y=-10;p.x=Math.random()*c.width}x.save();x.translate(p.x,p.y);x.rotate(p.rot*Math.PI/180);x.fillStyle=p.color;x.fillRect(-p.w/2,-p.h/2,p.w,p.h);x.restore()});requestAnimationFrame(d)}d();addEventListener('resize',()=>{c.width=innerWidth;c.height=innerHeight})}()</script>`;
  if (bg === 'bokeh') return `<canvas id="bgCanvas" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:0"></canvas>
<script>!function(){const c=document.getElementById('bgCanvas'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;const bs=[];const colors=['${c}','#764ba2','#f5576c','#43e97b','#00b4d8'];for(let i=0;i<25;i++)bs.push({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*60+20,color:colors[Math.floor(Math.random()*colors.length)],a:Math.random()*.3+.1,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3});function d(){x.fillStyle='#0f172a';x.fillRect(0,0,c.width,c.height);bs.forEach(b=>{b.x+=b.vx;b.y+=b.vy;if(b.x<-100||b.x>c.width+100)b.vx*=-1;if(b.y<-100||b.y>c.height+100)b.vy*=-1;const g=x.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);g.addColorStop(0,b.color+Math.round(b.a*255).toString(16).padStart(2,'0'));g.addColorStop(1,b.color+'00');x.fillStyle=g;x.beginPath();x.arc(b.x,b.y,b.r,0,Math.PI*2);x.fill()});requestAnimationFrame(d)}d();addEventListener('resize',()=>{c.width=innerWidth;c.height=innerHeight})}()</script>`;
  return '';
}

// ===================== ROUTE =====================

// Golden Connect: if request comes via a verified custom domain, look up the
// bio_custom_domains table by Host header and resolve the bio profile from there.
router.get('/', (req, res, next) => {
  try {
    const host = String(req.hostname || '').toLowerCase();
    if (!host || host === 'golden-connect.to' || host === 'localhost' || host.endsWith('.golden-connect.to')) return next();
    const db = getDb();
    const cd = db.prepare("SELECT bio_id FROM bio_custom_domains WHERE LOWER(domain) = ? AND dns_status = 'verified'").get(host);
    if (!cd) return next();
    const profile = db.prepare('SELECT username FROM user_bio_profiles WHERE id = ? AND is_public = 1').get(cd.bio_id);
    if (!profile) return next();
    req.params = req.params || {};
    req.params.username = profile.username;
    return next();
  } catch (e) { return next(); }
});

router.get('/:username', (req, res) => {
  const db = getDb();
  try {
    const profile = db.prepare('SELECT * FROM user_bio_profiles WHERE username = ? AND is_public = 1').get(req.params.username);
    if (!profile) return res.status(404).send('<!DOCTYPE html><html><head><title>Not Found</title></head><body style="background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><h1>Page not found</h1></body></html>');

    // Increment views
    db.prepare('UPDATE user_bio_profiles SET total_views = total_views + 1 WHERE id = ?').run(profile.id);

    // A/B Testing: check for active test
    let abTestId = null, abVariant = 'a';
    try {
      const abTest = db.prepare('SELECT * FROM bio_ab_tests WHERE bio_id = ? AND is_active = 1 LIMIT 1').get(profile.id);
      if (abTest) {
        abTestId = abTest.id;
        // Parse cookies manually
        const cookies = {};
        (req.headers.cookie || '').split(';').forEach(c => {
          const parts = c.trim().split('=');
          if (parts[0]) cookies[parts[0].trim()] = (parts[1] || '').trim();
        });
        const cookieKey = 'bio_ab_' + abTest.id;
        if (cookies[cookieKey] === 'a' || cookies[cookieKey] === 'b') {
          abVariant = cookies[cookieKey];
        } else {
          abVariant = (Math.random() * 100 < abTest.split_ratio) ? 'a' : 'b';
          res.cookie(cookieKey, abVariant, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false, path: '/' });
        }
        // Track impression
        const impCol = abVariant === 'b' ? 'impressions_b' : 'impressions_a';
        db.prepare('UPDATE bio_ab_tests SET ' + impCol + ' = ' + impCol + ' + 1 WHERE id = ?').run(abTest.id);

        // Apply variant B overrides to profile
        if (abVariant === 'b') {
          try {
            const varB = JSON.parse(abTest.variant_b_json);
            if (varB.display_name) profile.display_name = varB.display_name;
            if (varB.bio) profile.bio = varB.bio;
            if (varB.theme_color) profile.theme_color = varB.theme_color;
            if (varB.background) profile.background = varB.background;
            if (varB.button_style) profile.button_style = varB.button_style;
            if (varB.meta_title) profile.meta_title = varB.meta_title;
            if (varB.meta_description) profile.meta_description = varB.meta_description;
          } catch(e) {}
        }
      }
    } catch(e) {}

    // Get bio links
    const links = db.prepare('SELECT * FROM bio_links WHERE bio_id = ? AND is_active = 1 ORDER BY position ASC, id ASC').all(profile.id);

    // Get social icons
    const socials = db.prepare('SELECT * FROM bio_social_icons WHERE bio_id = ? ORDER BY position ASC').all(profile.id);

    // Fallback: if no socials in table but social_links JSON exists, parse it
    let socialList = socials;
    if (socials.length === 0 && profile.social_links) {
      try {
        const parsed = JSON.parse(profile.social_links);
        if (Array.isArray(parsed)) {
          socialList = parsed.filter(s => s.url).map((s, i) => ({ platform: s.platform, url: s.url, position: i }));
        }
      } catch(e) {}
    }

    const color = profile.theme_color || '#667eea';
    const bg = profile.background || 'gradient';
    const btnStyle = profile.button_style || 'glass';
    const displayName = profile.display_name || profile.username;
    const bioText = profile.bio || '';
    const avatarUrl = profile.avatar_url || '';
    const baseUrl = 'https://golden-connect.to';
    // Get owner's referral code for footer link
    let refCode = '';
    try {
      const owner = db.prepare('SELECT ref_code FROM users WHERE id = ?').get(profile.user_id);
      if (owner && owner.ref_code) refCode = owner.ref_code;
    } catch(e) {}
    const footerUrl = refCode ? ('https://golden-connect.to/?ref=' + refCode) : baseUrl;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(profile.meta_title || displayName + ' | Bio')}</title>
  <meta name="description" content="${esc(profile.meta_description || bioText.substring(0, 160))}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${baseUrl}/bio/${esc(profile.username)}">

  <!-- Open Graph -->
  <meta property="og:title" content="${esc(profile.meta_title || displayName)}">
  <meta property="og:description" content="${esc(profile.meta_description || bioText.substring(0, 160))}">
  <meta property="og:type" content="profile">
  <meta property="og:url" content="${baseUrl}/bio/${esc(profile.username)}">
  ${avatarUrl ? `<meta property="og:image" content="${esc(avatarUrl)}">` : ''}
  <meta property="og:profile:username" content="${esc(profile.username)}">
  <meta name="theme-color" content="${esc(color)}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(profile.meta_title || displayName)}">
  <meta name="twitter:description" content="${esc(profile.meta_description || bioText.substring(0, 160))}">
  ${avatarUrl ? `<meta name="twitter:image" content="${esc(avatarUrl)}">` : ''}

  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "mainEntity": {
      "@type": "Person",
      "name": displayName,
      "description": bioText.substring(0, 300),
      "url": `${baseUrl}/bio/${profile.username}`,
      ...(avatarUrl ? { "image": avatarUrl } : {}),
      "sameAs": socialList.filter(s => s.url).map(s => s.url)
    }
  })}</script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;min-height:100vh;${bgCSS(bg, color, profile.bg_image, profile.bg_video)}color:#fff;overflow-x:hidden}
    ${bg === 'custom-image' ? '.bio-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);z-index:0}' : ''}
    ${bg === 'custom-video' ? '.bio-video-bg{position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:0}.bio-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:0}' : ''}
    ${bg === 'noise' ? '.bio-noise{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;opacity:0.3;pointer-events:none}' : ''}
    ${bg === 'gradient-shift' ? '@keyframes bgShift{0%{background-position:0 50%}50%{background-position:100% 50%}100%{background-position:0 50%}}' : ''}
    .bio-container{position:relative;z-index:1;max-width:480px;margin:0 auto;padding:40px 20px 60px;text-align:center;min-height:100vh}
    .bio-avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid ${color}66;margin-bottom:16px}
    .bio-avatar-placeholder{width:96px;height:96px;border-radius:50%;background:${color}33;display:inline-flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:${color};margin-bottom:16px;border:3px solid ${color}66}
    .bio-name{font-size:1.5rem;font-weight:700;margin-bottom:8px;color:#fff}
    .bio-text{font-size:0.95rem;color:rgba(255,255,255,0.75);margin-bottom:24px;line-height:1.5;white-space:pre-wrap}
    .bio-socials{display:flex;justify-content:center;gap:12px;margin-bottom:28px;flex-wrap:wrap}
    .bio-social-icon{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:all .2s;text-decoration:none;background:rgba(255,255,255,0.1);backdrop-filter:blur(4px)}
    .bio-social-icon:hover{transform:scale(1.15);background:rgba(255,255,255,0.2)}
    .bio-social-icon svg{width:20px;height:20px;fill:#fff}
    .bio-links{display:flex;flex-direction:column;gap:12px;margin-bottom:28px}
    .bio-link{display:flex;align-items:center;justify-content:center;padding:14px 24px;text-decoration:none;font-weight:500;font-size:0.95rem;transition:all .2s;min-height:52px;${BTN_STYLES[btnStyle] ? BTN_STYLES[btnStyle](color) : BTN_STYLES.glass(color)}}
    .bio-link:hover{transform:translateY(-2px);filter:brightness(1.1)}
    .bio-link-icon{margin-right:10px;font-size:1.1rem}
    .bio-footer{margin-top:40px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.1)}
    .bio-footer a{color:rgba(255,255,255,0.45);text-decoration:none;font-size:0.75rem;padding:6px 16px;border-radius:20px;border:1px solid rgba(255,255,255,0.1);transition:all 0.2s;display:inline-block}
    .bio-footer a:hover{color:rgba(255,255,255,0.8);border-color:rgba(255,255,255,0.25);background:rgba(255,255,255,0.05)}
  </style>
</head>
<body>
  ${bg === 'custom-video' && profile.bg_video ? `<video class="bio-video-bg" autoplay muted loop playsinline><source src="${esc(profile.bg_video)}" type="video/mp4"></video>` : ''}
  ${(bg === 'custom-image' || bg === 'custom-video') ? '<div class="bio-overlay"></div>' : ''}
  ${bg === 'noise' ? '<svg class="bio-noise" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>' : ''}
  ${canvasScript(bg, color)}

  <div class="bio-container">
    ${profile.show_avatar ? (avatarUrl
      ? `<img class="bio-avatar" src="${esc(avatarUrl)}" alt="${esc(displayName)}" onerror="this.style.display='none'">`
      : `<div class="bio-avatar-placeholder">${esc(displayName.charAt(0).toUpperCase())}</div>`)
    : ''}

    <h1 class="bio-name">${esc(displayName)}</h1>
    ${bioText ? `<p class="bio-text">${esc(bioText)}</p>` : ''}
    <!-- [ads-slot bio-top 300x250] -->
    <div data-ad-slot="bio-top" data-ad-format="300x250" style="margin:18px auto;max-width:300px"></div>

    ${socialList.length > 0 ? `<div class="bio-socials">
      ${socialList.filter(s => s.url).map(s => {
        const icon = SOCIAL_ICONS[s.platform];
        if (!icon) return '';
        return `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" class="bio-social-icon" title="${esc(s.platform)}" data-social-id="${s.id || 0}" data-bio-id="${profile.id}">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${icon.svg}</svg>
        </a>`;
      }).join('')}
    </div>` : ''}

    ${links.length > 0 ? `<div class="bio-links">
      ${links.map(link => {
        const type = link.type || 'link';
        if (type === 'heading') {
          return '<div class="bio-public-heading">' + esc(link.title || '') + '</div>';
        } else if (type === 'text') {
          return '<div class="bio-public-text">' + esc(link.content || '') + '</div>';
        } else if (type === 'image' && link.url) {
          return '<div class="bio-public-image"><img src="' + esc(link.url) + '" alt="' + esc(link.title || '') + '" loading="lazy"></div>';
        } else if (type === 'divider') {
          return '<hr class="bio-public-divider">';
        } else if (type === 'shop_widget') {
          // Embed user's primary shop products. Config in link.content (JSON).
          let cfg = {}; try { cfg = JSON.parse(link.content || '{}') || {}; } catch (_) {}
          const limit = Math.max(1, Math.min(24, parseInt(cfg.limit, 10) || 8));
          const onlyFeatured = cfg.featured_only === true;
          let shop = null;
          let products = [];
          try { shop = db.prepare('SELECT * FROM user_shops WHERE user_id = ?').get(profile.user_id); }
          catch (_) {}
          if (shop) {
            try {
              const where = onlyFeatured ? 'sp.shop_id = ? AND p.is_active = 1 AND sp.is_featured = 1' : 'sp.shop_id = ? AND p.is_active = 1';
              products = db.prepare(
                "SELECT p.*, sp.is_featured FROM shop_products sp JOIN user_products p ON p.id = sp.product_id WHERE " + where + " ORDER BY sp.is_featured DESC, sp.position ASC LIMIT ?"
              ).all(shop.id, limit);
            } catch (_) {}
          }
          if (!shop || !products.length) {
            return '<div class="bio-shop-widget-empty" style="padding:18px;background:rgba(0,0,0,.15);border:1px dashed rgba(255,255,255,.12);border-radius:12px;text-align:center;color:#9ca3af;font-size:13px">🛍 Магазин пока пуст</div>';
          }
          const heading = (link.title || '🛍 Мой магазин');
          const shopUrl = '/cabinet/shop/' + shop.slug;
          let widget = '<div class="bio-shop-widget" style="margin:14px 0">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><strong style="color:#fff;font-size:16px">' + esc(heading) + '</strong>' +
            '<a href="' + esc(shopUrl) + '" style="color:#00D4FF;font-size:12px;text-decoration:none">Открыть магазин →</a></div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">';
          products.forEach(function (p) {
            const slug = p.slug || 'p';
            const cardUrl = '/cabinet/p/' + slug + '-' + p.id + '?ref=' + profile.user_id;
            const stars = p.reviews_count ? ('★'.repeat(Math.round(p.avg_rating || 0))) : '';
            widget += '<a href="' + esc(cardUrl) + '" style="text-decoration:none;color:inherit;background:rgba(13,17,36,.6);border:1px solid rgba(255,255,255,.08);border-radius:10px;overflow:hidden;display:block;transition:transform .15s">' +
              '<div style="height:100px;background:' + (p.preview_image ? "url('" + esc(p.preview_image) + "') center/cover" : 'linear-gradient(135deg,rgba(0,212,255,.2),rgba(177,74,237,.2))') + ';position:relative">' +
                '<span style="position:absolute;top:6px;right:6px;background:#10b981;color:#fff;padding:2px 7px;border-radius:5px;font-size:11px;font-weight:800">$' + Number(p.price_usd || 0).toFixed(2) + '</span>' +
              '</div>' +
              '<div style="padding:8px"><div style="color:#fff;font-size:12px;font-weight:600;line-height:1.3;margin-bottom:3px">' + esc((p.title || '').slice(0, 40)) + '</div>' +
              (stars ? '<div style="color:#fbbf24;font-size:11px">' + stars + '</div>' : '') + '</div>' +
            '</a>';
          });
          widget += '</div></div>';
          return widget;
        } else {
          return '<a href="' + esc(link.url || '#') + '" target="_blank" rel="noopener noreferrer" class="bio-link" data-link-id="' + link.id + '" data-bio-id="' + profile.id + '">' +
            (link.icon ? '<span class="bio-link-icon">' + esc(link.icon) + '</span>' : '') +
            esc(link.title || link.url) + '</a>';
        }
      }).join('')}
    </div>` : ''}

    <div class="bio-footer">\n      <a href="${footerUrl}" target="_blank" rel="noopener">Создано с Golden Connect</a>
    </div>
  </div>

  <script>
var _abTestId=${abTestId||'null'},_abVariant='${abVariant}';
      var _abTestId = ${abTestId || 'null'};
      var _abVariant = '${abVariant}';
    // Track page visit
    if (!sessionStorage.getItem('bio_v_${profile.id}')) {
      sessionStorage.setItem('bio_v_${profile.id}', '1');
      fetch('/api/shortener/bio/track/visit', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({bio_id: ${profile.id}, ref: document.referrer || ''})
      }).catch(()=>{});
    }

    // Track link clicks
    document.querySelectorAll('.bio-link').forEach(el => {
      el.addEventListener('click', function(e) {
        const linkId = this.dataset.linkId;
        const bioId = this.dataset.bioId;
        if (linkId && bioId) {
          navigator.sendBeacon('/api/shortener/bio/track/link-click',
            JSON.stringify({bio_id: Number(bioId), link_id: Number(linkId)}));
          if(_abTestId) navigator.sendBeacon('/api/shortener/bio/track/ab-click',
            JSON.stringify({test_id:_abTestId, variant:_abVariant}));
        }
      });
    });

    // Track social clicks
    document.querySelectorAll('.bio-social-icon').forEach(el => {
      el.addEventListener('click', function(e) {
        const socialId = this.dataset.socialId;
        const bioId = this.dataset.bioId;
        if (socialId && bioId) {
          navigator.sendBeacon('/api/shortener/bio/track/social-click',
            JSON.stringify({bio_id: Number(bioId), social_id: Number(socialId)}));
        }
      });
    });
  </script>
<script src="https://golden-connect.to/cabinet/js/ad-loader.js?v=1" defer></script>
</body>
</html>`;

    res.send(html);
  } catch (err) {
    console.error('Bio page error:', err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
