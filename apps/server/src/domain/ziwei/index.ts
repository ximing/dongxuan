import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { astro } from 'iztro';
import { solar2lunar, lunar2solar, getHeavenlyStemAndEarthlyBranchBySolarDate } from 'lunar-lite';
import { ZIWEI_RULES, ziweiInputSchema, ziweiQuerySchema, type ZiweiInput, type ZiweiNatalResult, type ZiweiQuery, type ZiweiViewResult, type ZiweiDayResult, type ZiweiSegment, type HoroscopeLayer, type ZiweiDecade, type DateRange, type EngineMeta, type SystemCapability, type PalaceView, type StarView } from '@dongxuan/dto';
import type { ZiweiFlowOptions, ZiweiMonthPeriod, ZiweiSelectedDecade } from '@dongxuan/dto';
export { renderLegacy } from './legacy.js';

const require = createRequire(import.meta.url);
export const ENGINE_META: EngineMeta = Object.freeze({ engine: 'iztro', engineVersion: require('iztro/package.json').version as string, calendarVersion: require('lunar-lite/package.json').version as string, adapterVersion: 'dongxuan-ziwei-v2', textVersion: 'ziwei-text-v2', referenceSha256: '9f7f4a76effb1e4780a23632e04f6808d715991685a9a5b4601ff125a19c4a42' });
export const ZIWEI_CAPABILITY: SystemCapability = { id: 'ziwei', name: '紫微斗数', status: 'available', calculation: true, birthDateRange: { from: '1901-01-01', to: '2099-12-31' }, targetDateRange: { from: '1901-01-01', to: '2099-12-31' } };
const MIN_DATE = '1901-01-01', MAX_DATE = '2099-12-31';
const BRANCHES = ['寅','卯','辰','巳','午','未','申','酉','戌','亥','子','丑'];
const MUTAGEN = ['禄','权','科','忌'];
export class ZiweiError extends Error { constructor(message: string) { super(message); this.name = 'ZiweiError'; } }
function fail(message: string): never { throw new ZiweiError(message); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) fail(message); }
const iso = (date: Date) => date.toISOString().slice(0,10);
const shift = (date: string, days: number) => { const d = new Date(date+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return iso(d); };
function parts(value: string): [number,number,number] { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value); assert(m, '日期应为 YYYY-MM-DD'); return [Number(m[1]),Number(m[2]),Number(m[3])]; }
function solarDate(value: string): string { const [y,m,d] = parts(value); const date = new Date(Date.UTC(y,m-1,d)); assert(date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d, '阳历日期不存在'); return iso(date); }
function supported(date: string, label: string) { assert(date>=MIN_DATE && date<=MAX_DATE, `${label}超出支持范围 ${MIN_DATE} 至 ${MAX_DATE}`); }
function json<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function validateInput(raw: ZiweiInput): { input: ZiweiInput; birthSolarDate: string } {
 const parsed = ziweiInputSchema.safeParse(raw); assert(parsed.success, '出生资料不完整或格式不正确'); const input = parsed.data;
 let birthSolarDate: string;
 if (input.calendar==='solar') { assert(!input.isLeapMonth, '阳历输入不能标记农历闰月'); birthSolarDate=solarDate(input.date); }
 else { const [y,m,d]=parts(input.date); assert(y>=1900&&y<=2099&&m>=1&&m<=12&&d>=1&&d<=30, '农历日期不正确'); let s:ReturnType<typeof lunar2solar>;try{s=lunar2solar(`${y}-${m}-${d}`,input.isLeapMonth??false);}catch{fail('该农历日期或闰月不存在，请核对年月日与闰月标记');} birthSolarDate=solarDate(`${s.solarYear}-${s.solarMonth}-${s.solarDay}`); const back=solar2lunar(birthSolarDate); assert(back.lunarYear===y&&back.lunarMonth===m&&back.lunarDay===d&&back.isLeap===(input.isLeapMonth??false), '该农历日期或闰月不存在，请核对年月日与闰月标记'); }
 supported(birthSolarDate,'出生日期');
 if (input.clock) { const [hours,minutes]=input.clock.split(':').map(Number); const index=hours===0?0:Math.floor((hours*60+minutes+60)/120); assert(index===input.timeIndex, '原始钟点与所选时辰不一致，请核对早子/晚子'); }
 return { input, birthSolarDate };
}
function stars(raw: unknown, label: string): StarView[] { assert(Array.isArray(raw), `${label}星曜结构缺失`); return raw.map((item: unknown) => { assert(item&&typeof item==='object','星曜数据不完整'); const s=item as Record<string,unknown>; assert(typeof s.name==='string'&&s.name.length>0,'星曜名称缺失'); return {name:s.name,...(typeof s.brightness==='string'&&s.brightness?{brightness:s.brightness}:{}),...(typeof s.mutagen==='string'&&s.mutagen?{mutagen:s.mutagen}:{})}; }); }
function readPalaces(a: ReturnType<typeof astro.withOptions>): PalaceView[] {
 assert(Array.isArray(a.palaces)&&a.palaces.length===12, '排盘结果缺少十二宫');
 const palaces=a.palaces.map((p,i) => { assert(p.index===i&&BRANCHES.includes(p.earthlyBranch)&&p.name&&p.heavenlyStem, '宫位索引或名称不完整'); assert(p.decadal?.range?.length===2&&p.decadal.range.every(Number.isInteger),'大限区间不完整'); assert(Array.isArray(p.ages)&&p.ages.every(Number.isInteger),'小限年龄结构不完整'); return { index:p.index, name:p.name, heavenlyStem:p.heavenlyStem, earthlyBranch:p.earthlyBranch, isBodyPalace:p.isBodyPalace,isOriginalPalace:p.isOriginalPalace,majorStars:stars(p.majorStars,'主'),minorStars:stars(p.minorStars,'辅'),adjectiveStars:stars(p.adjectiveStars,'杂'),changsheng12:String(p.changsheng12),boshi12:String(p.boshi12),jiangqian12:String(p.jiangqian12),suiqian12:String(p.suiqian12),decadal:json(p.decadal),ages:[...p.ages] } as PalaceView; });
 assert(new Set(palaces.map(p=>p.earthlyBranch)).size===12&&new Set(palaces.map(p=>p.name)).size===12&&palaces.filter(p=>p.isBodyPalace).length===1,'十二宫重复或身宫不完整'); return palaces;
}
function formatStar(s: StarView) { return s.name+(s.brightness?' '+s.brightness:'')+(s.mutagen?' 化'+s.mutagen:''); }
function mutagenLine(palaces: PalaceView[], names: string[]): string { assert(names.length===4,'四化资料不完整'); return names.map((name,i)=>{const p=palaces.find(p=>[...p.majorStars,...p.minorStars,...p.adjectiveStars].some(s=>s.name===name));assert(p,`找不到四化星曜 ${name}`);return `${name}化${MUTAGEN[i]}（${p.earthlyBranch}·${p.name}）`;}).join('、'); }
function natalMutagen(palaces: PalaceView[]): string[] { return MUTAGEN.map(kind=>{const s=palaces.flatMap(p=>[...p.majorStars,...p.minorStars,...p.adjectiveStars]).find(s=>s.mutagen===kind);assert(s,`生年化${kind}资料缺失`);return s.name;}); }
function starLines(p: PalaceView): string[] { return [`  主星  ${p.majorStars.map(formatStar).join('    ')||'（无）'}`,...(p.minorStars.length?[`  辅星  ${p.minorStars.map(formatStar).join('    ')}`]:[]),...(p.adjectiveStars.length?[`  杂曜  ${p.adjectiveStars.map(formatStar).join('    ')}`]:[])]; }
function natalText(n: Omit<ZiweiNatalResult,'text'>): string {
 const lines=[`iztro ${ENGINE_META.engineVersion}  分界 默认（春节换年；流月按库实际状态分段）`,`阳历  ${n.solarDate}`,`农历  ${n.lunarDate}`,`库内四柱  ${n.chineseDate}`,`节气四柱（技能时辰取样）  ${n.solarPillars}`,n.pillarPrecision,`${n.gender}  ${n.zodiac}  ${n.sign}  ${n.fiveElementsClass}`,`时辰  ${n.time}（${n.timeRange}）`,`命主 ${n.soul}  身主 ${n.body}`,`命宫 ${n.earthlyBranchOfSoulPalace}  身宫 ${n.earthlyBranchOfBodyPalace}`,'','本命','节气四柱按立春、节气取样；库内四柱按农历年月。安星用农历月、日、时；年干支按所选分界。',''];
 for(const branch of BRANCHES){const p=n.palaces.find(p=>p.earthlyBranch===branch)!;lines.push(`${p.earthlyBranch} ${p.heavenlyStem} · ${p.name}${p.isBodyPalace?' · 身宫':''}${p.isOriginalPalace?' · 来因':''}`,...starLines(p),`  神煞  ${[p.changsheng12,p.boshi12,p.jiangqian12,p.suiqian12].join(' · ')}`,`  大限  ${p.decadal.heavenlyStem}${p.decadal.earthlyBranch}  ${p.decadal.range[0]}–${p.decadal.range[1]} 虚岁`,'');}
 lines.push(`生年四化  ${mutagenLine(n.palaces,natalMutagen(n.palaces))}`);return lines.join('\n');
}
function context(raw: ZiweiInput) {
 const {input,birthSolarDate}=validateInput(raw);
 assert(ENGINE_META.engineVersion==='2.6.5'&&ENGINE_META.calendarVersion==='0.2.9','计算库版本与已验证版本不一致');
 // withOptions binds configuration to this astrolabe and its later horoscope calls.
 const a=astro.withOptions({type:input.calendar,dateStr:input.date,timeIndex:input.timeIndex,gender:input.gender,isLeapMonth:input.isLeapMonth??false,fixLeap:true,language:'zh-CN',config:{...ZIWEI_RULES,mutagens:{},brightness:{}}});
 const exact=getHeavenlyStemAndEarthlyBranchBySolarDate(birthSolarDate,input.timeIndex,{year:'exact',month:'exact'});
 const solarPillars=[exact.yearly,exact.monthly,exact.daily,exact.hourly].map(pair=>pair.join('')).join(' ');
 const n: Omit<ZiweiNatalResult,'text'>={title:input.title,calendar:input.calendar,inputDate:input.date,gender:a.gender,solarDate:a.solarDate,lunarDate:a.lunarDate,chineseDate:a.chineseDate,time:a.time,timeRange:a.timeRange,sign:a.sign,zodiac:a.zodiac,earthlyBranchOfSoulPalace:a.earthlyBranchOfSoulPalace,earthlyBranchOfBodyPalace:a.earthlyBranchOfBodyPalace,soul:a.soul,body:a.body,fiveElementsClass:a.fiveElementsClass,palaces:readPalaces(a),copyright:a.copyright,solarPillars,pillarPrecision:'按时辰代表时刻取样；不代表按原始钟点分钟级交节计算。晚子归次日。',birthSolarDate,rules:{...ZIWEI_RULES},engineMeta:{...ENGINE_META}};
 const natal: ZiweiNatalResult={...n,text:natalText(n)};
 return {input,a,natal,birthSolarDate};
}
function layer(raw: unknown, label: string, noFlowStars=false): HoroscopeLayer {
 assert(raw&&typeof raw==='object',`${label}资料缺失`);const b=raw as Record<string,unknown>;
 assert(Number.isInteger(b.index)&&Number(b.index)>=0&&Number(b.index)<12,`${label}宫位越界，无法提供此日期的完整资料`);
 assert(typeof b.name==='string'&&typeof b.heavenlyStem==='string'&&typeof b.earthlyBranch==='string',`${label}干支或名称缺失`);
 assert(Array.isArray(b.palaceNames)&&b.palaceNames.length===12&&b.palaceNames.every(n=>typeof n==='string'&&n)&&new Set(b.palaceNames).size===12,`${label}十二宫映射不完整`);
 assert(Array.isArray(b.mutagen)&&b.mutagen.length===4&&b.mutagen.every(n=>typeof n==='string'&&n),`${label}四化不完整`);
 const flow=noFlowStars?Array.from({length:12},()=>[]):b.stars;assert(Array.isArray(flow)&&flow.length===12,`${label}流曜结构不完整`);
 return {name:b.name,index:Number(b.index),heavenlyStem:b.heavenlyStem,earthlyBranch:b.earthlyBranch,palaceNames:[...b.palaceNames] as string[],mutagen:[...b.mutagen] as string[],stars:flow.map((s,i)=>stars(s,`${label}第${i+1}宫`))};
}
function overlay(n: ZiweiNatalResult, layers: Array<[string,HoroscopeLayer]>): string {
 return BRANCHES.map(branch=>{const p=n.palaces.find(p=>p.earthlyBranch===branch)!;const headings=layers.map(([name,b])=>`${name}${b.palaceNames[p.index]}`);return [`${p.earthlyBranch} ${p.heavenlyStem} · 本命${p.name} · ${headings.join(' · ')}${p.isBodyPalace?' · 身':''}${p.isOriginalPalace?' · 来因':''}`,...starLines(p),...layers.map(([name,b])=>`  ${name}流曜  ${b.stars[p.index].map(formatStar).join('、')||'（无）'}`)].join('\n');}).join('\n\n');
}
function scope(n: ZiweiNatalResult,b: HoroscopeLayer,title: string): string {const p=n.palaces[b.index];return `${title}  ${b.heavenlyStem}${b.earthlyBranch}${b.range?`  ${b.range[0]}–${b.range[1]} 虚岁`:''}  宫在${p.earthlyBranch}（本命${p.name}）  四化 ${mutagenLine(n.palaces,b.mutagen)}`;}
function dayText(n: ZiweiNatalResult,h: ZiweiDayResult,kind:'day'|'year'='day') {
 const layers: Array<[string,HoroscopeLayer]>=[[h.decadal.name,h.decadal],['流年',h.yearly]];
 if(kind==='day'){layers.push(['流月',h.monthly]);if(h.daily)layers.push(['流日',h.daily]);}
 const lines=[`定位阳历  ${h.date}  虚岁 ${h.nominalAge}（农历年口径）`,scope(n,h.decadal,h.decadal.name),scope(n,h.yearly,'流年')];
 if(kind==='day')lines.push(scope(n,h.age,'小限'),scope(n,h.monthly,'流月'),...(h.daily?[scope(n,h.daily,'流日')]:[]));
 return [...lines,'',overlay(n,layers)].join('\n');
}
function dayReader(c: ReturnType<typeof context>) {
 const cache=new Map<string,ZiweiDayResult>();
 return (date: string, includeDaily=false):ZiweiDayResult=>{solarDate(date);supported(date,'目标日期');assert(date>=c.birthSolarDate,`目标日期 ${date} 在出生日期之前`);const key=date+':'+includeDaily;if(cache.has(key))return cache.get(key)!;const raw=c.a.horoscope(date,0);const nominalAge=raw.age.nominalAge;assert(Number.isInteger(nominalAge)&&nominalAge>=1&&nominalAge<=120,'虚岁超出支持的运限范围');const decadal=layer(raw.decadal,'童限/大限');if(decadal.name==='大限'){const range=c.natal.palaces[decadal.index].decadal.range;assert(nominalAge>=range[0]&&nominalAge<=range[1],'当前大限年龄与宫位不一致');decadal.range=[...range];}const h:ZiweiDayResult={date,nominalAge,decadal,yearly:layer(raw.yearly,'流年'),age:layer(raw.age,'小限',true),monthly:layer(raw.monthly,'流月'),...(includeDaily?{daily:layer(raw.daily,'流日')}:{}),text:''};cache.set(key,h);return h;};
}
const monthlyKey=(h:ZiweiDayResult)=>digest(h.monthly);
const overlayKey=(h:ZiweiDayResult)=>digest({decadal:h.decadal,yearly:h.yearly,age:h.age,monthly:h.monthly,nominalAge:h.nominalAge});
const yearlyKey=(h:ZiweiDayResult)=>digest({decadal:h.decadal,yearly:h.yearly,age:h.age,nominalAge:h.nominalAge});
function lunarInfo(date:string){const l=solar2lunar(date);return {key:`${l.lunarYear}-${l.lunarMonth}-${l.isLeap}`,label:`农历 ${l.lunarYear}年${l.isLeap?'闰':''}${l.lunarMonth}月`};}
function rangeFor(date:string,read:ReturnType<typeof dayReader>,key:(h:ZiweiDayResult)=>string,limit=65):DateRange {
 const expected=key(read(date));let from=date,to=date,complete=true;
 for(const direction of [-1,1]){let cursor=date,finished=false;for(let step=0;step<limit;step++){const next=shift(cursor,direction);if(next<MIN_DATE||next>MAX_DATE){complete=false;finished=true;break;}let h:ZiweiDayResult;try{h=read(next);}catch{complete=false;finished=true;break;}if(key(h)!==expected){finished=true;break;}cursor=next;}if(!finished)complete=false;if(direction<0)from=cursor;else to=cursor;}
 return {from,to,complete};
}
function lunarRange(date:string):DateRange {const key=lunarInfo(date).key;let from=date,to=date,complete=true;for(const direction of [-1,1]){let cursor=date,found=false;for(let i=0;i<35;i++){const next=shift(cursor,direction);if(next<MIN_DATE||next>MAX_DATE){complete=false;found=true;break;}if(lunarInfo(next).key!==key){found=true;break;}cursor=next;}if(!found)complete=false;if(direction<0)from=cursor;else to=cursor;}return {from,to,complete};}
function monthDates(start:string,count:number):{from:string;to:string} {const m=/^(\d{4})-(\d{2})$/.exec(start);assert(m,'起始月份格式不正确');const y=Number(m[1]),month=Number(m[2]);assert(month>=1&&month<=12,'起始月份不存在');const from=solarDate(`${y}-${month}-1`),last=new Date(Date.UTC(y,month-1+count,0));const to=iso(last);supported(from,'月份起点');supported(to,'月份终点');return {from,to};}
function yearDates(year:number){const a=lunar2solar(`${year}-1-1`,false),b=lunar2solar(`${year+1}-1-1`,false);return {from:solarDate(`${a.solarYear}-${a.solarMonth}-${a.solarDay}`),to:shift(solarDate(`${b.solarYear}-${b.solarMonth}-${b.solarDay}`),-1)};}
function decadeResults(c:ReturnType<typeof context>,read:ReturnType<typeof dayReader>,asOfDate:string,nextRequired=true):{current:ZiweiDecade;next?:ZiweiDecade} {
 const h=read(asOfDate),list=c.a.decadalList();assert(list.length>0,'大限列表不可用');const birthYear=solar2lunar(c.birthSolarDate).lunarYear;
 const build=(item:typeof list[number],title:string):ZiweiDecade=>{const b=layer(item,title);b.range=[...item.ageRange];return {name:title,asOfDate,fromYear:item.yearRange[0],toYear:item.yearRange[1],range:[...item.ageRange],layer:b,text:[title,`基准日 ${asOfDate}；农历年 ${item.yearRange[0]}–${item.yearRange[1]}`,scope(c.natal,b,'大限'),`大限四化  ${mutagenLine(c.natal.palaces,b.mutagen)}`,'',overlay(c.natal,[['大限',b]])].join('\n')};};
 if(h.decadal.name==='童限'){const first=list[0];const current:ZiweiDecade={name:'童限',asOfDate,fromYear:birthYear,toYear:first.yearRange[0]-1,range:null,layer:h.decadal,text:['当前童限',`基准日 ${asOfDate}；虚岁 ${h.nominalAge}；尚未进入首个大限`,scope(c.natal,h.decadal,'童限'),'',overlay(c.natal,[['童限',h.decadal]])].join('\n')};return {current,...(nextRequired?{next:build(first,'下一大限')}:{})};}
 const index=list.findIndex(item=>item.index===h.decadal.index&&h.nominalAge>=item.ageRange[0]&&h.nominalAge<=item.ageRange[1]);assert(index>=0,'基准日没有匹配到当前大限');if(nextRequired)assert(list[index+1],'下一大限不可得，无法提供完整的大限组合');return {current:build(list[index],'当前大限'),...(nextRequired&&list[index+1]?{next:build(list[index+1],'下一大限')}:{})};
}
export function createCurrentDecade(input:ZiweiInput,asOfDate:string):ZiweiDecade {try{const c=context(input);return decadeResults(c,dayReader(c),asOfDate,false).current;}catch(err){if(err instanceof ZiweiError)throw err;throw new ZiweiError(err instanceof Error?err.message:'当前大限查询失败');}}
export function createNatal(input:ZiweiInput):ZiweiNatalResult {try{return context(input).natal;}catch(err){if(err instanceof ZiweiError)throw err;throw new ZiweiError(err instanceof Error?err.message:'排盘失败，请核对出生资料');}}

/** Selection metadata comes from the same pinned astrolabe as the actual views. */
export function createFlowOptions(input: ZiweiInput, request: { date?: string; year?: number } = {}, asOfDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())): ZiweiFlowOptions {
 const c = context(input), birthYear = c.a.rawDates.lunarDate.lunarYear;
 solarDate(asOfDate); supported(asOfDate, '当前日期');
 const currentYear = solar2lunar(asOfDate).lunarYear, currentAge = currentYear - birthYear + 1;
 const decades = c.a.decadalList().map(item => ({ startAge: item.ageRange[0], range: [...item.ageRange] as [number, number], fromYear: item.yearRange[0], toYear: item.yearRange[1], palaceName: item.palaceName, heavenlyStem: item.heavenlyStem, earthlyBranch: item.earthlyBranch }));
 assert(decades.length === 12, '引擎大限列表不完整');
 const current = decades.find(item => currentAge >= item.range[0] && currentAge <= item.range[1]);
 const defaultStartAge = current?.startAge ?? (currentAge < 1 ? decades[0].startAge : currentAge < decades[0].startAge ? null : decades.at(-1)!.startAge);
 // Day/month/year overlays also require the engine's small-limit age, which ends at 120.
 const firstYear = birthYear, lastYear = Math.min(2099, birthYear + 119);
 const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
 const minDate = [c.birthSolarDate, yearDates(firstYear).from].sort().at(-1)!, maxDate = [MAX_DATE, yearDates(lastYear).to].sort()[0];
 const requestedDate = request.date ?? asOfDate;
 solarDate(requestedDate); supported(requestedDate, '定位日期');
 let date = requestedDate < minDate ? minDate : requestedDate > maxDate ? maxDate : requestedDate;
 const year = request.year ?? Math.max(firstYear, Math.min(lastYear, solar2lunar(date).lunarYear));
 assert(years.includes(year), '所选流年超出引擎可计算的范围');
 const range = yearDates(year), yearDate = range.from < minDate ? minDate : range.from;
 if (date < range.from || date > range.to) date = yearDate;
 const names = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
 const toSolar = (month: number, day: number, leap: boolean) => {
  const s = lunar2solar(`${year}-${month}-${day}`, leap);
  return solarDate(`${s.solarYear}-${s.solarMonth}-${s.solarDay}`);
 };
 const months: ZiweiMonthPeriod[] = c.a.monthlyList(year, true).flatMap(item => {
  const rawFrom = toSolar(item.month, item.dayRange[0], item.isLeapMonth), rawTo = toSolar(item.month, item.dayRange[1], item.isLeapMonth);
  const from = rawFrom < minDate ? minDate : rawFrom, to = rawTo > maxDate ? maxDate : rawTo;
  if (from > to) return [];
  const part = item.part === 'first' ? '上半月' : item.part === 'second' ? '下半月' : '';
  return [{ id: `${year}-${item.month}-${item.isLeapMonth ? 'leap' : 'normal'}-${item.part}`, month: item.month, isLeapMonth: item.isLeapMonth, part: item.part, label: `${item.isLeapMonth ? '闰' : ''}${names[item.month - 1]}${part ? ' · ' + part : ''} · ${item.heavenlyStem}${item.earthlyBranch}`, from, to }];
 });
 return { asOfDate, currentAge, currentStartAge: current?.startAge ?? null, defaultStartAge, decades, date, year, yearDate, years, months, minDate, maxDate };
}

function selectedDecade(c: ReturnType<typeof context>, startAge: number): ZiweiSelectedDecade {
 const item = c.a.decadalList().find(period => period.ageRange[0] === startAge);
 assert(item, '所选年龄范围不属于引擎原生大限');
 const b = layer(item, '大限'); b.range = [...item.ageRange];
 return { name: '大限', range: [...item.ageRange], fromYear: item.yearRange[0], toYear: item.yearRange[1], layer: b, text: [`大限 ${item.ageRange[0]}–${item.ageRange[1]} 虚岁`, `农历年 ${item.yearRange[0]}–${item.yearRange[1]}`, scope(c.natal, b, '大限'), `大限四化  ${mutagenLine(c.natal.palaces, b.mutagen)}`, '', overlay(c.natal, [['大限', b]])].join('\n') };
}

/** Render calculated segments for readers without exposing internal deduplication keys. */
export function renderViewText(result: ZiweiViewResult): string {
 if(result.query.mode!=='months'&&result.query.mode!=='years')return result.text;
 const months=result.query.mode==='months',first=new Map<string,ZiweiSegment>(),text:string[]=[];
 for(const s of result.segments){
  const previous=first.get(s.viewId),view=result.views[s.viewId];assert(view,'分段缺少完整盘面');
  text.push(`${months?'流月':s.lunarLabel}  阳历 ${s.from} 至 ${s.to}  ${s.lunarLabel}  虚岁 ${s.nominalAge}`);
  if(months)text.push(`农历整月 ${s.lunarRange.from} 至 ${s.lunarRange.to}${s.lunarRange.complete?'':'（范围未完整）'}；实际流月 ${s.monthlyRange.from} 至 ${s.monthlyRange.to}${s.monthlyRange.complete?'':'（范围未完整）'}；叠盘有效 ${s.overlayRange.from} 至 ${s.overlayRange.to}${s.overlayRange.complete?'':'（范围未完整）'}`);
  text.push(previous?`与此前阳历 ${previous.from} 至 ${previous.to} 的盘面相同，见该日期段的完整盘面。`:view.text);
  if(!previous)first.set(s.viewId,s);
 }
 return text.filter(Boolean).join('\n\n');
}

export function createView(input:ZiweiInput,rawQuery:ZiweiQuery):ZiweiViewResult {
 try{
 const parsed=ziweiQuerySchema.safeParse(rawQuery);assert(parsed.success,'运限查询参数不正确');const query=parsed.data,c=context(input),read=dayReader(c);const result:ZiweiViewResult={query,natal:c.natal,segments:[],views:{},text:'',engineMeta:{...ENGINE_META}};
 if(query.mode==='decadal'){result.decadal=selectedDecade(c,query.startAge);result.text=result.decadal.text;return result;}
 if(query.mode==='day'){result.day=read(query.date,query.includeDaily||query.level==='daily');result.day.text=dayText(c.natal,result.day);result.text=result.day.text;return result;}
 if(query.mode==='decades'){const pair=decadeResults(c,read,query.asOfDate);assert(pair.next,'下一大限资料不完整');result.decades={current:pair.current,next:pair.next};result.text=result.decades.current.text+'\n\n'+result.decades.next.text;return result;}
 const ranges=query.mode==='months'?[{...monthDates(query.startMonth,query.count),label:'流月'}]:[...new Set(query.years)].sort((a,b)=>a-b).map(year=>({...yearDates(year),label:`流年 ${year}（春节为界）`}));
 let sequence=0;const kind=query.mode==='months'?'months':'years';
 for(const request of ranges){supported(request.from,'查询起点');supported(request.to,'查询终点');assert(request.from>=c.birthSolarDate,`请求 ${request.from} 至 ${request.to} 包含出生前日期，整段查询不可用`);const segments:Array<{from:string;to:string;key:string;label:string}>=[];
  for(let date=request.from;date<=request.to;date=shift(date,1)){const h=read(date);const key=kind==='months'?overlayKey(h):yearlyKey(h);const label=kind==='months'?lunarInfo(date).label:request.label;const last=segments.at(-1);if(last&&last.key===key&&last.label===label&&last.to.slice(0,7)===date.slice(0,7)&&kind==='months')last.to=date;else if(last&&last.key===key&&kind==='years')last.to=date;else segments.push({from:date,to:date,key,label});}
  for(const segment of segments){const h=read(segment.from),viewId=kind+'-'+segment.key,repeated=Object.hasOwn(result.views,viewId);if(!repeated){result.views[viewId]={...h,text:dayText(c.natal,h,kind==='years'?'year':'day')};}
   const s:ZiweiSegment={id:'segment-'+(++sequence),viewId,from:segment.from,to:segment.to,lunarLabel:segment.label,lunarRange:lunarRange(segment.from),monthlyRange:rangeFor(segment.from,read,monthlyKey),overlayRange:kind==='years'?{from:segment.from,to:segment.to,complete:true}:rangeFor(segment.from,read,overlayKey),nominalAge:h.nominalAge,repeated};result.segments.push(s);
  }
 }
 assert(result.segments.length>0,'查询没有完整结果');result.text=renderViewText(result);return result;
 }catch(err){if(err instanceof ZiweiError)throw err;throw new ZiweiError(err instanceof Error?err.message:'运限查询失败');}
}
