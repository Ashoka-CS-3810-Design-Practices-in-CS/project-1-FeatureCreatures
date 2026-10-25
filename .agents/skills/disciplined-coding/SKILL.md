---
name: disciplined-coding
description: Mandatory coding conventions for any code an agent writes or modifies, in any language or framework: contract-first development (pre/post-conditions on every function, loop invariants and post-conditions on every loop), iteration over recursion, small single-purpose functions, intention-revealing names, why-only comments, no duplication, and consistent formatting. Use whenever asked to write, implement, modify, refactor, or fix code, even for small snippets, so every agent produces code in one uniform style.
---

# Disciplined Coding

These conventions make code written by different agents, in different sessions, read as the work of one careful author. They apply to every language, framework, and project. The core idea is to reason about correctness up front, in contract comments, and then write code that satisfies those contracts.

## Workflow

1. Before writing a function or loop, write its contract comments first: PRE and POST for a function, INVARIANT and POST for a loop.
2. Write the code so that it satisfies the contract.
3. If the code has to behave differently from its contract, change the contract deliberately so the two always agree.
4. Before finishing, run the checklist at the bottom of this file.

These rules govern code you write or modify. Leave untouched code alone unless asked to refactor it. If the project has a formatter or linter config (Prettier, ESLint, Black, Ruff, gofmt, and so on), follow it and run it on the files you changed.

## Contract notation

Write contracts as comments in the language's own comment syntax. The examples below use `#` or `//`, but the labels (`PRE:`, `POST:`, `INVARIANT:`) stay the same in every language so all code looks alike.

Use notation as close to formal math as is sensible: `∧` (and), `∨` (or), `¬`, `⟹`, `≤ ≥ ≠`, `∀ ∃ ∈ ∉ ⊆`, and `…` for ranges of elements. Ease of understanding beats formality. When a condition is awkward to state symbolically, write a short precise sentence instead. Refer to the code's own identifiers inside contracts so the contract and the code can be read side by side.

## Function contracts

Place this block directly above every named function, method, and component. Anonymous inline callbacks such as `items.map(item => item.id)` are exempt.

```
# PRE:  what the inputs must satisfy for the function to work
# POST: what the function achieves when PRE holds
```

PRE states the nature and shape of the inputs the function assumes: types, ranges, structure, relationships between arguments, and required state. POST states what the function achieved (its return value and any side effects), in terms of the inputs, much like the post-condition of a loop.

### Who validates: PRE decides

- If PRE states a constraint (for example "level is an integer, 0 ≤ level ≤ 10"), the **caller** guarantees it. The function does not re-check it. Re-checking blurs responsibility and hides caller bugs.
- If PRE states less than the function needs (for example only "level is an integer"), the **function** must establish the rest. Validate at the very top, before doing anything else. Prefer delegating to a shared validator function or class over inline checks. POST then also states what happens on invalid input (raises, returns an error value, and so on).

```python
# PRE:  level is an integer with 0 ≤ level ≤ 10  (caller guarantees; not re-checked here)
# POST: returns the row of LEVEL_TABLE for level
def row_for_level(level):
    return LEVEL_TABLE[level]


# PRE:  level is an integer  (range not guaranteed)
# POST: returns the row of LEVEL_TABLE for level; raises ValueError unless 0 ≤ level ≤ 10
def row_for_level_checked(level):
    require_in_range(level, MIN_LEVEL, MAX_LEVEL, name="level")
    return LEVEL_TABLE[level]
```

Keep PRE honest. Data that comes from outside the program (user input, files, network responses, parsed JSON, environment variables) has not been guaranteed by anyone, so the code that receives it validates it with a validator before passing it to functions that have stronger preconditions.

### Typed and untyped languages

- **Statically typed languages:** the compiler guarantees declared types, so PRE can simply state the type ("level is an integer") and no runtime type check is needed. Callers pass properly typed variables.
- **Dynamically typed languages** (JavaScript, Python without enforced hints, Ruby, Lua, and so on): nothing guarantees types. Either state the type in PRE and treat it as the caller's duty, or keep PRE weak and validate the type at the top of the function, using the rule above.
- **In every language,** objects and custom types have a shape that can be wrong at runtime: missing fields, wrongly typed nested values, out-of-range values, data that arrived through `any`, `unknown`, a cast, or a deserializer. State the expected shape in PRE and apply the same who-validates rule.

### UI components (React, Vue, SwiftUI, and so on)

For a UI component, PRE lists the parts of the underlying model (in the model-view-controller sense) that the component reads or manipulates **directly**, with their shapes, including the callbacks it uses to change the model. For nested child components, do not repeat their models. End PRE with a line like `+ additional props from: ChildA, ChildB`, because each child's own PRE already defines them. POST simply describes the component's purpose and behavior.

```jsx
// PRE:  cart.title: string; cart.items: array whose elements each have id: string (used as render key)
//       + additional props from: CartLineItem, CartSummary
// POST: shows the cart title, one line per item, and the order summary
function CartPanel({ cart, onQuantityChange, taxRate }) {
  return (
    <section>
      <h2>{cart.title}</h2>
      {cart.items.map((item) => (
        <CartLineItem key={item.id} item={item} onQuantityChange={onQuantityChange} />
      ))}
      <CartSummary items={cart.items} taxRate={taxRate} />
    </section>
  );
}
```

## Loop contracts

Every hand-written loop (`for`, `while`, `do…while`, for-each) gets an INVARIANT comment directly above it and a POST comment directly after it. Declarative expressions such as comprehensions and `map`/`filter`/`reduce` calls are not loops in this sense and do not need them.

```
# INVARIANT: (guard condition) ∧ (behavioral condition)
<loop>
# POST: what the loop has established
```

- The **guard condition** keeps the loop's state valid: indices within bounds, a collection non-empty when popped, counters within limits.
- The **behavioral condition** says what the loop has accomplished so far, over the portion already processed.
- Either part can be compound. When the invariant gets long, put the parts on separate lines labeled `guard:` and `behavior:`, guard first.
- POST is usually the behavioral condition specialized to the final state.

Design the invariant so it holds at three moments, and check all three before writing the body:

1. **Initialization:** true after setup, before the first guard check.
2. **Maintenance:** if true at the top of an iteration, it is still true right after the body and the counter update, when the guard is about to be checked again.
3. **Termination:** when the guard becomes false, `invariant ∧ ¬guard ⟹ POST`.

```python
# PRE:  values is a list of numbers
# POST: returns values[0] + … + values[len(values) - 1]  (0 for an empty list)
def sum_values(values):
    total = 0
    index = 0

    # INVARIANT: (0 ≤ index ≤ len(values)) ∧ (total = values[0] + … + values[index - 1])
    while index < len(values):
        total += values[index]
        index += 1
    # POST: total = values[0] + … + values[len(values) - 1]

    return total


# PRE:  sorted_values is sorted in ascending order; target is comparable with its elements
# POST: returns the smallest index whose element is ≥ target (len(sorted_values) if none)
def find_insertion_index(sorted_values, target):
    low = 0
    high = len(sorted_values)

    # INVARIANT: guard:    0 ≤ low ≤ high ≤ len(sorted_values)
    #            behavior: (∀ k < low: sorted_values[k] < target) ∧ (∀ k ≥ high: sorted_values[k] ≥ target)
    while low < high:
        middle = (low + high) // 2
        if sorted_values[middle] < target:
            low = middle + 1
        else:
            high = middle
    # POST: low = high, the first index whose element is ≥ target

    return low
```

## Iteration over recursion

Prefer loops. Use recursion only when it makes the code significantly simpler or shorter, as in tree or graph traversal, divide-and-conquer, or walking nested structures. When you do use it, add a one-line comment saying why iteration was not used. Function contracts apply to recursive functions as usual.

## Design patterns

When designing an app, feature, or module, keep this list in the back of your mind: singleton, factory, builder, facade, strategy, observer, decorator. Use one only when it is clearly relevant and brings a considerable benefit, such as less duplication, easier substitution, or simpler call sites. Most code needs none of them, and plain functions and modules are often best. Do not reach for patterns outside this list, and do not bend a design to fit one. When you use a pattern, name it in a short comment where it is defined, since that is a design decision worth recording.

## Function scope

Keep functions small and narrow in scope: one function, one task, describable in a phrase without "and". There is no line limit, because a single task can legitimately take many lines (a component's markup, a function that formats one chart). Split a function when it does more than one job, mixes levels of abstraction, or contains a part you could name and reuse.

## Comments

Besides the contract comments above, comment only to record **why**: a key design or architecture decision, a trade-off, or a non-obvious logical assertion. Do not narrate what the code does, since good names do that, and do not comment trivial lines.

## Naming

Choose names that reveal intent, are searchable, and are pronounceable. Avoid single-letter variables (including loop counters: use `index`, `rowIndex`), cryptic abbreviations (`usrCnt`), and magic numbers (give every meaningful literal a named constant such as `MAX_RETRY_COUNT`). Widely understood terms like `id`, `url`, and `html` are fine.

## Duplication

Extract logic that appears more than once into a helper function or small class, and put shared checks into reusable validators. Merge only code that is truly the same logic, not code that merely looks similar. Before writing a new helper or validator, search the codebase for an existing one and reuse it, since other agents or earlier sessions may already have written it.

## Formatting

Keep indentation, spacing, blank lines, and file organization (imports, constants, helpers, main logic) neat and consistent, matching the surrounding codebase, so everything looks written by a single disciplined author.

## Final checklist

- Every named function, method, and component has PRE and POST above it, written before its body.
- PRE is honest: whatever it guarantees is not re-checked, and whatever it does not guarantee is validated at the top, preferably through a shared validator.
- Every hand-written loop has INVARIANT above and POST below, and the invariant holds at initialization, maintenance, and termination.
- Iteration is used unless recursion is clearly simpler, with a why-comment if recursive.
- Each function does one narrow task, and no logic is duplicated.
- Names reveal intent, with no single-letter names, cryptic abbreviations, or magic numbers.
- Comments are limited to contracts and why-notes.
- The project's formatter or linter was run, and the style matches the rest of the code.
