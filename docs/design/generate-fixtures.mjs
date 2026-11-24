import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../apps/server/package.json'));
const { astro } = require('iztro');
const { version } = require('iztro/package.json');
const skill = process.argv[2];
if (!skill) throw new Error('请传入 iztro-chart 技能目录');
const skillRequire=createRequire(path.join(skill,'scripts/chart.mjs'));
const {lunar2solar}=skillRequire('lunar-lite');
const rules = { yearDivide: 'normal', horoscopeDivide: 'normal', ageDivide: 'normal', dayDivide: 'forward', algorithm: 'default', language: 'zh-CN' };
astro.config(rules);
const profiles = [
  { id: 'lin', title: '我的示例盘 · 申时', name: '我（示例）', date: '1993-3-1', timeIndex: 8, gender: '男' },
  { id: 'gu', title: '小顾 · 辰时本命', name: '小顾（示例）', date: '1990-6-18', timeIndex: 4, gender: '女' },
  { id: 'free', title: '晚子时 · 一张示例盘', name: '晚子示例', date: '2000-8-16', timeIndex: 12, gender: '男' },
];
const dates = ['2016-11-15', '2025-11-15', '2026-10-15', '2027-11-15', '2028-11-15', '2036-11-15', '2026-11-01', '2026-11-09', '2026-11-15', '2026-11-23', '2026-12-09'];
const monthStarts = ['2026-10','2026-11','2026-12'];
const monthSequence=(start,count)=>Array.from({length:count},(_,i)=>{const [y,m]=start.split('-').map(Number),d=new Date(Date.UTC(y,m-1+i,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;});
const iso=d=>d.toISOString().slice(0,10);
function validateBlock(block){if(!block||block.palaceNames?.length!==12||block.mutagen?.length!==4||block.stars?.length!==12||block.stars.some(s=>!Array.isArray(s)))throw new Error('运限数据不完整');}
function monthWindows(a,text){
 const cache=new Map();const get=d=>{if(!cache.has(d)){const h=a.horoscope(d,0);for(const key of ['decadal','yearly','monthly'])validateBlock(h[key]);cache.set(d,{h,key:createHash('sha256').update(JSON.stringify({decadal:h.decadal,yearly:h.yearly,monthly:h.monthly,age:h.age.nominalAge})).digest('hex')});}return cache.get(d);};
 const normalized=s=>s.split('-').map((v,i)=>i?String(Number(v)).padStart(2,'0'):v).join('-');
 return Object.fromEntries(monthStarts.flatMap(start=>[1,2,3,4,5,6].map(count=>{
  const months=monthSequence(start,count),raw=text(['--months',months.join(',')]),from=months[0]+'-01',next=monthSequence(start,count+1).at(-1)+'-01',endDate=new Date(next+'T00:00:00Z');endDate.setUTCDate(endDate.getUTCDate()-1);const to=iso(endDate),segments=[];
  for(let d=new Date(from+'T00:00:00Z');d<=endDate;d.setUTCDate(d.getUTCDate()+1)){const day=iso(d),{h,key}=get(day);if(segments.at(-1)?.key===key)segments.at(-1).to=day;else segments.push({from:day,to:day,key,age:h.age.nominalAge,year:h.yearly.heavenlyStem+h.yearly.earthlyBranch,decade:h.decadal.heavenlyStem+h.decadal.earthlyBranch,month:h.monthly.heavenlyStem+h.monthly.earthlyBranch});}
  const coverage=[...raw.matchAll(/^(流月  )?阳历 (\d+-\d+-\d+) 至 (\d+-\d+-\d+).*$/gm)].map(m=>({full:!!m[1],from:normalized(m[2]),to:normalized(m[3])}));
  let cursor=from;for(const c of coverage){if(c.from!==cursor)throw new Error('月份覆盖缺口 '+start);const date=new Date(c.to+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+1);cursor=iso(date);}if(cursor!==next)throw new Error('月份范围不完整');
  const provided=new Set();for(const c of coverage){const key=get(c.from).key;for(let day=new Date(c.from+'T00:00:00Z');iso(day)<=c.to;day.setUTCDate(day.getUTCDate()+1)){if(get(iso(day)).key!==key)throw new Error('脚本文本覆盖段内存在未拆分的运限变化 '+iso(day));}if(c.full)provided.add(key);else if(!provided.has(key))throw new Error('重复段未引用此前完整结果 '+c.from);}if(segments.some(seg=>!provided.has(seg.key)))throw new Error('脚本文本漏掉实际运限状态段');
  return [start+':'+count,{months,text:raw,manifest:{complete:true,from,to,segments,coverage}}];
 })));
}
function yearSeries(a,year){
 const start=lunar2solar(`${year}-1-1`,false),end=lunar2solar(`${year+1}-1-1`,false);
 const first=new Date(Date.UTC(start.solarYear,start.solarMonth-1,start.solarDay)),last=new Date(Date.UTC(end.solarYear,end.solarMonth-1,end.solarDay));last.setUTCDate(last.getUTCDate()-1);
 const segments=[];let previous='';for(let d=new Date(first);d<=last;d.setUTCDate(d.getUTCDate()+1)){const h=a.horoscope(iso(d),0);validateBlock(h.decadal);validateBlock(h.yearly);const result={decadal:h.decadal,yearly:h.yearly,age:h.age};const key=JSON.stringify(result);if(key!==previous){segments.push({from:iso(d),to:iso(d),result});previous=key;}else segments.at(-1).to=iso(d);}
 const mut=b=>b.mutagen.map((n,i)=>n+'化'+['禄','权','科','忌'][i]).join('、');
 const star=s=>s.name+(s.brightness?' '+s.brightness:'')+(s.mutagen?' 化'+s.mutagen:'');
 const text=segments.map(segment=>{const h=segment.result;return [`流年 ${year}（春节为界）  ${segment.from} 至 ${segment.to}`,`虚岁 ${h.age.nominalAge}；流年 ${h.yearly.heavenlyStem+h.yearly.earthlyBranch}；大限 ${h.decadal.heavenlyStem+h.decadal.earthlyBranch}`,`大限四化 ${mut(h.decadal)}`,`流年四化 ${mut(h.yearly)}`,...a.palaces.map((p,i)=>`${p.earthlyBranch} · 本命${p.name} · 大限${h.decadal.palaceNames[i]} · 流年${h.yearly.palaceNames[i]}\n  主星 ${p.majorStars.map(star).join('、')||'无'}\n  辅星 ${p.minorStars.map(star).join('、')||'无'}\n  杂曜 ${p.adjectiveStars.map(star).join('、')||'无'}\n  大限流曜 ${h.decadal.stars[i].map(s=>s.name).join('、')||'无'}\n  流年流曜 ${h.yearly.stars[i].map(s=>s.name).join('、')||'无'}`)].join('\n\n');}).join('\n\n');
 return {year,from:iso(first),to:iso(last),segments,text};
}
const out = { version, rules, referenceSha256:createHash('sha256').update(readFileSync(path.join(skill,'scripts/chart.mjs'))).digest('hex'), generatedFor: '东玄个人排盘设计稿，仅示例', profiles: {} };
for (const p of profiles) {
  const a = astro.bySolar(p.date, p.timeIndex, p.gender, true, 'zh-CN');
  const args = [path.join(skill, 'scripts/chart.mjs'), '--solar', p.date, '--time-index', String(p.timeIndex), '--gender', p.gender];
  const text = (extra = []) => execFileSync(process.execPath, [...args, ...extra], { encoding: 'utf8' });
  out.profiles[p.id] = {
    ...p,
    natal: JSON.parse(JSON.stringify(a)),
    natalText: text(),
    yearSeries:Object.fromEntries([2026,2027,2028].map(year=>[year,yearSeries(a,year)])),
    decadeViews: Object.fromEntries(dates.map(date=>[date,text(['--decades','--as-of',date])])),
    monthText: text(['--months', '2026-11,2026-12']),
    monthWindows: monthWindows(a,text),
    views: Object.fromEntries(dates.map(date => [date, {
      result: JSON.parse(JSON.stringify(a.horoscope(date, 0))),
      text: text(['--on', date]),
      dailyText: text(['--on', date, '--daily']),
    }])),
  };
}
writeFileSync(path.join(here, 'fixtures.js'), `/* 合成示例；由 generate-fixtures.mjs 生成，星曜不手填。 */\nwindow.DX_FIXTURES = ${JSON.stringify(out)};\n`);
console.log(`已生成 ${profiles.length} 张本命及指定日视图，iztro ${version}`);
