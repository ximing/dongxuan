import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {ListPage} from '@dongxuan/dto';
import {config} from '../config.js';
import {getPool} from '../db/index.js';
import {AppError} from '../errors.js';
import {fingerprint} from './prompt-engine.js';
import type {Row} from './store.js';
const schema=z.object({limit:z.coerce.number().int().min(1).max(100).optional(),cursor:z.string().min(1).max(2048).optional()});
type Cursor={v:1;u:string;s:string;f:string;t:string;id:string;r?:number};
const signature=(data:string)=>createHmac('sha256',config.JWT_SECRET).update('list-cursor-v1:'+data).digest();
function encode(c:Cursor){const data=Buffer.from(JSON.stringify(c)).toString('base64url');return data+'.'+signature(data).toString('base64url');}
function decode(value:string,user:string,scope:string,filter:string):Cursor{try{const parts=value.split('.');if(parts.length!==2)throw Error();const [data,sig]=parts,raw=Buffer.from(sig,'base64url'),expected=signature(data);if(raw.length!==expected.length||!timingSafeEqual(raw,expected))throw Error();const c=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));if(c.v!==1||c.u!==user||c.s!==scope||c.f!==filter||typeof c.t!=='string'||!Number.isFinite(Date.parse(c.t))||!z.string().uuid().safeParse(c.id).success||(c.r!==undefined&&!Number.isInteger(c.r)))throw Error();return c;}catch{throw AppError.of(400,'INVALID_CURSOR','分页游标无效，或不属于当前账号、列表和筛选条件，请重新加载第一页');}}
/** No pagination parameters retains the existing complete-array contract. */
export async function listPage<T>(rawQuery:unknown,opts:{userId:string;scope:string;filters:unknown;sql:string;values:unknown[];direction?:'ASC'|'DESC';ranked?:boolean},map:(row:Row)=>T):Promise<T[]|ListPage<T>>{
 const q=schema.parse(rawQuery),enabled=q.limit!==undefined||q.cursor!==undefined,limit=q.limit??50,filter=fingerprint(opts.filters),c=q.cursor?decode(q.cursor,opts.userId,opts.scope,filter):undefined,direction=opts.direction??'DESC',values=[...opts.values];
 let sql=`SELECT p.*,p.created_at::text AS _cursor_time FROM (${opts.sql}) p`;
 if(c){const keys=opts.ranked?'p._sort_rank,p.created_at,p.id':'p.created_at,p.id';const args:unknown[]=opts.ranked?[c.r,c.t,c.id]:[c.t,c.id];const slots=args.map((value,i)=>{values.push(value);return '$'+values.length+(i===args.length-1?'::uuid':i===args.length-2?'::timestamptz':'::int');});sql+=` WHERE (${keys}) ${direction==='ASC'?'>':'<'} (${slots.join(',')})`;}
 sql+=` ORDER BY ${opts.ranked?'p._sort_rank '+direction+',':''}p.created_at ${direction},p.id ${direction}`;
 if(enabled){values.push(limit+1);sql+=' LIMIT $'+values.length;}
 const rows=(await getPool().query(sql,values)).rows as Row[];if(!enabled)return rows.map(map);
 const hasMore=rows.length>limit,items=rows.slice(0,limit),last=items.at(-1);const nextCursor=hasMore&&last?encode({v:1,u:opts.userId,s:opts.scope,f:filter,t:last._cursor_time,id:last.id,...(opts.ranked?{r:last._sort_rank}:{})}):null;
 return {items:items.map(map),nextCursor,hasMore};
}
