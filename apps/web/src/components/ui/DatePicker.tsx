import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Button, Input, useControlValidation } from './controls';
import { Select } from './Select';

type PickerProps = Omit<ComponentPropsWithoutRef<'button'>, 'value' | 'onChange' | 'children'> & {
  value: string;
  onValueChange: (value: string) => void;
  required?: boolean;
  name?: string;
  min?: string;
  max?: string;
  placeholder?: string;
};
const pad = (number: number) => String(number).padStart(2, '0');
const dateValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localToday = () => dateValue(new Date());
const parseDate = (value: string) => new Date(`${value}T12:00:00`);
const clamp = (value: string, min: string, max: string) => value < min ? min : value > max ? max : value;

function Picker({ value, onValueChange, required, name, disabled, className = '', placeholder, label, icon = 'calendar', children, ...props }: PickerProps & {
  label: string;
  icon?: 'calendar' | 'clock';
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { trigger, errorId, invalid, onInvalid } = useControlValidation(value);
  return <span className={`ui-picker ${className}`}>
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button {...props} ref={trigger} disabled={disabled} className="ui-control ui-picker-trigger" aria-required={required || undefined} aria-invalid={invalid || props['aria-invalid']} aria-describedby={[props['aria-describedby'], invalid ? errorId : ''].filter(Boolean).join(' ') || undefined} data-placeholder={!value || undefined}>
          <span>{value || placeholder}</span><svg viewBox="0 0 24 24" aria-hidden="true">{icon === 'clock' ? <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></> : <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>}</svg>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="ui-picker-panel" align="start" sideOffset={6} collisionPadding={12} aria-label={label}>
          {children(() => setOpen(false))}
          {!required && value ? <div className="ui-picker-footer"><Button onClick={() => { onValueChange(''); setOpen(false); }}>清空</Button></div> : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
    <Input className="ui-validation" tabIndex={-1} aria-hidden="true" autoComplete="off" name={name} value={value} required={required} disabled={disabled} onChange={() => {}} onInvalid={onInvalid} />
    {invalid ? <span className="ui-control-error" id={errorId} role="alert">{placeholder}</span> : null}
  </span>;
}

function MonthNavigation({ month, min, max, onChange }: { month: string; min: string; max: string; onChange: (month: string) => void }) {
  const [year, number] = month.split('-').map(Number);
  const minYear = Number(min.slice(0, 4)), maxYear = Number(max.slice(0, 4));
  function move(offset: number) { onChange(dateValue(new Date(year, number - 1 + offset, 1)).slice(0, 7)); }
  return <div className="ui-calendar-navigation">
    <Button className="ui-calendar-arrow" aria-label="上个月" disabled={month <= min.slice(0, 7)} onClick={() => move(-1)}>‹</Button>
    <Select aria-label="选择年份" value={year} onValueChange={next => onChange(clamp(`${next}-${pad(number)}`, min.slice(0, 7), max.slice(0, 7)))} options={Array.from({ length: maxYear - minYear + 1 }, (_, i) => ({ value: minYear + i, label: `${minYear + i} 年` }))} />
    <Select aria-label="选择月份" value={number} onValueChange={next => onChange(`${year}-${pad(Number(next))}`)} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1} 月`, disabled: `${year}-${pad(i + 1)}` < min.slice(0, 7) || `${year}-${pad(i + 1)}` > max.slice(0, 7) }))} />
    <Button className="ui-calendar-arrow" aria-label="下个月" disabled={month >= max.slice(0, 7)} onClick={() => move(1)}>›</Button>
  </div>;
}

function Calendar({ value, min, max, onSelect }: { value: string; min: string; max: string; onSelect: (value: string) => void }) {
  const initial = clamp(value || localToday(), min, max);
  const [month, setMonth] = useState(initial.slice(0, 7));
  const [focused, setFocused] = useState(initial);
  const grid = useRef<HTMLDivElement>(null);
  const [year, number] = month.split('-').map(Number);
  const start = new Date(year, number - 1, 1).getDay();
  const days = new Date(year, number, 0).getDate();
  const today = localToday();
  const tabDate = focused.startsWith(month) ? focused : clamp(`${month}-01`, min, max);
  useEffect(() => {
    grid.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
  }, []);
  function keyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const next = parseDate(date);
    switch (event.key) {
      case 'ArrowLeft': next.setDate(next.getDate() - 1); break;
      case 'ArrowRight': next.setDate(next.getDate() + 1); break;
      case 'ArrowUp': next.setDate(next.getDate() - 7); break;
      case 'ArrowDown': next.setDate(next.getDate() + 7); break;
      case 'Home': next.setDate(next.getDate() - next.getDay()); break;
      case 'End': next.setDate(next.getDate() + 6 - next.getDay()); break;
      case 'PageUp':
      case 'PageDown': {
        const day = next.getDate();
        next.setDate(1);
        next.setMonth(next.getMonth() + (event.key === 'PageDown' ? 1 : -1) * (event.shiftKey ? 12 : 1));
        next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
        break;
      }
      default: return;
    }
    event.preventDefault();
    const target = clamp(dateValue(next), min, max);
    setFocused(target); setMonth(target.slice(0, 7));
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)?.focus());
  }
  return <>
    <MonthNavigation month={month} min={min} max={max} onChange={setMonth} />
    <div className="ui-calendar" role="grid" aria-label={`${year} 年 ${number} 月`} ref={grid}>
      <div className="ui-calendar-week" role="row">{['日', '一', '二', '三', '四', '五', '六'].map(day => <span key={day} role="columnheader">{day}</span>)}</div>
      {Array.from({ length: Math.ceil((start + days) / 7) }, (_, week) => <div className="ui-calendar-week" role="row" key={week}>{Array.from({ length: 7 }, (_, index) => {
        const day = week * 7 + index - start + 1;
        const date = `${month}-${pad(day)}`;
        return <span role="gridcell" key={index} aria-selected={day > 0 && day <= days ? date === value : undefined}>{day > 0 && day <= days ? <Button className="ui-calendar-day" data-date={date} data-today={date === today || undefined} data-selected={date === value || undefined} tabIndex={date === tabDate ? 0 : -1} disabled={date < min || date > max} aria-label={`${year} 年 ${number} 月 ${day} 日`} aria-current={date === today ? 'date' : undefined} onFocus={() => setFocused(date)} onKeyDown={event => keyDown(event, date)} onClick={() => onSelect(date)}>{day}</Button> : null}</span>;
      })}</div>)}
    </div>
    <div className="ui-picker-footer"><Button disabled={today < min || today > max} onClick={() => onSelect(today)}>今天</Button><span>方向键切换日期</span></div>
  </>;
}

export function DatePicker({ min = '1900-01-01', max = '2100-12-31', ...props }: PickerProps) {
  return <Picker {...props} label="选择日期" placeholder={props.placeholder || '请选择日期'}>{close => <Calendar value={props.value} min={min} max={max} onSelect={value => { props.onValueChange(value); close(); }} />}</Picker>;
}

function MonthPanel({ value, min, max, onSelect }: { value: string; min: string; max: string; onSelect: (value: string) => void }) {
  const [year, setYear] = useState(Number(clamp(value || localToday().slice(0, 7), min, max).slice(0, 4)));
  const minYear = Number(min.slice(0, 4)), maxYear = Number(max.slice(0, 4));
  const current = localToday().slice(0, 7);
  return <>
    <div className="ui-calendar-navigation">
      <Button className="ui-calendar-arrow" aria-label="上一年" disabled={year <= minYear} onClick={() => setYear(year - 1)}>‹</Button>
      <Select aria-label="选择年份" value={year} onValueChange={next => setYear(Number(next))} options={Array.from({ length: maxYear - minYear + 1 }, (_, i) => ({ value: minYear + i, label: `${minYear + i} 年` }))} />
      <Button className="ui-calendar-arrow" aria-label="下一年" disabled={year >= maxYear} onClick={() => setYear(year + 1)}>›</Button>
    </div>
    <div className="ui-month-grid" role="group" aria-label={`${year} 年月份`}>{Array.from({ length: 12 }, (_, i) => {
      const month = `${year}-${pad(i + 1)}`;
      return <Button key={month} className="ui-month-option" aria-pressed={month === value} disabled={month < min || month > max} onClick={() => onSelect(month)}>{i + 1} 月</Button>;
    })}</div>
    <div className="ui-picker-footer"><Button disabled={current < min || current > max} onClick={() => onSelect(current)}>本月</Button></div>
  </>;
}
export function MonthPicker({ min = '1901-01', max = '2099-12', ...props }: PickerProps) {
  return <Picker {...props} label="选择月份" placeholder={props.placeholder || '请选择月份'}>{close => <MonthPanel value={props.value} min={min} max={max} onSelect={value => { props.onValueChange(value); close(); }} />}</Picker>;
}

function TimePanel({ value, onSelect }: { value: string; onSelect: (value: string) => void }) {
  const [hour, setHour] = useState(value.slice(0, 2) || '00');
  const [minute, setMinute] = useState(value.slice(3, 5) || '00');
  return <>
    <div className="ui-time-fields">
      <label>时<Select aria-label="小时" value={hour} onValueChange={setHour} options={Array.from({ length: 24 }, (_, i) => ({ value: pad(i), label: pad(i) }))} /></label>
      <span aria-hidden="true">:</span>
      <label>分<Select aria-label="分钟" value={minute} onValueChange={setMinute} options={Array.from({ length: 60 }, (_, i) => ({ value: pad(i), label: pad(i) }))} /></label>
    </div>
    <Button variant="primary" className="ui-time-confirm" onClick={() => onSelect(`${hour}:${minute}`)}>确定时间</Button>
  </>;
}
export function TimePicker(props: Omit<PickerProps, 'min' | 'max'>) {
  return <Picker {...props} label="选择时间" icon="clock" placeholder={props.placeholder || '请选择时间'}>{close => <TimePanel value={props.value} onSelect={value => { props.onValueChange(value); close(); }} />}</Picker>;
}
