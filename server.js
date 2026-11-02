// Kaavu server: serves index.html + runs rooms over WebSocket. Run: npm install && npm start
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const LAMPS = [[-8,-10],[3.5,-14],[-40,-30],[44,-4],[24.5,-49.5]]; // keep same as index.html
const rooms = {};
let nid = 1;

const server = http.createServer((q, r) =>
  fs.readFile(path.join(__dirname, 'index.html'), (e, d) => {
    r.writeHead(e ? 500 : 200, { 'Content-Type': 'text/html' }); r.end(e ? 'error' : d);
  }));
const wss = new WebSocketServer({ server });
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const newRoom = code => ({ code, players: {}, taken: [], won: 0, sp: { x: 0, z: -30, mode: 'stalk', t: 20 } });

wss.on('connection', ws => {
  let p = null, r = null;
  ws.on('message', m => {
    let d; try { d = JSON.parse(m); } catch { return; }
    if (d.t === 'join' && !p) {
      const code = String(d.room || 'village').slice(0, 12);
      r = rooms[code] || (rooms[code] = newRoom(code));
      if (Object.keys(r.players).length >= 4) return send(ws, { t: 'full' });
      p = r.players[nid] = { id: nid, ws, name: String(d.name || 'Friend').slice(0, 12),
        x: (Math.random() - .5) * 4, z: 45, ry: 0, safe: Date.now() + 8000 };
      send(ws, { t: 'init', id: nid++ });
    } else if (p && d.t === 'pos' && isFinite(d.x) && isFinite(d.z)) {
      p.x = +d.x; p.z = +d.z; p.ry = +d.ry || 0;
    } else if (p && d.t === 'pickup' && LAMPS[d.id] && !r.taken.includes(d.id) &&
               Math.hypot(p.x - LAMPS[d.id][0], p.z - LAMPS[d.id][1]) < 4) {
      r.taken.push(d.id);
      if (r.taken.length === LAMPS.length) r.won = Date.now() + 15000;
    }
  });
  ws.on('close', () => {
    if (!p) return;
    delete r.players[p.id];
    if (!Object.keys(r.players).length) delete rooms[r.code];
  });
});

setInterval(() => {
  const now = Date.now(), dt = 0.05;
  for (const r of Object.values(rooms)) {
    const ps = Object.values(r.players), s = r.sp;
    if (r.won && now > r.won) { r.taken = []; r.won = 0; s.x = 0; s.z = -30; s.mode = 'stalk'; s.t = 20; ps.forEach(p => p.safe = now + 5000); }
    if (!r.won) {
      const targets = ps.filter(p => p.safe < now);
      s.t -= dt;
      if (s.t <= 0) { s.mode = s.mode === 'stalk' ? 'hunt' : 'stalk'; s.t = s.mode === 'hunt' ? 14 : 22; }
      let near = null, nd = 1e9;
      for (const p of targets) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < nd) { nd = d; near = p; } }
      if (near && nd > 0.01) {
        const sp = s.mode === 'hunt' ? 3.6 + 0.25 * r.taken.length : 1.6;
        s.x += (near.x - s.x) / nd * sp * dt; s.z += (near.z - s.z) / nd * sp * dt;
      }
      if (near && nd < 1.4) { // caught: respawn them, push spirit away
        send(near.ws, { t: 'caught' }); near.safe = now + 7000;
        const a = Math.random() * 6.28;
        s.x = Math.max(-60, Math.min(60, near.x + Math.cos(a) * 40));
        s.z = Math.max(-60, Math.min(60, near.z + Math.sin(a) * 40));
        s.mode = 'stalk'; s.t = 20;
      }
    }
    const msg = { t: 's', p: ps.map(p => [p.id, p.name, p.x, p.z, p.ry]), s: [s.x, s.z, s.mode], l: r.taken, w: r.won ? 1 : 0 };
    ps.forEach(p => send(p.ws, msg));
  }
}, 50);

server.listen(PORT, () => console.log('Kaavu running on http://localhost:' + PORT));
