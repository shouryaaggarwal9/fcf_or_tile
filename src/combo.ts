// A match streak, counted across one attempt. Consecutive triple clears with
// at most one ordinary pick between them keep the chain alive; two "wasted"
// picks in a row break it. Pure state so it is testable and trivially
// resettable on restart.
export class ComboCounter {
  private chain = 0;
  private misses = 0;

  /** 1 after the first clear, 2 on a back-to-back clear, 0 while no chain. */
  get streak(): number {
    return this.chain;
  }

  reset() {
    this.chain = 0;
    this.misses = 0;
  }

  /** Records a resolved triple. Returns the chain length including this one. */
  onMatch(): number {
    this.chain += 1;
    this.misses = 0;
    return this.chain;
  }

  /** Records an ordinary pick. Returns true when the chain just broke. */
  onPick(): boolean {
    if (this.chain === 0) return false;
    this.misses += 1;
    if (this.misses >= 2) {
      this.reset();
      return true;
    }
    return false;
  }
}
