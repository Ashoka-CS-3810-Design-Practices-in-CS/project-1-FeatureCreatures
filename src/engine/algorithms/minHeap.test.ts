import { MinHeap } from './minHeap';

// PRE:  heap is a MinHeap
// POST: pops every item and returns them in pop order; heap is empty afterwards
function drain<T>(heap: MinHeap<T>): T[] {
  const popped: T[] = [];
  let next = heap.pop();

  // INVARIANT: popped holds, in pop order, every item removed so far; next is the latest pop
  while (next !== undefined) {
    popped.push(next);
    next = heap.pop();
  }
  // POST: heap is empty and popped holds every item it contained, in pop order

  return popped;
}

describe('MinHeap', () => {
  it('pops in ascending key order, including duplicates', () => {
    const heap = new MinHeap<number>((value) => value);
    [5, 1, 4, 1, 3, 9, 2, 6, 5].forEach((value) => heap.push(value));

    expect(heap.size).toBe(9);
    expect(drain(heap)).toEqual([1, 1, 2, 3, 4, 5, 5, 6, 9]);
    expect(heap.size).toBe(0);
  });

  it('orders objects by the key function', () => {
    const heap = new MinHeap<{ id: string; end: number }>((item) => item.end);
    heap.push({ id: 'late', end: 30 });
    heap.push({ id: 'early', end: 10 });
    heap.push({ id: 'middle', end: 20 });

    expect(heap.peek()?.id).toBe('early');
    expect(drain(heap).map((item) => item.id)).toEqual(['early', 'middle', 'late']);
  });

  it('peek and pop on an empty heap give undefined', () => {
    const heap = new MinHeap<number>((value) => value);

    expect(heap.peek()).toBeUndefined();
    expect(heap.pop()).toBeUndefined();
  });

  it('items() holds everything pushed and not yet popped', () => {
    const heap = new MinHeap<number>((value) => value);
    [7, 3, 5].forEach((value) => heap.push(value));
    heap.pop();

    expect([...heap.items()].toSorted((first, second) => first - second)).toEqual([5, 7]);
  });
});
