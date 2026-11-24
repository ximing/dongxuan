import { Checkbox, DatePicker, Input, Radio, Select, TimePicker } from '@/components/ui';
import { useId } from 'react';
import { CHINESE_HOURS } from '@dongxuan/dto';

export type BirthValues = {
  calendar?: 'solar' | 'lunar';
  date?: string;
  timeIndex?: number;
  gender?: '男' | '女';
  isLeapMonth?: boolean;
  clock?: string;
};

export function BirthFields({ value, onChange, required = false, compact = false }: {
  value: BirthValues;
  onChange: (value: BirthValues) => void;
  required?: boolean;
  compact?: boolean;
}) {
  const calendarName = useId();
  const dateId = `${calendarName}-date`;
  const dateLabelId = `${calendarName}-date-label`;
  const put = (next: Partial<BirthValues>) => onChange({ ...value, ...next });
  const calendar = value.calendar || 'solar';
  const parts = (value.date || '').split('-');
  return (
    <div className={compact ? 'cast-fields' : 'form-grid'}>
      <div className={compact ? 'field' : 'field wide'}>
        <span>历法</span>
        <div className="radio-line">
          {(['solar', 'lunar'] as const).map((kind) => (
            <label key={kind}>
              <Radio name={calendarName} value={kind} checked={calendar === kind} onChange={() => put({ calendar: kind, date: undefined, isLeapMonth: false })} />
              {kind === 'solar' ? '阳历' : '农历'}
            </label>
          ))}
        </div>
      </div>
      <div className={compact ? 'field' : 'field wide'}>
        <label id={dateLabelId} htmlFor={dateId}>出生日期</label>
        {calendar === 'solar'
          ? <DatePicker id={dateId} aria-labelledby={dateLabelId} value={value.date || ''} min="1900-01-01" max="2100-12-31" required={required} onValueChange={(date) => put({ date })} />
          : (
            <div role="group" aria-labelledby={dateLabelId}>
              <div className="calendar-input">
                <Input id={dateId} aria-label="农历年" type="number" min="1900" max="2100" placeholder="年" required={required} value={parts[0] || ''} onChange={(event) => put({ date: [event.target.value, parts[1] || '', parts[2] || ''].join('-') })} />
                <Select aria-label="农历月" required={required} value={parts[1] ? Number(parts[1]) : ''} onValueChange={(month) => put({ date: [parts[0] || '', month, parts[2] || ''].join('-') })} options={[{ value: '', label: '月' }, ...Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: `${index + 1}` }))]} />
                <Select aria-label="农历日" required={required} value={parts[2] ? Number(parts[2]) : ''} onValueChange={(day) => put({ date: [parts[0] || '', parts[1] || '', day].join('-') })} options={[{ value: '', label: '日' }, ...Array.from({ length: 30 }, (_, index) => ({ value: index + 1, label: `${index + 1}` }))]} />
              </div>
              <label className="inline-check lunar-leap"><Checkbox checked={!!value.isLeapMonth} onChange={(event) => put({ isLeapMonth: event.target.checked })} />闰月</label>
            </div>
          )}
      </div>
      <label className="field">
        <span>排盘性别</span>
        <Select required={required} value={value.gender || ''} onValueChange={(gender) => put({ gender: gender as BirthValues['gender'] })} options={[{ value: '', label: '请选择' }, { value: '男', label: '男' }, { value: '女', label: '女' }]} />
      </label>
      <label className="field">
        <span>出生时辰</span>
        <Select required={required} value={value.timeIndex ?? ''} onValueChange={(index) => put({ timeIndex: index === '' ? undefined : Number(index) })} options={[{ value: '', label: '请选择时辰' }, ...CHINESE_HOURS.map((hour) => ({ value: hour.index, label: `${hour.name}${hour.name.length === 1 ? '时' : ''}（${hour.range}）` }))]} />
      </label>
      <label className="field"><span>原始钟点 <small>选填</small></span><TimePicker value={value.clock || ''} onValueChange={(clock) => put({ clock: clock || undefined })} /></label>
    </div>
  );
}
