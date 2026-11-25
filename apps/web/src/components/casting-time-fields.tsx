import { CHINESE_HOURS } from '@dongxuan/dto';
import { Button, DatePicker, Select } from '@/components/ui';

export function CastingTimeFields({ id, date, hour, onDate, onHour, onNow, disabled = false, error }: {
  id: string; date: string; hour: string; onDate: (date: string) => void; onHour: (hour: string) => void;
  onNow: () => void; disabled?: boolean; error?: string;
}) {
  return <div className="casting-time-fields" role="group" aria-labelledby={id + '-label'} aria-describedby={error ? id + '-error' : undefined}>
    <div className="casting-time-heading"><span id={id + '-label'}>起卦时间 <small>北京时间 · 精确到时辰</small></span><Button variant="ghost" size="sm" disabled={disabled} onClick={onNow}>使用当前时间</Button></div>
    <div className="casting-time-row">
      <label className="field"><span>阳历日期</span><DatePicker id={id + '-date'} aria-label="起卦日期" value={date} min="1900-01-01" max="2100-12-31" disabled={disabled} aria-invalid={Boolean(error)} onValueChange={onDate} /></label>
      <label className="field"><span>时辰</span><Select id={id + '-hour'} aria-label="起卦时辰" value={hour} disabled={disabled} aria-invalid={Boolean(error)} onValueChange={onHour} options={[{ value: '', label: '未记录时辰' }, ...CHINESE_HOURS.map(hour => ({ value: hour.index, label: `${hour.name}时（${hour.range}）` }))]} /></label>
    </div>
    {error ? <p className="error-banner" id={id + '-error'} role="alert">{error}</p> : null}
  </div>;
}
