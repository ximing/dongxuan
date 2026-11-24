import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,openSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const cwd=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [command='dev',...args]=process.argv.slice(2);
const port=process.env.DONGXUAN_LOCAL_PORT||'3041';
const stateDir=path.join(cwd,'.runtime.local'),pidPath=path.join(stateDir,`server-${port}.pid`),logPath=path.join(stateDir,`server-${port}.log`);
const env={...process.env,DONGXUAN_INTEGRATION:command==='test'?'1':'0',NODE_ENV:command==='test'?'test':'development',PG_HOST:'127.0.0.1',PG_PORT:'55439',PG_USER:'dongxuan_dev',PG_PASSWORD:'dongxuan_local_only',PG_DATABASE:process.env.DONGXUAN_LOCAL_DB||(command==='test'?'dongxuan_test':'dongxuan_dev'),PG_SSL:'false',PORT:port,WEB_ORIGIN:process.env.DONGXUAN_LOCAL_ORIGIN||'http://localhost:5192',JWT_SECRET:'local-development-secret-change-in-production',COOKIE_SECRET:'local-cookie-secret-change-in-production',OIDC_ISSUER:'',OIDC_CLIENT_ID:'',OIDC_CLIENT_SECRET:'',OIDC_REDIRECT_URI:'',OIDC_ADMIN_USER:'',OIDC_ADMIN_PASSWORD:''};
if(command==='background'){
 mkdirSync(stateDir,{recursive:true});
 const {createServer}=await import('node:net');
 await new Promise((resolve,reject)=>{const check=createServer();check.once('error',()=>reject(Error(`端口 ${port} 已被占用，请先停止当前本地服务`)));check.listen(Number(port),'127.0.0.1',()=>check.close(resolve));});
 const fd=openSync(logPath,'a'),p=spawn(process.execPath,['--import','tsx',path.join(cwd,'src/index.ts')],{cwd,env,detached:true,stdio:['ignore',fd,fd]});
 if(!p.pid)throw Error('后台进程启动失败');writeFileSync(pidPath,String(p.pid));p.unref();console.log(`本地服务后台启动 PID ${p.pid}，http://127.0.0.1:${port}；日志 ${logPath}。请检查日志或 /health 确认就绪。`);
}else if(command==='stop'){
 const pid=Number(readFileSync(pidPath,'utf8'));if(!Number.isSafeInteger(pid)||pid<=0)throw Error('本地 PID 文件无效');
 const ps=spawnSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'});if(!ps.stdout.includes(path.join(cwd,'src/index.ts')))throw Error('PID 不再属于本项目本地服务，未发送信号');
 process.kill(-pid,'SIGTERM');unlinkSync(pidPath);console.log('已停止本项目后台本地服务');
}else{
 const commands={dev:['pnpm',['exec','tsx','watch','src/index.ts']],start:['pnpm',['exec','tsx','src/index.ts']],migrate:['pnpm',['exec','tsx','src/db/migrate.ts']],backfill:['pnpm',['exec','tsx','src/v2/backfill.ts']],test:['pnpm',['exec','vitest','run',...args]]};
 if(!(command in commands))throw Error('local-env supports dev/start/background/stop/migrate/backfill/test');
 if(command==='test'){const setup=spawnSync('docker',['exec','dongxuan-dev-pg','sh','-c',"psql -U dongxuan_dev -d postgres -tc \"SELECT 1 FROM pg_database WHERE datname = 'dongxuan_test'\" | grep -q 1 || createdb -U dongxuan_dev dongxuan_test"],{stdio:'inherit'});if(setup.status!==0)throw Error('请先执行 pnpm dev:local:db');}
 const [bin,argv]=commands[command],p=spawn(bin,argv,{cwd,env,stdio:'inherit'});p.on('exit',code=>process.exit(code??1));for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>p.kill(sig));
}
