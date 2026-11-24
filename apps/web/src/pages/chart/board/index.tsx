import { bindServices, observer, useService } from '@rabjs/react';
import type { HoroscopeLayer, PalaceView, StarView, ZiweiNatalResult } from '@dongxuan/dto';
import { Button } from '@/components/ui';
import { BoardService } from './board.service';

const AREA: Record<string, string> = { 巳: 'si', 午: 'wu', 未: 'wei', 申: 'shen', 辰: 'chen', 酉: 'you', 卯: 'mao', 戌: 'xu', 寅: 'yin', 丑: 'chou', 子: 'zi', 亥: 'hai' };

function Stars({ stars }: { stars: StarView[] }) {
  return <>{stars.map((star, index) => <span className="star" key={star.name + index}>{star.name}{star.brightness ? <small>{star.brightness}</small> : null}{star.mutagen ? <span className="mutagen">化{star.mutagen}</span> : null}</span>)}</>;
}

function Palace({ palace, layer, selected, onClick }: { palace: PalaceView; layer?: HoroscopeLayer; selected: boolean; onClick: () => void }) {
  return (
    <Button type="button" onClick={onClick} className={`palace ${palace.name === '命宫' ? 'soul' : ''} ${selected ? 'selected' : ''}`} style={{ gridArea: AREA[palace.earthlyBranch] }} aria-label={`${palace.earthlyBranch}${palace.name}`} aria-pressed={selected}>
      <div className="palace-head"><span>{palace.heavenlyStem}{palace.earthlyBranch}</span>{palace.isBodyPalace ? <em>身</em> : null}<strong>{palace.name}</strong></div>
      {layer ? <div className="flow-palace">{layer.name} · {layer.palaceNames[palace.index]}</div> : null}
      <div className="stars">{palace.majorStars.length ? <Stars stars={palace.majorStars} /> : <span className="muted">空宫</span>}</div>
      <div className="stars minor"><Stars stars={palace.minorStars} /></div>
      <div className="stars adjective"><Stars stars={palace.adjectiveStars} /></div>
      {layer?.stars[palace.index]?.length ? <div className="flow-palace">流曜 <Stars stars={layer.stars[palace.index]} /></div> : null}
      <div className="palace-bottom"><span>{palace.changsheng12} · {palace.boshi12}</span><span>{palace.decadal.range.join('–')} 岁</span></div>
    </Button>
  );
}

const BoardContent = observer(function BoardContent({ chart, layer, title }: { chart: ZiweiNatalResult; layer?: HoroscopeLayer; title?: string }) {
  const service = useService(BoardService);
  const palace = service.selected === null ? null : chart.palaces[service.selected];
  return (
    <>
      <div className="view-switch">
        <p>逐宫阅读，点击宫位看完整星曜</p>
        <Button variant="default" size="sm" onClick={() => service.toggleFull()}>{service.full ? '逐宫阅读' : '查看完整盘'}</Button>
      </div>
      <div className={`board-scroll ${service.full ? 'full-board' : ''}`}>
        <div className="board">
          {chart.palaces.map((item) => <Palace key={item.index} palace={item} layer={layer} selected={service.selected === item.index} onClick={() => service.toggle(item.index)} />)}
          <section className="board-center">
            <div className="center-mark">紫微斗数{layer ? ` · ${layer.name}` : ''}</div>
            <h2>{title || chart.title}</h2>
            <p>{chart.gender} · {chart.zodiac} · {chart.fiveElementsClass}</p>
            <div className="center-rule" />
            <p>阳历 {chart.solarDate}</p>
            <p>农历 {chart.lunarDate}</p>
            <p>{chart.time} {chart.timeRange}</p>
            <p className="center-detail">命主 {chart.soul} · 身主 {chart.body}</p>
          </section>
        </div>
      </div>
      {!service.full ? <div className="mobile-palace-list">{chart.palaces.map((item) => <Palace key={item.index} palace={item} layer={layer} selected={service.selected === item.index} onClick={() => service.toggle(item.index)} />)}</div> : null}
      {palace ? (
        <section className="inline-form">
          <div className="section-head"><h2>{palace.heavenlyStem}{palace.earthlyBranch} · {palace.name}</h2><Button className="plain-button" onClick={() => service.clear()}>收起</Button></div>
          <p className="small">主星：{palace.majorStars.map((star) => star.name + (star.brightness ? `（${star.brightness}）` : '') + (star.mutagen ? `化${star.mutagen}` : '')).join('、') || '无'}</p>
          <p className="small">辅星：{palace.minorStars.map((star) => star.name).join('、') || '无'}</p>
          <p className="small">杂曜：{palace.adjectiveStars.map((star) => star.name).join('、') || '无'}</p>
          <p className="small">神煞：{[palace.changsheng12, palace.boshi12, palace.jiangqian12, palace.suiqian12].join('、')}</p>
          {layer ? <p className="small">{layer.name}叠入{layer.palaceNames[palace.index]}；流曜：{layer.stars[palace.index]?.map((star) => star.name).join('、') || '无'}</p> : null}
        </section>
      ) : null}
    </>
  );
});

export const Board = bindServices(BoardContent, [BoardService]);
