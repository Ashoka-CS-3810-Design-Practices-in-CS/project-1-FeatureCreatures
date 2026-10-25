// Generic binary min-heap over an array (TECH_SPEC §8.3). The children of index i are 2i + 1 and
// 2i + 2, so the smallest key is always at index 0.

// PRE:  index ≥ 1
// POST: returns the index of index's parent
function parentOf(index: number): number {
  return Math.floor((index - 1) / 2);
}

export class MinHeap<T> {
  private readonly heap: T[] = [];
  private readonly key: (item: T) => number;

  // PRE:  key maps every item to a number; T does not include undefined
  // POST: creates an empty heap ordered by key
  constructor(key: (item: T) => number) {
    this.key = key;
  }

  // PRE:  none
  // POST: returns the number of items in the heap
  get size(): number {
    return this.heap.length;
  }

  // PRE:  none
  // POST: returns an item with the smallest key without removing it, or undefined when empty
  peek(): T | undefined {
    return this.heap[0];
  }

  // PRE:  item is not undefined
  // POST: item is in the heap and heap order holds; O(log n)
  push(item: T): void {
    this.heap.push(item);
    this.siftUp(this.heap.length - 1);
  }

  // PRE:  none
  // POST: removes and returns an item with the smallest key, or returns undefined when empty;
  //       heap order holds; O(log n)
  pop(): T | undefined {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  // PRE:  none
  // POST: returns the backing array (any order): every item pushed and not yet popped
  items(): readonly T[] {
    return this.heap;
  }

  // PRE:  0 ≤ index < heap.length
  // POST: returns the key of the item at index
  private keyAt(index: number): number {
    // Callers only pass indices below heap.length, so the element exists.
    return this.key(this.heap[index] as T);
  }

  // PRE:  0 ≤ first, second < heap.length
  // POST: the items at first and second have traded places
  private swap(first: number, second: number): void {
    const held = this.heap[first] as T;
    this.heap[first] = this.heap[second] as T;
    this.heap[second] = held;
  }

  // PRE:  0 ≤ parent < heap.length
  // POST: returns whichever of parent and its existing children has the smallest key (parent on ties)
  private smallestOfFamily(parent: number): number {
    const left = 2 * parent + 1;
    const right = left + 1;
    let smallest = parent;
    if (left < this.heap.length && this.keyAt(left) < this.keyAt(smallest)) {
      smallest = left;
    }
    if (right < this.heap.length && this.keyAt(right) < this.keyAt(smallest)) {
      smallest = right;
    }
    return smallest;
  }

  // PRE:  0 ≤ index < heap.length; heap order holds everywhere except possibly above index
  // POST: heap order holds everywhere
  private siftUp(index: number): void {
    let child = index;

    // INVARIANT: guard:    0 ≤ child < heap.length
    //            behavior: heap order holds everywhere except possibly between child and its parent
    while (child > 0 && this.keyAt(parentOf(child)) > this.keyAt(child)) {
      this.swap(parentOf(child), child);
      child = parentOf(child);
    }
    // POST: child is the root or its parent's key ≤ its key, so heap order holds everywhere
  }

  // PRE:  0 ≤ index < heap.length; heap order holds everywhere except possibly below index
  // POST: heap order holds everywhere
  private siftDown(index: number): void {
    let parent = index;
    let smallest = this.smallestOfFamily(parent);

    // INVARIANT: guard:    0 ≤ parent, smallest < heap.length
    //            behavior: heap order holds everywhere except possibly between parent and its
    //                      children; smallest = smallestOfFamily(parent)
    while (smallest !== parent) {
      this.swap(parent, smallest);
      parent = smallest;
      smallest = this.smallestOfFamily(parent);
    }
    // POST: parent's key ≤ its children's keys, so heap order holds everywhere
  }
}
