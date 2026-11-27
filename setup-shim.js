// Заменяет better-sqlite3 на встроенный в Node (node:sqlite). Нужен Node 22.5+.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'node_modules', 'better-sqlite3');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'better-sqlite3', version: '0.0.0-shim', main: 'index.js' }));
fs.writeFileSync(path.join(dir, 'index.js'), `
const { DatabaseSync } = require('node:sqlite');
class Database {
  constructor(file){ this.d = new DatabaseSync(file); }
  pragma(s){ try { return this.d.prepare('PRAGMA '+s).all(); } catch(e){ return []; } }
  exec(s){ return this.d.exec(s); }
  prepare(sql){
    const st=this.d.prepare(sql);
    const fix=a=>a.map(x=>x===undefined?null:(typeof x==='boolean'?+x:x));
    return { run:(...a)=>{const r=st.run(...fix(a));return {changes:Number(r.changes),lastInsertRowid:Number(r.lastInsertRowid)};},
      get:(...a)=>st.get(...fix(a)), all:(...a)=>st.all(...fix(a)), iterate:(...a)=>st.iterate(...fix(a)) };
  }
  transaction(fn){ return (...a)=>{ this.d.exec('BEGIN'); try{ const r=fn(...a); this.d.exec('COMMIT'); return r;}catch(e){ this.d.exec('ROLLBACK'); throw e; } }; }
  async backup(f){ this.d.exec("VACUUM INTO '"+f.replace(/'/g,"''")+"'"); }
  close(){ this.d.close(); }
}
module.exports = Database;
`);
console.log('better-sqlite3 shim установлен');
