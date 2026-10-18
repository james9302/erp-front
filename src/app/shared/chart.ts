import { AfterViewInit, Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';

Chart.register(...registerables);
Chart.defaults.font.family = 'Inter, Roboto, sans-serif';
Chart.defaults.color = '#64748b';

export const PALETTE = ['#0e7490', '#f59e0b', '#64748b', '#10b981', '#6366f1', '#ef4444', '#14b8a6', '#a855f7'];

/** Thin Chart.js wrapper: `<app-chart type="bar" [labels]="…" [datasets]="…" [height]="240">`. Re-renders when inputs change. */
@Component({
  selector: 'app-chart',
  standalone: true,
  template: `<div class="wrap" [style.height.px]="height()"><canvas #c></canvas></div>`,
  styles: [`.wrap { position: relative; width: 100%; }`],
})
export class ChartComponent implements AfterViewInit, OnDestroy {
  type = input<ChartType>('bar');
  labels = input<string[]>([]);
  datasets = input<ChartConfiguration['data']['datasets']>([]);
  height = input(240);
  options = input<ChartConfiguration['options']>({});
  money = input(false);
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('c');
  private chart?: Chart;

  constructor() { effect(() => { this.labels(); this.datasets(); this.render(); }); }
  ngAfterViewInit(): void { this.render(); }
  ngOnDestroy(): void { this.chart?.destroy(); }

  private render(): void {
    const el = this.canvas()?.nativeElement; if (!el) return;
    this.chart?.destroy();
    const fmt = (v: number) => this.money() ? 'R' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) : Number(v).toLocaleString('en-US');
    const circular = this.type() === 'doughnut' || this.type() === 'pie';
    this.chart = new Chart(el, {
      type: this.type(),
      data: { labels: this.labels(), datasets: this.datasets().map((d, i) => ({ borderRadius: 6, backgroundColor: circular ? PALETTE : PALETTE[i % PALETTE.length], borderColor: PALETTE[i % PALETTE.length], ...d })) },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label ?? ctx.label}: ${fmt(Number(ctx.parsed.y ?? ctx.parsed))}` } } },
        scales: circular ? {} : { x: { grid: { display: false } }, y: { grid: { color: '#eef2f6' }, ticks: { callback: v => fmt(Number(v)) } } },
        ...this.options(),
      },
    });
  }
}
