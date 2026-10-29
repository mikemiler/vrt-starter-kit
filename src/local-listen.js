// Starts a server that only this laptop can reach, on both ways of saying
// "this computer": 127.0.0.1 (IPv4) and ::1 (IPv6). Browsers often try ::1
// first for "localhost". If another program already uses the port on either
// one, we notice it and say so, instead of the browser showing that program.
import http from 'node:http';

export function listenLocal(handler, port, { name, isOurs, onListening, envVar }) {
  const hosts = process.env.HOST ? [process.env.HOST] : ['127.0.0.1', '::1'];
  const servers = [];
  let pending = hosts.length;
  let failed = false;

  const ready = () => { if (--pending === 0 && !failed) onListening(servers); };

  const inUse = async () => {
    if (failed) return;
    failed = true;
    for (const s of servers) s.close();
    if (await isOurs().catch(() => false)) {
      console.log(`\n  The ${name} is already running: http://localhost:${port}\n`);
      process.exit(0);
    }
    console.log(`\n  ✘ Port ${port} is used by another program on your computer, so the ${name} can't start.`);
    console.log(`    → Close that program, or start with another port: ${envVar}=${port + 100} npm start`);
    console.log(`    → Mac: see which program it is with  lsof -nP -iTCP:${port} -sTCP:LISTEN\n`);
    process.exit(1);
  };

  for (const host of hosts) {
    const server = http.createServer(handler);
    servers.push(server);
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') return inUse();
      // No IPv6 on this computer: fine, IPv4 alone is enough.
      if (['EADDRNOTAVAIL', 'EAFNOSUPPORT', 'EINVAL'].includes(err.code) && host === '::1') return ready();
      throw err;
    });
    server.listen(port, host, ready);
  }
}

// Asks whoever answers on the port whether it is one of ours. Only true if
// every address that answers is ours (another program on ::1 counts as foreign).
export async function answersWith(port, path, check) {
  let ours = false;
  for (const host of ['127.0.0.1', '[::1]']) {
    let res;
    try { res = await fetch(`http://${host}:${port}${path}`, { signal: AbortSignal.timeout(1500) }); } catch { continue; }
    if (!(await check(res).catch(() => false))) return false;
    ours = true;
  }
  return ours;
}
