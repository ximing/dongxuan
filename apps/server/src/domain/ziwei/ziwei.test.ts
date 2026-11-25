import { describe, it, expect } from 'vitest';
import { astro } from 'iztro';
import { createNatal, createView, createCurrentDecade, renderLegacy, ENGINE_META, ZiweiError } from './index.js';
import type { ZiweiInput, ZiweiQuery } from '@dongxuan/dto';
const sample:ZiweiInput={system:'ziwei',title:'合成边界',calendar:'solar',date:'1993-3-1',timeIndex:8,gender:'男'};
const late:ZiweiInput={...sample,date:'2000-08-16',timeIndex:12};
const query=(input:ZiweiInput,q:ZiweiQuery)=>createView(input,q);
describe('ziwei v2 calculation boundaries',()=>{
 it('pins the two runtime libraries and projects the same engine stars without fabricated defaults',()=>{
  expect(ENGINE_META.engineVersion).toBe('2.6.5');expect(ENGINE_META.calendarVersion).toBe('0.2.9');
  const n=createNatal(sample),a=astro.withOptions({type:'solar',dateStr:sample.date,timeIndex:8,gender:'男',fixLeap:true,language:'zh-CN',config:{yearDivide:'normal',horoscopeDivide:'normal',ageDivide:'normal',dayDivide:'forward',algorithm:'default'}});
  expect(n.palaces.map(p=>p.majorStars.map(s=>s.name))).toEqual(a.palaces.map(p=>p.majorStars.map(s=>s.name)));
  expect(n.text.search(/^寅 /m)).toBeLessThan(n.text.search(/^卯 /m));expect(n.text).toContain('技能时辰取样');
  expect(n.palaces).toHaveLength(12);expect(n.solarPillars).toMatch(/\S+ \S+ \S+ \S+/);
 });
 it('converts equivalent solar/lunar inputs and independently rejects invalid leap months and missing lunar days',()=>{
  const solar=createNatal({...sample,date:'2023-03-22'}),lunar=createNatal({...sample,calendar:'lunar',date:'2023-2-1',isLeapMonth:true});
  expect(lunar.palaces).toEqual(solar.palaces);
  expect(()=>createNatal({...sample,calendar:'lunar',date:'2024-2-1',isLeapMonth:true})).toThrow(/闰月不存在/);
  expect(()=>createNatal({...sample,calendar:'lunar',date:'2026-2-30'})).toThrow(/日期或闰月不存在/);
  expect(()=>createNatal({...sample,date:'2000-02-31'})).toThrow(/不存在/);
 });
 it('preserves original dates, explicitly advances late zi, rejects ambiguous clock mismatches and 24:00',()=>{
  const n=createNatal(late);expect(n.birthSolarDate).toBe('2000-08-16');expect(n.chineseDate).toBe('庚辰 甲申 丁未 庚子');
  expect(()=>createNatal({...late,clock:'22:59'})).toThrow(/不一致/);
  expect(()=>createNatal({...late,clock:'24:00'})).toThrow();
  expect(createNatal({...late,clock:'23:00'}).chineseDate).toBe(n.chineseDate);
  expect(createNatal({...sample,timeIndex:0,clock:'00:59'}).time).toBeTruthy();
  expect(createNatal({...sample,timeIndex:1,clock:'01:00'}).time).toBeTruthy();
 });
 it('keeps request configuration separate from global configuration and from the frozen renderer',()=>{
  const before=astro.getConfig();astro.config({dayDivide:'current',yearDivide:'exact'});
  try {const first=createNatal(late);const other=astro.withOptions({type:'solar',dateStr:late.date,timeIndex:12,gender:'男',config:{dayDivide:'current'}});expect(first.chineseDate).not.toBe(other.chineseDate);expect(createNatal(late)).toEqual(first);expect(astro.getConfig().dayDivide).toBe('current');expect(renderLegacy(late).chineseDate).toBe('庚辰 甲申 丁未 庚子');}finally{astro.resetConfig();astro.config({yearDivide:before.yearDivide,horoscopeDivide:before.horoscopeDivide,ageDivide:before.ageDivide,dayDivide:before.dayDivide,algorithm:before.algorithm,language:before.language});}
 });
 it('distinguishes childhood from decadal ages and rejects birth-before/range-overflow dates',()=>{
  const baby={...sample,date:'2025-01-01',timeIndex:6};const h=query(baby,{mode:'day',date:'2025-02-01',includeDaily:true,level:'daily'}).day!;
  expect(h.decadal.name).toBe('童限');expect(h.decadal.range).toBeUndefined();expect(h.text).not.toContain('85–94');expect(h.daily?.palaceNames).toHaveLength(12);
  expect(()=>query(baby,{mode:'day',date:'2024-12-30',includeDaily:false,level:'monthly'})).toThrow(/出生/);
  expect(()=>query(baby,{mode:'months',startMonth:'2024-12',count:2})).toThrow(/整段/);
  expect(()=>query(sample,{mode:'day',date:'2200-01-01',includeDaily:false,level:'monthly'})).toThrow(/支持范围/);
 });
 it('provides full current and next decades, including the first adult decade after childhood',()=>{
  const pair=query(sample,{mode:'decades',asOfDate:'2026-11-15'}).decades!;
  expect(pair.current.range).toEqual([26,35]);expect(pair.current.fromYear).toBe(2018);expect(pair.next.range).toEqual([36,45]);expect(pair.next.fromYear).toBe(2028);expect(pair.current.layer.palaceNames).toHaveLength(12);expect(pair.next.layer.mutagen).toHaveLength(4);
  const child=query({...sample,date:'2025-1-1',timeIndex:6},{mode:'decades',asOfDate:'2025-02-01'}).decades!;expect(child.current.name).toBe('童限');expect(child.current.range).toBeNull();expect(child.next.name).toBe('下一大限');
 });
 it('allows current-only at the final valid decade but keeps full-pair requests strict',()=>{
  const elder={...sample,date:'1901-03-01'};
  const current=createCurrentDecade(elder,'2018-11-15');
  expect(current.name).toBe('当前大限');expect(current.layer.palaceNames).toHaveLength(12);expect(current.layer.mutagen).toHaveLength(4);expect(current.text.match(/· 本命/g)).toHaveLength(12);
  expect(()=>query(elder,{mode:'decades',asOfDate:'2018-11-15'})).toThrow(/下一大限不可得/);
  expect(createCurrentDecade(sample,'2026-11-15')).toEqual(query(sample,{mode:'decades',asOfDate:'2026-11-15'}).decades!.current);
  expect(()=>createCurrentDecade({...sample,date:'2025-01-01'},'2024-12-30')).toThrow(/出生/);
 });
 it('splits the real leap-month shift on Aug 9, rather than only the lunar month boundary',()=>{
  const r=query(late,{mode:'months',startMonth:'2025-08',count:1});
  const prev=r.segments.find(s=>s.from<='2025-08-08'&&s.to>='2025-08-08')!,next=r.segments.find(s=>s.from<='2025-08-09'&&s.to>='2025-08-09')!;
  expect(prev.to).toBe('2025-08-08');expect(next.from).toBe('2025-08-09');expect(prev.viewId).not.toBe(next.viewId);expect(r.views[prev.viewId].monthly.index).toBe(2);expect(r.views[next.viewId].monthly.index).toBe(3);expect(prev.monthlyRange.to).toBe('2025-08-08');expect(next.monthlyRange.from).toBe('2025-08-09');
 });
 // Full-range calculations are CPU-bound and need headroom on shared CI runners.
 it('covers twelve full solar months, only referencing earlier states with complete twelve-palace blocks',()=>{
  const r=query(sample,{mode:'months',startMonth:'2026-11',count:12});expect(r.segments[0].from).toBe('2026-11-01');expect(r.segments.at(-1)?.to).toBe('2027-10-31');const seen=new Set<string>();for(const s of r.segments){if(s.repeated)expect(seen.has(s.viewId)).toBe(true);seen.add(s.viewId);expect(r.views[s.viewId].monthly.palaceNames).toHaveLength(12);expect(r.views[s.viewId].yearly.stars).toHaveLength(12);}expect(r.segments.some(s=>s.repeated)).toBe(true);
  expect(r.text).not.toMatch(/结果引用|months-[a-f0-9]{64}/);
  expect(r.text.match(/· 本命/g)).toHaveLength(Object.keys(r.views).length*12);
  for(const s of r.segments.filter(s=>s.repeated)){const first=r.segments.find(previous=>previous.viewId===s.viewId)!;expect(r.text).toContain(`与此前阳历 ${first.from} 至 ${first.to} 的盘面相同`);}
 },30000);
 it('covers complete Spring-Festival years and excludes monthly text from annual analyses',()=>{
  const r=query(sample,{mode:'years',years:[2026,2027,2028]});expect(r.segments.map(s=>[s.from,s.to])).toEqual([['2026-02-17','2027-02-05'],['2027-02-06','2028-01-25'],['2028-01-26','2029-02-12']]);expect(r.segments.map(s=>s.nominalAge)).toEqual([34,35,36]);expect(r.text).not.toContain('流月');expect(r.text).toContain('丙辰');
  expect(r.text).not.toMatch(/结果引用|years-[a-f0-9]{64}/);
  expect(r.text.match(/· 本命/g)).toHaveLength(36);
 },60000);
 it('does not suppress invalid structure errors as a normal empty chart',()=>{expect(()=>createNatal({...sample,timeIndex:99})).toThrow(ZiweiError);expect(()=>query(sample,{mode:'months',startMonth:'2099-12',count:2})).toThrow(/支持范围/);});
});
