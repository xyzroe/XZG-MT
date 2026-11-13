import { ZIGBEE_CHANNELS, energyColor, energyLabel, energyPercent } from "./utils/energy";

interface Column {
  col: HTMLElement;
  value: HTMLElement;
  bar: HTMLElement;
  peakMark: HTMLElement;
  latest: number | null;
  peak: number | null;
}

// Bar chart of the latest energy per channel with a peak-hold marker
export class EnergyChart {
  private readonly columns = new Map<number, Column>();

  constructor(private readonly container: HTMLElement) {
    for (const channel of ZIGBEE_CHANNELS) {
      const col = document.createElement("div");
      col.className = "energy-col";
      col.innerHTML =
        '<div class="energy-val">&nbsp;</div>' +
        '<div class="energy-bar-wrap"><div class="energy-bar"></div><div class="energy-peak"></div></div>' +
        `<div class="energy-ch">${channel}</div>`;
      this.container.appendChild(col);
      this.columns.set(channel, {
        col,
        value: col.querySelector(".energy-val") as HTMLElement,
        bar: col.querySelector(".energy-bar") as HTMLElement,
        peakMark: col.querySelector(".energy-peak") as HTMLElement,
        latest: null,
        peak: null,
      });
      this.render(channel);
    }
  }

  public setValue(channel: number, dbm: number): void {
    const column = this.columns.get(channel);
    if (!column) return;
    column.latest = dbm;
    column.peak = column.peak === null ? dbm : Math.max(column.peak, dbm);
    this.render(channel);
  }

  public reset(): void {
    for (const [channel, column] of this.columns) {
      column.latest = null;
      column.peak = null;
      this.render(channel);
    }
  }

  private render(channel: number): void {
    const column = this.columns.get(channel)!;
    const { latest, peak } = column;
    column.col.title = energyLabel(channel, latest, peak);
    column.value.textContent = latest === null ? "\u00a0" : String(latest);
    const percent = latest === null ? 0 : energyPercent(latest);
    column.bar.style.height = `${percent}%`;
    column.bar.style.background = energyColor(percent);
    column.peakMark.style.display = peak === null ? "none" : "block";
    if (peak !== null) column.peakMark.style.bottom = `${energyPercent(peak)}%`;
  }
}
