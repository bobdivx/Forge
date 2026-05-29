export class IterationBudget {
  private maxTotal: number;
  private used: number;

  constructor(maxTotal: number = 90) {
    this.maxTotal = maxTotal;
    this.used = 0;
  }

  public consume(): boolean {
    if (this.used >= this.maxTotal) {
      return false;
    }
    this.used += 1;
    return true;
  }

  public refund(): void {
    if (this.used > 0) {
      this.used -= 1;
    }
  }

  public getUsed(): number {
    return this.used;
  }

  public getRemaining(): number {
    return Math.max(0, this.maxTotal - this.used);
  }
}
