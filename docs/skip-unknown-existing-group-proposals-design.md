# Skip unknown existing-group proposals

## Problem statement

An AI provider can reference an existing Chrome tab-group ID that is not in the
current window. The grouping validator currently rejects the entire response,
even when other proposed groups are valid.

## Accepted decision

At validation time, skip a proposal whose `existingGroupId` is absent from the
current set of existing groups. Continue with all other proposals. A skipped
proposal never becomes a new group, and its tab IDs remain available to later
valid proposals.

Strictly rejecting the complete response was rejected because an invalid model
reference should not prevent valid grouping work. Treating the proposal as a
new group was rejected because it could create an unintended group.

## Contract and boundaries

The unknown-group check runs before group-name normalization, tab processing,
duplicate tracking, and group merging. Existing proposals retain their current
rules for eligible IDs, first-occurrence deduplication, normalized names, and
singleton filtering.

This only changes validation-time output. `applyGroupsWithUndo` keeps its
existing fallback for a group that was valid during validation but disappears
before browser application; that concurrent-state behavior is out of scope.

## Implementation DAG

1. Replace the unknown-existing-group rejection test with a mixed response
   containing an invalid existing-group proposal and a valid one.
2. Run the focused test to prove the current validation fails.
3. Change the validation branch to skip the unknown proposal.
4. Run grouping, workflow, tab-service, and project checks.

## Affected files

- `src/core/grouping.ts`
- `src/core/grouping.test.ts`

## Risks and rollback

Unknown-only responses now produce an empty successful plan. This is safe: no
browser mutations occur. Provider ordering remains meaningful for tabs that a
skipped proposal leaves available to a later valid proposal. Rollback restores
the previous validation error.
