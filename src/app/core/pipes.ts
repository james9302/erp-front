import { Pipe, PipeTransform } from '@angular/core';

/** Rand with two decimals and thousands separators: R12,345.67 (negative as -R12.00). */
@Pipe({ name: 'rand', standalone: true })
export class RandPipe implements PipeTransform {
  transform(v: number | string | null | undefined, blank = ''): string {
    if (v == null || v === '') return blank;
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? '-R' : 'R') + s;
  }
}

/** Whole numbers with separators. */
@Pipe({ name: 'qty', standalone: true })
export class QtyPipe implements PipeTransform {
  transform(v: number | string | null | undefined): string {
    if (v == null || v === '') return '';
    return Number(v).toLocaleString('en-US');
  }
}

/** yyyy-MM-dd or ISO timestamp → dd MMM yyyy (and time when present). */
@Pipe({ name: 'when', standalone: true })
export class WhenPipe implements PipeTransform {
  transform(v: string | null | undefined, withTime = false): string {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    const date = d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
    return withTime && v.length > 10 ? date + ' ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : date;
  }
}

/** 2026-08-01 → Aug 2026. */
@Pipe({ name: 'month', standalone: true })
export class MonthPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    if (!v) return '';
    const d = new Date(v.length === 7 ? v + '-01' : v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
  }
}

export function yyyyMm(d = new Date()): string { return d.toISOString().slice(0, 7); }
export function newKey(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
export function splitSerials(text: string): string[] {
  return Array.from(new Set(text.split(/[\s,;]+/).map(s => s.replace(/[^0-9]/g, '')).filter(s => s.length >= 18)));
}
